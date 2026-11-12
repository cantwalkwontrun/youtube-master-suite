// Language: en-GB. Synthetic protected-storage integration; no personal profiles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth, saveFixtureSettings } from './fixture-browser.mjs';

const SUITE = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const HTML = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
const WATCH_URL = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
const SETTINGS = 'yt-master-suite.settings.v1', MIGRATION = 'yt-master-suite.storage-migration.v1';
const GUARD = 'yt-master-suite.storage-migration-started.v1';
const WRITE_REVISION = 'yt-master-suite.settings-write.v1';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });

async function open(t, beforeSuite = '') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith(WATCH_URL)
    ? route.fulfill({ contentType: 'text/html', body: HTML }) : route.abort());
  await context.addInitScript(() => {
    if (location.origin !== 'https://www.youtube.com') return;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    canvas.getContext('2d').fillRect(0, 0, 32, 32);
    const records = {
      'yt-master-suite.settings.v1': JSON.stringify({ version: 1, values: { theatreMode: false, hideShorts: false, miniplayerSizeMode: 'custom', miniplayerWidth: 900 } }),
      'yt-master-suite.channel-age.v1': JSON.stringify({ version: 1, rules: [{ channelId: 'UC' + 'a'.repeat(22), name: 'Synthetic preserved channel', maxAge: 2, unit: 'weeks', enabled: true, blocked: false }] }),
      'yt-master-suite.scroll-miniplayer.corner.v1': 'bottom-left',
      'yt-master-suite.playhead-image.v1': JSON.stringify({ version: 1, dataUrl: canvas.toDataURL('image/png'), size: 28 }),
      'yt-master-suite.update-source.v1': JSON.stringify({ version: 1, url: 'https://github.com/fixture-owner/fixture-suite/releases/latest' }),
    };
    if (!sessionStorage.getItem('isolation-seeded')) {
      for (const [key, value] of Object.entries(records)) localStorage.setItem(key, value);
      sessionStorage.setItem('isolation-seeded', '1');
    }
    window.isolationLegacy = records;
    window.isolationPublicPayloads = [];
    const dispatch = window.dispatchEvent.bind(window);
    window.dispatchEvent = event => {
      if (typeof event.newValue === 'string' || event.detail?.values || event.detail?.newValue) isolationPublicPayloads.push(event.type);
      return dispatch(event);
    };
  });
  await context.addInitScript({ content: `${beforeSuite}\n${SUITE}` });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(7000);
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(WATCH_URL);
  return page;
}
const healthy = page => waitForSuiteHealth(page, MANIFEST.registeredModules, { timeoutMs: 10000, requireReady: true });

test('all five legacy records migrate exactly and protected saves survive reload without rewriting origin storage', async t => {
  const page = await open(t); await healthy(page);
  const migrated = await page.evaluate(key => ({
    original: isolationLegacy, current: fixtureGMStorage.snapshot(),
    baseline: JSON.parse(GM_getValue(key)).values, origin: { ...localStorage },
  }), MIGRATION);
  assert.deepEqual(migrated.current, migrated.original);
  assert.deepEqual(migrated.baseline, migrated.original);
  assert.deepEqual(migrated.origin, { ...migrated.original, [GUARD]: '1' });
  await page.locator('#ytms-settings-button').click(); await page.locator('#ytms-tab-feed').click();
  assert.equal(await page.locator('#ytms-hideShorts').isChecked(), false);
  await page.locator('#ytms-hideShorts').check(); await saveFixtureSettings(page);
  const saved = await page.evaluate(key => fixtureGMStorage.getItem(key), SETTINGS);
  assert.equal(JSON.parse(saved).values.hideShorts, true);
  const originAfterSave = await page.evaluate(() => ({ ...localStorage }));
  const revision = originAfterSave[WRITE_REVISION];
  assert.match(revision, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.deepEqual(originAfterSave, { ...migrated.original, [GUARD]: '1', [WRITE_REVISION]: revision });
  await page.reload(); await healthy(page);
  assert.equal(await page.evaluate(key => fixtureGMStorage.getItem(key), SETTINGS), saved);
  const other = await page.context().newPage(); await other.goto(WATCH_URL); await healthy(other);
  assert.equal(await other.evaluate(key => fixtureGMStorage.getItem(key), SETTINGS), saved);
  await page.locator('#ytms-settings-button').click(); await page.locator('#ytms-tab-feed').click();
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify({ version: 1, values: { hideShorts: false } }));
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) }));
    isolationPublicPayloads.length = 0;
  }, SETTINGS);
  assert.equal(await page.locator('#ytms-hideShorts').isChecked(), true, 'Native storage events cannot change protected settings');
  await other.evaluate(key => {
    const record = JSON.parse(fixtureGMStorage.getItem(key)); record.values.hideShorts = false;
    fixtureGMStorage.setItem(key, JSON.stringify(record));
  }, SETTINGS);
  await page.waitForFunction(() => document.getElementById('ytms-hideShorts').checked === false);
  assert.deepEqual(await page.evaluate(() => isolationPublicPayloads), [], 'GM notifications must not publish raw values through DOM events');
  const originAfterTamper = await page.evaluate(() => ({ ...localStorage }));
  assert.deepEqual({ ...originAfterTamper, [SETTINGS]: migrated.original[SETTINGS] }, originAfterSave);
});

for (const fault of ['missing API', 'migration write failure']) test(`${fault} stops before default settings and leaves all legacy records intact`, async t => {
  const page = await open(t, fault === 'missing API' ? 'delete window.GM_setValue;'
    : `fixtureGMStorage.failWrites(${JSON.stringify(MIGRATION)});`);
  await page.locator('#ytms-storage-error').waitFor({ state: 'visible' });
  assert.match(await page.locator('#ytms-storage-error').textContent(), /Tampermonkey storage/);
  assert.equal(await page.locator('#ytms-settings-button').count(), 0);
  const state = await page.evaluate(key => ({ origin: { ...localStorage }, original: isolationLegacy, migration: GM_getValue(key, null) }), MIGRATION);
  assert.deepEqual(state.origin, fault === 'missing API' ? state.original : { ...state.original, [GUARD]: '1' });
  assert.equal(state.migration, null);
});
