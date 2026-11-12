// Language: en-GB. Synthetic protected records only; no live accounts or exports.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
import { createSuiteSettings } from '../../sources/suite-settings.mjs';

const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const code = 'window.syntheticPrivateEditor = 42;';
const name = 'Synthetic private channel label';
const incoming = { channelId: 'UC' + 'b'.repeat(22), name: 'Synthetic import', maxAge: 1, unit: 'weeks', enabled: true, blocked: false };
const importText = kind => JSON.stringify(kind === 'channels'
  ? { format: 'youtube-master-suite-channel-filters', version: 1, language: 'en-GB', channelFilters: [incoming] }
  : { format: 'youtube-master-suite-backup', version: 1, language: 'en-GB', settings: createSuiteSettings(() => ({ getItem: () => null }), () => true).defaults, channelFilters: [incoming] });
let browser, launching;
before(async () => { browser = await (launching = launchFixtureBrowser()); });
after(async () => { await (await launching)?.close(); });

async function open(t) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await context.addInitScript({ content: source });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true, timeoutMs: 10000, errors });
  await page.evaluate(({ code, name }) => {
    GM_setValue('yt-master-suite.custom-javascript.v1', JSON.stringify({ version: 1, enabled: false, code }));
    GM_setValue('yt-master-suite.channel-age.v1', JSON.stringify({ version: 1, rules: [{
      channelId: 'UC' + 'a'.repeat(22), name, maxAge: 1, unit: 'weeks', enabled: true, blocked: false,
    }] }));
  }, { code, name });
  return page;
}

test('synthetic header and player clicks cannot open protected settings', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    document.getElementById('ytms-settings-button').click();
    document.getElementById('ytms-player-settings-button')?.click();
  });
  assert.equal(await page.locator('#ytms-settings-dialog').count(), 0);
  await page.locator('#ytms-settings-button').click();
  assert.equal(await page.locator('#ytms-settings-dialog').isVisible(), true);
});

test('synthetic tab and search actions cannot reveal protected code while trusted keyboard search works', async t => {
  const page = await open(t);
  await page.locator('#ytms-settings-button').click();
  await page.evaluate(() => {
    document.getElementById('ytms-tab-javascript').click();
    document.getElementById('ytms-tab-channels').click();
    document.getElementById('ytms-age-add').click();
    document.getElementById('ytms-age-cancel').click();
    document.getElementById('ytms-age-close').click();
    document.getElementById('ytms-tab-comments').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  assert.equal(await page.locator('#ytms-tab-comments').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  assert.equal((await page.locator('#ytms-channel-filter-list').textContent()).includes(name), false);
  await page.locator('#ytms-settings-search').fill('custom javascript');
  const result = page.locator('#ytms-settings-search-results').getByRole('button', { name: /Custom JavaScript/ });
  await result.evaluate(button => button.click());
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  await page.locator('#ytms-settings-search').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), code);
});

test('a page-opened retained dialogue cannot reload protected data through tabs, theme or storage events', async t => {
  const page = await open(t);
  await page.locator('#ytms-settings-button').click();
  await page.locator('#ytms-close-panel').click();
  await page.evaluate(() => {
    const dialog = document.getElementById('ytms-settings-dialog'); dialog.showModal();
    document.getElementById('ytms-tab-channels').click();
    document.getElementById('ytms-tab-javascript').click();
    document.getElementById('ytms-age-add').click();
    document.getElementById('ytms-age-cancel').click();
    const search = document.getElementById('ytms-settings-search'); search.value = 'custom javascript';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#ytms-settings-search-results button')?.click();
    document.documentElement.toggleAttribute('dark');
    window.dispatchEvent(new Event('storage')); window.dispatchEvent(new Event('yt-master-channel-age-changed'));
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), '');
  assert.equal((await page.locator('#ytms-channel-filter-list').textContent()).includes(name), false);
  await page.evaluate(() => document.getElementById('ytms-settings-dialog').close());
  await page.locator('#ytms-settings-button').click();
  await page.locator('#ytms-tab-channels').click();
  assert.equal((await page.locator('#ytms-channel-filter-list').textContent()).includes(name), true);
});

test('synthetic full and channel export clicks cannot create readable private-data blobs', async t => {
  const page = await open(t);
  await page.locator('#ytms-settings-button').click();
  await page.evaluate(() => {
    window.syntheticExportCount = 0;
    const native = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.syntheticExportCount++; return native(blob); };
  });
  await page.locator('#ytms-tab-support').click();
  await page.locator('#ytms-export-backup').evaluate(button => button.click());
  await page.locator('#ytms-tab-channels').click();
  await page.locator('#ytms-export-channels').evaluate(button => button.click());
  assert.equal(await page.evaluate(() => window.syntheticExportCount), 0);
});

test('inactive import controls cannot expose saved-record comparisons even when page scripts reveal their DOM sections', async t => {
  const page = await open(t); await page.locator('#ytms-settings-button').click();
  await page.evaluate(() => {
    window.inactiveFileReads = 0;
    const native = File.prototype.text;
    File.prototype.text = function () { window.inactiveFileReads++; return native.call(this); };
    document.getElementById('ytms-section-channels').hidden = false;
    document.getElementById('ytms-section-support').hidden = false;
    document.getElementById('ytms-channel-transfer').open = true;
  });
  for (const kind of ['channels', 'backup']) {
    const input = kind === 'channels' ? '#ytms-import-channels' : '#ytms-import-backup';
    await page.locator(input).setInputFiles({ name: `synthetic-${kind}.json`, mimeType: 'application/json', buffer: Buffer.from(importText(kind)) });
  }
  await page.locator('#ytms-channel-import-mode').selectOption('replace');
  assert.equal(await page.evaluate(() => window.inactiveFileReads), 0);
  assert.equal(await page.locator('#ytms-tab-comments').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#ytms-channel-import-preview').textContent(), '');
  assert.equal(await page.locator('#ytms-backup-preview').textContent(), '');
  assert.equal((await page.locator('#ytms-channel-filter-list').textContent()).includes(name), false);
});

for (const kind of ['channels', 'backup']) test(`a late ${kind} file read cannot compare protected records after leaving its logical tab`, async t => {
  const page = await open(t); await openTab(page, kind === 'channels' ? 'channels' : 'support');
  await page.evaluate(() => {
    const native = File.prototype.text;
    File.prototype.text = function () {
      const file = this;
      return new Promise(resolve => { window.releasePrivateFileRead = () => native.call(file).then(resolve); });
    };
  });
  await page.locator(kind === 'channels' ? '#ytms-import-channels' : '#ytms-import-backup').setInputFiles({
    name: `delayed-${kind}.json`, mimeType: 'application/json', buffer: Buffer.from(importText(kind)),
  });
  await page.waitForFunction(() => typeof window.releasePrivateFileRead === 'function');
  await page.locator('#ytms-tab-comments').click();
  await page.evaluate(key => fixtureGMStorage.startAudit(key), kind === 'channels' ? 'yt-master-suite.channel-age.v1' : 'yt-master-suite.settings.v1');
  await page.evaluate(() => window.releasePrivateFileRead());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal((await page.evaluate(() => fixtureGMStorage.finishAudit())).reads, 0);
  assert.equal(await page.locator(kind === 'channels' ? '#ytms-channel-import-preview' : '#ytms-backup-preview').textContent(), '');
});

async function openTab(page, tab) {
  await page.locator('#ytms-settings-button').click();
  await page.locator('#ytms-tab-' + tab).click();
}
async function prepareMarker(page, colour) {
  const image = await page.evaluate(colour => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d'); context.fillStyle = colour; context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').slice(22);
  }, colour);
  await page.locator('#ytms-marker-file').setInputFiles({ name: 'synthetic-private-marker.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.waitForFunction(() => !document.getElementById('ytms-marker-save').disabled);
}
async function holdLock(page, key) {
  await page.evaluate(key => {
    window.syntheticLockHeld = false;
    navigator.locks.request(key, async () => {
      window.syntheticLockHeld = true;
      await new Promise(resolve => { window.releaseSyntheticLock = resolve; });
    });
  }, key);
  await page.waitForFunction(() => window.syntheticLockHeld);
}
async function releaseLock(page, key) {
  await page.evaluate(async key => { window.releaseSyntheticLock(); await navigator.locks.request(key, () => {}); }, key);
}

test('a stale marker editor cannot overwrite another tabs image while GM delivery is delayed', async t => {
  const page = await open(t), other = await page.context().newPage();
  await other.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(other, manifest.registeredModules, { requireReady: true, timeoutMs: 10000 });
  await openTab(page, 'player'); await openTab(other, 'player');
  await prepareMarker(page, '#00aa66'); await prepareMarker(other, '#aa3366');
  await other.evaluate(() => { window.__ytmsFixtureReceiveGM = () => {}; });
  await page.locator('#ytms-marker-save').click();
  await page.waitForFunction(() => document.getElementById('ytms-marker-status').textContent.includes('saved'));
  const saved = await page.evaluate(() => GM_getValue('yt-master-suite.playhead-image.v1', null));
  await other.locator('#ytms-marker-save').click();
  await other.waitForFunction(() => /synchronising|another tab/.test(document.getElementById('ytms-marker-status').textContent));
  assert.equal(await page.evaluate(() => GM_getValue('yt-master-suite.playhead-image.v1', null)), saved);
  assert.equal(await other.locator('#ytms-marker-preview').isVisible(), true);
});

test('a stale release-source editor cannot overwrite another tabs source while GM delivery is delayed', async t => {
  const page = await open(t), other = await page.context().newPage();
  await other.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(other, manifest.registeredModules, { requireReady: true, timeoutMs: 10000 });
  await openTab(page, 'credits'); await openTab(other, 'credits');
  const first = 'https://github.com/synthetic-owner/first/releases/latest';
  const second = 'https://github.com/synthetic-owner/second/releases/latest';
  await page.locator('#ytms-updates-source').fill(first); await other.locator('#ytms-updates-source').fill(second);
  await other.evaluate(() => { window.__ytmsFixtureReceiveGM = () => {}; });
  await page.locator('#ytms-updates-save-source').click();
  await page.waitForFunction(() => document.getElementById('ytms-updates-status').textContent.includes('source saved'));
  await other.locator('#ytms-updates-save-source').click();
  await other.waitForFunction(() => /synchronising|another tab/.test(document.getElementById('ytms-updates-status').textContent));
  assert.equal(JSON.parse(await page.evaluate(() => GM_getValue('yt-master-suite.update-source.v1', null))).url, first);
  assert.equal(await other.locator('#ytms-updates-source').inputValue(), second);
});

for (const record of ['marker', 'source']) test(`closing and reopening cancels a ${record} save waiting for its lock`, async t => {
  const page = await open(t);
  await openTab(page, record === 'marker' ? 'player' : 'credits');
  if (record === 'marker') await prepareMarker(page, '#0088bb');
  else await page.locator('#ytms-updates-source').fill('https://github.com/synthetic-owner/waiting/releases/latest');
  const key = record === 'marker' ? 'yt-master-suite.marker-write.v1' : 'yt-master-suite.update-source-write.v1';
  await holdLock(page, key);
  await page.locator(record === 'marker' ? '#ytms-marker-save' : '#ytms-updates-save-source').click();
  await page.locator('#ytms-close-panel').click();
  await openTab(page, record === 'marker' ? 'player' : 'credits');
  await releaseLock(page, key);
  const storageKey = record === 'marker' ? 'yt-master-suite.playhead-image.v1' : 'yt-master-suite.update-source.v1';
  assert.equal(await page.evaluate(key => GM_getValue(key, null), storageKey), null);
  const status = await page.locator(record === 'marker' ? '#ytms-marker-status' : '#ytms-updates-status').textContent();
  assert.equal(status, '');
});

test('editing a release source while its write waits preserves the newer draft without writing either source', async t => {
  const page = await open(t); await openTab(page, 'credits');
  const input = page.locator('#ytms-updates-source');
  await input.fill('https://github.com/synthetic-owner/old-draft/releases/latest');
  const key = 'yt-master-suite.update-source-write.v1'; await holdLock(page, key);
  await page.locator('#ytms-updates-save-source').click();
  const next = 'https://github.com/synthetic-owner/new-draft/releases/latest'; await input.fill(next);
  await releaseLock(page, key);
  assert.equal(await page.evaluate(() => GM_getValue('yt-master-suite.update-source.v1', null)), null);
  assert.equal(await input.inputValue(), next);
  assert.equal(await page.locator('#ytms-updates-save-source').isEnabled(), true);
});
