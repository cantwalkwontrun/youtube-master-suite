import { wrapFixtureUserscript } from './fixture-gm-storage.mjs';
// Language: en-GB. Synthetic SponsorBlock tooltip and player compatibility checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const base = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
// Relevant rules from SponsorBlock's public/content.css, including its !important translations.
const styles = `<style>
#movie_player { width:min(100vw - 32px, 1600px); height:700px; }
.ytp-progress-bar-container { position:absolute; bottom:40px; left:8px; right:8px; height:16px; }
.ytp-progress-bar { height:100%; }
.ytp-tooltip { position:absolute; bottom:220px; left:500px; width:200px; height:112px; font-size:14px; }
.ytp-tooltip-bg { position:absolute; inset:0; width:200px; height:112px; background:#444; }
.ytp-tooltip-image { display:none; }
.ytp-tooltip-text-wrapper { position:absolute; inset:0; width:200px; pointer-events:none; }
.ytp-tooltip-edu { position:absolute; bottom:116px; width:200px; font-size:12px; line-height:16px; }
.ytp-tooltip-title { position:absolute; top:116px; width:200px; font-size:14px; line-height:16px; }
.sponsorCategoryTooltip { top:134px; }
.sponsorCategoryTooltip + .sponsorCategoryTooltip { top:150px; }
.ytp-tooltip-bottom-text { position:absolute; top:174px; width:200px; height:26px; }
.ytp-tooltip.sponsorCategoryTooltipVisible .ytp-tooltip-edu { transform:translateY(-1em) !important; }
.ytp-tooltip.sponsorCategoryTooltipVisible { transform:translateY(-1em) !important; }
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips { transform:translateY(-2em) !important; }
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorHasOriginalTooltip { transform:translateY(-2em) !important; }
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips.sponsorHasOriginalTooltip { transform:translateY(-3em) !important; }
.ytp-big-mode .ytp-tooltip.sponsorCategoryTooltipVisible { transform:translateY(-2em) !important; }
.ytp-big-mode .ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips { transform:translateY(-4em) !important; }
#movie_player:not(.ytp-big-mode) .ytp-tooltip.sponsorCategoryTooltipVisible > .ytp-tooltip-text-wrapper { transform:translateY(1em) !important; }
#movie_player:not(.ytp-big-mode) .ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips > .ytp-tooltip-text-wrapper { transform:translateY(2em) !important; }
.ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips .ytp-tooltip-edu { transform:translateY(-2em) !important; }
.ytp-big-mode .ytp-tooltip.sponsorCategoryTooltipVisible > .ytp-tooltip-text-wrapper { transform:translateY(.5em) !important; }
.ytp-big-mode .ytp-tooltip.sponsorCategoryTooltipVisible.sponsorTwoTooltips > .ytp-tooltip-text-wrapper { transform:translateY(1.75em) !important; }
.ytp-big-mode .ytp-tooltip.sponsorCategoryTooltipVisible .ytp-tooltip-text { transform:translateY(.75em) !important; }
</style>`;
const markup = `<div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
<div class="ytp-tooltip ytp-preview"><div class="ytp-tooltip-text-wrapper">
<div class="ytp-tooltip-edu">Pull up for precise seeking</div><div class="ytp-tooltip-image"></div>
<div class="ytp-tooltip-title">Example chapter</div><div class="ytp-tooltip-title sponsorCategoryTooltip" style="display:none">Sponsor</div><div class="ytp-tooltip-title sponsorCategoryTooltip" style="display:none">Interaction</div>
<div class="ytp-tooltip-bottom-text"><span class="ytp-tooltip-text">5:57</span></div></div><div class="ytp-tooltip-bg"></div></div>`;
const floatingSetup = `<script>
const host=document.getElementById('player'), anchor=document.createElement('div');
anchor.id='single-column-container'; host.before(anchor); anchor.append(host);
const movie=document.getElementById('movie_player'), chrome=document.createElement('div');
chrome.className='ytp-chrome-bottom'; chrome.style.cssText='position:absolute;bottom:0;height:56px;width:100%';
const controls=movie.querySelector('.ytp-right-controls'); controls.style.cssText='position:absolute;bottom:0;right:0';
chrome.append(movie.querySelector('.ytp-progress-bar-container'),controls); movie.append(chrome);
</script>`;
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
async function fixture(t, mode='large', {miniplayer=false}={}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({mode,miniplayer}) => localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({version:1, values:{timelinePreviewSize:mode,theatreMode:false,miniplayerEnabled:miniplayer}})), {mode,miniplayer});
  await page.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType:'text/html', body:base.replace('</head>', styles + '</head>')
      .replace('<video class="html5-main-video"></video>', '<video class="html5-main-video"></video>' + markup)
      .replace('</body>', `${miniplayer?floatingSetup:''}<script>${wrapFixtureUserscript(suite)}</script></body>`) }) : route.abort());
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(page, manifest.registeredModules, {timeoutMs:10000, errors});
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(200);
  return page;
}
async function state(page) {
  return page.evaluate(() => {
    const tip=document.querySelector('.ytp-tooltip');
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
    return {image:rect(tip.querySelector('.ytp-tooltip-bg')), transform:getComputedStyle(tip).transform,
      wrapperTransform:getComputedStyle(tip.querySelector('.ytp-tooltip-text-wrapper')).transform,
      labels:[...tip.querySelectorAll('.sponsorCategoryTooltip')].map(node=>({visible:getComputedStyle(node).display!=='none',text:node.textContent,rect:rect(node)})),
      chapter:rect(tip.querySelector('.ytp-tooltip-title:not(.sponsorCategoryTooltip)')),
      hint:rect(tip.querySelector('.ytp-tooltip-edu')), pill:rect(tip.querySelector('.ytp-tooltip-bottom-text')),
      track:rect(document.querySelector('.ytp-progress-bar')), player:rect(document.querySelector('#movie_player')),
      viewport:{width:innerWidth,height:innerHeight}, scale:tip.style.scale};
  });
}
function large(actual, description) { assert.ok(Math.abs(actual.image.width - 480) < 1, `${description}: ${JSON.stringify(actual)}`); }
function visibleGeometry(actual) {
  const items=[actual.hint, actual.image, actual.chapter, ...actual.labels.filter(label=>label.visible).map(label=>label.rect), actual.pill];
  for (const box of items) {
    assert.ok(box.left>=Math.max(0,actual.player.left)-1 && box.right<=Math.min(actual.viewport.width,actual.player.right)+1 && box.top>=Math.max(0,actual.player.top)-1 && box.bottom<=Math.min(actual.viewport.height,actual.track.top)+1, JSON.stringify(actual));
  }
  for (let i=0;i<items.length;i++) for (let j=i+1;j<items.length;j++) {
    const a=items[i], b=items[j];
    assert.ok(a.right<=b.left+1 || b.right<=a.left+1 || a.bottom<=b.top+1 || b.bottom<=a.top+1, JSON.stringify(actual));
  }
}
test('Large persists as a SponsorBlock segment tooltip appears and disappears', async t => {
  const page = await fixture(t);
  large(await state(page), 'before segment');
  await page.evaluate(() => {
    window.seekEvents=[];
    document.querySelector('.ytp-progress-bar').addEventListener('click', e=>window.seekEvents.push(e.defaultPrevented));
    document.querySelector('.sponsorCategoryTooltip').style.display='block';
    document.querySelector('.ytp-tooltip').classList.add('sponsorCategoryTooltipVisible');
  });
  await page.waitForTimeout(250);
  const active=await state(page);
  large(active, 'SponsorBlock segment');
  assert.equal(active.labels[0].visible,true);
  assert.notEqual(active.transform,'none');
  assert.notEqual(active.wrapperTransform,'none');
  visibleGeometry(active);
  await page.evaluate(() => {
    document.querySelector('.ytp-tooltip').classList.remove('sponsorCategoryTooltipVisible');
    document.querySelector('.sponsorCategoryTooltip').style.display='none';
  });
  await page.waitForTimeout(250);
  large(await state(page), 'after segment');
  await page.locator('.ytp-progress-bar').click();
  assert.deepEqual(await page.evaluate(() => window.seekEvents), [false]);
});
test('SponsorBlock combined labels and big-mode translations retain the configured size', async t => {
  const page=await fixture(t);
  for (const combination of [
    ['sponsorCategoryTooltipVisible','sponsorTwoTooltips'],
    ['sponsorCategoryTooltipVisible','sponsorHasOriginalTooltip'],
    ['sponsorCategoryTooltipVisible','sponsorTwoTooltips','sponsorHasOriginalTooltip'],
  ]) {
    await page.evaluate(classes=>{
      const tip=document.querySelector('.ytp-tooltip'); tip.className='ytp-tooltip ytp-preview'; tip.classList.add(...classes);
      for (const [index,label] of [...document.querySelectorAll('.sponsorCategoryTooltip')].entries()) {
        label.style.display='block'; label.textContent=index ? 'Interaction' : 'Sponsor';
      }
    }, combination);
    await page.waitForTimeout(200);
    const active=await state(page); large(active, combination.join(' ')); assert.notEqual(active.transform,'none');
    assert.deepEqual(active.labels.map(label=>label.text),['Sponsor','Interaction']);
    assert.ok(active.labels.every(label=>label.visible));
    visibleGeometry(active);
  }
  await page.locator('#movie_player').evaluate(node=>node.classList.add('ytp-big-mode'));
  await page.waitForTimeout(200);
  const big=await state(page); large(big,'big-mode combined labels'); assert.notEqual(big.transform,'none'); visibleGeometry(big);
});
test('native SponsorBlock rules displace the image by precisely one em while leaving the wrapper label stable', async t => {
  const page=await fixture(t,'native');
  await page.evaluate(()=>document.querySelector('.sponsorCategoryTooltip').style.display='block');
  const before=await state(page);
  await page.locator('.ytp-tooltip').evaluate(node=>node.classList.add('sponsorCategoryTooltipVisible'));
  const active=await state(page);
  assert.ok(Math.abs(active.image.top-before.image.top+14)<.1,JSON.stringify({before,active}));
  assert.ok(Math.abs(active.labels[0].rect.top-before.labels[0].rect.top)<.1,JSON.stringify({before,active}));
  visibleGeometry(active);
});
test('SponsorBlock with an independently scaled intermediate ancestor stays native', async t => {
  const page=await fixture(t);
  await page.evaluate(()=>{
    const tip=document.querySelector('.ytp-tooltip');
    const wrapper=document.createElement('div'); wrapper.style.cssText='position:absolute;inset:0;scale:2;transform-origin:top left';
    tip.before(wrapper); wrapper.append(tip);
    tip.classList.add('sponsorCategoryTooltipVisible');
    tip.querySelector('.sponsorCategoryTooltip').style.display='block';
  });
  await page.waitForTimeout(250);
  assert.equal((await state(page)).scale,'');
});
test('SponsorBlock preview stays bounded at both player edges and after a viewport resize', async t => {
  const page=await fixture(t);
  for (const left of [-60,1490]) {
    await page.mouse.move(1,1);
    await page.locator('.ytp-tooltip').evaluate((tip,left)=>{
      tip.style.left=left+'px'; tip.classList.add('sponsorCategoryTooltipVisible');
      tip.querySelector('.sponsorCategoryTooltip').style.display='block';
    },left);
    await page.locator('.ytp-progress-bar').hover(); await page.waitForTimeout(200);
    const actual=await state(page); large(actual,`edge ${left}`); visibleGeometry(actual);
  }
  await page.setViewportSize({width:1600,height:900}); await page.waitForTimeout(250);
  const resized=await state(page); large(resized,'viewport resize'); visibleGeometry(resized);
});
test('SponsorBlock preview remains proportionate and bounded in the scroll miniplayer', async t => {
  const page=await fixture(t,'large',{miniplayer:true});
  await page.mouse.move(1,1);
  await page.locator('.ytp-tooltip').evaluate(tip=>{
    tip.style.left='100px'; tip.style.bottom='180px';
    // Leave room for platform font metrics when the Suite enlarges label text.
    const sponsorLabel=tip.querySelector('.sponsorCategoryTooltip');
    sponsorLabel.style.top='142px'; sponsorLabel.style.display='block';
    tip.querySelector('.ytp-tooltip-bottom-text').style.top='182px';
    tip.classList.add('sponsorCategoryTooltipVisible');
  });
  const before=await page.evaluate(()=>({time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused}));
  await page.evaluate(()=>window.scrollTo(0,900));
  await page.waitForFunction(()=>document.body.classList.contains('ytsmp-scroll-miniplayer-active') && document.getElementById('movie_player')?.parentElement===document.body);
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForFunction(() => Boolean(document.querySelector('.ytp-tooltip')?.style.scale), null, { timeout: 3000 });
  const mini=await state(page);
  assert.notEqual(mini.scale,'',JSON.stringify(mini));
  assert.ok(mini.image.width<=mini.player.width*.4+1,JSON.stringify(mini));
  visibleGeometry(mini);
  assert.deepEqual(await page.evaluate(()=>({time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused})),before);
});
test('an unrelated rotation remains an unsupported native preview', async t => {
  const page=await fixture(t);
  large(await state(page),'before rotation');
  await page.locator('.ytp-tooltip').evaluate(node=>{node.style.transform='rotate(1deg)';});
  await page.waitForTimeout(250);
  const rotated=await state(page);
  assert.ok(rotated.image.width < 250, JSON.stringify(rotated));
  assert.equal(await page.locator('.ytp-tooltip').evaluate(node=>node.style.transform),'rotate(1deg)');
});
