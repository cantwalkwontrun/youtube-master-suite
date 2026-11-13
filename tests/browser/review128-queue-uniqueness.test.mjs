// Language: en-GB. Synthetic TLPQ queue policy; no user profile, playback or live network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const source = readFileSync(new URL('../../sources/modules/youtube-watch-layout-cleaner.user.js', import.meta.url), 'utf8');
const start = source.indexOf('  function installQueuePlayNext(');
const installer = source.slice(start, source.indexOf('\n  function installQueueDragAssistance(', start));
const bridge = readFileSync(new URL('../../sources/queue-menu-bindings.mjs', import.meta.url), 'utf8').replace('export function', 'function');
const compiled = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const A = 'aaaaaaaaaaa', B = 'bbbbbbbbbbb', C = 'ccccccccccc', D = 'ddddddddddd';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
async function open(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  if (options.suite) await context.addInitScript({ content: compiled });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=' + A);
  if (options.suite) await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true, timeoutMs: 10000 });
  await page.evaluate(({ A, B, C, options }) => {
    document.querySelectorAll('ytd-playlist-panel-renderer').forEach(panel => panel.remove());
    const f = window.uniqueFixture = { entries: (options.noQueue ? [A] : options.ids || [A, B, C]).map((videoId, i) => ({ videoId, playlistSetVideoId: 'set-' + i })),
      index: options.index || 0, adds: [], removals: [], moves: [], serial: 100, ignoreRemoval: Boolean(options.ignoreRemoval), refuseAppend: false, signalCount: 0,
      nativeListId: options.noQueue ? null : options.savedPlaylist ? 'PLfixture' : 'TLPQfixture', panelListId: options.savedPlaylist ? 'PLfixture' : 'TLPQfixture', frames: 0, commands: [], mediaCalls: [], hidden: options.blocked === 'hidden', nativeOrder: options.nativeOrder, noQueue: Boolean(options.noQueue) };
    if (options.oversizedSet) f.entries[0].playlistSetVideoId = 'x'.repeat(1025);
    const nativeFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { f.frames++; return nativeFrame(callback); };
    const player = document.getElementById('movie_player');
    if (options.noPlayer) player.style.display = 'none';
    for (const method of ['playVideo', 'pauseVideo', 'seekTo', 'loadVideoById', 'loadPlaylist']) player[method] = () => { f.mediaCalls.push(method); };
    if (['ad-showing', 'ad-interrupting'].includes(options.blocked)) player.classList.add(options.blocked);
    if (options.blocked === 'hidden') Object.defineProperty(document, 'hidden', { configurable: true, get: () => f.hidden });
    f.currentSet = f.entries[f.index].playlistSetVideoId; fixture.playerId = f.entries[f.index].videoId;
    player.getPlaylistId = () => f.nativeListId;
    player.getPlaylist = () => f.noQueue ? [] : f.nativeOrder === 'missing' ? undefined : f.nativeOrder === 'empty' ? [] :
      f.nativeOrder === 'invalid' ? [null] : f.nativeIds || f.entries.map(entry => entry.videoId);
    if (!options.missingIndex) player.getPlaylistIndex = () => f.nativeIndex ?? f.index;
    const panel = document.createElement('ytd-playlist-panel-renderer'), items = document.createElement('div');
    panel.style.cssText = 'display:block;width:400px'; items.id = 'items'; panel.append(items);
    if (options.mini) {
      const mini = document.createElement('ytd-miniplayer'); mini.append(player, panel); document.querySelector('ytd-app').append(mini);
      history.replaceState(null, '', '/');
    } else document.querySelector('#secondary').append(panel);
    const owner = panel.polymerController = { canReorder: true }; f.panel = panel; f.owner = owner;
    f.dragging = options.blocked === 'drag';
    owner.ytReorderableController = { fixture_dragListGroup: { isDragging: () => f.dragging } };
    if (options.blocked === 'players') {
      const duplicate = document.createElement('div'); duplicate.id = 'movie_player'; duplicate.dataset.ambiguousPlayer = '1';
      duplicate.style.cssText = 'display:block;width:100px;height:100px'; duplicate.getVideoData = () => ({ video_id: fixture.playerId }); document.body.append(duplicate);
    }
    f.render = () => {
      owner.data = { playlistId: f.panelListId, currentIndex: f.index, totalVideos: f.entries.length,
        contents: f.entries.map((entry, i) => ({ playlistPanelVideoRenderer: { ...entry, selected: i === f.index } })) };
      if (!f.holdRows) items.replaceChildren(...owner.data.contents.map(item => {
        const row = document.createElement('ytd-playlist-panel-video-renderer');
        row.data = item.playlistPanelVideoRenderer; row.textContent = 'Identical presentation'; row.style.display = 'block'; return row;
      }));
      f.signalCount++; dispatchEvent(new Event('yt-playlist-data-updated'));
      panel.dispatchEvent(new CustomEvent('yt-rendererstamper-finished', { bubbles: true }));
    };
    owner.handleDrop = ({ currDragItem }) => {
      f.moves.push(currDragItem.data.playlistSetVideoId);
      if (options.lagging) { f.nativeIds ||= f.entries.map(entry => entry.videoId); f.nativeIndex ??= f.index; }
      f.entries = [...items.children].map(row => ({ videoId: row.data.videoId, playlistSetVideoId: row.data.playlistSetVideoId }));
      f.index = f.entries.findIndex(entry => entry.playlistSetVideoId === f.currentSet); f.render();
    };
    f.dispatch = endpoint => {
      const action = endpoint.signalServiceEndpoint.actions[0];
      if (action.playlistRemoveVideosAction) {
        assertSingleRemoval(action.playlistRemoveVideosAction.setVideoIds);
        const setId = action.playlistRemoveVideosAction.setVideoIds[0]; f.removals.push(setId);
        if (f.ignoreRemoval || options.ignoreAfterFirst && f.removals.length > 1) return true;
        if (setId === f.currentSet) throw new Error('Attempted removal of the playing entry');
        if (options.lagging) { f.nativeIds ||= f.entries.map(entry => entry.videoId); f.nativeIndex ??= f.index; }
        const index = f.entries.findIndex(entry => entry.playlistSetVideoId === setId);
        if (index >= 0) f.entries.splice(index, 1);
        f.index = f.entries.findIndex(entry => entry.playlistSetVideoId === f.currentSet);
        if (options.delayedRemovalRows) {
          f.holdRows = true;
          f.finishRows = () => { f.holdRows = false; f.render(); };
        }
        f.render(); return true;
      }
      const command = action.addToPlaylistCommand; f.adds.push(command.videoId); f.commands.push(structuredClone(command));
      if (f.refuseAppend) return false;
      setTimeout(() => {
        if (f.noQueue) {
          f.noQueue = false; f.nativeListId = f.panelListId = 'TLPQcreated';
          document.querySelector('#secondary').append(panel);
        }
        f.entries.push({ videoId: command.videoId, playlistSetVideoId: 'new-' + ++f.serial }); f.render();
      }, options.appendDelay || 0);
      return true;
    };
    function assertSingleRemoval(ids) { if (!Array.isArray(ids) || ids.length !== 1) throw new Error('Removal must have one exact set ID'); }
    document.querySelector('ytd-app').resolveCommand = f.dispatch;
    f.render();
    if (options.noQueue) panel.remove();
    const dropdown = document.createElement('tp-yt-iron-dropdown'), popup = document.createElement('ytd-menu-popup-renderer');
    popup.style.cssText = 'position:fixed;top:60px;right:20px;z-index:2500;display:none;background:#222';
    dropdown.append(popup); document.querySelector('ytd-app').append(dropdown); f.popup = popup;
    dropdown.close = () => { popup.style.display = 'none'; if (f.emptyOnClose) f.nativeOrder = 'empty'; }; dropdown.refit = () => {};
    const popupOwner = popup.polymerController = { set(path, data) {
      this.data = data;
      popup.replaceChildren(...data.items.map(item => {
        const row = document.createElement('ytd-menu-service-item-renderer'); row.polymerController = { data: item.menuServiceItemRenderer };
        row.textContent = item.menuServiceItemRenderer.text.simpleText; row.setAttribute('role', 'menuitem'); row.tabIndex = 0;
        row.style.cssText = 'display:block;padding:12px';
        row.onclick = () => { const endpoint = row.polymerController.data.serviceEndpoint; if (endpoint.signalServiceEndpoint.actions.length) f.dispatch(endpoint); dropdown.close(); };
        return row;
      }));
    }, resolveCommand: f.dispatch };
    f.open = (videoId, nativeHead = false) => {
      popupOwner.set('data', { items: [{ menuServiceItemRenderer: { text: { simpleText: nativeHead ? 'Native Play next' : 'Add to queue' },
        icon: { iconType: nativeHead ? 'QUEUE_PLAY_NEXT' : f.iconOverride === null ? undefined : f.iconOverride || 'ADD_TO_QUEUE_TAIL' }, serviceEndpoint: { signalServiceEndpoint: { signal: 'CLIENT_SIGNAL',
          actions: [{ addToPlaylistCommand: { videoId, videoIds: [videoId], listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE', openMiniplayer: true,
            params: 'synthetic-queue', onCreateListCommand: { createPlaylistServiceEndpoint: { params: 'synthetic-create', videoIds: [videoId] } } } }] } } } }] });
      f.originalCommand = structuredClone(popupOwner.data.items[0].menuServiceItemRenderer.serviceEndpoint.signalServiceEndpoint.actions[0].addToPlaylistCommand);
      popup.style.display = 'block'; popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true }));
    };
  }, { A, B, C, options });
  if (!options.suite) await page.addScriptTag({ content: '(() => {' + bridge + '\n' + installer +
    '\nwindow.disposeUniqueQueue = installQueuePlayNext({uniqueVideos:' + (options.enabled !== false) + ',menuBindings:createQueueMenuBindings()});})();' });
  return page;
}
async function choose(page, videoId, mode = 'tail') {
  await page.evaluate(({ videoId, mode }) => uniqueFixture.open(videoId, mode === 'native-next'), { videoId, mode });
  await page.getByRole('menuitem', { name: mode === 'tail' ? 'Add to queue' : mode === 'native-next' ? 'Native Play next' : 'Play next in queue', exact: true }).click();
}
const ids = page => page.evaluate(() => uniqueFixture.entries.map(entry => entry.videoId));
for (const suite of [false, true]) for (const mini of [false, true]) {
  test('existing Add to queue moves its one native entry to the tail (' + (suite ? 'Suite' : 'source') + ', mini ' + mini + ')', async t => {
    const page = await open(t, { suite, mini }); await choose(page, B);
    await page.waitForFunction(() => uniqueFixture.entries[2].videoId === 'bbbbbbbbbbb');
    assert.deepEqual(await ids(page), [A, C, B]);
    assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
  });
  test('existing duplicates are removed without removing or restarting the playing entry (' + (suite ? 'Suite' : 'source') + ', mini ' + mini + ')', async t => {
    const page = await open(t, { suite, mini, ids: [A, B, A, B, C], index: 2 });
    await page.waitForFunction(() => uniqueFixture.entries.length === 3);
    assert.deepEqual(await ids(page), [B, A, C]);
    assert.equal(await page.evaluate(() => uniqueFixture.entries[uniqueFixture.index].playlistSetVideoId), 'set-2');
    assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), ['set-0', 'set-3']);
    await choose(page, A);
    assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
    assert.deepEqual(await page.evaluate(() => uniqueFixture.moves), []);
  });
}
for (const suite of [false, true]) for (const mode of ['next', 'native-next']) test('existing target moves next once (' + (suite ? 'Suite' : 'source') + ', ' + mode + ')', async t => {
  const page = await open(t, { suite }); await choose(page, C, mode);
  await page.waitForFunction(() => uniqueFixture.entries[1].videoId === 'ccccccccccc');
  assert.deepEqual(await ids(page), [A, C, B]); assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
});
for (const suite of [false, true]) test('new video appends once and a later Add moves the existing entry (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite }); await choose(page, D, 'next');
  await page.waitForFunction(() => uniqueFixture.entries[1].videoId === 'ddddddddddd'); await choose(page, D);
  await page.waitForFunction(() => uniqueFixture.entries[3].videoId === 'ddddddddddd');
  assert.deepEqual(await ids(page), [A, B, C, D]); assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]);
});
for (const suite of [false, true]) test('an unresolved native append cannot be repeated by reopening the menu (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite }); await page.evaluate(() => { uniqueFixture.refuseAppend = true; });
  await choose(page, D); await choose(page, D);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]); assert.deepEqual(await ids(page), [A, B, C]);
});
for (const suite of [false, true]) for (const unsafe of ['missingIndex', 'savedPlaylist']) test('duplicate repair refuses ' + unsafe + ' (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, ids: [A, B, A], ...{ [unsafe]: true } });
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), []);
});
for (const suite of [false, true]) test('idle repair retains exact current identity while native order and index lag (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, mini: true, ids: [A, B, A, C, B], index: 2, lagging: true });
  await page.waitForFunction(() => uniqueFixture.entries.length === 3);
  assert.deepEqual(await ids(page), [B, A, C]); assert.equal(await page.evaluate(() => uniqueFixture.entries[uniqueFixture.index].playlistSetVideoId), 'set-2');
});
test('unique policy opt-out preserves the ordinary native Add to queue action (source)', async t => {
  const page = await open(t, { enabled: false }); await choose(page, B);
  await page.waitForFunction(() => uniqueFixture.entries.length === 4);
  assert.deepEqual(await ids(page), [A, B, C, B]);
});
for (const suite of [false, true]) for (const nextId of [null, '', 'TLPQfixture']) test('unresolved append reservation survives native panel/ID transitions (' + (suite ? 'Suite' : 'source') + ', ' + String(nextId) + ')', async t => {
  const page = await open(t, { suite, mini: true });
  await page.evaluate(() => { uniqueFixture.refuseAppend = true; }); await choose(page, D);
  await page.evaluate(nextId => { uniqueFixture.nativeListId = nextId; uniqueFixture.panel.remove(); }, nextId);
  await choose(page, D);
  await page.evaluate(() => { document.querySelector('ytd-miniplayer').append(uniqueFixture.panel); uniqueFixture.render(); });
  await choose(page, D);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]);
  await page.evaluate(() => { uniqueFixture.nativeListId = uniqueFixture.panelListId = 'TLPQreplacement'; uniqueFixture.render(); });
  await choose(page, D);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D, D], 'A different verified native queue has its own reservation context');
});
for (const suite of [false, true]) test('an ignored native removal times out once without unchanged-state idle retries (' + (suite ? 'Suite' : 'source') + ')', { timeout: 15000 }, async t => {
  const page = await open(t, { suite, ids: [A, B, B, C], ignoreRemoval: true });
  await page.waitForFunction(() => uniqueFixture.removals.length === 1);
  await page.waitForFunction(() => document.querySelector('[data-yt-master-queue-status]')?.textContent?.includes('not confirmed'), null, { timeout: 10000 });
  const frames = await page.evaluate(() => uniqueFixture.frames);
  await page.evaluate(() => { for (let i = 0; i < 20; i++) dispatchEvent(new Event('yt-playlist-data-updated')); });
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), ['set-2']);
  assert.ok(await page.evaluate(before => uniqueFixture.frames - before < 30, frames), 'Unchanged signals must not create a busy frame loop');
  assert.deepEqual(await ids(page), [A, B, B, C]); assert.equal(await page.evaluate(() => fixture.playerId), A);
});
for (const suite of [false, true]) for (const nativeOrder of ['missing', 'empty', 'invalid']) for (const mode of ['tail', 'next']) test('initial queue effects require independent native order (' + (suite ? 'Suite' : 'source') + ', ' + nativeOrder + ', ' + mode + ')', async t => {
  const page = await open(t, { suite, ids: [A, B, B, C], nativeOrder });
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), []);
  await choose(page, D, mode); assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
});
for (const suite of [false, true]) test('oversized native set IDs cannot trigger background duplicate removal (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, ids: [A, B, B], oversizedSet: true });
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), []);
});
for (const suite of [false, true]) test('duplicate removal waits for exact native row bindings before proceeding (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, ids: [A, B, B, C, C], delayedRemovalRows: true });
  await page.waitForFunction(() => uniqueFixture.removals.length === 1);
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), ['set-2']);
  await page.evaluate(() => uniqueFixture.finishRows());
  await page.waitForFunction(() => uniqueFixture.removals.length === 2);
  await page.evaluate(() => uniqueFixture.finishRows());
  await page.waitForFunction(() => document.querySelector('[data-yt-master-queue-status]')?.textContent === 'Removed duplicate queue entries');
  assert.deepEqual(await ids(page), [A, B, C]);
});
for (const suite of [false, true]) test('many duplicates make bounded progress through one native removal at a time (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, ids: [A, ...Array(25).fill(B), C] });
  await page.waitForFunction(() => uniqueFixture.entries.length === 3);
  assert.deepEqual(await ids(page), [A, B, C]);
  assert.equal(await page.evaluate(() => uniqueFixture.removals.length), 24);
  assert.equal(await page.evaluate(() => new Set(uniqueFixture.removals).size), 24);
  assert.ok(await page.evaluate(() => uniqueFixture.frames < 100));
});
for (const suite of [false, true]) test('a fresh equivalent native command replaces obsolete cached references (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite }); await choose(page, B);
  await page.waitForFunction(() => uniqueFixture.entries[2].videoId === 'bbbbbbbbbbb');
  await page.evaluate(() => {
    const f = uniqueFixture, popup = f.popup, data = popup.polymerController.data;
    const item = data.items.find(item => item.menuServiceItemRenderer.icon.iconType === 'ADD_TO_QUEUE_TAIL');
    item.menuServiceItemRenderer.serviceEndpoint = structuredClone(item.menuServiceItemRenderer.serviceEndpoint);
    f.entries = [f.entries[0], f.entries[2], f.entries[1]]; f.render();
    popup.polymerController.set('data', { items: [item] }); popup.style.display = 'block';
    popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true }));
  });
  await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).click();
  await page.waitForFunction(() => uniqueFixture.moves.length === 2);
  assert.deepEqual(await ids(page), [A, C, B]);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
});
for (const suite of [false, true]) for (const icon of ['QUEUE_PLAY_LAST', null]) test('a verified native queue command does not depend on its tail icon (' + (suite ? 'Suite' : 'source') + ', ' + String(icon) + ')', async t => {
  const page = await open(t, { suite }); await page.evaluate(icon => { uniqueFixture.iconOverride = icon; }, icon);
  await choose(page, B);
  await page.waitForFunction(() => uniqueFixture.entries[2].videoId === 'bbbbbbbbbbb');
  assert.deepEqual(await ids(page), [A, C, B]); assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
});
for (const suite of [false, true]) test('a deadline reports confirmed partial duplicate cleanup (' + (suite ? 'Suite' : 'source') + ')', { timeout: 15000 }, async t => {
  const page = await open(t, { suite, ids: [A, B, B, C, C], ignoreAfterFirst: true });
  await page.waitForFunction(() => uniqueFixture.removals.length === 2);
  await page.waitForFunction(() => document.querySelector('[data-yt-master-queue-status]')?.textContent?.startsWith('1 duplicate queue entry was removed.'), null, { timeout: 10000 });
  assert.deepEqual(await ids(page), [A, B, C, C]);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), ['set-2', 'set-4']);
});
for (const suite of [false, true]) for (const blocked of ['ad-showing', 'ad-interrupting', 'hidden', 'drag', 'players']) test('idle cleanup defers ' + blocked + ' until a verified native update (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, ids: [A, B, B], blocked });
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), []);
  if (blocked !== 'hidden') { await choose(page, D); assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []); }
  await page.evaluate(() => {
    const f = uniqueFixture; f.hidden = false; f.dragging = false;
    document.getElementById('movie_player').classList.remove('ad-showing', 'ad-interrupting');
    document.querySelector('[data-ambiguous-player]')?.remove(); dispatchEvent(new Event('yt-playlist-data-updated'));
  });
  await page.waitForFunction(() => uniqueFixture.entries.length === 2);
  assert.deepEqual(await ids(page), [A, B]); assert.deepEqual(await page.evaluate(() => uniqueFixture.mediaCalls), []);
});
for (const suite of [false, true]) test('native Add preserves creation metadata and playback with distinct identical-looking videos (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite }); await choose(page, D);
  await page.waitForFunction(() => uniqueFixture.entries.length === 4);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.commands[0]), await page.evaluate(() => uniqueFixture.originalCommand));
  assert.deepEqual(await ids(page), [A, B, C, D]);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.removals), []);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.mediaCalls), []);
});
for (const suite of [false, true]) test('same native queue replacement player cannot bypass an unresolved append reservation (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite }); await page.evaluate(() => { uniqueFixture.refuseAppend = true; }); await choose(page, D);
  await page.evaluate(() => {
    const player = document.getElementById('movie_player'), replacement = player.cloneNode(true);
    for (const method of ['getVideoData', 'getPlaylistId', 'getPlaylist', 'getPlaylistIndex']) replacement[method] = player[method];
    player.replaceWith(replacement);
  });
  await choose(page, D);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]);
});
for (const suite of [false, true]) test('first reorder waits if native order becomes unavailable during ordinary menu close (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite }); await page.evaluate(() => { uniqueFixture.emptyOnClose = true; }); await choose(page, B);
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.moves), []);
  await page.evaluate(() => { uniqueFixture.nativeOrder = undefined; dispatchEvent(new Event('yt-playlist-data-updated')); });
  await page.waitForFunction(() => uniqueFixture.moves.length === 1);
  assert.deepEqual(await ids(page), [A, C, B]);
});
for (const suite of [false, true]) test('an accepted explicit queue action can finish while its document is hidden (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, appendDelay: 200 }); await choose(page, D, 'next');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  await page.waitForFunction(() => uniqueFixture.entries[1].videoId === 'ddddddddddd');
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]); assert.deepEqual(await page.evaluate(() => uniqueFixture.mediaCalls), []);
});
for (const suite of [false, true]) test('moving an earlier entry to the tail preserves the playing set ID across its numeric index shift (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, index: 1 }); await choose(page, A);
  await page.waitForFunction(() => uniqueFixture.entries[2].videoId === 'aaaaaaaaaaa');
  assert.deepEqual(await ids(page), [B, C, A]);
  assert.deepEqual(await page.evaluate(() => ({ index: uniqueFixture.index, setId: uniqueFixture.entries[uniqueFixture.index].playlistSetVideoId, playing: fixture.playerId, media: uniqueFixture.mediaCalls })), {
    index: 0, setId: 'set-1', playing: B, media: [],
  });
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), []);
});
for (const suite of [false, true]) for (const [target, mode] of [[C, 'tail'], [B, 'next'], [A, 'tail'], [A, 'next']]) test('an already correct/current queue target has no unnecessary native effect (' + (suite ? 'Suite' : 'source') + ', ' + target + ', ' + mode + ')', async t => {
  const page = await open(t, { suite }); await choose(page, target, mode);
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
  assert.deepEqual(await ids(page), [A, B, C]);
  assert.deepEqual(await page.evaluate(() => ({ adds: uniqueFixture.adds, removals: uniqueFixture.removals, moves: uniqueFixture.moves, media: uniqueFixture.mediaCalls })), {
    adds: [], removals: [], moves: [], media: [],
  });
});
for (const suite of [false, true]) for (const mode of ['tail', 'next']) test('a genuine standalone video can create its native queue once (' + (suite ? 'Suite' : 'source') + ', ' + mode + ')', async t => {
  const page = await open(t, { suite, noQueue: true }); await choose(page, D, mode);
  await page.waitForFunction(() => uniqueFixture.entries.length === 2);
  assert.deepEqual(await ids(page), [A, D]); assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]);
  assert.equal(await page.evaluate(() => fixture.playerId), A); assert.deepEqual(await page.evaluate(() => uniqueFixture.mediaCalls), []);
});
for (const suite of [false, true]) test('an uncertain queue creation cannot retry when its native ID first becomes readable (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, noQueue: true }); await page.evaluate(() => { uniqueFixture.refuseAppend = true; }); await choose(page, D);
  await page.evaluate(() => {
    const f = uniqueFixture; f.noQueue = false; f.nativeListId = f.panelListId = 'TLPQcreated';
    document.querySelector('#secondary').append(f.panel); f.render();
  });
  await choose(page, D); await choose(page, D);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]);
});
for (const suite of [false, true]) test('an ambiguous creation before any visible player cannot append the same video twice (' + (suite ? 'Suite' : 'source') + ')', async t => {
  const page = await open(t, { suite, noQueue: true, noPlayer: true }); await page.evaluate(() => { uniqueFixture.refuseAppend = true; });
  await choose(page, D); await choose(page, D);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]);
  await page.evaluate(() => {
    const f = uniqueFixture; f.noQueue = false; f.nativeListId = f.panelListId = 'TLPQcreated';
    document.getElementById('movie_player').style.display = ''; document.querySelector('#secondary').append(f.panel); f.render();
  });
  await choose(page, D); await choose(page, D);
  assert.deepEqual(await page.evaluate(() => uniqueFixture.adds), [D]);
});
