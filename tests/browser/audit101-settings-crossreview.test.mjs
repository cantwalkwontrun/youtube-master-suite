// Language: en-GB. Independent ancestor-transition cross-review.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {installLayoutControls} from '../../sources/layout-controls.mjs';
import {launchFixtureBrowser} from './fixture-browser.mjs';
test('ancestor visibility transitions update theatre header and related layout without navigation',async t=>{
 const browser=await launchFixtureBrowser();t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><body><ytd-masthead style="display:block;height:56px">Header</ytd-masthead><div id="ancestor" style="opacity:0"><ytd-watch-flexy theater style="display:block;width:640px;height:360px"><div id="secondary"><div id="related" style="width:100px;height:80px">Related</div></div></ytd-watch-flexy></div></body></html>'}));
 await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await page.evaluate(factory=>{window.disposeReview=(0,eval)('('+factory+')')({document,window,preferences:{fullWindowTheatre:true,theatreHideHeader:true,relatedBelowPlayer:true}});},installLayoutControls.toString());
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await settle();assert.equal(await page.locator('ytd-masthead').isVisible(),true);
 await page.evaluate(()=>document.getElementById('ancestor').style.opacity='1');await settle();
 assert.equal(await page.locator('ytd-masthead').isVisible(),false);
 assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),'1');
 await page.evaluate(()=>document.getElementById('ancestor').style.opacity='0');await settle();
 assert.equal(await page.locator('ytd-masthead').isVisible(),true);
 assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),null);
});
