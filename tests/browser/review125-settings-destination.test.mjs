// Language: en-GB. Search destination continuity across owned menu-editor renders.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
const fixture=readFileSync(new URL('./watch-page.html',import.meta.url),'utf8');
let browser;before(async()=>{browser=await launchFixtureBrowser();});after(()=>browser?.close());
async function open(t){
  const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());
  await context.route('**/*',route=>route.request().url().startsWith('https://www.youtube.com/watch?')?route.fulfill({contentType:'text/html',body:fixture}):route.abort());
  await context.addInitScript({content:suite});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);
  page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
  await page.locator('#ytms-settings-button').click();
  await page.locator('#ytms-settings-search').fill('Show Hype in video menus');
  await page.locator('.settings-search-result[data-target="menuShowHype"]').click();
  return page;
}
test('menu search destination survives visibility edits and reordering without stale marks or writes',async t=>{
  const page=await open(t),row=page.locator('[data-menu-item="hype"]');
  assert.deepEqual(await row.locator('mark').allTextContents(),['Hype']);
  const before=await page.evaluate(()=>GM_getValue('yt-master-suite.settings.v1',null));
  await page.locator('#ytms-menuShowHype').uncheck();
  assert.equal(await row.evaluate(el=>el.classList.contains('settings-search-destination')),true,
    'The selected setting remains identified after its owned row is rendered again');
  assert.deepEqual(await row.locator('mark').allTextContents(),['Hype']);
  await row.locator('[data-direction="up"]').click();
  assert.equal(await page.locator('.settings-search-destination').count(),1);
  assert.deepEqual(await row.locator('mark').allTextContents(),['Hype']);
  assert.equal(await page.locator('#ytms-menuShowHype').isChecked(),false);
  assert.equal(await page.locator('#ytms-save-preview').isEnabled(),true);
  assert.equal(await page.evaluate(()=>GM_getValue('yt-master-suite.settings.v1',null)),before);
  await page.locator('#ytms-tab-feed').click();
  assert.equal(await page.locator('.settings-search-destination, .settings-search-destination-match').count(),0);
});
