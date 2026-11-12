// Language: en-GB. Synthetic native menu contract; never contacts a signed-in session.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installCurrentQueueMenu } from '../../sources/current-queue-menu.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
const HTML = `<!doctype html><html lang="en-GB"><style>
ytd-app,ytd-miniplayer,ytd-playlist-panel-renderer{display:block;width:500px}
ytd-playlist-panel-video-renderer{display:block;box-sizing:border-box;height:72px;width:500px}
#movie_player{width:400px;height:225px} video{width:400px;height:225px}
ytd-menu-renderer{display:block} [selected] ytd-menu-renderer{display:none}
tp-yt-iron-dropdown,ytd-menu-popup-renderer,ytd-menu-service-item-renderer{display:block} [hidden]{display:none!important}
</style><body><ytd-app><ytd-miniplayer><div id="movie_player"><video></video></div>
<ytd-playlist-panel-renderer></ytd-playlist-panel-renderer></ytd-miniplayer><ytd-popup-container><tp-yt-iron-dropdown hidden></tp-yt-iron-dropdown></ytd-popup-container></ytd-app></body></html>`;
async function open(t, { suite = false, enabled = true, existing = false, define = true, fault = '', nativeSyntheticKey = false, modelVariant = '' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: HTML }) : route.abort());
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(5000); page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(modelVariant.startsWith('diagnostic') ? 'https://www.youtube.com/watch?v=aaaaaaaaaaa' : 'https://www.youtube.com/');
  await page.evaluate(({ enabled, existing, define, fault, nativeSyntheticKey, modelVariant, suite }) => {
    const panel = document.querySelector('ytd-playlist-panel-renderer'), player = document.querySelector('#movie_player');
    window.f = { panel, player, calls: [], rows: [], extraNext: 0, media: 0 };
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { currentQueueMenu: enabled, theatreMode: false, miniplayerEnabled: suite && modelVariant==='diagnostic-floating' } }));
    function menu(id) { return { menuRenderer: { items: [
      { menuServiceItemRenderer: { text: { simpleText: 'Save to Watch Later' }, icon: { iconType: 'WATCH_LATER' }, serviceEndpoint: { fixtureAction: 'watchLater', videoId: id } } },
      { menuServiceItemRenderer: { text: { simpleText: 'Save to playlist' }, icon: { iconType: 'PLAYLIST_ADD' }, serviceEndpoint: { fixtureAction: 'savePlaylist', videoId: id } } },
      { menuServiceItemRenderer: { text: { simpleText: 'Remove from playlist' }, icon: { iconType: 'REMOVE' }, serviceEndpoint: { fixtureAction: 'remove', videoId: id } } },
    ] } }; }
    const entries = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'].map((videoId, i) => ({ videoId, playlistSetVideoId: 'set' + i, selected: i === 0, menu: menu(videoId) }));
    panel.data = { playlistId: 'TLPQfixture', currentIndex: 0, contents: entries.map(playlistPanelVideoRenderer => ({ playlistPanelVideoRenderer })) };
    function stamp() {
      panel.replaceChildren(); f.rows = [];
      for (const data of panel.data.contents.map(item => item.playlistPanelVideoRenderer)) {
        const row = document.createElement('ytd-playlist-panel-video-renderer'); row.data = data; row.toggleAttribute('selected', !!data.selected);
        const meta = document.createElement('div'); meta.id = 'meta'; meta.textContent = data.videoId; row.append(meta); panel.append(row); f.rows.push(row);
        const link = document.createElement('a'); link.href = '/watch?v=' + data.videoId; link.textContent = 'Video'; meta.append(link);
      }
    }
    stamp(); f.stamp = stamp;
    const playerModel = panel.data;
    player.getVideoData = () => ({ video_id: f.playingId || playerModel.contents[playerModel.currentIndex ?? 0].playlistPanelVideoRenderer.videoId });
    player.getPlaylistId = () => f.listId || playerModel.playlistId;
    player.getPlaylist = () => f.ids || playerModel.contents.map(item => item.playlistPanelVideoRenderer.videoId);
    player.getPlaylistIndex = () => playerModel.currentIndex;
    player.nextVideo = () => { f.extraNext++; };
    for (const method of ['play', 'pause', 'load']) player.querySelector('video')[method] = () => { f.media++; };
    f.defineNativeMenu = () => customElements.define('ytd-menu-renderer', class extends HTMLElement {
      set data(value) { if (fault === 'setter') throw new Error('Unavailable native setter'); if (fault === 'noop') return; this._data = value; this.replaceChildren(); const button = document.createElement('button'); button.textContent = 'More actions'; button.setAttribute('aria-haspopup', 'menu');
        if (nativeSyntheticKey) button.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); button.click(); } });
        button.addEventListener('click', () => {
          document.querySelector('#native-popup')?.remove(); const popup = document.createElement('ytd-menu-popup-renderer'); popup.id = 'native-popup'; popup.data = value;
          for (const item of value.items) { const record = item.menuServiceItemRenderer; const row = document.createElement('ytd-menu-service-item-renderer'); row.data = record; row.setAttribute('role', 'menuitem'); const action = document.createElement('button'); action.textContent = record.text.simpleText; row.append(action);
            action.addEventListener('click', () => { f.calls.push(record.serviceEndpoint); popup.remove();
              if (record.serviceEndpoint.fixtureAction === 'remove' || record.serviceEndpoint.playlistEditEndpoint?.actions?.[0]?.action === 'ACTION_REMOVE_VIDEO') { const i = panel.data.currentIndex; panel.data.contents.splice(i, 1); panel.data.currentIndex = Math.min(i, panel.data.contents.length - 1);
                panel.data.contents.forEach((entry, n) => { entry.playlistPanelVideoRenderer.selected = n === panel.data.currentIndex; }); stamp(); window.dispatchEvent(new Event('yt-playlist-data-updated')); }
            }); popup.append(row); }
          const dropdown = document.querySelector('tp-yt-iron-dropdown'); dropdown.hidden = false;
          dropdown.close = () => { dropdown.hidden = true; dropdown.dispatchEvent(new CustomEvent('iron-overlay-closed', { bubbles: true })); };
          dropdown.append(popup); popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true }));
        }); this.append(button);
      }
      get data() { return this._data; }
    });
    if (define) f.defineNativeMenu();
    if (existing) { const native = document.createElement('ytd-menu-renderer'); native.id = 'menu'; native.data = entries[0].menu.menuRenderer; f.rows[0].append(native); f.nativeMenu = native; }
    if (fault === 'player') f.playingId = 'ddddddddddd';
    if (fault === 'list') f.listId = 'wrong';
    if (fault === 'order') f.ids = ['aaaaaaaaaaa', 'ccccccccccc', 'bbbbbbbbbbb'];
    if (fault === 'row') f.rows[0].data = { ...entries[0], playlistSetVideoId: 'recycled' };
    if (fault === 'selection') f.rows[1].data.selected = true;
    if (fault === 'menu') delete entries[0].menu;
    if (fault === 'hidden') panel.closest('ytd-miniplayer').style.opacity = '0';
    if (fault === 'conflict') f.rows[0].data = { ...entries[0], menu: menu('ddddddddddd') };
    if (fault === 'controller') Object.defineProperty(customElements.get('ytd-menu-renderer').prototype, 'polymerController', { get() { throw new Error('Unavailable native controller'); } });
    if (modelVariant === 'component') for (const node of [panel, ...f.rows]) { const model = node.data; delete node.data; node.componentProps = { data: () => model }; }
    if (modelVariant === 'row-component-conflict') { const model = f.rows[0].data; f.rows[0].componentProps = { data: () => model }; f.rows[0].data = { ...model, playlistSetVideoId: 'retained' }; }
    if (modelVariant === 'panel-component-conflict') { const model = panel.data; panel.componentProps = { data: () => model }; panel.data = { ...model, playlistId: 'retained' }; }
    if (modelVariant === 'missing-index') { delete panel.data.currentIndex; player.getPlaylistIndex = () => 0; }
    if (modelVariant === 'undefined-player-index') player.getPlaylistIndex = () => undefined;
    if (modelVariant === 'missing-player-list') player.getPlaylistId = () => '';
    if (modelVariant === 'invalid-index') panel.data.currentIndex = undefined;
    if (modelVariant.startsWith('diagnostic')) {
      panel.data.contents = panel.data.contents.slice(0,2);
      for (const wrapped of panel.data.contents) {
        const entry = wrapped.playlistPanelVideoRenderer;
        entry.menu = { menuRenderer:{ items:[
          {menuServiceItemRenderer:{text:{simpleText:'Watch later'},icon:{iconType:'WATCH_LATER'},serviceEndpoint:{clickTrackingParams:'DONOR_TRACKING',playlistEditEndpoint:{playlistId:'WL',actions:[{action:'ACTION_ADD_VIDEO',addedVideoId:entry.videoId}]}}}},
          {menuServiceItemRenderer:{text:{simpleText:'Save to playlist'},icon:{iconType:'PLAYLIST_ADD'},serviceEndpoint:{addToPlaylistServiceEndpoint:{videoId:entry.videoId}}}},
          {menuServiceItemRenderer:{text:{simpleText:'Remove from playlist'},icon:{iconType:'REMOVE'},serviceEndpoint:{playlistEditEndpoint:{playlistId:panel.data.playlistId,actions:[{action:'ACTION_REMOVE_VIDEO',setVideoId:entry.playlistSetVideoId}]}}}},
        ]} };
      }
      if(modelVariant==='diagnostic-duplicate-set'){
        const target=panel.data.contents[0].playlistPanelVideoRenderer,other=panel.data.contents[1].playlistPanelVideoRenderer;
        other.playlistSetVideoId=target.playlistSetVideoId;other.menu.menuRenderer.items[2].menuServiceItemRenderer.serviceEndpoint.playlistEditEndpoint.actions[0].setVideoId=target.playlistSetVideoId;
      }
      delete panel.data.contents[0].playlistPanelVideoRenderer.menu; stamp();
      player.getPlaylistId=()=>'';
      const mini=panel.closest('ytd-miniplayer'),watch=document.createElement('ytd-watch-flexy');watch.style.cssText='display:block;width:500px';
      mini.replaceWith(watch);watch.append(...mini.childNodes);
      if(modelVariant==='diagnostic-floating'){
        if(suite){
          const anchor=document.createElement('div');anchor.id='single-column-container';const host=document.createElement('div');host.id='player';host.style.cssText='width:400px;height:225px';anchor.append(host);host.append(player);watch.prepend(anchor);
          watch.style.cssText='display:block;position:absolute;top:-600px;left:0;width:500px';panel.style.cssText='position:fixed;top:260px;left:0';
        } else {
          const placeholder=document.createElement('div');placeholder.id='ytsmp-player-placeholder';placeholder.style.cssText='width:400px;height:225px';watch.prepend(placeholder);
          document.body.append(player);document.body.classList.add('ytsmp-scroll-miniplayer-active');
        }
      }
    }
  }, { enabled, existing, define, fault, nativeSyntheticKey, modelVariant, suite });
  if (suite) {
    await page.addScriptTag({ content: readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8') });
    const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
    await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
  } else await page.evaluate(({ installer, enabled }) => { window.disposeMenu = (0, eval)('(' + installer + ')')({ document, window, preferences: { currentQueueMenu: enabled } }); }, { installer: installCurrentQueueMenu.toString(), enabled });
  await page.evaluate(async () => { for (let n = 0; n < 4; n++) await new Promise(requestAnimationFrame); });
  return page;
}
for (const suite of [false, true]) for (const existing of [false, true]) test(`playing row uses its own native menu and native removal advances exactly once (${suite ? 'Suite' : 'source'}, existing ${existing})`, async t => {
  const page = await open(t, { suite, existing });
  const button = page.locator('[selected] ytd-menu-renderer button');
  await button.waitFor({ state: 'visible' }); assert.equal(await button.count(), 1);
  await button.click();
  if (suite) await page.locator('#native-popup [data-ytms-menu-action="channelTools"]').waitFor();
  await page.locator('#native-popup button').filter({ hasText: 'Remove from playlist' }).click();
  await page.waitForFunction(() => f.calls.length === 1 && f.rows[0].data.videoId === 'bbbbbbbbbbb');
  assert.deepEqual(await page.evaluate(() => ({ calls: f.calls.map(item => item.fixtureAction), playing: f.player.getVideoData().video_id, extra: f.extraNext, media: f.media })), { calls: ['remove'], playing: 'bbbbbbbbbbb', extra: 0, media: 0 });
  await page.locator('[selected] ytd-menu-renderer button').waitFor({ state: 'visible' });
  await page.locator('[selected] ytd-menu-renderer button').click(); await page.locator('#native-popup button').filter({ hasText: 'Save to Watch Later' }).click();
  assert.equal(await page.evaluate(() => f.calls[1].videoId), 'bbbbbbbbbbb');
});
test('fallback omits removal when playlist-set identity is duplicated',async t=>{
 const page=await open(t,{modelVariant:'diagnostic-duplicate-set'});
 const button=page.locator('[selected] ytd-menu-renderer button');await button.waitFor({state:'visible'});
 const endpoints=await button.evaluate(node=>node.closest('ytd-menu-renderer').data.items.map(item=>item.menuServiceItemRenderer.serviceEndpoint));
 assert.equal(endpoints.length,2);assert.equal(endpoints.some(endpoint=>endpoint.playlistEditEndpoint?.actions?.some(action=>action.action==='ACTION_REMOVE_VIDEO')),false);
});
test('menu-less fallback refuses a different watch owner even with the same queue order',async t=>{
 const page=await open(t,{modelVariant:'diagnostic'});
 await page.evaluate(()=>{
  const other=document.createElement('ytd-watch-flexy');other.style.cssText='display:block;width:500px';document.body.append(other);other.append(f.player);
 });
 await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(),0);
 assert.deepEqual(await page.evaluate(()=>f.calls),[]);
});
for (const suite of [false,true]) for (const modelVariant of ['diagnostic','diagnostic-floating']) test(`reported menu-less current row gets correctly targeted native actions (${suite?'Suite':'source'}, ${modelVariant})`,async t=>{
 const page=await open(t,{suite,modelVariant});
 const button=page.locator('[selected] ytd-menu-renderer button');await button.waitFor({state:'visible'});
 const endpoints=await button.evaluate(button=>button.closest('ytd-menu-renderer').data.items.map(item=>item.menuServiceItemRenderer.serviceEndpoint));
 assert.equal(JSON.stringify(endpoints).includes('bbbbbbbbbbb'),false);assert.equal(JSON.stringify(endpoints).includes('DONOR_TRACKING'),false);
 assert.equal(endpoints[0].playlistEditEndpoint.actions[0].addedVideoId,'aaaaaaaaaaa');
 assert.equal(endpoints[1].addToPlaylistServiceEndpoint.videoId,'aaaaaaaaaaa');
 assert.equal(endpoints[2].playlistEditEndpoint.actions[0].setVideoId,'set0');
 await button.click();await page.locator('#native-popup button').filter({hasText:'Remove from playlist'}).click();
 await page.waitForFunction(()=>f.calls.length===1&&f.rows[0].data.videoId==='bbbbbbbbbbb');
 assert.equal(await page.evaluate(()=>f.extraNext+f.media),0);
});
for (const fault of ['player', 'list', 'order', 'row', 'selection', 'menu', 'hidden', 'conflict', 'setter', 'controller', 'noop']) test(`unverified ${fault} ownership leaves the current row untouched`, async t => {
  const page = await open(t, { fault }); assert.equal(await page.locator('[data-ytms-current-queue-menu]').count(), 0);
  assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(), 0);
  assert.equal(await page.evaluate(() => f.calls.length + f.media + f.extraNext), 0);
});
test('disabled preference and unavailable native component add no replacement', async t => {
  for (const options of [{ enabled: false }, { define: false }]) { const page = await open(t, options); assert.equal(await page.locator('[data-ytms-current-queue-menu]').count(), 0); }
});
for (const change of ['row', 'player', 'menu']) test(`activation rejects a ${change} changed without a native update event`, async t => {
  const page = await open(t);
  await page.evaluate(change => { if (change === 'row') f.rows[0].data = { ...f.rows[0].data, playlistSetVideoId: 'stale' }; if (change === 'player') f.playingId = 'bbbbbbbbbbb'; if (change === 'menu') f.rows[0].data.menu.menuRenderer.items[0].menuServiceItemRenderer.text.simpleText = 'Recycled'; }, change);
  await page.locator('[selected] ytd-menu-renderer button').click();
  assert.equal(await page.locator('#native-popup').count(), 0); assert.deepEqual(await page.evaluate(() => f.calls), []);
});
test('navigation, BFCache and disposal remove only owned controls and restore an existing native menu', async t => {
  const page = await open(t, { existing: true });
  await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-start')));
  assert.equal(await page.locator('[data-ytms-current-queue-menu]').count(), 0); assert.equal(await page.evaluate(() => f.nativeMenu.isConnected), true);
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); });
  await page.locator('[selected] ytd-menu-renderer button').waitFor({ state: 'visible' });
  await page.evaluate(() => disposeMenu());
  assert.equal(await page.locator('[data-ytms-current-queue-menu]').count(), 0); assert.equal(await page.evaluate(() => f.nativeMenu.isConnected), true);
});
test('ordinary caption and feed updates cause no queue layout reads', async t => {
  const page = await open(t);
  const reads = await page.evaluate(async () => {
    const caption = document.createElement('div'), feed = document.createElement('div');
    f.player.append(caption); document.querySelector('ytd-app').append(feed);
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    let count = 0; const rect = f.panel.getBoundingClientRect.bind(f.panel); f.panel.getBoundingClientRect = () => { count++; return rect(); };
    for (let i = 0; i < 2000; i++) { caption.textContent = String(i); feed.append(document.createElement('div')); }
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    return count;
  });
  assert.equal(reads, 0);
});

for (const suite of [false, true]) test(`a repurposed native host cannot open a different menu under an unchanged queue row (${suite ? 'Suite' : 'source'})`, async t => {
  const page = await open(t, { suite, existing: true });
  await page.evaluate(() => {
    // Exercise activation before scheduled reconciliation can hide the host.
    // Native restamping and the user click can happen within the same frame.
    f.savedAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    const model = structuredClone(f.nativeMenu.data);
    for (const item of model.items) item.menuServiceItemRenderer.serviceEndpoint.videoId = 'ddddddddddd';
    f.nativeMenu.data = model;
  });
  // The native component restamps its button, but the current row/panel model
  // still names the old command. Revalidation must include the host itself.
  await page.locator('[selected] ytd-menu-renderer button').click({ force: true });
  await page.evaluate(() => { window.requestAnimationFrame = f.savedAnimationFrame; });
  assert.equal(await page.locator('#native-popup').count(), 0);
  assert.deepEqual(await page.evaluate(() => f.calls), []);
});

for (const suite of [false, true]) for (const fault of ['setter', 'noop']) test(`a refusing native setter stays idle after its first failed attempt (${suite ? 'Suite' : 'source'}, ${fault})`, async t => {
  const page = await open(t, { suite, fault });
  const attempts = await page.evaluate(async () => {
    let count = 0;
    const create = document.createElement.bind(document);
    document.createElement = function (name, ...args) {
      if (name === 'ytd-menu-renderer') count++;
      return create(name, ...args);
    };
    for (let n = 0; n < 8; n++) await new Promise(requestAnimationFrame);
    return count;
  });
  assert.equal(attempts, 0);
  assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(), 0);
});
test('an attribute-only native miniplayer reveal discovers the playing menu', async t => {
  const page = await open(t, { fault: 'hidden' });
  assert.equal(await page.locator('[data-ytms-current-queue-menu]').count(), 0);
  await page.evaluate(() => document.querySelector('ytd-miniplayer').style.opacity = '1');
  await page.locator('[selected] ytd-menu-renderer button').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[selected] ytd-menu-renderer button').count(), 1);
});
for (const suite of [false, true]) test(`native keyboard synthesis opens the current menu (${suite ? 'Suite' : 'source'})`, async t => {
  const page = await open(t, { suite, nativeSyntheticKey: true });
  await page.locator('[selected] ytd-menu-renderer button').focus(); await page.keyboard.press('Enter');
  await page.locator('#native-popup').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => f.calls.length), 0);
});

for (const suite of [false, true]) for (const existing of [false, true]) test(`moving the same playing row and player to a replacement panel keeps the first menu activation working (${suite ? 'Suite' : 'source'}, existing ${existing})`, async t => {
  const page = await open(t, { suite, existing });
  await page.evaluate(async () => {
    const oldPanel = f.panel;
    const replacement = document.createElement('ytd-playlist-panel-renderer');
    replacement.data = oldPanel.data;
    document.querySelector('ytd-app').append(f.player, replacement);
    replacement.append(...oldPanel.childNodes);
    f.panel = replacement;
    for (let n = 0; n < 4; n++) await new Promise(requestAnimationFrame);
  });
  await page.locator('[selected] ytd-menu-renderer button').click();
  assert.equal(await page.locator('#native-popup').count(), 1);
  assert.deepEqual(await page.evaluate(() => f.calls), []);
  assert.equal(await page.evaluate(() => f.media + f.extraNext), 0);
});

for (const suite of [false, true]) for (const modelVariant of ['component', 'missing-index', 'undefined-player-index', 'missing-player-list']) test(`current native ${modelVariant} bindings expose the verified playing row menu (${suite ? 'Suite' : 'source'})`, async t => {
  const page = await open(t, { suite, modelVariant });
  assert.equal(await page.locator('[selected] ytd-menu-renderer button').count(), 1);
  await page.locator('[selected] ytd-menu-renderer button').click();
  assert.equal(await page.locator('#native-popup').count(), 1);
  assert.deepEqual(await page.evaluate(() => f.calls), []);
});

test('an explicitly invalid panel index is not replaced by a guessed selected index', async t => {
  const page = await open(t, { modelVariant: 'invalid-index' });
  assert.equal(await page.locator('[selected] ytd-menu-renderer button').count(), 0);
});

for (const suite of [false, true]) test(`late native custom element registration discovers the playing menu without a DOM or navigation event (${suite ? 'Suite' : 'source'})`, async t => {
  const page = await open(t, { suite, define: false });
  assert.equal(await page.locator('[selected] ytd-menu-renderer button').count(), 0);
  await page.evaluate(async () => { f.defineNativeMenu(); for (let n = 0; n < 4; n++) await new Promise(requestAnimationFrame); });
  assert.equal(await page.locator('[selected] ytd-menu-renderer button').count(), 1);
});

for (const suite of [false, true]) test(`a native host adopted and rebound by another queue row is preserved (${suite ? 'Suite' : 'source'})`, async t => {
  const page = await open(t, { suite });
  const preserved = await page.evaluate(async () => {
    const adopted = f.rows[0].querySelector('ytd-menu-renderer');
    adopted.data = f.rows[1].data.menu.menuRenderer;
    f.rows[1].append(adopted);
    for (let n = 0; n < 4; n++) await new Promise(requestAnimationFrame);
    return { connected: adopted.isConnected, sameRow: adopted.closest('ytd-playlist-panel-video-renderer') === f.rows[1],
      marked: adopted.hasAttribute('data-ytms-current-queue-menu'), owned: adopted.hasAttribute('data-ytms-current-queue-menu-owned') };
  });
  assert.deepEqual(preserved, { connected: true, sameRow: true, marked: false, owned: false });
  await page.locator('ytd-playlist-panel-video-renderer').nth(1).locator('ytd-menu-renderer button').click();
  await page.locator('#native-popup button').filter({ hasText: 'Save to Watch Later' }).click();
  assert.equal(await page.evaluate(() => f.calls[0].videoId), 'bbbbbbbbbbb');
});

for (const suite of [false, true]) test(`contradictory current and legacy native host models cannot open a stale command (${suite ? 'Suite' : 'source'})`, async t => {
  const page = await open(t, { suite, existing: true });
  await page.evaluate(() => {
    f.savedAnimationFrame = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    const original = f.nativeMenu.data, replacement = structuredClone(original);
    for (const item of replacement.items) item.menuServiceItemRenderer.serviceEndpoint.videoId = 'ddddddddddd';
    f.nativeMenu.componentProps = { data: () => original }; f.nativeMenu.data = replacement;
  });
  await page.locator('[selected] ytd-menu-renderer button').click({ force: true });
  await page.evaluate(() => { window.requestAnimationFrame = f.savedAnimationFrame; });
  assert.equal(await page.locator('#native-popup').count(), 0);
});

for (const modelVariant of ['row-component-conflict', 'panel-component-conflict']) test(`contradictory ${modelVariant} identities leave the queue native`, async t => {
  const page = await open(t, { modelVariant });
  assert.equal(await page.locator('[selected] ytd-menu-renderer button').count(), 0);
});

for (const suite of [false,true]) for (const [start,finish] of [['yt-navigate-start','yt-navigate-finish'],['pagehide','pageshow']]) test(`native current menu activation cancels an interrupted API read (${suite?'Suite':'source'}, ${start})`,async t=>{
  const page=await open(t,{suite,existing:true});
  await page.evaluate(({start,finish})=>{
    const ids=f.player.getPlaylist();let interrupted=false;
    f.player.getPlaylist=()=>{
      if(!interrupted){interrupted=true;dispatchEvent(new Event(start));dispatchEvent(new Event(finish));}
      return ids;
    };
  },{start,finish});
  await page.locator('[selected] ytd-menu-renderer button').click();
  assert.equal(await page.locator('#native-popup').count(),0,'a native host must not open under an invalidated activation pass');
  assert.deepEqual(await page.evaluate(()=>f.calls),[]);
  await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
  await page.locator('[selected] ytd-menu-renderer button').click();
  assert.equal(await page.locator('#native-popup').count(),1,'a fresh activation after restoration still opens the native menu');
});
