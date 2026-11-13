// Language: en-GB. Synthetic recycled-current-menu targets, isolated browsers only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installCurrentQueueMenu } from '../../sources/current-queue-menu.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const CURRENT = 'bbbbbbbbbbb', PREVIOUS = 'aaaaaaaaaaa';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function open(t, endpoint, compiled) {
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
  await page.evaluate(({ endpoint, current }) => {
    const panel = document.querySelector('ytd-playlist-panel-renderer'), player = document.querySelector('#movie_player');
    const model = { items: [{ menuServiceItemRenderer: { text: { simpleText: 'Add to queue' }, icon: { iconType: 'ADD_TO_QUEUE_TAIL' }, serviceEndpoint: endpoint } }] };
    const entry = { videoId: current, playlistSetVideoId: 'current-set', selected: true, menu: { menuRenderer: model } };
    panel.data = { playlistId: 'TLPQfixture', currentIndex: 0, contents: [{ playlistPanelVideoRenderer: entry }] };
    const row = document.createElement('ytd-playlist-panel-video-renderer'); row.data = entry; row.setAttribute('selected', ''); panel.append(row);
    player.getVideoData = () => ({ video_id: current }); player.getPlaylist = () => [current];
    player.getPlaylistId = () => panel.data.playlistId; player.getPlaylistIndex = () => 0;
    customElements.define('ytd-menu-renderer', class extends HTMLElement {
      set data(value) {
        this._data = value;
        const button = document.createElement('button'); button.textContent = 'More actions';
        button.addEventListener('click', () => { window.dispatchedEndpoint = value.items[0].menuServiceItemRenderer.serviceEndpoint; });
        this.replaceChildren(button);
      }
      get data() { return this._data; }
    });
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { currentQueueMenu: true, theatreMode: false, miniplayerEnabled: false } }));
  }, { endpoint, current: CURRENT });
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

function queued(ids, extra = {}) {
  return { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ addToPlaylistCommand: { listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE', videoIds: ids, ...extra } }] } };
}
for (const compiled of [false, true]) {
  for (const [name, endpoint] of [
    ['previous video array', queued([PREVIOUS])],
    ['mixed current and previous videos', queued([CURRENT, PREVIOUS])],
    ['contradictory scalar video', queued([CURRENT], { videoId: PREVIOUS })],
    ['empty video array', queued([])],
    ['non-array video targets', queued(CURRENT)],
    ['null video targets', queued(null)],
    ['absent video targets', { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ addToPlaylistCommand: { listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE' } }] } }],
    ['previous scalar video', { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ addToPlaylistCommand: { listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE', videoId: PREVIOUS } }] } }],
  ]) test(`current-menu queue command rejects ${name} (${compiled ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, endpoint, compiled);
    assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(), 0, 'A recycled menu command naming another video must not be exposed on the current entry');
    assert.equal(await page.evaluate(() => window.dispatchedEndpoint), undefined);
  });

  for (const [name, endpoint] of [
    ['video array', queued([CURRENT])],
    ['agreeing scalar and array', queued([CURRENT], { videoId: CURRENT })],
    ['scalar video', { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ addToPlaylistCommand: { listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE', videoId: CURRENT } }] } }],
    ['unrelated native action', { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ showFeedbackEndpoint: {} }] } }],
  ]) test(`current-menu queue command accepts ${name} (${compiled ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, endpoint, compiled);
    await page.locator('[selected] ytd-menu-renderer button').click();
    assert.deepEqual(await page.evaluate(() => window.dispatchedEndpoint), endpoint);
  });
}
