// Language: en-GB. Synthetic filtered-card ownership transitions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const source=readFileSync(new URL('../../sources/modules/youtube-feed-ui-cleaner.user.js',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
for(const compiled of [false,true])test(`filtered card releases ownership when adopted outside the feed (${compiled?'Suite':'source'})`,async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><ytd-app><ytd-browse><ytd-rich-grid-renderer><div id="contents"><ytd-rich-item-renderer id="card"><yt-lockup-view-model><a href="/watch?v=aaaaaaaaaaa">Synthetic video</a><badge-shape>Members only</badge-shape></yt-lockup-view-model></ytd-rich-item-renderer></div></ytd-rich-grid-renderer></ytd-browse><ytd-engagement-panel-section-list-renderer id="panel"></ytd-engagement-panel-section-list-renderer></ytd-app></body></html>'}));
 await page.goto('https://www.youtube.com/');
 await page.addScriptTag({content:compiled?bundle:'function GM_addStyle(css){const s=document.createElement("style");s.textContent=css;document.head.append(s);}\n'+source});
 if(compiled)await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
 await page.evaluate(()=>{
   const unrelated=document.createElement('ytd-comments');
   unrelated.innerHTML=Array.from({length:500},()=>'<div>Unrelated comment</div>').join('');
   document.body.append(unrelated);
   window.unrelatedMarkerScans=0;
   const query=unrelated.querySelectorAll;
   unrelated.querySelectorAll=function(selector){if(selector.includes('data-clean-up-youtube'))window.unrelatedMarkerScans++;return query.call(this,selector)};
   unrelated.remove();
 });
 await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame)});
 assert.equal(await page.evaluate(()=>window.unrelatedMarkerScans),0,'unrelated removed comments must not trigger an ownership marker scan');
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),'1');
 await page.evaluate(()=>{
   const card=document.querySelector('#card');
   card.setAttribute('data-other-extension-hidden','1');
   card.setAttribute('data-external-marker','retained');
   card.hidden=true;
 });
 await page.evaluate(()=>document.querySelector('#panel').append(document.querySelector('#card')));
 await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame)});
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),null,'a native adopted card must not carry a feed filter into an excluded panel');
 assert.deepEqual(await page.locator('#card').evaluate(card=>[card.getAttribute('data-other-extension-hidden'),card.getAttribute('data-external-marker'),card.hidden]),['1','retained',true],'only this module owns the released markers');
 await page.evaluate(()=>document.querySelector('#contents').append(document.querySelector('#card')));
 await page.waitForFunction(()=>document.querySelector('#card').getAttribute('data-clean-up-youtube-hidden')==='1');
 await page.evaluate(()=>{window.detachedCard=document.querySelector('#card');window.detachedCard.remove();});
 await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame)});
 assert.equal(await page.evaluate(()=>window.detachedCard.getAttribute('data-clean-up-youtube-hidden')),null,'detached cards release stale ownership before reuse');
 await page.evaluate(()=>{window.detachedCard.querySelector('badge-shape').textContent='Public';document.querySelector('#contents').append(window.detachedCard);});
 await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame)});
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),null);
 await page.evaluate(()=>{document.querySelector('badge-shape').textContent='Members only';});
 await page.waitForFunction(()=>document.querySelector('#card').getAttribute('data-clean-up-youtube-hidden')==='1');
 await page.evaluate(()=>{window.detachedFeed=document.querySelector('ytd-rich-grid-renderer');window.detachedFeed.remove();});
 await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame)});
 assert.equal(await page.evaluate(()=>window.detachedFeed.querySelector('#card').getAttribute('data-clean-up-youtube-hidden')),null,'removing the feed root must release contained markers too');
});

for(const compiled of [false,true])test(`removing a search contents wrapper releases nested feed ownership (${compiled?'Suite':'source'})`,async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><ytd-app><ytd-two-column-search-results-renderer><div id="wrapper"><div id="contents"><ytd-video-renderer id="card"><badge-shape>Members only</badge-shape></ytd-video-renderer></div></div></ytd-two-column-search-results-renderer></ytd-app></body></html>'}));
 await page.goto('https://www.youtube.com/results?search_query=synthetic');
 await page.addScriptTag({content:compiled?bundle:'function GM_addStyle(css){const s=document.createElement("style");s.textContent=css;document.head.append(s);}\n'+source});
 if(compiled)await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),'1');
 await page.evaluate(()=>{window.detachedWrapper=document.querySelector('#wrapper');window.detachedWrapper.remove();});
 await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame)});
 assert.equal(await page.evaluate(()=>window.detachedWrapper.querySelector('#card').getAttribute('data-clean-up-youtube-hidden')),null);
});
