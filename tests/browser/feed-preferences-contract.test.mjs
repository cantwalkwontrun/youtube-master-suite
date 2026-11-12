// Language: en-GB. Behavioural contracts for existing feed preferences, synthetic native cards only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser } from './fixture-browser.mjs';
const feed=readFileSync(new URL('../../sources/modules/youtube-feed-ui-cleaner.user.js',import.meta.url),'utf8');
const player=readFileSync(new URL('../../sources/modules/youtube-player-preferences-lite.user.js',import.meta.url),'utf8');
let browser,browserLaunch;
before(async()=>{browser=await(browserLaunch=launchFixtureBrowser());});
after(async()=>{await(await browserLaunch)?.close();});
async function open(t,{kind='feed',config={},markup='',path='/'}={}){
  const context=await browser.newContext({serviceWorkers:'block'});
  const url='https://www.youtube.com'+path;
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB"><style>
    ytd-app,ytd-browse,ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-rich-grid-media,ytd-playlist-panel-renderer,ytd-popup-container,ytd-ad-slot-renderer,ytd-watch-flexy{display:block}
    ytd-rich-item-renderer{min-height:60px}#unrelated{display:block;width:120px;height:25px}
    </style><body><ytd-app><ytd-browse><ytd-rich-grid-renderer><div id="contents" class="ytd-rich-grid-renderer">${markup}</div></ytd-rich-grid-renderer></ytd-browse></ytd-app><div id="unrelated">Unrelated</div></body></html>`}));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);
  page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await context.close();}});
  await page.goto(url);
  await page.evaluate(()=>{window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);};});
  const inject=`Object.assign(CONFIG,${JSON.stringify(config)});\n`;
  const source=kind==='feed'?feed.replace('  // Standalone module installs',inject+'  // Standalone module installs'):
    player.replace('  const STYLE_ID =',inject+'  const STYLE_ID =');
  await page.addScriptTag({content:source});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
  return page;
}
const card=(id,content)=>`<ytd-rich-item-renderer id="${id}"><ytd-rich-grid-media>${content}</ytd-rich-grid-media></ytd-rich-item-renderer>`;
const profiles=(key,enabled)=>Object.fromEntries(['default','home','subscriptions','search','history'].map(name=>[name,{mixes:false,membersOnly:false,podcasts:false,[key]:enabled}]));
for(const [key,evidence] of [['mixes','<span class="ytThumbnailOverlayBadgeViewModelHost">Mix</span>'],['podcasts','<a href="/playlist?list=PLfixture">View full podcast</a>']]){
  for(const enabled of [false,true])test(`${key} preference ${enabled} filters only explicit native cards and preserves queue copies`,async t=>{
    const page=await open(t,{config:{hideStaticUi:false,filterProfiles:profiles(key,enabled)},markup:
      card('target',evidence)+card('ordinary','Mix podcast title with no native label')+'<ytd-playlist-panel-renderer>'+card('queued',evidence)+'</ytd-playlist-panel-renderer>'});
    if(enabled)await page.waitForFunction(()=>document.getElementById('target').hasAttribute('data-clean-up-youtube-hidden'));
    assert.equal(await page.locator('#target').isVisible(),!enabled);
    for(const selector of ['#ordinary','#queued','#unrelated'])assert.equal(await page.locator(selector).isVisible(),true,selector);
  });
}
for(const enabled of [false,true])test(`compactFeedSpacing ${enabled} changes actual feed padding only`,async t=>{
  const page=await open(t,{config:{hideStaticUi:false,tightenFeedGrid:enabled,filterProfiles:profiles('mixes',false)},markup:card('ordinary','Video')});
  assert.deepEqual(await page.locator('#contents').evaluate(el=>{const c=getComputedStyle(el);return[c.paddingTop,c.paddingLeft,c.paddingRight];}),enabled?['16px','24px','24px']:['0px','0px','0px']);
  assert.equal(await page.locator('#ordinary').isVisible(),true);assert.equal(await page.locator('#unrelated').isVisible(),true);
});
for(const enabled of [false,true])test(`showTemporaryRevealControl ${enabled} controls the action but never exposes permanent ads`,async t=>{
  const page=await open(t,{config:{hideStaticUi:false,showTemporaryRevealControl:enabled,filterProfiles:profiles('mixes',true)},markup:card('target','<span class="ytThumbnailOverlayBadgeViewModelHost">Mix</span>')+'<ytd-ad-slot-renderer id="ad">Advertisement</ytd-ad-slot-renderer>'});
  await page.waitForFunction(()=>document.getElementById('target').hasAttribute('data-clean-up-youtube-hidden'));
  assert.equal(await page.locator('#yt-master-filter-toggle').count(),enabled?1:0);
  assert.equal(await page.locator('#target').isVisible(),false);assert.equal(await page.locator('#ad').isVisible(),false);
  if(enabled){await page.locator('#yt-master-filter-toggle').click();assert.equal(await page.locator('#target').isVisible(),true);assert.equal(await page.locator('#ad').isVisible(),false);}
});
for(const enabled of [false,true])test(`hideShorts ${enabled} hides recognised short cards and preserves ordinary videos`,async t=>{
  const page=await open(t,{kind:'player',config:{hideShorts:enabled,hideWatchedVideos:false,enableTheaterMode:false},markup:card('target','<a href="/shorts/aaaaaaaaaaa">Short video</a>')+card('ordinary','<a href="/watch?v=bbbbbbbbbbb">Ordinary video</a>')});
  assert.equal(await page.locator('#target').isVisible(),!enabled);assert.equal(await page.locator('#ordinary').isVisible(),true);assert.equal(await page.locator('#unrelated').isVisible(),true);
});
for(const threshold of [5,10,25,50,75,80,90,95,100])for(const enabled of [false,true])test(`watched filtering ${enabled} honours the ${threshold}% boundary`,async t=>{
  const progress=value=>`<a href="/watch?v=aaaaaaaaaaa">Video</a><ytd-thumbnail-overlay-resume-playback-renderer><div id="progress" style="width:${value}%"></div></ytd-thumbnail-overlay-resume-playback-renderer>`;
  const page=await open(t,{kind:'player',config:{hideWatchedVideos:enabled,watchedVideoThresholdPercent:threshold,enableTheaterMode:false},markup:card('below',progress(threshold-1))+card('boundary',progress(threshold))});
  if(enabled)await page.waitForFunction(()=>document.getElementById('boundary').getAttribute('data-ytppl-watched-hidden')==='1');
  assert.equal(await page.locator('#boundary').isVisible(),!enabled);assert.equal(await page.locator('#below').isVisible(),true);assert.equal(await page.locator('#unrelated').isVisible(),true);
});
for(const enabled of [false,true])test(`hidePayToWatchCards ${enabled} controls explicit non-catalogue paid cards`,async t=>{
  const page=await open(t,{kind:'player',config:{hidePayToWatchCards:enabled,enableTheaterMode:false},markup:card('target','<span class="yt-badge-shape__text">Pay to watch</span>')+card('ordinary','An ordinary video')});
  if(enabled)await page.waitForFunction(()=>document.getElementById('target').getAttribute('data-ytppl-pay-to-watch-hidden')==='1');
  assert.equal(await page.locator('#target').isVisible(),!enabled);assert.equal(await page.locator('#ordinary').isVisible(),true);assert.equal(await page.locator('#unrelated').isVisible(),true);
});

for(const [key,configKey,nativeMarkup,opacityOnly] of [
  ['hideMerchandise','hideMerchShelf','<ytd-merch-shelf-renderer data-target>Merchandise</ytd-merch-shelf-renderer>'],
  ['hideVideoMetadata','hideMetadataTeaserCarousel','<ytd-watch-metadata><div id="teaser-carousel" data-target>Metadata</div></ytd-watch-metadata>'],
  ['hideInfoPanels','hideInfoPanel','<ytd-info-panel-container-renderer data-target>Information</ytd-info-panel-container-renderer>'],
  ['hideAskPanels','hideAskButton','<ytd-menu-renderer><div class="you-chat-entrypoint-button" data-target>Ask</div></ytd-menu-renderer>'],
  ['hideRelated','hideRelatedVideos','<div id="secondary"><div id="related" data-target>Related videos</div></div>'],
  ['hideInfoCards','hideInfoCards','<div class="html5-video-player"><button class="ytp-cards-button" data-target>Info card</button></div>'],
  ['hideEndScreens','hideEndScreenRecommendationGrid','<div class="html5-video-player"><div class="ytp-endscreen-content"><div class="ytp-videowall-still" data-target>End-screen video</div></div></div>',true],
])test(`${key} has a direct native effect in both states without hiding unrelated controls`,async t=>{
  for(const enabled of [false,true]){
    const markup='<ytd-watch-flexy>'+nativeMarkup+'</ytd-watch-flexy>';
    const page=await open(t,{kind:'player',path:'/watch?v=aaaaaaaaaaa',config:{enableTheaterMode:false,[configKey]:enabled},markup});
    await page.locator('[data-target]').evaluate(el=>{el.style.display='block';el.style.width='200px';el.style.height='40px';});
    if(opacityOnly){
      assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).opacity),enabled?'0':'1');
      assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).pointerEvents),enabled?'none':'auto');
      assert.equal((await page.locator('[data-target]').boundingBox()).height,40,'Native end-screen geometry must remain usable');
    }else assert.equal(await page.locator('[data-target]').isVisible(),!enabled,key);
    assert.equal(await page.locator('#unrelated').isVisible(),true);
  }
});
