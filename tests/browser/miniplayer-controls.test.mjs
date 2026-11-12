// Language: en-GB. Synthetic queue and native hover layout, isolated browser only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installMiniplayerControls } from '../../sources/miniplayer-controls.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
let browser;before(async()=>{browser=await launchFixtureBrowser();});after(()=>browser?.close());
async function open(t,{compiled=false,enabled=true,native=false,values={}}={}) {
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage(),errors=[];
 page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB"><style>
 ytd-app,ytd-miniplayer{display:block}#movie_player{position:relative;width:400px;height:225px}
 .ytp-miniplayer-ui{position:absolute;inset:0}.ytp-miniplayer-controls{display:flex;align-items:center;justify-content:space-between;width:264px;margin:80px auto}
 .ytp-button{border:0;padding:0;background:transparent}.ytp-play-button{width:42px;height:42px}
 .ytp-play-button::after{content:"";position:absolute;inset:4px;border-radius:27px;background:rgba(255,255,255,.1);pointer-events:none}
 /* Native tooltip style contract: the painted backing is a child of the
    width-bearing wrapper, and the shortcut is a separate element. */
 #movie_player{font:12px Arial,sans-serif;color:white;background:#333}
 .ytp-tooltip{position:absolute;z-index:1003;font-size:118%;font-weight:500;line-height:15px;pointer-events:none}
 .ytp-tooltip-text-wrapper{border-radius:3px}
 .ytp-tooltip-bottom-text{display:block;background-color:rgba(28,28,28,.9);padding:5px 9px;border-radius:4px}
 .ytp-tooltip-keyboard-shortcut{display:none}
 .ytp-delhi-modern .ytp-tooltip-bottom-text{display:flex;align-items:center;border-radius:8px;background:rgba(0,0,0,.3);backdrop-filter:blur(16px);text-shadow:0 0 2px #000}
 .ytp-delhi-modern .ytp-tooltip-keyboard-shortcut{display:flex;align-items:center;justify-content:center;border:1px solid #ffffff4d;min-width:11px;border-radius:4px;margin-left:4px;color:white;padding:0 2px}
 .ytp-delhi-modern .ytp-tooltip-text-wrapper.ytp-frosted-glass-fade-transition{border-radius:8px;background:rgba(0,0,0,.3);backdrop-filter:blur(16px)}
 .ytp-delhi-modern .ytp-tooltip-text-wrapper.ytp-frosted-glass-fade-transition .ytp-tooltip-bottom-text{background:transparent;backdrop-filter:none}
 </style><body><ytd-app><ytd-miniplayer><div id="movie_player"><video></video><div class="ytp-miniplayer-ui"><div class="ytp-miniplayer-controls">
 ${native?'<button class="ytp-prev-button" aria-label="Native previous">Previous</button>':''}
 <div class="ytp-miniplayer-play-button-container"><button class="ytp-play-button ytp-button" aria-label="Play">Play</button></div>
 ${native?'<button class="ytp-next-button" aria-label="Native next">Next</button>':''}
 </div></div></div></ytd-miniplayer></ytd-app></body></html>`}));
 await page.goto('https://www.youtube.com/');
 await page.evaluate(()=>{
  const p=document.getElementById('movie_player');window.mini={p,index:1,ids:['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc'],calls:[],nativeClicks:0};
  p.getPlaylist=()=>mini.ids;p.getPlaylistIndex=()=>mini.index;p.getVideoData=()=>({video_id:mini.ids[mini.index]});
  p.previousVideo=()=>{mini.calls.push('previous');mini.index--;dispatchEvent(new Event('yt-playlist-data-updated'));};
  p.nextVideo=()=>{mini.calls.push('next');mini.index++;dispatchEvent(new Event('yt-playlist-data-updated'));};
  document.querySelector('.ytp-next-button')?.addEventListener('click',()=>mini.nativeClicks++);
 });
 assert.equal(await page.locator('.ytp-play-button').evaluate(n=>getComputedStyle(n,'::after').width),'392px','fixture reproduces unanchored hover background');
 if(compiled){
  await page.evaluate(({enabled,values})=>localStorage.setItem('yt-master-suite.settings.v1',JSON.stringify({version:1,values:{...values,miniplayerNavigation:enabled}})),{enabled,values});
  await page.addScriptTag({content:suite});await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true});
 }else await page.evaluate(({factory,enabled})=>{window.disposeMini=(0,eval)(`(${factory})`)({document,window,preferences:{miniplayerNavigation:enabled}});},{factory:installMiniplayerControls.toString(),enabled});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame)});
 return page;
}
for(const compiled of [false,true])test(`hover is locally anchored and queue navigation is native (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 assert.equal(await page.locator('.ytp-play-button').evaluate(n=>getComputedStyle(n,'::after').width),'34px');
 const prev=page.locator('[data-ytms-mini-nav-button="previous"]'),next=page.locator('[data-ytms-mini-nav-button="next"]');
 await page.mouse.move(600,500);assert.equal(await next.evaluate(n=>getComputedStyle(n).opacity),'0');
 await page.locator('ytd-miniplayer').hover();assert.equal(await next.evaluate(n=>getComputedStyle(n).opacity),'1');
 await next.dispatchEvent('click');assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
 await next.click();assert.deepEqual(await page.evaluate(()=>mini.calls),['next']);await page.waitForFunction(()=>document.querySelector('[data-ytms-mini-nav-button="next"]').disabled);
 await prev.focus();assert.equal(await prev.evaluate(n=>getComputedStyle(n).opacity),'1');
 await prev.press('Enter');assert.deepEqual(await page.evaluate(()=>mini.calls),['next','previous']);
 await page.evaluate(()=>{mini.p.getPlaylistIndex=()=>0;dispatchEvent(new Event('yt-playlist-data-updated'));});
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-ytms-mini-nav-button]')].every(b=>b.disabled));
 await page.evaluate(()=>mini.p.classList.add('ad-showing'));await next.waitFor({state:'detached'});
});

for(const enabled of [false,true])for(const hideNextButton of [false,true])test(`miniplayer navigation and hiding the watch Next button remain independent (${enabled}, ${hideNextButton})`,async t=>{
 const page=await open(t,{compiled:true,enabled,values:{hideNextButton}});
 await page.evaluate(()=>{
  const watch=document.createElement('ytd-watch-flexy');
  watch.innerHTML='<div id="movie_player"><button class="ytp-next-button" id="fixture-watch-next">Native next</button></div>';
  document.querySelector('ytd-app').append(watch);
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('#fixture-watch-next').isVisible(),!hideNextButton);
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),enabled?2:0);
 if(enabled){
  await page.locator('ytd-miniplayer').hover();
  await page.locator('[data-ytms-mini-nav-button="next"]').click();
  assert.deepEqual(await page.evaluate(()=>mini.calls),['next']);
 }else assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
for(const compiled of [false,true])test(`duplicate queue videos use the verified native index (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 await page.evaluate(()=>{mini.ids=['aaaaaaaaaaa','bbbbbbbbbbb','aaaaaaaaaaa','ccccccccccc'];mini.index=2;dispatchEvent(new Event('yt-playlist-data-updated'));});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 const next=page.locator('[data-ytms-mini-nav-button="next"]'),prev=page.locator('[data-ytms-mini-nav-button="previous"]');
 assert.equal(await next.isEnabled(),true,'the exact native index disambiguates duplicate current IDs');
 assert.equal(await prev.isEnabled(),true);
 await next.click();assert.deepEqual(await page.evaluate(()=>mini.calls),['next']);
 assert.equal(await page.evaluate(()=>mini.index),3);
 await page.waitForFunction(()=>document.querySelector('[data-ytms-mini-nav-button="next"]').disabled);
 await page.evaluate(()=>{mini.p.getPlaylistIndex=()=>1;dispatchEvent(new Event('yt-playlist-data-updated'));});
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-ytms-mini-nav-button]')].every(b=>b.disabled));
 for(const invalid of ['negative','out-of-range','fraction','string','nan','undefined']){
  await page.evaluate(kind=>{mini.p.getPlaylistIndex=()=>({negative:-1,'out-of-range':mini.ids.length,fraction:1.5,string:'2',nan:NaN,undefined:undefined})[kind];dispatchEvent(new Event('yt-playlist-data-updated'));},invalid);
  await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
  assert.equal(await next.isEnabled(),false,invalid);assert.equal(await prev.isEnabled(),false,invalid);
 }
 assert.deepEqual(await page.evaluate(()=>mini.calls),['next'],'invalid indices never invoke native navigation');
});
test('native handlers remain native and late native controls replace fallbacks',async t=>{
 const page=await open(t,{native:true});assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
 await page.locator('.ytp-next-button').click();assert.equal(await page.evaluate(()=>mini.nativeClicks),1);
 await page.locator('.ytp-next-button').evaluate(n=>n.style.display='none');await page.locator('[data-ytms-mini-nav-button="next"]').waitFor();
 await page.locator('.ytp-next-button').evaluate(n=>n.style.display='');await page.locator('[data-ytms-mini-nav-button="next"]').waitFor({state:'detached'});
 await page.locator('.ytp-next-button').evaluate(n=>n.remove());await page.locator('[data-ytms-mini-nav-button="next"]').waitFor();
 await page.evaluate(()=>{const b=document.createElement('button');b.className='ytp-next-button';document.querySelector('.ytp-miniplayer-controls').append(b);});
 await page.locator('[data-ytms-mini-nav-button="next"]').waitFor({state:'detached'});
});
for(const compiled of [false,true])test(`a retained hidden native arrow cannot duplicate its visible replacement (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{native:true,compiled});
 await page.evaluate(()=>{
  mini.replacementClicks=0;
  for(const direction of ['prev','next']){
   const original=document.querySelector(`.ytp-${direction}-button`),replacement=original.cloneNode(true);
   original.hidden=true;replacement.setAttribute('data-native-replacement',direction);original.after(replacement);
   replacement.addEventListener('click',()=>mini.replacementClicks++);
  }
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0,'visible native replacements suppress fallback buttons despite retained hidden siblings');
 const nativeNext=page.locator('[data-native-replacement="next"]');
 await nativeNext.click();assert.equal(await page.evaluate(()=>mini.replacementClicks),1);
 assert.deepEqual(await page.evaluate(()=>mini.calls),[],'native replacement retains its own handler');
 await nativeNext.evaluate(n=>n.hidden=true);
 const fallback=page.locator('[data-ytms-mini-nav-button="next"]');await fallback.waitFor();await fallback.focus();
 await nativeNext.evaluate(n=>n.hidden=false);await fallback.waitFor({state:'detached'});
 assert.equal(await nativeNext.evaluate(n=>document.activeElement===n),true,'keyboard focus hands back to the visible replacement');
 assert.equal(await page.evaluate(()=>mini.replacementClicks),1,'handoff never activates a native button');
});
for(const compiled of [false,true])test(`invisible native navigation does not suppress visible fallback buttons (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{native:true,compiled});
 await page.locator('.ytp-next-button').evaluate(n=>n.style.opacity='0');
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button="next"]').count(),1);
 await page.locator('.ytp-next-button').evaluate(n=>{n.style.opacity='';n.style.visibility='hidden';});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button="next"]').count(),1);
 await page.locator('.ytp-next-button').evaluate(n=>n.style.visibility='visible');
 await page.locator('[data-ytms-mini-nav-button="next"]').waitFor({state:'detached'});
 await page.locator('.ytp-next-button').evaluate(n=>{const wrapper=document.createElement('div');wrapper.className='ytp-miniplayer-button-container';n.before(wrapper);wrapper.append(n);wrapper.style.opacity='0';});
 await page.locator('[data-ytms-mini-nav-button="next"]').waitFor();
 await page.locator('.ytp-next-button').evaluate(n=>n.parentElement.style.opacity='1');
 await page.locator('[data-ytms-mini-nav-button="next"]').waitFor({state:'detached'});
});
for(const compiled of [false,true])test(`disabled preference keeps hover correction without fallback controls (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled,enabled:false,native:true});assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
 assert.equal(await page.locator('.ytp-next-button').isVisible(),false);
 assert.equal(await page.locator('.ytp-play-button').evaluate(n=>getComputedStyle(n,'::after').width),'34px');
});
for(const compiled of [false,true])test(`inert-only miniplayer activation restores its controls (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});await page.mouse.move(600,500);
 await page.evaluate(()=>{document.querySelector('ytd-miniplayer').inert=true;dispatchEvent(new Event('yt-playlist-data-updated'));});
 await page.locator('[data-ytms-mini-nav-button]').first().waitFor({state:'detached'});
 await page.evaluate(()=>{document.querySelector('ytd-miniplayer').inert=false;});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),2,'removing only inert must wake a retained miniplayer without native events or pointer movement');
 await page.evaluate(()=>document.querySelector('ytd-miniplayer').inert=true);
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0,'inert activation removes owned controls promptly');
 assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
for(const compiled of [false,true])test(`BFCache return restores navigation buttons after interrupted SPA navigation (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 await page.locator('[data-ytms-mini-nav-button="next"]').waitFor();
 await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-start')));
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
 await page.evaluate(async()=>{window.dispatchEvent(new Event('pageshow'));for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0,'unrelated pageshow must not unlock SPA navigation');
 await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));});
 await page.locator('[data-ytms-mini-nav-button="next"]').waitFor();
 assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
test('lifecycle cleanup does not revive during navigation and disposal restores native style',async t=>{
 const page=await open(t);await page.evaluate(()=>dispatchEvent(new Event('yt-navigate-start')));
 await page.locator('[data-ytms-mini-nav-button]').first().waitFor({state:'detached'});
 await page.evaluate(()=>{dispatchEvent(new Event('yt-playlist-data-updated'));dispatchEvent(new Event('visibilitychange'));});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
 await page.evaluate(()=>dispatchEvent(new Event('yt-navigate-finish')));await page.locator('[data-ytms-mini-nav-button]').first().waitFor();
 await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide'));dispatchEvent(new Event('yt-playlist-data-updated'));});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));await page.locator('[data-ytms-mini-nav-button]').first().waitFor();
 await page.evaluate(()=>disposeMini());assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
 assert.equal(await page.locator('.ytp-play-button').evaluate(n=>getComputedStyle(n,'::after').width),'392px');
});
test('unrelated comment and hover churn performs no miniplayer rediscovery',async t=>{
 const page=await open(t);
 await page.mouse.move(600,500);
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 await page.evaluate(()=>{
  window.miniQueries=0;const original=document.querySelectorAll.bind(document);
  document.querySelectorAll=selector=>{if(selector==='ytd-miniplayer #movie_player')miniQueries++;return original(selector);};
  const comments=document.createElement('ytd-comments');document.body.append(comments);
  for(let i=0;i<100;i++){const n=document.createElement('div');n.textContent='Synthetic comment';comments.append(n);n.dispatchEvent(new MouseEvent('mouseenter',{bubbles:false}));}
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.evaluate(()=>miniQueries),0);
});
for(const compiled of [false,true])test(`Escape dismisses the owned tooltip without consuming keyboard focus (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});const button=page.locator('[data-ytms-mini-nav-button="next"]');
 await button.focus();assert.equal(await page.locator('#ytms-mini-navigation-tooltip').count(),1);
 await page.evaluate(()=>{window.escapeReachedNative=false;window.addEventListener('keydown',event=>{if(event.key==='Escape')escapeReachedNative=!event.defaultPrevented;},{once:true});});
 await button.press('Escape');
 assert.equal(await page.locator('#ytms-mini-navigation-tooltip').count(),0);
 assert.equal(await button.evaluate(n=>document.activeElement===n),true);
 assert.equal(await page.evaluate(()=>escapeReachedNative),true);assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
for(const compiled of [false,true])test(`owned arrows follow a reordered native play wrapper (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 await page.locator('[data-ytms-mini-nav-button="next"]').focus();
 await page.evaluate(()=>{
  window.originalMiniPrev=document.querySelector('[data-ytms-mini-nav-button="previous"]');
  const controls=document.querySelector('.ytp-miniplayer-controls');
  controls.append(document.querySelector('.ytp-miniplayer-play-button-container'));
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.deepEqual(await page.locator('.ytp-miniplayer-controls').evaluate(n=>[...n.children].map(c=>c.getAttribute('data-ytms-mini-nav-button') || 'play')),['previous','play','next']);
 assert.equal(await page.evaluate(()=>originalMiniPrev===document.querySelector('[data-ytms-mini-nav-button="previous"]')),true);
 assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('[data-ytms-mini-nav-button="next"]')),true);
 assert.equal(await page.locator('#ytms-mini-navigation-tooltip .ytp-tooltip-text').textContent(),'Next video');
});
for(const compiled of [false,true])for(const disabled of [false,true])test(`native arrow handoff preserves keyboard focus (${compiled?'Suite':'source'}, disabled ${disabled})`,async t=>{
 const page=await open(t,{compiled});await page.locator('[data-ytms-mini-nav-button="next"]').focus();
 await page.evaluate(disabled=>{const native=document.createElement('button');native.className='ytp-next-button';native.textContent='Native next';native.disabled=disabled;document.querySelector('.ytp-miniplayer-controls').append(native);},disabled);
 await page.locator('[data-ytms-mini-nav-button="next"]').waitFor({state:'detached'});
 assert.equal(await page.locator(disabled?'.ytp-play-button':'.ytp-next-button').evaluate(n=>document.activeElement===n),true);
 assert.equal(await page.locator('#ytms-mini-navigation-tooltip').count(),0);
});
for(const compiled of [false,true])for(const theme of ['legacy','modern','frosted'])test(`collapsed native play tooltip contains the painted label and key (${compiled?'Suite':'source'}, ${theme})`,async t=>{
 const page=await open(t,{compiled});
 await page.evaluate(theme=>{
  const player=mini.p;
  if(theme!=='legacy')player.classList.add('ytp-delhi-modern');
  const tip=document.createElement('div');tip.className='ytp-tooltip ytp-bottom';tip.id='collapsed-tip';
  tip.style.cssText='position:absolute;width:0px;left:179px;top:77px;height:27px;z-index:1003;pointer-events:none';
  tip.innerHTML='<div class="ytp-tooltip-text-wrapper" style="width:0px;height:27px"><div class="ytp-tooltip-bottom-text" style="width:0px;height:27px;box-sizing:border-box;white-space:nowrap"><span class="ytp-tooltip-text">Pause</span><div class="ytp-tooltip-keyboard-shortcut">K</div></div></div>';
  if(theme==='frosted')tip.firstElementChild.classList.add('ytp-frosted-glass-fade-transition');
  const preview=tip.cloneNode(true);preview.id='untouched-seek';preview.classList.add('ytp-preview');preview.style.left='12px';
  player.append(tip,preview);
  const watch=document.createElement('div');watch.id='other-player';watch.innerHTML=tip.outerHTML.replace('collapsed-tip','watch-tip');document.body.append(watch);
 },theme);
 await page.mouse.move(600,500);
 assert.equal(await page.locator('#collapsed-tip').evaluate(n=>n.getBoundingClientRect().width),0,'native zero-width failure is present without central hover');
 await page.locator('.ytp-play-button').hover();
 const play=await page.locator('.ytp-play-button').boundingBox(),tip=await page.locator('#collapsed-tip').boundingBox();
 assert.ok(tip.width>=55,'tooltip contains its label and padding');
 assert.ok(tip.y+tip.height<=play.y-3,'tooltip stays above the button');
 assert.ok(Math.abs(tip.x+tip.width/2-(play.x+play.width/2))<2,'tooltip is centred');
 const geometry=await page.locator('#collapsed-tip').evaluate(n=>{
  const wrapper=n.querySelector('.ytp-tooltip-text-wrapper'),backing=n.querySelector('.ytp-tooltip-bottom-text');
  const bounds=element=>{const b=element.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
  const painted=wrapper.classList.contains('ytp-frosted-glass-fade-transition')?wrapper:backing;
  return {paint:bounds(painted),label:bounds(n.querySelector('.ytp-tooltip-text')),key:bounds(n.querySelector('.ytp-tooltip-keyboard-shortcut')),background:getComputedStyle(painted).backgroundColor,radius:getComputedStyle(painted).borderRadius};
 });
 for(const content of [geometry.label,...(theme==='legacy'?[]:[geometry.key])]){
  assert.ok(content.left>=geometry.paint.left+8 && content.right<=geometry.paint.right-8,'painted background contains the complete label and shortcut with horizontal padding');
  assert.ok(content.top>=geometry.paint.top+4 && content.bottom<=geometry.paint.bottom-4,'painted background contains text vertically');
 }
 assert.equal(geometry.background,theme==='legacy'?'rgba(28, 28, 28, 0.9)':'rgba(0, 0, 0, 0.3)','native theme opacity is preserved');
 assert.equal(geometry.radius,theme==='legacy'?'4px':'8px');
 assert.equal(await page.locator('#untouched-seek').evaluate(n=>n.getBoundingClientRect().width),0,'seek preview keeps native sizing');
 assert.equal(await page.locator('#watch-tip').evaluate(n=>n.getBoundingClientRect().width),0,'other player untouched');
 await page.mouse.move(600,500);
 assert.equal(await page.locator('#collapsed-tip').evaluate(n=>n.getBoundingClientRect().width),0,'native style resumes on leave');
});
for(const compiled of [false,true])for(const modern of [false,true])test(`navigation tooltips inherit the native theme and show YouTube shortcuts (${compiled?'Suite':'source'}, modern ${modern})`,async t=>{
 const page=await open(t,{compiled});
 await page.evaluate(modern=>{
  mini.p.classList.toggle('ytp-delhi-modern',modern);
  const ref=document.createElement('div');ref.id='native-reference';ref.className='ytp-tooltip';ref.style.visibility='hidden';
  ref.innerHTML='<div class="ytp-tooltip-text-wrapper"><div class="ytp-tooltip-bottom-text"><span class="ytp-tooltip-text">Play</span><div class="ytp-tooltip-keyboard-shortcut">K</div></div></div>';
  mini.p.append(ref);
 },modern);
 const readStyle=n=>{
  const root=getComputedStyle(n),backing=getComputedStyle(n.querySelector('.ytp-tooltip-bottom-text'));
  return {font:root.fontFamily,size:root.fontSize,weight:root.fontWeight,line:root.lineHeight,background:backing.backgroundColor,radius:backing.borderRadius,padding:backing.padding,blur:backing.backdropFilter,shadow:backing.textShadow};
 };
 const nativeStyle=await page.locator('#native-reference').evaluate(readStyle);
 for(const [direction,label,shortcut]of [['previous','Previous video','Shift+P'],['next','Next video','Shift+N']]){
  const button=page.locator(`[data-ytms-mini-nav-button="${direction}"]`);await button.hover();
  const tip=page.locator('#ytms-mini-navigation-tooltip');
  assert.equal(await tip.locator('.ytp-tooltip-text').textContent(),label);
  assert.equal(await tip.locator('.ytp-tooltip-keyboard-shortcut').textContent(),shortcut);
  assert.equal(await button.getAttribute('aria-keyshortcuts'),shortcut);
  assert.equal(await button.getAttribute('title'),null,'browser title tooltip is not layered over the owned native-styled tooltip');
  assert.deepEqual(await tip.evaluate(readStyle),nativeStyle,'label typography and painted backing come from the same native CSS');
  assert.equal(await tip.evaluate(n=>getComputedStyle(n).borderWidth),'0px');
  assert.equal(await tip.evaluate(n=>getComputedStyle(n).outlineWidth),'0px');
  const paint=await tip.locator('.ytp-tooltip-bottom-text').boundingBox(),key=await tip.locator('.ytp-tooltip-keyboard-shortcut').boundingBox();
  assert.ok(key.width>10 && key.x+key.width<=paint.x+paint.width-8,'shortcut is visible inside the rounded backing');
 }
 await page.evaluate(()=>{window.shortcutEvents=[];document.addEventListener('keydown',e=>{if(e.shiftKey)shortcutEvents.push({key:e.key,prevented:e.defaultPrevented});});});
 await page.keyboard.press('Shift+P');await page.keyboard.press('Shift+N');
 assert.deepEqual(await page.evaluate(()=>mini.calls),[],'displaying existing shortcuts does not add a second navigation handler');
 assert.ok((await page.evaluate(()=>shortcutEvents)).every(event=>!event.prevented),'native shortcut events are not consumed');
});
for(const compiled of [false,true])test(`navigation tooltips follow hover and keyboard focus (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 const next=page.locator('[data-ytms-mini-nav-button="next"]');
 await next.hover();const tip=page.locator('#ytms-mini-navigation-tooltip');
 assert.equal(await tip.locator('.ytp-tooltip-text').textContent(),'Next video');assert.equal(await next.getAttribute('aria-describedby'),'ytms-mini-navigation-tooltip');
 const b=await next.boundingBox(),box=await tip.boundingBox();assert.ok(box.y+box.height<=b.y-3);
 await page.mouse.move(600,500);await tip.waitFor({state:'detached'});
 const prev=page.locator('[data-ytms-mini-nav-button="previous"]');await prev.focus();
 assert.equal(await tip.locator('.ytp-tooltip-text').textContent(),'Previous video');
 await page.evaluate(()=>dispatchEvent(new Event('yt-navigate-start')));await tip.waitFor({state:'detached'});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
});
for(const compiled of [false,true])test(`focused arrow tooltip resumes after another arrow hover leaves (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 const prev=page.locator('[data-ytms-mini-nav-button="previous"]'),next=page.locator('[data-ytms-mini-nav-button="next"]');
 await page.mouse.move(600,500);await prev.focus();
 assert.equal(await page.locator('#ytms-mini-navigation-tooltip .ytp-tooltip-text').textContent(),'Previous video');
 await next.hover();assert.equal(await page.locator('#ytms-mini-navigation-tooltip .ytp-tooltip-text').textContent(),'Next video');
 await page.mouse.move(600,500);
 assert.equal(await prev.evaluate(n=>document.activeElement===n),true);
 assert.equal(await page.locator('#ytms-mini-navigation-tooltip .ytp-tooltip-text').textContent(),'Previous video');
 assert.equal(await prev.getAttribute('aria-describedby'),'ytms-mini-navigation-tooltip');
 await next.hover();await page.locator('.ytp-play-button').focus();
 assert.equal(await page.locator('#ytms-mini-navigation-tooltip .ytp-tooltip-text').textContent(),'Next video','blurring Previous preserves the pointer-owned Next tooltip');
 await prev.focus();await next.hover();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#ytms-mini-navigation-tooltip').count(),0);
 await page.evaluate(()=>dispatchEvent(new Event('yt-playlist-data-updated')));
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 await page.mouse.move(600,500);
 assert.equal(await page.locator('#ytms-mini-navigation-tooltip').count(),0,'pointer leave and queue sync do not revive an Escape-dismissed tooltip');
 await next.hover();assert.equal(await page.locator('#ytms-mini-navigation-tooltip .ytp-tooltip-text').textContent(),'Next video','a fresh pointer entry can show the tooltip again');
});
for(const compiled of [false,true])for(const hoveredControl of ['ytp-miniplayer-close-button','ytp-miniplayer-expand-watch-page-button','ytp-next-button'])test(`focused Play yields tooltip positioning to ${hoveredControl} (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 await page.evaluate(hoveredControl=>{
  const close=document.createElement('button');close.className=hoveredControl;close.textContent='Close';close.style.cssText='position:absolute;right:0;top:0;width:40px;height:40px';mini.p.append(close);
  const tip=document.createElement('div');tip.id='native-close-tip';tip.className='ytp-tooltip ytp-bottom';tip.style.cssText='position:absolute;left:300px;top:42px;width:80px;height:27px;pointer-events:none';tip.textContent='Close';mini.p.append(tip);
 },hoveredControl);
 await page.keyboard.press('Tab');await page.locator('.ytp-play-button').focus();
 assert.equal(await page.locator('.ytp-play-button').evaluate(n=>n.matches(':focus-visible')),true);
 await page.locator('.'+hoveredControl).hover();
 assert.equal(await page.locator('.ytp-play-button').evaluate(n=>n.matches(':focus-visible')),true,'keyboard focus remains on Play');
 assert.equal(await page.locator('#native-close-tip').evaluate(n=>getComputedStyle(n).left),'300px','native tooltip follows the hovered Close control');
 await page.mouse.move(600,500);
 assert.equal(await page.locator('#native-close-tip').evaluate(n=>getComputedStyle(n).left),'200px','Play keyboard focus retains its own positioning when no other control is hovered');
});
for(const compiled of [false,true])test(`visible replacement controls receive arrows instead of retained hidden controls (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 await page.evaluate(()=>{
  const retained=mini.p.querySelector('.ytp-miniplayer-controls'),active=retained.cloneNode(true);
  active.querySelectorAll('[data-ytms-mini-nav-button]').forEach(button=>button.remove());
  active.setAttribute('data-active-native-controls','');retained.hidden=true;retained.style.display='none';
  retained.after(active);
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 const active=page.locator('[data-active-native-controls]');
 assert.equal(await active.locator('[data-ytms-mini-nav-button]').count(),2,'the visible replacement owns both navigation buttons');
 assert.equal(await page.locator('.ytp-miniplayer-controls[hidden] [data-ytms-mini-nav-button]').count(),0,'the retained controls own no fallback buttons');
 await active.locator('[data-ytms-mini-nav-button="next"]').click();
 assert.deepEqual(await page.evaluate(()=>mini.calls),['next']);
 await page.evaluate(()=>{
  document.querySelector('[data-active-native-controls]').remove();
  const retained=mini.p.querySelector('.ytp-miniplayer-controls');retained.hidden=false;retained.style.display='';
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),2,'restoring the retained controls does not duplicate fallback arrows');
 await page.locator('[data-ytms-mini-nav-button="previous"]').click();
 assert.deepEqual(await page.evaluate(()=>mini.calls),['next','previous']);
 await page.evaluate(()=>{mini.p.querySelector('.ytp-miniplayer-controls').style.display='contents';dispatchEvent(new Event('yt-playlist-data-updated'));});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('.ytp-miniplayer-controls').evaluate(row=>row.getClientRects().length),0);
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),2,'a boxless row with a visible Play button remains supported');
 await page.evaluate(()=>{
  const active=mini.p.querySelector('.ytp-miniplayer-controls'),ambiguous=active.cloneNode(true);
  ambiguous.querySelectorAll('[data-ytms-mini-nav-button]').forEach(button=>button.remove());
  ambiguous.setAttribute('data-ambiguous-native-controls','');active.after(ambiguous);
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0,'two visible native Play controls do not receive guessed fallback bindings');
 await page.locator('[data-ambiguous-native-controls]').evaluate(row=>row.remove());
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),2,'the sole visible controls recover after the transition settles');
});
for(const compiled of [false,true])test(`Play-only visibility changes rebind the visible native controls (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});await page.mouse.move(600,500);
 await page.evaluate(()=>{
  const first=mini.p.querySelector('.ytp-miniplayer-controls'),second=first.cloneNode(true);
  first.setAttribute('data-first-native-controls','');second.setAttribute('data-second-native-controls','');
  second.querySelectorAll('[data-ytms-mini-nav-button]').forEach(button=>button.remove());
  second.querySelector('.ytp-play-button').hidden=true;first.after(second);
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-first-native-controls] [data-ytms-mini-nav-button]').count(),2);
 await page.evaluate(()=>{
  document.querySelector('[data-first-native-controls] .ytp-play-button').hidden=true;
  document.querySelector('[data-second-native-controls] .ytp-play-button').hidden=false;
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.locator('[data-second-native-controls] [data-ytms-mini-nav-button]').count(),2,'changing only Play visibility wakes control ownership');
 assert.equal(await page.locator('[data-first-native-controls] [data-ytms-mini-nav-button]').count(),0);
 await page.locator('[data-second-native-controls] [data-ytms-mini-nav-button="next"]').click();
 assert.deepEqual(await page.evaluate(()=>mini.calls),['next']);
});
for(const compiled of [false,true])test(`native arrow wrapper visibility hands control back without hover (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled,native:true});await page.mouse.move(600,500);
 await page.locator('.ytp-next-button').evaluate(button=>{
  const wrapper=document.createElement('div');wrapper.setAttribute('data-native-arrow-wrapper','');
  button.before(wrapper);wrapper.append(button);wrapper.hidden=true;
 });
 const next=page.locator('[data-ytms-mini-nav-button="next"]');await next.waitFor();
 await page.locator('[data-native-arrow-wrapper]').evaluate(wrapper=>wrapper.hidden=false);
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await next.count(),0,'revealing an arbitrary native wrapper releases the fallback before another pointer event');
 assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
for(const compiled of [false,true])test(`generic ancestor visibility settles retained-player ambiguity without hover (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});await page.mouse.move(600,500);
 await page.evaluate(()=>{
  const wrapper=document.createElement('div');wrapper.setAttribute('data-retained-host-wrapper','');
  const retained=document.createElement('ytd-miniplayer');
  retained.innerHTML='<div id="movie_player" style="width:400px;height:225px"><video></video></div>';
  wrapper.append(retained);document.body.append(wrapper);dispatchEvent(new Event('yt-playlist-data-updated'));
 });
 const next=page.locator('[data-ytms-mini-nav-button="next"]');
 await page.waitForFunction(()=>document.querySelector('[data-ytms-mini-nav-button="next"]').disabled);
 await page.locator('[data-retained-host-wrapper]').evaluate(wrapper=>wrapper.hidden=true);
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await next.isEnabled(),true,'hiding a retained host through its parent restores the sole active queue');
 assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
for(const compiled of [false,true])test(`a transform-hidden retained player cannot disable the visible queue arrows (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 const next=page.locator('ytd-miniplayer').first().locator('[data-ytms-mini-nav-button="next"]');
 assert.equal(await next.isEnabled(),true);
 await page.evaluate(()=>{
  const retained=document.createElement('ytd-miniplayer');retained.id='retained-mini';retained.style.transform='scale(0)';
  retained.innerHTML='<div id="movie_player" style="width:400px;height:225px"><video></video></div>';
  document.body.append(retained);dispatchEvent(new Event('yt-playlist-data-updated'));
 });
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await next.isEnabled(),true,'a zero-box retained player is not a competing active queue');
 await page.locator('#retained-mini').evaluate(n=>n.style.transform='none');
 await page.evaluate(()=>dispatchEvent(new Event('yt-playlist-data-updated')));
 await page.waitForFunction(()=>document.querySelector('ytd-miniplayer [data-ytms-mini-nav-button="next"]').disabled);
 await page.locator('#retained-mini').evaluate(n=>n.remove());
 await page.waitForFunction(()=>!document.querySelector('[data-ytms-mini-nav-button="next"]').disabled);
});
for(const compiled of [false,true])test(`focused navigation tooltip follows a native controls layout change (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});const next=page.locator('[data-ytms-mini-nav-button="next"]');
 await page.mouse.move(600,500);await next.focus();
 await page.evaluate(()=>{const row=document.querySelector('.ytp-miniplayer-controls');row.style.width='320px';row.style.marginTop='120px';});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 const button=await next.boundingBox(),tip=await page.locator('#ytms-mini-navigation-tooltip').boundingBox();
 assert.ok(Math.abs(tip.y+tip.height-(button.y-8))<1,'the focused tooltip follows its moved control without needing a fresh hover');
 assert.ok(tip.x<=button.x+button.width/2 && tip.x+tip.width>=button.x+button.width/2,'the tooltip still points to its current owner');
 assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
for(const compiled of [false,true])test(`navigation tooltip uses each axis of native transition scaling (${compiled?'Suite':'source'})`,async t=>{
 const page=await open(t,{compiled});
 await page.evaluate(()=>{mini.p.style.transform='scale(1.3,.8)';mini.p.style.transformOrigin='top left';});
 await page.locator('[data-ytms-mini-nav-button="next"]').focus();
 const button=await page.locator('[data-ytms-mini-nav-button="next"]').boundingBox(),tip=await page.locator('#ytms-mini-navigation-tooltip').boundingBox();
 assert.ok(Math.abs(tip.y+tip.height-(button.y-8*.8))<1,'vertical anchoring follows the vertical scale instead of the horizontal scale');
 assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
for(const compiled of [false,true])for(const enabled of [false,true])test(`focused native Play tooltip follows a native controls layout change (${compiled?'Suite':'source'}, navigation ${enabled})`,async t=>{
 const page=await open(t,{compiled,enabled});
 await page.evaluate(()=>{
  const tip=document.createElement('div');tip.id='native-moving-tip';tip.className='ytp-tooltip ytp-bottom';tip.style.cssText='width:0px;height:27px';
  tip.innerHTML='<div class="ytp-tooltip-text-wrapper"><div class="ytp-tooltip-bottom-text">Play</div></div>';mini.p.append(tip);
 });
 await page.mouse.move(600,500);await page.keyboard.press('Tab');await page.locator('.ytp-play-button').focus();
 await page.evaluate(()=>{document.querySelector('.ytp-miniplayer-controls').style.marginTop='120px';});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 const button=await page.locator('.ytp-play-button').boundingBox(),tip=await page.locator('#native-moving-tip').boundingBox();
 assert.ok(Math.abs(tip.y+tip.height-(button.y-8))<1,'the native Play tooltip follows the focused control after a row move');
 assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
test('disabled navigation observes only an active native tooltip and releases it on blur or pointer leave',async t=>{
 const page=await open(t,{enabled:false});await page.mouse.move(600,500);
 await page.evaluate(factory=>{
  disposeMini();window.tooltipObservations=[];window.tooltipMutations=0;window.tooltipDisconnects=0;
  class TrackedObserver extends MutationObserver {
   constructor(callback){super((records,observer)=>{tooltipMutations++;callback(records,observer);});}
   observe(target,options){tooltipObservations.push(target.id||target.tagName);super.observe(target,options);}
   disconnect(){tooltipDisconnects++;super.disconnect();}
  }
  window.disposeMini=(0,eval)(`(${factory})`)({document,window,preferences:{miniplayerNavigation:false},MutationObserver:TrackedObserver});
  const outside=document.createElement('button');outside.id='outside-focus';outside.textContent='Outside';document.body.append(outside);
 },installMiniplayerControls.toString());
 assert.deepEqual(await page.evaluate(()=>tooltipObservations),[],'disabled navigation attaches no page-wide observer');
 await page.keyboard.press('Tab');await page.locator('.ytp-play-button').focus();
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.deepEqual(await page.evaluate(()=>tooltipObservations),['movie_player'],'only the active native player is observed');
 await page.locator('#outside-focus').focus();
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.evaluate(()=>mini.p.style.getPropertyValue('--ytms-mini-play-tip-x')),'');
 const afterBlur=await page.evaluate(()=>tooltipMutations);
 await page.evaluate(()=>{for(let i=0;i<20;i++)mini.p.append(document.createElement('div'));});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.evaluate(()=>tooltipMutations),afterBlur,'native player mutations are no longer observed after blur');
 await page.locator('.ytp-play-button').hover();await page.mouse.move(600,500);
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.evaluate(()=>mini.p.style.getPropertyValue('--ytms-mini-play-tip-x')),'','pointer leave also releases the inactive anchor');
 await page.locator('.ytp-play-button').focus();
 await page.locator('.ytp-miniplayer-play-button-container').evaluate(n=>n.remove());
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 const afterRemoval=await page.evaluate(()=>tooltipMutations);
 await page.evaluate(()=>{for(let i=0;i<20;i++)mini.p.append(document.createElement('div'));});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.evaluate(()=>tooltipMutations),afterRemoval,'native Play removal disconnects the now-unused player observation');
 assert.equal(await page.locator('[data-ytms-mini-nav-button]').count(),0);
});
for(const compiled of [false,true])for(const scaled of [false,true])test(`unchanged focused tooltip geometry does not write styles during queue sync (${compiled?'Suite':'source'}, scaled ${scaled})`,async t=>{
 const page=await open(t,{compiled});
 if(scaled)await page.evaluate(()=>{mini.p.style.transform='scale(.83,.79)';mini.p.style.transformOrigin='top left';});
 await page.mouse.move(600,500);await page.locator('[data-ytms-mini-nav-button="next"]').focus();
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 await page.evaluate(()=>{window.tipWrites=0;window.tipObserver=new MutationObserver(records=>tipWrites+=records.length);tipObserver.observe(document.querySelector('#ytms-mini-navigation-tooltip'),{attributes:true,attributeFilter:['style']});});
 for(let i=0;i<3;i++){
  await page.evaluate(()=>dispatchEvent(new Event('yt-playlist-data-updated')));
  await page.evaluate(async()=>{for(let j=0;j<3;j++)await new Promise(requestAnimationFrame);});
 }
 assert.equal(await page.evaluate(()=>tipWrites),0,'unchanged positions are idempotent');
 await page.evaluate(()=>tipObserver.disconnect());
});

for(const compiled of [false,true])for(const enabled of [false,true])test(`removing the focused native Play control releases its tooltip anchor (${compiled?'Suite':'source'}, navigation ${enabled})`,async t=>{
 const page=await open(t,{compiled,enabled});await page.mouse.move(600,500);
 await page.keyboard.press('Tab');await page.locator('.ytp-play-button').focus();
 assert.notEqual(await page.evaluate(()=>mini.p.style.getPropertyValue('--ytms-mini-play-tip-x')),'');
 await page.locator('.ytp-miniplayer-play-button-container').evaluate(n=>{mini.replacement=n.cloneNode(true);n.remove();});
 await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
 assert.equal(await page.evaluate(()=>mini.p.style.getPropertyValue('--ytms-mini-play-tip-x')),'','native restamping releases an anchor whose focused control no longer exists');
 assert.equal(await page.evaluate(()=>mini.p.style.getPropertyValue('--ytms-mini-play-tip-y')),'');
 await page.evaluate(()=>mini.p.querySelector('.ytp-miniplayer-controls').append(mini.replacement));
 await page.locator('.ytp-play-button').focus();
 assert.notEqual(await page.evaluate(()=>mini.p.style.getPropertyValue('--ytms-mini-play-tip-x')),'','the replacement control can own a fresh anchor');
 assert.deepEqual(await page.evaluate(()=>mini.calls),[]);
});
