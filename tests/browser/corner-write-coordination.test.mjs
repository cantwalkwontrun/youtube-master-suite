// Language: en-GB. Synthetic cross-tab corner saves; no live browser settings.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const cornerKey = 'yt-master-suite.scroll-miniplayer.corner.v1';
const settingsKey = 'yt-master-suite.settings.v1';
let browser, launching;
before(async () => { browser = await (launching = launchFixtureBrowser()); });
after(async () => { await (await launching)?.close(); });

async function open(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await context.addInitScript({ content: source });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  async function newPage() {
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
    await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true, errors });
    return page;
  }
  return { page: await newPage(), newPage };
}
async function float(page) {
  await page.evaluate(() => {
    const host = document.getElementById('player'), anchor = document.createElement('div');
    anchor.id = 'single-column-container'; host.before(anchor); anchor.append(host); window.scrollTo(0, 800);
  });
  await page.waitForFunction(() => document.body.classList.contains('ytsmp-scroll-miniplayer-active'));
  await page.locator('#movie_player').hover();
  await page.locator('#ytsmp-corner-button').click();
}

test('a delayed GM cache cannot undo another tabs live corner when saving an unrelated setting', async t => {
  const { page, newPage } = await open(t), other = await newPage();
  await other.locator('#ytms-settings-button').click();
  await other.locator('#ytms-tab-feed').click();
  await other.locator('#ytms-hideShorts').uncheck();
  await other.evaluate(() => { window.__ytmsFixtureReceiveGM = () => {}; });
  await float(page);
  await page.locator('.ytsmp-corner-option[data-corner="bottom-left"]').click();
  await page.waitForFunction(() => fixtureStorage.getItem('yt-master-suite.scroll-miniplayer.corner.v1') === 'bottom-left');
  await page.evaluate(() => fixtureGMStorage.flush());
  const before = await page.evaluate(key => fixtureStorage.getItem(key), settingsKey);
  await other.locator('#ytms-save-preview').click();
  await other.waitForFunction(() => !document.getElementById('ytms-settings-status').hidden);
  await other.evaluate(() => fixtureGMStorage.flush());
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), cornerKey), 'bottom-left');
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), settingsKey), before);
  assert.match(await other.locator('#ytms-settings-status').textContent(), /synchronising|another tab/);
});

test('a rejected corner write must not move the player or claim that the position was saved', async t => {
  const { page } = await open(t); await float(page);
  const before = await page.locator('#ytsmp-corner-button').getAttribute('aria-label');
  await page.evaluate(key => fixtureGMStorage.failWrites(key), cornerKey);
  await page.locator('.ytsmp-corner-option[data-corner="bottom-left"]').click();
  // Drain the same write lock so assertions observe the settled operation.
  await page.evaluate(() => navigator.locks.request('yt-master-suite.corner-write.v1', () => {}));
  assert.equal(await page.locator('#ytsmp-corner-button').getAttribute('aria-label'), before);
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), cornerKey), null);
});

test('synthetic corner selection cannot persist a position', async t => {
  const { page } = await open(t); await float(page);
  await page.locator('.ytsmp-corner-option[data-corner="bottom-left"]').evaluate(button => button.click());
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), cornerKey), null);
  assert.match(await page.locator('#ytsmp-corner-button').getAttribute('aria-label'), /top right/);
});

for (const signal of ['yt-navigate-start', 'pagehide']) test(`${signal} cancels a corner change waiting for its storage lock`, async t => {
  const { page } = await open(t); await float(page);
  await page.evaluate(() => {
    navigator.locks.request('yt-master-suite.corner-write.v1', () => new Promise(resolve => {
      window.releaseCornerLock = resolve;
    }));
  });
  await page.waitForFunction(() => typeof window.releaseCornerLock === 'function');
  await page.locator('.ytsmp-corner-option[data-corner="bottom-left"]').click();
  await page.evaluate(async signal => {
    window.dispatchEvent(new Event(signal)); window.releaseCornerLock();
    await navigator.locks.request('yt-master-suite.corner-write.v1', () => {});
  }, signal);
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), cornerKey), null);
});

test('after a coordinated main save the live corner remains writable and another unrelated save preserves it', async t => {
  const { page } = await open(t);
  await page.locator('#ytms-settings-button').click(); await page.locator('#ytms-tab-feed').click();
  await page.locator('#ytms-hideShorts').uncheck(); await page.locator('#ytms-save-preview').click();
  await page.waitForFunction(() => document.getElementById('ytms-settings-status').textContent.startsWith('Saved.'));
  await page.locator('#ytms-close-panel').click(); await float(page);
  await page.locator('.ytsmp-corner-option[data-corner="bottom-left"]').click();
  await page.waitForFunction(() => fixtureStorage.getItem('yt-master-suite.scroll-miniplayer.corner.v1') === 'bottom-left');
  await page.locator('#ytms-player-settings-button').click(); await page.locator('#ytms-tab-feed').click();
  await page.locator('#ytms-hideShorts').check(); await page.locator('#ytms-save-preview').click();
  await page.waitForFunction(() => document.getElementById('ytms-settings-status').textContent.startsWith('Saved.'));
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), cornerKey), 'bottom-left');
  assert.equal(await page.evaluate(key => JSON.parse(fixtureStorage.getItem(key)).values.hideShorts, settingsKey), true);
});
