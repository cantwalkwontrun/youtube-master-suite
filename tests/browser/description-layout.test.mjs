// Language: en-GB. Synthetic layout derived from measured geometry, never user content.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth, navigateWatchFixture } from './fixture-browser.mjs';
const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const fixture = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const description = `<div id="description-row"><div id="description"><div id="description-inner" style="min-height:24px"><ytd-text-inline-expander id="description-inline-expander" is-collapsed>
<div id="expanded"><span><a href="/hashtag/fixture">#fixture</a></span><br><p>Synthetic description with a native <a href="https://example.invalid/">resource link</a>.</p>${'<p>Additional synthetic description content.</p>'.repeat(35)}</div>
<button id="description-toggle">Show more</button></ytd-text-inline-expander></div></div></div>`;
const html = fixture.replace('</ytd-watch-metadata>', description + '</ytd-watch-metadata>').replace('</head>', `<style>
ytd-watch-metadata,#description-inner { display:block; }
#description-row { display:flex; flex-direction:column; padding-bottom:12px; }
#description { flex:1 1 0px; position:relative; }
#description-inner { padding:10px; }
#description-inline-expander { display:block; position:relative; overflow:hidden; contain:content; }
#description-inline-expander[is-collapsed] #expanded { display:none; }
#expanded p { margin:0 0 14px; line-height:22px; }
</style></head>`);
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function open(t, preferences, flow = 'flex') {
  const context = await browser.newContext({ viewport:{width:1280,height:900}, serviceWorkers:'block' });
  await context.route('**/*', route => route.abort());
  await context.addInitScript(({preferences})=>{
    if(location.origin==='https://www.youtube.com')localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{theatreMode:false,...preferences}}));
  },{preferences});
  const page = await context.newPage(), errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await context.close();}});
  await navigateWatchFixture(page,{html:flow === 'block' ? html.replace('display:flex; flex-direction:column;', 'display:block;') : html});
  await page.addScriptTag({content:source});
  await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
  await page.evaluate(()=>{
    document.querySelector('#description-toggle').onclick=()=>document.querySelector('#description-inline-expander').toggleAttribute('is-collapsed');
  });
  return page;
}

async function geometry(page) {
  return page.evaluate(()=>{
    const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
    return {expanded:box('#expanded'),description:box('#description'),metadata:box('ytd-watch-metadata'),comments:box('ytd-comments')};
  });
}

test('an empty description restores its inline declarations and preserves intervening writes', async t => {
  const page = await open(t, { collapseDescriptionBlankRows: true, hideHashtags: true });
  await page.evaluate(() => {
    const expanded = document.querySelector('#expanded');
    expanded.style.setProperty('display', 'grid', 'important');
    expanded.style.setProperty('min-height', '24px', 'important');
    expanded.replaceChildren();
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.waitForFunction(() => document.querySelector('#expanded').style.display === 'none');
  await page.evaluate(() => {
    const expanded = document.querySelector('#expanded');
    expanded.style.setProperty('margin', '12px', 'important');
    expanded.textContent = 'A populated description';
    document.querySelector('#description-inline-expander').removeAttribute('is-collapsed');
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.waitForFunction(() => document.querySelector('#expanded').style.display === 'grid');
  assert.deepEqual(await page.locator('#expanded').evaluate(node => [node.style.minHeight, node.style.margin]), ['24px', '12px']);
});
async function assertFlow(page) {
  const result=await geometry(page);
  assert.ok(result.description.height>=result.expanded.height,JSON.stringify(result));
  assert.ok(result.comments.top>=result.expanded.bottom,JSON.stringify(result));
  assert.equal(await page.locator('#description-inner').evaluate(node=>node.style.minHeight),'24px');
  assert.equal(await page.locator('#expanded a[href="https://example.invalid/"]').count(),1);
}

for (const flow of ['flex','block']) for (const cleanup of [true,false]) for (const hashtags of [true,false])
test(`description transitions preserve flow (${flow}, cleanup ${cleanup}, hashtags ${hashtags})`,async t=>{
  const page=await open(t,{collapseDescriptionBlankRows:cleanup,hideHashtags:hashtags},flow);
  for (let cycle=0;cycle<2;cycle++) {
    await page.locator('#description-toggle').click();
    await page.waitForTimeout(150);
    await assertFlow(page);
    await page.locator('#description-toggle').click();
    await page.waitForTimeout(100);
    const collapsed=await geometry(page);
    assert.ok(collapsed.description.height<160,JSON.stringify(collapsed));
  }
  await page.locator('#description-toggle').click();
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='Additional late description content. '.repeat(80);document.querySelector('#expanded').append(p);});
  await page.waitForTimeout(150);
  await assertFlow(page);
});

test('expanded description remains above comments through page fullscreen and return',async t=>{
  const page=await open(t,{fullscreenComments:true,collapseDescriptionBlankRows:true});
  await page.locator('#description-toggle').click();
  await assertFlow(page);
  await page.locator('#page-fullscreen').click();
  await page.waitForFunction(()=>Boolean(document.fullscreenElement));
  await assertFlow(page);
  await page.evaluate(()=>document.exitFullscreen());
  await page.waitForFunction(()=>!document.fullscreenElement);
  await assertFlow(page);
});

test('expanded description keeps native nodes through theatre mode and navigation',async t=>{
  const page=await open(t,{collapseDescriptionBlankRows:true,hideStructuredDescription:false,liveChatButton:true});
  await page.locator('#description-toggle').click();
  await page.evaluate(()=>{window.descriptionNode=document.querySelector('#expanded');window.descriptionLink=descriptionNode.querySelector('a[href="https://example.invalid/"]');document.querySelector('ytd-watch-flexy').setAttribute('theater','');window.dispatchEvent(new Event('yt-page-data-updated'));});
  await assertFlow(page);
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'', '/watch?v=bbbbbbbbbbb');window.dispatchEvent(new Event('yt-navigate-finish'));});
  await page.waitForTimeout(150);
  await assertFlow(page);
  const geometry=await page.evaluate(()=>{
    return document.querySelector('#expanded')===descriptionNode && descriptionLink.isConnected;
  });
  assert.equal(geometry,true);
});
