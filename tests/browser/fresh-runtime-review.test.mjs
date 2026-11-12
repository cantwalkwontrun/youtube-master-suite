// Language: en-GB. Fresh independent lifecycle regression fixtures.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installDiscoveryControls } from '../../sources/discovery-controls.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';
for (const eventName of ['yt-navigate-start','pagehide']) test(`trailer autoplay suppression respects ${eventName} suspension`,async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url()==='https://www.youtube.com/@fixture'?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><ytd-channel-video-player-renderer><video></video></ytd-channel-video-player-renderer></body></html>'}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/@fixture');
 const result=await page.evaluate(({source,eventName})=>{
  const video=document.querySelector('video'); let paused=true, calls=0;
  Object.defineProperties(video,{paused:{get:()=>paused},ended:{get:()=>false}});
  video.pause=()=>{calls++;paused=true;};
  const dispose=(0,eval)('('+source+')')({document,window,preferences:{pauseChannelTrailers:true},classifyFilm:()=>null});
  window.dispatchEvent(new Event(eventName));paused=false;video.dispatchEvent(new Event('play'));
  const whileSuspended=calls;window.dispatchEvent(new Event(eventName==='pagehide'?'pageshow':'yt-navigate-finish'));
  return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{dispose();resolve({whileSuspended,afterResume:calls});})));
 },{source:installDiscoveryControls.toString(),eventName});
 assert.equal(result.whileSuspended,0,'no media calls while the lifecycle is suspended');
 assert.equal(result.afterResume,1,'active trailer preference resumes when the page is ready');
});


import { readFileSync } from 'node:fs';
for (const mode of ['source','Suite']) test(`${mode} automatic theatre respects a native trusted keyboard opt-out before retries`,async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'});
 const html=readFileSync(new URL('./watch-page.html',import.meta.url),'utf8');
 await context.route('**/*',r=>r.request().url().startsWith('https://www.youtube.com/watch?')?r.fulfill({contentType:'text/html',body:html}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await page.evaluate(()=>{
  localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{theatreMode:true,miniplayerEnabled:false}}));
  // Model the native keyboard action: YouTube changes theatre state, without a click.
  document.addEventListener('keydown',event=>{if(event.isTrusted && event.key==='t')document.querySelector('ytd-watch-flexy').toggleAttribute('theater');});
 });
 await page.addScriptTag({content:readFileSync(new URL(mode==='Suite'?'../../youtube-master-suite.user.js':'../../sources/modules/youtube-player-preferences-lite.user.js',import.meta.url),'utf8')});
 await page.waitForFunction(()=>document.querySelector('ytd-watch-flexy').hasAttribute('theater'));
 await page.keyboard.press('t');
 assert.equal(await page.locator('ytd-watch-flexy').evaluate(el=>el.hasAttribute('theater')),false);
 await page.waitForTimeout(2700);
 assert.equal(await page.locator('ytd-watch-flexy').evaluate(el=>el.hasAttribute('theater')),false,'retry must respect the trusted native keyboard opt-out');
});

test('theatre shortcut tracking ignores unrelated, editable, modified, synthetic and stale activations',async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().resourceType()==='document' && ['https://www.youtube.com/watch?v=aaaaaaaaaaa','https://www.youtube.com/@fixture'].includes(r.request().url()) ? r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body tabindex="0"><input id="editor"></body></html>'}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 const source=readFileSync(new URL('../../sources/modules/youtube-player-preferences-lite.user.js',import.meta.url),'utf8');
 const start=source.indexOf('  function handleTheaterModeKeyDown('),end=source.indexOf('\n  function ',start+1);
 await page.addScriptTag({content:`(() => {
  const CONFIG={enableTheaterMode:true};let dynamicNavigationPending=false,videoMirrorPageSuspended=false,theaterModeUserDisabled=false;
  const theaterModeAttemptTimers=new Set();
  const state=window.shortcutState={lookups:0,clears:0,enabled:true,key:'A',mode:'toggle',player:{}};
  const isWatchPath=()=>true,closestElement=(target,selector)=>target?.closest?.(selector),getTheaterModePlayer=()=>{state.lookups++;return state.player;},getVideoKey=()=>state.key;
  const isTheaterModeEnabled=()=>state.enabled,clearTheaterModeAttempts=()=>state.clears++;
  ${source.slice(start,end)}
  document.addEventListener('keydown',handleTheaterModeKeyDown,true);
  document.addEventListener('keydown',event=>{if(event.key.toLowerCase()!=='t')return;if(state.mode!=='unchanged')state.enabled=!state.enabled;if(state.mode==='navigate')dynamicNavigationPending=true;if(state.mode==='identity')state.key='B';});
  window.resetShortcut=mode=>{Object.assign(state,{lookups:0,clears:0,enabled:true,key:'A',mode});dynamicNavigationPending=false;videoMirrorPageSuspended=false;};
 })();`});
 for(const scenario of ['unrelated','modified','editable','synthetic','unchanged','navigate','identity','valid']) {
  await page.evaluate(mode=>resetShortcut(mode),scenario);
  await page.locator(scenario==='editable'?'#editor':'body').focus();
  if(scenario==='synthetic')await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true})));
  else await page.keyboard.press(scenario==='unrelated'?'x':scenario==='modified'?'Alt+t':'t');
  const state=await page.evaluate(()=>new Promise(resolve=>setTimeout(()=>resolve(shortcutState),0)));
  assert.equal(state.clears,scenario==='valid'?1:0,scenario+' only observed eligible transition can suppress retries');
  if(['unrelated','modified','editable','synthetic'].includes(scenario))assert.equal(state.lookups,0,scenario+' avoids player queries');
 }
});

test('disposed trailer controls perform no further media actions',async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().resourceType()==='document' && ['https://www.youtube.com/watch?v=aaaaaaaaaaa','https://www.youtube.com/@fixture'].includes(r.request().url()) ? r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><ytd-channel-video-player-renderer><video></video></ytd-channel-video-player-renderer></body></html>'}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/@fixture');
 assert.equal(await page.evaluate(source=>{
  const video=document.querySelector('video');let paused=true,calls=0;Object.defineProperty(video,'paused',{get:()=>paused});video.pause=()=>calls++;
  const dispose=(0,eval)('('+source+')')({document,window,preferences:{pauseChannelTrailers:true},classifyFilm:()=>null});
  dispose();paused=false;video.dispatchEvent(new Event('play'));window.dispatchEvent(new Event('yt-page-data-updated'));return calls;
 },installDiscoveryControls.toString()),0);
});

import { installPlayerControls } from '../../sources/player-controls.mjs';
for(const [delayedIdentity,change] of [[false,'none'],[true,'none'],[true,'source'],[true,'route'],[true,'navigation'],[true,'emptied'],[true,'cached-page'],[true,'video-node']]) test(`original audio respects manual native settings interaction before delayed metadata (delayed identity=${delayedIdentity}, change=${change})`,async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().resourceType()==='document' && ['https://www.youtube.com/watch?v=aaaaaaaaaaa','https://www.youtube.com/@fixture'].includes(r.request().url()) ? r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><div id="movie_player" style="width:640px;height:360px"><video></video><button class="ytp-settings-button">Settings</button><div class="ytp-settings-menu"><button id="manual-track">Dubbed audio</button></div></div></body></html>'}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await page.evaluate(({source,delayedIdentity})=>{
  const player=document.querySelector('#movie_player');window.audioAudit={ready:false,calls:0};
  const original={getLanguageInfo:()=>({getIsDefault:()=>true,getIsAutoDubbed:()=>false})};
  const dubbed={getLanguageInfo:()=>({getIsDefault:()=>false,getIsAutoDubbed:()=>true})};
  player.getVideoData=()=>({video_id:delayedIdentity&&!audioAudit.ready?'':'aaaaaaaaaaa'});player.getAvailableAudioTracks=()=>audioAudit.ready?[original,dubbed]:[];
  let selectedTrack=dubbed;
  player.getAudioTrack=()=>selectedTrack;player.setAudioTrack=track=>{audioAudit.calls++;selectedTrack=track;};
  document.querySelector('#manual-track').onclick=()=>{audioAudit.ready=true;};
  window.dispose=(0,eval)('('+source+')')({document,window,preferences:{originalAudio:true}});
 },{source:installPlayerControls.toString(),delayedIdentity});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.locator('.ytp-settings-button').click();await page.locator('#manual-track').click();
 await page.evaluate(change=>{
  const video=document.querySelector('video');
  if(change==='source')Object.defineProperty(video,'currentSrc',{value:'blob:https://www.youtube.com/new-synthetic-source'});
  if(change==='route')history.pushState({},'','/watch?v=bbbbbbbbbbb');
  if(change==='navigation'){window.dispatchEvent(new Event('yt-navigate-start'));window.dispatchEvent(new Event('yt-navigate-finish'));}
  if(change==='emptied')video.dispatchEvent(new Event('emptied'));
  if(change==='cached-page'){window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));}
  if(change==='video-node')video.replaceWith(document.createElement('video'));
 },change);
 await page.evaluate(()=>{document.querySelector('video').dispatchEvent(new Event('loadedmetadata'));});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>audioAudit.calls),['none','cached-page'].includes(change)?0:1,'manual evidence belongs only to the same media and navigation');
});

for(const preference of ['originalAudio','disableStableVolume','disableAutoplay']) test(`${preference} delayed native preference preserves manual intent across cached pages and resets for another video`,async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().resourceType()==='document' && ['https://www.youtube.com/watch?v=aaaaaaaaaaa','https://www.youtube.com/@fixture'].includes(r.request().url()) ? r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><button id="unrelated">Unrelated</button><div id="movie_player" style="width:640px;height:360px"><video></video><button class="ytp-settings-button">Settings</button><button class="ytp-autonav-toggle-button">Autoplay</button></div></body></html>'}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await page.evaluate(({source,preference})=>{
  const player=document.querySelector('#movie_player');window.preferenceAudit={id:'aaaaaaaaaaa',ready:false,calls:0};
  const original={getLanguageInfo:()=>({getIsDefault:()=>true,getIsAutoDubbed:()=>false})},dubbed={getLanguageInfo:()=>({getIsDefault:()=>false,getIsAutoDubbed:()=>true})};
  player.getVideoData=()=>({video_id:preferenceAudit.id});player.getAvailableAudioTracks=()=>preferenceAudit.ready?[original,dubbed]:[];
  player.getAudioTrack=()=>dubbed;player.setAudioTrack=()=>preferenceAudit.calls++;
  player.getDrcUserPreference=()=>preferenceAudit.ready?1:undefined;player.setDrcUserPreference=()=>preferenceAudit.calls++;
  player.setAutonav=()=>preferenceAudit.calls++;
  window.enableMetadata=()=>{preferenceAudit.ready=true;player.querySelector('.ytp-autonav-toggle-button').setAttribute('aria-checked','true');player.querySelector('video').dispatchEvent(new Event('loadedmetadata'));};
  window.dispose=(0,eval)('('+source+')')({document,window,preferences:{[preference]:true}});
 },{source:installPlayerControls.toString(),preference});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await settle();
 const button=page.locator(preference==='disableAutoplay'?'.ytp-autonav-toggle-button':'.ytp-settings-button');
 await button.focus();await page.keyboard.press('Enter');
 await page.evaluate(()=>enableMetadata());await settle();
 assert.equal(await page.evaluate(()=>preferenceAudit.calls),0,'keyboard manual intent blocks late automatic changes');
 await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));});await settle();
 assert.equal(await page.evaluate(()=>preferenceAudit.calls),0,'same cached video retains manual intent');
 await page.evaluate(()=>{preferenceAudit.id='bbbbbbbbbbb';document.querySelector('video').dispatchEvent(new Event('loadedmetadata'));});await settle();
 assert.equal(await page.evaluate(()=>preferenceAudit.calls),1,'new identity restores configured automatic preference');
});

for(const scenario of ['synthetic','unrelated','suspended']) test(`native manual preference guard ignores ${scenario} interactions`,async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().resourceType()==='document' && ['https://www.youtube.com/watch?v=aaaaaaaaaaa','https://www.youtube.com/@fixture'].includes(r.request().url()) ? r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><button id="unrelated">Unrelated</button><div id="movie_player" style="width:640px;height:360px"><video></video><button class="ytp-settings-button">Settings</button></div></body></html>'}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await page.evaluate(source=>{
  const player=document.querySelector('#movie_player');window.manualAudit={ready:false,calls:0,reads:0};
  player.getVideoData=()=>{manualAudit.reads++;return {video_id:'aaaaaaaaaaa'};};player.getDrcUserPreference=()=>manualAudit.ready?1:undefined;player.setDrcUserPreference=()=>manualAudit.calls++;
  window.dispose=(0,eval)('('+source+')')({document,window,preferences:{disableStableVolume:true}});
 },installPlayerControls.toString());
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>{manualAudit.reads=0;});
 if(scenario==='synthetic')await page.locator('.ytp-settings-button').evaluate(el=>el.click());
 else if(scenario==='unrelated')await page.locator('#unrelated').click();
 else {await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-start')));await page.locator('.ytp-settings-button').click();}
 assert.equal(await page.evaluate(()=>manualAudit.reads),0,'ignored inputs cause no identity API reads');
 await page.evaluate(scenario=>{manualAudit.ready=true;if(scenario==='suspended')window.dispatchEvent(new Event('yt-navigate-finish'));else document.querySelector('video').dispatchEvent(new Event('loadedmetadata'));},scenario);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>manualAudit.calls),1,'ignored interaction cannot disable the configured automatic preference');
});

for(const lifecycle of ['yt-navigate-start','pagehide','dispose']) test(`number-key preference does not intercept keys while ${lifecycle}`,async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().resourceType()==='document' && ['https://www.youtube.com/watch?v=aaaaaaaaaaa','https://www.youtube.com/@fixture'].includes(r.request().url()) ? r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><div id="movie_player" tabindex="0" style="width:640px;height:360px"><video></video></div></body></html>'}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await page.evaluate(source=>{
  window.numberAudit={events:0,lookups:0};const query=document.querySelectorAll.bind(document);
  document.querySelectorAll=selector=>{if(selector==='#movie_player')numberAudit.lookups++;return query(selector);};
  window.dispose=(0,eval)('('+source+')')({document,window,preferences:{disableNumberKeySeeking:true}});
  window.addEventListener('keydown',()=>numberAudit.events++);
 },installPlayerControls.toString());
 await page.locator('#movie_player').focus();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(lifecycle=>{if(lifecycle==='dispose')dispose();else window.dispatchEvent(new Event(lifecycle));numberAudit.events=0;numberAudit.lookups=0;},lifecycle);
 await page.keyboard.press('5');
 assert.deepEqual(await page.evaluate(()=>numberAudit),{events:1,lookups:0},'suspended or disposed handler leaves input and player alone');
 if(lifecycle!=='dispose') {
  await page.evaluate(lifecycle=>window.dispatchEvent(new Event(lifecycle==='pagehide'?'pageshow':'yt-navigate-finish')),lifecycle);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.keyboard.press('5');assert.equal(await page.evaluate(()=>numberAudit.events),1,'active preference resumes blocking player number-key seeking');
 }
});

test('temporary missing identity preserves previous manual preference choices',async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().resourceType()==='document' && ['https://www.youtube.com/watch?v=aaaaaaaaaaa','https://www.youtube.com/@fixture'].includes(r.request().url()) ? r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><div id="movie_player" style="width:640px;height:360px"><video></video><button class="ytp-settings-button">Settings</button><button class="ytp-autonav-toggle-button">Autoplay</button></div></body></html>'}):r.abort());
 const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await page.evaluate(source=>{
  const player=document.querySelector('#movie_player');window.gapAudit={id:'aaaaaaaaaaa',calls:0};
  player.getVideoData=()=>({video_id:gapAudit.id});player.setAutonav=()=>gapAudit.calls++;
  player.getDrcUserPreference=()=>undefined;player.setDrcUserPreference=()=>{};
  window.dispose=(0,eval)('('+source+')')({document,window,preferences:{disableAutoplay:true,disableStableVolume:true}});
 },installPlayerControls.toString());
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.locator('.ytp-autonav-toggle-button').click();
 await page.evaluate(()=>{gapAudit.id='';});await page.locator('.ytp-settings-button').click();
 await page.evaluate(()=>{gapAudit.id='aaaaaaaaaaa';document.querySelector('.ytp-autonav-toggle-button').setAttribute('aria-checked','true');document.querySelector('video').dispatchEvent(new Event('loadedmetadata'));});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>gapAudit.calls),0,'another native preference interaction during an API gap must preserve the first manual choice');
});
