// Language: en-GB. Synthetic native getter reentrancy; no user data or network.
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
const A = 'aaaaaaaaaaa', B = 'bbbbbbbbbbb', C = 'ccccccccccc', D = 'ddddddddddd', E = 'eeeeeeeeeee';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function open(t, suite, hasAnchor = true) {
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
  await page.evaluate(({ A, B, C, D, E, hasAnchor }) => {
    document.querySelectorAll('ytd-playlist-panel-renderer').forEach(panel => panel.remove());
    const f = window.dispatchBoundaryFixture = { ids: [A, B, C], adds: [], commands: [], moves: [], armed: false, interrupted: false };
    fixture.playerId = A;
    const player = document.getElementById('movie_player');
    if (!hasAnchor) player.style.display = 'none';
    player.getPlaylistId = () => 'TLPQfixture';
    player.getPlaylist = () => [...f.ids];
    const panel = document.createElement('ytd-playlist-panel-renderer');
    panel.style.cssText = 'display:block;width:400px';
    const items = document.createElement('div'); items.id = 'items'; panel.append(items);
    document.querySelector('#secondary').append(panel);
    const owner = panel.polymerController = { canReorder: true };
    f.render = () => {
      owner.data = { playlistId: 'TLPQfixture', currentIndex: 0, totalVideos: f.ids.length,
        contents: f.ids.map(videoId => ({ playlistPanelVideoRenderer: { videoId, playlistSetVideoId: 'set-' + videoId, selected: videoId === A } })) };
      items.replaceChildren(...owner.data.contents.map(item => {
        const row = document.createElement('ytd-playlist-panel-video-renderer');
        row.data = item.playlistPanelVideoRenderer; row.style.display = 'block'; row.textContent = row.data.videoId; return row;
      }));
      dispatchEvent(new Event('yt-playlist-data-updated'));
    };
    owner.handleDrop = ({ currDragItem }) => { f.moves.push(currDragItem.data.videoId); f.ids = [...items.children].map(row => row.data.videoId); f.render(); };
    f.render();
    const dropdown = document.createElement('tp-yt-iron-dropdown'), popup = document.createElement('ytd-menu-popup-renderer');
    popup.style.cssText = 'position:fixed;top:60px;right:20px;z-index:2500;display:block;background:#222';
    dropdown.append(popup); document.querySelector('ytd-app').append(dropdown);
    dropdown.close = () => { popup.style.display = 'none'; }; dropdown.refit = () => {};
    const resolve = endpoint => {
      const command = endpoint.signalServiceEndpoint.actions[0].addToPlaylistCommand;
      f.adds.push(command.videoId); f.commands.push(structuredClone(command)); f.ids.push(command.videoId); f.render(); return true;
    };
    const popupOwner = popup.polymerController = { set(path, data) {
      this.data = data;
      popup.replaceChildren(...data.items.map(item => {
        const row = document.createElement('ytd-menu-service-item-renderer'); row.polymerController = { data: item.menuServiceItemRenderer };
        row.textContent = item.menuServiceItemRenderer.text.simpleText; row.setAttribute('role', 'menuitem'); row.tabIndex = 0;
        row.style.cssText = 'display:block;padding:12px'; return row;
      }));
    } };
    Object.defineProperty(popupOwner, 'resolveCommand', { get() {
      f.armed = true;
      if (f.rebindAtResolve) { f.command.videoId = E; f.command.videoIds = [E]; f.rebound = true; }
      return resolve;
    } });
    f.open = interruption => {
      const command = { videoId: D, videoIds: [D], listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE', openMiniplayer: true,
        onCreateListCommand: { createPlaylistServiceEndpoint: { params: 'synthetic-create', videoIds: [D] } } };
      f.command = command;
      Object.defineProperty(command, 'params', { enumerable: true, get() {
        if (interruption && f.armed && !f.interrupted) { f.interrupted = true; dispatchEvent(new Event(interruption)); }
        return 'synthetic';
      } });
      popupOwner.set('data', { items: [{ menuServiceItemRenderer: { text: { simpleText: 'Add to queue' }, icon: { iconType: 'ADD_TO_QUEUE_TAIL' },
        serviceEndpoint: { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{ addToPlaylistCommand: command }] } } } }] });
      popup.style.display = 'block';
      popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true }));
    };
  }, { A, B, C, D, E, hasAnchor });
  if (!suite) await page.addScriptTag({ content: `(() => { ${installer}\ninstallQueuePlayNext(); })();` });
  return page;
}

for (const suite of [false, true]) for (const hasAnchor of [false, true]) for (const interruption of ['yt-navigate-start', 'pagehide'])
  test(`native command cloning cannot dispatch after ${interruption} (${suite ? 'Suite' : 'source'}, ${hasAnchor ? 'playing' : 'no player'})`, async t => {
    const page = await open(t, suite, hasAnchor);
    await page.evaluate(interruption => dispatchBoundaryFixture.open(interruption), interruption);
    await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).click();
    assert.equal(await page.evaluate(() => dispatchBoundaryFixture.interrupted), true, 'The native command getter must hit the final dispatch boundary');
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.adds), [], 'Cancellation while cloning native metadata must prevent the native add');
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.moves), []);
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.ids), [A, B, C]);
  });

for (const suite of [false, true]) for (const hasAnchor of [false, true])
  test(`native metadata getters remain usable without cancellation (${suite ? 'Suite' : 'source'}, ${hasAnchor ? 'playing' : 'no player'})`, async t => {
    const page = await open(t, suite, hasAnchor);
    await page.evaluate(() => dispatchBoundaryFixture.open(null));
    await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).click();
    if (hasAnchor) await page.waitForFunction(() => dispatchBoundaryFixture.ids[1] === 'ddddddddddd');
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.adds), [D]);
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.moves), hasAnchor ? [D] : []);
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.ids), hasAnchor ? [A, D, B, C] : [A, B, C, D]);
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.commands[0]), {
      videoId: D, videoIds: [D], listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE', openMiniplayer: !hasAnchor,
      onCreateListCommand: { createPlaylistServiceEndpoint: { params: 'synthetic-create', videoIds: [D] } }, params: 'synthetic',
    }, 'Materialising the native command must preserve its creation metadata');
  });

for (const suite of [false, true])
  test(`an existing watch queue without its panel cannot append a Play next request (${suite ? 'Suite' : 'source'})`, async t => {
    const page = await open(t, suite);
    await page.evaluate(() => {
      document.querySelector('ytd-playlist-panel-renderer').remove();
      dispatchBoundaryFixture.open(null);
    });
    await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.adds), [], 'The native player proves an existing queue, but no panel exists to verify and reorder its append');
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.ids), [A, B, C]);
  });

for (const suite of [false, true]) for (const hasAnchor of [false, true])
  test(`native resolver lookup cannot dispatch an in-place recycled queue command (${suite ? 'Suite' : 'source'}, ${hasAnchor ? 'playing' : 'no player'})`, async t => {
    const page = await open(t, suite, hasAnchor);
    await page.evaluate(() => {
      dispatchBoundaryFixture.rebindAtResolve = true;
      dispatchBoundaryFixture.open(null);
    });
    await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).click();
    assert.equal(await page.evaluate(() => dispatchBoundaryFixture.rebound), true);
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.adds), [], 'A recycled native command must not add a different video under the accepted menu entry');
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.ids), [A, B, C]);
    assert.match(await page.locator('[data-yt-master-queue-status]').textContent(), /This menu changed/);
    await page.evaluate(() => {
      dispatchBoundaryFixture.rebindAtResolve = false;
      dispatchBoundaryFixture.open(null);
    });
    await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).click();
    if (hasAnchor) await page.waitForFunction(() => dispatchBoundaryFixture.ids[1] === 'ddddddddddd');
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.adds), [D], 'Rejecting a recycled command must release its pending timer and busy state');
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.moves), hasAnchor ? [D] : []);
    assert.deepEqual(await page.evaluate(() => dispatchBoundaryFixture.ids), hasAnchor ? [A, D, B, C] : [A, B, C, D]);
  });
