// Language: en-GB. All fixture images and playback identities are synthetic.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createPlayheadMarker } from '../../sources/playhead-marker.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';

const url='https://www.youtube.com/watch?v=aaaaaaaaaaa';
const html=`<!doctype html><html lang="en-GB"><head><style>
body{margin:20px} #movie_player{position:relative;width:800px;height:450px;background:#111}
video{display:block;width:100%;height:100%}.ytp-progress-bar{position:absolute;left:20px;right:20px;bottom:40px;height:8px;background:#999}
.ytp-scrubber-container{position:absolute;top:-2px;left:-6px;width:12px;height:12px;transform:translateX(200px)}
.ytp-scrubber-button{width:12px;height:12px;border-radius:50%;background:red}
</style></head><body><div id="movie_player"><video class="html5-main-video"></video>
<div class="ytp-progress-bar" role="slider" tabindex="0"><div class="ytp-scrubber-container"><div class="ytp-scrubber-button"></div></div></div>
</div><script>
const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
const drawing=canvas.getContext('2d');drawing.fillStyle='#00aa66';drawing.fillRect(0,0,32,32);
window.syntheticImage=canvas.toDataURL('image/png');window.audit={clicks:0,pointers:0,keys:0};
window.originalButton=document.querySelector('.ytp-scrubber-button');window.originalContainer=document.querySelector('.ytp-scrubber-container');
originalButton.addEventListener('click',()=>audit.clicks++);
originalButton.addEventListener('pointerdown',()=>audit.pointers++);
document.querySelector('.ytp-progress-bar').addEventListener('keydown',e=>{if(e.key==='ArrowRight')audit.keys++});
window.marker=(${createPlayheadMarker.toString()})({document,window,getStorage:()=>localStorage});
marker.start();window.fixtureReady=true;
</script></body></html>`;
let browser;
before(async()=>{browser=await launchFixtureBrowser();});
after(async()=>{await browser?.close();});
async function open(t,{saved=true}={}) {
  const context=await browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url()===url?route.fulfill({contentType:'text/html',body:html}):route.abort());
  t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await page.close();await context.close();}});
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.fixtureReady);
  assert.equal(await page.evaluate(async()=>{
    const blob=await (await fetch(syntheticImage)).blob();
    const prepared=await marker.prepareFile(new File([blob],'synthetic.png',{type:'image/png'}));
    if(prepared.ok)syntheticImage=prepared.value.dataUrl;return prepared.ok;
  }),true);
  if(saved){assert.equal(await page.evaluate(()=>marker.save({dataUrl:syntheticImage,size:24}).ok),true);await applied(page);}
  return page;
}
async function applied(page){await page.locator('[data-ytms-playhead-marker="1"] > .ytms-playhead-marker').waitFor();}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('late native video insertion and removal reconcile an existing scrubber', async t => {
  const page = await open(t, { saved: false });
  await page.evaluate(() => {
    const video = document.querySelector('video');
    const host = document.createElement('div'); host.className = 'html5-video-container';
    video.before(host); window.lateMarkerVideo = video; video.remove();
    marker.save({ dataUrl: syntheticImage, size: 24 });
  });
  await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(), 0);
  await page.evaluate(() => document.querySelector('.html5-video-container').append(lateMarkerVideo));
  await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(), 1, 'a late native video activates the saved marker without unrelated events');
  await page.evaluate(() => lateMarkerVideo.remove());
  await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(), 0, 'removing the media restores the native scrubber');
});

test('in-place visibility changes on internal controls restore and release the marker', async t => {
  const page = await open(t, { saved: false });
  await page.evaluate(() => {
    const controls = document.querySelector('.ytp-progress-bar');
    controls.style.opacity = '0';
    marker.save({ dataUrl: syntheticImage, size: 24 });
  });
  await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(), 0);
  await page.locator('.ytp-progress-bar').evaluate(node => node.style.opacity = '1');
  await applied(page);
  await page.locator('.ytp-progress-bar').evaluate(node => node.inert = true);
  await page.locator('.ytms-playhead-marker').waitFor({ state: 'detached' });
  await page.locator('.ytp-progress-bar').evaluate(node => node.inert = false);
  await applied(page);
});

test('the marker remains opt-in and does not alter native controls before an image is saved',async t=>{
  const page=await open(t,{saved:false});await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  assert.equal(await page.locator('#ytms-playhead-marker-style').count(),0);
  assert.equal(await page.locator('.ytp-scrubber-button').evaluate(node=>getComputedStyle(node).opacity),'1');
});
test('the image follows the native playhead and preserves native pointer and keyboard targets',async t=>{
  const page=await open(t);
  const before=await page.locator('.ytms-playhead-marker').boundingBox();
  await page.evaluate(()=>originalContainer.style.transform='translateX(350px)');
  const after=await page.locator('.ytms-playhead-marker').boundingBox();
  assert.ok(Math.abs(after.x-before.x-150)<.1);
  assert.equal(await page.locator('.ytms-playhead-marker').evaluate(node=>getComputedStyle(node).pointerEvents),'none');
  assert.equal(await page.evaluate(()=>document.querySelector('.ytp-scrubber-button')===originalButton),true);
  await page.mouse.click(after.x+after.width/2,after.y+after.height/2);
  await page.locator('.ytp-progress-bar').focus();await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(()=>audit),{clicks:1,pointers:1,keys:1});
  assert.equal(await page.locator('.ytp-scrubber-button').evaluate(node=>getComputedStyle(node).opacity),'0');
  assert.equal(await page.locator('.ytms-playhead-marker').getAttribute('aria-hidden'),'true');
});
test('saved size changes apply immediately and removal restores the same native dot',async t=>{
  const page=await open(t);
  await page.evaluate(()=>marker.save({dataUrl:syntheticImage,size:40}));await settle(page);
  assert.equal((await page.locator('.ytms-playhead-marker').boundingBox()).width,40);
  assert.equal(await page.evaluate(()=>marker.remove().ok),true);await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  assert.equal(await page.locator('#ytms-playhead-marker-style').count(),0);
  assert.equal(await page.evaluate(()=>document.querySelector('.ytp-scrubber-button')===originalButton),true);
  assert.equal(await page.locator('.ytp-scrubber-button').evaluate(node=>getComputedStyle(node).opacity),'1');
});
test('native scrubber child replacement and removal of the owned image recover without duplicate markers',async t=>{
  const page=await open(t);
  await page.locator('.ytms-playhead-marker').evaluate(node=>node.remove());await applied(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),1);
  await page.evaluate(()=>{const replacement=document.createElement('div');replacement.className='ytp-scrubber-button';originalContainer.replaceChildren(replacement);});
  await applied(page);assert.equal(await page.locator('.ytms-playhead-marker').count(),1);
});
test('ad playback and ambiguous visible players restore native dots and resume safely afterwards',async t=>{
  const page=await open(t);
  await page.locator('#movie_player').evaluate(node=>node.classList.add('ad-showing'));await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.locator('#movie_player').evaluate(node=>node.classList.remove('ad-showing'));await applied(page);
  await page.evaluate(()=>{const duplicate=document.getElementById('movie_player').cloneNode(true);duplicate.querySelector('.ytms-playhead-marker')?.remove();duplicate.querySelector('[data-ytms-playhead-marker]')?.removeAttribute('data-ytms-playhead-marker');duplicate.hidden=true;duplicate.dataset.fixtureDuplicate='1';document.body.append(duplicate);});
  await settle(page);assert.equal(await page.locator('.ytms-playhead-marker').count(),1);
  await page.locator('[data-fixture-duplicate]').evaluate(node=>node.hidden=false);await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.locator('[data-fixture-duplicate]').evaluate(node=>node.remove());await applied(page);
});
test('invisible retained players preserve the marker until a second player is truly visible',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    const host=document.createElement('div');host.id='retained-player-host';
    const duplicate=document.getElementById('movie_player').cloneNode(true);
    duplicate.dataset.fixtureDuplicate='1';duplicate.style.opacity='0';
    duplicate.querySelector('.ytms-playhead-marker')?.remove();
    duplicate.querySelector('[data-ytms-playhead-marker]')?.removeAttribute('data-ytms-playhead-marker');
    host.append(duplicate);document.body.append(host);
  });
  await settle(page);assert.equal(await page.locator('.ytms-playhead-marker').count(),1,'An opacity-zero player is not a second visible target');
  await page.evaluate(()=>{
    document.getElementById('retained-player-host').style.opacity='0';
    document.querySelector('[data-fixture-duplicate]').style.opacity='1';
  });
  await settle(page);assert.equal(await page.locator('.ytms-playhead-marker').count(),1,'Ancestor opacity also hides a retained player');
  await page.evaluate(()=>{
    const host=document.getElementById('retained-player-host');host.style.opacity='1';host.style.visibility='hidden';
  });
  await settle(page);assert.equal(await page.locator('.ytms-playhead-marker').count(),1,'A visibility-hidden player is not an active target');
  await page.evaluate(()=>document.getElementById('retained-player-host').style.visibility='visible');
  await settle(page);assert.equal(await page.locator('.ytms-playhead-marker').count(),0,'Two truly visible targets remain ambiguous');
  await page.evaluate(()=>document.getElementById('retained-player-host').remove());
  await applied(page);assert.equal(await page.locator('.ytms-playhead-marker').count(),1);
});

test('navigation, unsupported native miniplayer ownership and disposal release marker state',async t=>{
  const page=await open(t);
  await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-start')));await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.evaluate(()=>{history.pushState({},'','/');window.dispatchEvent(new Event('yt-navigate-finish'));});await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.evaluate(()=>{history.pushState({},'','/live/aaaaaaaaaaa');window.dispatchEvent(new Event('yt-navigate-finish'));});await applied(page);
  await page.evaluate(()=>{history.pushState({},'','/watch?v=aaaaaaaaaaa');window.dispatchEvent(new Event('yt-navigate-finish'));});await applied(page);
  await page.evaluate(()=>{const mini=document.createElement('ytd-miniplayer');document.body.append(mini);mini.append(document.getElementById('movie_player'));});await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.evaluate(()=>document.body.append(document.getElementById('movie_player')));await applied(page);
  await page.evaluate(()=>marker.dispose());await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-finish'));document.querySelector('.ytp-scrubber-button').replaceWith(originalButton);});await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
});
test('native progress transforms and media updates cause no marker discovery scans',async t=>{
  const page=await open(t);await settle(page);
  await page.evaluate(()=>{window.syntheticComments=document.createElement('div');document.body.append(syntheticComments);});await settle(page);
  const scans=await page.evaluate(async()=>{
    const original=document.querySelectorAll.bind(document);let scans=0;
    document.querySelectorAll=(...args)=>{scans++;return original(...args);};
    const video=document.querySelector('video');
    for(let i=0;i<100;i++){
      originalContainer.style.transform=`translateX(${i}px)`;video.dispatchEvent(new Event('timeupdate'));
      const reply=document.createElement('p');reply.textContent='Synthetic comment';syntheticComments.append(reply);
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    document.querySelectorAll=original;return scans;
  });
  assert.equal(scans,0);
});
test('local PNG, JPEG and WebP files are reduced to a metadata-free PNG without saving a draft',async t=>{
  const page=await open(t,{saved:false});
  for(const type of ['image/png','image/jpeg','image/webp']){
    const result=await page.evaluate(async type=>{
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;canvas.getContext('2d').fillRect(0,0,128,64);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,type));
      const result=await marker.prepareFile(new File([blob],'synthetic-image',{type}));
      if(!result.ok)return result;
      const image=await createImageBitmap(await (await fetch(result.value.dataUrl)).blob());
      const dimensions={width:image.width,height:image.height};image.close();
      const binary=atob(result.value.dataUrl.slice(22));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const view=new DataView(bytes.buffer);const chunks=[];let offset=8;
      while(offset+12<=bytes.length){const length=view.getUint32(offset);chunks.push(String.fromCharCode(...bytes.subarray(offset+4,offset+8)));offset+=12+length;}
      return {ok:true,dimensions,chunks,stored:localStorage.getItem(marker.key)};
    },type);
    assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.dimensions,{width:64,height:32});
    assert.ok(result.chunks.every(type=>['IHDR','IDAT','IEND','pHYs'].includes(type)),JSON.stringify(result.chunks));
    assert.equal(result.stored,null);
  }
});

test('pagehide keeps the marker released through late navigation and storage events until pageshow',async t=>{
  const page=await open(t);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('yt-navigate-finish'));
    window.dispatchEvent(new Event('yt-page-data-updated'));
    window.dispatchEvent(new StorageEvent('storage',{key:marker.key}));
  });await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  assert.equal(await page.locator('#ytms-playhead-marker-style').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await applied(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),1);
});
test('initial pageshow does not end an unfinished SPA navigation',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('yt-navigate-start'));
    window.dispatchEvent(new Event('pageshow'));
  });await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-finish')));await applied(page);
});
test('pageshow after pagehide clears an interrupted old-page navigation',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('yt-navigate-start'));
    window.dispatchEvent(new Event('pagehide'));
  });await settle(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await applied(page);
  assert.equal(await page.locator('.ytms-playhead-marker').count(),1);
});
