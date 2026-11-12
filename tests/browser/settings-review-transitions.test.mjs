// Language: en-GB. Fresh independent review: synthetic state transitions only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const settingsKey = 'yt-master-suite.settings.v1';
let browser, launching;
before(async () => { browser = await (launching = launchFixtureBrowser()); });
after(async () => { await (await launching)?.close(); });

async function open(t) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await context.addInitScript({ content: suite });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(page, manifest.registeredModules, { timeoutMs: 10000, errors });
  await page.locator('#ytms-settings-button').click();
  return page;
}
async function tab(page, id) { await page.locator('#ytms-tab-' + id).click(); }
async function reveal(page, id) {
  await page.locator('#ytms-' + id).evaluate(node => {
    for (let details = node.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
  });
}

test('search hides a custom-JS draft without discarding it or persisting it', async t => {
  const page = await open(t);
  await tab(page, 'javascript');
  const code = 'window.syntheticReviewDraft = 1;';
  await page.locator('#ytms-custom-js-code').fill(code);
  await page.locator('#ytms-settings-search').fill('snapshot');
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  await page.locator('#ytms-settings-search').press('Escape');
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), code);
  assert.equal(await page.evaluate(() => GM_getValue('yt-master-suite.custom-javascript.v1', null)), null);
  await page.locator('#ytms-cancel-panel').click();
  await page.locator('#ytms-settings-button').click(); await tab(page, 'javascript');
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
});

test('unrelated section reset preserves an invalid submenu draft and blocks saving', async t => {
  const page = await open(t);
  await tab(page, 'interface'); await reveal(page, 'add-submenu');
  await page.locator('#ytms-add-submenu').click();
  await page.locator('#ytms-submenu-name').fill('');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  await tab(page, 'feed'); await page.locator('#ytms-restore-section-defaults').click();
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  await tab(page, 'interface');
  assert.equal(await page.locator('#ytms-submenu-name').inputValue(), '');
  assert.equal(await page.locator('#ytms-submenu-name').getAttribute('aria-invalid'), 'true');
  await page.locator('#ytms-submenu-name').fill('Synthetic corrected submenu');
  assert.equal(await page.locator('#ytms-save-preview').isEnabled(), true);
});

test('restoring fullscreen defaults resolves the opposing hide-comments draft across sections', async t => {
  const page = await open(t);
  await reveal(page, 'hideAllComments'); await page.locator('#ytms-hideAllComments').check();
  await tab(page, 'layout');
  assert.equal(await page.locator('#ytms-fullscreenComments').isChecked(), false);
  await page.locator('#ytms-restore-section-defaults').click();
  assert.equal(await page.locator('#ytms-fullscreenComments').isChecked(), true);
  await tab(page, 'comments');
  assert.equal(await page.locator('#ytms-hideAllComments').isChecked(), false);
});

test('custom-JS draft and acknowledgement survive unrelated preferences save without being saved themselves', async t => {
  const page = await open(t);
  await tab(page, 'javascript');
  await page.locator('#ytms-custom-js-code').fill('window.syntheticSeparateDraft = 2;');
  await page.locator('#ytms-custom-js-enabled').check();
  await page.locator('#ytms-custom-js-acknowledge').check();
  await tab(page, 'feed'); await page.locator('#ytms-hideShorts').uncheck();
  await page.locator('#ytms-save-preview').click();
  await page.waitForFunction(key => JSON.parse(fixtureStorage.getItem(key)).values.hideShorts === false, settingsKey);
  await tab(page, 'javascript');
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), 'window.syntheticSeparateDraft = 2;');
  assert.equal(await page.locator('#ytms-custom-js-acknowledge').isChecked(), true);
  assert.equal(await page.evaluate(() => GM_getValue('yt-master-suite.custom-javascript.v1', null)), null);
});

test('live corner controls preserve an incompatible saved position rather than silently replacing it', async t => {
  const page = await open(t);
  await page.locator('#ytms-cancel-panel').click();
  const key = 'yt-master-suite.scroll-miniplayer.corner.v1';
  await page.evaluate(key => {
    GM_setValue(key, 'synthetic-future-position');
    const host = document.getElementById('player'), anchor = document.createElement('div');
    anchor.id = 'single-column-container'; host.before(anchor); anchor.append(host); window.scrollTo(0, 800);
  }, key);
  await page.waitForFunction(() => document.body.classList.contains('ytsmp-scroll-miniplayer-active'));
  await page.locator('#movie_player').hover();
  await page.locator('#ytsmp-corner-button').click();
  const label = await page.locator('#ytsmp-corner-button').getAttribute('aria-label');
  await page.locator('.ytsmp-corner-option[data-corner="bottom-left"]').click();
  await page.evaluate(() => navigator.locks.request('yt-master-suite.corner-write.v1', () => {}));
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), key), 'synthetic-future-position');
  assert.equal(await page.locator('#ytsmp-corner-button').getAttribute('aria-label'), label);
});

test('a confirmed remote corner change clears an earlier failed-save accessibility description', async t => {
  const page = await open(t);
  await page.locator('#ytms-cancel-panel').click();
  const key = 'yt-master-suite.scroll-miniplayer.corner.v1';
  await page.evaluate(key => {
    fixtureGMStorage.failWrites(key);
    const host = document.getElementById('player'), anchor = document.createElement('div');
    anchor.id = 'single-column-container'; host.before(anchor); anchor.append(host); window.scrollTo(0, 800);
  }, key);
  await page.waitForFunction(() => document.body.classList.contains('ytsmp-scroll-miniplayer-active'));
  await page.locator('#movie_player').hover(); await page.locator('#ytsmp-corner-button').click();
  await page.locator('.ytsmp-corner-option[data-corner="bottom-left"]').click();
  await page.waitForFunction(() => document.getElementById('ytsmp-corner-button').hasAttribute('aria-description'));
  await page.evaluate(key => window.__ytmsFixtureReceiveGM({ key, value: 'bottom-right' }), key);
  await page.waitForFunction(() => document.getElementById('ytsmp-corner-button').getAttribute('aria-label').includes('bottom right'));
  assert.equal(await page.locator('#ytsmp-corner-button').getAttribute('aria-description'), null);
});
