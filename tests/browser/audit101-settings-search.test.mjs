// Language: en-GB. Synthetic settings-search lifecycle and private import records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
import { createSuiteSettings } from '../../sources/suite-settings.mjs';
const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const rules = [{ channelId:'UC'+'b'.repeat(22), name:'Synthetic channel', maxAge:1, unit:'weeks', enabled:true, blocked:false }];
const data = kind => JSON.stringify(kind === 'channels'
  ? { format:'youtube-master-suite-channel-filters', version:1, language:'en-GB', channelFilters:rules }
  : { format:'youtube-master-suite-backup', version:1, language:'en-GB', settings:createSuiteSettings(()=>({getItem:()=>null}),()=>true).defaults, channelFilters:rules });
let browser, launching;
before(async()=>{ browser=await(launching=launchFixtureBrowser()); });
after(async()=>{ await(await launching)?.close(); });
async function open(t,kind) {
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>route.request().url().startsWith('https://www.youtube.com/watch?')
  ?route.fulfill({contentType:'text/html',body:html}):route.abort());
 await context.addInitScript({content:source});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);
 page.on('pageerror',error=>errors.push(error.message));
 t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await context.close();}});
 await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true,errors});
 await page.locator('#ytms-settings-button').click();
 await page.locator('#ytms-tab-'+(kind==='channels'?'channels':'support')).click();
 return page;
}
for(const kind of ['channels','backup']) test(`settings search suspends a late ${kind} import before protected comparisons`,async t=>{
 const page=await open(t,kind);
 await page.evaluate(()=>{
  const native=File.prototype.text;
  File.prototype.text=function(){const file=this;return new Promise(resolve=>{window.releaseSearchImport=()=>native.call(file).then(resolve);});};
 });
 const input=kind==='channels'?'#ytms-import-channels':'#ytms-import-backup';
 await page.locator(input).setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(data(kind))});
 await page.waitForFunction(()=>typeof window.releaseSearchImport==='function');
 await page.locator('#ytms-settings-search').fill('snapshot');
 assert.equal(await page.locator('#ytms-section-'+(kind==='channels'?'channels':'support')).isVisible(),false);
 await page.evaluate(key=>fixtureGMStorage.startAudit(key),kind==='channels'?'yt-master-suite.channel-age.v1':'yt-master-suite.settings.v1');
 await page.evaluate(()=>window.releaseSearchImport());
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal((await page.evaluate(()=>fixtureGMStorage.finishAudit())).reads,0);
 assert.equal(await page.locator(kind==='channels'?'#ytms-channel-import-preview':'#ytms-backup-preview').textContent(),'');
});

for(const kind of ['channels','backup']) test(`hidden ${kind} import is inactive during search and resumes after trusted Escape`,async t=>{
 const page=await open(t,kind);
 await page.evaluate(()=>{window.searchFileReads=0;const original=File.prototype.text;File.prototype.text=function(){window.searchFileReads++;return original.call(this);};});
 await page.locator('#ytms-settings-search').fill('snapshot');
 const input=kind==='channels'?'#ytms-import-channels':'#ytms-import-backup';
 await page.locator(input).setInputFiles({name:'hidden.json',mimeType:'application/json',buffer:Buffer.from(data(kind))});
 assert.equal(await page.evaluate(()=>searchFileReads),0);
 await page.locator('#ytms-settings-search').press('Escape');
 await page.locator(input).setInputFiles({name:'visible.json',mimeType:'application/json',buffer:Buffer.from(data(kind))});
 const preview=page.locator(kind==='channels'?'#ytms-channel-import-preview':'#ytms-backup-preview');
 await page.waitForFunction(id=>document.querySelector(id).textContent.includes('preview'),kind==='channels'?'#ytms-channel-import-preview':'#ytms-backup-preview');
 assert.equal(await page.evaluate(()=>searchFileReads),1);
 assert.ok((await preview.textContent()).length>0);
});

test('search cancels an in-flight update check and allows a new check after returning',async t=>{
 const page=await open(t,'backup');
 await page.locator('#ytms-tab-credits').click();
 await page.evaluate(()=>{
  window.searchUpdate={requests:0,aborts:0};
  window.fetch=(url,options)=>new Promise((resolve,reject)=>{
   searchUpdate.requests++;
   options.signal.addEventListener('abort',()=>{searchUpdate.aborts++;reject(new DOMException('Synthetic cancellation','AbortError'));},{once:true});
  });
 });
 await page.locator('#ytms-updates-check').click();
 await page.waitForFunction(()=>searchUpdate.requests===1);
 await page.locator('#ytms-settings-search').fill('snapshot');
 assert.equal(await page.evaluate(()=>searchUpdate.aborts),1);
 await page.locator('#ytms-settings-search').press('Escape');
 assert.equal(await page.locator('#ytms-updates-check').isEnabled(),true);
 assert.equal(await page.locator('#ytms-updates-status').textContent(),'');
 await page.locator('#ytms-updates-check').click();
 await page.waitForFunction(()=>searchUpdate.requests===2);
 await page.locator('#ytms-cancel-panel').click();
 assert.equal(await page.evaluate(()=>searchUpdate.aborts),2);
});

async function holdLock(page,key) {
 await page.evaluate(key=>{navigator.locks.request(key,()=>new Promise(resolve=>{window.releaseSearchWrite=resolve;}));},key);
 await page.waitForFunction(()=>typeof releaseSearchWrite==='function');
}
async function releaseLock(page,key) {
 await page.evaluate(async key=>{window.releaseSearchWrite();await navigator.locks.request(key,()=>{});},key);
}
test('search preserves the existing cancellation policy for a queued release-source save',async t=>{
 const page=await open(t,'backup');await page.locator('#ytms-tab-credits').click();
 const value='https://github.com/synthetic-owner/example/releases/latest';
 await page.locator('#ytms-updates-source').fill(value);
 const key='yt-master-suite.update-source-write.v1';await holdLock(page,key);
 await page.locator('#ytms-updates-save-source').click();
 await page.locator('#ytms-settings-search').fill('snapshot');
 await releaseLock(page,key);
 assert.equal(await page.evaluate(()=>GM_getValue('yt-master-suite.update-source.v1',null)),null);
 await page.locator('#ytms-settings-search').press('Escape');
 assert.equal(await page.locator('#ytms-updates-source').inputValue(),value);
 assert.equal(await page.locator('#ytms-updates-save-source').isEnabled(),true);
});

test('search retains an already-confirmed marker save just like switching tabs',async t=>{
 const page=await open(t,'backup');await page.locator('#ytms-tab-player').click();
 const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);return canvas.toDataURL().slice(22);});
 await page.locator('#ytms-marker-file').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await page.waitForFunction(()=>!document.getElementById('ytms-marker-save').disabled);
 const key='yt-master-suite.marker-write.v1';await holdLock(page,key);
 await page.locator('#ytms-marker-save').click();
 await page.locator('#ytms-settings-search').fill('snapshot');
 await releaseLock(page,key);
 assert.equal(JSON.parse(await page.evaluate(()=>GM_getValue('yt-master-suite.playhead-image.v1',null))).size,24);
 await page.locator('#ytms-settings-search').press('Escape');
 assert.match(await page.locator('#ytms-marker-status').textContent(),/saved/i);
});

test('inactive clipboard rejection does not select a hidden report',async t=>{
 const page=await open(t,'backup');
 await page.evaluate(()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise((resolve,reject)=>{window.rejectSearchClipboard=()=>reject(new Error('Synthetic'));})}});
  window.hiddenReportSelections=0;
  const report=document.getElementById('ytms-support-report'),original=report.select;
  report.select=function(){hiddenReportSelections++;return original.call(this);};
 });
 await page.locator('#ytms-copy-support').click();
 await page.locator('#ytms-settings-search').fill('backup');
 await page.evaluate(()=>window.rejectSearchClipboard());
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
 assert.equal(await page.evaluate(()=>hiddenReportSelections),0);
});

test('trusted search result activation resumes backup import',async t=>{
 const page=await open(t,'backup');
 await page.locator('#ytms-settings-search').fill('backup');
 await page.locator('.settings-search-result[data-tab="support"]').first().click();
 assert.equal(await page.locator('#ytms-settings-search').inputValue(),'');
 await page.locator('#ytms-import-backup').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(data('backup'))});
 await page.waitForFunction(()=>document.getElementById('ytms-backup-preview').textContent.includes('preview'));
});

for(const kind of ['channels','backup']) for(const rejected of [false,true]) test(`abandoned ${kind} file read stops reporting Reading after returning (rejected=${rejected})`,async t=>{
 const page=await open(t,kind);
 await page.evaluate(rejected=>{const native=File.prototype.text;File.prototype.text=function(){const file=this;return new Promise((resolve,reject)=>{window.releaseSearchImport=()=>rejected ? reject(new Error('Synthetic read failure')) : native.call(file).then(resolve);});};},rejected);
 await page.locator(kind==='channels'?'#ytms-import-channels':'#ytms-import-backup').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(data(kind))});
 await page.waitForFunction(()=>typeof releaseSearchImport==='function');
 await page.locator('#ytms-settings-search').fill('snapshot');
 await page.evaluate(()=>releaseSearchImport());
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
 await page.locator('#ytms-settings-search').press('Escape');
 assert.equal(await page.locator(kind==='channels'?'#ytms-channel-transfer-status':'#ytms-backup-status').textContent(),'Preview cancelled. Choose the file again.');
 assert.equal(await page.locator(kind==='channels'?'#ytms-import-channels':'#ytms-import-backup').inputValue(),'');
});
