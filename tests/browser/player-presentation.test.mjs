// Language: en-GB. Synthetic native presentation contracts; no live account.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { installPlayerPresentation } from '../../sources/player-presentation.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
const HTML = `<!doctype html><html lang="en-GB"><head><style>
ytd-app,ytd-browse,ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-miniplayer{display:block;min-height:20px}
</style></head><body><ytd-app><ytd-browse><ytd-rich-grid-renderer><ytd-rich-item-renderer>
<a href="/watch?v=bbbbbbbbbbb">Preview</a></ytd-rich-item-renderer></ytd-rich-grid-renderer></ytd-browse>
<ytd-miniplayer><div id="movie_player"><video></video><div class="ytp-time-display">
<div class="ytp-time-wrapper ytp-time-wrapper-delhi"><div class="ytp-time-contents" role="button" tabindex="0">
<span class="ytp-time-current">-15:04</span><span> / </span><span class="ytp-time-duration">15:13</span>
</div></div></div></div></ytd-miniplayer></ytd-app></body></html>`;
async function open(t, options = {}, setup = '') {
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url() === 'https://www.youtube.com/'
    ? route.fulfill({ contentType: 'text/html', body: HTML }) : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/');
  await page.evaluate(() => {
    const app = document.querySelector('ytd-app'), grid = document.querySelector('ytd-rich-grid-renderer');
    window.audit = { dispatches: [], clicks: 0, mediaEvents: [] };
    for (const host of [app, grid]) {
      let enabled = false;
      const controller = { miniplayerIsActive: true, miniplayerPlaybackState: 1 };
      if (host === app) {
        controller.isInlinePreviewDisabled = false;
        controller.computeIsInlinePreviewEnabled = function (active, state, disabled) {
          return !disabled && (!active || [5, 2, 0].includes(state));
        };
      } else controller.computeIsInlinePreviewEnabled = function (active, state) { return !active || [5, 2, 0].includes(state); };
      Object.defineProperty(controller, 'isInlinePreviewEnabled', { configurable: true, get: () => enabled,
        set(value) { enabled = value; window.audit.dispatches.push([host.localName, value]); } });
      host.polymerController = controller;
      host.originalCompute = controller.computeIsInlinePreviewEnabled;
    }
    const wrapper = document.querySelector('.ytp-time-wrapper');
    wrapper.addEventListener('click', () => {
      window.audit.clicks++;
      const current = wrapper.querySelector('.ytp-time-current');
      current.textContent = current.textContent.startsWith('-') ? '0:09' : '-15:04';
    });
    const video = document.querySelector('video');
    for (const type of ['pause', 'seeking', 'emptied', 'loadstart']) video.addEventListener(type, () => window.audit.mediaEvents.push(type));
    window.videoBefore = video;
    window.wrapperBefore = wrapper;
  });
  if (setup) await page.evaluate(setup);
  await page.addScriptTag({ content: `window.disposePresentation = (${installPlayerPresentation.toString()})({document, window, ...${JSON.stringify(options)}});` });
  await settle(page);
  return page;
}
async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function snapshot(page) { return page.evaluate(() => ({
  app: document.querySelector('ytd-app').polymerController.isInlinePreviewEnabled,
  grid: document.querySelector('ytd-rich-grid-renderer').polymerController.isInlinePreviewEnabled,
  text: document.querySelector('.ytp-time-current').textContent, clicks: audit.clicks,
  mediaEvents: audit.mediaEvents, sameVideo: videoBefore === document.querySelector('video'),
  sameWrapper: wrapperBefore === document.querySelector('.ytp-time-wrapper'),
  active: document.querySelector('ytd-app').polymerController.miniplayerIsActive,
})); }

test('defaults leave native preview eligibility, timer nodes and playback untouched', async t => {
  const page = await open(t);
  assert.deepEqual(await snapshot(page), { app: false, grid: false, text: '-15:04', clicks: 0,
    mediaEvents: [], sameVideo: true, sameWrapper: true, active: true });
});
test('opt-in previews override only native presentation eligibility, not miniplayer identity', async t => {
  const page = await open(t, { keepHoverPreviews: true });
  const result = await snapshot(page);
  assert.equal(result.app, true); assert.equal(result.grid, true); assert.equal(result.active, true);
  assert.equal(result.sameVideo, true); assert.deepEqual(result.mediaEvents, []); assert.equal(result.clicks, 0);
});
test('explicit YouTube inline-playback opt-out is honoured, including after enabling', async t => {
  const page = await open(t, { keepHoverPreviews: true });
  await page.evaluate(() => {
    document.querySelector('ytd-app').polymerController.isInlinePreviewDisabled = true;
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await settle(page);
  assert.equal((await snapshot(page)).app, false);
  assert.equal(await page.evaluate(() => {
    const host = document.querySelector('ytd-app'); return host.originalCompute === host.polymerController.computeIsInlinePreviewEnabled;
  }), true);
});
test('navigation restores native eligibility and returning Home reapplies without duplicated wrappers', async t => {
  const page = await open(t, { keepHoverPreviews: true });
  for (let index = 0; index < 5; index++) {
    await page.evaluate(() => { window.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/results?search_query=fixture'); window.dispatchEvent(new Event('yt-navigate-finish')); });
    await settle(page); assert.equal((await snapshot(page)).app, false);
    await page.evaluate(() => { window.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/'); window.dispatchEvent(new Event('yt-navigate-finish')); });
    await settle(page); assert.equal((await snapshot(page)).app, true);
  }
  await page.evaluate(() => disposePresentation());
  assert.equal((await snapshot(page)).app, false);
});
test('inherited native hooks are restored without leaving an own method', async t => {
  const page = await open(t, { keepHoverPreviews: true }, `(() => {
    for (const host of document.querySelectorAll('ytd-app,ytd-rich-grid-renderer')) {
      const c=host.polymerController, f=c.computeIsInlinePreviewEnabled;
      delete c.computeIsInlinePreviewEnabled; Object.setPrototypeOf(c,{computeIsInlinePreviewEnabled:f});
    }
  })()`);
  assert.equal((await snapshot(page)).app, true);
  await page.evaluate(() => disposePresentation());
  assert.equal(await page.evaluate(() => Object.hasOwn(document.querySelector('ytd-app').polymerController, 'computeIsInlinePreviewEnabled')), false);
});
test('read-only Polymer computed properties use their native generated setter', async t => {
  const page = await open(t, { keepHoverPreviews: true }, `(() => {
    for (const host of document.querySelectorAll('ytd-app,ytd-rich-grid-renderer')) {
      const c=host.polymerController; let enabled=false;
      Object.defineProperty(c,'isInlinePreviewEnabled',{get:()=>enabled});
      c._setIsInlinePreviewEnabled=value=>{enabled=value};
    }
  })()`);
  assert.equal((await snapshot(page)).app, true);
  await page.evaluate(() => disposePresentation());
  assert.equal((await snapshot(page)).app, false);
});
test('read-only computed eligibility without a generated setter uses native property effects', async t => {
  const page = await open(t, { keepHoverPreviews: true }, `(() => {
    for (const host of document.querySelectorAll('ytd-app,ytd-rich-grid-renderer')) {
      const c=host.polymerController, data={isInlinePreviewEnabled:false};
      c.__dataHasAccessor={isInlinePreviewEnabled:true};
      c._getProperty=name=>data[name];
      c._setProperty=(name,value)=>{data[name]=value;window.audit.dispatches.push([host.localName,value]);};
      Object.defineProperty(c,'isInlinePreviewEnabled',{get:()=>data.isInlinePreviewEnabled,set:()=>{}});
    }
  })()`);
  assert.equal((await snapshot(page)).app, true);
  assert.equal((await snapshot(page)).grid, true);
  await page.evaluate(() => disposePresentation());
  assert.equal((await snapshot(page)).app, false);
  assert.equal((await snapshot(page)).grid, false);
});
test('native property effects enable a modern lockup subscriber without synthesising hover', async t => {
  const page=await open(t,{keepHoverPreviews:true},`(() => {
    const lockup=document.createElement('yt-lockup-view-model');
    lockup.style.cssText='display:block;width:300px;height:100px';lockup.textContent='Synthetic modern card';
    document.querySelector('ytd-rich-item-renderer').replaceChildren(lockup);
    audit.nativePreviewEnabled=false;audit.nativeEnters=0;
    lockup.addEventListener('mouseenter',()=>{if(audit.nativePreviewEnabled)audit.nativeEnters++});
    for(const host of document.querySelectorAll('ytd-app,ytd-rich-grid-renderer')) {
      const c=host.polymerController,data={isInlinePreviewEnabled:false};
      c.__dataHasAccessor={isInlinePreviewEnabled:true};c._getProperty=name=>data[name];
      c._setProperty=(name,value)=>{data[name]=value;if(host.localName==='ytd-app')queueMicrotask(()=>{audit.nativePreviewEnabled=value})};
      Object.defineProperty(c,'isInlinePreviewEnabled',{get:()=>data.isInlinePreviewEnabled,set:()=>{}});
    }
  })()`);
  assert.equal(await page.evaluate(()=>audit.nativePreviewEnabled),true);
  await page.locator('yt-lockup-view-model').hover();
  assert.equal(await page.evaluate(()=>audit.nativeEnters),1);
  await page.evaluate(()=>disposePresentation());await settle(page);
  assert.equal(await page.evaluate(()=>audit.nativePreviewEnabled),false);
});
test('page-data updates do not reactivate presentation work during an unfinished navigation', async t => {
  const page = await open(t, { keepHoverPreviews: true });
  await page.evaluate(() => { window.dispatchEvent(new Event('yt-navigate-start')); window.dispatchEvent(new Event('yt-page-data-updated')); });
  await settle(page); assert.equal((await snapshot(page)).app, false);
  await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-finish')));
  await settle(page); assert.equal((await snapshot(page)).app, true);
});
test('a user disabling inline playback immediately restores a still-installed computation hook', async t => {
  const page = await open(t, { keepHoverPreviews: true });
  assert.equal(await page.evaluate(() => {
    const c = document.querySelector('ytd-app').polymerController;
    c.isInlinePreviewDisabled=true; return c.computeIsInlinePreviewEnabled(true,1,true);
  }), false);
});
test('a later extension replacement is not overwritten on disposal', async t => {
  const page = await open(t, { keepHoverPreviews: true });
  assert.equal(await page.evaluate(() => {
    const c = document.querySelector('ytd-app').polymerController;
    const other = function () { return false; }; c.computeIsInlinePreviewEnabled = other;
    disposePresentation(); return c.computeIsInlinePreviewEnabled === other;
  }), true);
});

test('disable previews recomputes native eligibility and restores it without touching the queue player', async t => {
  const page = await open(t, { disableVideoPreviews: true }, `(() => {
    for(const host of document.querySelectorAll('ytd-app,ytd-rich-grid-renderer')) {
      const c=host.polymerController,data={isInlinePreviewEnabled:true}; c.miniplayerIsActive=false;
      c.__dataHasAccessor={isInlinePreviewEnabled:true}; c._getProperty=name=>data[name];
      c._setProperty=(name,value)=>{data[name]=value; audit.dispatches.push([host.localName,value]);};
      Object.defineProperty(c,'isInlinePreviewEnabled',{get:()=>data.isInlinePreviewEnabled,set:()=>{}});
    }
  })()`);
  const disabled=await snapshot(page);
  assert.equal(disabled.app,false); assert.equal(disabled.grid,false); assert.equal(disabled.active,false);
  assert.equal(disabled.sameVideo,true); assert.deepEqual(disabled.mediaEvents,[]); assert.equal(disabled.clicks,0);
  await page.evaluate(()=>disposePresentation());
  const restored=await snapshot(page); assert.equal(restored.app,true); assert.equal(restored.grid,true);
  assert.equal(restored.sameVideo,true); assert.deepEqual(restored.mediaEvents,[]);
});

test('disable previews follows supported browse and search hooks but releases them on Watch', async t => {
  const page=await open(t,{disableVideoPreviews:true},`(() => {
    for(const host of document.querySelectorAll('ytd-app,ytd-rich-grid-renderer')) host.polymerController.miniplayerIsActive=false;
  })()`);
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('yt-navigate-start')); history.pushState({},'', '/results?search_query=fixture');
    const search=document.createElement('ytd-search'); search.style.cssText='display:block;width:300px;height:100px';
    const original=function(active,state){return !active||[5,2,0].includes(state);};
    search.polymerController={miniplayerIsActive:false,miniplayerPlaybackState:1,isInlinePreviewEnabled:true,computeIsInlinePreviewEnabled:original};
    search.originalCompute=original; document.querySelector('ytd-app').append(search);
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await settle(page);
  assert.equal((await snapshot(page)).app,false);
  assert.equal(await page.evaluate(()=>document.querySelector('ytd-search').polymerController.isInlinePreviewEnabled),false);
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'','/watch?v=aaaaaaaaaaa');window.dispatchEvent(new Event('yt-navigate-finish'));});
  await settle(page);
  assert.equal((await snapshot(page)).app,true);
  assert.equal(await page.evaluate(()=>{
    const search=document.querySelector('ytd-search');return search.polymerController.computeIsInlinePreviewEnabled===search.originalCompute;
  }),true);
  assert.deepEqual((await snapshot(page)).mediaEvents,[]);
});

test('disable previews respects native opt-out, foreign replacements and unknown contracts', async t => {
  const page=await open(t,{disableVideoPreviews:true},`(() => {
    document.querySelector('ytd-app').polymerController.miniplayerIsActive=false;
  })()`);
  assert.equal(await page.evaluate(()=>{
    const app=document.querySelector('ytd-app'),controller=app.polymerController;
    window.foreignPreviewHook=function(a,b,c){return !a&&!c;}; controller.computeIsInlinePreviewEnabled=foreignPreviewHook;
    window.dispatchEvent(new Event('yt-page-data-updated')); return true;
  }),true);
  await settle(page);
  assert.equal(await page.evaluate(()=>document.querySelector('ytd-app').polymerController.computeIsInlinePreviewEnabled===foreignPreviewHook),true);
  await page.evaluate(()=>disposePresentation());
  assert.equal(await page.evaluate(()=>document.querySelector('ytd-app').polymerController.computeIsInlinePreviewEnabled===foreignPreviewHook),true);
});

test('an already disabled native inline-playback preference is not wrapped by disable previews', async t => {
  const page=await open(t,{disableVideoPreviews:true},`document.querySelector('ytd-app').polymerController.isInlinePreviewDisabled=true`);
  assert.equal(await page.evaluate(()=>{
    const host=document.querySelector('ytd-app');return host.polymerController.computeIsInlinePreviewEnabled===host.originalCompute;
  }),true);
  assert.deepEqual((await snapshot(page)).mediaEvents,[]);
});

test('pagehide keeps native preview hooks suspended despite a late navigation finish', async t => {
  const page=await open(t,{keepHoverPreviews:true});
  assert.equal((await snapshot(page)).app,true);
  await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('yt-navigate-finish'));window.dispatchEvent(new Event('yt-page-data-updated'));});
  await settle(page); assert.equal((await snapshot(page)).app,false);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await settle(page); assert.equal((await snapshot(page)).app,true);
  assert.deepEqual((await snapshot(page)).mediaEvents,[]);
});

test('initial pageshow does not replace native SPA navigation completion for preview hooks', async t => {
  const page=await open(t,{keepHoverPreviews:true});
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-start'));window.dispatchEvent(new Event('pageshow'));});
  await settle(page); assert.equal((await snapshot(page)).app,false);
  await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-finish')));
  await settle(page); assert.equal((await snapshot(page)).app,true);
});

test('disable previews requires no polling, DOM observer or repeated work for media and caption churn', async t => {
  const page=await open(t,{disableVideoPreviews:true},`(() => {
    for(const host of document.querySelectorAll('ytd-app,ytd-rich-grid-renderer')) host.polymerController.miniplayerIsActive=false;
    window.setInterval=()=>{throw Error('Unexpected preview polling');};
    window.MutationObserver=class{constructor(){throw Error('Unexpected preview observer');}};
  })()`);
  const before=await page.evaluate(()=>audit.dispatches.length);
  await page.evaluate(()=>{
    const captions=document.createElement('div');captions.className='ytp-caption-window-container';document.querySelector('#movie_player').append(captions);
    for(let i=0;i<100;i++){captions.append(document.createElement('span'));document.querySelector('video').dispatchEvent(new Event('timeupdate',{bubbles:true}));}
  });
  await settle(page);
  assert.equal(await page.evaluate(()=>audit.dispatches.length),before);
  assert.equal((await snapshot(page)).clicks,0); assert.deepEqual((await snapshot(page)).mediaEvents,[]);
});
for (const setup of [
  `document.querySelector('ytd-app').polymerController.isInlinePreviewDisabled = true`,
  `delete document.querySelector('ytd-app').polymerController.isInlinePreviewDisabled`,
  `document.querySelector('ytd-app').polymerController.computeIsInlinePreviewEnabled = null`,
  `document.querySelector('ytd-app').polymerController.computeIsInlinePreviewEnabled = function(a,b,c){return false}`,
  `Object.defineProperty(document.querySelector('ytd-app').polymerController,'computeIsInlinePreviewEnabled',{writable:false})`,
]) test(`unknown, opted-out or protected native preview contracts fail open: ${setup}`, async t => {
  const page = await open(t, { keepHoverPreviews: true }, setup);
  assert.equal((await snapshot(page)).app, false);
});
for (const [mode, initial, expected, clicks] of [
  ['elapsed', '-15:04', '0:09', 1], ['remaining', '0:09', '-15:04', 1],
  ['elapsed', '0:09', '0:09', 0], ['remaining', '-15:04', '-15:04', 0], ['native', '-15:04', '-15:04', 0],
]) test(`${mode} timer preserves the native nodes (${initial})`, async t => {
  const page = await open(t, { timeDisplayMode: mode }, `document.querySelector('.ytp-time-current').textContent=${JSON.stringify(initial)}`);
  const result = await snapshot(page);
  assert.equal(result.text, expected); assert.equal(result.clicks, clicks);
  assert.equal(result.sameVideo, true); assert.equal(result.sameWrapper, true); assert.deepEqual(result.mediaEvents, []);
  await page.evaluate(() => { for (let i=0;i<20;i++) document.querySelector('video').dispatchEvent(new Event('timeupdate')); });
  await settle(page); assert.equal((await snapshot(page)).clicks, clicks);
});
for (const setup of [
  `document.querySelector('#movie_player').classList.add('ad-showing')`,
  `document.querySelector('.ytp-time-display').classList.add('ytp-live')`,
  `document.querySelector('.ytp-time-wrapper').classList.remove('ytp-time-wrapper-delhi')`,
  `document.querySelector('.ytp-time-contents').removeAttribute('role')`,
  `document.querySelector('.ytp-time-current').textContent='LIVE'`,
  `document.querySelector('.ytp-time-duration').textContent='0:00'`,
  `document.querySelector('#movie_player').id='inline-preview-player'`,
]) test(`unsupported/live/ad timers are left unchanged: ${setup}`, async t => {
  const page = await open(t, { timeDisplayMode: 'elapsed' }, setup);
  assert.equal((await snapshot(page)).clicks, 0);
});
test('a blocked timer click is not retried on every media update', async t => {
  const page = await open(t, { timeDisplayMode: 'elapsed' }, `document.querySelector('.ytp-time-wrapper').addEventListener('click',e=>e.stopImmediatePropagation(),true)`);
  await page.evaluate(() => { for(let i=0;i<20;i++) document.querySelector('video').dispatchEvent(new Event('timeupdate')); });
  await settle(page); assert.equal((await snapshot(page)).text, '-15:04'); assert.equal((await snapshot(page)).clicks, 0);
});
for (const nativeIdentity of [true, false]) test(`a reused timer retries after a new SPA video (${nativeIdentity ? 'native identity' : 'watch URL fallback'})`, async t => {
  const page = await open(t, { timeDisplayMode: 'elapsed' }, `
    history.replaceState({}, '', '/watch?v=aaaaaaaaaaa');
    window.timerVideoId = 'aaaaaaaaaaa';
    ${nativeIdentity ? "document.querySelector('#movie_player').getVideoData = () => ({video_id: timerVideoId});" : ''}
    window.blockTimer = e => e.stopImmediatePropagation();
    document.querySelector('.ytp-time-wrapper').addEventListener('click', blockTimer, true);
  `);
  assert.equal((await snapshot(page)).text, '-15:04');
  await page.evaluate(() => {
    document.querySelector('.ytp-time-wrapper').removeEventListener('click', blockTimer, true);
    window.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/watch?v=bbbbbbbbbbb');
    timerVideoId = 'bbbbbbbbbbb';
    window.dispatchEvent(new Event('yt-navigate-finish'));
    document.querySelector('video').dispatchEvent(new Event('loadedmetadata'));
  });
  await settle(page);
  const result = await snapshot(page);
  assert.equal(result.text, '0:09'); assert.equal(result.clicks, 1);
  assert.equal(result.sameVideo, true); assert.equal(result.sameWrapper, true); assert.deepEqual(result.mediaEvents, []);
});
test('same-video navigation and temporarily missing identity do not retry a blocked timer', async t => {
  const page = await open(t, { timeDisplayMode: 'elapsed' }, `
    history.replaceState({}, '', '/watch?v=aaaaaaaaaaa');
    document.querySelector('#movie_player').getVideoData = () => ({video_id: 'aaaaaaaaaaa'});
    window.blockTimer = e => e.stopImmediatePropagation();
    document.querySelector('.ytp-time-wrapper').addEventListener('click', blockTimer, true);
  `);
  await page.evaluate(() => document.querySelector('.ytp-time-wrapper').removeEventListener('click', blockTimer, true));
  for (const url of ['/watch?v=aaaaaaaaaaa&t=10', '/', '/results?search_query=fixture']) {
    await page.evaluate(url => {
      window.dispatchEvent(new Event('yt-navigate-start'));
      history.pushState({}, '', url);
      window.dispatchEvent(new Event('yt-navigate-finish'));
      document.querySelector('video').dispatchEvent(new Event('loadedmetadata'));
      window.dispatchEvent(new Event('yt-page-data-updated'));
    }, url);
    await settle(page);
  }
  await page.evaluate(() => {
    delete document.querySelector('#movie_player').getVideoData;
    window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow'));
    for (let i = 0; i < 20; i++) document.querySelector('video').dispatchEvent(new Event('timeupdate'));
  });
  await settle(page);
  assert.equal((await snapshot(page)).text, '-15:04'); assert.equal((await snapshot(page)).clicks, 0);
});
test('preview policy and timer toggles preserve a genuinely advancing miniplayer clock', { timeout: 15000 }, async t => {
  const page = await open(t, { keepHoverPreviews: true, timeDisplayMode: 'elapsed' });
  const samples = 8000 * 12, wav = Buffer.alloc(44 + samples, 128);
  wav.write('RIFF'); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(samples, 40);
  await page.evaluate(async src => {
    const video = document.querySelector('video'); video.muted=true; video.src=src; await video.play();
  }, `data:audio/wav;base64,${wav.toString('base64')}`);
  await page.waitForFunction(() => document.querySelector('video').currentTime > .15);
  const before = await page.evaluate(() => { audit.mediaEvents=[]; const v=document.querySelector('video'); return {time:v.currentTime,now:performance.now(),src:v.currentSrc}; });
  await page.evaluate(() => {
    const wrapper=document.querySelector('.ytp-time-wrapper'); wrapper.click();
    document.querySelector('video').dispatchEvent(new Event('timeupdate'));
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.locator('ytd-rich-item-renderer a').hover();
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => { const v=document.querySelector('video'); return {time:v.currentTime,now:performance.now(),src:v.currentSrc,paused:v.paused,events:audit.mediaEvents}; });
  assert.equal(after.src, before.src); assert.equal(after.paused, false); assert.deepEqual(after.events, []);
  assert.ok(after.time > before.time + .2);
  assert.ok(Math.abs(after.time-before.time-(after.now-before.now)/1000) < .35);
  assert.equal((await snapshot(page)).text, '0:09');
});
