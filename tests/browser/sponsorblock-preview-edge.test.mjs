// Language: en-GB. Synthetic moving seek-bar and SponsorBlock edge regression.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth, navigateWatchFixture } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const base = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
// Relevant SponsorBlock selectors and translations from its public content.css.
const styles = `<style>
#movie_player{width:1600px;height:700px}
.ytp-progress-bar-container{position:absolute;bottom:40px;left:8px;right:8px;height:16px}
.ytp-progress-bar{height:100%}
.ytp-tooltip{position:absolute;bottom:220px;left:500px;width:200px;height:112px;font-size:14px}
.ytp-tooltip-bg{position:absolute;inset:0;width:200px;height:112px;background:#444}
.ytp-tooltip-image{display:none}
.ytp-tooltip-text-wrapper{position:absolute;inset:0;width:200px;pointer-events:none}
.ytp-tooltip-edu{position:absolute;bottom:116px;width:200px;font-size:12px;line-height:16px}
.ytp-tooltip-title{position:absolute;top:116px;width:200px;font-size:14px;line-height:16px}
.sponsorCategoryTooltip{top:134px}
.ytp-tooltip:not(.sponsorCategoryTooltipVisible) .sponsorCategoryTooltip{display:none!important}
.sponsorCategoryTooltip + .sponsorCategoryTooltip{top:150px}
.ytp-tooltip-bottom-text{position:absolute;top:174px;width:200px;height:26px}
.ytp-tooltip.sponsorCategoryTooltipVisible .ytp-tooltip-edu{transform:translateY(-1em)!important}
.ytp-tooltip.sponsorCategoryTooltipVisible{transform:translateY(-1em)!important}
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorHasOriginalTooltip{transform:translateY(-2em)!important}
.ytp-big-mode .ytp-tooltip.sponsorCategoryTooltipVisible{transform:translateY(-2em)!important}
#movie_player:not(.ytp-big-mode) .ytp-tooltip.sponsorCategoryTooltipVisible > .ytp-tooltip-text-wrapper{transform:translateY(1em)!important}
.ytp-big-mode .ytp-tooltip.sponsorCategoryTooltipVisible > .ytp-tooltip-text-wrapper{transform:translateY(.5em)!important}
.ytp-big-mode .ytp-tooltip.sponsorCategoryTooltipVisible > .ytp-tooltip-text-wrapper .ytp-tooltip-text{transform:translateY(.75em)!important}
</style>`;
const markup = `<div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
<div class="ytp-tooltip ytp-preview"><div class="ytp-tooltip-text-wrapper"><div class="ytp-tooltip-edu">Pull up for precise seeking</div>
<div class="ytp-tooltip-image"></div><div class="ytp-tooltip-title">Example chapter</div>
<div class="ytp-tooltip-title sponsorCategoryTooltip" style="display:none">Sponsor</div>
<div class="ytp-tooltip-bottom-text"><span class="ytp-tooltip-text">5:57</span></div></div><div class="ytp-tooltip-bg"></div></div>`;
let browser;
before(async()=>{browser=await launchFixtureBrowser()});
after(async()=>{await browser?.close()});
for(const kind of ['none','sponsor','child','big','foreign']) test(`crossing a SponsorBlock segment edge with ${kind} transition`,async t=>{
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{timelinePreviewSize:'large',theatreMode:false}})));
  const fixtureHtml = base.replace('</head>',styles+'</head>')
      .replace('<video class="html5-main-video"></video>','<video class="html5-main-video"></video>'+markup);
  await page.route('**/*', route => route.abort());
  t.after(async()=>{try{assert.deepEqual(errors,[])}finally{await context.close()}});
  // Explicit Suite health and geometry checks below define fixture readiness.
  await navigateWatchFixture(page, { html: fixtureHtml });
  await page.addScriptTag({ content: suite });
  await waitForSuiteHealth(page,manifest.registeredModules,{timeoutMs:10000,errors});
  if(kind==='foreign')await page.addStyleTag({content:'#movie_player .ytp-tooltip.sponsorCategoryTooltipVisible{transform:translateY(-250px)!important}'});
  if(kind==='big')await page.locator('#movie_player').evaluate(node=>{node.classList.add('ytp-big-mode');node.querySelector('.ytp-tooltip-title:not(.sponsorCategoryTooltip)').textContent=''});
  if(kind==='child'||kind==='big')await page.addStyleTag({content:'.ytp-tooltip-edu, .ytp-tooltip-text { transition: transform 250ms linear; }'});
  await page.locator('.ytp-progress-bar').hover();await page.waitForTimeout(200);
  const values=await page.evaluate(async transition=>{
    const tip=document.querySelector('.ytp-tooltip'), label=tip.querySelector('.sponsorCategoryTooltip');
    if(transition)tip.style.transition='transform 250ms linear';
    const original=tip.querySelector('.ytp-tooltip-title:not(.sponsorCategoryTooltip)');
    const track=document.querySelector('.ytp-progress-bar-container');
    const output=[];
    for(let i=0;i<50;i++){
      const active=i>=5 && i<26;
      tip.style.left=(500+i*3)+'px';
      // SponsorBlock changes the class, title and label visibility in one mousemove.
      tip.classList.toggle('sponsorCategoryTooltipVisible',active);
      if(active){
        label.textContent='Sponsor';label.style.removeProperty('display');
        label.style.right=original.style.right;label.style.textAlign=original.style.textAlign;
      }else {tip.classList.remove('sponsorHasOriginalTooltip');original.style.removeProperty('display');}
      label.classList.toggle('ytp-tooltip-text-no-title',false);
      track.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:500+i*3,clientY:650}));
      await new Promise(requestAnimationFrame);
      // Read after the frame's other callbacks have had a chance to reconcile.
      await new Promise(resolve=>setTimeout(resolve,0));
      const rects=[...tip.querySelectorAll('.ytp-tooltip-edu,.ytp-tooltip-bg,.ytp-tooltip-title,.ytp-tooltip-bottom-text')]
        .filter(node=>getComputedStyle(node).display!=='none' && (!node.matches('.ytp-tooltip-title') || node.textContent.trim())).map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
      const overlaps=rects.some((a,index)=>rects.slice(index+1).some(b=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1));
      output.push({i,active,width:tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,overlaps,
        animations:(i===7||i===28)?tip.getAnimations().map(animation=>({name:animation.transitionProperty,
          frames:animation.effect.getKeyframes().map(({transform})=>transform)})):undefined});
    }
    return output;
  },kind!=='none');
  if(kind==='foreign') {
    assert.ok(values.filter(value=>value.active&&value.i>=10).every(value=>value.width<210),JSON.stringify(values));
  } else if(kind==='child'||kind==='big') {
    // Independently animated child transforms are not attributed to SponsorBlock;
    // retain the safe native presentation rather than overriding another owner.
    assert.ok(values.some(value=>value.active&&value.width<210),JSON.stringify(values));
    assert.equal(await page.locator('.ytp-tooltip-edu').evaluate(node=>node.style.transform),'');
    assert.equal(await page.locator('.ytp-tooltip-text').evaluate(node=>node.style.transform),'');
  } else {
    assert.ok(values.every(value=>Math.abs(value.width-480)<1),JSON.stringify(values));
    assert.ok(values.every(value=>!value.overlaps),JSON.stringify(values));
  }
  await page.mouse.move(1,1);await page.waitForTimeout(100);
  assert.equal(await page.locator('.ytp-tooltip').evaluate(node=>node.style.scale),'');
});
