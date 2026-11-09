// Language: en-GB. Synthetic local image files only; no account or profile data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite=readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
const base=readFileSync(new URL('./watch-page.html',import.meta.url),'utf8').replace('lang="en"','lang="en-GB"');
const settingsKey='yt-master-suite.settings.v1',markerKey='yt-master-suite.playhead-image.v1';
const scrubber=`<div class="ytp-progress-bar" role="slider" tabindex="0"><div class="ytp-scrubber-container"><div class="ytp-scrubber-button"></div></div></div>`;
const fixture=base.replace('</head>',`<style>
.ytp-progress-bar{position:absolute;left:20px;right:20px;bottom:40px;height:8px;background:#888}
.ytp-scrubber-container{position:absolute;top:-2px;left:-6px;width:12px;height:12px;transform:translateX(200px)}
.ytp-scrubber-button{width:12px;height:12px;border-radius:50%;background:#f00}
</style></head>`).replace('<video class="html5-main-video"></video>','<video class="html5-main-video"></video>'+scrubber);
let browser;
before(async()=>{browser=await launchFixtureBrowser();});
after(async()=>{await browser?.close();});
async function open(t,{viewport={width:1280,height:900},light=false}={}){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url().startsWith('https://www.youtube.com/watch?')?
    route.fulfill({contentType:'text/html',body:light?fixture.replace('<html lang="en-GB" dark>','<html lang="en-GB">'):fixture}):route.abort());
  await context.addInitScript(({settingsKey})=>{
    if(location.origin!=='https://www.youtube.com')return;
    localStorage.setItem(settingsKey,JSON.stringify({version:1,values:{theatreMode:false,miniplayerEnabled:false}}));
    window.markerPageToken='synthetic-page-token';
    const decode=window.createImageBitmap.bind(window);
    window.deferMarkerBitmap=false;window.pendingMarkerBitmap=null;
    window.createImageBitmap=(...args)=>{
      if(!window.deferMarkerBitmap)return decode(...args);
      return new Promise((resolve,reject)=>{window.pendingMarkerBitmap={args,resolve,reject};});
    };
    window.releaseMarkerBitmap=async()=>{
      const pending=window.pendingMarkerBitmap;window.pendingMarkerBitmap=null;window.deferMarkerBitmap=false;
      if(!pending)return;
      try{pending.resolve(await decode(...pending.args));}catch(error){pending.reject(error);}
    };
  },{settingsKey});
  await context.addInitScript({content:suite});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);
  page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await page.close();await context.close();}});
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa&list=fixture-queue',{waitUntil:'domcontentloaded'});
  await waitForSuiteHealth(page,manifest.registeredModules,{timeoutMs:10000,errors});
  await panel(page);return page;
}
async function panel(page){await page.locator('#ytms-settings-button').click();await page.locator('#ytms-tab-player').click();}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function syntheticFile(page,colour='#00aa66'){
  const data=await page.evaluate(colour=>{
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
    const context=canvas.getContext('2d');context.fillStyle=colour;context.fillRect(0,0,128,64);
    return canvas.toDataURL('image/png').slice(22);
  },colour);
  return{name:'synthetic-marker.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};
}
async function choose(page){await page.locator('#ytms-marker-file').setInputFiles(await syntheticFile(page));await page.locator('#ytms-marker-save').waitFor();await page.waitForFunction(()=>!document.getElementById('ytms-marker-save').disabled);}
async function markerSaved(page){await page.locator('#ytms-marker-save').click();await page.locator('[data-ytms-playhead-marker="1"] > .ytms-playhead-marker').waitFor({state:'attached'});}
async function stored(page){return page.evaluate(({settingsKey,markerKey})=>({settings:fixtureStorage.getItem(settingsKey),marker:fixtureStorage.getItem(markerKey)}),{settingsKey,markerKey});}

test('choosing an image prepares a thumbnail without saving or dirtying preferences, and Save image applies without reload',async t=>{
  const page=await open(t),before=await stored(page);
  assert.equal(await page.locator('#ytms-marker-preview').isVisible(),false);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(),true);
  await choose(page);
  const preview=page.locator('#ytms-marker-preview');await preview.evaluate(image=>image.decode());
  assert.equal(await preview.isVisible(),true);
  assert.deepEqual(await preview.evaluate(image=>({width:image.naturalWidth,height:image.naturalHeight})),{width:64,height:32});
  assert.deepEqual(await stored(page),before);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(),true);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await markerSaved(page);
  const after=await stored(page);assert.equal(after.settings,before.settings);
  const marker=JSON.parse(after.marker);assert.equal(marker.version,1);assert.equal(marker.size,24);
  assert.ok(marker.dataUrl.startsWith('data:image/png;base64,'));assert.equal(after.marker.includes('synthetic-marker.png'),false);
  assert.match(await page.locator('#ytms-marker-status').textContent(),/saved.*no reload/i);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.markerPageToken),'synthetic-page-token');
});
test('image size saves independently and Restore red dot preserves an unrelated settings draft',async t=>{
  const page=await open(t);await choose(page);await markerSaved(page);
  const before=await stored(page);
  await page.locator('#ytms-marker-size').evaluate(input=>{input.value='36';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#ytms-marker-size-value').textContent(),'36 px');
  assert.deepEqual(await stored(page),before);
  assert.equal((await page.locator('.ytms-playhead-marker').boundingBox()).width,24);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(),true);
  await markerSaved(page);await settle(page);
  assert.equal(JSON.parse((await stored(page)).marker).size,36);
  assert.equal((await page.locator('.ytms-playhead-marker').boundingBox()).width,36);
  assert.equal((await stored(page)).settings,before.settings);
  await page.locator('#ytms-yellowCaptions').uncheck();
  assert.equal(await page.locator('#ytms-save-preview').isEnabled(),true);
  await page.locator('#ytms-marker-remove').click();await settle(page);
  assert.equal((await stored(page)).marker,null);assert.equal((await stored(page)).settings,before.settings);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  assert.equal(await page.locator('.ytp-scrubber-button').evaluate(node=>getComputedStyle(node).opacity),'1');
  assert.equal(await page.locator('#ytms-yellowCaptions').isChecked(),false);
  assert.equal(await page.locator('#ytms-save-preview').isEnabled(),true);
});
test('preparing a replacement image prevents saving or resizing the previous draft',async t=>{
  const page=await open(t);await choose(page);
  const firstImage=await page.locator('#ytms-marker-preview').getAttribute('src'),before=await stored(page);
  await page.evaluate(()=>window.deferMarkerBitmap=true);
  await page.locator('#ytms-marker-file').setInputFiles(await syntheticFile(page,'#3355ff'));
  await page.waitForFunction(()=>!!window.pendingMarkerBitmap);
  assert.match(await page.locator('#ytms-marker-status').textContent(),/preparing/i);
  assert.equal(await page.locator('#ytms-marker-save').isDisabled(),true);
  assert.equal(await page.locator('#ytms-marker-size').isDisabled(),true);
  // A delayed input event must not enable Save while the selected image is decoding.
  await page.locator('#ytms-marker-size').evaluate(input=>{input.value='36';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#ytms-marker-save').isDisabled(),true);
  await page.locator('#ytms-marker-save').evaluate(button=>button.click());
  assert.deepEqual(await stored(page),before);
  await page.evaluate(()=>releaseMarkerBitmap());
  await page.waitForFunction(()=>!document.getElementById('ytms-marker-save').disabled);
  const replacement=await page.locator('#ytms-marker-preview').getAttribute('src');
  assert.notEqual(replacement,firstImage);
  assert.equal(await page.locator('#ytms-marker-size').inputValue(),'24');
  assert.equal(await page.locator('#ytms-marker-size').isEnabled(),true);
  await markerSaved(page);
  assert.equal(JSON.parse((await stored(page)).marker).dataUrl,replacement);
  assert.equal((await stored(page)).settings,before.settings);
});
test('Save image and Restore red dot preserve a newer marker written by another window',async t=>{
  const page=await open(t);await choose(page);await markerSaved(page);
  const settingsBefore=(await stored(page)).settings;
  const other=await page.context().newPage();
  await other.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa&list=fixture-queue',{waitUntil:'domcontentloaded'});
  await waitForSuiteHealth(other,manifest.registeredModules,{timeoutMs:10000});
  for(const [action,size] of [['marker-save',28],['marker-remove',32]]){
    await page.locator('#ytms-marker-size').evaluate(input=>{input.value='36';input.dispatchEvent(new Event('input',{bubbles:true}));});
    const newer=await other.evaluate(({key,size})=>{
      const value=JSON.parse(fixtureStorage.getItem(key));value.size=size;
      const raw=JSON.stringify(value);fixtureStorage.setItem(key,raw);return raw;
    },{key:markerKey,size});
    await page.locator(`#ytms-${action}`).click();
    assert.match(await page.locator('#ytms-marker-status').textContent(),/changed in another window/i);
    assert.equal((await stored(page)).marker,newer);
    assert.equal((await stored(page)).settings,settingsBefore);
    assert.equal(await page.locator('#ytms-marker-save').isDisabled(),true);
    assert.equal(await page.locator('#ytms-marker-remove').isDisabled(),true);
    assert.equal(await page.locator('#ytms-marker-size').inputValue(),'36');
    // Even a delayed synthetic activation of either old action must be inert.
    await page.locator('#ytms-marker-save').evaluate(button=>button.click());
    await page.locator('#ytms-marker-remove').evaluate(button=>button.click());
    assert.equal((await stored(page)).marker,newer);
    await page.locator('#ytms-cancel-panel').click();await panel(page);
    assert.equal(await page.locator('#ytms-marker-size').inputValue(),String(size));
    assert.equal(await page.locator('#ytms-marker-save').isDisabled(),true);
    assert.equal(await page.locator('#ytms-marker-remove').isEnabled(),true);
  }
});
for(const close of ['cancel-panel','close-panel'])test(`closing with ${close} invalidates a late image preparation`,async t=>{
  const page=await open(t),before=await stored(page);
  await page.evaluate(()=>window.deferMarkerBitmap=true);
  await page.locator('#ytms-marker-file').setInputFiles(await syntheticFile(page));
  await page.waitForFunction(()=>!!window.pendingMarkerBitmap);
  assert.match(await page.locator('#ytms-marker-status').textContent(),/preparing/i);
  await page.locator(`#ytms-${close}`).click();await panel(page);
  await page.evaluate(()=>releaseMarkerBitmap());await settle(page);
  assert.equal(await page.locator('#ytms-marker-preview').isVisible(),false);
  assert.equal(await page.locator('#ytms-marker-save').isDisabled(),true);
  assert.equal(await page.locator('#ytms-marker-file').inputValue(),'');
  assert.equal(await page.locator('#ytms-marker-status').textContent(),'');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(),true);
  assert.deepEqual(await stored(page),before);
});
test('an invalid local image leaves the saved marker and main preferences unchanged',async t=>{
  const page=await open(t);await choose(page);await markerSaved(page);const before=await stored(page);
  await page.locator('#ytms-marker-file').setInputFiles({name:'synthetic-invalid.png',mimeType:'image/png',buffer:Buffer.from('Synthetic invalid image')});
  await page.waitForFunction(()=>!document.getElementById('ytms-marker-status').textContent.includes('Preparing'));
  assert.equal(await page.locator('#ytms-marker-save').isDisabled(),true);
  assert.deepEqual(await stored(page),before);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),1);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(),true);
});
for(const light of [false,true])test(`marker controls fit a narrow ${light?'light':'dark'} settings panel`,async t=>{
  const page=await open(t,{viewport:{width:360,height:640},light});await choose(page);
  const dialog=page.locator('#ytms-settings-dialog'),box=await dialog.boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=360&&box.y>=0&&box.y+box.height<=640,JSON.stringify(box));
  const geometry=await page.locator('#ytms-playhead-marker').evaluate(section=>{
    const dialog=section.closest('dialog'),content=dialog.querySelector('.content'),bounds=dialog.getBoundingClientRect();
    return{scroll:content.scrollWidth,client:content.clientWidth,color:getComputedStyle(section).color,background:getComputedStyle(dialog).backgroundColor,
      controls:[...section.querySelectorAll('input,img,button')].filter(node=>!node.hidden).map(node=>{const box=node.getBoundingClientRect();return{id:node.id,left:box.left,right:box.right,width:box.width};}),left:bounds.left,right:bounds.right};
  });
  assert.ok(geometry.scroll<=geometry.client+1,JSON.stringify(geometry));
  assert.ok(geometry.controls.every(control=>control.left>=geometry.left-1&&control.right<=geometry.right+1),JSON.stringify(geometry));
  const luminance=value=>value.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const values=[luminance(geometry.color),luminance(geometry.background)].sort((a,b)=>b-a);
  assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,JSON.stringify(geometry));
  await page.locator('#ytms-marker-size').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#ytms-marker-size-value').textContent(),'25 px');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(),true);
});
