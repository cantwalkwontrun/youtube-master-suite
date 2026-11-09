// Language: en-GB. Synthetic native layout/gesture contract, without network or user profiles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installCompactNativeQueue } from '../../sources/compact-native-queue.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });

// The modern public component allocates285px to its panel and301px to a400px
// player plus info bar. Native drag/snap computes with that full virtual height.
const HTML = `<!doctype html><html lang="en-GB"><head><style>
body { margin:0; }
.ytdMiniplayerComponentHost { display:none; position:fixed; flex-direction:column; width:400px; height:225px; max-height:calc(100vh - 32px); touch-action:none; }
.ytdMiniplayerComponentVisible { display:flex; }
.ytdMiniplayerComponentContent { display:flex; flex-direction:column; overflow:hidden; width:100%; height:100%; }
@supports (scrollbar-width:none) { .ytdMiniplayerComponentContent { overflow:hidden scroll; scrollbar-width:none; } }
.ytdMiniplayerComponentDraggable { display:flex; flex-direction:column; width:100%; height:100%; }
.ytdMiniplayerComponentPlaylistPanel { display:block; height:285px; min-height:285px; flex:1; flex-basis:0.000000001px; }
ytd-miniplayer-player-container { display:block; height:225px; flex-shrink:0; }
#movie_player,video { display:block; width:400px; height:225px; }
#movie_player { position:relative; }
#scrub { position:absolute; top:180px; left:12px; }
#keyboard-play { position:absolute; top:20px; right:12px; }
ytd-miniplayer-info-bar { display:block; height:76px; flex-shrink:0; }
ytd-playlist-panel-renderer #container { display:flex; flex-direction:column; height:100%; min-height:0; box-sizing:border-box; border:1px solid transparent; overflow:hidden; }
.header { height:52px; flex-shrink:0; }
.playlist-items { height:100%; overflow-y:auto; padding-bottom:4px; box-sizing:border-box; }
ytd-playlist-panel-video-renderer { display:block; height:56px; padding:4px 0; }
ytd-playlist-panel-video-renderer:first-child { padding-top:8px; }
.ytdMiniplayerComponentResizers { position:absolute; width:100%; height:100%; pointer-events:none; }
.ytdMiniplayerComponentResizer { position:absolute; width:12px; height:100%; left:-6px; pointer-events:auto; }
.ytdMiniplayerComponentAnimatingSnap { transition:transform .08s linear; }
[hidden] { display:none !important; }
</style></head><body><ytd-app>
<ytd-miniplayer class="ytdMiniplayerComponentHost ytdMiniplayerComponentVisible" style="width:400px;height:586px;right:16px;bottom:16px">
<div class="ytdMiniplayerComponentContent">
<yt-draggable class="ytdMiniplayerComponentDraggable">
<ytd-miniplayer-player-container><div id="movie_player"><video></video><button id="scrub">Seek</button><button id="keyboard-play">Play</button></div></ytd-miniplayer-player-container>
<ytd-miniplayer-info-bar><button aria-expanded="true">Queue</button></ytd-miniplayer-info-bar>
</yt-draggable>
<ytd-playlist-panel-renderer class="ytdMiniplayerComponentPlaylistPanel" within-miniplayer>
<div id="container"><div class="header">Synthetic queue</div><div id="items" class="playlist-items"></div></div>
</ytd-playlist-panel-renderer></div>
<div class="ytdMiniplayerComponentResizers"><yt-draggable class="ytdMiniplayerComponentResizer ytdMiniplayerComponentResizerWest"><div class="ytdMiniplayerComponentResizerCorner"></div></yt-draggable></div>
</ytd-miniplayer></ytd-app></body></html>`;

async function open(t, { rows = 2, enabled = true, hidden = false, path = '/', viewport = 900, suite = false, touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width:1280, height:viewport }, serviceWorkers:'block', hasTouch:touch });
  await context.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType:'text/html', body:HTML }) : route.abort());
  let manifest;
  if (suite) {
    const source = readFileSync(new URL('../../youtube-master-suite.user.js',import.meta.url),'utf8');
    manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json',import.meta.url),'utf8'));
    const settings = JSON.stringify({ version:1,values:{ compactNativeQueue:enabled,theatreMode:false,miniplayerEnabled:false } });
    await context.addInitScript({ content:`if (location.origin === 'https://www.youtube.com') localStorage.setItem('yt-master-suite.settings.v1',${JSON.stringify(settings)});\n${source}` });
  }
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(3500);
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(`https://www.youtube.com${path}`);
  await page.evaluate(({ rows, hidden }) => {
    const host = document.querySelector('ytd-miniplayer'), panel = document.querySelector('ytd-playlist-panel-renderer');
    const items = panel.querySelector('#items'), list = panel.querySelector('.playlist-items');
    const player = document.getElementById('movie_player'), video = document.querySelector('video');
    video.currentTime = 42;
    function render(count) {
      items.replaceChildren(...Array.from({ length:count }, (_, index) => {
        const row = document.createElement('ytd-playlist-panel-video-renderer');
        row.textContent = `Synthetic row ${index + 1}`;
        return row;
      }));
    }
    render(rows);
    if (hidden) host.classList.remove('ytdMiniplayerComponentVisible');
    const reads = [];
    const nativeTop = host.getBoundingClientRect().top;
    let drag = null, suppressClick = false;
    const clicks = { video:0,controls:0 };
    video.addEventListener('click',() => { clicks.video++; });
    document.getElementById('keyboard-play').addEventListener('click',() => { clicks.video++; });
    document.querySelector('ytd-miniplayer-info-bar button').addEventListener('click',() => { clicks.controls++; });
    host.querySelector('.ytdMiniplayerComponentDraggable').addEventListener('click',event => {
      if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); }
    },true);
    const point = e => e.touches?.[0] || e.changedTouches?.[0] || e;
    for (const node of host.querySelectorAll('yt-draggable')) for (const name of ['mousedown', 'touchstart']) {
      node.addEventListener(name, e => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        suppressClick = false;
        const p = point(e), resize = node.classList.contains('ytdMiniplayerComponentResizer');
        drag = { x:p.clientX, y:p.clientY, resize, started:resize };
        if (resize) reads.push({ phase:'resize-start', height:host.getBoundingClientRect().height });
      });
    }
    for (const name of ['mousemove', 'touchmove']) document.addEventListener(name, e => {
      if (!drag) return;
      const p = point(e);
      if (!drag.started && Math.hypot(p.clientX - drag.x, p.clientY - drag.y) <= 5) return;
      if (!drag.started && Math.abs(p.clientY - (nativeTop + 225)) <= 15) {
        reads.push({ phase:'native-exclusion', height:host.getBoundingClientRect().height }); drag = null; return;
      }
      if (!drag.started) reads.push({ phase:'drag-start', height:host.getBoundingClientRect().height });
      drag.started = true;
      reads.push({ phase:'move', height:host.getBoundingClientRect().height });
      host.style.transform = 'translate(10px, 0px)';
    }, true);
    for (const name of ['mouseup', 'touchend', 'touchcancel']) document.addEventListener(name, () => {
      if (!drag) return;
      if (drag.started) {
        suppressClick = true;
        reads.push({ phase:'end', height:host.getBoundingClientRect().height });
        host.classList.add('ytdMiniplayerComponentAnimatingSnap');
        host.style.transform = 'translate(0px, 0px)';
        setTimeout(() => host.classList.remove('ytdMiniplayerComponentAnimatingSnap'), 100);
      }
      drag = null;
    }, true);
    document.getElementById('scrub').addEventListener('mousedown', e => e.stopPropagation());
    window.compactFixture = { host, panel, items, list, player, video, render, reads, clicks,
      nativeTop, inline:host.style.cssText, panelInline:panel.style.cssText };
  }, { rows, hidden });
  if (suite) await waitForSuiteHealth(page,manifest.registeredModules,{ timeoutMs:10000,requireReady:true,errors });
  else await page.addScriptTag({ content:`window.compactDispose = (${installCompactNativeQueue.toString()})({ document, window, enabled:${enabled} });` });
  await settle(page);
  return page;
}
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const state = page => page.evaluate(() => {
  const f = compactFixture, box = f.host.getBoundingClientRect();
  return { height:box.height, top:box.top, bottom:box.bottom, width:box.width,
    panel:f.panel.getBoundingClientRect().height, compact:f.host.hasAttribute('data-ytms-compact-native-queue'),
    rows:f.items.children.length, playerSame:f.player === document.getElementById('movie_player'),
    time:f.video.currentTime, nativeHeight:f.host.style.height, transform:f.host.style.transform,
    anchors:[f.host.style.top, f.host.style.bottom, f.host.style.left, f.host.style.right] };
});

for (const [rows, expected] of [[0,285], [1,126], [2,190], [8,285]]) test(`native queue measures ${rows} rows without reserving an extra row`, async t => {
  const page = await open(t, { rows });
  const actual = await state(page);
  assert.equal(actual.panel, expected); assert.equal(actual.height, 301 + expected);
  assert.equal(actual.rows, rows); assert.equal(actual.nativeHeight, '586px');
  assert.equal(actual.width,400); assert.equal(actual.bottom,884);
  assert.equal(actual.top,884 - actual.height);
  assert.equal(actual.playerSame,true); assert.equal(actual.time,42);
});

test('queue addition, removal, reordering and replacement row heights update compact extent', async t => {
  const page = await open(t, { path:'/watch?v=aaaaaaaaaaa' });
  await page.evaluate(() => compactFixture.render(1)); await settle(page);
  assert.equal((await state(page)).panel,126);
  await page.evaluate(() => compactFixture.render(3)); await settle(page);
  assert.equal((await state(page)).panel,254);
  await page.evaluate(() => {
    const f = compactFixture; f.items.prepend(f.items.lastElementChild);
    f.items.firstElementChild.style.height = '80px';
  }); await settle(page);
  assert.equal((await state(page)).panel,278);
  await page.evaluate(() => compactFixture.items.firstElementChild.style.height = '120px'); await settle(page);
  assert.equal((await state(page)).panel,285);
});

test('hidden host activation, collapse and loading preserve native geometry until bound', async t => {
  const page = await open(t, { hidden:true });
  assert.equal((await state(page)).compact,false);
  await page.evaluate(() => compactFixture.host.classList.add('ytdMiniplayerComponentVisible')); await settle(page);
  assert.equal((await state(page)).panel,190);
  for (const attribute of ['collapsed','loading','is-loading']) {
    await page.evaluate(name => compactFixture.panel.setAttribute(name,''), attribute); await settle(page);
    assert.equal((await state(page)).compact,false);
    await page.evaluate(name => compactFixture.panel.removeAttribute(name), attribute); await settle(page);
    assert.equal((await state(page)).panel,190);
  }
});

for (const reveal of ['late stylesheet','hidden ancestor','ancestor visibility']) test(`an initially hidden native queue wakes after ${reveal} changes`, async t => {
  const page = await open(t,{ enabled:false });
  await page.evaluate(reveal => {
    if (reveal === 'late stylesheet') {
      const sheet = document.styleSheets[0];
      compactFixture.hiddenRule = sheet.insertRule('ytd-miniplayer.ytdMiniplayerComponentVisible { display:none !important; }',sheet.cssRules.length);
    } else {
      const wrapper = document.createElement('div');
      if (reveal === 'hidden ancestor') wrapper.hidden = true;
      else wrapper.style.visibility = 'hidden';
      compactFixture.host.before(wrapper); wrapper.append(compactFixture.host);
      compactFixture.hiddenWrapper = wrapper;
    }
  },reveal);
  await page.addScriptTag({ content:`window.compactDispose = (${installCompactNativeQueue.toString()})({ document,window });` });
  await settle(page);
  assert.equal((await state(page)).compact,false);
  await page.evaluate(reveal => {
    if (reveal === 'late stylesheet') document.styleSheets[0].deleteRule(compactFixture.hiddenRule);
    else if (reveal === 'hidden ancestor') compactFixture.hiddenWrapper.hidden = false;
    else compactFixture.hiddenWrapper.style.visibility = 'visible';
  },reveal);
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'),null,{ timeout:1500 });
  const actual = await state(page);
  assert.equal(actual.panel,190); assert.equal(actual.bottom,884);
  assert.equal(actual.playerSame,true); assert.equal(actual.time,42);
});

test('hidden ancestor observation follows reparenting and stops when visible or disposed', async t => {
  const page = await open(t,{ enabled:false });
  await page.evaluate(() => {
    const f = compactFixture;
    f.oldWrapper = document.createElement('div'); f.nextWrapper = document.createElement('div');
    f.oldWrapper.style.visibility = f.nextWrapper.style.visibility = 'hidden';
    f.host.before(f.oldWrapper,f.nextWrapper); f.oldWrapper.append(f.host);
  });
  await page.addScriptTag({ content:`window.compactDispose = (${installCompactNativeQueue.toString()})({ document,window });` });
  await settle(page);
  await page.evaluate(() => compactFixture.nextWrapper.append(compactFixture.host)); await settle(page);
  await page.evaluate(() => {
    const f = compactFixture; f.fitFrames = 0;
    f.originalFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { f.fitFrames++; return f.originalFrame(callback); };
    f.oldWrapper.style.visibility = 'visible';
  });
  const flush = () => page.evaluate(() => new Promise(resolve =>
    compactFixture.originalFrame(() => compactFixture.originalFrame(resolve))));
  await flush();
  assert.equal(await page.evaluate(() => compactFixture.fitFrames),0,'old ancestors must be disconnected');
  assert.equal((await state(page)).compact,false);
  await page.evaluate(() => compactFixture.nextWrapper.style.visibility = 'visible');
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
  await flush();
  await page.evaluate(() => {
    compactFixture.fitFrames = 0; compactFixture.nextWrapper.style.setProperty('--fixture-unrelated','1');
  });
  await flush();
  assert.equal(await page.evaluate(() => compactFixture.fitFrames),0,'visible hosts must release ancestor observation');
  await page.evaluate(() => {
    compactFixture.nextWrapper.style.visibility = 'hidden';
    window.dispatchEvent(new Event('yt-page-data-updated'));
  }); await flush();
  await page.evaluate(() => {
    compactDispose(); compactFixture.fitFrames = 0; compactFixture.nextWrapper.style.visibility = 'visible';
  }); await flush();
  assert.equal(await page.evaluate(() => compactFixture.fitFrames),0,'disposal must release ancestor observation');
  assert.equal((await state(page)).height,586);
});

test('viewport-clipped native geometry retains its original video top while fitting rows', async t => {
  const page = await open(t, { viewport:500 });
  const before = await state(page);
  assert.equal(before.height,468); assert.equal(before.panel,167); assert.equal(before.bottom,484);
  assert.equal(before.top,await page.evaluate(() => compactFixture.nativeTop));
  const handle = await page.locator('.ytdMiniplayerComponentResizer').boundingBox();
  await page.mouse.move(handle.x + 6,handle.y + 80); await page.mouse.down();
  assert.equal((await state(page)).height,468); assert.equal((await state(page)).top,before.top);
  await page.mouse.up();
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
  await page.evaluate(() => { compactFixture.host.style.top = '16px'; compactFixture.host.style.bottom = ''; }); await settle(page);
  assert.equal((await state(page)).top,16); assert.equal((await state(page)).height,468);
});

test('main drag releases before native capture movement and remains native through snap', async t => {
  const page = await open(t);
  const box = await page.locator('ytd-miniplayer-info-bar').boundingBox();
  await page.mouse.move(box.x + 200,box.y + 40); await page.mouse.down();
  await page.mouse.move(box.x + 203,box.y + 44); // exactly5px still a click
  assert.equal((await state(page)).compact,true);
  await page.mouse.move(box.x + 204,box.y + 44);
  assert.equal((await state(page)).height,586);
  assert.equal((await state(page)).top,298);
  await page.mouse.up();
  assert.equal((await state(page)).compact,false);
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
  assert.deepEqual(await page.evaluate(() => compactFixture.reads.map(read => read.height)), [586,586,586]);
  assert.equal((await state(page)).panel,190);
  assert.equal((await state(page)).top,393);
});

test('native resize handle reads full height at mousedown before its own handler', async t => {
  const page = await open(t);
  const box = await page.locator('.ytdMiniplayerComponentResizer').boundingBox();
  await page.mouse.move(box.x + 6,box.y + 100); await page.mouse.down();
  assert.deepEqual(await page.evaluate(() => compactFixture.reads), [{ phase:'resize-start',height:586 }]);
  assert.equal((await state(page)).top,298);
  await page.mouse.up();
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
});

test('ordinary controls and stopped seek drags retain the compact geometry', async t => {
  const page = await open(t);
  await page.locator('ytd-miniplayer-info-bar button').click();
  assert.equal((await state(page)).panel,190);
  const box = await page.locator('#scrub').boundingBox();
  await page.mouse.move(box.x + 5,box.y + 5); await page.mouse.down();
  await page.mouse.move(box.x + 50,box.y + 5);
  assert.equal((await state(page)).panel,190); await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => compactFixture.reads), []);
});

test('disable and dispose preserve original native inline layout and remove only owned state', async t => {
  const disabled = await open(t, { enabled:false });
  assert.equal((await state(disabled)).height,586);
  const page = await open(t);
  await page.evaluate(() => compactDispose());
  assert.equal((await state(page)).height,586);
  assert.deepEqual(await page.evaluate(() => ({ host:compactFixture.host.style.cssText === compactFixture.inline,
    panel:compactFixture.panel.style.cssText === compactFixture.panelInline,
    owned:document.querySelectorAll('[data-ytms-compact-native-queue], [data-ytms-compact-native-queue-panel]').length })),
  { host:true,panel:true,owned:0 });
  await page.evaluate(() => compactFixture.render(1)); await settle(page);
  assert.equal((await state(page)).height,586);
});

test('visible non-video list contents and their changing height are retained', async t => {
  const page = await open(t, { rows:1 });
  await page.evaluate(() => {
    const footer = document.createElement('div'); footer.id = 'continuation';
    footer.style.height = '40px'; footer.textContent = 'Synthetic continuation';
    compactFixture.list.append(footer);
  }); await settle(page);
  assert.equal((await state(page)).panel,166);
  await page.evaluate(() => document.getElementById('continuation').style.height = '80px'); await settle(page);
  assert.equal((await state(page)).panel,206);
  await page.evaluate(() => document.getElementById('continuation').remove()); await settle(page);
  assert.equal((await state(page)).panel,126);
});

test('scrolled long queues are not mistaken for short visible content', async t => {
  const page = await open(t, { rows:8 });
  await page.evaluate(() => { compactFixture.list.scrollTop = 300; }); await settle(page);
  assert.equal((await state(page)).panel,285);
  await page.evaluate(() => compactFixture.render(2)); await settle(page);
  assert.equal((await state(page)).panel,190);
});

test('synthetic touch drag follows native capture ordering and cancel settles safely', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    const target = document.querySelector('ytd-miniplayer-info-bar');
    function touch(type,x) {
      const event = new Event(type,{ bubbles:true });
      Object.defineProperty(event,'touches',{ value:type === 'touchcancel' ? [] : [{ clientX:x,clientY:500 }] });
      Object.defineProperty(event,'changedTouches',{ value:[{ clientX:x,clientY:500 }] });
      target.dispatchEvent(event);
    }
    touch('touchstart',400); touch('touchmove',404);
    compactFixture.touchClickCompact = compactFixture.host.hasAttribute('data-ytms-compact-native-queue');
    touch('touchmove',406);
    // A descendant losing focus must not end the native gesture.
    target.querySelector('button').dispatchEvent(new FocusEvent('blur'));
    touch('touchcancel',406);
  });
  assert.equal(await page.evaluate(() => compactFixture.touchClickCompact),true);
  assert.deepEqual(await page.evaluate(() => compactFixture.reads.map(read => read.height)),[586,586,586]);
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
});

test('stale reduced-motion animation classes settle once without permanent polling', async t => {
  const page = await open(t);
  await page.evaluate(() => compactFixture.host.classList.add('ytdMiniplayerComponentAnimatingPlaylistExpand'));
  await settle(page);
  assert.equal((await state(page)).compact,false);
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
  assert.equal((await state(page)).panel,190);
  assert.equal(await page.evaluate(() => compactFixture.host.classList.contains('ytdMiniplayerComponentAnimatingPlaylistExpand')),true);
});

test('pagehide releases active geometry and pageshow recomputes without a stale gesture', async t => {
  const page = await open(t);
  const box = await page.locator('.ytdMiniplayerComponentResizer').boundingBox();
  await page.mouse.move(box.x + 6,box.y + 100); await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal((await state(page)).compact,false);
  await page.mouse.up();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
});

test('normal pages without a modern native host create no style, resize observer or frame work', async t => {
  const page = await open(t, { enabled:false });
  await page.evaluate(() => {
    compactFixture.host.remove();
    compactFixture.styleCount = document.querySelectorAll('style').length;
    compactFixture.frames = 0; compactFixture.observers = 0;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { compactFixture.frames++; return raf.call(window,callback); };
    const Original = window.ResizeObserver;
    window.CountedResizeObserver = class extends Original { constructor(callback) { super(callback); compactFixture.observers++; } };
  });
  await page.addScriptTag({ content:`window.compactDispose = (${installCompactNativeQueue.toString()})({ document, window, ResizeObserver:CountedResizeObserver });` });
  await page.evaluate(() => { document.body.append(document.createElement('div')); });
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => ({ styles:document.querySelectorAll('style').length - compactFixture.styleCount,
    frames:compactFixture.frames, observers:compactFixture.observers })), { styles:0,frames:0,observers:0 });
  await page.evaluate(() => { document.querySelector('ytd-app').append(compactFixture.host); });
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
});

test('player timeline and caption mutations do not trigger queue measurements', async t => {
  const page = await open(t);
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    compactFixture.frames = 0;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { compactFixture.frames++; return raf.call(window,callback); };
    const caption = document.createElement('span'); compactFixture.player.append(caption);
    for (let i=0;i<100;i++) { caption.style.transform = `translateX(${i}px)`; caption.textContent = `Synthetic caption ${i}`; }
  });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => compactFixture.frames),0);
});

test('unchanged queue refreshes do not rewrite compact ownership or sizing attributes', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    compactFixture.attributeWrites = [];
    compactFixture.writeObserver = new MutationObserver(records => {
      compactFixture.attributeWrites.push(...records.map(record => record.attributeName));
    });
    compactFixture.writeObserver.observe(compactFixture.host,{ attributes:true,subtree:true,
      attributeFilter:['data-ytms-compact-native-queue','data-ytms-compact-native-queue-panel','style'] });
    for (let i=0;i<100;i++) window.dispatchEvent(new Event('yt-playlist-data-updated'));
  });
  await settle(page);
  assert.deepEqual(await page.evaluate(() => compactFixture.attributeWrites),[]);
  assert.equal((await state(page)).height,491); assert.equal((await state(page)).bottom,884);
  await page.evaluate(() => compactFixture.writeObserver.disconnect());
});

test('synthetic resize inside a frame preserves compact geometry until remeasurement', async t => {
  const page = await open(t);
  const inFrame = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const f = compactFixture;
    // Player layout refreshes dispatch resize from their own animation frame.
    // Releasing here would expose the full native box until the next frame.
    f.render(3);
    window.dispatchEvent(new Event('resize'));
    const box = f.host.getBoundingClientRect();
    resolve({ compact:f.host.hasAttribute('data-ytms-compact-native-queue'),
      height:box.height,bottom:box.bottom });
  })));
  assert.deepEqual(inFrame,{ compact:true,height:491,bottom:884 });
  await settle(page);
  const updated = await state(page);
  assert.equal(updated.height,555); assert.equal(updated.panel,254); assert.equal(updated.bottom,884);
  assert.equal(updated.playerSame,true); assert.equal(updated.time,42);
});

test('genuine viewport resize releases native geometry before later resize handlers', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    compactFixture.viewportReads = [];
    window.addEventListener('resize',event => {
      const f = compactFixture;
      f.viewportReads.push({ trusted:event.isTrusted,
        compact:f.host.hasAttribute('data-ytms-compact-native-queue'),height:f.host.getBoundingClientRect().height });
    });
  });
  await page.setViewportSize({ width:1300,height:900 });
  await page.waitForFunction(() => compactFixture.viewportReads.length > 0);
  assert.deepEqual(await page.evaluate(() => compactFixture.viewportReads),
    [{ trusted:true,compact:false,height:586 }]);
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
  const updated = await state(page);
  assert.equal(updated.height,491); assert.equal(updated.bottom,884);
  assert.equal(updated.playerSame,true); assert.equal(updated.time,42);
});

test('early installation discovers and fits a later native queue before DOMContentLoaded', async t => {
  const context = await browser.newContext({ viewport:{ width:1280,height:900 },serviceWorkers:'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror',error => errors.push(error.message)); page.setDefaultTimeout(3500);
  t.after(async () => { try { assert.deepEqual(errors,[]); } finally { await context.close(); } });
  let releaseScript;
  const deferredScript = new Promise(resolve => { releaseScript = resolve; });
  const install = `window.earlyCompact = { hadHost:!!document.querySelector('ytd-miniplayer'),domReady:false };
    window.earlyCompact.dispose = (${installCompactNativeQueue.toString()})({ document,window });
    addEventListener('DOMContentLoaded',() => { earlyCompact.domReady = true; },{ once:true });`;
  const html = HTML.replace('</head>',`<script>${install}</script><script defer src="/fixture-deferred.js"></script></head>`)
    .replace('<div id="items" class="playlist-items"></div>',
      '<div id="items" class="playlist-items"><ytd-playlist-panel-video-renderer>Synthetic A</ytd-playlist-panel-video-renderer><ytd-playlist-panel-video-renderer>Synthetic B</ytd-playlist-panel-video-renderer></div>');
  await context.route('**/*',async route => {
    if (route.request().url() === 'https://www.youtube.com/') return route.fulfill({ contentType:'text/html',body:html });
    if (route.request().url() === 'https://www.youtube.com/fixture-deferred.js') {
      await deferredScript;
      return route.fulfill({ contentType:'application/javascript',body:'' });
    }
    return route.abort();
  });
  try {
    await page.goto('https://www.youtube.com/',{ waitUntil:'commit' });
    await page.waitForFunction(() => document.querySelector('[data-ytms-compact-native-queue]'));
    assert.deepEqual(await page.evaluate(() => {
      const box = document.querySelector('ytd-miniplayer').getBoundingClientRect();
      return { hadHost:earlyCompact.hadHost,domReady:earlyCompact.domReady,height:box.height,bottom:box.bottom };
    }),{ hadHost:false,domReady:false,height:491,bottom:884 });
  } finally { releaseScript(); }
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => earlyCompact.dispose());
});

test('document-start installation before the HTML root exists still discovers the native queue', async t => {
  const context = await browser.newContext({ viewport:{ width:1280,height:900 },serviceWorkers:'block' });
  const html = HTML.replace('<div id="items" class="playlist-items"></div>',
    '<div id="items" class="playlist-items"><ytd-playlist-panel-video-renderer>Synthetic A</ytd-playlist-panel-video-renderer><ytd-playlist-panel-video-renderer>Synthetic B</ytd-playlist-panel-video-renderer></div>');
  await context.route('**/*',route => route.request().url() === 'https://www.youtube.com/'
    ? route.fulfill({ contentType:'text/html',body:html }) : route.abort());
  // Some engines create an empty HTML element before init scripts. Temporarily
  // detach that same element to exercise the earlier document-start boundary.
  await context.addInitScript({ content:`(() => {
    const root = document.documentElement; root?.remove();
    window.rootlessCompact = { missingRoot:!document.documentElement };
    try { rootlessCompact.dispose = (${installCompactNativeQueue.toString()})({ document,window }); }
    finally { if (root) document.append(root); }
  })();` });
  const page = await context.newPage(), errors = [];
  page.on('pageerror',error => errors.push(error.message)); page.setDefaultTimeout(3500);
  t.after(async () => { try { assert.deepEqual(errors,[]); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/');
  assert.equal(await page.evaluate(() => rootlessCompact.missingRoot),true,'fixture must execute before the HTML root exists');
  await page.waitForFunction(() => document.querySelector('[data-ytms-compact-native-queue]'),null,{ timeout:1500 });
  assert.deepEqual(await page.locator('ytd-miniplayer').evaluate(node => {
    const box = node.getBoundingClientRect(); return { height:box.height,bottom:box.bottom };
  }),{ height:491,bottom:884 });
  await page.evaluate(() => rootlessCompact.dispose());
});

test('short south queues retain the actual bottom corner as rows change', async t => {
  const page = await open(t);
  const initial = await state(page);
  assert.equal(initial.top,393);
  assert.equal(initial.bottom,884);
  assert.equal(await page.evaluate(() => {
    const box = compactFixture.host.getBoundingClientRect();
    return !!document.elementFromPoint(box.x + 200,850)?.closest('ytd-miniplayer');
  }),true);
  assert.deepEqual(initial.anchors,['','16px','','16px']);
  for (const count of [1,3,2]) {
    await page.evaluate(count => compactFixture.render(count),count); await settle(page);
    assert.equal((await state(page)).bottom,884);
  }
  await page.evaluate(() => { compactFixture.host.style.top = '16px'; compactFixture.host.style.bottom = ''; }); await settle(page);
  assert.equal((await state(page)).top,16); assert.equal((await state(page)).height,491);
});

test('a native-rejected real video drag cannot become a playback click', async t => {
  const page = await open(t);
  const box = await page.locator('video').boundingBox();
  assert.equal(box.y + box.height,618);
  const nativeBandY = await page.evaluate(() => compactFixture.nativeTop + 225 - 10);
  await page.mouse.move(box.x + 200,nativeBandY); await page.mouse.down();
  await page.mouse.move(box.x + 210,nativeBandY); await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => compactFixture.reads), [{ phase:'native-exclusion',height:586 }]);
  assert.equal(await page.evaluate(() => compactFixture.clicks.video),0);
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
  assert.equal((await state(page)).top,box.y);
  await page.mouse.click(box.x + 200,box.y + 80);
  assert.equal(await page.evaluate(() => compactFixture.clicks.video),1);
  assert.equal((await state(page)).height,491);
});

test('an accepted native drag clears its own click flag before keyboard and ordinary clicks', async t => {
  const page = await open(t);
  const box = await page.locator('video').boundingBox();
  await page.mouse.move(box.x + 200,450); await page.mouse.down();
  await page.mouse.move(box.x + 210,450); await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => compactFixture.reads.map(read => read.phase)),['drag-start','move','end']);
  assert.equal(await page.evaluate(() => compactFixture.clicks.video),0);
  // No intervening pointerdown can reset the native accepted-drag flag here.
  await page.locator('#keyboard-play').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => compactFixture.clicks.video),1);
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
  await page.mouse.click(box.x + 200,box.y + 80);
  assert.equal(await page.evaluate(() => compactFixture.clicks.video),2);
  assert.equal((await state(page)).bottom,884);
});

test('native resize commits its own width and video geometry before compact remeasurement', async t => {
  const page = await open(t);
  const box = await page.locator('.ytdMiniplayerComponentResizer').boundingBox();
  await page.mouse.move(box.x + 6,box.y + 100); await page.mouse.down();
  await page.evaluate(() => {
    const f = compactFixture;
    f.host.style.width = '440px'; f.host.style.height = '608.5px';
    for (const node of [f.player,f.video,document.querySelector('ytd-miniplayer-player-container')]) {
      node.style.width = '440px'; node.style.height = '247.5px';
    }
  });
  await page.mouse.up();
  await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
  const actual = await state(page);
  assert.equal(actual.nativeHeight,'608.5px'); assert.equal(actual.height,513.5);
  assert.equal(actual.width,440); assert.equal(actual.top,370.5); assert.equal(actual.bottom,884);
  assert.equal(actual.panel,190); assert.equal(actual.time,42); assert.equal(actual.playerSame,true);
  assert.deepEqual(await page.locator('video').evaluate(node => ({ width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height })),
    { width:440,height:247.5 });
});

test('a hidden metadata header and collapsed native control are handled independently', async t => {
  const page = await open(t);
  await page.evaluate(() => compactFixture.panel.querySelector('.header').hidden = true); await settle(page);
  assert.equal((await state(page)).panel,138);
  await page.evaluate(() => document.querySelector('ytd-miniplayer-info-bar button').setAttribute('aria-expanded','false')); await settle(page);
  assert.equal((await state(page)).compact,false);
  await page.evaluate(() => document.querySelector('ytd-miniplayer-info-bar button').setAttribute('aria-expanded','true')); await settle(page);
  assert.equal((await state(page)).panel,138);
});

test('a scrolled native outer content viewport is left unchanged', async t => {
  const page = await open(t, { enabled:false,viewport:500 });
  const original = await page.evaluate(() => {
    const content = compactFixture.host.querySelector('.ytdMiniplayerComponentContent');
    content.scrollTop = 60;
    return { scroll:content.scrollTop,top:compactFixture.video.getBoundingClientRect().top };
  });
  assert.ok(original.scroll > 0,'fixture must model native outer scrolling');
  await page.addScriptTag({ content:`window.compactDispose = (${installCompactNativeQueue.toString()})({ document, window });` });
  await settle(page);
  assert.equal((await state(page)).compact,false);
  assert.deepEqual(await page.evaluate(() => ({ scroll:compactFixture.host.querySelector('.ytdMiniplayerComponentContent').scrollTop,
    top:compactFixture.video.getBoundingClientRect().top })),original);
});

test('complete Suite fits and grows native queue rows without changing playback', async t => {
  const page = await open(t,{ suite:true });
  assert.equal((await state(page)).panel,190);
  assert.equal((await state(page)).bottom,884);
  await page.evaluate(() => compactFixture.render(3)); await settle(page);
  assert.equal((await state(page)).panel,254);
  assert.equal((await state(page)).bottom,884);
  await page.evaluate(() => compactFixture.render(8)); await settle(page);
  assert.equal((await state(page)).panel,285);
  assert.equal((await state(page)).bottom,884);
  await page.evaluate(() => {
    const f = compactFixture; f.host.style.width = '440px'; f.host.style.height = '608.5px';
    for (const node of [f.player,f.video,document.querySelector('ytd-miniplayer-player-container')]) {
      node.style.width = '440px'; node.style.height = '247.5px';
    }
    f.render(2);
  }); await settle(page);
  const actual = await state(page);
  assert.equal(actual.playerSame,true); assert.equal(actual.time,42); assert.equal(actual.width,440);
  assert.equal(actual.bottom,884); assert.equal(actual.height,513.5); assert.equal(actual.panel,190);
  assert.equal(await page.evaluate(() => compactFixture.player.parentElement.localName),'ytd-miniplayer-player-container');
  assert.ok(!await page.getAttribute('html','data-yt-master-runtime-errors'));
});

test('complete Suite disabled preference retains the native panel and playback', async t => {
  const page = await open(t,{ suite:true,enabled:false });
  const actual = await state(page);
  assert.equal(actual.compact,false); assert.equal(actual.panel,285); assert.equal(actual.height,586);
  assert.equal(actual.bottom,884);
  assert.equal(actual.playerSame,true); assert.equal(actual.time,42);
  assert.equal(await page.evaluate(() => compactFixture.player.parentElement.localName),'ytd-miniplayer-player-container');
  assert.ok(!await page.getAttribute('html','data-yt-master-runtime-errors'));
});

test('trusted Chromium touch preserves native input delivery around rejected and cancelled drags', async t => {
  if (browser.browserType().name() !== 'chromium') {
    t.skip('Trusted touch injection uses Chromium CDP; Gecko touch hardware behaviour is not claimed.'); return;
  }
  async function exercise(enabled) {
    const page = await open(t,{ touch:true,enabled });
    const cdp = await page.context().newCDPSession(page);
    try {
      await page.evaluate(() => {
        window.touchProbe = { stage:'ordinary-before-drag',events:[] };
        for (const target of [window,compactFixture.video]) for (const type of ['touchstart','touchend','touchcancel','click']) {
          target.addEventListener(type,event => {
            const entry = { stage:touchProbe.stage,type,at:target === window ? 'window' : 'video',
              trusted:event.isTrusted,targetVideo:event.target === compactFixture.video,event };
            touchProbe.events.push(entry);
          },{ capture:true,passive:true });
        }
      });
      const box = await page.locator('video').boundingBox();
      const y = await page.evaluate(() => compactFixture.nativeTop + 225 - 10);
      const send = (type,x,cy=y) => cdp.send('Input.dispatchTouchEvent',{
        type,touchPoints:type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x,y:cy,id:1 }],
      });
      const clickCount = () => page.evaluate(() => compactFixture.clicks.video);
      const stage = name => page.evaluate(name => { touchProbe.stage = name; },name);
      const tap = async name => {
        await stage(name);
        await send('touchStart',box.x + 200,box.y + 80); await send('touchEnd'); await settle(page);
      };
      const rejected = async (name,endType) => {
        await stage(name);
        const before = await clickCount();
        await send('touchStart',box.x + 200); await send('touchMove',box.x + 220); await send(endType);
        if (enabled) await page.waitForFunction(() => compactFixture.host.hasAttribute('data-ytms-compact-native-queue'));
        else await settle(page);
        return { before,after:await clickCount() };
      };
      // Calibrate real trusted tap activation before any drag. Some installed
      // Chromium versions stop synthesising compatibility mouse/click events
      // after raw CDP touch moves, including when the Suite is absent.
      await tap('ordinary-before-drag');
      await page.waitForFunction(() => compactFixture.clicks.video === 1);
      const rejection = await rejected('rejected-drag','touchEnd');
      await tap('ordinary-after-rejection');
      const cancellation = await rejected('cancelled-drag','touchCancel');
      await tap('ordinary-after-cancellation');
      const result = await page.evaluate(() => ({
        events:touchProbe.events.map(({ event,...entry }) => ({ ...entry,prevented:event.defaultPrevented })),
        reads:compactFixture.reads,
      }));
      result.rejection = rejection; result.cancellation = cancellation; result.geometry = await state(page);
      return result;
    } finally { await cdp.detach(); }
  }
  const native = await exercise(false), compact = await exercise(true);
  assert.ok(compact.reads.some(read => read.phase === 'native-exclusion'));
  assert.equal(compact.rejection.after,compact.rejection.before,'a rejected touch drag must not activate playback');
  assert.equal(compact.cancellation.after,compact.cancellation.before,'a cancelled touch drag must not activate playback');
  const taps = ['ordinary-before-drag','ordinary-after-rejection','ordinary-after-cancellation'];
  for (const name of taps) {
    const deliveredTouches = result => result.events.filter(event => event.stage === name && event.at === 'video' && event.type.startsWith('touch'))
      .map(({ type,trusted,targetVideo,prevented }) => ({ type,trusted,targetVideo,prevented }));
    assert.deepEqual(deliveredTouches(compact),deliveredTouches(native),name);
    assert.deepEqual(deliveredTouches(compact),[
      { type:'touchstart',trusted:true,targetVideo:true,prevented:false },
      { type:'touchend',trusted:true,targetVideo:true,prevented:false },
    ],name);
    for (const result of [native,compact]) {
      const emitted = result.events.filter(event => event.stage === name && event.at === 'window' && event.type === 'click');
      const delivered = result.events.filter(event => event.stage === name && event.at === 'video' && event.type === 'click');
      assert.equal(delivered.length,emitted.length,'every browser-generated ordinary click must reach the video');
      assert.ok(emitted.every(event => event.trusted && event.targetVideo && !event.prevented),name);
      assert.ok(delivered.every(event => event.trusted && event.targetVideo && !event.prevented),name);
      if (name === 'ordinary-before-drag') assert.equal(emitted.length,1);
    }
  }
  if (native.events.filter(event => event.stage.startsWith('ordinary-after-') && event.at === 'window' && event.type === 'click').length < 2) {
    t.diagnostic('Installed Chromium omitted post-drag compatibility clicks in the native-only baseline. Trusted touch delivery and uncancelled emitted clicks are verified; physical-touch post-drag activation is not claimed.');
  }
  assert.equal(compact.geometry.bottom,884); assert.equal(compact.geometry.time,42);
});
