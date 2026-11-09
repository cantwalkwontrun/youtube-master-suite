// Language: en-GB. Isolated synthetic SponsorBlock boundary transition regression.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const base = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const styles = `<style>
#movie_player{width:1600px;height:700px}
.ytp-progress-bar-container{position:absolute;bottom:40px;left:8px;right:8px;height:16px}
.ytp-progress-bar{height:100%}
.ytp-tooltip{position:absolute;bottom:220px;left:500px;width:200px;height:112px;font-size:14px;transition:transform 250ms linear}
.ytp-tooltip-bg{position:absolute;inset:0;width:200px;height:112px;background:#444}
.ytp-tooltip-text-wrapper{position:absolute;inset:0;width:200px;pointer-events:none}
.ytp-tooltip-edu{position:absolute;bottom:116px;width:200px;font-size:12px;line-height:16px}
.ytp-tooltip-title{position:absolute;top:116px;width:200px;font-size:14px;line-height:16px}
.sponsorCategoryTooltip{top:134px}
.ytp-tooltip:not(.sponsorCategoryTooltipVisible) .sponsorCategoryTooltip{display:none!important}
.ytp-tooltip-bottom-text{position:absolute;top:174px;width:200px;height:26px}
.ytp-tooltip.sponsorCategoryTooltipVisible .ytp-tooltip-edu{transform:translateY(-1em)!important}
.ytp-tooltip.sponsorCategoryTooltipVisible{transform:translateY(-1em)!important}
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorHasOriginalTooltip{transform:translateY(-2em)!important}
#movie_player:not(.ytp-big-mode) .ytp-tooltip.sponsorCategoryTooltipVisible > .ytp-tooltip-text-wrapper{transform:translateY(1em)!important}
</style>`;
const markup = `<div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
<div class="ytp-tooltip ytp-preview"><div class="ytp-tooltip-text-wrapper"><div class="ytp-tooltip-edu">Pull up for precise seeking</div>
<div class="ytp-tooltip-title">Example chapter</div><div class="ytp-tooltip-title sponsorCategoryTooltip" style="display:none">Sponsor</div>
<div class="ytp-tooltip-bottom-text"><span class="ytp-tooltip-text">5:57</span></div></div><div class="ytp-tooltip-bg"></div></div>`;
let browser;
before(async()=>{browser=await launchFixtureBrowser()});
after(async()=>{await browser?.close()});
async function fixture(t){
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{timelinePreviewSize:'large',theatreMode:false}})));
  await page.route('**/*',route=>route.request().url().startsWith('https://www.youtube.com/watch?')
    ?route.fulfill({contentType:'text/html',body:base.replace('</head>',styles+'</head>')
      .replace('<video class="html5-main-video"></video>','<video class="html5-main-video"></video>'+markup)}) : route.abort());
  t.after(async()=>{try{assert.deepEqual(errors,[])}finally{await context.close()}});
  // Explicit Suite health and geometry checks below define fixture readiness.
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: suite });
  await waitForSuiteHealth(page,manifest.registeredModules,{timeoutMs:10000,errors});
  return page;
}
test('Large remains stable across repeated sponsor-boundary reversals lasting longer than two seconds',async t=>{
  const page=await fixture(t);
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(200);
  const samples=await page.evaluate(async()=>{
    const tip=document.querySelector('.ytp-tooltip'), label=tip.querySelector('.sponsorCategoryTooltip');
    const track=document.querySelector('.ytp-progress-bar-container'), start=performance.now(), values=[];
    let tick=0;
    while(performance.now()-start<3200){
      const elapsed=performance.now()-start, active=Math.floor(elapsed/110)%2===0;
      tip.classList.toggle('sponsorCategoryTooltipVisible',active);
      if(active){label.textContent='Sponsor';label.style.removeProperty('display')}
      tip.style.left=`${500+(tick++%4)*2}px`;
      track.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:500,clientY:650}));
      await new Promise(requestAnimationFrame);
      await new Promise(resolve=>setTimeout(resolve,0));
      values.push({elapsed:Math.round(elapsed),active,hovered:track.matches(':hover'),
        width:tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,
        transform:getComputedStyle(tip).transform, scale:getComputedStyle(tip).scale});
    }
    return values;
  });
  const bad=samples.filter(sample=>sample.hovered&&Math.abs(sample.width-480)>1);
  assert.ok(!bad.length,JSON.stringify({total:samples.length,bad:bad.slice(0,8)}));
  await page.mouse.move(1,1);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.ytp-tooltip').evaluate(node=>node.style.scale),'');
});
test('a single foreign transition exceeding two seconds stays native and releases on exit',async t=>{
  const page=await fixture(t);
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(200);
  await page.evaluate(()=>{
    const tip=document.querySelector('.ytp-tooltip');
    tip.style.transition='transform 3s linear';
    tip.classList.add('sponsorCategoryTooltipVisible');
    tip.querySelector('.sponsorCategoryTooltip').style.removeProperty('display');
  });
  await page.waitForTimeout(350);
  const observed=await page.locator('.ytp-tooltip').evaluate(tip=>({scale:tip.style.scale,width:tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width}));
  assert.equal(observed.scale,''); assert.ok(observed.width<210,JSON.stringify(observed));
  await page.mouse.move(1,1); await page.waitForTimeout(100);
  assert.equal(await page.locator('.ytp-tooltip').evaluate(tip=>tip.style.scale),'');
});
test('a transition to an unexpected foreign target remains native',async t=>{
  const page=await fixture(t);
  await page.addStyleTag({content:'#movie_player .ytp-tooltip.sponsorCategoryTooltipVisible{transform:translateY(-250px)!important}'});
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(200);
  await page.locator('.ytp-tooltip').evaluate(tip=>{tip.classList.add('sponsorCategoryTooltipVisible');tip.querySelector('.sponsorCategoryTooltip').style.removeProperty('display')});
  await page.waitForTimeout(120);
  const observed=await page.locator('.ytp-tooltip').evaluate(tip=>({scale:tip.style.scale,width:tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width}));
  assert.equal(observed.scale,''); assert.ok(observed.width<210,JSON.stringify(observed));
});
test('a transition from an unexpected foreign start remains native',async t=>{
  const page=await fixture(t);
  await page.addStyleTag({content:'#movie_player .ytp-tooltip:not(.sponsorCategoryTooltipVisible){transform:translateY(-250px)!important}'});
  await page.waitForTimeout(350);
  await page.locator('.ytp-tooltip').evaluate(tip=>{tip.classList.add('sponsorCategoryTooltipVisible');tip.querySelector('.sponsorCategoryTooltip').style.removeProperty('display')});
  await page.waitForTimeout(50);
  await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(50);
  const observed=await page.locator('.ytp-tooltip').evaluate(tip=>({scale:tip.style.scale,width:tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,transform:getComputedStyle(tip).transform}));
  assert.equal(observed.scale,''); assert.ok(observed.width<210,JSON.stringify(observed));
});
test('a first observed transition between documented nonzero sponsor offsets stays large',async t=>{
  const page=await fixture(t);
  await page.evaluate(()=>{
    const tip=document.querySelector('.ytp-tooltip');
    tip.classList.add('sponsorCategoryTooltipVisible');
    tip.querySelector('.sponsorCategoryTooltip').style.removeProperty('display');
  });
  await page.waitForTimeout(350);
  await page.evaluate(()=>document.querySelector('.ytp-tooltip').classList.add('sponsorHasOriginalTooltip'));
  await page.waitForTimeout(60);
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(75);
  const observed=await page.locator('.ytp-tooltip').evaluate(tip=>({scale:tip.style.scale,width:tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,transform:getComputedStyle(tip).transform}));
  assert.ok(Math.abs(observed.width-480)<1,JSON.stringify(observed));
});
