// Language: en-GB. Synthetic native menu-renderer trigger contract; live markup is not inferred from this fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { createFeatureCatalogue } from '../../sources/feature-catalogue.mjs';
import { createSuiteSettings } from '../../sources/suite-settings.mjs';
import { installMiniplayerControls } from '../../sources/miniplayer-controls.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
let browser;before(async()=>{browser=await launchFixtureBrowser();});after(()=>browser?.close());
async function open(t,{compiled,modern,hide,navigation}){
  const panel='ytd-playlist-panel-renderer',row='ytd-playlist-panel-video-renderer';
  const trigger=(id,kind=modern)=>kind
    ? `<yt-button-shape id="button-shape" class="style-scope ytd-menu-renderer"><button id="${id}">More</button></yt-button-shape>`
    : `<yt-icon-button id="button" class="dropdown-trigger style-scope ytd-menu-renderer"><button id="${id}">More</button></yt-icon-button>`;
  const extension=prefix=>`<div class="extension-widget"><ytd-menu-renderer>${trigger(prefix+'-extension-menu')}</ytd-menu-renderer></div>`;
  const header=prefix=>`<div class="header style-scope ytd-playlist-panel-renderer" style="height:52px"><div id="header-contents"><div id="playlist-action-menu" class="style-scope ytd-playlist-panel-renderer"><ytd-menu-renderer><div id="top-level-buttons-computed"><yt-button-shape id="save-shape" class="style-scope ytd-menu-renderer"><button id="${prefix}-save">Save</button></yt-button-shape></div>${trigger(prefix+'-header-menu')}<button id="${prefix}-other">Other</button><div><button class="dropdown-trigger" id="${prefix}-unknown-nested">Unknown nested control</button></div></ytd-menu-renderer></div><div id="overflow-menu" class="style-scope ytd-playlist-panel-renderer"><ytd-menu-renderer>${trigger(prefix+'-end-overflow')}</ytd-menu-renderer></div><div id="overflow-menu-top-row" class="style-scope ytd-playlist-panel-renderer"><ytd-menu-renderer>${trigger(prefix+'-top-overflow')}</ytd-menu-renderer></div>${extension(prefix+'-header')}<div id="overflow-menu"><ytd-menu-renderer>${trigger(prefix+'-unscoped-slot')}</ytd-menu-renderer></div></div><button class="dropdown-trigger" id="${prefix}-unrelated">Unrelated control</button></div>`;
  const rows=prefix=>`<${row} selected><ytd-menu-renderer>${trigger(prefix+'-current-menu')}</ytd-menu-renderer></${row}><${row}><ytd-menu-renderer>${trigger(prefix+'-other-row-menu')}</ytd-menu-renderer></${row}>`;
  const contents=prefix=>`<div id="container" class="style-scope ytd-playlist-panel-renderer">${header(prefix)}${extension(prefix+'-panel')}${rows(prefix)}</div>`;
  const html=`<!doctype html><html lang="en-GB"><style>ytd-app,ytd-miniplayer,ytd-watch-flexy,${panel},${row},ytd-menu-renderer{display:block}button{display:inline-block;min-width:24px;min-height:24px}.header,#header-contents,#playlist-action-menu,ytd-menu-renderer{display:flex;align-items:center;gap:4px}</style><body><ytd-app><ytd-miniplayer><${panel} within-miniplayer>${contents('mini')}</${panel}></ytd-miniplayer><ytd-watch-flexy><${panel}>${contents('watch')}</${panel}></ytd-watch-flexy></ytd-app></body></html>`;
  const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());
  await context.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:html}):route.abort());
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);
  page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.goto('https://www.youtube.com/');
  await page.evaluate(()=>{
    window.headerFixtureCalls=[];
    for(const id of ['mini-save','mini-current-menu','mini-other-row-menu','watch-header-menu'])document.getElementById(id).addEventListener('click',()=>headerFixtureCalls.push(id));
  });
  const preferences={hideMiniplayerQueueMenu:hide,miniplayerNavigation:navigation,theatreMode:false,miniplayerEnabled:false};
  if(compiled){
    await page.evaluate(values=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values})),preferences);
    await page.addScriptTag({content:suite});await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
  }else await page.evaluate(({factory,preferences})=>{window.disposeHeaderControls=(0,eval)('('+factory+')')({document,window,preferences});},{factory:installMiniplayerControls.toString(),preferences});
  return page;
}
test('queue header overflow cleanup has a reversible default-on Native queue setting',()=>{
  const feature=createFeatureCatalogue().definitions.find(item=>item.key==='hideMiniplayerQueueMenu');
  assert.ok(feature);assert.equal(feature.tab,'miniplayer');assert.equal(feature.section,'Native queue');assert.equal(feature.default,true);
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const settings=createSuiteSettings(()=>storage,()=>true);
  assert.equal(settings.initial.hideMiniplayerQueueMenu,true);
  assert.equal(settings.save({...settings.read(),hideMiniplayerQueueMenu:false,viewerColour:'#ABCDEF'}).ok,true);
  assert.equal(settings.read().hideMiniplayerQueueMenu,false);assert.equal(settings.read().viewerColour,'#ABCDEF');
});
for(const compiled of [false,true])for(const modern of [false,true])for(const hide of [false,true])for(const navigation of [false,true])test(`only native miniplayer queue header overflow is hidden (${compiled?'Suite':'source'}, ${modern?'modern':'legacy'}, hide=${hide}, arrows=${navigation})`,async t=>{
  const page=await open(t,{compiled,modern,hide,navigation});
  for(const id of ['mini-header-menu','mini-end-overflow','mini-top-overflow'])assert.equal(await page.locator('#'+id).isVisible(),!hide,id);
  for(const id of ['mini-save','mini-current-menu','mini-other-row-menu','mini-other','mini-unrelated','mini-unknown-nested','mini-header-extension-menu','mini-panel-extension-menu','mini-unscoped-slot','watch-save','watch-header-menu','watch-current-menu','watch-other-row-menu'])assert.equal(await page.locator('#'+id).isVisible(),true,id);
  assert.equal(await page.locator('ytd-miniplayer .header').evaluate(node=>node.getBoundingClientRect().height),52,'The native Save/header layout is preserved');
  for(const id of ['mini-save','mini-current-menu','mini-other-row-menu','watch-header-menu'])await page.locator('#'+id).click();
  assert.deepEqual(await page.evaluate(()=>headerFixtureCalls),['mini-save','mini-current-menu','mini-other-row-menu','watch-header-menu']);
  if(!compiled){await page.evaluate(()=>disposeHeaderControls());assert.equal(await page.locator('#mini-header-menu').isVisible(),true,'Disposal restores the native control');}
});
