// Language: en-GB. Optional layout features keep native media and extension surfaces intact.
import assert from 'node:assert/strict';
import test from 'node:test';
import { installLayoutControls } from '../../sources/layout-controls.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';

async function open(t, preferences = {}) {
  const browser = await launchFixtureBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>
    body { margin: 0; } ytd-app, ytd-watch-flexy, #full-bleed-container, #player-theater-container, #columns, #primary, #secondary, #secondary-inner, #related, #movie_player, ytd-masthead, ytd-live-chat-frame { display: block; }
    ytd-masthead { height: 56px; } #full-bleed-container { height: 300px; }
    #player-theater-container, #movie_player { height: 100%; } #movie_player { position: relative; }
    #columns { display: flex; } #primary { width: 70%; min-height: 200px; } #secondary { width: 30%; }
    #related { height: 100px; } .surface, .ytp-chrome-top, .ytp-pause-overlay, .ytp-endscreen-content, .ytp-chrome-bottom, .ytp-fullscreen-quick-actions { display:block; width:100px; height:20px; }
    [hidden] { display: none !important; } #sponsorBlockPopupContainer { display: none; }
    video { width: 100%; height: 100%; } .cbCustomTitle, .ryd-counter { display:block; height:20px; }
  </style></head><body><ytd-app><ytd-masthead>Header</ytd-masthead><ytd-watch-flexy is-two-columns>
    <div id="full-bleed-container"><div id="player-theater-container"><div id="movie_player" class="html5-video-player"><video></video>
      <div class="ytp-chrome-top">Title</div><div class="ytp-pause-overlay">Related overlay</div><div class="ytp-endscreen-content">End screen</div><div class="ytp-chrome-bottom">Playback controls</div>
      <div class="ytp-fullscreen-quick-actions"><yt-like-button-view-model class="surface">Like</yt-like-button-view-model><yt-dislike-button-view-model class="surface">Dislike</yt-dislike-button-view-model><button class="ytp-overflow-button">More actions</button><button id="share">Share</button></div>
      <div id="sponsorblockNotice" class="surface">SponsorBlock notice</div>
    </div></div></div>
    <div id="columns"><div id="primary"><span class="cbCustomTitle">DeArrow title</span><span class="ryd-counter">RYD count</span></div><div id="secondary"><div id="secondary-inner"><div id="related">Related videos</div><div id="sponsorBlockPopupContainer" class="surface">SponsorBlock popup</div></div></div></div>
  </ytd-watch-flexy></ytd-app></body></html>` }));
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await page.evaluate(({ source, preferences }) => {
    const video = document.querySelector('video');
    Object.defineProperty(video, 'currentTime', { get: () => 42, set() { throw new Error('Layout must not seek'); } });
    video.play = video.pause = () => { throw new Error('Layout must not change playback'); };
    window.layoutFixture = { video, parent: video.parentNode, errors: [], resizes: 0 };
    window.addEventListener('resize', () => window.layoutFixture.resizes++);
    window.layoutFixture.dispose = (0, eval)(`(${source})`)({ document, window, preferences,
      MutationObserver, reportError: error => window.layoutFixture.errors.push(error.message) });
  }, { source: installLayoutControls.toString(), preferences });
  return page;
}

async function remainsIntact(page) {
  assert.deepEqual(await page.evaluate(() => ({ sameVideo: layoutFixture.video === document.querySelector('video'),
    sameParent: layoutFixture.video.parentNode === layoutFixture.parent, time: layoutFixture.video.currentTime,
    errors: layoutFixture.errors })), { sameVideo: true, sameParent: true, time: 42, errors: [] });
}

test('disabled layout options add no presentation or observation work', async t => {
  const page = await open(t);
  assert.equal(await page.locator('#ytms-layout-controls').count(), 0);
  assert.equal(await page.locator('[data-ytms-related-below], [data-ytms-layout-watch]').count(), 0);
  await remainsIntact(page);
});

test('pagehide keeps layout markers suspended until pageshow despite late native completion', async t => {
  const page=await open(t,{relatedBelowPlayer:true,hideRelated:false});
  await page.waitForFunction(()=>document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
  await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('yt-navigate-finish'));window.dispatchEvent(new Event('yt-page-data-updated'));});
  await page.waitForTimeout(80);
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),null);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await page.waitForFunction(()=>document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
  await remainsIntact(page);
});

test('initial pageshow cannot prematurely restore layout during a pending SPA navigation', async t => {
  const page=await open(t,{relatedBelowPlayer:true,hideRelated:false});
  await page.waitForFunction(()=>document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-start'));window.dispatchEvent(new Event('pageshow'));});
  await page.waitForTimeout(80);
  assert.equal(await page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below'),null);
  await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-finish')));
  await page.waitForFunction(()=>document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
  await remainsIntact(page);
});

test('hiding native fullscreen chat preserves the Suite-owned floating chat panel', async t => {
  const page=await open(t,{hideChatFullscreen:true});
  await page.evaluate(()=>{
    document.getElementById('movie_player').classList.add('ytp-fullscreen');
    const chat=document.createElement('ytd-live-chat-frame');chat.id='chat';chat.className='surface';chat.textContent='Native chat';document.getElementById('secondary-inner').append(chat);
  });
  assert.equal(await page.locator('#chat').isVisible(),false);
  await page.locator('#chat').evaluate(chat=>chat.setAttribute('data-ytppl-live-chat-panel','1'));
  assert.equal(await page.locator('#chat').isVisible(),true);
  await page.locator('#chat').evaluate(chat=>chat.removeAttribute('data-ytppl-live-chat-panel'));
  assert.equal(await page.locator('#chat').isVisible(),false);
  await remainsIntact(page);
});

test('related placement yields to native queues, chat, engagement and extension surfaces', async t => {
  const page = await open(t, { relatedBelowPlayer: true, hideRelated: false });
  const marker = () => page.locator('ytd-watch-flexy').getAttribute('data-ytms-related-below');
  await page.waitForFunction(() => document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
  assert.equal(await page.locator('#columns').evaluate(node => getComputedStyle(node).flexDirection), 'column');
  for (const tag of ['ytd-playlist-panel-renderer', 'ytd-live-chat-frame', 'ytd-engagement-panel-section-list-renderer', 'native-future-panel']) {
    await page.evaluate(tag => {
      const surface = document.createElement(tag); surface.className = 'surface'; surface.id = 'active-surface';
      document.getElementById('secondary-inner').append(surface);
    }, tag);
    await page.waitForFunction(() => !document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
    assert.equal(await marker(), null, tag);
    await page.locator('#active-surface').evaluate(node => { node.hidden = true; });
    await page.waitForFunction(() => document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
    await page.locator('#active-surface').evaluate(node => node.remove());
  }
  await page.locator('#sponsorBlockPopupContainer').evaluate(node => { node.style.display = 'block'; });
  await page.waitForFunction(() => !document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
  assert.equal(await page.locator('#sponsorBlockPopupContainer').isVisible(), true);
  await page.evaluate(() => layoutFixture.dispose());
  assert.equal(await marker(), null);
  assert.equal(await page.locator('#ytms-layout-controls').count(), 0);
  assert.equal(await page.locator('.cbCustomTitle').textContent(), 'DeArrow title');
  assert.equal(await page.locator('.ryd-counter').textContent(), 'RYD count');
  await remainsIntact(page);
});

test('owned layout transitions notify native resize once and settle without an idle loop', async t => {
  const page = await open(t, { relatedBelowPlayer: true, hideRelated: false });
  await page.waitForFunction(() => document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  await settle();
  assert.equal(await page.evaluate(() => layoutFixture.resizes), 1);
  await page.evaluate(() => {
    const queue = document.createElement('ytd-playlist-panel-renderer'); queue.className = 'surface';
    document.getElementById('secondary-inner').append(queue);
  });
  await page.waitForFunction(() => !document.querySelector('ytd-watch-flexy').hasAttribute('data-ytms-related-below'));
  await settle();
  assert.equal(await page.evaluate(() => layoutFixture.resizes), 2);
  await settle();
  assert.equal(await page.evaluate(() => layoutFixture.resizes), 2, 'an unchanged reconciliation emits no additional resize');
  await remainsIntact(page);
});

test('full-window theatre follows the native theatre state and restores the header on Home', async t => {
  const page = await open(t, { fullWindowTheatre: true, theatreHideHeader: true });
  assert.equal(await page.locator('#full-bleed-container').evaluate(node => node.getBoundingClientRect().height), 300);
  await page.locator('ytd-watch-flexy').evaluate(node => node.setAttribute('theater', ''));
  assert.equal(await page.locator('#full-bleed-container').evaluate(node => node.getBoundingClientRect().height), 900);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('ytd-masthead')).display === 'none');
  assert.equal(await page.locator('ytd-masthead').isVisible(), false);
  await page.locator('ytd-watch-flexy').evaluate(node => { node.style.display = 'none'; });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('ytd-masthead')).display !== 'none');
  assert.equal(await page.locator('ytd-masthead').isVisible(), true, 'a retained hidden theatre does not hide the page header');
  await page.locator('ytd-watch-flexy').evaluate(node => { node.style.display = ''; });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('ytd-masthead')).display === 'none');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  assert.equal(await page.locator('ytd-masthead').isVisible(), true);
  assert.equal(await page.locator('#full-bleed-container').evaluate(node => node.getBoundingClientRect().height), 300);
  await page.evaluate(() => layoutFixture.dispose());
  await remainsIntact(page);
});

test('fullscreen controls are individually scoped and preserve extension voting and notices', async t => {
  const page = await open(t, { hideFullscreenTitle: true, hideFullscreenRelated: true, hideFullscreenEndscreen: true,
    hideFullscreenVoting: true, hideFullscreenMoreActions: true, hideFullscreenControls: true, hideChatFullscreen: true });
  await page.evaluate(() => {
    const chat = document.createElement('ytd-live-chat-frame'); chat.id = 'chat'; chat.className = 'surface';
    document.querySelector('#secondary-inner').append(chat);
  });
  assert.equal(await page.locator('.ytp-chrome-top').isVisible(), true);
  await page.locator('#movie_player').evaluate(node => node.classList.add('ytp-fullscreen'));
  for (const selector of ['.ytp-chrome-top', '.ytp-pause-overlay', '.ytp-endscreen-content', '.ytp-chrome-bottom',
    'yt-like-button-view-model', 'yt-dislike-button-view-model', '.ytp-overflow-button', '#chat']) {
    assert.equal(await page.locator(selector).isVisible(), false, selector);
  }
  for (const selector of ['#share', '.ryd-counter', '.cbCustomTitle', '#sponsorblockNotice']) {
    assert.equal(await page.locator(selector).isVisible(), true, selector);
  }
  await page.locator('#movie_player').evaluate(node => node.classList.remove('ytp-fullscreen'));
  assert.equal(await page.locator('.ytp-chrome-bottom').isVisible(), true);
  assert.equal(await page.locator('#chat').isVisible(), true);
  await page.evaluate(() => layoutFixture.dispose());
  await remainsIntact(page);
});
