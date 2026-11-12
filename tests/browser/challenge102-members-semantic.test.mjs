// Language: en-GB. Local synthetic membership boundary challenges.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {launchFixtureBrowser,waitForSuiteHealth} from './fixture-browser.mjs';
const source=readFileSync(new URL('../../sources/modules/youtube-feed-ui-cleaner.user.js',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
let browser;before(async()=>{browser=await launchFixtureBrowser()});after(()=>browser?.close());
async function open(t,label,badgeClass='badge-style-type-members-only',creator=false,compiled=false,enabled=true){
 const context=await browser.newContext();t.after(()=>context.close());
 const badge=`<div id="badge" class="badge ${badgeClass}">${label}</div>`;
 await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB"><body><ytd-app><ytd-browse><ytd-rich-grid-renderer><ytd-rich-item-renderer id="card"><yt-lockup-view-model><a href="/watch?v=aaaaaaaaaaa">Synthetic</a><ytd-badge-supported-renderer>${creator?'<a href="/@Synthetic">'+badge+'</a>':badge}</ytd-badge-supported-renderer></yt-lockup-view-model></ytd-rich-item-renderer></ytd-rich-grid-renderer></ytd-browse></ytd-app></body></html>`}));
 const page=await context.newPage();await page.goto('https://www.youtube.com/');
 if(compiled)await page.evaluate(enabled=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{hideMembersOnly:enabled}})),enabled);
 await page.addScriptTag({content:compiled?bundle:'function GM_addStyle(css){const style=document.createElement("style");style.textContent=css;document.head.append(style);}\n'+(enabled?source:source.replaceAll('membersOnly: true','membersOnly: false'))});
 if(compiled) await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
 return page;
}
for(const compiled of [false,true]){
 const mode=compiled?'Suite':'source';
test(`disabled membership preference preserves semantic badge (${mode})`,async t=>{
 const page=await open(t,'','badge-style-type-members-only',false,compiled,false);
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),null);
});
for(const label of ['Members only','Nur für Mitglieder','']) test(`authoritative native membership class (${mode}): ${label || 'label pending'}`,async t=>{
 const page=await open(t,label,'badge-style-type-members-only',false,compiled);
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),'1');
});
for(const label of ['', 'Nur für Mitglieder', 'Public'])test(`generic badges are not guessed to be membership badges (${mode}): ${label || 'empty'}`,async t=>{
 const page=await open(t,label,'badge-style-type-simple',false,compiled);
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),null);
});
test(`creator-link content cannot donate a membership badge (${mode})`,async t=>{
 const page=await open(t,'Members only','badge-style-type-members-only',true,compiled);
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),null);
});
test(`recycled semantic badge class is restored and re-filtered without text changes (${mode})`,async t=>{
 const page=await open(t,'','badge-style-type-members-only',false,compiled);
 assert.equal(await page.locator('#card').getAttribute('data-clean-up-youtube-hidden'),'1');
 await page.evaluate(()=>document.querySelector('#badge').className='badge badge-style-type-simple');
 await page.waitForFunction(()=>!document.querySelector('#card').hasAttribute('data-clean-up-youtube-hidden'));
 await page.evaluate(()=>document.querySelector('#badge').className='badge badge-style-type-members-only');
 await page.waitForFunction(()=>document.querySelector('#card').getAttribute('data-clean-up-youtube-hidden')==='1');
});

}
