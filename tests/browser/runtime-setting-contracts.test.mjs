// Language: en-GB. Full generated Suite settings exercised on synthetic native surfaces.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
let browser, launch;
before(async () => { browser = await (launch = launchFixtureBrowser()); });
after(async () => { await (await launch)?.close(); });

async function open(t, values) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await context.addInitScript(values => {
    // Installed Firefox also runs init scripts in the opaque initial document.
    // Seed only the intercepted fixture origin; keep runtime errors asserted.
    if (location.origin === 'https://www.youtube.com') localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1,
      values: { theatreMode: false, miniplayerEnabled: false, ...values } }));
  }, values);
  await context.addInitScript({ content: source });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true, errors });
  return page;
}

for (const key of ['hideNextButton', 'hidePlayerWatermark']) for (const enabled of [false, true])
test(`generated ${key}=${enabled} changes its target and preserves unrelated player controls`, async t => {
  const page = await open(t, { [key]: enabled });
  await page.evaluate(key => {
    const target = document.createElement('button'); target.id = 'runtime-target';
    target.className = key === 'hideNextButton' ? 'ytp-next-button' : 'ytp-watermark';
    target.style.cssText = 'width:40px;height:30px'; target.textContent = 'Native target';
    document.getElementById('movie_player').append(target);
  }, key);
  assert.equal(await page.locator('#runtime-target').isVisible(), !enabled);
  assert.equal(await page.locator('.ytp-settings-button').isVisible(), true);
  assert.equal(await page.locator('video').isVisible(), true);
});

for (const [mode, expected] of [['default', 'rgb(34, 34, 34)'], ['black', 'rgb(0, 0, 0)'], ['transparent', 'rgba(0, 0, 0, 0)']])
test(`generated playerBackground=${mode} changes native paint without changing video geometry`, async t => {
  const page = await open(t, { playerBackground: mode });
  assert.equal(await page.locator('#movie_player').evaluate(node => getComputedStyle(node).backgroundColor), expected);
  assert.deepEqual(await page.locator('video').evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })),
    { width: 640, height: 320 });
});

for (const enabled of [false, true]) test(`generated yellowCaptions=${enabled} changes glyph paint only in watch and hover captions`, async t => {
  const page = await open(t, { yellowCaptions: enabled });
  await page.evaluate(() => {
    const markup = '<span class="ytp-caption-segment" style="color:white;background:rgb(10,20,30);opacity:.7;font-size:19px">Synthetic caption</span>';
    document.querySelector('.ytp-caption-window-container').innerHTML = markup;
    const preview = document.createElement('ytd-video-preview'); preview.id = 'runtime-hover'; preview.innerHTML = markup;
    const outside = document.createElement('div'); outside.id = 'runtime-outside'; outside.innerHTML = markup;
    document.body.append(preview, outside);
  });
  for (const host of ['#movie_player', '#runtime-hover', '#runtime-outside']) {
    assert.deepEqual(await page.locator(host + ' .ytp-caption-segment').evaluate(node => {
      const css = getComputedStyle(node); return { colour: css.color, background: css.backgroundColor, opacity: css.opacity, fontSize: css.fontSize };
    }), { colour: enabled && host !== '#runtime-outside' ? 'rgb(255, 227, 110)' : 'rgb(255, 255, 255)',
      background: 'rgb(10, 20, 30)', opacity: '0.7', fontSize: '19px' });
  }
});

async function wheel(page, right = false) {
  await page.locator('video').hover();
  await page.evaluate(() => {
    window.runtimeWheelObserved = false;
    window.addEventListener('wheel', () => queueMicrotask(() => { window.runtimeWheelObserved = true; }), { capture: true, once: true });
  });
  if (right) await page.mouse.down({ button: 'right' });
  try { await page.mouse.wheel(0, -60); await page.waitForFunction(() => runtimeWheelObserved); }
  finally { if (right) await page.mouse.up({ button: 'right' }); }
}

for (const step of ['1', '2', '5', '10']) for (const requireRight of [false, true])
test(`generated wheelStep=${step}, right-button requirement=${requireRight} applies the configured volume increment`, async t => {
  const page = await open(t, { wheelVolume: true, wheelStep: step, requireRightMouseButtonForWheelVolume: requireRight });
  await page.locator('video').evaluate(video => { video.volume = .5; video.muted = false; });
  if (requireRight) {
    await wheel(page);
    assert.equal(await page.locator('video').evaluate(video => video.volume), .5, 'ordinary scrolling must not adjust volume');
  }
  await wheel(page, requireRight);
  assert.equal(await page.locator('video').evaluate(video => Math.round(video.volume * 100)), 50 + Number(step));
});

for (const right of [false, true]) test(`disabled generated wheel volume preserves native volume with right button=${right}`, async t => {
  const page = await open(t, { wheelVolume: false, requireRightMouseButtonForWheelVolume: false, wheelStep: '10' });
  await page.locator('video').evaluate(video => { video.volume = .37; video.muted = true; });
  await wheel(page, right);
  assert.deepEqual(await page.locator('video').evaluate(video => [video.volume, video.muted]), [.37, true]);
});

const mediaState = page => page.evaluate(() => {
  const video=document.querySelector('#movie_player video');
  return {time:video.currentTime,paused:video.paused,volume:video.volume,url:location.href};
});

for(const [key,label] of [['hideShareButton','Share'],['hideThanksButton','Thanks'],['hideInlineSaveButton','Save'],['hideClipButton','Clip']])
for(const enabled of [false,true]) test(`generated watch action ${key}=${enabled} changes only its native target`,async t=>{
  const page=await open(t,{[key]:enabled}),before=await mediaState(page);
  await page.evaluate(label=>{
    const actions=document.createElement('div');actions.id='actions';
    const menu=document.createElement('ytd-menu-renderer');
    const row=document.createElement('yt-button-view-model');row.id='runtime-watch-action';
    row.style.cssText='display:inline-block;width:130px;height:34px';
    const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',label);row.append(button);
    const unrelated=document.createElement('yt-button-view-model');unrelated.id='runtime-bookmark';
    unrelated.innerHTML='<button>Bookmark</button>';window.runtimeBookmarkClicks=0;unrelated.querySelector('button').onclick=()=>runtimeBookmarkClicks++;
    const vote=document.createElement('div');vote.id='like-button';vote.innerHTML='<yt-button-view-model id="runtime-vote"><button>Share</button></yt-button-view-model>';
    menu.append(row,unrelated,vote);actions.append(menu);document.querySelector('ytd-watch-metadata').append(actions);
  },label);
  if(enabled)await page.locator('#runtime-watch-action').waitFor({state:'hidden'});
  else {await page.locator('#runtime-watch-action').waitFor({state:'visible'});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
  assert.equal(await page.locator('#runtime-watch-action').isVisible(),!enabled);
  assert.equal(await page.locator('#runtime-vote').isVisible(),true);
  await page.locator('#runtime-bookmark button').click();
  assert.equal(await page.evaluate(()=>runtimeBookmarkClicks),1);
  assert.deepEqual(await mediaState(page),before);
});

for(const enabled of [false,true]) test(`generated collapseEmptySidebar=${enabled} controls an empty native rail and preserves extension content`,async t=>{
  const page=await open(t,{collapseEmptySidebar:enabled,hideRelated:true}),before=await mediaState(page);
  await page.evaluate(()=>{
    const watch=document.querySelector('ytd-watch-flexy');watch.setAttribute('is-two-columns','');
    const secondary=watch.querySelector('#secondary');secondary.classList.add('ytd-watch-flexy');
    const related=document.createElement('div');related.id='related';related.style.display='none';secondary.append(related);
  });
  if(enabled)await page.waitForFunction(()=>document.querySelector('ytd-watch-flexy').getAttribute('data-ywlc-empty-secondary-rail')==='1');
  else await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('ytd-watch-flexy').evaluate(node=>node.getAttribute('data-ywlc-empty-secondary-rail')==='1'),enabled);
  const width=await page.locator('#secondary').evaluate(node=>node.getBoundingClientRect().width);
  assert.equal(width,enabled?0:374);
  await page.evaluate(()=>{
    const extension=document.createElement('div');extension.id='sponsorBlockPopupContainer';extension.style.cssText='width:250px;height:70px';extension.textContent='Synthetic SponsorBlock surface';
    document.querySelector('#secondary').append(extension);
  });
  await page.waitForFunction(()=>!document.querySelector('ytd-watch-flexy').hasAttribute('data-ywlc-empty-secondary-rail'));
  assert.equal(await page.locator('#sponsorBlockPopupContainer').isVisible(),true);
  assert.ok(await page.locator('#secondary').evaluate(node=>node.getBoundingClientRect().width)>0);
  assert.deepEqual(await mediaState(page),before);
});

for(const enabled of [false,true]) test(`generated queueInfo=${enabled} controls only the floating player's queue status`,async t=>{
  const page=await open(t,{miniplayerEnabled:true,queueInfo:enabled}),before=await mediaState(page);
  await page.evaluate(()=>{
    const host=document.getElementById('player'),anchor=document.createElement('div');anchor.id='single-column-container';host.before(anchor);anchor.append(host);
    const panel=document.querySelector('ytd-playlist-panel-renderer');
    for(const id of ['aaaaaaaaaaa','bbbbbbbbbbb']) {
      const item=document.createElement('ytd-playlist-panel-video-renderer'),link=document.createElement('a'),title=document.createElement('span');
      link.href='/watch?v='+id;title.id='video-title';title.textContent=id==='aaaaaaaaaaa'?'Synthetic current queue title':'Synthetic following title';
      link.append(title);item.append(link);panel.append(item);
    }
    window.scrollTo(0,800);
  });
  await page.waitForFunction(()=>document.body.classList.contains('ytsmp-scroll-miniplayer-active'));
  if(enabled)await page.locator('#ytsmp-compact-queue-info').waitFor({state:'visible'});
  else await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#ytsmp-compact-queue-info').count(),enabled?1:0);
  if(enabled)assert.match(await page.locator('#ytsmp-compact-queue-info').textContent(),/Queue 1 \/ 2.*Synthetic current queue title/);
  assert.equal(await page.locator('#ytsmp-corner-button').isVisible(),true);
  assert.equal(await page.locator('.ytp-settings-button').isVisible(),true);
  assert.equal(await page.locator('#movie_player video').evaluate(video=>video.parentElement.id),'movie_player');
  assert.deepEqual(await mediaState(page),before);
});
