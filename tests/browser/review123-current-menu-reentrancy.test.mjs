// Language: en-GB. Synthetic native component reentrancy; no signed-in session.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installCurrentQueueMenu } from '../../sources/current-queue-menu.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
let browser;
before(async()=>{browser=await launchFixtureBrowser();});after(async()=>{await browser?.close();});
for(const compiled of [false,true])for(const phase of ['connected','setter'])for(const type of ['yt-navigate-start','pagehide','row-rebound','row-reparented',...(compiled?[]:['dispose'])])test(`current native menu lifecycle cancels reentrant ${type} from ${phase} (${compiled?'Suite':'source'})`,async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());
 await context.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><style>ytd-miniplayer,ytd-playlist-panel-renderer,ytd-playlist-panel-video-renderer{display:block;width:400px;min-height:72px}#movie_player{width:400px;height:225px}</style><body><ytd-miniplayer><div id="movie_player"></div><ytd-playlist-panel-renderer></ytd-playlist-panel-renderer></ytd-miniplayer></body></html>'}):route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://www.youtube.com/');
 await page.evaluate(({phase,type})=>{
  const panel=document.querySelector('ytd-playlist-panel-renderer'),player=document.querySelector('#movie_player');
  const videoId='aaaaaaaaaaa',model={items:[{menuServiceItemRenderer:{text:{simpleText:'Watch Later'},serviceEndpoint:{playlistEditEndpoint:{playlistId:'WL',actions:[{action:'ACTION_ADD_VIDEO',addedVideoId:videoId}]}}}}]};
  const entry={videoId,playlistSetVideoId:'set0',selected:true,menu:{menuRenderer:model}};
  panel.data={playlistId:'TLPQfixture',currentIndex:0,contents:[{playlistPanelVideoRenderer:entry}]};
  const row=document.createElement('ytd-playlist-panel-video-renderer');row.data=entry;row.setAttribute('selected','');panel.append(row);
  player.getVideoData=()=>({video_id:videoId});player.getPlaylist=()=>[videoId];player.getPlaylistId=()=>panel.data.playlistId;player.getPlaylistIndex=()=>0;
  let fired=false;const interrupt=()=>{if(!fired){fired=true;
   if(type==='dispose')window.disposeReview();
   else if(type==='row-rebound')row.data={...entry,playlistSetVideoId:'recycled'};
   else if(type==='row-reparented')document.body.append(row);
   else dispatchEvent(new Event(type));
  }};
  customElements.define('ytd-menu-renderer',class extends HTMLElement{
   connectedCallback(){if(phase==='connected')interrupt();}
   set data(value){this._data=value;if(phase==='setter')interrupt();this.replaceChildren(Object.assign(document.createElement('button'),{textContent:'More actions'}));}
   get data(){return this._data;}
  });
 },{phase,type});
 if(compiled){
  await page.evaluate(()=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{currentQueueMenu:true,miniplayerEnabled:false,theatreMode:false}})));
  await page.addScriptTag({content:readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8')});
  const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
  await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
 }else await page.evaluate(factory=>{window.disposeReview=(0,eval)('('+factory+')')({document,window});},installCurrentQueueMenu.toString());
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-current-queue-menu-owned]').count(),0,'Native lifecycle interruption must not leave an owned current menu behind');
 assert.equal(await page.locator('[data-ytms-current-queue-menu]').count(),0);
 assert.deepEqual(errors,[]);
});
