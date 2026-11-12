// Language: en-GB. Full generated Suite, synthetic native surfaces and local mock storage only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const source=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
const fixture=readFileSync(new URL('./watch-page.html',import.meta.url),'utf8');
let browser,browserLaunch;
before(async()=>{browser=await(browserLaunch=launchFixtureBrowser());});
after(async()=>{await(await browserLaunch)?.close();});
test('the generated Suite counts and reveals filtered cards without exposing hidden AI or sidebar surfaces',async t=>{
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url().startsWith('https://www.youtube.com/watch?')?route.fulfill({contentType:'text/html',body:fixture}):route.abort());
  await context.addInitScript(()=>{
    localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{theatreMode:false,hideFeedShelves:false,hideShorts:false,
      hideSearchAI:true,hideSidebarSubscriptions:true,hideFeedLowViews:true,lowViewThreshold:'1000',filmVisibility:'all'}}));
  });
  await context.addInitScript({content:source});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);
  page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(errors,[]);assert.ok(!await page.getAttribute('html','data-yt-master-runtime-errors')||await page.getAttribute('html','data-yt-master-runtime-errors')==='[]');}finally{await context.close();}});
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true,timeoutMs:10000,errors});
  const before=await page.evaluate(()=>({playing:fixture.playerId,paused:document.querySelector('video').paused,time:document.querySelector('video').currentTime}));
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'','/results?search_query=fixture');
    const search=document.createElement('ytd-search');search.innerHTML='<ytd-two-column-search-results-renderer><div id="contents"><yt-ai-search-result-section-renderer id="audit-ai" style="display:block;height:50px">AI summary</yt-ai-search-result-section-renderer></div></ytd-two-column-search-results-renderer>';
    document.querySelector('ytd-app').append(search);
    const sidebar=document.createElement('ytd-guide-renderer');sidebar.innerHTML='<ytd-guide-section-renderer id="audit-sidebar" style="display:block"><h3 id="guide-section-title">Subscriptions</h3>Channel list</ytd-guide-section-renderer>';
    document.querySelector('ytd-app').append(sidebar);window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForFunction(()=>document.getElementById('audit-ai').getAttribute('data-ytms-discovery-ui-hidden')==='1'&&document.getElementById('audit-sidebar').getAttribute('data-ytms-discovery-ui-hidden')==='1');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#yt-master-filter-toggle').count(),0);
  await page.evaluate(()=>{
    const card=document.createElement('ytd-rich-item-renderer');card.id='audit-low-card';card.style.cssText='display:block;height:60px';
    card.innerHTML='<ytd-rich-grid-media><div id="metadata-line"><span>10 views</span></div></ytd-rich-grid-media>';
    document.querySelector('ytd-two-column-search-results-renderer #contents').append(card);
  });
  await page.waitForFunction(()=>document.querySelector('#yt-master-filter-toggle')?.textContent.includes('Filtered: 1'));
  assert.equal(await page.locator('#audit-low-card').isVisible(),false);
  assert.doesNotMatch(await page.locator('#yt-master-filter-toggle').getAttribute('title'),/AI search|Subscribed channels/);
  await page.locator('#yt-master-filter-toggle').click();
  assert.equal(await page.locator('#audit-low-card').isVisible(),true);
  assert.equal(await page.locator('#audit-ai').isVisible(),false);
  assert.equal(await page.locator('#audit-sidebar').isVisible(),false);
  const after=await page.evaluate(()=>({playing:fixture.playerId,paused:document.querySelector('video').paused,time:document.querySelector('video').currentTime}));
  assert.deepEqual(after,before,'A reveal action must not issue media commands');
});
