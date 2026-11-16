// Language: en-GB. Synthetic Home banners; no account, profile or live requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installDiscoveryControls } from '../../sources/discovery-controls.mjs';
import { launchFixtureBrowser, waitForSuiteHealth, saveFixtureSettings } from './fixture-browser.mjs';
const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const key = 'yt-master-suite.settings.v1';
const banner = '<div id="big-yoodle" data-featured><ytd-statement-banner-renderer>Featured collection</ytd-statement-banner-renderer></div>';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout:30000 });
after(async () => { await browser?.close(); });
async function open(t, compiled = false) {
  const context = await browser.newContext({ serviceWorkers:'block' });
  const errors = [];
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  const html = compiled ? fixture : `<!doctype html><html lang="en-GB"><style>
    ytd-app,ytd-browse,ytd-rich-grid-renderer,ytd-statement-banner-renderer,ytd-masthead,ytd-miniplayer,ytd-playlist-panel-renderer {display:block}
    [data-featured] {display:block;height:120px;margin:10px 0}
    #normal {display:block;height:60px}
    </style><body><ytd-app><ytd-masthead><a id="logo">Header logo</a></ytd-masthead>
    <ytd-browse><ytd-rich-grid-renderer>${banner}<ytd-rich-item-renderer id="normal">Video <span>YouTube featured</span><span id="extension-marker">Extension marker</span></ytd-rich-item-renderer></ytd-rich-grid-renderer></ytd-browse></ytd-app></body></html>`;
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/')
    ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
  if (compiled) {
    await context.addInitScript(({ key }) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key,JSON.stringify({version:1,values:{theatreMode:false,miniplayerWidth:997,hideChat:false}}));
        sessionStorage.setItem('seeded','1');
      }
    }, { key });
    await context.addInitScript({content:suite});
  }
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  page.on('pageerror',error => errors.push(error.message));
  await page.goto('https://www.youtube.com/');
  if (compiled) await waitForSuiteHealth(page,8,{timeoutMs:10000,requireReady:true,errors});
  else await page.evaluate(source => {
    window.disposeFeatured = (0,eval)('('+source+')')({document,window,preferences:{hideHomeFeaturedBanners:true},classifyFilm:()=>null});
  },installDiscoveryControls.toString());
  return page;
}
test('Home banners follow SPA routes and disposal restores their layout', async t => {
  const page = await open(t);
  for (const [path,hidden] of [['/',true],['/results?search_query=fixture',false],['/feed/subscriptions',false],['/@Fixture',false],['/watch?v=aaaaaaaaaaa',false],['/feed/recommended',true]]) {
    await page.evaluate(path => { history.pushState({},'',path); window.dispatchEvent(new Event('yt-navigate-finish')); },path);
    await page.waitForFunction(hidden => document.querySelector('[data-featured]').getClientRects().length===Number(!hidden),hidden);
    assert.equal(await page.locator('[data-featured]').isVisible(),!hidden);
    assert.equal(await page.locator('#normal').isVisible(),true);
    assert.equal(await page.locator('#logo').isVisible(),true);
  }
  await page.evaluate(() => disposeFeatured());
  assert.equal(await page.locator('[data-featured]').isVisible(),true);
  assert.equal(await page.locator('#ytms-discovery-controls-style').count(),0);
});
test('lazy banners collapse immediately without reserving a blank row or following the filtered-card reveal', async t => {
  const page = await open(t);
  const before = await page.locator('#normal').boundingBox();
  await page.evaluate(() => {
    const node = document.createElement('div');node.id='masthead-ad';node.dataset.late='';node.style.cssText='height:200px;margin:20px';node.textContent='Promotion';
    document.querySelector('ytd-app').insertBefore(node,document.querySelector('ytd-browse'));
    document.documentElement.setAttribute('data-yt-master-show-filtered','1');
  });
  assert.equal(await page.locator('[data-late]').isVisible(),false);
  assert.deepEqual(await page.locator('#normal').boundingBox(),before);
  assert.equal(await page.locator('#extension-marker').isVisible(),true);
  await page.evaluate(() => disposeFeatured());
  assert.ok((await page.locator('#normal').boundingBox()).y>before.y+300);
});
test('mixed video sections, non-banner featured labels, queue controls and channel banners remain available', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    document.querySelector('ytd-browse').insertAdjacentHTML('beforeend',`
      <ytd-rich-section-renderer id="mixed"><div id="content"><ytd-statement-banner-renderer>Statement</ytd-statement-banner-renderer><yt-lockup-view-model>Video</yt-lockup-view-model></div></ytd-rich-section-renderer>
      <ytd-miniplayer><ytd-playlist-panel-renderer><div id="big-yoodle" data-queue>Queue controls</div><div id="masthead-ad" data-queue>Queue item</div></ytd-playlist-panel-renderer></ytd-miniplayer>
      <ytd-c4-tabbed-header-renderer><div id="banner">Channel banner</div></ytd-c4-tabbed-header-renderer>`);
  });
  for (const selector of ['#mixed','#normal span','#logo','#banner','[data-queue]']) {
    for (const element of await page.locator(selector).all()) assert.equal(await element.isVisible(),true,selector);
  }
});
test('generated setting defaults on, is searchable and persists an opt-out without losing existing preferences', async t => {
  const page = await open(t,true);
  const addBanner = () => page.evaluate(markup => {
    const browse=document.createElement('ytd-browse');browse.innerHTML=markup;document.querySelector('ytd-app').append(browse);
    browse.querySelector('[data-featured]').style.cssText='display:block;height:120px';
  },banner);
  await addBanner();assert.equal(await page.locator('[data-featured]').isVisible(),false);
  const before = await page.evaluate(key => GM_getValue(key,null),key);
  await page.locator('#ytms-settings-button').click();
  await page.locator('#ytms-settings-search').fill('YouTube featured banners');
  await page.locator('.settings-search-result[data-target="hideHomeFeaturedBanners"]').click();
  const control = page.locator('#ytms-hideHomeFeaturedBanners');
  assert.equal(await control.isChecked(),true);
  assert.equal(await page.locator('#ytms-tab-feed').getAttribute('aria-selected'),'true');
  assert.equal(await page.evaluate(key => GM_getValue(key,null),key),before);
  await control.uncheck();await saveFixtureSettings(page);
  const saved = await page.evaluate(key => JSON.parse(GM_getValue(key)).values,key);
  assert.equal(saved.hideHomeFeaturedBanners,false);assert.equal(saved.miniplayerWidth,997);assert.equal(saved.hideChat,false);
  await page.reload();await waitForSuiteHealth(page,8,{timeoutMs:10000,requireReady:true});
  await addBanner();assert.equal(await page.locator('[data-featured]').isVisible(),true);
});
