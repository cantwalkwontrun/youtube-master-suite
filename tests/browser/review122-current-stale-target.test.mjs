// Language: en-GB. Current native menu transitional identity regressions.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installCurrentQueueMenu } from '../../sources/current-queue-menu.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
const CURRENT = 'bbbbbbbbbbb', PREVIOUS = 'aaaaaaaaaaa';
async function open(t, endpoint, compiled = false) {
  const context = await browser.newContext({ serviceWorkers: 'block' }); t.after(() => context.close());
  await context.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({ contentType:'text/html', body:'<!doctype html><html lang="en-GB"><style>ytd-miniplayer,ytd-playlist-panel-renderer,ytd-playlist-panel-video-renderer{display:block;width:400px;min-height:72px}#movie_player{width:400px;height:225px}</style><body><ytd-miniplayer><div id="movie_player"></div><ytd-playlist-panel-renderer></ytd-playlist-panel-renderer></ytd-miniplayer></body></html>' }) : route.abort());
  const page = await context.newPage(); await page.goto('https://www.youtube.com/');
  await page.evaluate(({ endpoint, current }) => {
    const panel=document.querySelector('ytd-playlist-panel-renderer'), player=document.querySelector('#movie_player');
    const model={items:[{menuServiceItemRenderer:{text:{simpleText:'Native action'},icon:{iconType:'WATCH_LATER'},serviceEndpoint:endpoint}}]};
    const entries=[{videoId:current,playlistSetVideoId:'set0',selected:true,menu:{menuRenderer:model}},{videoId:'ccccccccccc',playlistSetVideoId:'set1',selected:false}];
    panel.data={playlistId:'TLPQfixture',currentIndex:0,contents:entries.map(playlistPanelVideoRenderer=>({playlistPanelVideoRenderer}))};
    for(const data of entries){const row=document.createElement('ytd-playlist-panel-video-renderer');row.data=data;row.toggleAttribute('selected',data.selected);panel.append(row);}
    player.getVideoData=()=>({video_id:current});player.getPlaylistId=()=>panel.data.playlistId;player.getPlaylist=()=>entries.map(item=>item.videoId);player.getPlaylistIndex=()=>0;
    customElements.define('ytd-menu-renderer',class extends HTMLElement{set data(value){this._data=value;this.replaceChildren();const button=document.createElement('button');button.textContent='More actions';button.addEventListener('click',()=>window.opened=value.items[0].menuServiceItemRenderer.serviceEndpoint);this.append(button);}get data(){return this._data;}});
    localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{currentQueueMenu:true,theatreMode:false,miniplayerEnabled:false}}));
    window.fixture={panel,model};
  }, {endpoint,current:CURRENT});
  if (compiled) {
    await page.addScriptTag({content:readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8')});
    const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
    await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
  } else await page.evaluate(installer => { window.dispose=(0,eval)('('+installer+')')({document,window});
  }, installCurrentQueueMenu.toString());
  await settle(page); return page;
}
async function settle(page) { await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);}); }
const add = id => ({playlistEditEndpoint:{playlistId:'WL',actions:[{action:'ACTION_ADD_VIDEO',addedVideoId:id}]}});
const remove = (setVideoId,playlistId='TLPQfixture') => ({playlistEditEndpoint:{playlistId,actions:[{action:'ACTION_REMOVE_VIDEO',setVideoId}]}});
for (const compiled of [false,true]) for (const [name,endpoint] of [
 ['Watch Later previous video',add(PREVIOUS)],
 ['Watch Later previous removal',{playlistEditEndpoint:{playlistId:'WL',actions:[{action:'ACTION_REMOVE_VIDEO_BY_VIDEO_ID',removedVideoId:PREVIOUS}]}}],
 ['Save to playlist previous video',{addToPlaylistServiceEndpoint:{videoId:PREVIOUS}}],
 ['Save to playlist previous video array',{addToPlaylistServiceEndpoint:{videoIds:[PREVIOUS]}}],
 ['Remove previous entry',remove('set1')],
 ['Move previous entry',{playlistEditEndpoint:{playlistId:'TLPQfixture',actions:[{action:'ACTION_MOVE_VIDEO_AFTER',setVideoId:'set1',movedSetVideoIdPredecessor:'set0'}]}}],
 ['Remove from previous playlist',remove('set0','TLPQprevious')],
]) test(`recycled current entry rejects ${name} (${compiled ? 'Suite' : 'source'})`,async t=>{
 const page=await open(t,endpoint,compiled);
 assert.equal(await page.locator('[data-ytms-current-queue-menu]').count(),0,'Previous-item native endpoint must remain unavailable');
 assert.equal(await page.evaluate(()=>window.opened),undefined);
});
for (const compiled of [false,true]) for (const [name,endpoint] of [
 ['Watch Later current video',add(CURRENT)],
 ['Watch Later current removal',{playlistEditEndpoint:{playlistId:'WL',actions:[{action:'ACTION_REMOVE_VIDEO_BY_VIDEO_ID',removedVideoId:CURRENT}]}}],
 ['Save to playlist current video',{addToPlaylistServiceEndpoint:{videoId:CURRENT}}],
 ['Save to playlist current video array',{addToPlaylistServiceEndpoint:{videoIds:[CURRENT]}}],
 ['Remove current entry',remove('set0')],
 ['Move current entry',{playlistEditEndpoint:{playlistId:'TLPQfixture',actions:[{action:'ACTION_MOVE_VIDEO_AFTER',setVideoId:'set0',movedSetVideoIdPredecessor:'set1'}]}}],
 ['untargeted native action',{signalServiceEndpoint:{signal:'CLIENT_SIGNAL',actions:[{showFeedbackEndpoint:{}}]}}],
]) test(`verified ${name} remains native and usable (${compiled ? 'Suite' : 'source'})`,async t=>{
 const page=await open(t,endpoint,compiled);await page.locator('[selected] ytd-menu-renderer button').click();
 assert.deepEqual(await page.evaluate(()=>window.opened),endpoint);
});
for (const compiled of [false,true]) test(`matching stale row and panel endpoints are rejected at activation before a repaint (${compiled ? 'Suite' : 'source'})`,async t=>{
 const page=await open(t,add(CURRENT),compiled);
 await page.evaluate(previous=>{
  window.requestAnimationFrame=()=>0;
  const stale=structuredClone(fixture.model);stale.items[0].menuServiceItemRenderer.serviceEndpoint.playlistEditEndpoint.actions[0].addedVideoId=previous;
  fixture.panel.data.contents[0].playlistPanelVideoRenderer.menu.menuRenderer=stale;
  document.querySelector('[selected] ytd-menu-renderer').data=stale;
 },PREVIOUS);
 await page.locator('[selected] ytd-menu-renderer button').click({force:true});
 assert.equal(await page.evaluate(()=>window.opened),undefined);
 assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(),0);
});
