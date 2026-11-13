// Language: en-GB. Synthetic native model/row transitions; no user profile or live network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const source = readFileSync(new URL('../../sources/modules/youtube-watch-layout-cleaner.user.js', import.meta.url), 'utf8');
const start = source.indexOf('  function installQueuePlayNext(');
const installer = source.slice(start, source.indexOf('\n  function installQueueDragAssistance(', start));
const compiled = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const A = 'aaaaaaaaaaa', B = 'bbbbbbbbbbb', C = 'ccccccccccc', D = 'ddddddddddd';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function open(t, suite, mini, stamp) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  if (suite) await context.addInitScript({ content: compiled });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(4000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=' + A);
  if (suite) await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true, timeoutMs: 10000 });
  await page.evaluate(({ A, B, C, mini, stamp }) => {
    document.querySelectorAll('ytd-playlist-panel-renderer').forEach(panel => panel.remove());
    const f = window.stampProofFixture = { ids: [A, B, C], nativeIds: [A, B, C], adds: [], moves: [], stampCount: 0 };
    fixture.playerId = A;
    const player = document.getElementById('movie_player');
    player.getPlaylistId = () => mini ? null : 'TLPQfixture';
    player.getPlaylist = () => [...f.nativeIds];
    const panel = document.createElement('ytd-playlist-panel-renderer');
    panel.style.cssText = 'display:block;width:400px';
    const items = document.createElement('div'); items.id = 'items'; panel.append(items);
    const owner = panel.polymerController = { canReorder: true };
    if (mini) {
      const host = document.createElement('ytd-miniplayer');
      host.append(player, panel); document.querySelector('ytd-app').append(host);
      history.replaceState(null, '', '/');
    } else document.querySelector('#secondary').append(panel);
    f.model = () => ({ playlistId: 'TLPQfixture', currentIndex: 0, totalVideos: f.ids.length,
      contents: f.ids.map(videoId => ({ playlistPanelVideoRenderer: { videoId, playlistSetVideoId: 'set-' + videoId, selected: videoId === A } })) });
    f.rows = () => items.replaceChildren(...owner.data.contents.map(item => {
      const row = document.createElement('ytd-playlist-panel-video-renderer');
      row.data = item.playlistPanelVideoRenderer; row.style.display = 'block'; row.textContent = row.data.videoId; return row;
    }));
    owner.data = f.model(); f.rows();
    owner.handleDrop = ({ currDragItem }) => {
      f.moves.push(currDragItem.data.videoId);
      f.ids = [...items.children].map(row => row.data.videoId);
      owner.data = f.model();
      // Native display stamping and the playlist API are separate updates.
      // The normal method body publishes its accepted model, then the native
      // rows finish binding asynchronously. No accessors mutate during lookup.
      if (stamp === 'binding') [...items.children].forEach(row => { row.data = undefined; });
      else items.replaceChildren();
      dispatchEvent(new Event('yt-playlist-data-updated'));
      setTimeout(() => {
        f.rows(); f.stampCount++;
        panel.dispatchEvent(new CustomEvent('yt-rendererstamper-finished', { bubbles: true }));
      }, 150);
    };
    const dropdown = document.createElement('tp-yt-iron-dropdown'), popup = document.createElement('ytd-menu-popup-renderer');
    popup.style.cssText = 'position:fixed;top:60px;right:20px;z-index:2500;display:none;background:#222';
    dropdown.append(popup); document.querySelector('ytd-app').append(dropdown);
    dropdown.close = () => { popup.style.display = 'none'; }; dropdown.refit = () => {};
    const popupOwner = popup.polymerController = { set(path, data) {
      this.data = data;
      popup.replaceChildren(...data.items.map(item => {
        const row = document.createElement('ytd-menu-service-item-renderer'); row.polymerController = { data: item.menuServiceItemRenderer };
        row.textContent = item.menuServiceItemRenderer.text.simpleText; row.setAttribute('role', 'menuitem'); row.tabIndex = 0;
        row.style.cssText = 'display:block;padding:12px'; return row;
      }));
    }, resolveCommand(endpoint) { f.adds.push(endpoint.signalServiceEndpoint.actions[0].addToPlaylistCommand.videoId); return false; } };
    f.open = videoId => {
      popupOwner.set('data', { items: [{ menuServiceItemRenderer: { text: { simpleText: 'Add to queue' }, icon: { iconType: 'ADD_TO_QUEUE_TAIL' },
        serviceEndpoint: { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ addToPlaylistCommand: {
          videoId, videoIds: [videoId], listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE', openMiniplayer: true,
        } }] } } } }] });
      popup.style.display = 'block'; popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true }));
    };
  }, { A, B, C, mini, stamp });
  if (!suite) await page.addScriptTag({ content: `(() => { ${installer}\ninstallQueuePlayNext(); })();` });
  return page;
}

async function choose(page, id) {
  await page.evaluate(id => stampProofFixture.open(id), id);
  await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).click();
}

for (const suite of [false, true]) for (const mini of [false, true]) for (const stamp of ['binding', 'replacement'])
  test(`native row ${stamp} retains completed queue order proof (${suite ? 'Suite' : 'source'}, ${mini ? 'Home miniplayer' : 'watch'})`, async t => {
    const page = await open(t, suite, mini, stamp);
    await choose(page, C);
    await page.waitForFunction(() => stampProofFixture.stampCount === 1);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.ids), [A, C, B]);
    assert.deepEqual(await page.evaluate(() => document.getElementById('movie_player').getPlaylist()), [A, B, C]);
    await choose(page, B);
    await page.waitForFunction(() => stampProofFixture.moves.length === 2);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.ids), [A, B, C]);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.moves), [C, B]);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.adds), []);
  });

async function prepareRestoration(page, transition, fault = '') {
  await page.evaluate(({ transition, fault }) => {
    const f = stampProofFixture, player = document.getElementById('movie_player');
    const mini = player.closest('ytd-miniplayer'), panel = mini.querySelector('ytd-playlist-panel-renderer'), owner = panel.polymerController;
    f.listId = 'TLPQfixture'; player.getPlaylistId = () => f.listId;
    panel.remove();
    const restore = endpoint => {
      const command = endpoint.signalServiceEndpoint.actions[0].addToPlaylistCommand;
      f.adds.push(command.videoId);
      if (command.openMiniplayer !== true) throw new Error('Expected one native restoration append');
      setTimeout(() => {
        f.ids.push(command.videoId);
        if (transition !== 'lagging-playlist') f.nativeIds = [...f.ids];
        if (fault === 'wrong-order') [f.ids[1], f.ids[2]] = [f.ids[2], f.ids[1]];
        owner.data = f.model();
        if (fault === 'duplicate-entry') owner.data.contents[1].playlistPanelVideoRenderer.playlistSetVideoId = 'set-' + f.ids[0];
        if (fault === 'wrong-list') owner.data.playlistId = 'TLPQdifferent';
        f.rows(); mini.append(panel);
        if (fault === 'wrong-binding') panel.querySelector('#items').lastElementChild.data = { videoId: command.videoId, playlistSetVideoId: 'different-entry' };
        if (fault === 'wrong-player') {
          const replacement = player.cloneNode(true);
          for (const method of ['getVideoData', 'getPlaylistId', 'getPlaylist']) replacement[method] = player[method];
          player.replaceWith(replacement);
        }
        if (fault === 'wrong-mini') {
          const replacement = document.createElement('ytd-miniplayer');
          replacement.append(player, panel); mini.after(replacement);
        }
        if (fault === 'delayed-rows') {
          panel.querySelector('#items').replaceChildren();
          f.finishRestorationRows = () => {
            f.rows(); panel.dispatchEvent(new CustomEvent('yt-rendererstamper-finished', { bubbles: true }));
          };
        }
        f.listId = transition === 'lagging-playlist' ? 'TLPQfixture' : transition;
        f.restored = true; dispatchEvent(new Event('yt-playlist-data-updated'));
      }, 40);
      return true;
    };
    document.querySelector('ytd-app').resolveCommand = restore;
    document.querySelector('ytd-menu-popup-renderer').polymerController.resolveCommand = restore;
  }, { transition, fault });
}

for (const suite of [false, true]) for (const transition of [null, '', 'lagging-playlist'])
  test(`panel restoration keeps the original Home queue with ${transition === null ? 'null player ID' : transition === '' ? 'empty player ID' : 'lagging player playlist'} (${suite ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, suite, true, 'binding');
    await prepareRestoration(page, transition);
    await choose(page, D);
    await page.waitForFunction(() => stampProofFixture.moves.length === 1);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.ids), [A, D, B, C]);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.adds), [D]);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.moves), [D]);
  });

for (const suite of [false, true]) for (const fault of ['wrong-player', 'wrong-mini', 'wrong-list', 'wrong-order', 'wrong-binding', 'duplicate-entry'])
  test(`lagging player restoration refuses ${fault} (${suite ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, suite, true, 'binding');
    await prepareRestoration(page, 'lagging-playlist', fault);
    await choose(page, D);
    await page.waitForFunction(() => stampProofFixture.restored);
    await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
    assert.deepEqual(await page.evaluate(() => stampProofFixture.adds), [D], 'An uncertain restoration never dispatches a second append');
    assert.deepEqual(await page.evaluate(() => stampProofFixture.moves), []);
  });

for (const suite of [false, true])
  test(`lagging player restoration waits for its own native rows (${suite ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, suite, true, 'binding');
    await prepareRestoration(page, 'lagging-playlist', 'delayed-rows');
    await choose(page, D);
    await page.waitForFunction(() => stampProofFixture.restored);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.moves), []);
    await page.evaluate(() => stampProofFixture.finishRestorationRows());
    await page.waitForFunction(() => stampProofFixture.moves.length === 1);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.ids), [A, D, B, C]);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.adds), [D]);
    assert.deepEqual(await page.evaluate(() => stampProofFixture.moves), [D]);
  });
