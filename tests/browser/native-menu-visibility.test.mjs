// Language: en-GB. Visibility-only native overflow contracts; no real account or network.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installNativeMenuVisibility } from '../../sources/native-menu-visibility.mjs';
import { createMenuLayout } from '../../sources/menu-layout.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
let browser; before(async()=>{browser=await launchFixtureBrowser();});after(async()=>{await browser?.close();});
async function open(t,{sheet=false,download=false,hype=true,layout=false,invalid=false}={}){
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><style>ytd-app,ytd-popup-container,tp-yt-iron-dropdown,ytd-menu-popup-renderer,yt-sheet-view-model,yt-list-view-model,ytd-menu-service-item-renderer,ytd-menu-service-item-download-renderer,yt-list-item-view-model,yt-download-list-item-view-model{display:block}[hidden]{display:none!important}</style><body><ytd-app><ytd-popup-container><tp-yt-iron-dropdown></tp-yt-iron-dropdown></ytd-popup-container></ytd-app>'}):route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await context.close();}});await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
 await page.evaluate(({sheet,download,hype,layout,invalid,installer,layouts})=>{
  window.f={calls:[],refits:0};const dropdown=document.querySelector('tp-yt-iron-dropdown');dropdown.refit=()=>f.refits++;
  const popup=document.createElement(sheet?'yt-sheet-view-model':'ytd-menu-popup-renderer');dropdown.append(popup);f.popup=popup;
  const defs=[['Save','BOOKMARK_BORDER'],['Hype','HYPE'],['Download','OFFLINE_DOWNLOAD'],['Report','FLAG'],['Other action','SOMETHING_NEW']];
  const items=defs.map(([title,icon])=>title==='Download' ? sheet?{downloadListItemViewModel:{}}:{menuServiceItemDownloadRenderer:{serviceEndpoint:{offlineVideoEndpoint:{}}}} : sheet?{listItemViewModel:{title:{content:title},leadingImage:{sources:[{clientResource:{imageName:icon}}]}}}:{menuServiceItemRenderer:{text:{simpleText:title},icon:{iconType:icon},serviceEndpoint:{}}});
  const data=sheet?{content:{listViewModel:{listItems:items}}}:{items};if(sheet)popup.componentProps={data:()=>data};else popup.data=data;
  const parent=sheet?document.createElement('yt-list-view-model'):popup;if(sheet)popup.append(parent);
  defs.forEach(([title],i)=>{
   const row=document.createElement(sheet?(title==='Download'?'yt-download-list-item-view-model':'yt-list-item-view-model'):(title==='Download'?'ytd-menu-service-item-download-renderer':'ytd-menu-service-item-renderer'));
   row.dataset.action=title;row.data=invalid?{}:(items[i].menuServiceItemRenderer||items[i].menuServiceItemDownloadRenderer);
   const button=document.createElement('button');button.textContent=title;button.addEventListener('click',()=>f.calls.push(title));row.append(button);parent.append(row);
  });
  const menuLayout=(0,eval)('('+layouts+')')();const preferences={menuShowDownload:download,menuShowHype:hype};
  if(layout){preferences.menuLayout=menuLayout.fromPreferences({menuShowDownload:true,menuShowHype:false});}
  f.dispose=(0,eval)('('+installer+')')({document,window,preferences,menuLayout});
 },{sheet,download,hype,layout,invalid,installer:installNativeMenuVisibility.toString(),layouts:createMenuLayout.toString()});
 await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});return page;
}
for(const sheet of [false,true])for(const download of [false,true])for(const hype of [false,true])test(`unbound native overflow obeys Download ${download} and Hype ${hype} (${sheet?'sheet':'legacy'})`,async t=>{
 const page=await open(t,{sheet,download,hype});
 assert.equal(await page.locator('[data-action="Download"]').isVisible(),download);assert.equal(await page.locator('[data-action="Hype"]').isVisible(),hype);
 assert.equal(await page.locator('[data-action="Other action"]').isVisible(),true);
 await page.getByRole('button',{name:'Other action',exact:true}).click();assert.deepEqual(await page.evaluate(()=>f.calls),['Other action']);
 if(hype){await page.getByRole('button',{name:'Hype',exact:true}).click();assert.equal(await page.evaluate(()=>f.calls.at(-1)),'Hype');}
});
test('custom editor visibility overrides legacy flags without changing settings',async t=>{
 const page=await open(t,{layout:true});assert.equal(await page.locator('[data-action="Download"]').isVisible(),true);assert.equal(await page.locator('[data-action="Hype"]').isVisible(),false);
});
test('disposal and suspension remove only owned visibility markers',async t=>{
 const page=await open(t,{hype:false});await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.locator('[data-ytms-native-menu-hidden]').count(),0);
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await page.waitForFunction(()=>document.querySelector('[data-action="Download"]').hasAttribute('data-ytms-native-menu-hidden'));
 await page.evaluate(()=>f.dispose());assert.equal(await page.locator('[data-action="Download"]').isVisible(),true);assert.deepEqual(await page.evaluate(()=>f.calls),[]);
});
test('unsupported native row bindings stay untouched',async t=>{const page=await open(t,{invalid:true,hype:false});assert.equal(await page.locator('[data-ytms-native-menu-hidden]').count(),0);});
test('a recycled row cannot retain another action visibility marker',async t=>{
 const page=await open(t,{hype:false});
 await page.evaluate(()=>{
  const other=document.querySelector('[data-action="Other action"]'),clone=document.querySelector('[data-action="Download"]').cloneNode(true);
  clone.dataset.action='Other action';clone.textContent='Other action';clone.data=other.data;other.replaceWith(clone);
 });
 await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-action="Other action"]').isVisible(),true);
});
test('other popup content causes no native-menu layout reads',async t=>{
 const page=await open(t);
 const reads=await page.evaluate(async()=>{
  const offer=document.createElement('div'),caption=document.createElement('div');offer.append(caption);document.querySelector('ytd-popup-container').append(offer);
  for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
  let reads=0;const rect=f.popup.getBoundingClientRect.bind(f.popup);f.popup.getBoundingClientRect=()=>{reads++;return rect();};
  for(let i=0;i<2000;i++){caption.textContent=String(i);caption.style.opacity=String(i%2);}
  for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);return reads;
 });assert.equal(reads,0);
});

for(const interruption of ['yt-navigate-start','pagehide','dispose'])test(`native refit ${interruption} stops the in-flight visibility scan`,async t=>{
 const page=await open(t,{hype:false});
 await page.evaluate(({installer,interruption})=>{
  f.dispose();
  const second=f.popup.cloneNode(true);second.dataset.secondOverflow='';second.data=f.popup.data;
  const originalRows=[...f.popup.children];
  [...second.children].forEach((row,i)=>row.data=originalRows[i].data);
  f.popup.after(second);f.refits=0;
  document.querySelector('tp-yt-iron-dropdown').refit=()=>{
   if(++f.refits===1){if(interruption==='dispose')f.dispose();else dispatchEvent(new Event(interruption));}
  };
  f.dispose=(0,eval)('('+installer+')')({document,window,preferences:{menuShowDownload:false,menuShowHype:false}});
 },{installer:installNativeMenuVisibility.toString(),interruption});
 await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-native-menu-hidden]').count(),0,'lifecycle cleanup must not be followed by stale marker writes');
 assert.equal(await page.evaluate(()=>f.refits),1,'the invalidated scan must not refit another popup');
});

for(const interruption of ['yt-navigate-start','pagehide'])test(`compiled visibility scan stops when native refit emits ${interruption}`,async t=>{
 const page=await open(t,{hype:false});
 await page.evaluate(interruption=>{
  f.dispose();
  const second=f.popup.cloneNode(true);second.data=f.popup.data;
  [...second.children].forEach((row,i)=>row.data=f.popup.children[i].data);
  f.popup.after(second);f.refits=0;
  document.querySelector('tp-yt-iron-dropdown').refit=()=>{if(++f.refits===1)dispatchEvent(new Event(interruption));};
  localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{menuShowHype:false,menuShowDownload:false,theatreMode:false}}));
 },interruption);
 await page.addScriptTag({content:readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8')});
 const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
 await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true,timeoutMs:10000});
 assert.equal(await page.locator('[data-ytms-native-menu-hidden]').count(),0);
 assert.equal(await page.evaluate(()=>f.refits),1);
});
