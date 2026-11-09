// Language: en-GB. Cached native-template structure with synthetic geometry/text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth, navigateWatchFixture } from './fixture-browser.mjs';

const SUITE = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const BASE = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
const CSS = `<style>
  #movie_player { width:1600px; height:700px; }
  .ytp-progress-bar-container { position:absolute; bottom:40px; left:8px; right:8px; height:16px; }
  .ytp-progress-bar { height:100%; }
  .ytp-tooltip { position:absolute; bottom:100px; left:500px; width:200px; height:112px; }
  .ytp-tooltip-bg { position:absolute; inset:0; width:200px; height:112px; background:#444; border-radius:8px; }
  .ytp-tooltip-duration,.ytp-tooltip-image,.ytp-tooltip-keyboard-shortcut { display:none; }
  .ytp-tooltip-text-wrapper { position:absolute; inset:0; width:200px; pointer-events:none; }
  .ytp-tooltip-edu { position:absolute; bottom:116px; width:200px; font-size:12px; line-height:16px; color:white; }
  .ytp-tooltip-title { position:absolute; top:116px; width:200px; font-size:14px; line-height:16px; color:white; }
  .ytp-tooltip-bottom-text { position:absolute; top:154px; width:200px; height:26px; text-align:center; }
  .ytp-tooltip-text { font-size:14px; line-height:18px; color:white; }
</style>`;
const MARKUP = `<div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
  <div class="ytp-tooltip ytp-preview">
    <div class="ytp-tooltip-text-wrapper">
      <div class="ytp-tooltip-edu"><span>Pull up for precise seeking</span></div>
      <div class="ytp-tooltip-image"></div>
      <div class="ytp-tooltip-title"><span>Example chapter title<br>Chapter 4 — Example section</span><div class="ytp-tooltip-keyboard-shortcut">K</div></div>
      <div class="ytp-tooltip-bottom-text"><span class="ytp-tooltip-text">10:31 Example chapter</span><div class="ytp-tooltip-keyboard-shortcut">K</div></div>
    </div>
    <div class="ytp-tooltip-bg"><div class="ytp-tooltip-duration">1:00:00</div></div>
  </div>`;
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
async function fixture(t) {
  const context = await browser.newContext({viewport:{width:1920,height:1080}});
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({version:1,values:{timelinePreviewSize:'large',theatreMode:false}})));
  const fixtureHtml = BASE.replace('</head>',CSS+'</head>')
      .replace('<video class="html5-main-video"></video>','<video class="html5-main-video"></video>'+MARKUP);
  await page.route('**/*', route => route.abort());
  t.after(async () => { try { assert.deepEqual(errors,[]); } finally { await context.close(); } });
  // Explicit Suite health and geometry checks below define fixture readiness.
  await navigateWatchFixture(page, { html: fixtureHtml });
  await page.addScriptTag({ content: SUITE });
  await waitForSuiteHealth(page,MANIFEST.registeredModules,{timeoutMs:10000,errors});
  return page;
}
async function dimensions(page) {
  return page.evaluate(() => {
    const tip=document.querySelector('.ytp-tooltip'), image=tip.querySelector('.ytp-tooltip-bg');
    const r=n=>{ const b=n.getBoundingClientRect(); return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}; };
    return {scale:tip.style.scale,image:r(image),tip:r(tip),title:r(tip.querySelector('.ytp-tooltip-title'))};
  });
}
test('cached-template sibling wrapper with two chapter lines honours Large', async t => {
  const page=await fixture(t); await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  const g=await dimensions(page);
  assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
});
test('focus return restores Large when the pointer remains over the timeline', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.ok(Math.abs((await dimensions(page)).image.width-480)<1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await dimensions(page)).scale,'');
  assert.equal(await page.locator('.ytp-progress-bar').evaluate(node=>node.matches(':hover')),true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(200);
  const g=await dimensions(page);
  assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(100);
  assert.ok(Math.abs((await dimensions(page)).image.width-480)<1,'repeated focus must not undo the active preview');
});
test('focus return does not revive a departed, detached or navigated timeline', async t => {
  for (const scenario of ['departed','detached','navigation']) {
    const page=await fixture(t);
    await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
    assert.ok(Math.abs((await dimensions(page)).image.width-480)<1,scenario);
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    if (scenario==='departed') await page.mouse.move(2,2);
    if (scenario==='detached') await page.locator('.ytp-progress-bar-container').evaluate(node=>node.remove());
    if (scenario==='navigation') await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-start')));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(150);
    assert.equal((await dimensions(page)).scale,'',scenario);
  }
});
test('visibility and focus event ordering restores only when the document can receive focus', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.ok(Math.abs((await dimensions(page)).image.width-480)<1);
  await page.evaluate(() => {
    window.fixtureHidden=true; window.fixtureFocused=false;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.fixtureHidden});
    document.hasFocus=()=>window.fixtureFocused;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(100); assert.equal((await dimensions(page)).scale,'');
  await page.evaluate(() => {
    window.fixtureHidden=false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100); assert.equal((await dimensions(page)).scale,'');
  await page.evaluate(() => {
    window.fixtureFocused=true;
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(150);
  const g=await dimensions(page); assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
});
test('a separate chapter title alongside the native time-and-title pill honours Large', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper => {
    const title=wrapper.querySelector('.ytp-tooltip-title');
    title.textContent='Example chapter';
    title.style.cssText='position:absolute;top:116px;width:200px;font-size:14px;line-height:16px;color:white;text-align:center';
    const bottom=wrapper.querySelector('.ytp-tooltip-bottom-text');
    bottom.style.display='none';
    const pill=document.createElement('div'); pill.className='ytp-tooltip-progress-bar-pill';
    pill.style.cssText='position:absolute;top:140px;left:30px;width:140px;height:24px;line-height:24px;border-radius:15px;background:rgba(0,0,0,.5);color:white;text-align:center';
    const time=document.createElement('span'); time.className='ytp-tooltip-progress-bar-pill-time-stamp'; time.textContent='4:25';
    const chapter=document.createElement('span'); chapter.className='ytp-tooltip-progress-bar-pill-title'; chapter.textContent=' Example chapter';
    pill.append(time,chapter);wrapper.append(pill);
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  const g=await dimensions(page);
  assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
});
test('late separate chapter and native time-and-title pill stay Large while hovering', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-title').evaluate(node=>{node.style.display='none';});
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.ok(Math.abs((await dimensions(page)).image.width-480)<1);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper=>{
    const title=wrapper.querySelector('.ytp-tooltip-title');
    title.textContent='Example chapter'; title.style.cssText='position:absolute;top:116px;width:200px;font-size:14px;line-height:16px;color:white;text-align:center';
    wrapper.querySelector('.ytp-tooltip-bottom-text').style.display='none';
    const pill=document.createElement('div');pill.className='ytp-tooltip-progress-bar-pill';
    pill.style.cssText='position:absolute;top:140px;left:30px;width:140px;height:24px;line-height:24px;border-radius:15px;background:rgba(0,0,0,.5);color:white;text-align:center';
    const time=document.createElement('span');time.className='ytp-tooltip-progress-bar-pill-time-stamp';time.textContent='4:25';
    const chapter=document.createElement('span');chapter.className='ytp-tooltip-progress-bar-pill-title';chapter.textContent=' Example chapter';
    pill.append(time,chapter);wrapper.append(pill);
  });
  await page.waitForTimeout(300);
  const g=await dimensions(page);assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
});
test('transparent chapter label padding must not force Large to native when glyphs clear the image', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-title').evaluate(node => {
    node.style.top='100px'; node.style.paddingTop='16px';
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  const g=await dimensions(page);
  assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
});
test('late passive chapter text in the native wrapper keeps the selected Large width', async t => {
  const page=await fixture(t); await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.ok(Math.abs((await dimensions(page)).image.width-480)<1);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper => {
    wrapper.querySelector('.ytp-tooltip-bottom-text').style.top='180px';
    const extra=document.createElement('div'); extra.className='fixture-passive-chapter-extra';
    extra.style.cssText='position:absolute;top:154px;left:0;width:200px;font-size:14px;line-height:16px;color:white';
    extra.textContent='Additional chapter information'; wrapper.append(extra);
  });
  await page.waitForTimeout(150);
  const g=await dimensions(page); assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
});
test('late interactive content in the native wrapper retains the safe native fallback', async t => {
  const page=await fixture(t); await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper => {
    const button=document.createElement('button'); button.textContent='Unknown action'; wrapper.append(button);
  });
  await page.waitForTimeout(150);
  assert.equal((await dimensions(page)).scale,'');
});
test('painted chapter label overlapping the image is still declined', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-title').evaluate(node => {
    node.style.cssText='top:100px;padding-top:16px;background:rgb(255,0,0)';
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.equal((await dimensions(page)).scale,'');
});
test('painted generated chapter content overlapping the image retains native fallback', async t => {
  const page=await fixture(t);
  await page.addStyleTag({content:'.ytp-tooltip-title::before { content:""; position:absolute; inset:0; background:red; }'});
  await page.locator('.ytp-tooltip-title').evaluate(node => { node.style.cssText='top:100px;padding-top:16px'; });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.equal((await dimensions(page)).scale,'');
});
test('offset painted generated content cannot escape its safe parent box', async t => {
  const page=await fixture(t);
  await page.addStyleTag({content:'.ytp-tooltip-title::before { content:""; position:absolute; top:-60px; left:0; width:200px; height:40px; background:red; }'});
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.equal((await dimensions(page)).scale,'');
});
test('empty nonpainting generated content does not block Large', async t => {
  const page=await fixture(t);
  await page.addStyleTag({content:'.ytp-tooltip-title::before { content:""; position:absolute; inset:0; background:transparent; }'});
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  const g=await dimensions(page); assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
});
test('painted native timestamp pill overlapping the image is declined even when its text clears the image', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-bottom-text').evaluate(pill => {
    pill.style.cssText='top:100px;padding-top:18px;border-radius:20px;background:rgba(0,0,0,.5)';
    pill.querySelector('.ytp-tooltip-text').textContent='10:31';
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.equal((await dimensions(page)).scale,'');
});
test('wide native timestamp pill paint stays within viewport bounds or retains native sizing', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(tip => { tip.style.left='8px'; });
  await page.locator('.ytp-tooltip-bottom-text').evaluate(pill => {
    pill.style.cssText='top:154px;left:-80px;width:360px;border-radius:20px;background:rgba(0,0,0,.5)';
    pill.querySelector('.ytp-tooltip-text').textContent='10:31';
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  const safe=await page.evaluate(() => {
    const tip=document.querySelector('.ytp-tooltip'); if (!tip.style.scale) return true;
    const pill=tip.querySelector('.ytp-tooltip-bottom-text').getBoundingClientRect();
    const player=document.querySelector('#movie_player').getBoundingClientRect();
    return pill.left>=Math.max(0,player.left)-1 && pill.right<=Math.min(innerWidth,player.right)+1;
  });
  assert.equal(safe,true);
});
test('unknown passive-looking ARIA controls in the wrapper retain native fallback', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper => {
    const control=document.createElement('div'); control.setAttribute('role','checkbox'); control.tabIndex=-1;
    control.textContent='Unknown control'; wrapper.append(control);
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.equal((await dimensions(page)).scale,'');
});
test('unknown media inside the native text wrapper keeps native presentation', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper => {
    const image=document.createElement('img'); image.alt='Unknown media'; image.width=40; image.height=30;
    wrapper.append(image);
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.equal((await dimensions(page)).scale,'');
});
test('native-style education SVG remains supported with stacked chapters', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-edu').evaluate(label => {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 10 10'); svg.setAttribute('width','10'); svg.setAttribute('height','10');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d','M1 7 L5 3 L9 7');
    svg.append(path); label.prepend(svg);
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  const g=await dimensions(page); assert.ok(Math.abs(g.image.width-480)<1,JSON.stringify(g));
});
test('wrapped passive chapter text remains visible and bounded', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper => {
    wrapper.querySelector('.ytp-tooltip-bottom-text').style.top='235px';
    const extra=document.createElement('div'); extra.className='fixture-passive-chapter-extra';
    extra.style.cssText='position:absolute;top:154px;left:0;width:200px;font-size:14px;line-height:16px;color:white';
    extra.textContent='Additional neutral chapter information wrapping over several lines'; wrapper.append(extra);
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  const g=await dimensions(page); assert.notEqual(g.scale,'',JSON.stringify(g));
  const fits=await page.evaluate(() => {
    const tip=document.querySelector('.ytp-tooltip'), image=tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect();
    const player=document.querySelector('#movie_player').getBoundingClientRect(), track=document.querySelector('.ytp-progress-bar-container').getBoundingClientRect();
    const extra=tip.querySelector('.fixture-passive-chapter-extra'), range=document.createRange(); range.selectNodeContents(extra);
    return [...range.getClientRects()].every(r => r.left>=player.left-1 && r.right<=player.right+1 &&
      r.top>=player.top-1 && r.bottom<=track.top+1 && !(r.left<image.right-1 && r.right>image.left+1 && r.top<image.bottom-1 && r.bottom>image.top+1));
  });
  assert.equal(fits,true);
});
test('oversized passive chapter text retains bounded native fallback', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper => {
    const extra=document.createElement('div'); extra.className='fixture-passive-chapter-extra';
    extra.textContent='x'.repeat(2049); wrapper.append(extra);
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.equal((await dimensions(page)).scale,'');
});
test('later extension font ownership on passive chapter text survives hover exit', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip-text-wrapper').evaluate(wrapper => {
    wrapper.querySelector('.ytp-tooltip-bottom-text').style.top='180px';
    const extra=document.createElement('div'); extra.className='fixture-passive-chapter-extra';
    extra.style.cssText='position:absolute;top:154px;width:200px;font-size:14px;line-height:16px';
    extra.textContent='Additional chapter information'; wrapper.append(extra);
  });
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(150);
  assert.notEqual((await dimensions(page)).scale,'');
  await page.locator('.fixture-passive-chapter-extra').evaluate(node => node.style.setProperty('font-size','17px','important'));
  await page.waitForTimeout(150); await page.mouse.move(10,10);
  assert.deepEqual(await page.locator('.fixture-passive-chapter-extra').evaluate(node =>
    [node.style.getPropertyValue('font-size'),node.style.getPropertyPriority('font-size')]),['17px','important']);
});
