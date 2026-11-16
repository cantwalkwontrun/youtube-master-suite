// Language: en-GB. Isolated native-binding, combined-menu and layout contracts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installQueueHeaderActions } from '../../sources/queue-header-actions.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
let browser;before(async()=>{browser=await launchFixtureBrowser();});after(()=>browser?.close());
async function settle(page){await page.evaluate(async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});}
async function open(t,{compiled=false,mode='',list='TLPQfixture',enabled=true,theme='dark',viewport={width:1000,height:700}}={}){
  const context=await browser.newContext({serviceWorkers:'block',viewport});t.after(()=>context.close());
  const html=`<!doctype html><html lang="en-GB" ${theme==='dark'?'dark':''}><meta charset="utf-8"><style>
  body{margin:8px;background:${theme==='dark'?'#0f0f0f':'#fff'};color:${theme==='dark'?'#f1f1f1':'#0f0f0f'};font:14px Arial;--yt-spec-menu-background:${theme==='dark'?'#282828':'#fff'};--yt-spec-text-primary:${theme==='dark'?'#f1f1f1':'#0f0f0f'}}
  ytd-app,ytd-miniplayer,ytd-watch-flexy,ytd-playlist-panel-renderer{display:block}.header{width:360px;max-width:100%;padding:8px;box-sizing:border-box}.heading{display:flex;justify-content:space-between;align-items:center}h3{font-size:18px;margin:0}button{min-width:24px;min-height:24px}#close-button{display:inline-flex;width:32px;height:32px}#close-button button{width:32px;height:32px}#close-button svg{width:20px;height:20px}.toolbar{display:flex;justify-content:space-between}#overflow-menu-top-row{display:none}
  yt-icon-button#button,yt-button-shape#button-shape{display:inline-flex;height:32px}tp-yt-paper-item{display:flex;flex-direction:column;min-height:48px;padding:0 16px;color:#000}yt-formatted-string{display:block;color:var(--yt-spec-text-primary)}ytd-playlist-panel-video-renderer{display:block}
  </style><ytd-app><ytd-miniplayer><ytd-playlist-panel-renderer><div id="container"><div class="header ytd-playlist-panel-renderer"><div class="heading"><h3>Queue</h3><yt-icon-button id="close-button"><button aria-label="Close queue"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor"/></svg></button></yt-icon-button></div><div>2 / 2</div><div class="toolbar">
  <div id="playlist-action-menu" class="ytd-playlist-panel-renderer"><ytd-menu-renderer id="save-source"><yt-icon-button id="button"><button>Native Save menu</button></yt-icon-button><yt-button-shape id="button-shape" style="display:none"><button>Retained Save menu</button></yt-button-shape></ytd-menu-renderer></div>
  <div id="overflow-menu" class="ytd-playlist-panel-renderer"><ytd-menu-renderer id="clear-source"><yt-icon-button id="button" style="display:none"><button>Retained Clear menu</button></yt-icon-button><yt-button-shape id="button-shape"><button>Native Clear menu</button></yt-button-shape></ytd-menu-renderer></div>
  <div id="overflow-menu-top-row" class="ytd-playlist-panel-renderer"></div></div></div><ytd-playlist-panel-video-renderer><button id="video-menu">Video menu</button></ytd-playlist-panel-video-renderer></div></ytd-playlist-panel-renderer></ytd-miniplayer><ytd-watch-flexy></ytd-watch-flexy><button id="outside">Outside</button></ytd-app></html>`;
  await context.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html; charset=utf-8',body:html}):route.abort());
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.goto('https://www.youtube.com/');
  await page.evaluate(({mode,list})=>{
    window.f={calls:[],stamps:0,appRequests:[],headerClicks:0};
    if(mode==='missing-theme') {
      const style=document.createElement('style');
      style.textContent='body{--yt-spec-menu-background:initial!important;--yt-spec-text-primary:initial!important}tp-yt-paper-item{border:2px solid black;box-shadow:0 0 0 2px black;--yt-spec-text-primary:#eee}';
      document.head.append(style);
    }
    if(mode==='compact-header') {
      const header=document.querySelector('.header'),heading=document.querySelector('.heading');
      heading.insertBefore(document.querySelector('#overflow-menu'),document.querySelector('#close-button'));
      header.style.height='58px';header.style.paddingBottom='2px';
      document.querySelector('h3').style.color='rgb(241, 241, 241)';
      const style=document.createElement('style');style.textContent='.ytms-queue-more{color:#000!important}.ytms-queue-more svg path{fill:#000}';document.head.append(style);
    }
    f.panel=document.querySelector('ytd-playlist-panel-renderer');f.panel.data={playlistId:list,contents:[{playlistPanelVideoRenderer:{videoId:'aaaaaaaaaaa'}},{playlistPanelVideoRenderer:{videoId:'bbbbbbbbbbb'}}]};
    document.querySelector('ytd-app').addEventListener('fixture-service',event=>f.appRequests.push(event.detail));
    document.querySelector('.header').addEventListener('click',()=>f.headerClicks++);
    for(const [id,label,icon]of [['save-source','Save','BOOKMARK_BORDER'],['clear-source','Clear',null]]){
      const item={text:{simpleText:label},serviceEndpoint:{fixtureCommand:{action:label.toLowerCase(),token:'original'}}};if(icon)item.icon={iconType:icon};
      document.getElementById(id).data=mode==='flexible'?{topLevelButtons:[],flexibleItems:[{menuFlexibleItemRenderer:{menuItem:{menuServiceItemRenderer:item},topLevelButton:{buttonRenderer:{}}}}]}:{items:[{menuServiceItemRenderer:item}]};
    }
    f.item=key=>{const data=document.getElementById(key+'-source').data;return data.items?.[0]?.menuServiceItemRenderer||data.items?.[0]?.menuNavigationItemRenderer||data.flexibleItems[0].menuFlexibleItemRenderer.menuItem.menuServiceItemRenderer;};
    if(mode==='navigation-clear'){const item=f.item('clear');item.navigationEndpoint=item.serviceEndpoint;delete item.serviceEndpoint;document.getElementById('clear-source').data={items:[{menuNavigationItemRenderer:item}]};}
    if(mode==='unknown')f.item('clear').text.simpleText='Other';
    if(mode==='mixed')document.getElementById('clear-source').data.flexibleItems=[{}];
    if(mode==='conflict')f.panel.componentProps={data:()=>({playlistId:'TLPQother',contents:[{}]})};
    if(mode==='no-service')delete f.item('clear').serviceEndpoint;
    if(mode==='responsive'||mode==='ambiguous'){
      const copy=document.getElementById('clear-source').cloneNode(true);copy.id='alternate-source';copy.data=structuredClone(document.getElementById('clear-source').data);
      if(mode==='ambiguous')copy.data.items[0].menuServiceItemRenderer.serviceEndpoint.fixtureCommand.token='different';
      document.getElementById('overflow-menu-top-row').append(copy);
    }
    if(mode==='fallback')Object.defineProperty(HTMLElement.prototype,'showPopover',{configurable:true,value:undefined});
    if(mode==='popover-failure')Object.defineProperty(HTMLElement.prototype,'showPopover',{configurable:true,value(){throw Error('Unsupported popover');}});
    window.defineNative=()=>{
      for(const tag of ['ytd-menu-service-item-renderer','ytd-menu-navigation-item-renderer'])customElements.define(tag,class extends HTMLElement{
        set data(value){f.stamps++;if(mode==='rejected')return;this._data=value;if(mode==='delayed')return;
          const paper=document.createElement('tp-yt-paper-item'),icon=document.createElement('yt-icon'),text=document.createElement('yt-formatted-string');
          text.textContent=value.text.simpleText;paper.setAttribute('role','menuitem');paper.append(icon,text);this.replaceChildren(paper);
          paper.addEventListener('click',()=>{const action=(this.data.serviceEndpoint||this.data.navigationEndpoint).fixtureCommand;f.calls.push({...action});this.dispatchEvent(new CustomEvent('fixture-service',{bubbles:true,detail:action.action}));if(mode==='save-dialog'&&action.action==='save'){const dialog=document.createElement('dialog'),input=document.createElement('input');input.setAttribute('aria-label','Native playlist name');dialog.append(input);document.body.append(dialog);dialog.showModal();input.focus();}});
        }get data(){return this._data;}
      });
    };if(mode!=='unregistered')defineNative();
    f.closeBefore=document.getElementById('close-button').getBoundingClientRect().toJSON();
  },{mode,list});
  if(compiled){await page.evaluate(enabled=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{queueHeaderActions:enabled,hideMiniplayerQueueMenu:false,theatreMode:false,miniplayerEnabled:false}})),enabled);await page.addScriptTag({content:suite});await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});}
  else await page.evaluate(({factory,enabled})=>{window.disposeQueue=(0,eval)('('+factory+')')({document,window,preferences:{queueHeaderActions:enabled}});},{factory:installQueueHeaderActions.toString(),enabled});
  await settle(page);return page;
}
const more=page=>page.getByRole('button',{name:'Queue actions',exact:true});
const action=(page,name)=>page.getByRole('menuitem',{name:name+' queue',exact:true});
test('native queue controls return while a replacement row is restamping',async t=>{
  const page=await open(t);await more(page).click();await page.evaluate(()=>document.querySelector('[data-ytms-queue-menu-action="save"] yt-formatted-string').textContent='');await settle(page);
  assert.equal(await more(page).isVisible(),false);assert.equal(await page.locator('#save-source').isVisible(),true);assert.equal(await page.locator('#clear-source').isVisible(),true);
  assert.equal(await page.getByRole('menu',{name:'Queue actions'}).count(),0);
  await page.evaluate(()=>document.querySelector('[data-ytms-queue-menu-action="save"] yt-formatted-string').textContent='Save');await settle(page);
  assert.equal(await more(page).isVisible(),true);assert.equal(await page.locator('#save-source').isVisible(),false);
});
test('trigger updates colour when YouTube theme changes',async t=>{
  const page=await open(t);await page.evaluate(()=>{document.querySelector('h3').style.color='rgb(241, 241, 241)';dispatchEvent(new Event('yt-page-data-updated'));});await settle(page);
  await page.evaluate(()=>{document.querySelector('h3').style.color='rgb(15, 15, 15)';document.documentElement.removeAttribute('dark');});await settle(page);
  assert.equal(await more(page).evaluate(node=>getComputedStyle(node).color),'rgb(15, 15, 15)');
});
for(const compiled of [false,true])test(`compact native header keeps count breathing room and title-coloured dots without cumulative growth (${compiled?'Suite':'source'})`,async t=>{
  const page=await open(t,{mode:'compact-header',compiled});
  const read=()=>page.evaluate(()=>{
    const header=document.querySelector('.header'),count=header.querySelector(':scope > div:not([class])'),button=document.querySelector('.ytms-queue-more');
    const range=document.createRange();range.selectNodeContents(count);
    return {gap:header.getBoundingClientRect().bottom-range.getBoundingClientRect().bottom,height:header.getBoundingClientRect().height,colour:getComputedStyle(button).color,fill:getComputedStyle(button.querySelector('path')).fill};
  });
  const first=await read();assert.ok(first.gap>=15.5,JSON.stringify(first));assert.equal(first.colour,'rgb(241, 241, 241)');assert.equal(first.fill,first.colour);
  for(let i=0;i<4;i++){await page.evaluate(()=>{dispatchEvent(new Event('resize'));dispatchEvent(new Event('yt-page-data-updated'));});await settle(page);}
  assert.deepEqual(await read(),first);
  await page.evaluate(()=>{document.querySelector('.header > div:not([class])').textContent='4 / 4';});await settle(page);
  assert.ok((await read()).gap>=15.5);
  if(!compiled){await page.evaluate(()=>disposeQueue());
    assert.deepEqual(await page.locator('.header').evaluate(node=>({padding:node.style.paddingBottom,minHeight:node.style.minHeight,height:node.style.height})),{padding:'2px',minHeight:'',height:'58px'});}
});
for(const compiled of [false,true])for(const mode of ['','flexible','fallback','popover-failure','navigation-clear'])test(`one dropdown, original commands and equal icons (${compiled?'Suite':'source'}, ${mode||'direct'})`,async t=>{
  const page=await open(t,{compiled,mode});assert.equal(await more(page).count(),1);assert.equal(await page.locator('#save-source').isVisible(),false);assert.equal(await page.locator('#clear-source').isVisible(),false);assert.equal(await page.locator('#video-menu').isVisible(),true);
  assert.equal(await page.locator('[data-ytms-queue-action-content]').count(),0,'No Save pill');
  await more(page).click();assert.equal(await action(page,'Save').isVisible(),true);assert.equal(await action(page,'Clear').isVisible(),true);
  assert.equal(await page.locator('[data-ytms-queue-menu-content] svg').count(),2);
  for(const row of await page.locator('[data-ytms-queue-menu-action]').all())assert.equal(await row.evaluate(node=>getComputedStyle(node.querySelector('svg')).width),'24px');
  assert.equal(await action(page,'Clear').evaluate(node=>node.data===f.item('clear')),true);
  await action(page,'Save').click();await settle(page);assert.equal(await more(page).getAttribute('aria-expanded'),'false');
  await more(page).click();await action(page,'Clear').press('Enter');
  assert.deepEqual(await page.evaluate(()=>f.calls.map(call=>call.action)),['save','clear']);assert.deepEqual(await page.evaluate(()=>f.appRequests),['save','clear']);assert.equal(await page.evaluate(()=>f.headerClicks),0);
});
for(const mode of ['unknown','mixed','conflict','no-service','ambiguous','unregistered','rejected'])test(`unsupported/ambiguous sources keep native controls without retries: ${mode}`,async t=>{
  const page=await open(t,{mode});assert.equal(await more(page).count(),0);assert.equal(await page.locator('#save-source').isVisible(),true);assert.equal(await page.locator('#clear-source').isVisible(),true);
  const count=await page.evaluate(()=>f.stamps);await settle(page);assert.equal(await page.evaluate(()=>f.stamps),count);
});
for(const list of ['PLsaved','',null])test(`saved/unknown lists are unchanged: ${list}`,async t=>{const page=await open(t,{list});assert.equal(await more(page).count(),0);});
test('disabled preference preserves both native overflow menus',async t=>{const page=await open(t,{enabled:false});assert.equal(await more(page).count(),0);assert.equal(await page.locator('#save-source').isVisible(),true);});
test('Arrow navigation, Escape and outside dismissal never execute commands',async t=>{
  const page=await open(t);await more(page).focus();await more(page).press('ArrowDown');assert.equal(await action(page,'Save').evaluate(node=>node===document.activeElement),true);
  await action(page,'Save').press('ArrowDown');assert.equal(await action(page,'Clear').evaluate(node=>node===document.activeElement),true);
  await action(page,'Clear').press('Escape');assert.equal(await more(page).evaluate(node=>node===document.activeElement),true);assert.equal(await more(page).getAttribute('aria-expanded'),'false');
  await more(page).click();await page.locator('#outside').click();assert.equal(await more(page).getAttribute('aria-expanded'),'false');assert.deepEqual(await page.evaluate(()=>f.calls),[]);
  await more(page).click();await action(page,'Save').press('Tab');assert.equal(await more(page).getAttribute('aria-expanded'),'false');
});
test('menu keys are captured before player shortcuts while outside keys are preserved',async t=>{
  const page=await open(t);await page.evaluate(()=>{f.playerKeys=[];f.playerReleases=[];document.addEventListener('keydown',event=>{if([' ','ArrowDown'].includes(event.key))f.playerKeys.push(event.key);},true);document.addEventListener('keyup',event=>{if([' ','ArrowDown'].includes(event.key))f.playerReleases.push(event.key);},true);});
  await more(page).focus();await more(page).press('ArrowDown');await action(page,'Save').press(' ');
  assert.deepEqual(await page.evaluate(()=>f.playerKeys),[]);assert.deepEqual(await page.evaluate(()=>f.calls.map(call=>call.action)),['save']);
  assert.deepEqual(await page.evaluate(()=>f.playerReleases),[]);
  await page.locator('#outside').press(' ');assert.deepEqual(await page.evaluate(()=>f.playerKeys),[' ']);
});
test('a page-data update during click-time proof cancels a now-closed menu action',async t=>{
  const page=await open(t);await more(page).click();await page.evaluate(()=>{const menu=document.getElementById('clear-source'),data=menu.data;let fired=false;Object.defineProperty(menu,'data',{get(){if(!fired){fired=true;dispatchEvent(new Event('yt-page-data-updated'));}return data;}});document.querySelector('[data-ytms-queue-menu-action="clear"] tp-yt-paper-item').click();});
  assert.deepEqual(await page.evaluate(()=>f.calls),[]);assert.equal(await more(page).getAttribute('aria-expanded'),'false');
});
test('stale Clear binding cannot execute from an already open popup',async t=>{
  const page=await open(t);await more(page).click();await page.evaluate(()=>{f.item('clear').serviceEndpoint.fixtureCommand.token='rebound';document.querySelector('[data-ytms-queue-menu-action="clear"] tp-yt-paper-item').click();});
  assert.deepEqual(await page.evaluate(()=>f.calls),[]);await settle(page);await more(page).click();await action(page,'Clear').click();assert.deepEqual(await page.evaluate(()=>f.calls),[{action:'clear',token:'rebound'}]);
});
test('pagehide inside a native binding read cancels the pending command',async t=>{
  const page=await open(t);await more(page).click();await page.evaluate(()=>{const menu=document.getElementById('clear-source'),data=menu.data;Object.defineProperty(menu,'data',{get(){dispatchEvent(new Event('pagehide'));return data;}});document.querySelector('[data-ytms-queue-menu-action="clear"] tp-yt-paper-item').click();});
  assert.deepEqual(await page.evaluate(()=>f.calls),[]);assert.equal(await more(page).count(),0);
});
test('Watch/miniplayer moves, page suspension and disposal restore native controls',async t=>{
  const page=await open(t);await more(page).click();await page.evaluate(()=>document.querySelector('ytd-watch-flexy').append(f.panel));await settle(page);assert.equal(await more(page).count(),1);
  await page.evaluate(()=>{dispatchEvent(new Event('pagehide'));dispatchEvent(new Event('yt-page-data-updated'));dispatchEvent(new Event('yt-navigate-finish'));});await settle(page);assert.equal(await more(page).count(),0);
  await page.evaluate(()=>dispatchEvent(new Event('pageshow')));await settle(page);assert.equal(await more(page).count(),1);
  await page.evaluate(()=>disposeQueue());assert.equal(await more(page).count(),0);assert.equal(await page.locator('#clear-source').isVisible(),true);assert.equal(await page.locator('#save-source').isVisible(),true);
});
test('late native registration and delayed rendering preserve the original controls',async t=>{
  const page=await open(t,{mode:'unregistered'});await page.evaluate(()=>defineNative());await settle(page);assert.equal(await more(page).count(),1);
});
test('a delayed native label never exposes a half-built replacement',async t=>{
  const page=await open(t,{mode:'delayed'});assert.equal(await more(page).isVisible(),false);assert.equal(await page.locator('#clear-source').isVisible(),true);
  await page.evaluate(()=>{for(const row of document.querySelectorAll('[data-ytms-queue-menu-action]'))row.textContent=row.data.text.simpleText;});await settle(page);assert.equal(await more(page).isVisible(),true);
});
test('responsive duplicate native renderers retain exactly one visible dropdown',async t=>{
  const page=await open(t,{mode:'responsive'});await settle(page);assert.equal(await more(page).count(),1);
  await page.evaluate(()=>{document.getElementById('overflow-menu').style.display='none';document.getElementById('overflow-menu-top-row').style.display='block';dispatchEvent(new Event('resize'));});await settle(page);
  assert.equal(await more(page).isVisible(),true);assert.equal(await more(page).evaluate(node=>node.closest('#overflow-menu-top-row')!==null),true);
});
test('native header restamping repairs its removed replacement',async t=>{
  const page=await open(t);await page.evaluate(()=>document.querySelector('[data-ytms-queue-menu-wrap]').remove());await settle(page);
  assert.equal(await more(page).count(),1);assert.equal(await more(page).isVisible(),true);
});
test('reparenting the original overflow moves the combined trigger into its new slot',async t=>{
  const page=await open(t);await page.evaluate(()=>{const slot=document.getElementById('overflow-menu-top-row');slot.style.display='block';slot.append(document.getElementById('clear-source'));});await settle(page);
  assert.equal(await more(page).count(),1);assert.equal(await more(page).evaluate(node=>node.closest('#overflow-menu-top-row')!==null),true);
});
test('an opacity-hidden retained queue cannot execute an open Clear action',async t=>{
  const page=await open(t);await more(page).click();await page.evaluate(()=>{f.panel.style.opacity='0';document.querySelector('[data-ytms-queue-menu-action="clear"] tp-yt-paper-item').click();});
  assert.deepEqual(await page.evaluate(()=>f.calls),[]);assert.equal(await more(page).getAttribute('aria-expanded'),'false');
});
test('queue content churn does not scan the header',async t=>{
  const page=await open(t);const scans=await page.evaluate(async()=>{const query=document.querySelectorAll;let n=0;document.querySelectorAll=function(...args){n++;return query.apply(this,args)};for(let i=0;i<10;i++){document.querySelector('ytd-playlist-panel-video-renderer').append(document.createTextNode('row'));await new Promise(requestAnimationFrame)}document.querySelectorAll=query;return n;});assert.equal(scans,0);
});
test('closing the combined popup does not steal focus from the native Save dialog',async t=>{
  const page=await open(t,{mode:'save-dialog',compiled:true});await more(page).click();await action(page,'Save').click();await settle(page);
  const input=page.getByRole('textbox',{name:'Native playlist name'});assert.equal(await input.isVisible(),true);assert.equal(await input.evaluate(node=>node===document.activeElement),true);
});
test('the shifted X keeps its native click handler and never invokes Clear',async t=>{
  const page=await open(t);await page.evaluate(()=>{f.closes=0;document.querySelector('#close-button button').addEventListener('click',()=>f.closes++);});
  await more(page).click();await page.getByRole('button',{name:'Close queue',exact:true}).click();assert.equal(await page.evaluate(()=>f.closes),1);assert.deepEqual(await page.evaluate(()=>f.calls),[]);
});
for(const theme of ['dark','light'])test(`theme, icon order, popup bounds and close hit target (${theme})`,async t=>{
  const page=await open(t,{theme,viewport:{width:400,height:350}});const close=await page.locator('#close-button').boundingBox(),before=await page.evaluate(()=>f.closeBefore);
  assert.equal(close.height,before.height);assert.equal(close.width,before.width);assert.equal(close.y,before.y-4);
  if(theme==='dark')await page.evaluate(()=>{f.panel.style.cssText='position:fixed;bottom:0;right:0;width:360px';});
  await more(page).click();const box=await page.getByRole('menu',{name:'Queue actions',exact:true}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=400&&box.y>=0&&box.y+box.height<=350);
  const paint=await action(page,'Clear').evaluate(node=>{const svg=node.querySelector('svg'),label=node.querySelector('[data-ytms-queue-menu-content] span');return{icon:svg.getBoundingClientRect().right,text:label.getBoundingClientRect().left,fill:getComputedStyle(svg).fill,font:getComputedStyle(label).fontFamily};});
  assert.ok(paint.icon<paint.text);assert.equal(paint.fill,theme==='dark'?'rgb(241, 241, 241)':'rgb(15, 15, 15)');assert.match(paint.font,/Arial/);
});
for(const compiled of [false,true])for(const theme of ['dark','light'])test(`menu remains readable without native theme variables (${compiled?'Suite':'source'}, ${theme})`,async t=>{
  const page=await open(t,{compiled,theme,mode:'missing-theme'});
  await page.emulateMedia({colorScheme:theme==='dark'?'light':'dark'});
  await more(page).click();
  const paint=()=>page.getByRole('menu',{name:'Queue actions',exact:true}).evaluate(node=>({
    background:getComputedStyle(node).backgroundColor,
    rows:[...node.querySelectorAll('[data-ytms-queue-menu-action]')].map(row=>{
      const holder=row.querySelector('tp-yt-paper-item'),label=row.querySelector('[data-ytms-queue-menu-content] span'),path=row.querySelector('svg path');
      return {text:getComputedStyle(label).color,icon:getComputedStyle(path).fill,border:getComputedStyle(holder).borderTopWidth,shadow:getComputedStyle(holder).boxShadow};
    })
  }));
  const check=(value,dark)=>{assert.equal(value.background,dark?'rgb(40, 40, 40)':'rgb(255, 255, 255)');for(const row of value.rows){assert.equal(row.text,dark?'rgb(241, 241, 241)':'rgb(15, 15, 15)');assert.equal(row.icon,row.text);assert.equal(row.border,'0px');assert.equal(row.shadow,'none');}};
  check(await paint(),theme==='dark');
  await action(page,'Clear').hover();check(await paint(),theme==='dark');
  await page.evaluate(()=>document.documentElement.toggleAttribute('dark'));
  check(await paint(),theme!=='dark');
  await action(page,'Save').click();assert.deepEqual(await page.evaluate(()=>f.calls.map(value=>value.action)),['save']);
});
