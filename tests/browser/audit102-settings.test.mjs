// Language: en-GB. Independent reload-loss regressions; isolated synthetic data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
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
  await page.locator('#ytms-tab-feed').click();
  await page.locator('#ytms-hideShorts').uncheck();
  await page.locator('#ytms-save-preview').click();
  await page.waitForFunction(() => document.getElementById('ytms-save-preview').dataset.action === 'reload');
  return page;
}

async function codeDraft(page) {
  await page.locator('#ytms-tab-javascript').click();
  await page.locator('#ytms-custom-js-code').fill('window.syntheticUnsavedCode = 102;');
}
async function sourceDraft(page) {
  await page.locator('#ytms-tab-credits').click();
  await page.locator('#ytms-updates-source').fill('https://github.com/synthetic-owner/synthetic-source/releases/latest');
}
async function markerDraft(page) {
  await page.locator('#ytms-tab-player').click();
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const drawing = canvas.getContext('2d'); drawing.fillStyle = '#00aa66'; drawing.fillRect(0, 0, 16, 16);
    return canvas.toDataURL('image/png').slice(22);
  });
  await page.locator('#ytms-marker-file').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
  await page.waitForFunction(() => !document.getElementById('ytms-marker-save').disabled);
}

for (const [label, prepare, expected] of [
  ['Custom JavaScript', codeDraft, /JavaScript/i],
  ['playback marker', markerDraft, /marker|image/i],
  ['release source', sourceDraft, /release source/i],
]) test(`reload confirmation identifies unsaved ${label} without exposing draft contents`, async t => {
  const page = await open(t);
  await prepare(page);
  await page.locator('#ytms-save-preview').click();
  const message = await page.locator('#ytms-reload-message').textContent();
  assert.match(message, /unsaved/i);
  assert.match(message, expected);
  assert.doesNotMatch(message, /syntheticUnsavedCode|synthetic-owner|data:image/);
  await page.locator('#ytms-cancel-reload').click();
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(node => node.open), true);
});

test('saved Custom JavaScript does not cause a false unsaved-code reload warning', async t => {
  const page = await open(t);
  await codeDraft(page);
  await page.locator('#ytms-custom-js-save').click();
  await page.waitForFunction(() => document.getElementById('ytms-custom-js-status').textContent.includes('saved and disabled'));
  await page.locator('#ytms-save-preview').click();
  assert.doesNotMatch(await page.locator('#ytms-reload-message').textContent(), /unsaved|JavaScript/i);
});

test('a new separate draft after the reload prompt requires an updated warning before navigation', async t => {
  const page = await open(t);
  await page.locator('#ytms-tab-javascript').click();
  await page.locator('#ytms-save-preview').click();
  const originalURL = page.url();
  await page.locator('#ytms-custom-js-code').fill('window.syntheticLaterDraft = 102;');
  await page.locator('#ytms-confirm-reload').click();
  assert.equal(page.url(), originalURL);
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(node => node.open), true);
  assert.match(await page.locator('#ytms-reload-message').textContent(), /unsaved.*JavaScript|JavaScript.*unsaved/i);
  assert.equal(await page.locator('#ytms-custom-js-code').inputValue(), 'window.syntheticLaterDraft = 102;');
});

for (const kind of ['channel filters', 'backup restore']) test(`Suite reload waits for pending ${kind}`, async t => {
  const page = await open(t);
  const isChannel = kind === 'channel filters';
  if (isChannel) {
    await page.locator('#ytms-tab-channels').click();
    await page.locator('#ytms-age-add').click();
    await page.locator('input[id^="ytms-age-channel-"]').fill('UCaaaaaaaaaaaaaaaaaaaaaa');
  } else {
    const backup = await page.evaluate(() => ({ format: 'youtube-master-suite-backup', version: 1, language: 'en-GB',
      settings: { ...JSON.parse(GM_getValue('yt-master-suite.settings.v1')).values, hideShorts: true }, channelFilters: [] }));
    await page.locator('#ytms-tab-support').click();
    await page.locator('#ytms-import-backup').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page.locator('#ytms-confirm-restore').check();
  }
  await page.evaluate(async isChannel => {
    window.syntheticLockAcquired = false;
    window.syntheticHeldLock = navigator.locks.request(isChannel ? 'yt-master-suite.channel-filters-write.v1' : 'yt-master-suite.settings-write.v1', () => {
      window.syntheticLockAcquired = true;
      return new Promise(resolve => { window.syntheticReleaseLock = resolve; });
    });
    while (!window.syntheticLockAcquired) await new Promise(resolve => setTimeout(resolve, 0));
  }, isChannel);
  try {
    await page.locator(isChannel ? '#ytms-age-save' : '#ytms-restore-backup').click();
    if (isChannel) await page.locator('#ytms-tab-feed').click();
    await page.locator('#ytms-save-preview').click();
    await page.locator('#ytms-confirm-reload').click();
    assert.equal(await page.locator('#ytms-settings-dialog').evaluate(node => node.open), true);
    assert.match(await page.locator('#ytms-reload-message').textContent(), /wait|saving|finish/i);
  } finally { await page.evaluate(() => window.syntheticReleaseLock?.()); }
});

for (const [label, prepare, lock, saveId, key] of [
  ['JavaScript', codeDraft, 'custom-javascript', 'custom-js-save', 'custom-javascript'],
  ['marker', markerDraft, 'marker', 'marker-save', 'playhead-image'],
  ['release source', sourceDraft, 'update-source', 'updates-save-source', 'update-source'],
]) test(`Suite reload waits for an already requested ${label} save`, async t => {
  const page = await open(t);
  await prepare(page);
  await page.evaluate(async lock => {
    window.syntheticLockAcquired = false;
    window.syntheticHeldLock = navigator.locks.request(`yt-master-suite.${lock}-write.v1`, () => {
      window.syntheticLockAcquired = true;
      return new Promise(resolve => { window.syntheticReleaseLock = resolve; });
    });
    while (!window.syntheticLockAcquired) await new Promise(resolve => setTimeout(resolve, 0));
  }, lock);
  try {
    await page.locator('#ytms-' + saveId).click();
    await page.locator('#ytms-save-preview').click();
    await page.locator('#ytms-confirm-reload').click();
    assert.equal(await page.locator('#ytms-settings-dialog').evaluate(node => node.open), true);
    assert.match(await page.locator('#ytms-reload-message').textContent(), /wait|saving|finish/i);
  } finally {
    await page.evaluate(() => window.syntheticReleaseLock?.());
  }
  await page.waitForFunction(key => GM_getValue(`yt-master-suite.${key}.v1`, null) !== null, key);
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(node => node.open), true);
});
