// Language: en-GB. Complete-bundle stress fixture; synthetic data and no live profile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

test('compiled shared observers ignore animation churn and invalidate recycled film badges',async t=>{
  const timings={},started=Date.now();let previous=started;
  const phase=name=>{const now=Date.now();timings[name]=now-previous;previous=now;};
  const browser=await launchFixtureBrowser();t.after(()=>browser.close());
  const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());
  const url='https://www.youtube.com/watch?v=aaaaaaaaaaa';
  const html=readFileSync(new URL('./watch-page.html',import.meta.url),'utf8');
  const source=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
  const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
  const hook='function classifyCatalogueFilm(card) {';
  assert.equal(source.split(hook).length,2);
  await context.route('**/*',route=>route.request().url()===url ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
  await context.addInitScript(()=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{theatreMode:false,filmVisibility:'free'}})));
  await context.addInitScript({content:source.replace(hook,hook+' window.filmWork=(window.filmWork||0)+1;')});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  phase('launch');await page.goto(url);phase('navigation');await waitForSuiteHealth(page,manifest.registeredModules,{timeoutMs:10000,errors});phase('startup');
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'','/');
    const browse=document.createElement('ytd-browse'),grid=document.createElement('ytd-rich-grid-renderer');browse.append(grid);document.querySelector('ytd-app').append(browse);
    for(let i=0;i<500;i++) {
      const card=document.createElement('ytd-rich-item-renderer');card.id='stress-'+i;
      const media=document.createElement('ytd-rich-grid-media'),image=document.createElement('img'),likes=document.createElement('span');
      image.className='cbCustomThumbnail';likes.className='return-youtube-dislike';likes.textContent='42';
      media.append(image,likes);card.append(media);grid.append(card);
    }
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
  await settle();await settle();phase('initialFeed');
  await page.evaluate(async()=>{
    filmWork=0;
    for(let round=0;round<6;round++) {
      for(const card of document.querySelectorAll('[id^="stress-"]')) {
        card.querySelector('img').className='cbCustomThumbnail frame-'+round;
        card.querySelector('.return-youtube-dislike').textContent=String(round);
      }
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    }
  });await settle();phase('animationChurn');
  assert.equal(await page.evaluate(()=>filmWork),0);
  await page.evaluate(()=>{
    const card=document.getElementById('stress-20');
    for(const label of ['Rent £3.49','PG']){const badge=document.createElement('span');badge.className='ytBadgeShapeBadgeText';badge.textContent=label;card.append(badge);}
  });
  await page.waitForFunction(()=>document.getElementById('stress-20').getAttribute('data-ytms-discovery-hidden')==='1');
  assert.equal(await page.evaluate(()=>filmWork),1);
  await page.evaluate(()=>document.querySelector('#stress-20 > span:last-child').className='ordinary');
  await page.waitForFunction(()=>!document.getElementById('stress-20').hasAttribute('data-ytms-discovery-hidden'));
  assert.equal(await page.evaluate(()=>filmWork),2);
  phase('priceAndRecycling');t.diagnostic(JSON.stringify({timings,totalMs:Date.now()-started}));
  assert.deepEqual(errors,[]);
  assert.ok([null,'[]'].includes(await page.getAttribute('html','data-yt-master-runtime-errors')));
});
