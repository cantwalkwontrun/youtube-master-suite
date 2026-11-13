// Language: en-GB. Synthetic native-method reentrancy; no user state or network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const source = readFileSync(new URL('../../sources/modules/youtube-watch-layout-cleaner.user.js', import.meta.url), 'utf8');
const start = source.indexOf('  function installQueuePlayNext(');
const installer = source.slice(start, source.indexOf('\n  function installQueueDragAssistance(', start));
const compiled = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const A='aaaaaaaaaaa',B='bbbbbbbbbbb',C='ccccccccccc',D='ddddddddddd';
let browser;
before(async()=>{browser=await launchFixtureBrowser();});
after(async()=>{await browser?.close();});
async function open(t,suite=false){
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url().startsWith('https://www.youtube.com/watch?')
    ?route.fulfill({contentType:'text/html',body:html}):route.abort());
  if(suite)await context.addInitScript({content:compiled});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);
  page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await context.close();}});
  await page.goto('https://www.youtube.com/watch?v='+A);
  if(suite)await waitForSuiteHealth(page,manifest.registeredModules,{requireReady:true,timeoutMs:10000});
  await page.evaluate(({A,B,C})=>{
    document.querySelectorAll('ytd-playlist-panel-renderer').forEach(el=>el.remove());
    const q=window.methodFixture={ids:[A,B,C],moves:[],adds:[],lookupCancelled:false,resolveReads:0};
    const player=document.getElementById('movie_player');fixture.playerId=A;
    player.getPlaylistId=()=> 'TLPQfixture';player.getPlaylist=()=>[...q.ids];
    const panel=document.createElement('ytd-playlist-panel-renderer');panel.style.cssText='display:block;width:400px';
    const items=document.createElement('div');items.id='items';panel.append(items);document.querySelector('#secondary').append(panel);
    const owner=panel.polymerController={canReorder:true};q.owner=owner;q.items=items;
    q.render=()=>{
      owner.data={playlistId:'TLPQfixture',totalVideos:q.ids.length,currentIndex:0,contents:q.ids.map(videoId=>({playlistPanelVideoRenderer:{videoId,playlistSetVideoId:'set-'+videoId,selected:videoId===A}}))};
      items.replaceChildren(...owner.data.contents.map(item=>{
        const row=document.createElement('ytd-playlist-panel-video-renderer');row.data=item.playlistPanelVideoRenderer;row.style.display='block';row.textContent=row.data.videoId;return row;
      }));
      dispatchEvent(new Event('yt-playlist-data-updated'));
    };
    owner.handleDrop=({currDragItem})=>{q.moves.push(currDragItem.data.videoId);q.ids=[...items.children].map(row=>row.data.videoId);q.render();};q.render();
    const dropdown=document.createElement('tp-yt-iron-dropdown'),popup=document.createElement('ytd-menu-popup-renderer');
    popup.style.cssText='position:fixed;top:60px;right:20px;z-index:2500;display:none;background:#222';dropdown.append(popup);document.querySelector('ytd-app').append(dropdown);q.popup=popup;
    dropdown.close=()=>{popup.style.display='none';};dropdown.refit=()=>{};
    popup.polymerController={set(path,data){this.data=data;popup.replaceChildren(...data.items.map(item=>{
      const row=document.createElement('ytd-menu-service-item-renderer');row.polymerController={data:item.menuServiceItemRenderer};row.textContent=item.menuServiceItemRenderer.text.simpleText;row.setAttribute('role','menuitem');row.tabIndex=0;row.style.cssText='display:block;padding:12px';return row;
    }));},resolveCommand(endpoint){const command=endpoint.signalServiceEndpoint.actions[0].addToPlaylistCommand;q.adds.push(command.videoId);setTimeout(()=>{q.ids.push(command.videoId);q.render();},q.delay||20);return true;}};
    q.open=videoId=>{
      popup.polymerController.set('data',{items:[{menuServiceItemRenderer:{text:{simpleText:'Add to queue'},icon:{iconType:'ADD_TO_QUEUE_TAIL'},serviceEndpoint:{signalServiceEndpoint:{signal:'CLIENT_SIGNAL',actions:[{addToPlaylistCommand:{videoId,videoIds:[videoId],listType:'PLAYLIST_EDIT_LIST_TYPE_QUEUE',openMiniplayer:true}}]}}}}]});
      popup.style.display='block';popup.dispatchEvent(new CustomEvent('yt-popup-opened',{bubbles:true}));
    };
  },{A,B,C});
  if(!suite)await page.addScriptTag({content:`(()=>{${installer}\nwindow.disposeMethodFixture=installQueuePlayNext();})();`});
  return page;
}
async function choose(page,id){await page.evaluate(id=>methodFixture.open(id),id);await page.getByRole('menuitem',{name:'Play next in queue',exact:true}).click();}
for(const suite of [false,true])for(const interruption of ['yt-navigate-start','pagehide'])test(`native drop lookup cannot commit after ${interruption} (${suite?'Suite':'source'})`,async t=>{
  const page=await open(t,suite);
  await page.evaluate(({id,interruption})=>{
    const q=methodFixture,drop=q.owner.handleDrop;
    Object.defineProperty(q.owner,'handleDrop',{get(){
      if(q.items.children[1]?.data.videoId===id&&!q.lookupCancelled){q.lookupCancelled=true;dispatchEvent(new Event(interruption));}
      return drop;
    }});
  },{id:C,interruption});
  await choose(page,C);
  await page.waitForFunction(()=>methodFixture.lookupCancelled);
  assert.deepEqual(await page.evaluate(()=>methodFixture.moves),[],'A native getter invalidated the operation before its returned method was called');
  assert.deepEqual(await page.evaluate(()=>methodFixture.ids),[A,B,C]);
});
for(const suite of [false,true])test(`native resolver is captured once rather than reread while dispatching (${suite?'Suite':'source'})`,async t=>{
  const page=await open(t,suite);
  await page.evaluate(()=>{
    const q=methodFixture,owner=q.popup.polymerController,resolve=owner.resolveCommand;
    Object.defineProperty(owner,'resolveCommand',{get(){
      if(++q.resolveReads>1){q.lookupCancelled=true;dispatchEvent(new Event('yt-navigate-start'));}
      return resolve;
    }});
  });
  await choose(page,D);
  await page.waitForFunction(()=>methodFixture.ids.length===4);
  assert.equal(await page.evaluate(()=>methodFixture.resolveReads),1,'One validated callable should retain its native receiver without a second getter');
  assert.equal(await page.evaluate(()=>methodFixture.lookupCancelled),false);
  assert.deepEqual(await page.evaluate(()=>methodFixture.adds),[D]);
  await page.waitForFunction(()=>methodFixture.moves.length===1);
  assert.deepEqual(await page.evaluate(()=>methodFixture.ids),[A,D,B,C]);
});
for(const suite of [false,true])test(`a disposed legacy popup cannot cancel another accepted queue request (${suite?'Suite':'source'})`,async t=>{
  const page=await open(t,suite);
  await page.evaluate(()=>{methodFixture.delay=500;});
  await choose(page,D);
  await page.evaluate(id=>{
    methodFixture.open(id);
    Object.defineProperty(methodFixture.popup.polymerController,'data',{get(){throw new Error('Disposed native popup binding');}});
  },C);
  await page.getByRole('menuitem',{name:'Play next in queue',exact:true}).click();
  await page.waitForFunction(()=>methodFixture.ids.length===4);
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  assert.deepEqual(await page.evaluate(()=>methodFixture.moves),[D]);
  assert.deepEqual(await page.evaluate(()=>methodFixture.ids),[A,D,B,C]);
  assert.deepEqual(await page.evaluate(()=>methodFixture.adds),[D]);
});
