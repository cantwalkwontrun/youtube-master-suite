// Language: en-GB. Complete-bundle Home loading and saved-settings integration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });
async function open(t, preferences = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url() === 'https://www.youtube.com/' ? route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en-GB"><head><style>ytd-app,ytd-masthead,ytd-browse,ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-continuation-item-renderer{display:block}ytd-rich-item-renderer{height:80px}ytd-continuation-item-renderer{height:30px}</style></head><body><ytd-app><ytd-masthead><div id="end"><button id="avatar-btn" aria-label="Account"></button></div></ytd-masthead><ytd-browse page-subtype="home"><ytd-rich-grid-renderer><div id="contents"><ytd-rich-item-renderer><ytd-rich-grid-media><a id="video-title" href="/watch?v=aaaaaaaaaaa">Synthetic title</a><div id="metadata-line"><span>5 views</span></div><img class="cbCustomThumbnail" alt="Synthetic DeArrow image"></ytd-rich-grid-media></ytd-rich-item-renderer><ytd-continuation-item-renderer></ytd-continuation-item-renderer></div></ytd-rich-grid-renderer></ytd-browse></ytd-app></body></html>` }) : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); assert.equal(await page.getAttribute('html', 'data-yt-master-runtime-errors'), null); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/');
  await page.evaluate(preferences => {
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { theatreMode: false, hideFeedLowViews: true, lowViewThreshold: '1000', ...preferences } }));
    window.nativeCalls = 0;
    const host = document.querySelector('ytd-continuation-item-renderer');
    host.inst = { hostElement: host, data: { trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN', continuationEndpoint: { continuationCommand: { token: 'synthetic-integrated' } } }, spinnerActive: false, endOfList: false, showButton: false, resetIntersectionObserver() {}, triggerContinuation() { nativeCalls++; this.spinnerActive = true; } };
  }, preferences);
  await page.addScriptTag({ content: suite });
  await waitForSuiteHealth(page, manifest.registeredModules, { timeoutMs: 7000, errors });
  return page;
}
test('complete bundle applies real filters, exposes new defaults and dispatches once through the shared observer', async t => {
  const page = await open(t);
  await page.waitForFunction(() => document.querySelector('ytd-rich-item-renderer').getAttribute('data-ytms-discovery-hidden') === '1');
  await page.waitForFunction(() => nativeCalls === 1);
  assert.equal(await page.locator('#ytms-home-loading').count(), 1);
  assert.equal(await page.locator('#ytms-home-loading button').isDisabled(), true);
  assert.equal(await page.locator('.cbCustomThumbnail').count(), 1);
  await page.locator('#ytms-settings-button').click();
  for (const key of ['autoLoadFilteredHome', 'showHomeLoadMore', 'homeLoadBatchLimit', 'homeLoadDelay']) assert.equal(await page.locator('#ytms-' + key).count(), 1, key);
  assert.equal(await page.locator('#ytms-autoLoadFilteredHome').isChecked(), true);
  assert.equal(await page.locator('#ytms-showHomeLoadMore').isChecked(), true);
  assert.equal(await page.locator('#ytms-homeLoadBatchLimit').inputValue(), '3');
});
test('saved switches disable recovery without changing existing filters or saved settings', async t => {
  const page = await open(t, { autoLoadFilteredHome: false, showHomeLoadMore: false });
  await page.waitForTimeout(3400);
  assert.equal(await page.evaluate(() => nativeCalls), 0);
  assert.equal(await page.locator('#ytms-home-loading').count(), 0);
  assert.equal(await page.locator('ytd-rich-item-renderer').isVisible(), false);
  const saved = await page.evaluate(() => JSON.parse(fixtureStorage.getItem('yt-master-suite.settings.v1')).values);
  assert.equal(saved.autoLoadFilteredHome, false); assert.equal(saved.showHomeLoadMore, false); assert.equal(saved.hideFeedLowViews, true);
});
