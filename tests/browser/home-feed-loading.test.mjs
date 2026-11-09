// Language: en-GB. Native continuation fixtures; no live account or requests.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { installHomeFeedLoading } from '../../sources/home-feed-loading.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });
async function open(t, { prefs = {}, path = '/', mode = 'modern', filtered = true, far = false, response = 'advance' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, serviceWorkers: 'block' });
  const url = 'https://www.youtube.com' + path;
  await context.route('**/*', route => route.request().url() === url ? route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en-GB"><head><style>
  ytd-app,ytd-browse,ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-continuation-item-renderer{display:block}
  ytd-rich-item-renderer{height:${far ? 1200 : 60}px}ytd-continuation-item-renderer{height:30px}
  [data-ytms-discovery-hidden="1"]{display:none}html[data-yt-master-show-filtered="1"] [data-ytms-discovery-hidden="1"]{display:block}
  </style></head><body><ytd-app><ytd-browse page-subtype="home"><ytd-rich-grid-renderer><div id="contents"><ytd-rich-item-renderer id="one">First</ytd-rich-item-renderer><ytd-rich-item-renderer id="two" ${filtered ? 'data-ytms-discovery-hidden="1"' : ''}>Hidden</ytd-rich-item-renderer><ytd-continuation-item-renderer><div id="button"></div></ytd-continuation-item-renderer></div></ytd-rich-grid-renderer></ytd-browse>
  <ytd-miniplayer style="position:fixed;bottom:16px;right:16px;width:400px;height:300px"><video></video><span class="cbCustomThumbnail">DeArrow</span><span id="return-youtube-dislike">42</span><span id="sponsorBlockMarker">segment</span></ytd-miniplayer></ytd-app></body></html>` }) : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(url);
  await page.evaluate(({ source, prefs, mode, response }) => {
    window.calls = 0; window.reports = 0; window.batch = 0; window.responseMode = response; window.nativeObserverArmed = true; window.nativeResets = 0;
    window.host = document.querySelector('ytd-continuation-item-renderer');
    window.owner = { hostElement: host, data: { trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN', continuationEndpoint: { continuationCommand: { token: 'synthetic-0' } } }, spinnerActive: false, endOfList: false, showButton: false,
      resetIntersectionObserver() { nativeResets++; nativeObserverArmed = false; },
      triggerContinuation() { calls++; this.spinnerActive = true; if (responseMode === 'throw') throw Error('Synthetic native failure'); if (responseMode === 'advance') setTimeout(() => advance(), 100); if (responseMode === 'late-intersection') setTimeout(() => { if (nativeObserverArmed) owner.triggerContinuation(); }, 0); } };
    if (mode === 'modern') host.inst = owner;
    else if (mode === 'legacy') host.polymerController = owner;
    window.advance = (end = false) => {
      const card = document.createElement('ytd-rich-item-renderer'); card.textContent = 'Native batch'; card.setAttribute('data-ytms-discovery-hidden', '1'); host.before(card);
      owner.spinnerActive = false;
      if (end) { owner.endOfList = true; host.remove(); }
      else owner.data = { ...owner.data, continuationEndpoint: { continuationCommand: { token: 'synthetic-' + (++batch) } } };
      window.dispatchEvent(new Event('yt-page-data-updated'));
    };
    window.disposeLoading = (0, eval)('(' + source + ')')({ document, window, preferences: prefs, reportError: () => reports++ });
  }, { source: installHomeFeedLoading.toString(), prefs: { autoLoadFilteredHome: true, showHomeLoadMore: true, homeLoadBatchLimit: '3', homeLoadDelay: '3', ...prefs }, mode, response });
  return page;
}
const calls = page => page.evaluate(() => calls);
const wait = (page, count) => page.waitForFunction(count => calls === count, count);

test('a missing loading control is not presented as confirmed exhaustion', async t => {
  const page = await open(t);
  await page.evaluate(() => host.remove());
  await page.locator('#ytms-home-loading').waitFor();
  const message = await page.locator('#ytms-home-loading-status').textContent();
  assert.match(message, /isn’t offering another batch right now/);
  assert.equal(message.includes('no more recommendations'), false);
});

test('a modern continuation is recognised as an unsupported control rather than an exhausted feed', async t => {
  const page = await open(t);
  await page.evaluate(() => { const modern = document.createElement('yt-continuation-item-view-model'); modern.style.display = 'block'; modern.style.height = '1px'; host.replaceWith(modern); });
  await page.locator('#ytms-home-loading').waitFor();
  assert.match(await page.locator('#ytms-home-loading-status').textContent(), /unavailable for this YouTube layout/);
  assert.equal(await calls(page), 0);
});

test('a confirmed native end remains recognisable when its command has been cleared', async t => {
  const page = await open(t);
  await page.evaluate(() => { owner.endOfList = true; owner.data = {}; });
  await page.locator('#ytms-home-loading').waitFor();
  assert.match(await page.locator('#ytms-home-loading-status').textContent(), /no more recommendations/);
  assert.equal(await calls(page), 0);
});

test('fresh page data without a loading control does not inherit an older exhaustion claim', async t => {
  const page = await open(t);
  await page.evaluate(() => { owner.endOfList = true; });
  await page.waitForFunction(() => document.querySelector('#ytms-home-loading-status')?.textContent.includes('no more recommendations'));
  await page.evaluate(() => { host.remove(); window.dispatchEvent(new Event('yt-page-data-updated')); });
  await page.waitForFunction(() => document.querySelector('#ytms-home-loading-status')?.textContent.includes('isn’t offering another batch'));
  assert.equal(await calls(page), 0);
});

test('automatic recovery waits, loads only filtered Home, and stops at its batch allowance', async t => {
  const page = await open(t, { prefs: { homeLoadBatchLimit: '1' } });
  await page.locator('#ytms-home-loading button').waitFor();
  assert.equal(await calls(page), 0);
  await wait(page, 1);
  await page.waitForFunction(() => document.getElementById('ytms-home-loading-status').textContent.includes('batch limit'));
  await page.evaluate(() => { for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('yt-page-data-updated')); });
  assert.equal(await calls(page), 1);
  await page.waitForFunction(() => !document.querySelector('#ytms-home-loading button').disabled);
  await page.locator('#ytms-home-loading button').click(); await wait(page, 2);
  assert.deepEqual(await page.locator('ytd-miniplayer').evaluate(el => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, right: getComputedStyle(el).right, bottom: getComputedStyle(el).bottom })), { w: 400, h: 300, right: '16px', bottom: '16px' });
  assert.equal(await page.locator('#return-youtube-dislike').textContent(), '42');
  assert.equal(await page.locator('#sponsorBlockMarker').textContent(), 'segment');
  assert.equal(await page.locator('.cbCustomThumbnail').textContent(), 'DeArrow');
});

for (const mode of ['modern', 'legacy']) test(`manual Load more uses one ${mode} native continuation and prevents repeated dispatch`, async t => {
  const page = await open(t, { prefs: { autoLoadFilteredHome: false }, response: 'stall', mode });
  await page.locator('#ytms-home-loading button').click(); await wait(page, 1);
  await page.evaluate(() => { for (let i = 0; i < 10; i++) document.querySelector('#ytms-home-loading button').click(); });
  assert.equal(await calls(page), 1);
  await page.evaluate(() => { owner.spinnerActive = false; window.dispatchEvent(new Event('yt-page-data-updated')); });
  assert.equal(await page.locator('#ytms-home-loading button').isDisabled(), true);
  await page.evaluate(() => advance());
  await page.waitForFunction(() => !document.querySelector('#ytms-home-loading button').disabled);
  await page.locator('#ytms-home-loading button').click(); await wait(page, 2);
});

for (const scenario of ['unfiltered', 'far', 'reveal', 'busy', 'ended', 'unknown', 'ambiguous', 'hidden', 'no-cards']) test(`automatic loading leaves ${scenario} feeds alone`, async t => {
  const page = await open(t, { filtered: scenario !== 'unfiltered', far: scenario === 'far', mode: scenario === 'unknown' ? 'unknown' : 'modern' });
  await page.evaluate(scenario => {
    if (scenario === 'reveal') document.documentElement.setAttribute('data-yt-master-show-filtered', '1');
    if (scenario === 'busy') owner.spinnerActive = true;
    if (scenario === 'ended') owner.endOfList = true;
    if (scenario === 'ambiguous') { const duplicate = host.cloneNode(true); duplicate.inst = { ...owner, hostElement: duplicate }; host.after(duplicate); }
    if (scenario === 'hidden') { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }
    if (scenario === 'no-cards') { document.querySelectorAll('ytd-rich-item-renderer').forEach(card => card.remove()); const unknown = document.createElement('div'); unknown.setAttribute('data-ytms-discovery-hidden', '1'); host.before(unknown); }
  }, scenario);
  await page.waitForTimeout(3400);
  assert.equal(await calls(page), 0);
});

test('non-Home routes and disabled settings create no UI or observer work', async t => {
  const page = await open(t, { path: '/results' });
  await page.waitForTimeout(350); assert.equal(await page.locator('#ytms-home-loading').count(), 0);
  const disabled = await open(t, { prefs: { autoLoadFilteredHome: false, showHomeLoadMore: false } });
  await disabled.waitForTimeout(350); assert.equal(await disabled.locator('#ytms-home-loading').count(), 0);
});

test('a stalled native request pauses recovery instead of retrying the same token', async t => {
  const page = await open(t, { response: 'stall' });
  await page.locator('#ytms-home-loading button').click(); await wait(page, 1);
  await page.waitForFunction(() => document.querySelector('#ytms-home-loading-status').textContent.includes('paused'), null, { timeout: 12000 });
  await page.evaluate(() => { owner.spinnerActive = false; for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('yt-page-data-updated')); });
  await page.waitForTimeout(400); assert.equal(await calls(page), 1);
  assert.equal(await page.locator('#ytms-home-loading button').isDisabled(), true);
});

test('native failures pause automatic work without logging endpoint data or retrying', async t => {
  const page = await open(t, { response: 'throw' });
  await page.locator('#ytms-home-loading button').click(); await wait(page, 1);
  await page.waitForTimeout(3400);
  assert.equal(await calls(page), 1); assert.equal(await page.evaluate(() => reports), 1);
  assert.equal(await page.locator('#ytms-home-loading').textContent().then(s => s.includes('synthetic')), false);
});

test('navigation and page suspension release UI and prevent delayed requests', async t => {
  const page = await open(t);
  await page.locator('#ytms-home-loading').waitFor();
  await page.evaluate(() => { window.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/watch?v=aaaaaaaaaaa'); window.dispatchEvent(new Event('yt-navigate-finish')); });
  await page.waitForTimeout(3300); assert.equal(await calls(page), 0); assert.equal(await page.locator('#ytms-home-loading').count(), 0);
  await page.evaluate(() => { history.pushState({}, '', '/'); window.dispatchEvent(new Event('yt-navigate-finish')); });
  await page.locator('#ytms-home-loading').waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(3300); assert.equal(await calls(page), 0); assert.equal(await page.locator('#ytms-home-loading').count(), 0);
  await page.evaluate(() => { window.dispatchEvent(new Event('pageshow')); disposeLoading(); });
  assert.equal(await page.locator('#ytms-home-loading-style').count(), 0);
});

test('a known native manual continuation button retains its own click handler', async t => {
  const page = await open(t, { prefs: { autoLoadFilteredHome: true } });
  await page.evaluate(() => {
    owner.showButton = true; owner.data = { trigger: 'CONTINUATION_TRIGGER_ON_BUTTON_CLICK', button: { buttonRenderer: { command: { continuationCommand: { token: 'synthetic-button' } } } } };
    const renderer = document.createElement('ytd-button-renderer'); renderer.data = owner.data.button.buttonRenderer;
    const native = document.createElement('button'); native.textContent = 'Native more'; native.addEventListener('click', () => { calls++; owner.spinnerActive = true; });
    renderer.append(native); host.querySelector('#button').append(renderer);
  });
  await page.waitForTimeout(3400); assert.equal(await calls(page), 0);
  await page.locator('#ytms-home-loading button').click(); await wait(page, 1);
});

test('end of recommendations is reported without refreshing, scrolling or touching media', async t => {
  const page = await open(t, { prefs: { autoLoadFilteredHome: false }, response: 'stall' });
  await page.locator('#ytms-home-loading button').click(); await wait(page, 1);
  await page.evaluate(() => advance(true));
  await page.waitForFunction(() => document.querySelector('#ytms-home-loading-status').textContent.includes('no more'), null, { timeout: 12000 });
  assert.equal(await page.evaluate(() => scrollY), 0); assert.equal(await page.locator('video').evaluate(el => el.paused), true);
});

test('unrelated icon changes do not rescan the feed or trigger loads', async t => {
  const page = await open(t, { prefs: { autoLoadFilteredHome: false } });
  await page.locator('#ytms-home-loading').waitFor();
  await page.evaluate(() => {
    window.scans = 0; const query = document.querySelectorAll; document.querySelectorAll = function (...args) { scans++; return query.apply(this, args); };
    const icons = document.createElement('div'); document.body.append(icons);
    for (let i = 0; i < 200; i++) { const icon = document.createElement('span'); icon.textContent = 'Icon'; icons.append(icon); }
  });
  await page.waitForTimeout(500); assert.equal(await page.evaluate(() => scans), 0); assert.equal(await calls(page), 0);
});

test('restoring the same feed after suspension or navigation never repeats an attempted token', async t => {
  const page = await open(t, { response: 'stall' });
  await page.locator('#ytms-home-loading button').click(); await wait(page, 1);
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); owner.spinnerActive = false; window.dispatchEvent(new Event('pageshow')); });
  await page.waitForTimeout(3300); assert.equal(await calls(page), 1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/results'); window.dispatchEvent(new Event('yt-navigate-finish'));
    window.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/'); window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(3300); assert.equal(await calls(page), 1);
  assert.equal(await page.locator('#ytms-home-loading button').isDisabled(), true);
});

test('automatic-only mode honours filtering and the limit without creating a manual button', async t => {
  const page = await open(t, { prefs: { showHomeLoadMore: false, homeLoadBatchLimit: '1' } });
  await wait(page, 1); await page.waitForTimeout(3400);
  assert.equal(await calls(page), 1); assert.equal(await page.locator('#ytms-home-loading').count(), 0);
});

test('a second visible feed pauses loading and an unambiguous restored feed can recover', async t => {
  const page = await open(t, { prefs: { homeLoadBatchLimit: '1' } });
  await page.locator('#ytms-home-loading').waitFor();
  await page.evaluate(() => { window.extraBrowse = document.createElement('ytd-browse'); extraBrowse.append(document.querySelector('ytd-rich-grid-renderer').cloneNode(true)); document.querySelector('ytd-app').append(extraBrowse); });
  await page.waitForTimeout(3400); assert.equal(await calls(page), 0);
  assert.equal(await page.locator('#ytms-home-loading').count(), 0);
  await page.evaluate(() => extraBrowse.hidden = true);
  await wait(page, 1);
});

test('recovery disconnects the native visibility observer before a late callback can repeat the token', async t => {
  const page = await open(t, { prefs: { autoLoadFilteredHome: false }, response: 'late-intersection' });
  await page.locator('#ytms-home-loading button').click(); await wait(page, 1);
  await page.waitForTimeout(350);
  assert.equal(await calls(page), 1);
  assert.equal(await page.evaluate(() => nativeResets), 1);
  assert.equal(await page.evaluate(() => nativeObserverArmed), false);
});
