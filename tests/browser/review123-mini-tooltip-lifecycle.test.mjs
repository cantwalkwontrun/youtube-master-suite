// Language: en-GB. Isolated native-tooltip lifecycle and ownership regressions.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installMiniplayerControls } from '../../sources/miniplayer-controls.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
let browser;before(async()=>{browser=await launchFixtureBrowser();});after(async()=>{await browser?.close();});
async function open(t,enabled,compiled){
 const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());
 await context.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><style>ytd-miniplayer{display:block;width:400px}#movie_player{position:relative;width:400px;height:225px}.ytp-miniplayer-controls{display:flex;width:260px;margin:80px 40px}.ytp-play-button{width:40px;height:40px}</style><body><button id="outside">Outside</button><ytd-miniplayer><div id="movie_player"><div class="ytp-miniplayer-ui"><div class="ytp-miniplayer-controls"><div><button class="ytp-play-button">Play</button></div></div></div></div></ytd-miniplayer></body></html>'}):r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto('https://www.youtube.com/');
 await page.evaluate(()=>{
  const player=document.querySelector('#movie_player');window.mediaCalls=[];
  player.getPlaylist=()=>['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc'];player.getPlaylistIndex=()=>1;player.getVideoData=()=>({video_id:'bbbbbbbbbbb'});
  player.nextVideo=()=>mediaCalls.push('next');player.previousVideo=()=>mediaCalls.push('previous');
 });
 if(compiled){
  await page.evaluate(enabled=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{miniplayerNavigation:enabled,miniplayerEnabled:false,theatreMode:false}})),enabled);
  await page.addScriptTag({content:readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8')});
  const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
  await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
 }else await page.evaluate(({factory,enabled})=>{window.disposeReview=(0,eval)('('+factory+')')({document,window,preferences:{miniplayerNavigation:enabled}});},{factory:installMiniplayerControls.toString(),enabled});
 await settle(page);await page.locator('.ytp-play-button').focus();
 assert.ok(await anchor(page),'initial native focus has a tooltip anchor');return page;
}
async function settle(page){await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});}
const anchor=page=>page.locator('#movie_player').evaluate(player=>player.style.getPropertyValue('--ytms-mini-play-tip-x'));
for(const compiled of [false,true])for(const enabled of [false,true])for(const [start,finish] of [['yt-navigate-start','yt-navigate-finish'],['pagehide','pageshow']]){
 test(`native Play anchor resumes after ${finish} with navigation ${enabled} (${compiled?'Suite':'source'})`,async t=>{
  const page=await open(t,enabled,compiled);
  await page.evaluate(start=>dispatchEvent(new Event(start)),start);assert.equal(await anchor(page),'');
  await page.evaluate(finish=>dispatchEvent(new Event(finish)),finish);await settle(page);
  assert.ok(await anchor(page),'the still-focused Play control regains its anchor after the lifecycle finishes');
  assert.deepEqual(await page.evaluate(()=>mediaCalls),[]);
 });
 test(`native Play focus cannot reacquire tooltip ownership during ${start} with navigation ${enabled} (${compiled?'Suite':'source'})`,async t=>{
  const page=await open(t,enabled,compiled);await page.evaluate(start=>dispatchEvent(new Event(start)),start);
  await page.locator('#outside').focus();await page.locator('.ytp-play-button').focus();await settle(page);
  assert.equal(await anchor(page),'','stale focus must not restore a native-tooltip anchor while suspended');
  assert.deepEqual(await page.evaluate(()=>mediaCalls),[]);
 });
}
for(const compiled of [false,true])for(const type of ['yt-navigate-start','pagehide',...(compiled?[]:['dispose'])])test(`native arrow focus handoff cannot resume owned controls after ${type} (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,true,compiled);await page.locator('[data-ytms-mini-nav-button="previous"]').focus();
 await page.evaluate(type=>{
  const native=document.createElement('button');native.className='ytp-prev-button';native.textContent='Native previous';
  native.addEventListener('focus',()=>{if(type==='dispose')window.disposeReview();else dispatchEvent(new Event(type));});
  document.querySelector('.ytp-miniplayer-controls').prepend(native);
 },type);
 await settle(page);
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0,'synchronous native focus cancellation must release the entire interrupted controls pass');
 assert.equal(await page.locator('[data-ytms-mini-navigation]').count(),0);
 assert.deepEqual(await page.evaluate(()=>mediaCalls),[]);
});
for(const compiled of [false,true])for(const type of ['yt-navigate-start','pagehide',...(compiled?[]:['dispose'])])test(`native queue getter cancellation cannot leave owned controls after ${type} (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,true,compiled);
 await page.evaluate(type=>{
  const player=document.querySelector('#movie_player'),read=player.getPlaylist;let fired=false;
  player.getPlaylist=()=>{if(!fired){fired=true;if(type==='dispose')window.disposeReview();else dispatchEvent(new Event(type));}return read();};
  dispatchEvent(new Event('yt-playlist-data-updated'));
 },type);
 await settle(page);
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0,'native queue reads cannot let a cancelled controls pass create later controls');
 assert.equal(await page.locator('[data-ytms-mini-navigation]').count(),0);
 assert.deepEqual(await page.evaluate(()=>mediaCalls),[]);
});
for(const compiled of [false,true])for(const type of ['yt-navigate-start','pagehide',...(compiled?[]:['dispose'])])test(`trusted navigation refuses a native read cancelled by ${type} (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,true,compiled);
 await page.evaluate(type=>{
  const player=document.querySelector('#movie_player'),read=player.getPlaylist;let armed=false,fired=false;
  document.addEventListener('click',event=>{if(event.isTrusted)armed=true;},{capture:true,once:true});
  player.getPlaylist=()=>{if(armed&&!fired){fired=true;if(type==='dispose')window.disposeReview();else dispatchEvent(new Event(type));}return read();};
 },type);
 await page.locator('[data-ytms-mini-nav-button="next"]').click();
 assert.deepEqual(await page.evaluate(()=>mediaCalls),[],'a cancelled native read must not advance playback');
});
