// Language: en-GB. Synthetic retained players; no account or real media access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const moduleSource = readFileSync(new URL('../../sources/modules/youtube-player-preferences-lite.user.js', import.meta.url), 'utf8');
const suiteSource = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
const functions = ['isTheaterModeEnabled','getTheaterModePlayer','enableTheaterMode','clearTheaterModeAttempts','handleTheaterModeToggle'].map(name => {
  const start = moduleSource.indexOf(`  function ${name}(`), end = moduleSource.indexOf('\n  function ', start + 1);
  assert.ok(start >= 0 && end > start); return moduleSource.slice(start,end);
}).join('\n');
let browser, launch;
before(async () => { browser = await (launch = launchFixtureBrowser()); });
after(async () => { await (await launch)?.close(); });
async function open(t, { suite = false, fault = 'opacity', enabled = true } = {}) {
  const context = await browser.newContext({ serviceWorkers:'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors,[]); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await page.evaluate(fault => {
    const player=document.getElementById('movie_player'), retained=player.cloneNode(true), host=document.createElement('div');
    host.append(retained); player.parentNode.prepend(host);
    window.theatreAudit={retainedClicks:0,activeClicks:0};
    retained.getVideoData=()=>({video_id:'aaaaaaaaaaa'});
    retained.querySelector('.ytp-size-button').onclick=()=>theatreAudit.retainedClicks++;
    const original=player.querySelector('.ytp-size-button').onclick;
    player.querySelector('.ytp-size-button').onclick=event=>{theatreAudit.activeClicks++;original(event);};
    if(fault==='display')host.style.display='none';
    if(fault==='opacity')host.style.opacity='0';
    if(fault==='visibility')host.style.visibility='hidden';
    if(fault==='aria-hidden')host.setAttribute('aria-hidden','true');
    if(fault==='no-visible') {host.style.opacity='0';player.style.opacity='0';}
    if(fault==='identity')retained.getVideoData=()=>({video_id:'bbbbbbbbbbb'});
  },fault);
  if(suite) {
    await page.evaluate(enabled=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{theatreMode:enabled,miniplayerEnabled:false}})),enabled);
    await page.addScriptTag({content:suiteSource});
    await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true,errors});
  } else {
    await page.addScriptTag({content:`(() => {
      const CONFIG={enableTheaterMode:${enabled}}, isWatchPath=()=>true;
      let theaterModeUserDisabled=false,dynamicNavigationPending=false,videoMirrorPageSuspended=false,theaterModeAttemptKey='';
      const theaterModeAttemptTimers=new Set();
      const getVideoMirrorRouteId=()=>new URLSearchParams(location.search).get('v');
      const getWatchFlexy=()=>document.querySelector('ytd-watch-flexy');
      const closestElement=(target,selector)=>target?.closest(selector);
      const schedulePlayerLayoutRefreshAttempts=()=>{};
      ${functions}
      document.addEventListener('click',handleTheaterModeToggle,true);
      window.retryTheatre=enableTheaterMode; enableTheaterMode();
    })();`});
  }
  return page;
}
for(const suite of [false,true]) for(const fault of ['display','opacity','visibility','aria-hidden','identity','no-visible','two-visible'])
test(`${suite?'Suite':'source'} automatic theatre selects only a unique visible current player (${fault})`,async t=>{
  const page=await open(t,{suite,fault});
  const expected=['no-visible','two-visible'].includes(fault)?0:1;
  if(suite) await page.waitForTimeout(1450);
  assert.deepEqual(await page.evaluate(()=>theatreAudit),{retainedClicks:0,activeClicks:expected});
  assert.equal(await page.locator('ytd-watch-flexy').evaluate(node=>node.hasAttribute('theater')),Boolean(expected));
  if(expected) {
    await page.locator('#movie_player').last().locator('.ytp-size-button').click();
    if(suite) await page.waitForTimeout(1400); else await page.evaluate(()=>retryTheatre());
    assert.equal(await page.locator('ytd-watch-flexy').evaluate(node=>node.hasAttribute('theater')),false,'manual opt-out survives later attempts');
    assert.equal(await page.evaluate(()=>theatreAudit.activeClicks),2);
  }
});
for(const suite of [false,true]) test(`${suite?'Suite':'source'} disabled automatic theatre never clicks a retained or current player`,async t=>{
  const page=await open(t,{suite,enabled:false});
  if(suite) await page.waitForTimeout(1300);
  assert.deepEqual(await page.evaluate(()=>theatreAudit),{retainedClicks:0,activeClicks:0});
});

for(const event of ['yt-navigate-start','pagehide']) test(`Suite theatre remains suspended after ${event} and resumes only on the matching return`,async t=>{
  const page=await open(t,{suite:true,fault:'display'});
  await page.evaluate(event=>window.dispatchEvent(new Event(event)),event);
  await page.waitForTimeout(1350);
  assert.equal(await page.evaluate(()=>theatreAudit.activeClicks),0);
  await page.evaluate(event=>{
    window.dispatchEvent(new Event(event==='pagehide'?'yt-navigate-finish':'pageshow'));
    window.dispatchEvent(new Event('yt-page-data-updated'));
  },event);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>theatreAudit.activeClicks),0,'unrelated completion cannot revive suspended theatre');
  await page.evaluate(event=>window.dispatchEvent(new Event(event==='pagehide'?'pageshow':'yt-navigate-finish')),event);
  await page.waitForFunction(()=>theatreAudit.activeClicks===1);
});

for(const lateFinish of [false,true]) test(`Suite theatre preserves a manual same-video opt-out across cached-page restoration (late finish=${lateFinish})`,async t=>{
  const page=await open(t,{suite:true,fault:'display'});
  await page.waitForFunction(()=>theatreAudit.activeClicks===1);
  await page.locator('#movie_player').last().locator('.ytp-size-button').click();
  await page.evaluate(lateFinish=>{window.dispatchEvent(new Event('pagehide'));if(lateFinish)window.dispatchEvent(new Event('yt-navigate-finish'));window.dispatchEvent(new Event('pageshow'));},lateFinish);
  await page.waitForTimeout(1350);
  assert.equal(await page.evaluate(()=>theatreAudit.activeClicks),2);
  assert.equal(await page.locator('ytd-watch-flexy').evaluate(node=>node.hasAttribute('theater')),false);
});

test('manual theatre tracking performs no player queries for unrelated trusted page clicks',async t=>{
  const page=await open(t,{fault:'display'});
  await page.evaluate(()=>{
    window.theatrePlayerQueries=0;const query=document.querySelectorAll.bind(document);
    document.querySelectorAll=selector=>{if(selector==='#movie_player')theatrePlayerQueries++;return query(selector);};
    const button=document.createElement('button');button.id='unrelated-action';button.textContent='Unrelated action';document.body.prepend(button);
  });
  for(let index=0;index<5;index++)await page.locator('#unrelated-action').click();
  assert.equal(await page.evaluate(()=>theatrePlayerQueries),0);
});

for(const suite of [false,true]) for(const interaction of ['synthetic-current','trusted-preview'])
test(`${suite?'Suite':'source'} ${interaction} size action cannot set the current player's manual theatre opt-out`,async t=>{
  const page=await open(t,{suite,fault:'display'});
  if(suite)await page.waitForFunction(()=>theatreAudit.activeClicks===1);
  if(interaction==='synthetic-current') await page.locator('#movie_player').last().locator('.ytp-size-button').evaluate(button=>button.click());
  else {
    await page.evaluate(()=>{
      const preview=document.createElement('ytd-video-preview'),button=document.createElement('button');
      button.id='other-player-size';button.className='ytp-size-button';button.textContent='Preview size';
      preview.append(button);document.body.prepend(preview);
    });
    await page.locator('#other-player-size').click();
    await page.locator('ytd-watch-flexy').evaluate(node=>node.removeAttribute('theater'));
  }
  const before=await page.evaluate(()=>theatreAudit.activeClicks);
  if(suite) await page.waitForFunction(count=>theatreAudit.activeClicks>count,before);
  else await page.evaluate(()=>retryTheatre());
  assert.equal(await page.locator('ytd-watch-flexy').evaluate(node=>node.hasAttribute('theater')),true);
  assert.equal(await page.evaluate(()=>theatreAudit.retainedClicks),0);
});
