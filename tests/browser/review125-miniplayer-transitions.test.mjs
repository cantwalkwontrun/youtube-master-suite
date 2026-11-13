// Language: en-GB. Synthetic retained-player generations; never uses a real browser profile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installMiniplayerControls } from '../../sources/miniplayer-controls.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
let browser;
before(async()=>{browser=await launchFixtureBrowser();});after(()=>browser?.close());
async function open(t,compiled){
  const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><style>ytd-app,ytd-miniplayer{display:block}#movie_player{position:relative;width:400px;height:225px}.ytp-miniplayer-controls{display:flex;width:264px}.ytp-play-button{width:42px;height:42px}</style><body><ytd-app><ytd-miniplayer><div id="movie_player"><video></video><div class="ytp-miniplayer-ui"><div class="ytp-miniplayer-controls"><button class="ytp-play-button">Play</button></div></div></div></ytd-miniplayer></ytd-app></body></html>'}));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);
  page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.goto('https://www.youtube.com/');
  await page.evaluate(()=>{
    window.miniGenerations={calls:[],bind(player,name){
      player.dataset.generation=name;
      player.getPlaylist=()=>['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc'];
      player.getPlaylistIndex=()=>1;player.getVideoData=()=>({video_id:'bbbbbbbbbbb'});
      player.previousVideo=()=>miniGenerations.calls.push(name+':previous');
      player.nextVideo=()=>miniGenerations.calls.push(name+':next');
    }};
    miniGenerations.bind(document.getElementById('movie_player'),'old');
  });
  if(compiled){await page.addScriptTag({content:suite});await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});}
  else await page.evaluate(factory=>{window.disposeMini=(0,eval)('('+factory+')')({document,window,preferences:{miniplayerNavigation:true}});},installMiniplayerControls.toString());
  await page.waitForFunction(()=>document.querySelectorAll('[data-ytms-mini-nav-button]').length===2);
  return page;
}
for(const compiled of [false,true])for(const hiding of ['hidden','opacity'])test(`same-host player adoption releases old fallback controls (${compiled?'Suite':'source'}, ${hiding})`,async t=>{
  const page=await open(t,compiled);
  await page.evaluate(hiding=>{
    const old=document.getElementById('movie_player'),next=old.cloneNode(true);
    next.querySelectorAll('[data-ytms-mini-nav-button]').forEach(button=>button.remove());
    miniGenerations.bind(next,'new');
    if(hiding==='hidden')old.hidden=true;else old.style.opacity='0';
    old.after(next);
  },hiding);
  await page.waitForFunction(()=>document.querySelector('[data-generation="new"] [data-ytms-mini-nav-button]'));
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  assert.equal(await page.locator('[data-generation="old"] [data-ytms-mini-nav-button]').count(),0,'A retained hidden player must not retain Suite navigation controls');
  assert.equal(await page.locator('[data-generation="new"] [data-ytms-mini-nav-button]').count(),2);
  await page.locator('[data-generation="new"] [data-ytms-mini-nav-button="next"]').click();
  assert.deepEqual(await page.evaluate(()=>miniGenerations.calls),['new:next']);
  await page.evaluate(()=>{document.querySelector('[data-generation="new"]').remove();const old=document.querySelector('[data-generation="old"]');old.hidden=false;old.style.opacity='';});
  await page.waitForFunction(()=>document.querySelectorAll('[data-ytms-mini-nav-button]').length===2);
  await page.locator('[data-generation="old"] [data-ytms-mini-nav-button="previous"]').click();
  assert.deepEqual(await page.evaluate(()=>miniGenerations.calls),['new:next','old:previous']);
});

for(const compiled of [false,true])for(const interruption of ['yt-navigate-start','pagehide',...(compiled?[]:['dispose'])])test(`navigation method lookup cannot revive a cancelled miniplayer click (${compiled?'Suite':'source'}, ${interruption})`,async t=>{
  const page=await open(t,compiled);
  await page.evaluate(interruption=>{
    const player=document.getElementById('movie_player'),next=player.nextVideo;
    let armed=false,reads=0;
    Object.defineProperty(player,'nextVideo',{get(){
      if(armed && ++reads===2){
        miniGenerations.interrupted=true;
        if(interruption==='dispose')disposeMini();else dispatchEvent(new Event(interruption));
      }
      return next;
    }});
    document.querySelector('[data-ytms-mini-nav-button="next"]').addEventListener('click',()=>{armed=true;reads=0;},{capture:true});
  },interruption);
  await page.locator('[data-ytms-mini-nav-button="next"]').click();
  assert.equal(await page.evaluate(()=>miniGenerations.interrupted),true);
  assert.deepEqual(await page.evaluate(()=>miniGenerations.calls),[],
    'A method returned after synchronous lifecycle cancellation must never be invoked');
  assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
});
