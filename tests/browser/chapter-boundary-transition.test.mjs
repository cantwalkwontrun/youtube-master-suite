// Language: en-GB. Synthetic overlapping SponsorBlock chapter-boundary checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const base = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const styles = `<style>
#movie_player {width:1600px;height:700px}
.ytp-progress-bar-container{position:absolute;bottom:40px;left:8px;right:8px;height:16px}
.ytp-progress-bar{height:100%}
.ytp-tooltip{position:absolute;bottom:220px;left:500px;width:200px;height:112px;font-size:14px}
.ytp-tooltip-bg{position:absolute;inset:0;width:200px;height:112px;background:#444}
.ytp-tooltip-text-wrapper{position:absolute;inset:0;width:200px;pointer-events:none}
.ytp-tooltip-edu{position:absolute;bottom:116px;width:200px;font-size:12px;line-height:16px}
.ytp-tooltip-title{position:absolute;top:116px;width:200px;font-size:14px;line-height:16px}
.sponsorCategoryTooltip{top:134px}
.sponsorCategoryTooltip + .sponsorCategoryTooltip{top:150px}
.ytp-tooltip-bottom-text{position:absolute;top:174px;width:200px;height:26px}
.ytp-tooltip.sponsorCategoryTooltipVisible .ytp-tooltip-edu{transform:translateY(-1em)!important}
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips .ytp-tooltip-edu{transform:translateY(-2em)!important}
.ytp-tooltip.sponsorCategoryTooltipVisible{transform:translateY(-1em)!important}
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips{transform:translateY(-2em)!important}
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorHasOriginalTooltip{transform:translateY(-2em)!important}
#movie_player:not(.ytp-big-mode) .ytp-tooltip.sponsorCategoryTooltipVisible > .ytp-tooltip-text-wrapper{transform:translateY(1em)!important}
#movie_player:not(.ytp-big-mode) .ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips > .ytp-tooltip-text-wrapper{transform:translateY(2em)!important}
</style>`;
const markup = `<div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
<div class="ytp-tooltip ytp-preview"><div class="ytp-tooltip-text-wrapper"><div class="ytp-tooltip-edu">Pull up for precise seeking</div>
<div class="ytp-tooltip-title" style="display:none">Example chapter</div>
<div class="ytp-tooltip-title sponsorCategoryTooltip" style="display:none">Sponsor</div>
<div class="ytp-tooltip-title sponsorCategoryTooltip" style="display:none">Chapter</div>
<div class="ytp-tooltip-bottom-text"><span class="ytp-tooltip-text">5:57</span></div></div><div class="ytp-tooltip-bg"></div></div>`;
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
for (const transition of [false, true]) for (const scenario of ['twoSponsorLabels', 'originalChapter']) test(`chapter label appears or disappears while sponsor segment remains visible (${scenario}, ${transition ? 'transition' : 'no transition'})`, async t => {
  const context = await browser.newContext({ viewport:{width:1920,height:1080} });
  const page = await context.newPage(), errors=[];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.addInitScript(() => localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({version:1, values:{timelinePreviewSize:'large',theatreMode:false}})));
  await page.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({contentType:'text/html', body:base.replace('</head>', styles+'</head>')
      .replace('<video class="html5-main-video"></video>', '<video class="html5-main-video"></video>'+markup)}) : route.abort());
  // Suite health and the geometry assertions below are the readiness contract;
  // unrelated image load completion is not required by this fixture.
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: suite });
  await waitForSuiteHealth(page,manifest.registeredModules,{timeoutMs:10000,errors});
  await page.locator('.ytp-progress-bar').hover();
  await page.locator('.ytp-tooltip').evaluate((tip, useTransition) => {
    if (useTransition) tip.style.transition='transform 250ms linear';
    tip.classList.add('sponsorCategoryTooltipVisible');
    tip.querySelector('.sponsorCategoryTooltip').style.removeProperty('display');
  }, transition);
  await page.waitForTimeout(400);
  const frames = await page.evaluate(async scenario => {
    const tip=document.querySelector('.ytp-tooltip');
    const category=tip.querySelectorAll('.sponsorCategoryTooltip');
    const output=[];
    for (let i=0;i<55;i++) {
      const two = i>=5 && i<30;
      // As in SponsorBlock's seek bar listener, category state is rewritten
      // on each mousemove as the pointer passes an overlapping chapter.
      tip.classList.toggle('sponsorTwoTooltips',two && scenario==='twoSponsorLabels');
      tip.classList.toggle('sponsorHasOriginalTooltip',two && scenario==='originalChapter');
      const original=tip.querySelector('.ytp-tooltip-title:not(.sponsorCategoryTooltip)');
      if(two && scenario==='originalChapter')original.style.removeProperty('display'); else original.style.display='none';
      category[0].textContent='Sponsor';category[0].style.removeProperty('display');
      category[1].textContent='Chapter';
      if(two && scenario==='twoSponsorLabels')category[1].style.removeProperty('display'); else category[1].style.display='none';
      tip.style.left=(500+i*2)+'px';
      document.querySelector('.ytp-progress-bar-container').dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:500+i*2,clientY:650}));
      await new Promise(requestAnimationFrame);
      await new Promise(resolve=>setTimeout(resolve,0));
      const hint=tip.querySelector('.ytp-tooltip-edu');
      const labels=[...category].filter(label=>getComputedStyle(label).display!=='none');
      const list=[hint,tip.querySelector('.ytp-tooltip-bg'),...(getComputedStyle(original).display==='none'?[]:[original]),...labels,tip.querySelector('.ytp-tooltip-bottom-text')];
      const rects=list.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
      const overlaps=rects.some((a,index)=>rects.slice(index+1).some(b=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1));
      output.push({i,two,width:tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,overlaps,transform:getComputedStyle(tip).transform});
    }
    return output;
  }, scenario);
  assert.ok(frames.every(frame => Math.abs(frame.width - 480) < 1), JSON.stringify(frames));
  assert.ok(frames.every(frame => !frame.overlaps), JSON.stringify(frames));
});
