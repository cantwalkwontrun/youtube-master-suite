import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const SUITE = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const SOURCE = readFileSync(new URL('../../sources/modules/youtube-player-preferences-lite.user.js', import.meta.url), 'utf8');
const FIXTURE = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
const WATCH_URL = 'https://www.youtube.com/watch?v=aaaaaaaaaaa&list=fixture-queue';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

async function open(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url() === WATCH_URL
    ? route.fulfill({ contentType: 'text/html', body: FIXTURE }) : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    try {
      assert.deepEqual(errors, []);
      const runtime = await page.getAttribute('html', 'data-yt-master-runtime-errors');
      assert.ok(!runtime || runtime === '[]', runtime);
    } finally { await context.close(); }
  });
  await page.goto(WATCH_URL);
  await page.evaluate(() => {
    const playerHost = document.querySelector('#player');
    const anchor = document.createElement('div'); anchor.id = 'single-column-container';
    playerHost.before(anchor); anchor.append(playerHost);
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { theatreMode: false } }));
  });
  return page;
}

function instrumentBroker(source) {
  const replace = (needle, replacement) => {
    assert.equal(source.split(needle).length, 2, `Expected one instrumentation target: ${needle}`);
    source = source.replace(needle, replacement);
  };
  replace('function refreshNativeMutationObserver() {', 'function refreshNativeMutationObserver() { window.mirrorBrokerAudit.refreshes++; window.mirrorBrokerAudit.activeObservers = sharedMutationObservers.size;');
  replace('const replacementObserver = new NativeObserver(callback);', 'window.mirrorBrokerAudit.replacements++; const replacementObserver = new NativeObserver(callback);');
  replace('replacementObserver.observe(target, options),', '(window.mirrorBrokerAudit.nativeObserves++, replacementObserver.observe(target, options)),');
  replace('function dispatchMutations(mutations) {', 'function dispatchMutations(mutations) { window.mirrorBrokerAudit.batches++; window.mirrorBrokerAudit.records += mutations.length;');
  return `window.mirrorBrokerAudit = { refreshes: 0, replacements: 0, nativeObserves: 0, activeObservers: 0, batches: 0, records: 0 };\n${source}`;
}

for (const bundled of [false, true]) test(`Mirror follows a visible replacement toolbar with retained hidden controls (${bundled ? 'Suite' : 'source'})`, async t => {
  const page = await open(t);
  await page.addScriptTag({ content: bundled ? SUITE : SOURCE });
  const button = page.locator('#ytppl-video-mirror-button');
  await button.waitFor();
  await page.evaluate(() => {
    const previous = document.querySelector('#movie_player .ytp-right-controls');
    const replacement = document.createElement('div'); replacement.className = 'ytp-right-controls';
    replacement.innerHTML = '<button class="ytp-settings-button ytp-button">Settings</button><button class="ytp-fullscreen-button ytp-button">Fullscreen</button>';
    const retained = document.createElement('div'); retained.hidden = true;
    previous.replaceWith(retained, replacement); retained.append(previous);
  });
  await page.evaluate(async () => { for (let i=0;i<4;i++) await new Promise(requestAnimationFrame); });
  assert.equal(await button.isVisible(), true);
  assert.equal(await button.count(), 1);
  await button.click();
  assert.equal(await page.locator('video.html5-main-video').getAttribute('data-ytppl-video-mirrored'), '1');
  await button.click();
  assert.equal(await page.locator('video.html5-main-video').getAttribute('data-ytppl-video-mirrored'), null);
});

for (const bundled of [false, true]) test(`ordinary native autohide preserves Mirror's button and chosen state (${bundled ? 'Suite' : 'source'})`, async t => {
  const page = await open(t);
  await page.addStyleTag({ content: '#movie_player.ytp-autohide .ytp-right-controls { visibility: hidden; opacity: 0; }' });
  await page.addScriptTag({ content: bundled ? SUITE : SOURCE });
  const button = page.locator('#ytppl-video-mirror-button');
  await button.click();
  await page.evaluate(() => {
    window.originalMirrorButton = document.getElementById('ytppl-video-mirror-button');
    document.getElementById('movie_player').classList.add('ytp-autohide');
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.evaluate(async () => { for (let i=0;i<4;i++) await new Promise(requestAnimationFrame); });
  assert.equal(await page.evaluate(() => originalMirrorButton.isConnected), true);
  assert.equal(await page.locator('video.html5-main-video').getAttribute('data-ytppl-video-mirrored'), '1');
  await page.evaluate(() => document.getElementById('movie_player').classList.remove('ytp-autohide'));
  assert.equal(await button.isVisible(), true);
  await button.click();
  assert.equal(await page.locator('video.html5-main-video').getAttribute('data-ytppl-video-mirrored'), null);
});

for (const bundled of [false, true]) for (const hiddenBy of ['opacity', 'scale', 'inert']) {
  test(`Mirror selects the current watch player instead of a ${hiddenBy}-hidden retained owner (${bundled ? 'Suite' : 'source'})`, async t => {
    const page = await open(t);
    await page.addScriptTag({ content: bundled ? SUITE : SOURCE });
    await page.locator('#ytppl-video-mirror-button').waitFor();
    await page.evaluate(hiddenBy => {
      const old = document.querySelector('ytd-watch-flexy');
      window.originalRetainedMirrorVideo = old.querySelector('video');
      old.id = 'retained-watch';
      if (hiddenBy === 'opacity') old.style.opacity = '0';
      if (hiddenBy === 'scale') old.style.transform = 'scale(0)';
      if (hiddenBy === 'inert') old.inert = true;
      const current = document.createElement('ytd-watch-flexy'); current.id = 'current-watch';
      current.innerHTML = '<div id="movie_player" class="html5-video-player"><video class="html5-main-video"></video><div class="ytp-right-controls"><button class="ytp-settings-button ytp-button">Settings</button><button class="ytp-fullscreen-button ytp-button">Fullscreen</button></div></div>';
      const player = current.querySelector('#movie_player');
      player.getVideoData = () => ({ video_id: fixture.playerId });
      old.after(current);
      window.dispatchEvent(new Event('yt-page-data-updated'));
    }, hiddenBy);
    await page.evaluate(async () => { for (let i=0;i<4;i++) await new Promise(requestAnimationFrame); });
    const button = page.locator('#current-watch #ytppl-video-mirror-button');
    assert.equal(await button.count(), 1);
    assert.equal(await page.locator('#retained-watch #ytppl-video-mirror-button').count(), 0);
    await button.click();
    assert.equal(await page.locator('#current-watch video').getAttribute('data-ytppl-video-mirrored'), '1');
    const retained = await page.evaluate(() => ({
      connected: originalRetainedMirrorVideo.isConnected,
      mirrored: originalRetainedMirrorVideo.getAttribute('data-ytppl-video-mirrored'),
      watch: originalRetainedMirrorVideo.closest('ytd-watch-flexy')?.id || null,
      playerParent: originalRetainedMirrorVideo.closest('#movie_player')?.parentElement?.localName,
      floating: document.body.classList.contains('ytsmp-scroll-miniplayer-active'),
    }));
    if (!retained.connected || retained.watch !== 'retained-watch') t.diagnostic(JSON.stringify(retained));
    assert.equal(retained.connected, true);
    assert.equal(retained.mirrored, null);
  });
}

test('complete Suite batches Mirror tooltip registrations without changing native delivery or retaining observers', async t => {
  const marker = 'replaceObserverRegistrations(videoMirrorTooltipObserver, registrations);';
  assert.equal(SUITE.split(marker).length, 2, 'The generated Suite must contain the canonical registration batch');
  const results = [];
  for (const sequential of [true, false]) {
    const page = await open(t);
    // The reference changes only how the identical native owner chain is registered.
    const source = sequential ? SUITE.replace(marker,
      'registrations.forEach(([target, options]) => videoMirrorTooltipObserver.observe(target, options));') : SUITE;
    await page.addScriptTag({ content: instrumentBroker(source) });
    await waitForSuiteHealth(page, 8, { timeoutMs: 7000 });
    await page.locator('video').hover();
    await page.evaluate(async () => {
      for (let count = 0; count < 4; count++) await new Promise(requestAnimationFrame);
      for (const key of ['refreshes', 'replacements', 'nativeObserves', 'batches', 'records']) mirrorBrokerAudit[key] = 0;
      mirrorBrokerAudit.initialObservers = mirrorBrokerAudit.activeObservers;
    });
    for (let count = 0; count < 10; count++) {
      await page.locator('#ytppl-video-mirror-button').hover();
      await page.locator('#ytppl-video-mirror-tooltip').waitFor({ state: 'visible' });
      await page.locator('video').hover();
      assert.equal(await page.locator('#ytppl-video-mirror-tooltip').count(), 0);
    }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    results.push(await page.evaluate(() => ({ ...mirrorBrokerAudit })));
  }
  const [reference, batched] = results;
  t.diagnostic(JSON.stringify({ reference, batched }));
  assert.equal(batched.refreshes, 20, 'Each tooltip needs one registration transaction and one disconnect');
  assert.ok(reference.refreshes > batched.refreshes);
  assert.ok(reference.replacements > batched.replacements);
  assert.ok(reference.nativeObserves > batched.nativeObserves);
  assert.equal(batched.batches, reference.batches, 'Do not discard or invent native mutation batches');
  assert.equal(batched.records, reference.records, 'Do not discard or invent native mutation records');
  for (const result of results) assert.equal(result.activeObservers, result.initialObservers, 'Repeated tooltip hovers must not retain logical observers');
});

test('standalone Mirror keeps every ancestor observed and disconnects after hidden controls, replacement and navigation', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    const NativeObserver = window.MutationObserver;
    window.mirrorOwnerAudit = { registrations: [], active: new Set() };
    window.MutationObserver = class extends NativeObserver {
      observe(target, options) {
        if (options.attributes && !options.subtree && !options.childList &&
          options.attributeFilter?.join(',') === 'class,style,hidden,aria-hidden') {
          mirrorOwnerAudit.registrations.push(target);
          mirrorOwnerAudit.active.add(this);
        }
        return super.observe(target, options);
      }
      disconnect() { mirrorOwnerAudit.active.delete(this); return super.disconnect(); }
    };
  });
  await page.addScriptTag({ content: SOURCE });
  const button = page.locator('#ytppl-video-mirror-button');
  const tooltip = page.locator('#ytppl-video-mirror-tooltip');
  await button.hover(); await tooltip.waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => {
    const expected = [];
    for (let element = document.getElementById('ytppl-video-mirror-button'); element; element = element.parentElement) expected.push(element);
    return expected.length === mirrorOwnerAudit.registrations.length &&
      expected.every((element, index) => element === mirrorOwnerAudit.registrations[index]);
  }), true);
  await page.evaluate(() => { document.querySelector('.ytp-right-controls').style.visibility = 'hidden'; });
  await tooltip.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => mirrorOwnerAudit.active.size), 0);
  await page.evaluate(() => { document.querySelector('.ytp-right-controls').style.visibility = ''; });
  await page.locator('video').hover(); await button.hover(); await tooltip.waitFor({ state: 'visible' });
  await page.evaluate(() => {
    mirrorOwnerAudit.replacedObserver = [...mirrorOwnerAudit.active][0];
    const previous = document.querySelector('.ytp-right-controls');
    const next = previous.cloneNode(true); next.querySelector('#ytppl-video-mirror-button').remove();
    previous.replaceWith(next);
  });
  await page.waitForFunction(() => !mirrorOwnerAudit.active.has(mirrorOwnerAudit.replacedObserver));
  // Moving the reused button beneath the stationary pointer can legitimately
  // create a new hover tooltip after its old owner has been disconnected.
  await page.locator('video').hover();
  await tooltip.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => mirrorOwnerAudit.active.size), 0);
  await button.waitFor();
  await page.locator('video').hover(); await button.hover(); await tooltip.waitFor({ state: 'visible' });
  await page.locator('#next-video').click();
  await tooltip.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => mirrorOwnerAudit.active.size), 0);
  await page.locator('video').hover(); await button.hover(); await tooltip.waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => mirrorOwnerAudit.active.size), 1);
  await page.locator('video').hover();
  assert.equal(await page.evaluate(() => mirrorOwnerAudit.active.size), 0);
});
