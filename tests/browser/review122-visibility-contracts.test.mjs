// Language: en-GB. Independent local review regressions; synthetic page only.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser } from './fixture-browser.mjs';
import { installNativeMenuVisibility } from '../../sources/native-menu-visibility.mjs';
import { installVideoMenu } from '../../sources/video-menu.mjs';
import { createMenuLayout } from '../../sources/menu-layout.mjs';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
async function fixture(t, { hiddenAncestor = false, sheet = false } = {}) {
  const context = await browser.newContext({ serviceWorkers:'block' });
  await context.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType:'text/html', body:'<!doctype html><html lang="en-GB"><style>ytd-app,ytd-popup-container,ytd-menu-popup-renderer,ytd-menu-service-item-renderer,yt-sheet-view-model,yt-list-view-model,yt-list-item-view-model{display:block}[hidden]{display:none!important}</style><body><ytd-app><div id="ancestor"><ytd-popup-container></ytd-popup-container></div></ytd-app>' })
    : route.abort());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await page.evaluate(({ hiddenAncestor, sheet, installer }) => {
    const popup = document.createElement(sheet ? 'yt-sheet-view-model' : 'ytd-menu-popup-renderer');
    document.querySelector('ytd-popup-container').append(popup);
    const data = sheet ? { content:{ listViewModel:{ listItems:[] } } } : { items:[] };
    if (sheet) popup.componentProps = { data:() => data }; else popup.data = data;
    const parent = sheet ? popup.appendChild(document.createElement('yt-list-view-model')) : popup;
    for (const [title, icon] of [['Hype','HYPE'],['Other','SOMETHING_NEW']]) {
      const value = sheet ? { title:{ content:title }, leadingImage:{ sources:[{ clientResource:{ imageName:icon } }] } }
        : { text:{ simpleText:title }, icon:{ iconType:icon } };
      (sheet ? data.content.listViewModel.listItems : data.items).push(sheet ? { listItemViewModel:value } : { menuServiceItemRenderer:value });
      const row = document.createElement(sheet ? 'yt-list-item-view-model' : 'ytd-menu-service-item-renderer');
      row.data = value;
      if (sheet) row.componentProps = { data:() => value };
      row.dataset.action = title; row.textContent = title; parent.append(row);
    }
    document.querySelector('#ancestor').hidden = hiddenAncestor;
    window.review122 = { popup, data, dispose:(0,eval)('('+installer+')')({ document, window, preferences:{ menuShowDownload:false, menuShowHype:false } }) };
  }, { hiddenAncestor, sheet, installer:installNativeMenuVisibility.toString() });
  await settle(page);
  return page;
}
async function settle(page) { await page.evaluate(async () => { for (let i=0;i<3;i++) await new Promise(requestAnimationFrame); }); }

test('hidden menu becomes filtered when an owner above the popup container is shown', async t => {
  const page = await fixture(t, { hiddenAncestor:true });
  await page.evaluate(() => { document.querySelector('#ancestor').hidden = false; });
  await settle(page);
  assert.equal(await page.locator('[data-action="Hype"]').isVisible(), false);
  await page.evaluate(() => { document.querySelector('#ancestor').hidden = true; });
  await settle(page);
  assert.equal(await page.locator('[data-ytms-native-menu-hidden]').count(), 0);
  await page.evaluate(() => { document.querySelector('#ancestor').hidden = false; });
  await settle(page);
  assert.equal(await page.locator('[data-action="Hype"]').isVisible(), false);
});

test('sheet with explicitly contradictory row binding does not hide an unrelated action', async t => {
  const page = await fixture(t, { sheet:true });
  await page.evaluate(() => {
    const parent = review122.popup.querySelector('yt-list-view-model');
    const hype = parent.querySelector('[data-action="Hype"]');
    parent.append(hype);
  });
  await settle(page);
  assert.equal(await page.locator('[data-action="Other"]').isVisible(), true);
  assert.equal(await page.locator('[data-ytms-native-menu-hidden]').count(), 0);
  await page.evaluate(() => {
    const parent = review122.popup.querySelector('yt-list-view-model');
    parent.prepend(parent.querySelector('[data-action="Hype"]'));
  });
  await settle(page);
  assert.equal(await page.locator('[data-action="Hype"]').isVisible(), false);
});

test('external ancestor observation ignores unrelated descendant style churn', async t => {
  const page = await fixture(t);
  const reads = await page.evaluate(async () => {
    const widget = document.createElement('div');
    document.querySelector('ytd-app').append(widget);
    for (let i=0;i<3;i++) await new Promise(requestAnimationFrame);
    let reads = 0;
    const original = review122.popup.getBoundingClientRect.bind(review122.popup);
    review122.popup.getBoundingClientRect = () => { reads++; return original(); };
    for (let i=0;i<1000;i++) { widget.style.opacity=String(i%2); widget.textContent=String(i); }
    for (let i=0;i<3;i++) await new Promise(requestAnimationFrame);
    return reads;
  });
  assert.equal(reads,0);
});

for (const clone of [false,true]) test(`distinct equivalent sheet models remain supported (${clone?'cloned wrapper':'cloned inner model'})`, async t => {
  const page=await fixture(t,{sheet:true});
  await page.evaluate(clone=>{
    for(const row of review122.popup.querySelectorAll('yt-list-item-view-model')) {
      const value=JSON.parse(JSON.stringify(row.data));
      row.componentProps={data:()=>clone?{listItemViewModel:value}:value};
    }
    review122.popup.dispatchEvent(new CustomEvent('yt-popup-opened',{bubbles:true}));
  },clone);
  await settle(page);
  assert.equal(await page.locator('[data-action="Hype"]').isVisible(),false);
  assert.equal(await page.locator('[data-action="Other"]').isVisible(),true);
});

for(const binding of ['contradiction','inner','wrapper','opaque'])test(`full editor handles explicit and opaque sheet bindings safely (${binding})`,async t=>{
  const page=await fixture(t,{sheet:true});
  await page.evaluate(({installer,layouts,binding})=>{
    review122.dispose();
    const popup=review122.popup,parent=popup.querySelector('yt-list-view-model');
    if(binding==='contradiction')parent.append(parent.querySelector('[data-action="Hype"]'));
    else for(const row of parent.children){
      const value=JSON.parse(JSON.stringify(row.data));
      row.componentProps={data:()=>binding==='opaque'?Symbol('opaque'):binding==='wrapper'?{listItemViewModel:value}:value};
    }
    const value={title:{content:'Add to queue'},leadingImage:{sources:[{clientResource:{imageName:'ADD_TO_QUEUE_TAIL'}}]},rendererContext:{commandContext:{onTap:{innertubeCommand:{signalServiceEndpoint:{actions:[{addToPlaylistCommand:{videoIds:['bbbbbbbbbbb'],listType:'PLAYLIST_EDIT_LIST_TYPE_QUEUE'}}]}}}}}};
    review122.data.content.listViewModel.listItems.push({listItemViewModel:value});
    const row=document.createElement('yt-list-item-view-model');row.componentProps={data:()=>value};row.textContent='Add to queue';parent.append(row);
    const card=document.createElement('ytd-video-renderer');card.style.display='block';
    const anchor=document.createElement('a');anchor.href='/watch?v=bbbbbbbbbbb';anchor.textContent='Synthetic video';
    const host=document.createElement('ytd-menu-renderer'),button=document.createElement('button');button.id='review122-trigger';button.textContent='More';host.append(button);card.append(anchor,host);document.body.prepend(card);
    popup.hidden=true;button.addEventListener('click',()=>{popup.hidden=false;popup.dispatchEvent(new CustomEvent('yt-popup-opened',{bubbles:true}));});
    window.review122.dispose=(0,eval)('('+installer+')')({settings:{initial:{menuShowDownload:false,menuShowHype:false,menuShowAgeLimit:false}},menuLayout:(0,eval)('('+layouts+')')(),channelAge:{channelFromCard:()=>null}});
  },{installer:installVideoMenu.toString(),layouts:createMenuLayout.toString(),binding});
  await page.locator('#review122-trigger').click();
  await settle(page);
  assert.equal(await page.locator('[data-ytms-video-menu]').count(),binding==='contradiction'?0:1);
  assert.equal(await page.locator('[data-action="Other"]').isVisible(),true);
  assert.equal(await page.locator('[data-action="Hype"]').isVisible(),binding==='contradiction');
});
