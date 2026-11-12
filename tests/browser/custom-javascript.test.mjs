// Language: en-GB. Custom code and all page content are synthetic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const url = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
const key = 'yt-master-suite.custom-javascript.v1';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
async function open(t, { record = null, rescue = false, csp = false, viewport = { width: 1280, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith(url)
    ? route.fulfill({ contentType: 'text/html', body: html,
      headers: csp ? { 'Content-Security-Policy': "script-src 'self' 'unsafe-inline'" } : {} }) : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(url);
  if (record) await page.evaluate(({ key, record }) => GM_setValue(key, JSON.stringify(record)), { key, record });
  await context.addInitScript({ content: source });
  await page.goto(url + (rescue ? '&ytms-custom-js=off' : ''));
  await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true, timeoutMs: 10000, errors });
  return page;
}
async function panel(page) {
  await page.locator('#ytms-settings-button').click();
  await page.getByRole('tab', { name: 'Custom JS', exact: true }).click();
}

test('custom code saves separately, needs explicit consent, and runs on the next full load', async t => {
  const page = await open(t); await panel(page);
  const before = await page.evaluate(() => fixtureStorage.getItem('yt-master-suite.settings.v1'));
  await page.locator('#ytms-custom-js-code').fill('window.syntheticCustomRuns = (window.syntheticCustomRuns || 0) + 1;');
  await page.locator('#ytms-custom-js-enabled').check();
  assert.equal(await page.locator('#ytms-custom-js-save').isDisabled(), true);
  await page.locator('#ytms-custom-js-acknowledge').check();
  await page.locator('#ytms-custom-js-save').click();
  await page.waitForFunction(() => document.getElementById('ytms-custom-js-status').textContent.includes('saved and enabled'));
  assert.equal(await page.evaluate(() => window.syntheticCustomRuns), undefined);
  assert.equal(await page.evaluate(() => fixtureStorage.getItem('yt-master-suite.settings.v1')), before);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  assert.equal(await page.evaluate(key => JSON.parse(GM_getValue(key)).enabled, key), true);
  await page.reload();
  await page.waitForFunction(() => window.syntheticCustomRuns === 1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('yt-navigate-finish'));
    window.dispatchEvent(new Event('yt-page-data-updated'));
    window.dispatchEvent(new Event('pageshow'));
  });
  assert.equal(await page.evaluate(() => window.syntheticCustomRuns), 1);
});

test('synthetic edits and clicks cannot arm or replace saved code', async t => {
  const page = await open(t); await panel(page);
  await page.evaluate(() => {
    const code = document.getElementById('ytms-custom-js-code'); code.value = 'window.syntheticCustomRuns = 100;'; code.dispatchEvent(new Event('input', { bubbles: true }));
    const enabled = document.getElementById('ytms-custom-js-enabled'); enabled.checked = true; enabled.dispatchEvent(new Event('change', { bubbles: true }));
    const ack = document.getElementById('ytms-custom-js-acknowledge'); ack.checked = true; ack.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('ytms-custom-js-save').click();
  });
  assert.equal(await page.evaluate(key => GM_getValue(key, null), key), null);
  await page.locator('#ytms-custom-js-code').fill('window.syntheticCustomRuns = 1;');
  await page.locator('#ytms-custom-js-enabled').uncheck();
  await page.locator('#ytms-custom-js-enabled').check();
  await page.locator('#ytms-custom-js-acknowledge').check();
  await page.locator('#ytms-custom-js-code').fill('window.syntheticCustomRuns = 2;');
  assert.equal(await page.locator('#ytms-custom-js-acknowledge').isChecked(), false);
  assert.equal(await page.locator('#ytms-custom-js-save').isDisabled(), true);
});

test('recovery URL skips enabled code and permits disabling it', async t => {
  const page = await open(t, { record: { version: 1, enabled: true, code: 'window.syntheticCustomRuns = 1;' }, rescue: true });
  await panel(page);
  assert.equal(await page.evaluate(() => window.syntheticCustomRuns), undefined);
  assert.match(await page.locator('#ytms-custom-js-status').textContent(), /skipped/);
  await page.locator('#ytms-custom-js-enabled').uncheck();
  await page.locator('#ytms-custom-js-save').click();
  await page.waitForFunction(() => document.getElementById('ytms-custom-js-status').textContent.includes('saved and disabled'));
  assert.equal(await page.evaluate(key => JSON.parse(GM_getValue(key)).enabled, key), false);
});

test('blocked dynamic scripts report failure while the Suite still initialises', async t => {
  const page = await open(t, { record: { version: 1, enabled: true, code: 'window.syntheticCustomRuns = 1;' }, csp: true });
  await panel(page);
  assert.equal(await page.evaluate(() => window.syntheticCustomRuns), undefined);
  assert.match(await page.locator('#ytms-custom-js-status').textContent(), /failed/);
});

test('the editor fits a narrow viewport and can be found through settings search', async t => {
  const page = await open(t, { viewport: { width: 375, height: 720 } });
  await page.locator('#ytms-settings-button').click();
  await page.locator('#ytms-settings-search').fill('custom javascript');
  await page.locator('#ytms-settings-search-results').getByRole('button', { name: /Custom JavaScript/ }).click();
  await page.locator('#ytms-custom-js-code').waitFor({ state: 'visible' });
  const box = await page.locator('#ytms-custom-js-code').boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 375);
});

test('saved source loads only in its editor and is cleared when hidden or closed', async t => {
  const saved = 'window.syntheticPrivateSource = "saved sentinel";';
  const page = await open(t, { record: { version: 1, enabled: false, code: saved } });
  await page.evaluate(key => fixtureGMStorage.startAudit(key), key);
  await page.locator('#ytms-settings-button').click();
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  assert.equal((await page.evaluate(() => fixtureGMStorage.finishAudit())).reads, 0);
  await page.locator('#ytms-tab-javascript').click();
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), saved);
  await page.locator('#ytms-custom-js-code').fill('window.syntheticDraft = 1;');
  await page.locator('#ytms-tab-comments').click();
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  await page.locator('#ytms-tab-javascript').click();
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), 'window.syntheticDraft = 1;');
  await page.locator('#ytms-settings-search').fill('comments');
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  await page.locator('#ytms-settings-search').fill('');
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), 'window.syntheticDraft = 1;');
  await page.locator('#ytms-cancel-panel').click();
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  await panel(page);
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), saved);
});

test('a trusted switch change cannot adopt code substituted through the DOM', async t => {
  const page = await open(t); await panel(page);
  const authored = 'window.syntheticAuthoredCode = 1;';
  await page.locator('#ytms-custom-js-code').fill(authored);
  await page.locator('#ytms-custom-js-code').evaluate(node => { node.value = 'window.syntheticSubstitution = 1;'; });
  await page.locator('#ytms-custom-js-enabled').check();
  await page.locator('#ytms-custom-js-acknowledge').check();
  await page.locator('#ytms-custom-js-save').click();
  await page.waitForFunction(() => document.getElementById('ytms-custom-js-status').textContent.includes('saved and enabled'));
  assert.equal(await page.evaluate(key => JSON.parse(GM_getValue(key)).code, key), authored);
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), authored);
});

test('a returned asynchronous failure updates the visible status without reopening settings', async t => {
  const page = await open(t, { record: { version: 1, enabled: true, code: 'return new Promise((resolve, reject) => { window.syntheticReject = reject; });' } });
  await panel(page);
  await page.evaluate(() => window.syntheticReject(new Error('synthetic private error')));
  await page.waitForFunction(() => document.getElementById('ytms-custom-js-status').textContent.includes('failed'), null, { timeout: 2500 });
  assert.doesNotMatch(await page.locator('#ytms-custom-js-status').textContent(), /synthetic private error/);
});

test('a late confirmed save cannot repopulate code after the settings panel closes', async t => {
  const page = await open(t); await panel(page);
  await page.locator('#ytms-custom-js-code').fill('window.syntheticLateSave = 1;');
  await page.evaluate(() => {
    const request = navigator.locks.request.bind(navigator.locks);
    navigator.locks.request = (name, options, callback) => {
      if (name !== 'yt-master-suite.custom-javascript-write.v1') return request(name, options, callback);
      return request(name, options, async lock => {
        await new Promise(resolve => { window.releaseSyntheticSave = resolve; });
        return callback(lock);
      });
    };
  });
  await page.locator('#ytms-custom-js-save').click();
  await page.waitForFunction(() => typeof window.releaseSyntheticSave === 'function');
  await page.locator('#ytms-cancel-panel').click();
  await page.evaluate(() => window.releaseSyntheticSave());
  await page.waitForFunction(key => Boolean(GM_getValue(key, null)), key);
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  await panel(page);
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), 'window.syntheticLateSave = 1;');
});

test('clearing the acknowledgement in the DOM cannot reuse an older approval', async t => {
  const page = await open(t); await panel(page);
  await page.locator('#ytms-custom-js-code').fill('window.syntheticApproval = 1;');
  await page.locator('#ytms-custom-js-enabled').check();
  await page.locator('#ytms-custom-js-acknowledge').check();
  await page.locator('#ytms-custom-js-acknowledge').evaluate(node => { node.checked = false; });
  await page.locator('#ytms-custom-js-save').click();
  assert.equal(await page.evaluate(key => GM_getValue(key, null), key), null);
});
