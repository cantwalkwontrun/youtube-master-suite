// Language: en-GB. Synthetic nested extension rail ownership regression.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installLayoutControls } from '../../sources/layout-controls.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));

for (const compiled of [false, true]) for (const boxless of [false, true]) test(`related placement preserves an unknown surface sharing a nested related wrapper (${compiled ? 'Suite' : 'source'}, boxless ${boxless})`, async t => {
  const browser = await launchFixtureBrowser(); t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB"><style>
    ytd-watch-flexy,#secondary,#secondary-inner,#related,.wrapper,native-extension-panel{display:block;min-height:20px}
    [hidden]{display:none!important}
    </style><ytd-watch-flexy><div id="columns"><div id="primary">Player</div><div id="secondary"><div id="secondary-inner"><div class="wrapper"><div id="related">Related</div><native-extension-panel>Unrelated extension controls</native-extension-panel></div></div></div></div></ytd-watch-flexy>`}));
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  if (boxless) await page.locator('native-extension-panel').evaluate(node=>{node.style.display='contents';node.innerHTML='<button>Unrelated extension controls</button>';});
  if (compiled) {
    await page.evaluate(() => localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({version:1,values:{relatedBelowPlayer:true,hideRelated:false}})));
    await page.addScriptTag({content:suite});
    await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
  } else {
    await page.evaluate(source => { window.disposeLayout=(0,eval)(`(${source})`)({document,window,preferences:{relatedBelowPlayer:true}}); }, installLayoutControls.toString());
  }
  const settle = () => page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame)});
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),null,'unrelated visible controls must retain the native rail');
  await page.locator('native-extension-panel').evaluate(node=>node.hidden=true);
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),'1','a wrapper containing only visible related videos remains eligible');
  await page.locator('native-extension-panel').evaluate(node=>node.hidden=false);
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),null,'restoring sibling controls must withdraw the layout override');
  await page.locator('native-extension-panel').evaluate(node=>node.remove());
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),'1');
  await page.evaluate(()=>{window.railText=document.createTextNode('Visible extension status');document.querySelector('#related').after(window.railText);});
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),null,'visible sibling text is unrelated rail content too');
  await page.evaluate(()=>window.railText.remove());
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),'1','removing sibling text restores eligibility');
  await page.evaluate(()=>{window.railText=document.createTextNode(' ');document.querySelector('#related').after(window.railText);});
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),'1','whitespace is not a rail surface');
  await page.evaluate(()=>window.railText.nodeValue='A late extension status');
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),null,'an in-place text update must withdraw the override');
  await page.evaluate(()=>window.railText.nodeValue=' ');
  await settle();
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),'1','clearing status text restores eligibility');
});
