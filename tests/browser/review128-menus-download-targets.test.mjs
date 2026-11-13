// Language: en-GB. Synthetic native offline-download targets; no live profile or network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installCurrentQueueMenu } from '../../sources/current-queue-menu.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const CURRENT = 'bbbbbbbbbbb', PREVIOUS = 'aaaaaaaaaaa';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function open(t, target, compiled, { renderer = 'download', malformed = false, conflicting = false } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en-GB"><style>ytd-miniplayer,ytd-playlist-panel-renderer,ytd-playlist-panel-video-renderer{display:block;width:400px;min-height:72px}#movie_player{width:400px;height:225px}</style><body><ytd-miniplayer><div id="movie_player"></div><ytd-playlist-panel-renderer></ytd-playlist-panel-renderer></ytd-miniplayer></body></html>',
  }) : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto('https://www.youtube.com/');
  await page.evaluate(({ target, current, renderer, malformed, conflicting }) => {
    const panel = document.querySelector('ytd-playlist-panel-renderer'), player = document.querySelector('#movie_player');
    // Public native Download renderer schema, also supported by the Suite's
    // visibility filter. The native component owns dispatch; the Suite must
    // validate the target before exposing it on the playing queue row.
    const service = {
      serviceEndpoint: { offlineVideoEndpoint: { videoId: target } },
    };
    if (malformed) service.serviceEndpoint.offlineVideoEndpoint = target;
    const item = renderer === 'download' ? { menuServiceItemDownloadRenderer: service } : { menuServiceItemRenderer: service };
    if (conflicting) item.menuServiceItemRenderer = { serviceEndpoint: { offlineVideoEndpoint: { videoId: current } } };
    const model = { items: [item] };
    const entry = { videoId: current, playlistSetVideoId: 'current-set', selected: true, menu: { menuRenderer: model } };
    panel.data = { playlistId: 'TLPQfixture', currentIndex: 0, contents: [{ playlistPanelVideoRenderer: entry }] };
    const row = document.createElement('ytd-playlist-panel-video-renderer'); row.data = entry; row.setAttribute('selected', ''); panel.append(row);
    player.getVideoData = () => ({ video_id: current }); player.getPlaylist = () => [current];
    player.getPlaylistId = () => panel.data.playlistId; player.getPlaylistIndex = () => 0;
    customElements.define('ytd-menu-renderer', class extends HTMLElement {
      set data(value) {
        this._data = value;
        const button = document.createElement('button'); button.textContent = 'Native Download';
        button.addEventListener('click', () => {
          const item = value.items[0];
          window.dispatchedEndpoint = (item.menuServiceItemDownloadRenderer || item.menuServiceItemRenderer).serviceEndpoint;
        });
        this.replaceChildren(button);
      }
      get data() { return this._data; }
    });
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: {
      currentQueueMenu: true, menuShowDownload: true, theatreMode: false, miniplayerEnabled: false,
    } }));
  }, { target, current: CURRENT, renderer, malformed, conflicting });
  if (compiled) {
    await page.addScriptTag({ content: readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8') });
    const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
    await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
  } else {
    await page.evaluate(factory => { window.disposeCurrent = (0, eval)(`(${factory})`)({ document, window }); }, installCurrentQueueMenu.toString());
  }
  await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
  return page;
}

for (const compiled of [false, true]) {
  test(`current-menu Download rejects a retained previous-video target (${compiled ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, PREVIOUS, compiled);
    assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(), 0,
      'A native Download command naming the previous video must not be exposed on the current entry');
    assert.equal(await page.evaluate(() => window.dispatchedEndpoint), undefined);
  });

  test(`current-menu Download preserves a verified current-video target (${compiled ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, CURRENT, compiled);
    await page.locator('[selected] ytd-menu-renderer button').click();
    assert.deepEqual(await page.evaluate(() => window.dispatchedEndpoint), { offlineVideoEndpoint: { videoId: CURRENT } });
  });

  test(`current-menu Download cannot dispatch an initially retained target (${compiled ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, PREVIOUS, compiled);
    const button = page.locator('[selected] ytd-menu-renderer button');
    if (await button.count()) await button.click();
    assert.equal(await page.evaluate(() => window.dispatchedEndpoint), undefined,
      'The native Download renderer must not receive activation for the previous video');
  });

  test(`current-menu Download revalidates a native target rebound before repaint (${compiled ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, CURRENT, compiled);
    await page.evaluate(previous => {
      window.requestAnimationFrame = () => 0;
      const menu = document.querySelector('[selected] ytd-menu-renderer');
      const stale = structuredClone(menu.data);
      stale.items[0].menuServiceItemDownloadRenderer.serviceEndpoint.offlineVideoEndpoint.videoId = previous;
      document.querySelector('[selected]').data.menu.menuRenderer = stale;
      menu.data = stale;
    }, PREVIOUS);
    await page.locator('[selected] ytd-menu-renderer button').click({ force: true });
    assert.equal(await page.evaluate(() => window.dispatchedEndpoint), undefined,
      'Click-time validation must reject a Download command rebound to the previous video');
  });

  test(`current-menu Download rejects conflicting supported renderer targets (${compiled ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, PREVIOUS, compiled, { conflicting: true });
    assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(), 0);
  });

  for (const renderer of ['download', 'service']) {
    for (const [name, target] of [['missing video ID', {}], ['null endpoint', null], ['string endpoint', CURRENT], ['non-string video ID', { videoId: 123 }]]) {
      test(`current-menu Download rejects ${name} in ${renderer} renderer (${compiled ? 'Suite' : 'source'})`, async t => {
        const page = await open(t, target, compiled, { renderer, malformed: true });
        assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(), 0);
      });
    }
    test(`current-menu Download preserves current target in ${renderer} renderer (${compiled ? 'Suite' : 'source'})`, async t => {
      const page = await open(t, CURRENT, compiled, { renderer });
      await page.locator('[selected] ytd-menu-renderer button').click();
      assert.deepEqual(await page.evaluate(() => window.dispatchedEndpoint), { offlineVideoEndpoint: { videoId: CURRENT } });
    });
  }
}
