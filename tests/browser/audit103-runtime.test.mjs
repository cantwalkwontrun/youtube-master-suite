// Language: en-GB. Independent ownership and retained-root challenges.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const source = readFileSync(new URL('../../sources/modules/youtube-scroll-miniplayer.user.js', import.meta.url), 'utf8');
const comments = readFileSync(new URL('../../sources/modules/youtube-comment-cleaner.user.js', import.meta.url), 'utf8');
const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const fixture = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('<html lang="en"', '<html lang="en-GB"');
const url = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
async function frames(page) { await page.evaluate(async () => { for(let i=0;i<10;i++) await new Promise(requestAnimationFrame); }); }
async function open(t) {
 const context = await browser.newContext({viewport:{width:1280,height:900}, serviceWorkers:'block'});
 t.after(() => context.close());
 await context.route('**/*', route => route.request().url() === url ? route.fulfill({contentType:'text/html',body:fixture}) : route.abort());
 const page = await context.newPage(); await page.goto(url); return page;
}
for (const complete of [false, true]) for (const phase of ['before-floating', 'already-floating']) {
 test(`hidden native player host retains ownership (${phase}, ${complete ? 'Suite' : 'source'})`, async t => {
  const page = await open(t);
  await page.evaluate(() => {
   const host = document.querySelector('ytd-watch-flexy #player');
   const trigger = document.createElement('div'); trigger.id='single-column-container';
   host.before(trigger); trigger.append(host);
   fixture.originalHost=host; fixture.originalPlayer=host.querySelector('#movie_player');
   document.body.style.minHeight='3000px';
  });
  if(phase==='before-floating') await page.evaluate(() => {fixture.originalHost.hidden=true;});
  await page.addScriptTag({content:complete?suite:source});
  if(complete) await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
  await page.evaluate(() => {scrollTo(0,800);dispatchEvent(new Event('resize'));}); await frames(page);
  if(phase==='already-floating') {
   assert.equal(await page.evaluate(()=>fixture.originalPlayer.parentElement===document.body),true);
   await page.evaluate(()=>{fixture.originalHost.hidden=true;}); await frames(page);
  }
  assert.equal(await page.evaluate(()=>fixture.originalPlayer.parentElement===fixture.originalHost),true,
   'A hidden native host must retain its own player, including an attribute-only transition');
 });
}
for(const complete of [false,true]) test(`retained hidden uploader must not colour current viewers as uploaders (${complete?'Suite':'source'})`,async t=>{
 const page=await open(t);
 await page.evaluate(()=>{
  const root=document.querySelector('ytd-watch-flexy');
  const owner=root.querySelector('#owner') || root.querySelector('ytd-watch-metadata').appendChild(document.createElement('div'));
  owner.id='owner'; owner.innerHTML='<a href="/@current">Current uploader</a>';
  const retained=document.createElement('ytd-watch-flexy');retained.hidden=true;
  retained.innerHTML='<ytd-watch-metadata><div id="owner"><a href="/@old">Old uploader</a></div></ytd-watch-metadata><ytd-comments><ytd-comment-renderer>Retained comment</ytd-comment-renderer></ytd-comments>';
  root.before(retained);
  const list=root.querySelector('ytd-comments')||root.appendChild(document.createElement('ytd-comments'));
  list.innerHTML='<ytd-comment-renderer><a id="old-viewer" href="/@old">Old creator commenting as viewer</a><a id="current-uploader" href="/@current">Current creator</a></ytd-comment-renderer>';
  window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);};
 });
 await page.addScriptTag({content:complete?suite:comments});
 if(complete) await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
 await frames(page);
 assert.equal(await page.locator('#current-uploader').evaluate(n=>n.style.color),'rgb(255, 159, 28)');
 assert.equal(await page.locator('#old-viewer').evaluate(n=>n.style.color),'rgb(130, 163, 230)',
  'An uploader of a retained hidden video is an ordinary viewer on the current video');
 await page.evaluate(()=>{document.querySelector('ytd-watch-flexy:not([hidden]) #owner').replaceChildren();});
 await frames(page);
 assert.equal(await page.locator('#current-uploader').evaluate(n=>n.style.color),'rgb(130, 163, 230)',
  'Removing creator metadata must invalidate the cached creator identity');
 await page.evaluate(()=>{document.querySelector('ytd-watch-flexy:not([hidden]) #owner').innerHTML='<a href="/@old">Replacement creator</a>';});
 await frames(page);
 assert.equal(await page.locator('#old-viewer').evaluate(n=>n.style.color),'rgb(255, 159, 28)',
  'Replacement creator metadata must recolour existing comments');
 await page.evaluate(()=>{document.querySelector('ytd-watch-flexy:not([hidden]) ytd-comments').insertAdjacentHTML('beforeend','<ytd-pinned-comment-badge-renderer>Pinned by @current</ytd-pinned-comment-badge-renderer>');});
 await frames(page);
 assert.equal(await page.locator('#current-uploader').evaluate(n=>n.style.color),'rgb(255, 159, 28)');
 await page.evaluate(()=>{document.querySelector('ytd-pinned-comment-badge-renderer').firstChild.nodeValue='Pinned by @other';});
 await frames(page);
 assert.equal(await page.locator('#current-uploader').evaluate(n=>n.style.color),'rgb(130, 163, 230)',
  'Replacing pinned badge text must invalidate its cached identity');
 await page.evaluate(()=>{document.querySelector('ytd-pinned-comment-badge-renderer').textContent='Pinned by @current';});
 await frames(page);
 assert.equal(await page.locator('#current-uploader').evaluate(n=>n.style.color),'rgb(255, 159, 28)');
 await page.evaluate(()=>document.querySelector('ytd-pinned-comment-badge-renderer').remove());
 await frames(page);
 assert.equal(await page.locator('#current-uploader').evaluate(n=>n.style.color),'rgb(130, 163, 230)',
  'Removing a pinned creator badge must invalidate its cached identity');
});

for (const complete of [false, true]) test(`ambiguous visible watch roots cannot donate an uploader (${complete ? 'Suite' : 'source'})`, async t => {
 const page=await open(t);
 await page.evaluate(()=>{
  const current=document.querySelector('ytd-watch-flexy');
  const owner=current.querySelector('#owner') || current.querySelector('ytd-watch-metadata').appendChild(document.createElement('div'));
  owner.id='owner';owner.innerHTML='<a href="/@current">Current</a>';
  current.querySelector('#movie_player').getVideoData=()=>({video_id:'bbbbbbbbbbb'});
  const other=document.createElement('ytd-watch-flexy');other.style.cssText='display:block;width:400px;height:100px';
  other.innerHTML='<div id="movie_player" style="width:300px;height:80px"><video></video></div><ytd-watch-metadata><div id="owner"><a href="/@other">Other</a></div></ytd-watch-metadata>';
  current.after(other);
  const list=current.querySelector('ytd-comments')||current.appendChild(document.createElement('ytd-comments'));
  list.innerHTML='<ytd-comment-renderer><a id="ambiguous-author" href="/@current">Possibly creator</a></ytd-comment-renderer>';
  window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);};
 });
 await page.addScriptTag({content:complete?suite:comments});
 if(complete) await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
 await frames(page);
 assert.equal(await page.locator('#ambiguous-author').evaluate(n=>n.style.color),'rgb(130, 163, 230)',
  'Without a matching player identity, competing visible watch trees must not decide creator highlighting');
});
