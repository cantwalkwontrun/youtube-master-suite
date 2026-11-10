// Language: en-GB. Isolated settings drafts and synthetic menu labels only.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createMenuEditor } from '../../sources/menu-editor.mjs';
import { createMenuLayout } from '../../sources/menu-layout.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';

const css = readFileSync(new URL('../../assets/settings-panel.css', import.meta.url), 'utf8');
const address = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
const html = `<!doctype html><html lang="en-GB" dark><head><meta charset="utf-8"><style>
body{margin:0;font:14px/1.4 Arial,sans-serif;background:#0f0f0f}${css}
</style></head><body><dialog open id="ytms-settings-dialog"><div class="panel">
<div class="content" id="editor-host"></div><footer><button id="fixture-cancel" type="button">Cancel</button></footer>
</div></dialog></body></html>`;
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });

async function open(t, preferences = {}, viewport = { width: 1100, height: 900 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === address
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(address);
  await page.evaluate(({ editorSource, layoutSource, preferences }) => {
    const clone = value => JSON.parse(JSON.stringify(value));
    window.editorFixture = { saved: clone(preferences), draft: clone(preferences), changes: 0, resets: 0, sets: 0 };
    const f = editorFixture;
    window.layouts = (0, eval)('(' + layoutSource + ')')();
    window.menuEditor = (0, eval)('(' + editorSource + ')')(document, layouts, {
      getPreferences: () => f.draft,
      setLayout: value => { f.sets += 1; f.draft.menuLayout = value; },
      onChange: () => { f.changes += 1; },
      onReset: () => { f.resets += 1; f.draft = { ...f.draft, menuLayout: null, menuItemOrder: undefined,
        menuGroupChannelTools: true, menuShowDownload: false, menuShowAgeLimit: true,
        menuShowNotInterested: true, menuShowDontRecommend: true, menuShowReport: true }; },
    });
    document.getElementById('editor-host').append(menuEditor.element); menuEditor.refresh();
    document.getElementById('fixture-cancel').addEventListener('click', () => {
      f.draft = clone(f.saved); menuEditor.refresh();
    });
  }, { editorSource: createMenuEditor.toString(), layoutSource: createMenuLayout.toString(), preferences });
  return page;
}
const draft = page => page.evaluate(() => editorFixture.draft);
const effective = page => page.evaluate(() => layouts.fromPreferences(editorFixture.draft));
const currentIds = page => page.locator('#ytms-menu-order > li[data-menu-item]').evaluateAll(nodes => nodes.map(node => node.dataset.menuItem));
async function addNamed(page, name) {
  await page.getByRole('button', { name: 'Add submenu', exact: true }).click();
  const id = await page.getByLabel('Editing menu', { exact: true }).inputValue();
  await page.getByLabel('Submenu name', { exact: true }).fill(name);
  await page.getByLabel('Submenu name', { exact: true }).press('Tab');
  return id;
}

test('opening the editor preserves legacy grouping, order and visibility without creating a custom draft', async t => {
  const prefs = { menuItemOrder: ['share', 'channelTools', 'playNext'], menuShowReport: false, menuShowDownload: true };
  const page = await open(t, prefs);
  assert.deepEqual(await currentIds(page), ['share', 'channelTools', 'playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'download', 'notInterested']);
  assert.equal(await page.getByLabel('Show Download', { exact: true }).isChecked(), true);
  await page.getByLabel('Editing menu', { exact: true }).selectOption('channelTools');
  assert.deepEqual(await currentIds(page), ['channelAge', 'dontRecommend', 'report']);
  assert.equal(await page.getByLabel('Show Report', { exact: true }).isChecked(), false);
  assert.deepEqual(await draft(page), prefs);
  assert.deepEqual(await page.evaluate(() => ({ changes: editorFixture.changes, sets: editorFixture.sets })), { changes: 0, sets: 0 });
});

test('users can create and name three nested submenus and place actions in the deepest menu', async t => {
  const page = await open(t);
  const outer = await addNamed(page, 'Saving & sharing');
  const inner = await addNamed(page, 'More choices');
  const deepest = await addNamed(page, 'Extra choices');
  assert.equal(await page.getByRole('button', { name: 'Add submenu', exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('Editing menu', { exact: true }).locator('option:checked').textContent(), 'Saving & sharing / More choices / Extra choices');
  await page.getByLabel('Editing menu', { exact: true }).selectOption('root');
  await page.getByLabel('Menu for Share', { exact: true }).selectOption(deepest);
  assert.equal((await currentIds(page)).includes('share'), false);
  await page.getByLabel('Editing menu', { exact: true }).selectOption(deepest);
  assert.deepEqual(await currentIds(page), ['share']);
  const value = (await draft(page)).menuLayout;
  assert.equal(value.nodes.find(node => node.id === outer).parent, 'root');
  assert.equal(value.nodes.find(node => node.id === inner).parent, outer);
  assert.equal(value.nodes.find(node => node.id === deepest).parent, inner);
  assert.equal(value.nodes.find(node => node.id === 'share').parent, deepest);
  assert.equal(await page.evaluate(() => Boolean(layouts.validate(editorFixture.draft.menuLayout))), true);
  await page.getByText('Menu preview', { exact: true }).click();
  const preview = page.getByRole('list', { name: 'Menu preview', exact: true });
  assert.match(await preview.textContent(), /Saving & sharingMore choicesExtra choicesShare/);
});

test('actions can be reordered, moved and hidden while keyboard focus and sibling order remain stable', async t => {
  const page = await open(t);
  assert.equal(await page.getByRole('button', { name: 'Move Play next in queue up', exact: true }).isDisabled(), true);
  const before = await currentIds(page);
  await page.getByRole('button', { name: 'Move Share up', exact: true }).click();
  const expected = [...before], index = expected.indexOf('share');
  [expected[index], expected[index - 1]] = [expected[index - 1], expected[index]];
  assert.deepEqual(await currentIds(page), expected);
  assert.equal(await page.getByRole('button', { name: 'Move Share up', exact: true }).evaluate(node => node === document.activeElement), true);
  await page.getByLabel('Menu for Share', { exact: true }).selectOption('channelTools');
  await page.getByLabel('Editing menu', { exact: true }).selectOption('channelTools');
  assert.equal((await currentIds(page)).includes('share'), true);
  await page.getByLabel('Show Share', { exact: true }).uncheck();
  assert.equal((await draft(page)).menuLayout.nodes.find(node => node.id === 'share').visible, false);
  await page.getByText('Menu preview', { exact: true }).click();
  assert.doesNotMatch(await page.getByRole('list', { name: 'Menu preview', exact: true }).textContent(), /Share/);
});

test('preview excludes default hidden actions and recursively empty groups while retaining editable items', async t => {
  const value = createMenuLayout().fromPreferences({});
  value.nodes.push({ id: 'submenu-empty', name: 'Empty parent', parent: 'root' });
  value.nodes.push({ id: 'submenu-nested', name: 'Empty nested', parent: 'submenu-empty' });
  value.nodes.find(node => node.id === 'download').parent = 'submenu-nested';
  const page = await open(t, { menuLayout: value });
  await page.getByText('Menu preview', { exact: true }).click();
  const preview = page.getByRole('list', { name: 'Menu preview', exact: true });
  assert.doesNotMatch(await preview.textContent(), /Download|Empty parent|Empty nested|\(hidden\)/);
  await page.getByLabel('Editing menu', { exact: true }).selectOption('submenu-nested');
  assert.equal(await page.getByLabel('Show Download', { exact: true }).isChecked(), false);
  await page.getByLabel('Show Download', { exact: true }).check();
  assert.match(await preview.textContent(), /Empty parentEmpty nestedDownload/);
  await page.getByLabel('Show Download', { exact: true }).uncheck();
  assert.doesNotMatch(await preview.textContent(), /Download|Empty parent|Empty nested/);
  assert.equal((await draft(page)).menuLayout.nodes.filter(node => node.id.startsWith('submenu-')).length, 2);
});

test('deleting a submenu promotes all children in order and retains nested descendants and every action', async t => {
  const value = createMenuLayout().fromPreferences({});
  value.nodes.splice(1, 0, { id: 'submenu-parent', name: 'Parent', parent: 'root' });
  value.nodes.push({ id: 'submenu-child', name: 'Child', parent: 'submenu-parent' });
  value.nodes.find(node => node.id === 'share').parent = 'submenu-parent';
  value.nodes.find(node => node.id === 'watchLater').parent = 'submenu-child';
  const page = await open(t, { menuLayout: value });
  const roots = await currentIds(page);
  await page.getByLabel('Editing menu', { exact: true }).selectOption('submenu-parent');
  assert.deepEqual(await currentIds(page), ['share', 'submenu-child']);
  await page.getByRole('button', { name: 'Delete submenu', exact: true }).click();
  assert.equal(await page.getByLabel('Editing menu', { exact: true }).inputValue(), 'root');
  const expected = roots.flatMap(id => id === 'submenu-parent' ? ['share', 'submenu-child'] : [id]);
  assert.deepEqual(await currentIds(page), expected);
  const next = (await draft(page)).menuLayout;
  assert.equal(next.nodes.some(node => node.id === 'submenu-parent'), false);
  assert.equal(next.nodes.find(node => node.id === 'submenu-child').parent, 'root');
  assert.equal(next.nodes.find(node => node.id === 'watchLater').parent, 'submenu-child');
  assert.deepEqual(next.nodes.filter(node => createMenuLayout().actionIds.includes(node.id)).map(node => node.id).sort(), [...createMenuLayout().actionIds].sort());
  assert.match(await page.getByRole('status').textContent(), /contents were moved to the parent menu/);
});

test('parent choices exclude self, descendants, action nodes and moves that would exceed the depth limit', async t => {
  const page = await open(t);
  const outer = await addNamed(page, 'Outer');
  const middle = await addNamed(page, 'Middle');
  const deepest = await addNamed(page, 'Deepest');
  await page.getByLabel('Editing menu', { exact: true }).selectOption('root');
  const choices = await page.getByLabel('Menu for Outer', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(node => node.value));
  assert.deepEqual(choices, ['root']);
  assert.ok(!choices.includes(outer) && !choices.includes(middle) && !choices.includes(deepest) && !choices.includes('share'));
  await page.getByLabel('Editing menu', { exact: true }).selectOption(outer);
  const innerChoices = await page.getByLabel('Menu for Middle', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(node => node.value));
  assert.ok(!innerChoices.includes(middle) && !innerChoices.includes(deepest));
  assert.equal(await page.evaluate(() => Boolean(layouts.validate(editorFixture.draft.menuLayout))), true);
});

test('invalid submenu names block edits and leaving the menu until corrected, with an accessible error', async t => {
  const page = await open(t);
  const id = await addNamed(page, 'Valid name');
  const before = await draft(page);
  await page.getByLabel('Submenu name', { exact: true }).fill('<script>');
  assert.equal(await page.getByLabel('Submenu name', { exact: true }).getAttribute('aria-invalid'), 'true');
  assert.equal(await page.evaluate(() => menuEditor.isValid()), false);
  assert.equal(await page.getByRole('status').isVisible(), true);
  assert.match(await page.getByRole('status').textContent(), /submenu name/);
  await page.getByRole('button', { name: 'Add submenu', exact: true }).click();
  await page.getByLabel('Editing menu', { exact: true }).selectOption('root');
  assert.equal(await page.getByLabel('Editing menu', { exact: true }).inputValue(), id);
  assert.equal(await page.getByLabel('Submenu name', { exact: true }).evaluate(node => document.activeElement === node), true);
  assert.deepEqual(await draft(page), before);
  assert.equal(await page.locator('script').count(), 0);
  await page.getByLabel('Submenu name', { exact: true }).fill('Corrected name');
  await page.getByLabel('Submenu name', { exact: true }).press('Tab');
  assert.equal(await page.evaluate(() => menuEditor.isValid()), true);
  assert.equal((await draft(page)).menuLayout.nodes.find(node => node.id === id).name, 'Corrected name');
});

test('reset and external cancellation restore the appropriate draft without changing saved preferences', async t => {
  const initial = createMenuLayout().fromPreferences({ menuGroupChannelTools: false });
  initial.nodes.unshift({ id: 'submenu-saved', name: 'Saved layout', parent: 'root' });
  initial.nodes.find(node => node.id === 'share').parent = 'submenu-saved';
  const page = await open(t, { menuLayout: initial, hideChat: false });
  await page.getByLabel('Editing menu', { exact: true }).selectOption('submenu-saved');
  await page.getByLabel('Submenu name', { exact: true }).fill('');
  assert.equal(await page.evaluate(() => menuEditor.isValid()), false);
  await page.getByRole('button', { name: 'Reset menu layout', exact: true }).click();
  assert.equal(await page.evaluate(() => menuEditor.isValid()), true);
  assert.equal((await draft(page)).menuLayout, null);
  assert.equal((await draft(page)).hideChat, false);
  assert.equal(await page.getByLabel('Editing menu', { exact: true }).inputValue(), 'root');
  assert.equal((await effective(page)).nodes.some(node => node.id === 'channelTools'), true);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual((await draft(page)).menuLayout, initial);
  assert.equal(await page.getByRole('button', { name: 'Edit Saved layout submenu', exact: true }).isVisible(), true);
  assert.deepEqual(await page.evaluate(() => editorFixture.saved), { menuLayout: initial, hideChat: false });
});

test('submenu count is bounded and a long named layout fits a narrow accessible settings panel', async t => {
  const layout = createMenuLayout().fromPreferences({});
  for (let index = 1; index <= 7; index += 1) layout.nodes.push({ id: `submenu-${index}`, name: 'W'.repeat(40), parent: 'root' });
  const page = await open(t, { menuLayout: layout }, { width: 360, height: 800 });
  assert.equal(await page.getByRole('button', { name: 'Add submenu', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('list', { name: 'Video context menu order', exact: true }).count(), 1);
  await page.getByLabel('Editing menu', { exact: true }).selectOption('submenu-1');
  assert.equal(await page.getByLabel('Submenu name', { exact: true }).getAttribute('maxlength'), '40');
  assert.equal(await page.getByLabel('Submenu name', { exact: true }).getAttribute('aria-describedby'), 'ytms-menu-editor-status');
  await page.getByLabel('Submenu name', { exact: true }).focus();
  assert.equal(await page.getByLabel('Submenu name', { exact: true }).evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
  await page.getByLabel('Editing menu', { exact: true }).selectOption('root');
  const geometry = await page.evaluate(() => {
    const content = document.getElementById('editor-host'), dialog = document.getElementById('ytms-settings-dialog');
    return { page: document.documentElement.scrollWidth, viewport: innerWidth,
      content: content.clientWidth, scroll: content.scrollWidth, dialog: dialog.getBoundingClientRect().width };
  });
  assert.ok(geometry.page <= geometry.viewport + 1, JSON.stringify(geometry));
  assert.ok(geometry.scroll <= geometry.content + 1, JSON.stringify(geometry));
  assert.ok(geometry.dialog <= 336, JSON.stringify(geometry));
});

test('renaming a submenu preserves the first click on its action controls',async t=>{
 const page=await open(t);await page.getByLabel('Editing menu',{exact:true}).selectOption('channelTools');
 await page.getByLabel('Submenu name',{exact:true}).fill('Creator settings');
 const checkbox=page.getByLabel('Show Report',{exact:true});const box=await checkbox.boundingBox();
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 assert.equal((await effective(page)).nodes.find(node=>node.id==='report').visible,false);
});
