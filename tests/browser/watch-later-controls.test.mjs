// Language: en-GB. Synthetic Watch Later and History controls only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { installWatchLaterControls } from '../../sources/watch-later-controls.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';

let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });

function pageMarkup({ history = false, watchLater = false, playlistSidebar = watchLater, miniplayerQueue = false, modern = false } = {}) {
  const historySidebar = history ? `
    <div id="secondary"><ytd-browse-feed-actions-renderer><div id="contents">
      <ytd-button-renderer id="clear-history" aria-label="Clear all watch history" style="display:flex;flex-direction:column"><button type="button" aria-label="Clear all watch history" style="display:inline-flex;align-items:center;justify-content:flex-start;box-sizing:border-box;min-height:36px;margin:0;padding:0 8px;border:0;gap:12px;white-space:nowrap"><span class="yt-spec-button-shape-next__icon" style="display:inline-flex;flex:0 0 24px;box-sizing:border-box;width:24px;min-width:24px;height:24px"><span data-ytms-history-action-icon aria-hidden="true" style="display:block;width:16px;height:16px">♲</span></span><span data-ytms-history-action-native-label>Clear all watch history</span></button></ytd-button-renderer>
      <ytd-button-renderer id="pause-history" aria-label="Pause watch history" style="display:flex;flex-direction:column"><button type="button" aria-label="Pause watch history" style="display:inline-flex;align-items:center;justify-content:flex-start;box-sizing:border-box;min-height:36px;margin:0;padding:0 8px;border:0;gap:12px;white-space:nowrap"><span class="yt-spec-button-shape-next__icon" style="display:inline-flex;flex:0 0 24px;box-sizing:border-box;width:24px;min-width:24px;height:24px"><span data-ytms-history-action-icon aria-hidden="true" style="display:block;width:16px;height:16px">Ⅱ</span></span><span id="pause-native-label" data-ytms-history-action-native-label>Pause watch history</span></button></ytd-button-renderer>
      <ytd-button-renderer id="manage-history" aria-label="Manage all history" style="display:flex;flex-direction:column"><a href="#" aria-label="Manage all history" style="display:inline-flex;align-items:center;justify-content:flex-start;box-sizing:border-box;min-height:36px;padding:0 8px;gap:12px;white-space:nowrap"><span class="history-native-icon-shell" style="display:inline-flex;flex:0 0 24px;box-sizing:border-box;width:24px;min-width:24px;height:24px"><span hidden data-ytms-history-action-icon aria-hidden="true" style="display:block;width:16px;height:16px">⚙</span><span class="history-nested-icon-offset" style="display:inline-flex;margin-inline-start:4px;padding-inline-start:2px"><span data-ytms-history-action-icon aria-hidden="true" style="display:block;width:16px;height:16px;margin-inline-start:4px">⚙</span></span></span><span data-ytms-history-action-native-label>Manage all history</span></a></ytd-button-renderer>
      <ytd-button-renderer id="unrelated" aria-label="Clear browsing data"><button type="button" aria-label="Clear browsing data"><span aria-hidden="true">×</span></button></ytd-button-renderer>
      <ytd-compact-link-renderer id="history-grouped-links"><a id="history-comments">Comments</a><a id="history-posts">Posts</a><a id="history-live-chat">Live chat</a></ytd-compact-link-renderer>
    </div></ytd-browse-feed-actions-renderer></div>` : '';
  const librarySidebar = playlistSidebar ? '<div id="secondary"><ytd-playlist-sidebar-renderer id="library-sidebar"><div id="sidebar-native">Native playlist controls</div></ytd-playlist-sidebar-renderer></div>' : '';
  const playlist = modern ? `<div id="primary"><yt-section-list-renderer><chip-bar-view-model><button>All</button></chip-bar-view-model>
    <yt-item-section-renderer><yt-lockup-view-model id="one"><a href="/watch?v=aaaaaaaaaaa">North video</a></yt-lockup-view-model>
    <yt-lockup-view-model id="two"><a href="/watch?v=bbbbbbbbbbb">South video</a></yt-lockup-view-model>
    <yt-lockup-view-model id="non-video"><a href="/@fixture">Unrelated item</a></yt-lockup-view-model></yt-item-section-renderer>
  </yt-section-list-renderer></div>` : watchLater ? `
    <div id="primary"><ytd-playlist-header-renderer><ytd-button-renderer id="download-host"><button id="download" aria-label="Download">⇩</button></ytd-button-renderer></ytd-playlist-header-renderer>
      <ytd-playlist-video-list-renderer><div id="contents">
        <ytd-playlist-video-renderer id="one"><a id="video-title">Cold weather guide</a><ytd-channel-name>North Channel</ytd-channel-name></ytd-playlist-video-renderer>
        <ytd-playlist-video-renderer id="two"><a id="video-title">Garden plants</a><ytd-channel-name>South Channel</ytd-channel-name></ytd-playlist-video-renderer>
        <ytd-continuation-item-renderer id="continuation">Load more</ytd-continuation-item-renderer>
      </div></ytd-playlist-video-list-renderer></div>` : '';
  const miniplayer = miniplayerQueue ? `
    <ytd-miniplayer><ytd-playlist-panel-renderer><div class="playlist-items">
      <ytd-playlist-panel-video-renderer id="mini-row">Unrelated native queue row</ytd-playlist-panel-video-renderer>
    </div></ytd-playlist-panel-renderer></ytd-miniplayer>` : '';
  return `<!doctype html><html lang="en-GB" dark><head><meta charset="utf-8"><style>
    ytd-button-renderer :is(button, a) { color:rgb(245, 245, 245); }
  </style></head><body>
    <ytd-app><ytd-browse><ytd-two-column-browse-results-renderer>${historySidebar}${librarySidebar}${playlist}</ytd-two-column-browse-results-renderer></ytd-browse>${miniplayer}</ytd-app>
  </body></html>`;
}

async function open(t, route, options) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const url = `https://www.youtube.com${route}`;
  await context.route('**/*', request => request.request().url() === url
    ? request.fulfill({ contentType: 'text/html', body: pageMarkup(options) }) : request.abort());
  if (options?.generated) {
    const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
    await context.addInitScript({ content: source });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(url);
  if (options?.history) {
    await page.evaluate(() => {
      window.ytmsHistoryNativeLabelStarts = Object.fromEntries(
        [...document.querySelectorAll('[data-ytms-history-action-native-label]')].map(label => [
          label.closest('ytd-button-renderer').id,
          label.getBoundingClientRect().left,
        ]),
      );
    });
  }
  if (!options?.generated) {
    await page.addScriptTag({ content: `(${installWatchLaterControls.toString()})({ document, window });` });
  }
  return page;
}

async function historyActionState(page, id) {
  return page.locator(`${id} :is(button, a)`).evaluate(button => {
    const host = button.closest('ytd-button-renderer');
    const labels = [];
    const addGeneratedLabel = value => {
      if (!value || value === 'none' || value === 'normal') return;
      labels.push(value.replace(/^['"]|['"]$/g, '').replace(/\\(["'])/g, '$1'));
    };
    for (const node of [host, ...host.querySelectorAll('*')]) {
      addGeneratedLabel(getComputedStyle(node, '::before').content);
      addGeneratedLabel(getComputedStyle(node, '::after').content);
    }
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim() || node.parentElement?.closest('[aria-hidden="true"],[hidden]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) labels.push(walker.currentNode.nodeValue.trim());
    const style = getComputedStyle(button);
    return {
      labels,
      title: button.getAttribute('title'),
      ariaLabel: button.getAttribute('aria-label'),
      display: style.display,
      flexDirection: style.flexDirection,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      color: style.color,
      iconPresent: Boolean(button.querySelector('[data-ytms-history-action-icon]')),
    };
  });
}

async function historyActionGeometry(page) {
  return page.evaluate(() => Object.fromEntries([
    'clear-history', 'pause-history', 'manage-history',
  ].map(id => {
    const button = document.querySelector(`#${id} :is(button, a)`);
    const slot = button.querySelector('[data-ytms-history-icon-slot="1"]');
    const icon = [...slot.querySelectorAll('[data-ytms-history-action-icon]')].find(node => {
      if (node.closest('[hidden],[inert]')) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const label = button.querySelector('[data-ytms-history-action-native-label]');
    const slotStyle = getComputedStyle(slot);
    return [id, {
      iconLeft: icon.getBoundingClientRect().left,
      labelLeft: label.getBoundingClientRect().left,
      slotLeft: slot.getBoundingClientRect().left,
      slotWidth: slot.getBoundingClientRect().width,
      slotFlexBasis: slotStyle.flexBasis,
      slotMarginInlineStart: slotStyle.marginInlineStart,
      slotMarker: slot.getAttribute('data-ytms-history-icon-slot'),
      iconMarginInlineStart: getComputedStyle(icon).marginInlineStart,
    }];
  })));
}

test('Watch Later search filters loaded title and channel rows without changing the playlist', async t => {
  const page = await open(t, '/playlist?list=WL', { watchLater: true });
  await page.locator('#ytms-watch-later-search').waitFor();
  assert.equal(await page.locator('#secondary > #ytms-watch-later-search').count(), 1);
  assert.equal(await page.locator('#ytms-watch-later-search').getAttribute('data-ytms-library-search-placement'), 'sidebar');
  assert.equal(await page.locator('#download').getAttribute('title'), 'Download Watch Later');
  assert.equal(await page.locator('#download').getAttribute('aria-label'), 'Download Watch Later');
  const clear = page.locator('#ytms-watch-later-search button');
  const status = page.locator('#ytms-watch-later-search-status');
  assert.equal(await clear.isVisible(), false);
  assert.equal(await status.isVisible(), false);

  await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).fill('north');
  await page.waitForFunction(() => document.querySelector('#two')?.getAttribute('data-ytms-watch-later-search-hidden') === '1');
  assert.equal(await page.locator('#one').getAttribute('data-ytms-watch-later-search-hidden'), null);
  assert.equal(await page.locator('#continuation').getAttribute('data-ytms-watch-later-search-hidden'), null);
  assert.equal(await clear.isVisible(), true);
  assert.equal(await status.isVisible(), false);

  await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).fill('no fixture matches');
  await status.waitFor({ state: 'visible' });
  assert.match(await status.textContent(), /No loaded Watch Later videos/);

  await page.getByRole('button', { name: 'Clear Watch Later search', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-ytms-watch-later-search-hidden]'));
  assert.equal(await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).inputValue(), '');
  assert.equal(await clear.isVisible(), false);
  assert.equal(await status.isVisible(), false);
});

test('Liked videos receives the existing sidebar search without inheriting Watch Later labels', async t => {
  const page = await open(t, '/playlist?list=LL', { watchLater: true });
  await page.locator('#ytms-liked-videos-search').waitFor();
  assert.equal(await page.locator('#secondary > #ytms-liked-videos-search').count(), 1);
  assert.equal(await page.locator('#download').getAttribute('data-ytms-watch-later-download-labelled'), null);

  await page.getByRole('searchbox', { name: 'Search Liked videos', exact: true }).fill('north');
  await page.waitForFunction(() => document.querySelector('#two')?.getAttribute('data-ytms-watch-later-search-hidden') === '1');
  assert.equal(await page.locator('#one').getAttribute('data-ytms-watch-later-search-hidden'), null);
  assert.equal(await page.locator('#ytms-liked-videos-search-status').textContent(), '');
});

test('Watch Later search applies to later rendered rows and fully restores on navigation', async t => {
  const page = await open(t, '/playlist?list=WL', { watchLater: true });
  await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).fill('garden');
  await page.waitForFunction(() => document.querySelector('#one')?.getAttribute('data-ytms-watch-later-search-hidden') === '1');
  await page.evaluate(() => {
    const row = document.createElement('ytd-playlist-video-renderer');
    row.id = 'later';
    row.innerHTML = '<a id="video-title">Late science video</a><ytd-channel-name>Late Channel</ytd-channel-name>';
    document.querySelector('ytd-playlist-video-list-renderer #contents').append(row);
    window.dispatchEvent(new Event('yt-rendererstamper-finished'));
  });
  await page.waitForFunction(() => document.querySelector('#later')?.getAttribute('data-ytms-watch-later-search-hidden') === '1');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/playlist?list=PLfixture');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForFunction(() => !document.getElementById('ytms-watch-later-search'));
  assert.equal(await page.locator('[data-ytms-watch-later-search-hidden]').count(), 0);
});

test('a Watch Later to Liked videos navigation clears the old filter before creating the new search', async t => {
  const page = await open(t, '/playlist?list=WL', { watchLater: true });
  await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).fill('north');
  await page.waitForFunction(() => document.querySelector('#two')?.getAttribute('data-ytms-watch-later-search-hidden') === '1');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/playlist?list=LL');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.locator('#ytms-liked-videos-search').waitFor();
  assert.equal(await page.locator('#ytms-watch-later-search').count(), 0);
  assert.equal(await page.locator('[data-ytms-watch-later-search-hidden]').count(), 0);
  assert.equal(await page.getByRole('searchbox', { name: 'Search Liked videos', exact: true }).inputValue(), '');
});

test('library search ignores a concurrent miniplayer queue and never touches its rows', async t => {
  const page = await open(t, '/playlist?list=WL', { watchLater: true, miniplayerQueue: true });
  await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).fill('north');
  await page.waitForFunction(() => document.querySelector('#two')?.getAttribute('data-ytms-watch-later-search-hidden') === '1');
  assert.equal(await page.locator('#mini-row').getAttribute('data-ytms-watch-later-search-hidden'), null);
  assert.equal(await page.locator('#mini-row').getAttribute('style'), null);
  assert.equal(await page.locator('#mini-row').textContent(), 'Unrelated native queue row');
});

test('the generated Suite restores a filtered row if YouTube recycles it outside the active playlist', async t => {
  const page = await open(t, '/playlist?list=WL', { watchLater: true, generated: true });
  const search = page.locator('#secondary > #ytms-watch-later-search input');
  await search.fill('north');
  await page.waitForFunction(() => document.querySelector('#two')?.hasAttribute('data-ytms-watch-later-search-hidden'));
  await page.locator('#two').evaluate(row => document.body.append(row));
  await page.waitForFunction(() => !document.querySelector('#two')?.hasAttribute('data-ytms-watch-later-search-hidden'));
  assert.equal(await page.locator('#two').isVisible(), true);
});

for (const generated of [false, true]) test(`modern Liked videos search follows title changes and tab visibility (${generated ? 'Suite' : 'source'})`, async t => {
  const page = await open(t, '/playlist?list=LL', { modern: true, generated });
  const search = page.getByRole('searchbox', { name: 'Search Liked videos' });
  await search.fill('north');
  await page.waitForFunction(() => document.querySelector('#two').hasAttribute('data-ytms-watch-later-search-hidden'));
  assert.equal(await page.locator('#non-video').getAttribute('data-ytms-watch-later-search-hidden'), null);
  const chips = page.locator('chip-bar-view-model');
  assert.equal(await chips.isVisible(), true);
  await page.locator('#two a').evaluate(title => { title.firstChild.data = 'Further north'; });
  await page.waitForFunction(() => !document.querySelector('#two').hasAttribute('data-ytms-watch-later-search-hidden'));
  for (const hidden of [true, false]) {
    await page.evaluate(hidden => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    assert.equal(await search.inputValue(), 'north');
  }
});

test('a late usable sidebar adopts the fallback search without losing its filter', async t => {
  const page = await open(t, '/playlist?list=WL', { watchLater: true, playlistSidebar: false });
  await page.locator('#primary > #ytms-watch-later-search').waitFor();
  await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).fill('north');
  await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).evaluate(input => {
    input.focus();
    input.setSelectionRange(1, 4, 'forward');
  });
  await page.waitForFunction(() => document.querySelector('#two')?.getAttribute('data-ytms-watch-later-search-hidden') === '1');
  await page.evaluate(() => {
    const secondary = document.createElement('div');
    secondary.id = 'secondary';
    secondary.setAttribute('style', 'width:0;height:0;overflow:hidden');
    document.querySelector('ytd-two-column-browse-results-renderer').append(secondary);
  });
  await page.locator('#primary > #ytms-watch-later-search').waitFor();
  await page.locator('#secondary').evaluate(node => node.setAttribute('style', 'width:320px;height:120px'));
  await page.locator('#secondary > #ytms-watch-later-search').waitFor();
  await page.waitForFunction(() => {
    const input = document.querySelector('#secondary #ytms-watch-later-search input');
    return document.activeElement === input && input.selectionStart === 1 && input.selectionEnd === 4;
  });
  assert.equal(await page.locator('#primary > #ytms-watch-later-search').count(), 0);
  assert.equal(await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).inputValue(), 'north');
  assert.equal(await page.locator('#two').getAttribute('data-ytms-watch-later-search-hidden'), '1');
});

test('other playlists stay untouched', async t => {
  const page = await open(t, '/playlist?list=PLfixture', { watchLater: true });
  assert.equal(await page.locator('#ytms-watch-later-search').count(), 0);
  assert.equal(await page.locator('#download').getAttribute('data-ytms-watch-later-download-labelled'), null);
});

test('late Watch Later content retries once and ignores a hidden preloaded browse root', async t => {
  const page = await open(t, '/playlist?list=WL');
  await page.evaluate(() => {
    const current = document.querySelector('ytd-browse');
    const stale = document.createElement('ytd-browse');
    stale.id = 'stale-browse';
    stale.hidden = true;
    stale.innerHTML = '<ytd-playlist-video-list-renderer><div id="contents"><ytd-playlist-video-renderer>Stale video</ytd-playlist-video-renderer></div></ytd-playlist-video-list-renderer>';
    document.querySelector('ytd-app').prepend(stale);
    current.innerHTML = '<ytd-two-column-browse-results-renderer><ytd-playlist-header-renderer><ytd-button-renderer><button aria-label="Download">⇩</button></ytd-button-renderer></ytd-playlist-header-renderer><ytd-playlist-video-list-renderer hidden><div id="contents"><ytd-playlist-video-renderer>Hidden preloaded video</ytd-playlist-video-renderer></div></ytd-playlist-video-list-renderer><ytd-playlist-video-list-renderer><div id="contents"><ytd-playlist-video-renderer id="visible-row"><a id="video-title">Visible Watch Later video</a></ytd-playlist-video-renderer></div></ytd-playlist-video-list-renderer></ytd-two-column-browse-results-renderer>';
  });
  await page.locator('#ytms-watch-later-search').waitFor({ timeout: 3000 });
  assert.equal(await page.locator('#stale-browse #ytms-watch-later-search').count(), 0);
  await page.getByRole('searchbox', { name: 'Search Watch Later', exact: true }).fill('visible');
  assert.equal(await page.locator('#visible-row').getAttribute('data-ytms-watch-later-search-hidden'), null);
});

test('History side-rail actions have one inline visible label each without intercepting native actions', async t => {
  const page = await open(t, '/feed/history', { history: true });
  const actions = [
    ['#clear-history', 'Clear all watch history'],
    ['#pause-history', 'Pause watch history'],
    ['#manage-history', 'Manage all history'],
  ];
  for (const [id, label] of actions) {
    const state = await historyActionState(page, id);
    assert.deepEqual(state.labels, [label], `${id} has exactly one visible label`);
    assert.equal(state.title, label, `${id} retains its hover description`);
    assert.equal(state.ariaLabel, label, `${id} retains its accessible name`);
    assert.equal(state.iconPresent, true, `${id} retains its native icon`);
    assert.match(state.display, /flex/, `${id} lays its icon and label out with flex`);
    assert.equal(state.flexDirection, 'row', `${id} keeps its icon and label inline`);
    assert.equal(state.alignItems, 'center', `${id} vertically aligns its icon and label`);
    // Chromium may serialise flex-start as flow-start. Check the actual icon
    // and label positions below as well as the start alignment.
    assert.match(state.justifyContent, /^(flex|flow)-start$/, `${id} starts the label beside its icon`);
    assert.equal(state.color, 'rgb(245, 245, 245)', `${id} keeps YouTube's native action colour`);
  }
  const geometry = await historyActionGeometry(page);
  const nativeLabelStarts = await page.evaluate(() => window.ytmsHistoryNativeLabelStarts);
  const clearGeometry = geometry['clear-history'];
  for (const [id] of actions) {
    const actionGeometry = geometry[id.slice(1)];
    assert.equal(actionGeometry.slotMarker, '1', `${id} marks the actual icon slot`);
    assert.equal(actionGeometry.slotWidth, 24, `${id} keeps a 24px icon slot`);
    assert.equal(actionGeometry.slotFlexBasis, '24px', `${id} fixes the icon slot basis`);
    assert.equal(actionGeometry.slotMarginInlineStart, '0px', `${id} clears icon-slot inline margins`);
    assert.equal(actionGeometry.iconMarginInlineStart, '0px', `${id} clears native icon inline margins`);
    assert.equal(actionGeometry.slotLeft, clearGeometry.slotLeft, `${id} starts its icon slot with Clear`);
    assert.equal(actionGeometry.iconLeft, clearGeometry.iconLeft, `${id} starts its icon glyph with Clear`);
    assert.equal(actionGeometry.labelLeft, nativeLabelStarts[id.slice(1)], `${id} does not move its native label`);
  }
  assert.deepEqual((await historyActionState(page, '#unrelated')).labels, []);
  assert.equal(await page.locator('#unrelated button').getAttribute('title'), null);
  const groupedLinks = page.locator('#history-grouped-links');
  assert.equal(await groupedLinks.getAttribute('data-ytms-history-action-labelled'), null);
  assert.deepEqual(await groupedLinks.evaluate(group => {
    const generated = node => ['::before', '::after'].map(pseudo => getComputedStyle(node, pseudo).content)
      .filter(value => value && value !== 'none' && value !== 'normal');
    return [group, ...group.querySelectorAll('*')].flatMap(generated);
  }), []);
  for (const id of ['#history-comments', '#history-posts', '#history-live-chat']) {
    assert.equal(await page.locator(id).getAttribute('title'), null, `${id} keeps its native text only`);
    assert.equal(await page.locator(id).getAttribute('aria-label'), null, `${id} is not given an action label`);
    assert.equal(await page.locator(id).getAttribute('data-ytms-history-visible-label'), null, `${id} gets no generated label`);
  }
  await page.locator('#pause-native-label').evaluate(node => node.remove());
  await page.waitForFunction(() =>
    document.querySelector('#pause-history button')?.getAttribute('data-ytms-history-visible-label') === 'Pause watch history');
  assert.deepEqual((await historyActionState(page, '#pause-history')).labels, ['Pause watch history']);
  await page.locator('#pause-history button').evaluate(button => {
    const nativeLabel = document.createElement('span');
    nativeLabel.id = 'late-native-pause-label';
    nativeLabel.textContent = 'Pause watch history';
    button.append(nativeLabel);
  });
  await page.waitForFunction(() =>
    document.querySelector('#pause-history button')?.getAttribute('data-ytms-history-visible-label') === null);
  assert.deepEqual((await historyActionState(page, '#pause-history')).labels, ['Pause watch history']);
  await page.locator('#late-native-pause-label').evaluate(node => node.remove());
  await page.waitForFunction(() =>
    document.querySelector('#pause-history button')?.getAttribute('data-ytms-history-visible-label') === 'Pause watch history');
  assert.deepEqual((await historyActionState(page, '#pause-history')).labels, ['Pause watch history']);
  await page.evaluate(() => {
    const stale = document.createElement('ytd-browse');
    stale.hidden = true;
    stale.innerHTML = `<ytd-two-column-browse-results-renderer><div id="secondary">
      <ytd-browse-feed-actions-renderer><div id="contents">
        <ytd-button-renderer><button aria-label="Clear all watch history">Old clear action</button></ytd-button-renderer>
      </div></ytd-browse-feed-actions-renderer>
    </div></ytd-two-column-browse-results-renderer>`;
    document.querySelector('ytd-app').append(stale);
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.waitForFunction(() =>
    document.querySelector('#clear-history')?.getAttribute('data-ytms-history-action-labelled') === '1');
  assert.deepEqual((await historyActionState(page, '#clear-history')).labels, ['Clear all watch history']);
  await page.evaluate(() => {
    window.historyActionClicks = {};
    for (const id of ['clear-history', 'pause-history', 'manage-history']) {
      document.querySelector(`#${id} :is(button, a)`).addEventListener('click', () => {
        window.historyActionClicks[id] = (window.historyActionClicks[id] || 0) + 1;
      });
    }
  });
  for (const [id] of actions) await page.locator(`${id} :is(button, a)`).click();
  assert.deepEqual(await page.evaluate(() => window.historyActionClicks), {
    'clear-history': 1, 'pause-history': 1, 'manage-history': 1,
  });
});

test('History respects the current native label after Pause becomes Resume in the same button', async t => {
  const page = await open(t, '/feed/history', { history: true, generated: true });
  const action = page.locator('#pause-history button');
  await page.locator('#pause-history[data-ytms-history-action-labelled="1"]').waitFor();
  await action.evaluate(button => {
    button.querySelector('#pause-native-label').textContent = 'Resume watch history';
    button.setAttribute('aria-label', 'Resume watch history');
  });
  await page.waitForFunction(() => document.querySelector('#pause-history button').title === 'Resume watch history');
  assert.deepEqual((await historyActionState(page, '#pause-history')).labels, ['Resume watch history']);
  assert.equal(await action.getAttribute('aria-label'), 'Resume watch history');
  await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-start')));
  assert.equal(await action.getAttribute('aria-label'), 'Resume watch history');
});
