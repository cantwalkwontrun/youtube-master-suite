// Language: en-GB. Synthetic startup barriers; no live profiles or external requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const key = 'yt-master-suite.settings.v1';
const nativeQueue = `<ytd-miniplayer class="ytdMiniplayerComponentHost ytdMiniplayerComponentVisible" style="width:400px;height:586px;right:16px;bottom:16px">
<div class="ytdMiniplayerComponentContent"><yt-draggable class="ytdMiniplayerComponentDraggable">
<ytd-miniplayer-player-container><div class="native-video"></div></ytd-miniplayer-player-container>
<ytd-miniplayer-info-bar>Queue</ytd-miniplayer-info-bar></yt-draggable>
<ytd-playlist-panel-renderer class="ytdMiniplayerComponentPlaylistPanel" within-miniplayer>
<div id="container"><div class="header">Synthetic queue</div><div class="playlist-items"><div id="items">
<ytd-playlist-panel-video-renderer>First queued video</ytd-playlist-panel-video-renderer>
<ytd-playlist-panel-video-renderer>Second queued video</ytd-playlist-panel-video-renderer>
</div></div></div></ytd-playlist-panel-renderer></div></ytd-miniplayer>`;
const queueStyle = `<style>
.ytdMiniplayerComponentHost { position:fixed; display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
.ytdMiniplayerComponentContent,.ytdMiniplayerComponentDraggable { display:flex; flex-direction:column; width:100%; height:100%; }
.ytdMiniplayerComponentContent { overflow:hidden; }
.ytdMiniplayerComponentPlaylistPanel { display:block; height:285px; min-height:285px; flex:1; flex-basis:0.000000001px; }
ytd-miniplayer-player-container,.native-video { display:block; height:225px; flex-shrink:0; }
ytd-miniplayer-info-bar { display:block; height:76px; flex-shrink:0; }
.ytdMiniplayerComponentPlaylistPanel #container { display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden; }
.ytdMiniplayerComponentPlaylistPanel .header { height:52px; flex-shrink:0; }
.ytdMiniplayerComponentPlaylistPanel .playlist-items { height:100%; overflow-y:auto; }
.ytdMiniplayerComponentPlaylistPanel ytd-playlist-panel-video-renderer { display:block; height:64px; }
</style>`;
const fixture = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8')
  .replace('lang="en"', 'lang="en-GB"')
  .replace('</head>', `${queueStyle}<script src="/startup-suite.js"></script><script defer src="/startup-barrier.js"></script></head>`)
  .replace('</ytd-app>', `${nativeQueue}</ytd-app>`);
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function open(t, values) {
  const context = await browser.newContext({ viewport: { width:1280, height:900 }, serviceWorkers:'block' });
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const raw = JSON.stringify({ version:1, values:{ theatreMode:false, miniplayerEnabled:false, ...values } });
  // Model the synchronous committed Tampermonkey snapshot, so startup is tested
  // while the parser is in the head rather than after a fixture binding round trip.
  const protectedStorage = `(() => {
    const keys = ['yt-master-suite.settings.v1', 'yt-master-suite.scroll-miniplayer.corner.v1',
      'yt-master-suite.channel-age.v1', 'yt-master-suite.playhead-image.v1', 'yt-master-suite.update-source.v1'];
    const values = new Map([['yt-master-suite.storage-migration.v1', JSON.stringify({ version:1,
      values:Object.fromEntries(keys.map(key => [key, key === ${JSON.stringify(key)} ? ${JSON.stringify(raw)} : null])) })]]);
    window.GM_info = { isIncognito:false, sandboxMode:'raw', scriptHandler:'Tampermonkey' };
    window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
    window.GM_setValue = (key, value) => values.set(key, value);
    let listenerId = 0;
    window.GM_addValueChangeListener = () => ++listenerId;
    window.GM_removeValueChangeListener = () => {};
    window.startupProtectedRead = key => values.has(key) ? values.get(key)
      : JSON.parse(values.get('yt-master-suite.storage-migration.v1')).values[key];
  })();`;
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.isNavigationRequest()) return route.fulfill({ contentType:'text/html', body:fixture });
    if (new URL(request.url()).pathname === '/startup-suite.js') {
      return route.fulfill({ contentType:'text/javascript', body:protectedStorage + source });
    }
    if (new URL(request.url()).pathname === '/startup-barrier.js') {
      await barrier;
      return route.fulfill({ contentType:'text/javascript', body:'/* Synthetic deferred startup barrier. */' });
    }
    return route.abort();
  });
  await context.addInitScript(() => {
    window.startupDcl = false;
    document.addEventListener('DOMContentLoaded', () => { window.startupDcl = true; });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    release();
    try {
      await waitForSuiteHealth(page, manifest.registeredModules, { timeoutMs:7000, errors });
      assert.deepEqual(errors, []);
      assert.equal(await page.getAttribute('html', 'data-yt-master-runtime-errors'), null);
    } finally { await context.close(); }
  });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa', { waitUntil:'commit' });
  await page.locator('ytd-miniplayer .playlist-items').waitFor({ state:'visible' });
  return { page, raw, release };
}

test('settings access and compact native queue initialise before deferred page startup completes', async t => {
  const { page, raw, release } = await open(t, {});
  await page.waitForFunction(() => {
    const host = document.querySelector('ytd-miniplayer');
    return document.getElementById('ytms-player-settings-button') &&
      host?.hasAttribute('data-ytms-compact-native-queue');
  }, null, { timeout:4000 });
  const early = await page.evaluate(key => {
    const host = document.querySelector('ytd-miniplayer'), box = host.getBoundingClientRect();
    return { dcl:window.startupDcl, height:box.height, bottom:box.bottom,
      top:box.top, health:JSON.parse(document.documentElement.getAttribute('data-yt-master-suite')),
      settings:startupProtectedRead(key) };
  }, key);
  assert.equal(early.dcl, false);
  assert.ok(early.height < 586);
  assert.equal(early.bottom, 884);
  assert.ok(early.health.initialisedModules.includes('suiteSettings'));
  assert.ok(early.health.pendingModules.includes('commentCleaner'));
  assert.equal(early.settings, raw);
  release();
  await page.waitForLoadState('domcontentloaded');
  await waitForSuiteHealth(page, manifest.registeredModules, { timeoutMs:7000 });
  const after = await page.locator('ytd-miniplayer').boundingBox();
  assert.equal(after.y, early.top, 'DOMContentLoaded must not reposition the fitted card');
  assert.equal(after.height, early.height);
});

test('early startup honours saved disabled controls before parsed-content work runs', async t => {
  const { page, raw } = await open(t, { compactNativeQueue:false, playerSettingsIcon:'off' });
  await page.waitForFunction(() => JSON.parse(document.documentElement.getAttribute('data-yt-master-suite') || 'null')
    ?.initialisedModules.includes('suiteSettings'), null, { timeout:4000 });
  assert.equal(await page.evaluate(() => window.startupDcl), false);
  assert.equal(await page.locator('#ytms-player-settings-button').count(), 0);
  assert.equal(await page.locator('ytd-miniplayer').getAttribute('data-ytms-compact-native-queue'), null);
  assert.equal((await page.locator('ytd-miniplayer').boundingBox()).height, 586);
  assert.equal(await page.evaluate(key => startupProtectedRead(key), key), raw);
});
