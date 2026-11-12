import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { installVideoMenu } from '../../sources/video-menu.mjs';
import { createMenuLayout } from '../../sources/menu-layout.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';

let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });
const HTML = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>
  html{color-scheme:dark;font:14px Arial;background:#101010;color:#fff}ytd-video-renderer{display:block;padding:16px}
  tp-yt-iron-dropdown{display:block;position:fixed;right:10px;top:70px;max-width:calc(100vw - 20px);max-height:calc(100vh - 90px);overflow:auto;background:#272727;min-width:260px;z-index:3}
  ytd-menu-popup-renderer,yt-sheet-view-model,yt-list-view-model{display:block}
  ytd-menu-service-item-renderer,ytd-menu-service-item-download-renderer,yt-list-item-view-model,yt-download-list-item-view-model{display:block}
  ytd-menu-service-item-renderer,yt-list-item-view-model button{box-sizing:border-box;min-height:40px;padding:10px 16px;width:100%;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer}
  ytd-menu-service-item-renderer:hover,ytd-menu-service-item-renderer:focus,yt-list-item-view-model button:hover,yt-list-item-view-model button:focus{background:rgb(65,65,65)}
  /* Native modern menu states are class-driven as well as pseudo-class-driven. */
  .ytListItemViewModelHovered,.ytListItemViewModelTappable.ytListItemViewModelTappableHover:hover{background-color:rgb(65,65,65)}
  .ytListItemViewModelKeyboardFocused:focus-within{background-color:rgb(65,65,65);outline:2px solid currentColor;outline-offset:-2px}
  [hidden]{display:none!important}
  </style></head><body><ytd-video-renderer id="card"><a href="/watch?v=bbbbbbbbbbb">Video</a><ytd-menu-renderer><button id="trigger" aria-label="Video actions">⋮</button></ytd-menu-renderer></ytd-video-renderer>
  <button id="outside">Outside</button><tp-yt-iron-dropdown hidden></tp-yt-iron-dropdown></body></html>`;
// Synthetic fixture matching YouTube's desktop lockup menu trigger. This
// current wrapper has neither ytd-menu-renderer nor aria-haspopup.
const MODERN_CARD = `<yt-lockup-view-model id="card"><a href="/watch?v=bbbbbbbbbbb">Video</a>
  <div class="ytLockupMetadataViewModelMenuButton"><button-view-model class="ytSpecButtonViewModelHost">
  <button id="trigger" class="ytSpecButtonShapeNextHost ytSpecButtonShapeNextText ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconButton ytSpecButtonShapeNextEnableBackdropFilterExperiment ytSpecButtonShapeNextMainstageIconSize ytSpecButtonShapeNextMainstagePadding" title="" style="" aria-label="More actions" aria-disabled="false">
  <div aria-hidden="true" class="ytSpecButtonShapeNextIcon ytSpecButtonShapeNextElevatedContent"><span class="ytIconWrapperHost"><span class="yt-icon-shape ytSpecIconShapeHost"><div><svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 4a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Z"></path></svg></div></span></span></div>
  <yt-touch-feedback-shape aria-hidden="true" class="ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse"><div class="ytSpecTouchFeedbackShapeStroke"></div><div class="ytSpecTouchFeedbackShapeFill"></div></yt-touch-feedback-shape>
  </button></button-view-model></div></yt-lockup-view-model>`;

async function open(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.narrow ? 320 : 1000, height: 720 }, serviceWorkers: 'block' });
  const fixtureHtml = options.modernTrigger ? HTML.replace(/<ytd-video-renderer id="card">[\s\S]*?<\/ytd-video-renderer>/, MODERN_CARD)
    .replace('</style>', 'yt-lockup-view-model{display:block;padding:16px}.ytLockupMetadataViewModelMenuButton button{display:flex;align-items:center;gap:12px;padding:6px}yt-touch-feedback-shape,.ytSpecTouchFeedbackShapeFill{display:block;width:24px;height:24px}</style>') : HTML;
  const fixtureUrl = `https://www.youtube.com${options.route || '/'}`;
  await context.route('**/*', route => route.request().url() === fixtureUrl
    ? route.fulfill({ contentType: 'text/html', body: fixtureHtml }) : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(fixtureUrl);
  await page.evaluate(({ sheet, settings, missingChannel, wrongVideo, unknown, unsupported, ambiguous, delayed, eventless, delayMs, nativeContract, unknownWrapper, cardTag, containerTag, noQueue, nativeBinding, bindingFault, libraryActions, contentType, modelVideo, nativeAutofocus, presentationRows, lateNativeLayout, nativeHover, blockTube, duplicateNotInterested, iconSlots, iconLoaded, watchActions }) => {
    let card = document.getElementById('card');
    if (cardTag) {
      const replacement = document.createElement(cardTag); replacement.id = card.id;
      replacement.style.cssText = 'display:block;padding:16px'; replacement.append(...card.childNodes);
      card.replaceWith(replacement); card = replacement;
    }
    if (containerTag) { const parent = document.createElement(containerTag); card.before(parent); parent.append(card); }
    if (contentType) card.componentProps = { data: () => ({ contentType, contentId: modelVideo || 'bbbbbbbbbbb' }) };
    const dropdown = document.querySelector('tp-yt-iron-dropdown');
    const popup = document.createElement(sheet ? 'yt-sheet-view-model' : 'ytd-menu-popup-renderer');
    dropdown.append(popup);
    popup.setAttribute('role', 'menu');
    const fixture = window.menuFixture = { nativeCalls: [], refits: 0, openedSettings: [], openedContexts: [], popup, dropdown, originals: [], selectedChannelIds: [] };
    dropdown.refit = () => {
      fixture.refits++;
      if (fixture.nativeLayoutPending) {
        fixture.layoutRefits++;
        if (fixture.layoutRefits >= 2) {
          fixture.nativeLayoutPending = false;
          for (const row of fixture.originals) row.hidden = false;
        }
      }
    };
    dropdown.close = () => { dropdown.hidden = true; dropdown.dispatchEvent(new CustomEvent('iron-overlay-closed', { bubbles: true })); };
    const queue = { signalServiceEndpoint: { actions: [{ addToPlaylistCommand: {
      videoId: wrongVideo ? 'ccccccccccc' : 'bbbbbbbbbbb', videoIds: [wrongVideo ? 'ccccccccccc' : 'bbbbbbbbbbb'],
      listType: 'PLAYLIST_EDIT_LIST_TYPE_QUEUE',
    } }] } };
    const definitions = [
      ['playNext', 'Play next in queue', 'QUEUE_PLAY_NEXT'], ['addToQueue', 'Add to queue', 'ADD_TO_QUEUE_TAIL', queue],
      ['watchLater', 'Watch later', 'WATCH_LATER'], ['savePlaylist', 'Save to playlist', 'PLAYLIST_ADD'],
      ['download', 'Download', 'OFFLINE_DOWNLOAD'], ['share', 'Share', 'SHARE'],
      ['notInterested', 'Not interested', 'NOT_INTERESTED'], ['dontRecommend', 'Do not recommend', 'REMOVE', { feedbackEndpoint: { feedbackToken: 'fixture-channel-feedback' } }], ['report', 'Report', 'FLAG'],
    ];
    if (noQueue) definitions.splice(0, 2);
    if (libraryActions) {
      definitions.splice(definitions.findIndex(entry => entry[0] === 'notInterested'), 2,
        ['remove', 'Remove native item', 'REMOVE', { playlistEditEndpoint: { playlistId: 'fixture' } }],
        ['move', 'Move to top', 'VERTICAL_ALIGN_TOP', { playlistEditEndpoint: { playlistId: 'fixture' } }]);
      definitions.push(['hideRecord', 'Hide native record', 'HIDE', { feedbackEndpoint: { feedbackToken: 'fixture-library-feedback' } }]);
    }
    if (watchActions) definitions.splice(0,definitions.length,
      ['savePlaylist','Save to playlist','BOOKMARK_BORDER'],['download','Download','OFFLINE_DOWNLOAD'],
      ['hype','Hype','HYPE'],['report','Report','FLAG']);
    if (unknown) definitions.splice(3, 0, ['unrecognised', 'Unrecognised native action', 'SOMETHING_NEW']);
    if (blockTube) definitions.push(['blockChannel', 'Block Channel', 'NOT_INTERESTED', { feedbackEndpoint: { feedbackToken: 'fixture-cloned' } }],
      ['blockVideo', 'Block Video', 'NOT_INTERESTED', { feedbackEndpoint: { feedbackToken: 'fixture-cloned' } }]);
    if (ambiguous) definitions.push(['duplicateReport', 'Second report', 'FLAG']);
    if (duplicateNotInterested) definitions.push(['duplicateNotInterested', 'Another native action', 'NOT_INTERESTED', { feedbackEndpoint: { feedbackToken: 'fixture-cloned' } }]);
    if (unsupported) definitions.find(entry => entry[0] === 'addToQueue')[3] = {};
    const items = definitions.map(([id, label, icon, endpoint]) => {
      if (nativeContract && id === 'download') return sheet ? {
        [unknownWrapper ? 'futureDownloadListItemViewModel' : 'downloadListItemViewModel']: { rendererContext: {} },
      } : { menuServiceItemDownloadRenderer: { serviceEndpoint: { offlineVideoEndpoint: {} } } };
      if (nativeContract && id === 'savePlaylist') icon = 'BOOKMARK_BORDER';
      if (nativeContract && id === 'notInterested') icon = 'HIDE';
      return sheet ? { listItemViewModel: {
      title: { content: label }, leadingImage: { sources: [{ clientResource: { imageName: icon } }] },
      targetId: id === 'playNext' ? 'yt-master-play-next' : id,
      rendererContext: { commandContext: { onTap: { innertubeCommand: endpoint || {} } } },
    } } : { menuServiceItemRenderer: { text: { simpleText: label }, icon: { iconType: icon }, serviceEndpoint: endpoint || {} } };
    });
    if (bindingFault === 'unknown-model') items[0] = { futureMenuItemRenderer: { title: 'Unknown native action' } };
    if (nativeBinding) {
      const nativeItems = JSON.parse(JSON.stringify(items));
      if (bindingFault === 'mismatch') nativeItems[0].unrecognisedField = true;
      if (bindingFault === 'oversized') nativeItems[0].unrecognisedField = 'x'.repeat(16385);
      card.querySelector('ytd-menu-renderer').polymerController = { data: { items: nativeItems } };
    }
    let data;
    const stamp = () => {
      popup.replaceChildren();
      const parent = sheet ? document.createElement('yt-list-view-model') : popup;
      if (sheet) popup.append(parent);
      definitions.forEach(([id, label], index) => {
        const wrapped = nativeContract && sheet && id === 'download';
        const row = document.createElement(sheet ? 'yt-list-item-view-model' : nativeContract && id === 'download' ? 'ytd-menu-service-item-download-renderer' : 'ytd-menu-service-item-renderer');
        const host = wrapped ? document.createElement(unknownWrapper ? 'yt-future-download-list-item-view-model' : 'yt-download-list-item-view-model') : row;
        host.dataset.nativeId = id;
        if (wrapped) { host.append(row); row.setAttribute('role', 'presentation'); }
        let target = row;
        if (sheet) {
          Object.defineProperty(row, 'data', { get: () => Symbol('opaque') });
          target = document.createElement('button'); target.type = 'button'; row.append(target);
          if (nativeHover) {
            const layout = document.createElement('div');
            layout.className = 'ytListItemViewModelLayoutWrapper ytListItemViewModelTappable ytListItemViewModelTappableHover';
            row.append(layout); layout.append(target);
            layout.addEventListener('mouseover', event => {
              if (!event.hoverHandled) { layout.classList.add('ytListItemViewModelHovered'); event.hoverHandled = true; }
            });
            layout.addEventListener('mouseout', () => layout.classList.remove('ytListItemViewModelHovered'));
            row.addEventListener('focusin', () => row.classList.add('ytListItemViewModelKeyboardFocused'));
            row.addEventListener('focusout', () => row.classList.remove('ytListItemViewModelKeyboardFocused'));
          }
          if (presentationRows) { row.tabIndex = 0; row.setAttribute('role', 'presentation'); }
        } else row.polymerController = { data: items[index].menuServiceItemRenderer || items[index].menuServiceItemDownloadRenderer };
        target.setAttribute('role', 'menuitem'); target.tabIndex = 0; target.textContent = label;
        if (iconSlots) {
          const leading=document.createElement('div');leading.className='ytListItemViewModelLeading';
          const icon=document.createElement('yt-icon'),slot=document.createElement('span');slot.className='yt-icon-shape';
          if(iconLoaded){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('data-native-icon','1');slot.append(svg);}
          icon.append(slot);leading.append(icon);target.prepend(leading);
        }
        target.onclick = () => { fixture.nativeCalls.push(id); dropdown.close(); };
        if (lateNativeLayout) host.hidden = true;
        parent.append(host);
      });
      fixture.originals = [...parent.children];
      fixture.nativeLayoutPending = lateNativeLayout;
      fixture.layoutRefits = 0;
    };
    fixture.focusNative = id => {
      const row = popup.querySelector(`[data-native-id="${id}"]`);
      (row?.querySelector('button') || row)?.focus();
    };
    data = sheet ? { content: { listViewModel: { listItems: items } } } : { items };
    if (sheet) popup.componentProps = { data: () => data };
    else popup.polymerController = { data };
    fixture.open = () => {
      if (delayed || fixture.delayNext) { popup.replaceChildren(); setTimeout(stamp, delayMs); }
      else stamp();
      dropdown.hidden = false;
      if (nativeAutofocus) fixture.focusNative(nativeAutofocus);
      if (!eventless) popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true }));
    };
    fixture.items = items;
    document.getElementById('trigger').addEventListener('click', fixture.open);
    document.getElementById('trigger').addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); fixture.open(); }
    });
    window.suite = { settings: { initial: settings || {} },
      channelAge: { channelFromCard: () => missingChannel ? null : ({ channelId: 'UCabcdefghijklmnopqrstuv', name: 'News channel' }) },
      openChannelAgeSettings: (channel, context) => {
        fixture.openedSettings.push(channel); fixture.selectedChannelIds.push(context?.selectedChannelId);
        fixture.openedContexts.push({ cardId: context?.card?.id, videoId: context?.videoId, connected: context?.card?.isConnected });
      },
    };
  }, { sheet: Boolean(options.sheet), settings: options.settings, missingChannel: Boolean(options.missingChannel),
    wrongVideo: Boolean(options.wrongVideo), unknown: Boolean(options.unknown), unsupported: Boolean(options.unsupported), ambiguous: Boolean(options.ambiguous), delayed: Boolean(options.delayed), eventless: Boolean(options.eventless), delayMs: options.delayMs || 180, nativeContract: Boolean(options.nativeContract), unknownWrapper: Boolean(options.unknownWrapper),
    cardTag: options.cardTag, containerTag: options.containerTag, noQueue: Boolean(options.noQueue), nativeBinding: Boolean(options.nativeBinding), bindingFault: options.bindingFault,
    libraryActions: Boolean(options.libraryActions), contentType: options.contentType, modelVideo: options.modelVideo,
    nativeAutofocus: options.nativeAutofocus, presentationRows: Boolean(options.presentationRows),
    lateNativeLayout: Boolean(options.lateNativeLayout), nativeHover: Boolean(options.nativeHover), blockTube: Boolean(options.blockTube), duplicateNotInterested: Boolean(options.duplicateNotInterested),
    iconSlots:Boolean(options.iconSlots),iconLoaded:Boolean(options.iconLoaded),watchActions:Boolean(options.watchActions) });
  await page.addScriptTag({ content: `window.suite.menuLayout = (${createMenuLayout.toString()})(); window.disposeVideoMenu = (${installVideoMenu.toString()})(window.suite);` });
  return page;
}

async function show(page) {
  await page.locator('#trigger').click();
  await page.locator('[data-ytms-video-menu="1"]').waitFor();
}

async function visibleIds(page) {
  return page.evaluate(() => [...menuFixture.popup.querySelectorAll('[data-native-id], [data-ytms-menu-action]')]
    .filter(row => row.getClientRects().length && getComputedStyle(row).display !== 'none')
    .map(row => row.dataset.nativeId || row.dataset.ytmsMenuAction));
}

test('compatibility distinguishes an unchecked page, a non-video menu and a recognised video menu', async t => {
  const page = await open(t, { sheet: true });
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'not-checked');
  await page.evaluate(() => menuFixture.open());
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'not-applicable');
  assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
  await page.evaluate(() => menuFixture.dropdown.close());
  await show(page);
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'recognised');
  await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-start')));
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'not-checked');
});

test('compatibility waits only for an actual trusted menu attempt and reports no menu after its bounded deadline', async t => {
  const page = await open(t, { sheet: true });
  await page.evaluate(() => document.getElementById('trigger').removeEventListener('click', menuFixture.open));
  await page.locator('#trigger').click();
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'awaiting-menu');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-ytms-video-menu-compatibility') === 'no-menu');
  assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
  await page.evaluate(() => menuFixture.open());
  assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0, 'A late native event must not restart an expired attempt');
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'unsupported');
});

test('a partially stamped menu reports loading then recognised without periodic polling', async t => {
  const page = await open(t, { sheet: true });
  await page.evaluate(() => {
    const button = document.getElementById('trigger');
    button.removeEventListener('click', menuFixture.open);
    button.addEventListener('click', () => {
      menuFixture.dropdown.hidden = false;
      menuFixture.popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true }));
    });
  });
  await page.locator('#trigger').click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-ytms-video-menu-compatibility') === 'loading-menu');
  assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
  await page.evaluate(() => menuFixture.open());
  await page.locator('[data-ytms-video-menu="1"]').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'recognised');
});

test('a changed video-menu trigger wrapper reports unsupported rather than claiming the menu is not applicable', async t => {
  const page = await open(t, { sheet: true, modernTrigger: true });
  await page.evaluate(() => { document.querySelector('.ytLockupMetadataViewModelMenuButton').className = 'futureVideoMenuButton'; });
  await page.locator('#trigger').click();
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'unsupported');
  assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
  assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), true);
});

for (const sheet of [false, true]) {
  test(`unsupported ${sheet ? 'current' : 'legacy'} menu models remain entirely native and report compatibility failure`, async t => {
    const page = await open(t, { sheet });
    await page.evaluate(sheet => {
      const native = sheet ? menuFixture.popup.componentProps.data() : menuFixture.popup.polymerController.data;
      const future = sheet ? { content: { futureListViewModel: native.content.listViewModel } } : { futureItems: native.items };
      if (sheet) menuFixture.popup.componentProps = { data: () => future };
      else menuFixture.popup.polymerController.data = future;
    }, sheet);
    await page.locator('#trigger').click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-ytms-video-menu-compatibility') === 'unsupported');
    assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
    assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), true);
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
    await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['share']);
  });

  test(`partly recognised ${sheet ? 'current' : 'legacy'} model wrappers fail open instead of decorating only the known actions`, async t => {
    const page = await open(t, { sheet, bindingFault: 'unknown-model' });
    await page.locator('#trigger').click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-ytms-video-menu-compatibility') === 'unsupported');
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
    assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), true);
    assert.deepEqual(await page.evaluate(() => menuFixture.originals.map(row => row.style.display)), Array(9).fill(''));
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });

  test(`an unknown action within a recognised ${sheet ? 'current' : 'legacy'} layout retains its native handler`, async t => {
    const page = await open(t, { sheet, unknown: true });
    const before = await page.evaluate(() => JSON.stringify(menuFixture.items));
    await show(page);
    assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-compatibility'), 'recognised');
    assert.equal(await page.evaluate(() => JSON.stringify(menuFixture.items)), before);
    await page.getByRole('menuitem', { name: 'Unrecognised native action', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['unrecognised']);
  });

  test(`BlockTube-style actions remain native while the Suite customises the ${sheet ? 'current' : 'legacy'} menu`, async t => {
    const page = await open(t, { sheet, blockTube: true });
    const before = await page.evaluate(() => JSON.stringify(menuFixture.items));
    await show(page);
    assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-status'), 'ready');
    assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), false);
    assert.equal(await page.getByRole('menuitem', { name: 'Block Channel', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('menuitem', { name: 'Block Video', exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => JSON.stringify(menuFixture.items)), before);
    await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
    assert.equal(await page.getByRole('menuitem', { name: 'Filter channel uploads', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('menuitem', { name: 'Report', exact: true }).isVisible(), true);
    await page.getByRole('menuitem', { name: 'Back', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Block Channel', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['blockChannel']);
    await show(page);
    await page.getByRole('menuitem', { name: 'Block Video', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['blockChannel', 'blockVideo']);
  });

  test(`duplicate native Not interested actions still fail open in the ${sheet ? 'current' : 'legacy'} menu`, async t => {
    const page = await open(t, { sheet, duplicateNotInterested: true });
    await page.locator('#trigger').click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-ytms-video-menu-status') === 'duplicate-actions');
    assert.equal(await page.locator('[data-ytms-video-menu="1"]').count(), 0);
    assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), true);
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });
}

for (const [surface, cardTag, containerTag, route] of [
  ['History', 'yt-lockup-view-model', null, '/feed/history'],
  ['playlist videos', 'ytd-playlist-video-renderer', 'ytd-playlist-video-list-renderer', '/playlist?list=WL'],
  ['legacy queue rows', 'ytd-playlist-panel-video-renderer', 'ytd-playlist-panel-renderer', '/watch?v=aaaaaaaaaaa'],
  ['current queue rows', 'yt-playlist-panel-video-renderer', 'yt-playlist-panel-renderer', '/watch?v=aaaaaaaaaaa'],
  ['Search', 'ytd-video-renderer', null, '/results?search_query=fixture'],
  ['Subscriptions', 'yt-lockup-view-model', null, '/feed/subscriptions'],
  ['channel videos', 'ytd-grid-video-renderer', null, '/@fixture/videos'],
]) for (const sheet of [false, true]) {
  test(`channel tools are available on ${surface} without operating the native actions (${sheet ? 'current sheet' : 'legacy popup'})`, async t => {
    const page = await open(t, { cardTag, containerTag, route, sheet, nativeContract: true });
    await show(page);
    assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), false);
    await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Filter channel uploads', exact: true }).click();
    assert.equal(await page.evaluate(() => menuFixture.openedSettings[0].channelId), 'UCabcdefghijklmnopqrstuv');
    assert.deepEqual(await page.evaluate(() => menuFixture.openedContexts[0]),
      { cardId: 'card', videoId: 'bbbbbbbbbbb', connected: true });
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });
}

for (const sheet of [false, true]) {
  test(`playlist removal and movement stay native and outside Channel tools (${sheet ? 'current sheet' : 'legacy popup'})`, async t => {
    const page = await open(t, { sheet, cardTag: 'ytd-playlist-video-renderer', containerTag: 'ytd-playlist-video-list-renderer',
      route: '/playlist?list=WL', libraryActions: true, settings: { menuShowNotInterested: false, menuShowDontRecommend: false } });
    await show(page);
    for (const name of ['Remove native item', 'Move to top', 'Hide native record']) assert.equal(await page.getByRole('menuitem', { name, exact: true }).isVisible(), true);
    await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
    for (const name of ['Remove native item', 'Move to top', 'Hide native record']) assert.equal(await page.getByRole('menuitem', { name, exact: true }).isVisible(), false);
    await page.getByRole('menuitem', { name: 'Back', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Remove native item', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['remove']);
  });
  test(`queue menus without Add to queue require an exact native model and retain removal (${sheet ? 'current sheet' : 'legacy popup'})`, async t => {
    const page = await open(t, { sheet, cardTag: 'ytd-playlist-panel-video-renderer', containerTag: 'ytd-playlist-panel-renderer',
      noQueue: true, nativeBinding: true, libraryActions: true });
    await show(page);
    assert.equal(await page.getByRole('menuitem', { name: 'Remove native item', exact: true }).isVisible(), true);
    await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Filter channel uploads', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });
}

for (const sheet of [false,true]) for (const binding of ['component','row'])
test(`native queue ${binding} menu bindings apply Download visibility without an Add to queue action (${sheet?'current sheet':'legacy'})`,async t=>{
  const page=await open(t,{sheet,cardTag:'yt-playlist-panel-video-renderer',containerTag:'yt-playlist-panel-renderer',
    noQueue:true,nativeBinding:true,nativeContract:true,libraryActions:true});
  await page.evaluate(binding=>{
    const card=document.getElementById('card'),host=card.querySelector('ytd-menu-renderer');
    const data=host.polymerController.data;delete host.polymerController;
    if(binding==='component')host.componentProps={data:()=>data};
    else card.componentProps={data:()=>({videoId:'bbbbbbbbbbb',menu:{menuRenderer:data}})};
  },binding);
  await page.locator('#trigger').click();
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  assert.equal(await page.getByRole('menuitem',{name:'Download',exact:true}).isVisible(),false);
  assert.equal(await page.getByRole('menuitem',{name:'Remove native item',exact:true}).isVisible(),true);
  await page.getByRole('menuitem',{name:'Remove native item',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>menuFixture.nativeCalls),['remove']);
});

async function makeWatchMenuOwner(page,variant={}) {
  await page.evaluate(variant=>{
    const card=document.getElementById('card'),owner=card.closest('ytd-watch-flexy');
    owner.style.display='block';owner.setAttribute('video-id','bbbbbbbbbbb');
    card.querySelector('a').remove();
    for(const id of ['ccccccccccc','ddddddddddd']){const link=document.createElement('a');link.href='/watch?v='+id;link.textContent='Description link';card.append(link);}
    const player=document.createElement('div');player.id='movie_player';player.style.cssText='display:block;width:640px;height:360px';
    const video=document.createElement('video');video.className='html5-main-video';player.append(video);
    player.getVideoData=()=>({video_id:variant.playerId||'bbbbbbbbbbb'});owner.prepend(player);
  },variant);
}

for(const sheet of [false,true])test(`watch overflow Save Download Hype Report respects Download preference and retains unknown Hype (${sheet?'current sheet':'legacy'})`,async t=>{
  const page=await open(t,{sheet,cardTag:'ytd-watch-metadata',containerTag:'ytd-watch-flexy',route:'/watch?v=bbbbbbbbbbb',
    nativeBinding:true,nativeContract:true,watchActions:true});
  await makeWatchMenuOwner(page);
  await page.locator('#trigger').click();
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  assert.equal(await page.getByRole('menuitem',{name:'Download',exact:true}).isVisible(),false);
  assert.equal(await page.getByRole('menuitem',{name:'Save to playlist',exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('menuitem',{name:'Hype',exact:true}).isVisible(),true);
  await page.getByRole('menuitem',{name:'Hype',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>menuFixture.nativeCalls),['hype']);
});

test('legacy watch information menus honour enabled Download and its native handler',async t=>{
  const page=await open(t,{cardTag:'ytd-video-primary-info-renderer',containerTag:'ytd-watch-flexy',route:'/live/bbbbbbbbbbb',
    nativeBinding:true,nativeContract:true,watchActions:true,settings:{menuShowDownload:true}});
  await makeWatchMenuOwner(page);
  await show(page);
  await page.getByRole('menuitem',{name:'Download',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>menuFixture.nativeCalls),['download']);
});

for (const sheet of [false, true]) test(`floating watch menu honours Download with a zero-height owner (${sheet ? 'current sheet' : 'legacy'})`, async t => {
  const page = await open(t, { sheet, cardTag:'ytd-watch-metadata', containerTag:'ytd-watch-flexy', route:'/watch?v=bbbbbbbbbbb',
    nativeBinding:true, nativeContract:true, watchActions:true });
  await makeWatchMenuOwner(page);
  await page.evaluate(() => {
    const owner = document.querySelector('ytd-watch-flexy'), player = owner.querySelector('#movie_player');
    owner.style.height = '0px';
    const placeholder = document.createElement('div'); placeholder.id='ytsmp-player-placeholder'; placeholder.style.cssText='width:640px;height:360px'; owner.prepend(placeholder);
    document.body.append(player); document.body.classList.add('ytsmp-scroll-miniplayer-active');
  });
  await show(page);
  assert.equal(await page.getByRole('menuitem', { name:'Download', exact:true }).isVisible(), false);
});

for(const binding of ['current','decorative','retained-hidden','retained-zeroheight','wrong-owner','unmarked','ambiguous'])test(`watch overflow with a floated player requires ${binding} placeholder ownership`,async t=>{
  const page=await open(t,{sheet:true,cardTag:'ytd-watch-metadata',containerTag:'ytd-watch-flexy',route:'/watch?v=bbbbbbbbbbb',
    nativeBinding:true,nativeContract:true,watchActions:true});
  await makeWatchMenuOwner(page);
  await page.evaluate(binding=>{
    const owner=document.querySelector('ytd-watch-flexy'),player=owner.querySelector('#movie_player');
    const placeholder=document.createElement('div');placeholder.id='ytsmp-player-placeholder';placeholder.style.cssText='width:640px;height:360px';owner.prepend(placeholder);
    if(binding==='wrong-owner'){const retained=document.createElement('ytd-watch-flexy');owner.after(retained);retained.append(placeholder);}
    if(binding==='ambiguous'){const extra=placeholder.cloneNode();owner.append(extra);}
    if(binding==='decorative'){placeholder.setAttribute('aria-hidden','true');placeholder.style.visibility='hidden';}
    if(binding==='retained-hidden'){const retained=document.createElement('ytd-watch-flexy');retained.hidden=true;owner.before(retained);retained.append(placeholder.cloneNode());}
    if(binding==='retained-zeroheight'){const retained=placeholder.cloneNode();retained.style.height='0px';owner.append(retained);}
    document.body.append(player);
    if(binding!=='unmarked')document.body.classList.add('ytsmp-scroll-miniplayer-active');
  },binding);
  await page.locator('#trigger').click();
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  assert.equal(await page.getByRole('menuitem',{name:'Download',exact:true}).isVisible(),!['current','decorative','retained-hidden','retained-zeroheight'].includes(binding));
});

for(const fault of ['player','ambiguous-player','owner-id','card-id','missing-menu'])
test(`watch overflow remains native when its binding is ${fault}`,async t=>{
  const page=await open(t,{sheet:true,cardTag:'ytd-watch-metadata',containerTag:'ytd-watch-flexy',route:'/watch?v=bbbbbbbbbbb',
    nativeBinding:fault!=='missing-menu',nativeContract:true,watchActions:true});
  await makeWatchMenuOwner(page,{playerId:fault==='player'?'ccccccccccc':undefined});
  await page.evaluate(fault=>{
    const card=document.getElementById('card'),owner=card.closest('ytd-watch-flexy');
    if(fault==='owner-id')owner.setAttribute('video-id','ccccccccccc');
    if(fault==='card-id')card.componentProps={data:()=>({videoId:'ccccccccccc'})};
    if(fault==='ambiguous-player'){
      const duplicate=owner.querySelector('#movie_player').cloneNode(true);
      duplicate.getVideoData=()=>({video_id:'bbbbbbbbbbb'});owner.prepend(duplicate);
    }
  },fault);
  await page.locator('#trigger').click();
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  assert.equal(await page.locator('[data-ytms-menu-action]').count(),0);
  assert.equal(await page.getByRole('menuitem',{name:'Download',exact:true}).isVisible(),true);
});

for(const hidden of ['hidden','inert','opacity','scale'])test(`watch menu discovery rejects an owner retained as ${hidden}`,async t=>{
  const page=await open(t,{sheet:true,cardTag:'ytd-watch-metadata',containerTag:'ytd-watch-flexy',route:'/watch?v=bbbbbbbbbbb',
    nativeBinding:true,nativeContract:true,watchActions:true});
  await makeWatchMenuOwner(page);
  await page.evaluate(hidden=>{
    document.getElementById('trigger').addEventListener('click',()=>{
      const owner=document.querySelector('ytd-watch-flexy');
      if(hidden==='hidden')owner.hidden=true;
      if(hidden==='inert')owner.inert=true;
      if(hidden==='opacity')owner.style.opacity='0';
      if(hidden==='scale')owner.style.transform='scale(0)';
    },{capture:true});
  },hidden);
  await page.locator('#trigger').click();
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  assert.equal(await page.locator('[data-ytms-menu-action]').count(),0);
  assert.equal(await page.getByRole('menuitem',{name:'Download',exact:true}).isVisible(),true);
});

for(const mismatch of [false,true])test(`current queue row and host models ${mismatch?'reject conflicts':'accept equivalent clones'}`,async t=>{
  const page=await open(t,{sheet:true,cardTag:'yt-playlist-panel-video-renderer',containerTag:'yt-playlist-panel-renderer',
    noQueue:true,nativeBinding:true,nativeContract:true,libraryActions:true});
  await page.evaluate(mismatch=>{
    const card=document.getElementById('card'),model=structuredClone(card.querySelector('ytd-menu-renderer').polymerController.data);
    if(mismatch)model.items[0].retainedCommand=true;
    card.componentProps={data:()=>({videoId:'bbbbbbbbbbb',menu:{menuRenderer:model}})};
  },mismatch);
  await page.locator('#trigger').click();
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  assert.equal(await page.getByRole('menuitem',{name:'Download',exact:true}).isVisible(),mismatch);
  assert.equal(await page.getByRole('menuitem',{name:'Remove native item',exact:true}).isVisible(),true);
});

for (const fault of ['mismatch', 'oversized', 'unknown-model']) {
  test(`menus without a queue action fail open for a ${fault} native model`, async t => {
    const page = await open(t, { cardTag: 'ytd-playlist-panel-video-renderer', containerTag: 'ytd-playlist-panel-renderer',
      noQueue: true, nativeBinding: true, bindingFault: fault, libraryActions: true });
    await page.locator('#trigger').click();
    await page.waitForFunction(() => ['no-queue-action', 'row-binding'].includes(document.documentElement.getAttribute('data-ytms-video-menu-status')));
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
    assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), true);
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });
}

for (const [contentType, modelVideo] of [['LOCKUP_CONTENT_TYPE_PLAYLIST', null], ['LOCKUP_CONTENT_TYPE_VIDEO', 'ccccccccccc']]) {
  test(`a non-video or recycled mismatched lockup is not mistaken for a single-video menu (${contentType})`, async t => {
    const page = await open(t, { cardTag: 'yt-lockup-view-model', contentType, modelVideo });
    await page.locator('#trigger').click();
    assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-status'), 'card-identity');
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
  });
}

for (const sheet of [false, true]) {
  test(`observed native Download host and BOOKMARK_BORDER/HIDE actions retain handlers and obey preferences (${sheet ? 'current sheet' : 'legacy popup'})`, async t => {
    const page = await open(t, { sheet, nativeContract: true, settings: {
      menuShowNotInterested: false, menuItemOrder: ['savePlaylist', 'playNext', 'addToQueue'],
    } });
    await show(page);
    assert.deepEqual(await visibleIds(page), ['savePlaylist', 'playNext', 'addToQueue', 'watchLater', 'share', 'channelTools']);
    if (sheet) {
      assert.equal(await page.locator('yt-download-list-item-view-model').evaluate(row => getComputedStyle(row).display), 'none');
      assert.equal(await page.locator('yt-download-list-item-view-model yt-list-item-view-model').count(), 1);
      assert.deepEqual(await page.evaluate(() => Object.keys(menuFixture.items[4].downloadListItemViewModel)), ['rendererContext']);
    }
    await page.getByRole('menuitem', { name: 'Save to playlist', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['savePlaylist']);
  });
}

test('observed Download wrapper keeps its original button handler when Download is enabled', async t => {
  const page = await open(t, { sheet: true, nativeContract: true, settings: { menuShowDownload: true } });
  await show(page);
  await page.getByRole('menuitem', { name: 'Download', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['download']);
});

test('unknown native wrapper types fail open rather than flattening or replacing their rows', async t => {
  const page = await open(t, { sheet: true, nativeContract: true, unknownWrapper: true });
  await page.locator('#trigger').click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-ytms-video-menu-status') === 'row-parent');
  assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
  assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), true);
});

for (const [name, dark, modern, legacy, parent, expected] of [
  ['modern dark theme with no legacy token', true, '#f1f1f1', '', '#000000', 'rgb(241, 241, 241)'],
  ['modern light theme with no legacy token', false, '#0f0f0f', '', '#ffffff', 'rgb(15, 15, 15)'],
  ['legacy dark theme without the modern token', true, '', '#e6e6e6', '#000000', 'rgb(230, 230, 230)'],
  ['legacy light theme without the modern token', false, '', '#1f1f1f', '#ffffff', 'rgb(31, 31, 31)'],
  ['modern token takes precedence over a stale legacy token', true, '#f1f1f1', '#000000', '#000000', 'rgb(241, 241, 241)'],
  ['both tokens absent preserve inherited theme colour', false, '', '', '#224466', 'rgb(34, 68, 102)'],
]) {
  test(`custom menu text and SVG use the native colour in ${name}`, async t => {
    const page = await open(t, { sheet: true, nativeContract: true });
    await page.evaluate(({ dark, modern, legacy, parent }) => {
      const root = document.documentElement;
      root.toggleAttribute('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
      if (modern) root.style.setProperty('--yt-sys-color-baseline--text-primary', modern);
      if (legacy) root.style.setProperty('--yt-spec-text-primary', legacy);
      menuFixture.popup.style.color = parent;
    }, { dark, modern, legacy, parent });
    await show(page);
    const actual = await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).evaluate(button => ({
      text: getComputedStyle(button).color,
      icon: getComputedStyle(button.querySelector('svg')).fill,
    }));
    assert.deepEqual(actual, { text: expected, icon: expected });
  });
}

test('current sheet custom labels share the native 52px text column and 40px row height', async t => {
  const page = await open(t, { sheet: true, nativeContract: true });
  await show(page);
  const group = page.getByRole('menuitem', { name: 'Channel tools', exact: true });
  const geometry = await group.evaluate(button => {
    const row = button.getBoundingClientRect();
    const label = button.querySelector('span').getBoundingClientRect();
    return { left: label.left - row.left, height: row.height, lineHeight: getComputedStyle(button).lineHeight };
  });
  assert.deepEqual(geometry, { left: 52, height: 40, lineHeight: '20px' });
  await group.click();
  for (const name of ['Back', 'Filter channel uploads']) {
    const offset = await page.getByRole('menuitem', { name, exact: true }).evaluate(button =>
      button.querySelector('span').getBoundingClientRect().left - button.getBoundingClientRect().left);
    assert.equal(offset, 52, name);
  }
});

test('legacy popup custom labels share its measured native 52px text column and 36px row height', async t => {
  const page = await open(t);
  await show(page);
  const geometry = await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).evaluate(button => ({
    left: button.querySelector('span').getBoundingClientRect().left - button.getBoundingClientRect().left,
    height: button.getBoundingClientRect().height,
    lineHeight: getComputedStyle(button).lineHeight,
  }));
  assert.deepEqual(geometry, { left: 52, height: 36, lineHeight: '20px' });
});

test('legacy popup receives one settled native refit rather than retaining an intermediate tiny size', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    let settled = false;
    menuFixture.dropdown.refit = () => {
      menuFixture.refits++;
      menuFixture.popup.style.maxHeight = settled ? '' : '56px';
      menuFixture.popup.style.maxWidth = settled ? '' : '157px';
      if (!settled) requestAnimationFrame(() => { settled = true; });
    };
  });
  await show(page);
  await page.waitForFunction(() => menuFixture.refits === 2 && menuFixture.popup.style.maxHeight === '' && menuFixture.popup.style.maxWidth === '');
});

test('disposing an open submenu cancels the pending settled refit', async t => {
  const page = await open(t);
  await show(page);
  await page.evaluate(() => {
    const frames = new Map(); let next = 0;
    window.refitFrames = frames;
    window.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
    window.cancelAnimationFrame = id => frames.delete(id);
  });
  await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
  assert.equal(await page.evaluate(() => refitFrames.size), 1);
  await page.evaluate(() => disposeVideoMenu());
  assert.equal(await page.evaluate(() => refitFrames.size), 0);
});

for (const sheet of [false, true]) {
  for (const [target, selector] of [['button', '#trigger'], ['SVG path', '#trigger svg path'], ['touch feedback', '#trigger .ytSpecTouchFeedbackShapeFill']]) {
    test(`real lockup More actions wrapper accepts ${target} activation (${sheet ? 'current sheet' : 'legacy popup'})`, async t => {
      const page = await open(t, { sheet, modernTrigger: true });
      await page.locator(selector).click();
      await page.locator('[data-ytms-video-menu="1"]').waitFor();
      assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-status'), 'ready');
      assert.deepEqual(await visibleIds(page), ['playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'share', 'notInterested', 'channelTools']);
      await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Filter channel uploads', exact: true }).click();
      assert.equal(await page.evaluate(() => menuFixture.openedSettings.length), 1);
      assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
    });
  }
}

test('other buttons inside modern cards do not gain menu permissions from a generic button wrapper or English label', async t => {
  const page = await open(t, { sheet: true, modernTrigger: true });
  await page.locator('.ytLockupMetadataViewModelMenuButton').evaluate(element => element.className = 'unrecognised-card-button');
  await page.locator('#trigger').click();
  await page.waitForTimeout(80);
  assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-status'), 'unsupported-trigger');
  assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
  assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), true);
});

for (const sheet of [false, true]) {
  const design = sheet ? 'modern' : 'legacy';
  test(`${design}: hides Download by default, groups channel actions at the bottom and preserves native nodes and handlers`, async t => {
    const page = await open(t, { sheet });
    await show(page);
    assert.deepEqual(await visibleIds(page), ['playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'share', 'notInterested', 'channelTools']);
    assert.equal(await page.evaluate(() => menuFixture.nativeCalls.length), 0);
    await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
    assert.deepEqual(await visibleIds(page), ['back', 'channelAge', 'dontRecommend', 'report']);
    assert.equal(await page.evaluate(() => menuFixture.originals.every(row => row.isConnected)), true);
    await page.getByRole('menuitem', { name: 'Report', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['report']);
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
  });

  test(`${design}: flat mode, individual visibility and ordered actions preserve unknown native action slots`, async t => {
    const page = await open(t, { sheet, unknown: true, settings: {
      menuGroupChannelTools: false, menuShowDownload: true, menuShowNotInterested: false, menuShowReport: false,
      menuItemOrder: ['share', 'playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'download', 'notInterested', 'dontRecommend', 'report', 'channelAge', 'channelTools'],
    } });
    await show(page);
    assert.deepEqual(await visibleIds(page), ['share', 'playNext', 'addToQueue', 'unrecognised', 'watchLater', 'savePlaylist', 'download', 'dontRecommend', 'channelAge']);
    await page.getByRole('menuitem', { name: 'Filter channel uploads', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => menuFixture.openedSettings), [{ channelId: 'UCabcdefghijklmnopqrstuv', name: 'News channel' }]);
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });

  test(`${design}: explicitly rearranged channel actions retain their saved submenu order`, async t => {
    const page = await open(t, { sheet, settings: { menuItemOrder: ['report', 'dontRecommend', 'channelAge'] } });
    await show(page);
    await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
    assert.deepEqual(await visibleIds(page), ['back', 'report', 'dontRecommend', 'channelAge']);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]').dataset.nativeId), 'report');
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });
}

test('submenu supports Right/Left, Escape, arrow focus, Home and End without activating native moderation actions', async t => {
  const page = await open(t, { sheet: true });
  await show(page);
  const group = page.getByRole('menuitem', { name: 'Channel tools', exact: true });
  await page.getByRole('menuitem', { name: 'Play next in queue', exact: true }).focus();
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelTools');
  await group.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'back');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelAge');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]').dataset.nativeId), 'dontRecommend');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]').dataset.nativeId), 'report');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'back');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelTools');
  await group.press('Enter'); await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelTools');
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
});

for (const sheet of [false, true]) {
  const design = sheet ? 'modern' : 'legacy';
  test(`${design}: pointer opening clears the native Add to queue autofocus without focusing a row`, async t => {
    const page = await open(t, { sheet, nativeAutofocus: 'addToQueue' });
    await show(page);
    assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true);
    assert.equal(await page.locator('[role="menuitem"]:focus-visible').count(), 0);
    const nativeQueue = page.getByRole('menuitem', { name: 'Add to queue', exact: true });
    assert.equal(await nativeQueue.evaluate(row => getComputedStyle(row).backgroundColor), 'rgba(0, 0, 0, 0)');
    await nativeQueue.hover();
    assert.equal(await nativeQueue.evaluate(row => getComputedStyle(row).backgroundColor), 'rgb(65, 65, 65)');
    assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true,
      'Pointer hovering must remain visual and must not claim keyboard focus');
    await page.mouse.move(0, 0);
    await page.evaluate(() => menuFixture.focusNative('addToQueue'));
    assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true,
      'A late native autofocus must not highlight Add to queue after pointer opening');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'playNext');
    assert.equal(await page.locator('[role="menuitem"]:focus-visible').count(), 1);
    await page.getByRole('menuitem', { name: 'Share', exact: true }).hover();
    assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true,
      'Moving back to pointer input must clear the previous keyboard row selection');
    assert.equal(await page.locator('[role="menuitem"]:focus-visible').count(), 0);
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });

  for (const key of ['Enter', 'Space', 'ArrowDown']) {
    test(`${design}: ${key} opening focuses the first visible action rather than the native queue row`, async t => {
      const page = await open(t, { sheet, nativeAutofocus: 'addToQueue', settings: { menuItemOrder: ['download', 'share'] } });
      await page.locator('#trigger').focus();
      await page.keyboard.press(key);
      await page.locator('[data-ytms-video-menu="1"]').waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'share');
      assert.equal(await page.locator('[role="menuitem"]:focus-visible').count(), 1);
      await page.evaluate(() => menuFixture.focusNative('addToQueue'));
      assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'share',
        'Late native autofocus must not replace the keyboard opening selection');
      assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
    });
  }

  test(`${design}: moving from a keyboard-open menu to the pointer clears focus and executes the clicked native action once`, async t => {
    const page = await open(t, { sheet, nativeAutofocus: 'addToQueue' });
    await page.locator('#trigger').focus();
    await page.keyboard.press('ArrowDown');
    await page.locator('[data-ytms-video-menu="1"]').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'playNext');
    const share = page.getByRole('menuitem', { name: 'Share', exact: true });
    await share.hover();
    assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true);
    assert.equal(await page.locator('[role="menuitem"]:focus-visible').count(), 0);
    await share.click();
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['share']);
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
  });

  test(`${design}: keyboard opening selects the first native action after its initial layout settles`, async t => {
    const page = await open(t, { sheet, lateNativeLayout: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator('#trigger').focus();
      await page.keyboard.press('ArrowDown');
      await page.locator('[data-ytms-video-menu="1"]').waitFor();
      await page.waitForFunction(() => menuFixture.layoutRefits >= 2 &&
        menuFixture.originals.every(row => !row.hidden));
      assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'playNext');
      assert.equal(await page.locator('[role="menuitem"]:focus-visible').count(), 1);
      assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
      await page.evaluate(() => menuFixture.dropdown.close());
    }
  });

  test(`${design}: ArrowUp from the neutral popup starts at the last row and ArrowDown wraps to the first`, async t => {
    const page = await open(t, { sheet });
    await show(page);
    // Give the old implementation a focusable container too, so this specifically
    // catches its -1 index arithmetic rather than the opening-focus behaviour.
    await page.evaluate(() => { menuFixture.popup.tabIndex = -1; menuFixture.popup.focus(); });
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelTools');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'playNext');
  });

  for (const key of ['Enter', 'Space']) {
    test(`${design}: neutral ${key} selects the first action without executing a stale native default`, async t => {
      const page = await open(t, { sheet, nativeAutofocus: 'addToQueue' });
      await show(page);
      await page.evaluate(() => menuFixture.popup.addEventListener('keydown', event => {
        if (event.target === menuFixture.popup && ['Enter', ' '].includes(event.key)) {
          menuFixture.nativeCalls.push('stale-native-default');
        }
      }));
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'playNext');
      assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
      if (sheet) {
        await page.keyboard.press(key);
        assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['playNext']);
      }
    });
  }

  test(`${design}: keyboard navigation skips native hidden, inert and unfocusable action rows`, async t => {
    const page = await open(t, { sheet });
    await show(page);
    await page.evaluate(sheet => {
      const row = id => menuFixture.popup.querySelector(`[data-native-id="${id}"]`);
      row('playNext').hidden = true;
      row('addToQueue').setAttribute('aria-hidden', 'true');
      row('watchLater').style.visibility = 'hidden';
      row('savePlaylist').inert = true;
      if (sheet) row('share').querySelector('button').disabled = true;
      else { row('share').removeAttribute('tabindex'); row('share').setAttribute('role', 'presentation'); }
      menuFixture.popup.tabIndex = -1; menuFixture.popup.focus();
    }, sheet);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'notInterested');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelTools');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'notInterested');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelTools');
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });

  test(`${design}: pointer submenu transitions stay neutral while keyboard transitions retain visible focus`, async t => {
    const page = await open(t, { sheet });
    await show(page);
    await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true);
    assert.equal(await page.locator('[role="menuitem"]:focus-visible').count(), 0);
    await page.getByRole('menuitem', { name: 'Back', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'back');
    assert.equal(await page.locator('[data-ytms-menu-action="back"]:focus-visible').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelTools');
    assert.equal(await page.locator('[data-ytms-menu-action="channelTools"]:focus-visible').count(), 1);
    assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
  });

  test(`${design}: close, reuse and disposal restore native popup tabindex and remove focus ownership`, async t => {
    const page = await open(t, { sheet });
    for (const original of [null, '4']) {
      await page.evaluate(value => {
        if (value === null) menuFixture.popup.removeAttribute('tabindex');
        else menuFixture.popup.setAttribute('tabindex', value);
      }, original);
      await show(page);
      assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true);
      await page.evaluate(() => menuFixture.dropdown.close());
      assert.equal(await page.evaluate(() => menuFixture.popup.getAttribute('tabindex')), original);
      assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
    }
    await show(page);
    await page.evaluate(() => disposeVideoMenu());
    assert.equal(await page.evaluate(() => menuFixture.popup.getAttribute('tabindex')), '4');
    await page.evaluate(() => menuFixture.focusNative('addToQueue'));
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'addToQueue',
      'Disposal must release the popup focusin guard');
  });
}

test('modern native hover: stale Add to queue styling does not compete with the actually hovered action', async t => {
  const page = await open(t, { sheet: true, nativeHover: true, nativeAutofocus: 'addToQueue' });
  await show(page);
  const queueLayout = page.locator('[data-native-id="addToQueue"] .ytListItemViewModelLayoutWrapper');
  const interestedLayout = page.locator('[data-native-id="notInterested"] .ytListItemViewModelLayoutWrapper');
  await page.getByRole('menuitem', { name: 'Not interested', exact: true }).hover();
  // Row movement can retain this native mouseover class without actual hover.
  // Do not remove its class or alter the native action/ARIA to correct styling.
  await queueLayout.evaluate(layout => layout.classList.add('ytListItemViewModelHovered'));
  assert.equal(await queueLayout.evaluate(layout => layout.matches(':hover')), false);
  assert.equal(await queueLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await interestedLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgb(65, 65, 65)');
  assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true);
  assert.equal(await queueLayout.evaluate(layout => layout.classList.contains('ytListItemViewModelHovered')), true);
  await page.mouse.move(0, 0);
  assert.equal(await interestedLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await queueLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.getByRole('menuitem', { name: 'Not interested', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['notInterested']);
});

test('modern native hover: descendant keyboard focus retains native row styling while stale unfocused rows stay neutral', async t => {
  const page = await open(t, { sheet: true, nativeHover: true });
  await show(page);
  await page.mouse.move(0, 0);
  const queueLayout = page.locator('[data-native-id="addToQueue"] .ytListItemViewModelLayoutWrapper');
  await queueLayout.evaluate(layout => layout.classList.add('ytListItemViewModelHovered'));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'addToQueue');
  assert.equal(await queueLayout.evaluate(layout => layout.matches(':hover')), false);
  assert.equal(await queueLayout.evaluate(layout => layout.matches(':focus-within')), true);
  assert.equal(await queueLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgb(65, 65, 65)');
  assert.equal(await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).evaluate(button => button.matches(':focus-visible')), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'watchLater');
  assert.equal(await queueLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('[data-native-id="watchLater"]').evaluate(row => getComputedStyle(row).backgroundColor), 'rgb(65, 65, 65)');
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
});

test('modern native hover: channel tools and Back keep real hover without restoring stale main-menu backgrounds', async t => {
  const page = await open(t, { sheet: true, nativeHover: true });
  await show(page);
  const queueLayout = page.locator('[data-native-id="addToQueue"] .ytListItemViewModelLayoutWrapper');
  await queueLayout.evaluate(layout => layout.classList.add('ytListItemViewModelHovered'));
  await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
  const dontRecommendLayout = page.locator('[data-native-id="dontRecommend"] .ytListItemViewModelLayoutWrapper');
  await page.getByRole('menuitem', { name: 'Report', exact: true }).hover();
  await dontRecommendLayout.evaluate(layout => layout.classList.add('ytListItemViewModelHovered'));
  assert.equal(await dontRecommendLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('[data-native-id="report"] .ytListItemViewModelLayoutWrapper').evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgb(65, 65, 65)');
  await page.getByRole('menuitem', { name: 'Back', exact: true }).click();
  assert.equal(await queueLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await queueLayout.evaluate(layout => layout.classList.contains('ytListItemViewModelHovered')), true);
  assert.equal(await page.evaluate(() => document.activeElement === menuFixture.popup), true);
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
});

test('modern native hover: normalisation is scoped to managed menus and released on close or disposal', async t => {
  const page = await open(t, { sheet: true, nativeHover: true });
  await show(page);
  await page.mouse.move(0, 0);
  const queueLayout = page.locator('yt-sheet-view-model[data-ytms-video-menu="1"] [data-native-id="addToQueue"] .ytListItemViewModelLayoutWrapper');
  await queueLayout.evaluate(layout => {
    layout.classList.add('ytListItemViewModelHovered');
    const unmanaged = document.createElement('yt-sheet-view-model');
    unmanaged.id = 'unmanaged-menu';
    unmanaged.style.cssText = 'position:fixed;left:10px;top:600px';
    unmanaged.append(layout.closest('[data-native-id]').cloneNode(true));
    document.body.append(unmanaged);
  });
  assert.equal(await queueLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('#unmanaged-menu .ytListItemViewModelLayoutWrapper').evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgb(65, 65, 65)');
  await page.evaluate(() => menuFixture.dropdown.close());
  assert.equal(await page.evaluate(() => menuFixture.popup.hasAttribute('data-ytms-video-menu')), false);
  assert.equal(await page.evaluate(() => getComputedStyle(menuFixture.popup.querySelector('[data-native-id="addToQueue"] .ytListItemViewModelLayoutWrapper')).backgroundColor), 'rgb(65, 65, 65)');
  await show(page);
  await page.mouse.move(0, 0);
  await queueLayout.evaluate(layout => layout.classList.add('ytListItemViewModelHovered'));
  assert.equal(await queueLayout.evaluate(layout => getComputedStyle(layout).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.evaluate(() => disposeVideoMenu());
  assert.equal(await page.evaluate(() => menuFixture.popup.hasAttribute('data-ytms-video-menu')), false);
  assert.equal(await page.evaluate(() => getComputedStyle(menuFixture.popup.querySelector('[data-native-id="addToQueue"] .ytListItemViewModelLayoutWrapper')).backgroundColor), 'rgb(65, 65, 65)');
  await page.locator('yt-sheet-view-model:not(#unmanaged-menu)').getByRole('menuitem', { name: 'Add to queue', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['addToQueue']);
});

test('modern presentation wrappers do not receive keyboard focus instead of their native button', async t => {
  const page = await open(t, { sheet: true, presentationRows: true });
  await show(page);
  await page.evaluate(() => { menuFixture.popup.tabIndex = -1; menuFixture.popup.focus(); });
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await page.evaluate(() => ({ tag: document.activeElement.localName,
    id: document.activeElement.closest('[data-native-id]')?.dataset.nativeId })), { tag: 'button', id: 'playNext' });
});

test('aria-disabled explanatory channel actions remain keyboard discoverable but cannot activate', async t => {
  const page = await open(t, { sheet: true, missingChannel: true, settings: { menuGroupChannelTools: false } });
  await show(page);
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.ytmsMenuAction), 'channelAge');
  assert.match(await page.evaluate(() => document.activeElement.textContent), /Channel ID unavailable/);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => menuFixture.openedSettings), []);
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
});

for (const key of ['Enter', 'Space']) test(`modern native ${key} activation still executes the original action exactly once`, async t => {
  const page = await open(t, { sheet: true, settings: { menuItemOrder: ['share'] } });
  await show(page);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.closest('[data-native-id]')?.dataset.nativeId), 'share');
  await page.keyboard.press(key);
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), ['share']);
  assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
});

test('missing stable channel ID disables only the age action and explains manual settings', async t => {
  const page = await open(t, { missingChannel: true, settings: { menuGroupChannelTools: false } });
  await show(page);
  const age = page.getByRole('menuitem', { name: /Filter channel uploads/ });
  assert.equal(await age.getAttribute('aria-disabled'), 'true');
  await age.click({ force: true });
  assert.deepEqual(await page.evaluate(() => menuFixture.openedSettings), []);
  assert.match(await age.textContent(), /add it manually in Channels settings/);
});

test('all optional channel entries can be hidden without leaving an empty submenu', async t => {
  const page = await open(t, { settings: { menuShowAgeLimit: false, menuShowDontRecommend: false, menuShowReport: false } });
  await show(page);
  assert.deepEqual(await visibleIds(page), ['playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'share', 'notInterested']);
  assert.equal(await page.getByRole('menuitem', { name: 'Channel tools' }).count(), 0);
});

test('wrong-card endpoints, missing queue commands, duplicated recognised actions and synthetic triggers fail open', async t => {
  for (const [options, reason] of [[{ wrongVideo: true }, 'queue-target-mismatch'], [{ unsupported: true }, 'no-queue-action'], [{ ambiguous: true }, 'duplicate-actions'], [{}, 'missing-trigger']]) {
    const page = await open(t, options);
    if (Object.keys(options).length) await page.locator('#trigger').click();
    else await page.evaluate(() => document.getElementById('trigger').click());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-ytms-video-menu-status'), reason);
    assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), true);
  }
});

test('outside dismissal, navigation and disposal restore original rows, styling and ordering without polling', async t => {
  const page = await open(t, { settings: { menuItemOrder: ['share', 'download', 'report'] } });
  for (const action of ['outside', 'navigate', 'dispose']) {
    await show(page);
    await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
    if (action === 'outside') await page.locator('#outside').click();
    else await page.evaluate(action => action === 'navigate' ? window.dispatchEvent(new Event('yt-navigate-start')) : disposeVideoMenu(), action);
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
    assert.equal(await page.evaluate(() => menuFixture.originals.every(row => row.style.display === '' || row.style.display === 'block')), true);
    assert.deepEqual(await page.evaluate(() => [...menuFixture.originals[0].parentElement.children].map(row => row.dataset.nativeId)),
      ['playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'download', 'share', 'notInterested', 'dontRecommend', 'report']);
  }
});

test('submenu remains within a narrow viewport and asks the native dropdown to refit', async t => {
  const page = await open(t, { sheet: true, narrow: true });
  await show(page);
  await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).click();
  const bounds = await page.locator('tp-yt-iron-dropdown').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
  assert.ok(await page.evaluate(() => menuFixture.refits >= 2));
});

test('late native row stamping and popup reuse get one set of controls without modifying source models', async t => {
  const page = await open(t, { sheet: true, delayed: true });
  for (let index = 0; index < 3; index++) {
    await show(page);
    assert.equal(await page.locator('[data-ytms-menu-action="channelTools"]').count(), 1);
    assert.deepEqual(await visibleIds(page), ['playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'share', 'notInterested', 'channelTools']);
    assert.equal(await page.evaluate(() => menuFixture.items.length), 9);
    await page.evaluate(() => menuFixture.dropdown.close());
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
  }
});

test('dismissal before delayed stamping cancels the bounded observer and cannot decorate a closed menu', async t => {
  const page = await open(t, { delayed: true });
  await page.locator('#trigger').click();
  await page.evaluate(() => menuFixture.dropdown.close());
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
  assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
});

test('cached modern popup is discovered from a trusted trigger without a repeated popup-opened event, including delayed stamps', async t => {
  const page = await open(t, { sheet: true, modernTrigger: true, eventless: true, delayed: true });
  for (let index = 0; index < 2; index++) {
    await show(page);
    assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), false);
    assert.equal(await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).isVisible(), true);
    await page.evaluate(() => menuFixture.dropdown.close());
  }
});

test('automatic synthetic clicks outside an open menu do not remove its controls or restore hidden actions', async t => {
  const page = await open(t);
  await show(page);
  await page.evaluate(() => document.getElementById('outside').click());
  assert.equal(await page.getByRole('menuitem', { name: 'Download', exact: true }).isVisible(), false);
  assert.equal(await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).isVisible(), true);
  await page.locator('#outside').click();
  assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
});

async function addCachedPopup(page, mode) {
  await page.evaluate(mode => {
    menuFixture.open();
    menuFixture.dropdown.hidden = true;
    const dropdown = document.createElement('tp-yt-iron-dropdown');
    dropdown.style.cssText = 'display:block!important;position:fixed;left:350px;top:70px;width:280px;background:#272727';
    const clone = menuFixture.popup.cloneNode(true);
    clone.setAttribute('data-cloned-popup', '1');
    const data = structuredClone(menuFixture.popup.componentProps.data());
    if (mode === 'wrong') {
      const action = data.content.listViewModel.listItems[1].listItemViewModel.rendererContext.commandContext.onTap.innertubeCommand.signalServiceEndpoint.actions[0].addToPlaylistCommand;
      action.videoId = 'ccccccccccc'; action.videoIds = ['ccccccccccc'];
    }
    clone.componentProps = { data: () => data };
    dropdown.append(clone); document.body.append(dropdown);
    if (mode === 'hidden') dropdown.hidden = true;
    if (mode === 'aria-hidden') dropdown.setAttribute('aria-hidden', 'true');
  }, mode);
}

test('eventless discovery ignores explicitly hidden and wrong-video cached sheets without altering them', async t => {
  for (const mode of ['hidden', 'aria-hidden', 'wrong']) {
    const page = await open(t, { sheet: true, modernTrigger: true, eventless: true });
    await addCachedPopup(page, mode);
    await show(page);
    assert.equal(await page.locator('[data-cloned-popup]').getAttribute('data-ytms-video-menu'), null);
    assert.equal(await page.locator('[data-ytms-video-menu="1"]').count(), 1);
  }
});

for (const mode of ['opacity', 'scale', 'scaleY', 'inert']) test(`eventless Download filtering ignores a ${mode} retained popup`, async t => {
  const page = await open(t, { sheet:true, modernTrigger:true, eventless:true });
  await addCachedPopup(page, 'matching');
  await page.locator('[data-cloned-popup]').evaluate((popup, mode) => {
    const parent = popup.parentElement;
    if (mode === 'opacity') parent.style.opacity = '0';
    if (mode === 'scale') parent.style.transform = 'scale(0)';
    if (mode === 'scaleY') parent.style.transform = 'scaleY(0)';
    if (mode === 'inert') parent.inert = true;
  }, mode);
  await show(page);
  assert.equal(await page.locator('[data-cloned-popup]').getAttribute('data-ytms-video-menu'), null);
  assert.equal(await page.locator('[data-ytms-video-menu="1"]').count(), 1);
  assert.equal(await page.locator('[data-ytms-video-menu="1"] [data-native-id="download"]').isVisible(), false);
});

test('eventless discovery fails open when two visible native sheets match the selected video', async t => {
  const page = await open(t, { sheet: true, modernTrigger: true, eventless: true });
  await addCachedPopup(page, 'matching');
  await page.locator('#trigger').click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-ytms-video-menu-status') === 'ambiguous-popup');
  assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls), []);
});

test('pending eventless discovery cancels on outside click, new trigger, navigation, pagehide and disposal before delayed stamping', async t => {
  for (const action of ['outside', 'new-trigger', 'navigation', 'pagehide', 'dispose']) {
    const page = await open(t, { sheet: true, modernTrigger: true, eventless: true, delayed: true });
    await page.locator('#trigger').click();
    if (action === 'outside') await page.locator('#outside').click();
    else if (action === 'new-trigger') {
      await page.evaluate(() => {
        const card = document.getElementById('card').cloneNode(true);
        card.id = 'other-card'; card.querySelector('a').href = '/watch?v=ccccccccccc';
        card.querySelector('#trigger').id = 'other-trigger'; document.body.append(card);
      });
      await page.locator('#other-trigger').click();
    }
    else await page.evaluate(action => action === 'dispose' ? disposeVideoMenu() :
      window.dispatchEvent(new Event(action === 'navigation' ? 'yt-navigate-start' : 'pagehide')), action);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
    assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
  }
});

test('eventless popup observation expires before stamps arriving after its bounded deadline', async t => {
  const page = await open(t, { sheet: true, modernTrigger: true, eventless: true, delayed: true, delayMs: 1700 });
  await page.locator('#trigger').click();
  await page.waitForTimeout(1850);
  assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
  assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
});

test('closing an unrelated old sheet inside the shared popup container does not cancel the newly selected menu', async t => {
  const page = await open(t, { sheet: true, modernTrigger: true, eventless: true });
  await addCachedPopup(page, 'wrong');
  await page.evaluate(() => {
    const container = document.createElement('ytd-popup-container'); document.body.append(container);
    const old = document.querySelector('[data-cloned-popup]').closest('tp-yt-iron-dropdown');
    container.append(old, menuFixture.dropdown);
    menuFixture.delayNext = true;
    document.getElementById('trigger').addEventListener('click', () => setTimeout(() => {
      old.hidden = true;
      old.dispatchEvent(new CustomEvent('iron-overlay-closed', { bubbles: true }));
    }, 60));
  });
  await show(page);
  assert.equal(await page.getByRole('menuitem', { name: 'Channel tools', exact: true }).isVisible(), true);
  assert.equal(await page.locator('[data-cloned-popup]').getAttribute('data-ytms-video-menu'), null);
});

test('expired trusted activation cannot restart discovery when a late native popup-opened event arrives', async t => {
  const page = await open(t, { sheet: true, modernTrigger: true, eventless: true, delayed: true, delayMs: 1700 });
  await page.locator('#trigger').click();
  await page.waitForTimeout(1850);
  await page.evaluate(() => menuFixture.popup.dispatchEvent(new CustomEvent('yt-popup-opened', { bubbles: true })));
  await page.waitForTimeout(120);
  assert.equal(await page.locator('[data-ytms-video-menu]').count(), 0);
  assert.equal(await page.locator('[data-ytms-menu-action]').count(), 0);
});

for(const sheet of [false,true])test(`video menu settles before its first paint without reconnecting correctly ordered native rows (${sheet?'current sheet':'legacy'})`,async t=>{
  const page=await open(t,{sheet,iconSlots:true});
  await page.evaluate(()=>document.getElementById('trigger').addEventListener('click',()=>{
    const rows=menuFixture.originals;let moves=0;
    const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(rows.includes(node))moves++;});
    observer.observe(rows[0].parentElement,{childList:true});
    menuFixture.firstPaint=new Promise(resolve=>requestAnimationFrame(()=>{
      for(const record of observer.takeRecords())for(const node of record.addedNodes)if(rows.includes(node))moves++;
      observer.disconnect();resolve({ready:menuFixture.popup.getAttribute('data-ytms-video-menu')==='1',moves,notInterested:menuFixture.popup.querySelectorAll('[data-ytms-menu-icon-fallback="notInterested"]').length});
    }));
  }));
  await page.locator('#trigger').click();
  assert.deepEqual(await page.evaluate(()=>menuFixture.firstPaint),{ready:true,moves:0,notInterested:1});
});

test('Not interested cold-icon fallback preserves native and extension icons and releases its scoped observer',async t=>{
  const page=await open(t,{sheet:true,iconSlots:true,blockTube:true});
  await page.evaluate(()=>{
    const Native=MutationObserver;window.activeIconWatchers=0;
    window.MutationObserver=class extends Native{observe(...args){if(!this.active){this.active=true;activeIconWatchers++;}return super.observe(...args);}disconnect(){if(this.active){this.active=false;activeIconWatchers--;}return super.disconnect();}};
  });
  await show(page);assert.equal(await page.locator('[data-ytms-menu-icon-fallback]').count(),1);
  assert.equal(await page.locator('[data-native-id="blockChannel"] [data-ytms-menu-icon-fallback]').count(),0);
  assert.equal(await page.locator('[data-native-id="blockVideo"] [data-ytms-menu-icon-fallback]').count(),0);
  assert.equal(await page.evaluate(()=>activeIconWatchers),1);
  await page.evaluate(()=>{const fallback=document.querySelector('[data-ytms-menu-icon-fallback]');const native=document.createElementNS('http://www.w3.org/2000/svg','svg');native.setAttribute('data-native-icon','1');fallback.parentElement.append(native);window.nativeNotInterested=native;});
  await page.waitForFunction(()=>!document.querySelector('[data-ytms-menu-icon-fallback]'));
  assert.equal(await page.evaluate(()=>nativeNotInterested.isConnected),true);
  assert.equal(await page.evaluate(()=>activeIconWatchers),0);
  const loaded=await open(t,{sheet:true,iconSlots:true,iconLoaded:true});await show(loaded);
  assert.equal(await loaded.locator('[data-ytms-menu-icon-fallback]').count(),0);assert.equal(await loaded.locator('[data-native-icon]').count(),9);
});

for(const reason of ['recycled','detached','disposed'])test(`Not interested pending glyph is released when its row is ${reason}`,async t=>{
  const page=await open(t,{sheet:true,iconSlots:true});await show(page);
  await page.evaluate(reason=>{
    if(reason==='disposed'){disposeVideoMenu();return;}
    const row=menuFixture.popup.querySelector('[data-native-id="notInterested"]');
    if(reason==='detached'){row.remove();return;}
    const index=menuFixture.items.findIndex(item=>item.listItemViewModel?.title.content==='Not interested');
    menuFixture.items[index].listItemViewModel.leadingImage.sources[0].clientResource.imageName='SOMETHING_NEW';
    row.append(document.createElement('span'));
  },reason);
  await page.waitForFunction(()=>!document.querySelector('[data-ytms-menu-icon-fallback]'));
});

test('menu cleanup preserves a later native or extension display change',async t=>{
  const page=await open(t,{sheet:true});await show(page);
  await page.evaluate(()=>{
    const report=menuFixture.popup.querySelector('[data-native-id="report"]');
    report.style.setProperty('display','grid','important');disposeVideoMenu();
  });
  assert.deepEqual(await page.locator('[data-native-id="report"]').evaluate(row=>({display:row.style.getPropertyValue('display'),priority:row.style.getPropertyPriority('display')})),{display:'grid',priority:'important'});
});

test('channel tools toggles preserve the latest external display baseline on disposal',async t=>{
  const page=await open(t,{sheet:true});await show(page);
  await page.evaluate(()=>menuFixture.popup.querySelector('[data-native-id="report"]').style.setProperty('display','grid','important'));
  await page.getByRole('menuitem',{name:'Channel tools',exact:true}).click();
  assert.equal(await page.locator('[data-native-id="report"]').evaluate(row=>row.style.display),'grid');
  await page.getByRole('menuitem',{name:'Back',exact:true}).click();
  assert.equal(await page.locator('[data-native-id="report"]').evaluate(row=>row.style.display),'none');
  await page.evaluate(()=>disposeVideoMenu());
  assert.deepEqual(await page.locator('[data-native-id="report"]').evaluate(row=>({display:row.style.getPropertyValue('display'),priority:row.style.getPropertyPriority('display')})),{display:'grid',priority:'important'});
});

test('a pre-existing native none-important row is never claimed or revealed by menu cleanup',async t=>{
  const page=await open(t,{sheet:true});
  await page.evaluate(()=>{
    const trigger=document.getElementById('trigger');trigger.removeEventListener('click',menuFixture.open);
    trigger.addEventListener('click',()=>{menuFixture.open();menuFixture.popup.querySelector('[data-native-id="report"]').style.setProperty('display','none','important');});
  });
  await show(page);await page.getByRole('menuitem',{name:'Channel tools',exact:true}).click();
  assert.equal(await page.locator('[data-native-id="report"]').isVisible(),false);
  await page.getByRole('menuitem',{name:'Back',exact:true}).click();await page.evaluate(()=>disposeVideoMenu());
  assert.deepEqual(await page.locator('[data-native-id="report"]').evaluate(row=>({display:row.style.getPropertyValue('display'),priority:row.style.getPropertyPriority('display')})),{display:'none',priority:'important'});
});

// Language: en-GB. Synthetic layout and creator identities only.
function nestedLayout({empty = false} = {}) {
  const model = createMenuLayout(), result = model.fromPreferences({menuGroupChannelTools:false});
  result.nodes = result.nodes.filter(node => node.id !== 'channelTools');
  result.nodes.unshift({id:'submenu-tools',name:'My tools',parent:'root'},
    {id:'submenu-queue',name:'Queue actions',parent:'submenu-tools'},
    {id:'submenu-next',name:'Next videos',parent:'submenu-queue'},
    {id:'submenu-empty',name:'Unavailable actions',parent:'root'});
  for (const node of result.nodes) {
    if (node.id === 'playNext' || node.id === 'addToQueue') { node.parent = 'submenu-next'; node.visible = !empty; }
    if (node.id === 'download') { node.parent = 'submenu-empty'; node.visible = false; }
  }
  assert.ok(model.validate(result)); return result;
}
async function creatorFixture(page,{status = 'multiple',channels = [{channelId:'UCabcdefghijklmnopqrstuv',name:'Alpha creator'},
  {channelId:'UCABCDEFGHIJKLMNOPQRSTUV',name:'Beta creator'}],handles = []} = {}) {
  await page.evaluate(({status,channels,handles}) => {
    const f = window.creatorFixture = {status,channels,handles,lookups:[],requests:[],verified:new WeakSet()};
    suite.channelAge.channelIdentityFromCard = () => ({status:f.status,channels:f.channels.map(channel => ({...channel})),handles:f.handles.map(handle => ({...handle}))});
    suite.channelAge.rememberResolvedChannel = (_card,candidate,channel,videoId) => {
      if (videoId !== 'bbbbbbbbbbb' || !f.handles.some(handle => handle.url === candidate.url)) return {ok:false,error:'Creator changed'};
      f.channels = [{channelId:channel.channelId,name:channel.name}]; f.status = 'unique'; return {ok:true,channel};
    };
    suite.channelLookup = {
      lookup(candidate,{signal}) {
        f.lookups.push({...candidate});
        return new Promise(resolve => f.requests.push({candidate,signal,resolve}));
      },
      isVerified(candidate,channel) { return f.verified.has(channel) && channel.url === candidate.url; },
    };
    f.complete = (index,ok = true) => {
      const request = f.requests[index];
      const channel = {channelId:'UCabcdefghijklmnopqrstuv',name:'Resolved creator',handle:request.candidate.handle,url:request.candidate.url};
      f.verified.add(channel); request.resolve(ok ? {ok:true,channel} : {ok:false,error:'Channel page could not be verified.'});
    };
  },{status,channels,handles});
}
for (const sheet of [false,true]) test('custom nested menu pages preserve native action nodes and skip empty groups ('+(sheet ? 'current sheet':'legacy')+')',async t => {
  const page = await open(t,{sheet,unknown:true,blockTube:true,settings:{menuLayout:nestedLayout()}});
  await show(page);
  assert.equal(await page.getByRole('menuitem',{name:'Unavailable actions',exact:true}).isVisible(),false);
  assert.equal(await page.getByRole('menuitem',{name:'Block Channel',exact:true}).isVisible(),true);
  await page.getByRole('menuitem',{name:'My tools',exact:true}).click();
  await page.getByRole('menuitem',{name:'Queue actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'Next videos',exact:true}).click();
  assert.deepEqual(await visibleIds(page),['back','playNext','addToQueue']);
  assert.equal(await page.evaluate(() => menuFixture.originals.every(node => node.isConnected)),true);
  await page.getByRole('menuitem',{name:'Play next in queue',exact:true}).click();
  assert.deepEqual(await page.evaluate(() => menuFixture.nativeCalls),['playNext']);
  assert.equal(await page.locator('[data-ytms-video-menu]').count(),0);
});
test('custom nested menu keyboard navigation returns one level at a time and restores native ordering on disposal',async t => {
  const page = await open(t,{sheet:true,settings:{menuLayout:nestedLayout()}});
  await page.locator('#trigger').focus(); await page.keyboard.press('Enter');
  await page.locator('[data-ytms-video-menu="1"]').waitFor();
  await page.getByRole('menuitem',{name:'My tools',exact:true}).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('menuitem',{name:'Queue actions',exact:true}).isVisible(),true);
  await page.getByRole('menuitem',{name:'Queue actions',exact:true}).focus(); await page.keyboard.press('ArrowRight');
  await page.getByRole('menuitem',{name:'Next videos',exact:true}).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('menuitem',{name:'Play next in queue',exact:true}).isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menuitem',{name:'Next videos',exact:true}).isVisible(),true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByRole('menuitem',{name:'Queue actions',exact:true}).isVisible(),true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByRole('menuitem',{name:'My tools',exact:true}).isVisible(),true);
  await page.evaluate(()=>disposeVideoMenu());
  assert.equal(await page.locator('[data-ytms-menu-action]').count(),0);
  assert.equal(await page.evaluate(()=>menuFixture.originals.every((node,index)=>node.parentElement.children[index]===node)),true);
});
for (const sheet of [false,true]) for (const change of ['card','model'])
test(`keyboard submenu entry rejects a recycled ${change} (${sheet ? 'current sheet' : 'legacy'})`, async t => {
  const page = await open(t,{sheet});
  await page.locator('#trigger').focus(); await page.keyboard.press('Enter');
  await page.locator('[data-ytms-video-menu="1"]').waitFor();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('menuitem',{name:'Channel tools',exact:true}).focus();
  assert.equal(await page.getByRole('menuitem',{name:'Channel tools',exact:true}).evaluate(row => document.activeElement === row),true);
  const before = await visibleIds(page);
  await page.evaluate(({sheet,change}) => {
    if (change === 'card') document.querySelector('#card a').href = '/watch?v=ccccccccccc';
    else {
      const popup = menuFixture.popup;
      if (sheet) {
        const data = popup.componentProps.data();
        popup.componentProps.data = () => ({...data});
      } else popup.polymerController.data = {...popup.polymerController.data};
    }
  },{sheet,change});
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await visibleIds(page),before,'Keyboard entry requires the same current menu binding as pointer entry');
  assert.deepEqual(await page.evaluate(()=>menuFixture.openedSettings),[]);
  assert.deepEqual(await page.evaluate(()=>menuFixture.nativeCalls),[]);
});

test('all-hidden custom menu actions leave unknown extension rows usable without empty submenus',async t => {
  const layout = nestedLayout({empty:true}); for (const node of layout.nodes) if ('visible' in node) node.visible = false;
  const page = await open(t,{unknown:true,blockTube:true,settings:{menuLayout:layout}}); await show(page);
  assert.deepEqual(await visibleIds(page),['unrecognised','blockChannel','blockVideo']);
  await page.getByRole('menuitem',{name:'Block Channel',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>menuFixture.nativeCalls),['blockChannel']);
});
for (const sheet of [false,true]) test('verified collaboration choices open only the selected creator settings ('+(sheet ? 'current sheet':'legacy')+')',async t => {
  const page = await open(t,{sheet,settings:{menuGroupChannelTools:false}}); await creatorFixture(page); await show(page);
  await page.getByRole('menuitem',{name:/^Filter channel uploads/}).click();
  assert.equal(await page.getByRole('menuitem',{name:'Filter uploads from Alpha creator',exact:true}).isVisible(),true);
  await page.getByRole('menuitem',{name:'Filter uploads from Beta creator',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>menuFixture.openedSettings),[{channelId:'UCABCDEFGHIJKLMNOPQRSTUV',name:'Beta creator'}]);
  assert.deepEqual(await page.evaluate(()=>menuFixture.selectedChannelIds),['UCABCDEFGHIJKLMNOPQRSTUV']);
  assert.deepEqual(await page.evaluate(()=>creatorFixture.lookups),[]);
});
test('recycled creator identities and conflicting metadata cannot open a stale creator or start lookup',async t => {
  const page = await open(t,{settings:{menuGroupChannelTools:false}}); await creatorFixture(page); await show(page);
  await page.getByRole('menuitem',{name:/^Filter channel uploads/}).click();
  await page.evaluate(()=>{creatorFixture.channels=[{channelId:'UCabcdefghijklmnopqrstuv',name:'Alpha creator'}];creatorFixture.status='unique';});
  await page.getByRole('menuitem',{name:'Filter uploads from Beta creator',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>menuFixture.openedSettings),[]);
  await page.locator('#outside').click();
  await page.evaluate(()=>{creatorFixture.status='conflict';creatorFixture.channels=[];});await show(page);
  const action=page.locator('[data-ytms-menu-action="channelAge"]');
  assert.equal(await action.getAttribute('aria-disabled'),'true');assert.match(await action.textContent(),/disagrees/);
  await action.click({force:true});assert.deepEqual(await page.evaluate(()=>creatorFixture.lookups),[]);
});
test('handle lookup starts only on explicit selection and verified results bind the existing editor',async t => {
  const page = await open(t,{sheet:true,settings:{menuGroupChannelTools:false}});
  await creatorFixture(page,{status:'missing',channels:[],handles:[{handle:'@alpha',url:'https://www.youtube.com/@alpha',name:'Alpha creator'}]});
  await show(page);assert.deepEqual(await page.evaluate(()=>creatorFixture.lookups),[]);
  await page.getByRole('menuitem',{name:/^Look up channel ID/}).click();
  await page.waitForFunction(()=>creatorFixture.lookups.length===1);
  assert.deepEqual(await page.evaluate(()=>menuFixture.openedSettings),[]);
  await page.evaluate(()=>creatorFixture.complete(0));
  await page.waitForFunction(()=>menuFixture.openedSettings.length===1);
  assert.equal(await page.evaluate(()=>menuFixture.openedSettings[0].channelId),'UCabcdefghijklmnopqrstuv');
  assert.deepEqual(await page.evaluate(()=>menuFixture.selectedChannelIds),['UCabcdefghijklmnopqrstuv']);
});
test('Back cancels handle lookup and a late response cannot open settings or alter a reopened menu',async t => {
  const page = await open(t,{settings:{menuGroupChannelTools:false}});
  await creatorFixture(page,{status:'missing',channels:[],handles:[{handle:'@alpha',url:'https://www.youtube.com/@alpha',name:'Alpha creator'}]});
  await show(page);await page.getByRole('menuitem',{name:/^Look up channel ID/}).click();
  await page.waitForFunction(()=>creatorFixture.requests.length===1);await page.getByRole('menuitem',{name:'Back',exact:true}).click();
  assert.equal(await page.evaluate(()=>creatorFixture.requests[0].signal.aborted),true);
  await page.evaluate(()=>creatorFixture.complete(0));await page.waitForTimeout(30);
  assert.deepEqual(await page.evaluate(()=>menuFixture.openedSettings),[]);
  assert.equal(await page.getByRole('menuitem',{name:/^Look up channel ID/}).isVisible(),true);
});
test('failed lookup offers a retry while card recycling rejects a later successful response',async t => {
  const page = await open(t,{sheet:true,settings:{menuGroupChannelTools:false}});
  await creatorFixture(page,{status:'missing',channels:[],handles:[{handle:'@alpha',url:'https://www.youtube.com/@alpha',name:'Alpha creator'}]});
  await show(page);await page.getByRole('menuitem',{name:/^Look up channel ID/}).click();
  await page.waitForFunction(()=>creatorFixture.requests.length===1);await page.evaluate(()=>creatorFixture.complete(0,false));
  await page.getByRole('status').filter({hasText:'Channel page could not be verified.'}).waitFor();
  await page.getByRole('menuitem',{name:/^Look up @alpha/}).click();
  await page.waitForFunction(()=>creatorFixture.requests.length===2);
  await page.evaluate(()=>{document.querySelector('#card a').href='/watch?v=ccccccccccc';creatorFixture.complete(1);});
  await page.waitForTimeout(30);assert.deepEqual(await page.evaluate(()=>menuFixture.openedSettings),[]);
});

test('closing, navigating or disposing aborts pending creator lookups and ignores late results',async t => {
  for (const action of ['close','navigate','dispose']) {
    const page = await open(t,{sheet:true,settings:{menuGroupChannelTools:false}});
    await creatorFixture(page,{status:'missing',channels:[],handles:[{handle:'@alpha',url:'https://www.youtube.com/@alpha',name:'Alpha creator'}]});
    await show(page);await page.getByRole('menuitem',{name:/^Look up channel ID/}).click();
    await page.waitForFunction(()=>creatorFixture.requests.length===1);
    await page.evaluate(action=>{
      if(action==='close')menuFixture.dropdown.close();
      if(action==='navigate')window.dispatchEvent(new Event('yt-navigate-start'));
      if(action==='dispose')disposeVideoMenu();
    },action);
    assert.equal(await page.evaluate(()=>creatorFixture.requests[0].signal.aborted),true,action);
    await page.evaluate(()=>creatorFixture.complete(0));await page.waitForTimeout(30);
    assert.deepEqual(await page.evaluate(()=>menuFixture.openedSettings),[],action);
    assert.equal(await page.locator('[data-ytms-video-menu]').count(),0);
  }
});

test('partially identified collaborations expose verified creator and explicit remaining handle choices',async t => {
  const page=await open(t,{sheet:true,settings:{menuGroupChannelTools:false}});
  await creatorFixture(page,{status:'multiple',channels:[{channelId:'UCabcdefghijklmnopqrstuv',name:'Alpha creator'}],handles:[
    {handle:'@beta',url:'https://www.youtube.com/@beta',name:'Beta creator'},
  ]});
  await show(page);
  const action=page.locator('[data-ytms-menu-action="channelAge"]');
  assert.equal(await action.getAttribute('aria-haspopup'),'menu');
  await action.click();
  assert.equal(await page.getByRole('menuitem',{name:'Filter uploads from Alpha creator',exact:true}).isVisible(),true);
  await page.getByRole('menuitem',{name:/^Look up @beta/}).click();
  await page.waitForFunction(()=>creatorFixture.lookups.length===1);
  assert.equal(await page.evaluate(()=>creatorFixture.lookups[0].url),'https://www.youtube.com/@beta');
  assert.deepEqual(await page.evaluate(()=>menuFixture.openedSettings),[]);
  await page.getByRole('menuitem',{name:'Back',exact:true}).click();
  assert.equal(await page.evaluate(()=>creatorFixture.requests[0].signal.aborted),true);
});

test('one verified creator with an unassociated handle retains direct settings without a network request',async t => {
  const page=await open(t,{sheet:true,settings:{menuGroupChannelTools:false}});
  await creatorFixture(page,{status:'unique',channels:[{channelId:'UCabcdefghijklmnopqrstuv',name:'Alpha creator'}],handles:[
    {handle:'@alpha',url:'https://www.youtube.com/@alpha',name:'Alpha creator'},
  ]});
  await show(page);
  await page.getByRole('menuitem',{name:'Filter channel uploads',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>menuFixture.selectedChannelIds),['UCabcdefghijklmnopqrstuv']);
  assert.deepEqual(await page.evaluate(()=>creatorFixture.lookups),[]);
});
