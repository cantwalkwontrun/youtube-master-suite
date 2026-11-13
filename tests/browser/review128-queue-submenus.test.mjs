// Language: en-GB. Compiled Suite/native menu integration; synthetic data and isolated fixtures only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { createMenuLayout } from '../../sources/menu-layout.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const compiled = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const fixtureSource = readFileSync(new URL('./review128-queue-uniqueness.test.mjs', import.meta.url), 'utf8');
const helperStart = fixtureSource.indexOf('async function open(t, options = {}) {');
const helperEnd = fixtureSource.indexOf('\nasync function choose(', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'The shared synthetic native queue fixture must remain identifiable');
// Reuse the queue's native methods/model rather than duplicate its behaviour.
// This derives only the checked helper, never imports/registers its test suite.
const fixtureFactory = new Function('dependencies', 'const {browser,compiled,manifest,html,waitForSuiteHealth,A,B,C,assert}=dependencies;return (' +
  fixtureSource.slice(helperStart, helperEnd) + ');');
const A = 'aaaaaaaaaaa', B = 'bbbbbbbbbbb', C = 'ccccccccccc', D = 'ddddddddddd';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });

function nestedLayout() {
  const model = createMenuLayout(), layout = model.fromPreferences({ menuGroupChannelTools: false });
  layout.nodes = layout.nodes.filter(node => node.id !== 'channelTools');
  layout.nodes.unshift({ id: 'submenu-tools', name: 'My tools', parent: 'root' },
    { id: 'submenu-queue', name: 'Queue actions', parent: 'submenu-tools' },
    { id: 'submenu-next', name: 'Next videos', parent: 'submenu-queue' });
  for (const node of layout.nodes) if (['playNext', 'addToQueue'].includes(node.id)) node.parent = 'submenu-next';
  const next = layout.nodes.findIndex(node => node.id === 'playNext'), add = layout.nodes.findIndex(node => node.id === 'addToQueue');
  [layout.nodes[next], layout.nodes[add]] = [layout.nodes[add], layout.nodes[next]];
  assert.ok(model.validate(layout)); return layout;
}

async function open(t, { sheet = false, optOut = false } = {}) {
  // The separate watch-action preference hides Share by default; this native
  // pass-through control needs Share enabled, independently of queue policy.
  const values = { theatreMode: false, miniplayerEnabled: false, hideShareButton: false, menuLayout: nestedLayout() };
  if (optOut) values.uniqueQueueVideos = false;
  const seed = 'window.fixtureStorage.setItem("yt-master-suite.settings.v1",' +
    JSON.stringify(JSON.stringify({ version: 1, values })) + ');\n';
  const nativeQueue = fixtureFactory({ browser, compiled: seed + compiled, manifest, html, waitForSuiteHealth, A, B, C, assert });
  const page = await nativeQueue(t, { suite: true });
  await page.evaluate(({ sheet, B }) => {
    const f = uniqueFixture; f.popup.closest('tp-yt-iron-dropdown').remove();
    const card = document.createElement('ytd-video-renderer'); card.id = 'review128-queue-card';
    card.style.cssText = 'display:block;position:fixed;top:12px;left:12px;z-index:6000;background:#222;padding:12px';
    const video = document.createElement('a'); video.href = '/watch?v=' + B; video.textContent = 'Synthetic next video'; f.cardLink = video;
    const byline = document.createElement('div'); byline.id = 'channel-name';
    const channel = document.createElement('a'); channel.href = '/channel/UCabcdefghijklmnopqrstuv'; channel.textContent = 'Fixture creator'; byline.append(channel);
    const nativeMenu = document.createElement('ytd-menu-renderer'), trigger = document.createElement('button');
    trigger.id = 'review128-queue-trigger'; trigger.setAttribute('aria-label', 'Video actions'); trigger.textContent = 'More';
    nativeMenu.append(trigger); card.append(video, byline, nativeMenu); document.body.append(card);
    const dropdown = document.createElement('tp-yt-iron-dropdown'), popup = document.createElement(sheet ? 'yt-sheet-view-model' : 'ytd-menu-popup-renderer');
    popup.id = 'review128-nested-popup'; popup.setAttribute('role', 'menu');
    dropdown.style.cssText = 'display:block;position:fixed;top:100px;right:20px;z-index:6001;width:300px;background:#272727;color:white';
    popup.style.cssText = 'display:none;width:300px'; dropdown.append(popup); document.querySelector('ytd-app').append(dropdown);
    f.popup = popup; f.stamps = 0; f.nativeMoves = 0; f.target = B; f.armed = false; f.cancelOnce = false; f.nativePasses = [];
    dropdown.refit = () => {};
    dropdown.close = () => { popup.style.display = 'none'; dropdown.dispatchEvent(new CustomEvent('iron-overlay-closed', { bubbles: true })); };
    function stamp(data) {
      f.stamps++; f.menuData = data; popup.replaceChildren();
      const items = sheet ? data.content.listViewModel.listItems : data.items;
      const parent = sheet ? document.createElement('yt-list-view-model') : popup;
      if (sheet) { parent.style.display = 'block'; popup.append(parent); }
      f.latestRows = items.map(item => {
        const record = item.listItemViewModel || item.menuServiceItemRenderer;
        const row = document.createElement(sheet ? 'yt-list-item-view-model' : 'ytd-menu-service-item-renderer');
        row.style.cssText = 'display:block;padding:8px 16px'; row.tabIndex = 0;
        const target = sheet ? document.createElement('button') : row;
        target.setAttribute('role', 'menuitem'); target.textContent = sheet ? record.title.content : record.text.simpleText;
        if (sheet) {
          row.setAttribute('role', 'presentation'); target.type = 'button'; row.append(target);
          Object.defineProperty(row, 'data', { get: () => Symbol('opaque-row') });
          if (record.targetId) row.setAttribute('data-target-id', record.targetId);
        } else row.polymerController = { data: record };
        target.onclick = () => {
          f.nativePasses.push(sheet ? record.title.content : record.text.simpleText);
          const endpoint = sheet ? record.rendererContext?.commandContext?.onTap?.innertubeCommand : record.serviceEndpoint;
          if (endpoint?.signalServiceEndpoint?.actions?.length) f.dispatch(endpoint);
          dropdown.close();
        };
        parent.append(row); return row;
      });
      popup.dispatchEvent(new CustomEvent('yt-rendererstamper-finished', { bubbles: true }));
    }
    let popupOwner;
    if (sheet) {
      popup.componentProps = { data: () => f.menuData }; popup.setters = { data: stamp };
      Object.defineProperty(popup, 'data', { get: () => Symbol('opaque-popup'), set: stamp });
      popupOwner = document.querySelector('ytd-app');
    } else popupOwner = popup.polymerController = { get data() { return f.menuData; }, set: (_path, data) => stamp(data) };
    Object.defineProperty(popupOwner, 'resolveCommand', { configurable: true, get() { f.armed = true; return f.dispatch; } });
    new MutationObserver(records => {
      f.nativeMoves += records.reduce((sum, record) => sum + [...record.removedNodes].filter(node => f.latestRows?.includes(node)).length, 0);
    }).observe(popup, { childList: true, subtree: true });
    f.openNative = () => {
      const command = { videoId: f.target, videoIds: [f.target], listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE', openMiniplayer: true };
      Object.defineProperty(command, 'params', { enumerable: true, get() {
        if (f.cancelOnce && f.armed && !f.cancelled) { f.cancelled = true; dispatchEvent(new Event('yt-navigate-start')); }
        return 'synthetic-queue';
      } });
      const endpoint = { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ addToPlaylistCommand: command }] } };
      f.originalItems = [sheet ? { listItemViewModel: { title: { content: 'Add to queue' },
        leadingImage: { sources: [{ clientResource: { imageName: 'ADD_TO_QUEUE_TAIL' } }] },
        rendererContext: { commandContext: { onTap: { innertubeCommand: endpoint } } } } } :
        { menuServiceItemRenderer: { text: { simpleText: 'Add to queue' }, icon: { iconType: 'ADD_TO_QUEUE_TAIL' }, serviceEndpoint: endpoint } }];
      f.command = command;
      stamp(sheet ? { content: { listViewModel: { listItems: f.originalItems } } } : { items: f.originalItems });
      popup.style.display = 'block'; popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true }));
    };
    trigger.onclick = f.openNative;
  }, { sheet, B });
  return page;
}

async function openNested(page, target) {
  await page.evaluate(target => { uniqueFixture.target = target; uniqueFixture.cardLink.href = '/watch?v=' + target; }, target);
  await page.locator('#review128-queue-trigger').click();
  await page.locator('#review128-nested-popup[data-ytms-video-menu="1"]').waitFor();
  for (const name of ['My tools', 'Queue actions', 'Next videos']) await page.getByRole('menuitem', { name, exact: true }).click();
  assert.equal(await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).isVisible(), true);
}
const ids = page => page.evaluate(() => uniqueFixture.entries.map(entry => entry.videoId));
for (const sheet of [false, true]) test('compiled default queue policy survives real nested native row layout (' + (sheet ? 'opaque sheet' : 'legacy') + ')', async t => {
  const page = await open(t, { sheet }); await openNested(page, B);
  assert.ok(await page.evaluate(() => uniqueFixture.stamps >= 2), 'The compiled Suite must stamp its own Play next record');
  assert.equal(await page.evaluate(() => uniqueFixture.originalItems.length), 1, 'The original native menu is retained');
  assert.ok(await page.evaluate(() => uniqueFixture.nativeMoves > 0), 'Suite layout must move the actual native rows');
  await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).click();
  await page.waitForFunction(() => uniqueFixture.entries[2].videoId === 'bbbbbbbbbbb');
  assert.deepEqual(await ids(page), [A, C, B]);
  await openNested(page, B); await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).click();
  await page.waitForFunction(() => uniqueFixture.entries[1].videoId === 'bbbbbbbbbbb');
  assert.deepEqual(await ids(page), [A, B, C]);
  assert.deepEqual(await page.evaluate(() => ({ adds: uniqueFixture.adds, moves: uniqueFixture.moves, media: uniqueFixture.mediaCalls, playing: fixture.playerId })), {
    adds: [], moves: ['set-1', 'set-1'], media: [], playing: A,
  });
});
for (const sheet of [false, true]) for (const action of ['Play next in queue', 'Add to queue']) test('compiled nested menu rejects a stale queue command (' + (sheet ? 'opaque sheet' : 'legacy') + ', ' + action + ')', async t => {
  const page = await open(t, { sheet }); await openNested(page, D);
  await page.evaluate(() => { uniqueFixture.command.videoId = 'ccccccccccc'; uniqueFixture.command.videoIds = ['ccccccccccc']; });
  await page.getByRole('menuitem', { name: action, exact: true }).click();
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.moves), []);
  assert.deepEqual(await ids(page), [A, B, C]);
  await openNested(page, D);
  await page.getByRole('menuitem', { name: action, exact: true }).click();
  await page.waitForFunction(() => uniqueFixture.entries.some(entry => entry.videoId === 'ddddddddddd'));
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D], 'A fresh native stamp can accept the valid action again');
});
test('compiled opt-out retains native Add inside the actual nested menu', async t => {
  const page = await open(t, { sheet: true, optOut: true }); await openNested(page, B);
  assert.equal(await page.evaluate(() => JSON.parse(GM_getValue('yt-master-suite.settings.v1')).values.uniqueQueueVideos), false);
  await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).click();
  await page.waitForFunction(() => uniqueFixture.entries.length === 4);
  assert.deepEqual(await ids(page), [A, B, C, B]); assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [B]);
});
for (const sheet of [false, true]) test('a cancelled pre-dispatch copy permits a fresh valid nested queue request (' + (sheet ? 'opaque sheet' : 'legacy') + ')', async t => {
  const page = await open(t, { sheet }); await page.evaluate(() => { uniqueFixture.cancelOnce = true; });
  await openNested(page, D); await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).click();
  assert.equal(await page.evaluate(() => uniqueFixture.cancelled), true);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
  await page.evaluate(() => { uniqueFixture.cancelOnce = false; dispatchEvent(new Event('yt-navigate-finish')); });
  await openNested(page, D); await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).click();
  await page.waitForFunction(() => uniqueFixture.entries.length === 4);
  assert.deepEqual(await ids(page), [A, B, C, D]); assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]);
});
for (const sheet of [false, true]) for (const rebound of ['same-row', 'row-copy', 'new-popup-data']) test('a native Share action is not captured by stale queue ownership (' + (sheet ? 'opaque sheet' : 'legacy') + ', ' + rebound + ')', async t => {
  const page = await open(t, { sheet }); await openNested(page, D);
  await page.evaluate(({ sheet, rebound }) => {
    const f = uniqueFixture, item = f.originalItems[0], record = item.listItemViewModel || item.menuServiceItemRenderer;
    const row = f.latestRows.find(row => sheet ? row.querySelector('button')?.textContent === 'Add to queue' : row.textContent === 'Add to queue');
    const endpoint = { shareEntityServiceEndpoint: { serializedShareEntity: 'synthetic-share' } };
    if (sheet) {
      record.title = { content: 'Share' }; record.leadingImage = { sources: [{ clientResource: { imageName: 'SHARE' } }] };
      record.rendererContext = { commandContext: { onTap: { innertubeCommand: endpoint } } };
    } else { record.text = { simpleText: 'Share' }; record.icon = { iconType: 'SHARE' }; record.serviceEndpoint = endpoint; }
    (sheet ? row.querySelector('button') : row).textContent = 'Share';
    if (rebound === 'row-copy') {
      const replacement = row.cloneNode(true);
      if (!sheet) replacement.polymerController = { data: record };
      else Object.defineProperty(replacement, 'data', { get: () => Symbol('opaque-share') });
      (sheet ? replacement.querySelector('button') : replacement).onclick = () => { f.nativePasses.push('Share'); };
      row.replaceWith(replacement);
    } else if (rebound === 'new-popup-data') {
      f.menuData = sheet ? { ...f.menuData, content: { ...f.menuData.content, listViewModel: {
        ...f.menuData.content.listViewModel, listItems: [...f.menuData.content.listViewModel.listItems],
      } } } : { ...f.menuData, items: [...f.menuData.items] };
    }
  }, { sheet, rebound });
  const share = page.getByRole('menuitem', { name: 'Share', exact: true });
  for (let depth = 0; depth < 3 && !await share.isVisible(); depth++) {
    const back = page.getByRole('menuitem', { name: 'Back', exact: true });
    if (!await back.isVisible()) break;
    await back.click();
  }
  assert.equal(await share.isVisible(), true, JSON.stringify(await page.evaluate(() => ({
    status: document.documentElement.getAttribute('data-ytms-video-menu-status'),
    rows: [...uniqueFixture.popup.querySelectorAll('[role="menuitem"]')].map(row => ({
      text: row.textContent, label: row.getAttribute('aria-label'), display: getComputedStyle(row).display,
      hidden: row.hidden, parentDisplay: getComputedStyle(row.parentElement).display,
    })),
  }))));
  await share.click();
  assert.deepEqual(await page.evaluate(() => uniqueFixture.nativePasses), ['Share']);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
  assert.deepEqual(await ids(page), [A, B, C]);
});
