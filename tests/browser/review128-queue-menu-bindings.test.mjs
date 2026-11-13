// Language: en-GB. Native ownership through Suite submenus; synthetic pages only.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createQueueMenuBindings } from '../../sources/queue-menu-bindings.mjs';
import { installVideoMenu } from '../../sources/video-menu.mjs';
import { createMenuLayout } from '../../sources/menu-layout.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
async function open(t, sheet, editor = true) {
  const context = await browser.newContext({ serviceWorkers: 'block' }); t.after(() => context.close());
  await context.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({ contentType:'text/html',
    body:'<!doctype html><html lang="en-GB"><style>ytd-video-renderer,tp-yt-iron-dropdown,ytd-menu-popup-renderer,yt-sheet-view-model,yt-list-view-model,ytd-menu-service-item-renderer,yt-list-item-view-model{display:block}tp-yt-iron-dropdown{width:280px}button{min-height:32px}[hidden]{display:none!important}</style><body><ytd-video-renderer><a href="/watch?v=bbbbbbbbbbb">Video</a><ytd-menu-renderer><button id="trigger" aria-label="Video actions">More</button></ytd-menu-renderer></ytd-video-renderer><tp-yt-iron-dropdown hidden></tp-yt-iron-dropdown></body></html>' }) : route.abort());
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message)); t.after(() => assert.deepEqual(errors, []));
  await page.goto('https://www.youtube.com/');
  await page.evaluate(({ sheet, editor, bridgeFactory, layoutFactory, installer }) => {
    const bridge = (0,eval)(`(${bridgeFactory})`)(), layouts = (0,eval)(`(${layoutFactory})`)();
    const layout = layouts.fromPreferences({ menuGroupChannelTools:false });
    layout.nodes.push({id:'submenu-queue',name:'Queue',parent:'root'}, {id:'submenu-queue-actions',name:'Queue actions',parent:'submenu-queue'});
    layout.nodes.find(node => node.id === 'addToQueue').parent = 'submenu-queue-actions';
    const endpoint = { signalServiceEndpoint:{signal:'CLIENT_SIGNAL',actions:[{addToPlaylistCommand:{listType:'PLAYLIST_EDIT_LIST_TYPE_QUEUE',videoIds:['bbbbbbbbbbb']}}]} };
    const definitions = [['share','Share','SHARE',{}],['add','Add to queue','ADD_TO_QUEUE_TAIL',endpoint]];
    const items = definitions.map(([,label,icon,command]) => sheet ? {listItemViewModel:{title:{content:label},leadingImage:{sources:[{clientResource:{imageName:icon}}]},rendererContext:{commandContext:{onTap:{innertubeCommand:command}}}}} :
      {menuServiceItemRenderer:{text:{simpleText:label},icon:{iconType:icon},serviceEndpoint:command}});
    const data = sheet ? {content:{listViewModel:{listItems:items}}} : {items};
    const dropdown = document.querySelector('tp-yt-iron-dropdown'), popup = document.createElement(sheet ? 'yt-sheet-view-model' : 'ytd-menu-popup-renderer');
    dropdown.append(popup); dropdown.refit = () => {}; dropdown.close = () => { dropdown.hidden = true; };
    if (sheet) popup.componentProps = {data:() => f.data}; else popup.data = data;
    const parent = sheet ? document.createElement('yt-list-view-model') : popup; if (sheet) popup.append(parent);
    const rows = definitions.map(([id,label], i) => {
      const row = document.createElement(sheet ? 'yt-list-item-view-model' : 'ytd-menu-service-item-renderer'); row.dataset.fixtureAction = id;
      if (sheet) Object.defineProperty(row,'data',{configurable:true,get:() => Symbol('opaque native row')}); else row.data = items[i].menuServiceItemRenderer;
      const button = document.createElement('button'); button.textContent = label; row.append(button); parent.append(row); return row;
    });
    window.f = {bridge,popup,data,items,rows,parent,sheet};
    document.getElementById('trigger').addEventListener('click',() => {
      dropdown.hidden = false;
      if (!editor) f.captured = bridge.capture(popup,{data:f.data,items:f.items,rows:f.rows,sheet});
      popup.dispatchEvent(new CustomEvent('yt-popup-opened',{bubbles:true}));
    });
    if (editor) window.disposeEditor = (0,eval)(`(${installer})`)({settings:{initial:{menuLayout:layout}},menuLayout:layouts,queueMenuBindings:bridge});
  }, {sheet,editor,bridgeFactory:createQueueMenuBindings.toString(),layoutFactory:createMenuLayout.toString(),installer:installVideoMenu.toString()});
  await page.locator('#trigger').click();
  if (editor) await page.locator('[data-ytms-video-menu="1"]').waitFor();
  return page;
}
const bound = page => page.evaluate(() => f.bridge.get(f.rows[1],f.popup)?.item === f.items[1]);
const staleQueue = page => page.evaluate(() => f.bridge.isStaleQueueAction(f.rows[1],f.popup));
for (const sheet of [false,true]) {
  test(`queue binding keeps native identity through nested Suite submenus (${sheet?'opaque sheet':'legacy'})`,async t => {
    const page = await open(t,sheet);
    assert.equal(await bound(page),true);
    await page.locator('[data-ytms-menu-action="submenu-queue"]').click();
    await page.locator('[data-ytms-menu-action="submenu-queue-actions"]').click();
    assert.equal(await page.locator('[data-fixture-action="add"]').isVisible(),true);
    assert.equal(await bound(page),true);
    await page.locator('[data-ytms-menu-action="back"]').click();
    await page.locator('[data-ytms-menu-action="back"]').click();
    assert.equal(await bound(page),true);
    assert.equal(await page.evaluate(() => f.bridge.capture(f.popup,{data:f.data,items:f.items,rows:[...f.parent.querySelectorAll(f.sheet?'yt-list-item-view-model':'ytd-menu-service-item-renderer')],sheet:f.sheet})),false,
      'Already arranged menu positions must not become a new native binding');
    assert.equal(await bound(page),true,'a refused recapture preserves the still-valid original proof');
  });
  for (const change of ['command','popup-model','items-array','item-copy','row-copy','row-model','row-target','other-popup','forget']) {
    test(`queue binding rejects ${change} after native capture (${sheet?'sheet':'legacy'})`,async t => {
      const page = await open(t,sheet,false); assert.equal(await bound(page),true);
      await page.evaluate(change => {
        const row = f.rows[1];
        if (change === 'command') { const model = f.items[1].listItemViewModel || f.items[1].menuServiceItemRenderer; const endpoint = model.serviceEndpoint || model.rendererContext.commandContext.onTap.innertubeCommand; endpoint.signalServiceEndpoint.actions[0].addToPlaylistCommand.videoIds[0] = 'ccccccccccc'; }
        if (change === 'popup-model') { f.data = structuredClone(f.data); if (!f.sheet) f.popup.data = f.data; }
        if (change === 'items-array') { const list = f.sheet ? f.data.content.listViewModel : f.data; list[f.sheet?'listItems':'items'] = [...f.items]; }
        if (change === 'item-copy') f.items[1] = structuredClone(f.items[1]);
        if (change === 'row-copy') row.replaceWith(row.cloneNode(true));
        if (change === 'row-model') { const value = {title:{content:'Recycled native action'}}; Object.defineProperty(row,'data',{configurable:true,value}); }
        if (change === 'row-target') row.setAttribute('data-target-id','recycled-native-target');
        if (change === 'other-popup') { const other = document.createElement(f.popup.localName); f.popup.after(other); other.append(row); }
        if (change === 'forget') f.bridge.forget(f.popup);
      },change);
      assert.equal(await bound(page),false);
    });
  }
  test(`unsupported native capture cannot guess mismatched rows (${sheet?'sheet':'legacy'})`,async t => {
    const page = await open(t,sheet,false);
    assert.equal(await page.evaluate(() => f.bridge.capture(f.popup,{data:f.data,items:f.items,rows:[...f.rows].reverse(),sheet:f.sheet})),false);
    assert.equal(await bound(page),false);
  });
  test(`explicit native target disagreement cannot establish a slot (${sheet?'sheet':'legacy'})`,async t => {
    const page = await open(t,sheet,false);
    assert.equal(await page.evaluate(() => {
      (f.items[1].listItemViewModel || f.items[1].menuServiceItemRenderer).targetId = 'actual-native-target';
      f.rows[1].setAttribute('data-target-id','different-native-target');
      return f.bridge.capture(f.popup,{data:f.data,items:f.items,rows:f.rows,sheet:f.sheet});
    }),false);
    assert.equal(await bound(page),false);
  });
  test(`a retained queue target change has cancellation authority until a fresh stamp (${sheet?'sheet':'legacy'})`,async t => {
    const page = await open(t,sheet,false);
    assert.equal(await staleQueue(page),false);
    await page.evaluate(() => {
      const value = f.items[1].listItemViewModel || f.items[1].menuServiceItemRenderer;
      const endpoint = value.serviceEndpoint || value.rendererContext.commandContext.onTap.innertubeCommand;
      endpoint.signalServiceEndpoint.actions[0].addToPlaylistCommand.videoIds[0] = 'ccccccccccc';
    });
    assert.equal(await bound(page),false); assert.equal(await staleQueue(page),true);
    await page.evaluate(() => f.bridge.capture(f.popup,{data:f.data,items:f.items,rows:f.rows,sheet:f.sheet}));
    assert.equal(await bound(page),true); assert.equal(await staleQueue(page),false);
  });
  for (const change of ['share','popup-model','source-order','row-copy','row-model','row-target','other-popup']) {
    test(`stale queue classification leaves ${change} native (${sheet?'sheet':'legacy'})`,async t => {
      const page = await open(t,sheet,false);
      await page.evaluate(change => {
        const row = f.rows[1], value = f.items[1].listItemViewModel || f.items[1].menuServiceItemRenderer;
        if (change === 'share') {
          const endpoint = {shareEntityServiceEndpoint:{serializedShareEntity:'synthetic'}};
          if (f.sheet) { value.leadingImage.sources[0].clientResource.imageName = 'SHARE'; value.rendererContext.commandContext.onTap.innertubeCommand = endpoint; }
          else { value.icon.iconType = 'SHARE'; value.serviceEndpoint = endpoint; }
        }
        if (change === 'popup-model') { f.data = structuredClone(f.data); if (!f.sheet) f.popup.data = f.data; }
        if (change === 'source-order') f.items.reverse();
        if (change === 'row-copy') row.replaceWith(row.cloneNode(true));
        if (change === 'row-model') Object.defineProperty(row,'data',{configurable:true,value:{icon:{iconType:'SHARE'},serviceEndpoint:{shareEntityServiceEndpoint:{}}}});
        if (change === 'row-target') row.setAttribute('data-target-id','native-share');
        if (change === 'other-popup') { const other = document.createElement(f.popup.localName); f.popup.after(other); other.append(row); }
      },change);
      assert.equal(await staleQueue(page),false);
    });
  }
}
