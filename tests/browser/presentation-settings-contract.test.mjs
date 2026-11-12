// Language: en-GB. Behavioural contracts for optional presentation settings.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { installDiscoveryControls } from '../../sources/discovery-controls.mjs';
import { installPlayerControls } from '../../sources/player-controls.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';

let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

const cases = [
  ['hideSubscriptionsHeaders','/feed/subscriptions','<ytd-browse><ytd-rich-grid-renderer><div id="header" data-target>Categories</div></ytd-rich-grid-renderer></ytd-browse>'],
  ['hideHomePosts','/','<ytd-browse><ytd-post-renderer data-target>Post</ytd-post-renderer></ytd-browse>'],
  ['hideAllComments','/watch?v=aaaaaaaaaaa','<ytd-watch-flexy><ytd-comments data-target>Comments</ytd-comments></ytd-watch-flexy>'],
  ['hideChannelBanner','/@Fixture','<ytd-c4-tabbed-header-renderer><div id="banner" data-target>Banner</div></ytd-c4-tabbed-header-renderer>'],
  ['hideChannelBanner','/@Fixture/videos','<yt-page-header-renderer><yt-image-banner-view-model data-target>Banner</yt-image-banner-view-model></yt-page-header-renderer>'],
  ['hideSubscriptionsChannels','/feed/subscriptions','<ytd-channel-list-sub-menu-renderer data-target>Subscribed channels</ytd-channel-list-sub-menu-renderer>'],
  ['hideSearchPrompts','/results?search_query=fixture','<ytd-search><ytd-search-refinement-card-renderer data-target>Prompt</ytd-search-refinement-card-renderer></ytd-search>'],
  ['hidePremiumUpsells','/','<ytd-mealbar-promo-renderer data-target>Premium</ytd-mealbar-promo-renderer>'],
  ['hideOpenApp','/','<ytd-app-install-promo-renderer data-target>Open app</ytd-app-install-promo-renderer>'],
  ['hideExplore','/','<ytd-guide-entry-renderer data-target><a href="/feed/explore">Explore</a></ytd-guide-entry-renderer>'],
  ['shortsHideActions','/shorts/aaaaaaaaaaa','<ytd-reel-player-overlay-renderer><div id="actions" data-target>Actions</div></ytd-reel-player-overlay-renderer>'],
  ['shortsHideRelated','/shorts/aaaaaaaaaaa','<yt-reel-multi-format-link-view-model data-target>Related</yt-reel-multi-format-link-view-model>'],
  ['shortsHideMusic','/shorts/aaaaaaaaaaa','<ytd-reel-player-overlay-renderer><div id="sound-metadata" data-target>Music</div></ytd-reel-player-overlay-renderer>'],
  ['shortsHideRemix','/shorts/aaaaaaaaaaa','<ytd-reel-player-overlay-renderer><div id="remix-button" data-target>Remix</div></ytd-reel-player-overlay-renderer>'],
  ['hideJumpAhead','/watch?v=aaaaaaaaaaa','<div id="movie_player"><div class="ytp-skip-forward-button" data-target>Jump ahead</div></div>','player'],
  ['hidePlayerAnnotations','/watch?v=aaaaaaaaaaa','<div id="movie_player"><div class="annotation" data-target>Annotation</div></div>','player'],
  ['disablePlayerBlur','/watch?v=aaaaaaaaaaa','<div id="movie_player"><div class="ytp-background-blur" data-target>Blur</div></div>','player'],
];

async function open(t, path, markup) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const url = 'https://www.youtube.com' + path;
  await context.route('**/*', route => route.request().url() === url ? route.fulfill({contentType:'text/html',body:
    `<!doctype html><html lang="en-GB"><style>[data-target],#unrelated{display:block;width:180px;height:50px;border-radius:16px;background:rgb(20,30,40);white-space:nowrap;max-height:50px}</style><body>${markup}<div id="unrelated">Unrelated content</div></body></html>`}) : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(url);
  return page;
}

async function install(page, preferences, player = false) {
  await page.evaluate(({ source, preferences }) => {
    window.disposeContract = (0,eval)('('+source+')')({document,window,preferences,classifyFilm:()=>null,
      reportError: (...args) => { throw new Error('Unexpected contract error: '+String(args.at(-1))); }});
  }, { source: (player ? installPlayerControls : installDiscoveryControls).toString(), preferences });
}

for (const [key,path,markup,kind] of cases) test(`${key} hides only its target when enabled and restores on disposal`, async t => {
  const page = await open(t,path,markup);
  for (const enabled of [false,true]) {
    await install(page,{[key]:enabled},kind === 'player');
    assert.equal(await page.locator('[data-target]').isVisible(),!enabled);
    assert.equal(await page.locator('#unrelated').isVisible(),true);
    await page.evaluate(()=>disposeContract());
    assert.equal(await page.locator('[data-target]').isVisible(),true);
  }
});

for (const [key,markup,property,expected] of [
  ['squareCorners','<ytd-browse><ytd-thumbnail data-target>Thumbnail</ytd-thumbnail></ytd-browse>','borderTopLeftRadius','0px'],
  ['disableThemedHover','<ytd-browse><div class="ytThumbnailHoverOverlayToggleActionsViewModelHost" data-target>Hover</div></ytd-browse>','backgroundColor','rgba(0, 0, 0, 0)'],
  ['fullFeedTitles','<ytd-browse><ytd-rich-grid-renderer><div id="video-title" data-target>Long video title</div></ytd-rich-grid-renderer></ytd-browse>','whiteSpace','normal'],
]) test(`${key} changes the intended computed style and restores its native value`, async t => {
  const page = await open(t,'/',markup);
  const read = () => page.locator('[data-target]').evaluate((el,property)=>getComputedStyle(el)[property],property);
  const baseline = await read();
  assert.notEqual(baseline,expected);
  await install(page,{[key]:false});assert.equal(await read(),baseline);await page.evaluate(()=>disposeContract());
  await install(page,{[key]:true});assert.equal(await read(),expected);await page.evaluate(()=>disposeContract());
  assert.equal(await read(),baseline);
});

for (const [size,width] of [['small',240],['medium',320],['large',400]]) test(`searchThumbnailSize ${size} applies its declared width and restores native sizing`,async t=>{
  const page=await open(t,'/results?search_query=fixture','<ytd-search><ytd-video-renderer><ytd-thumbnail data-target>Thumbnail</ytd-thumbnail></ytd-video-renderer></ytd-search>');
  await install(page,{searchThumbnailSize:size});
  assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).width),`${width}px`);
  await page.evaluate(()=>disposeContract());
  assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).width),'180px');
});

for(const count of ['3','4','5','6']) test(`shortsColumns ${count} changes only the Shorts grid`,async t=>{
  const page=await open(t,'/','<ytd-rich-grid-renderer data-target><ytd-rich-grid-slim-media>Short</ytd-rich-grid-slim-media></ytd-rich-grid-renderer>');
  await install(page,{shortsColumns:count});
  assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).getPropertyValue('--ytd-rich-grid-slim-items-per-row').trim()),count);
  assert.equal(await page.locator('#unrelated').evaluate(el=>getComputedStyle(el).getPropertyValue('--ytd-rich-grid-slim-items-per-row').trim()),'');
  await page.evaluate(()=>disposeContract());
  assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).getPropertyValue('--ytd-rich-grid-slim-items-per-row').trim()),'');
});

test('fullWidthChannel expands the channel content only while enabled on a channel route',async t=>{
  const page=await open(t,'/@Fixture','<ytd-browse style="display:block;width:700px"><div id="primary" data-target>Channel content</div></ytd-browse>');
  await install(page,{fullWidthChannel:false});
  assert.equal((await page.locator('[data-target]').boundingBox()).width,180);
  await page.evaluate(()=>disposeContract());
  await install(page,{fullWidthChannel:true});
  assert.equal((await page.locator('[data-target]').boundingBox()).width,700);
  await page.evaluate(()=>{history.pushState({},'','/');window.dispatchEvent(new Event('yt-navigate-finish'));});
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-ytms-discovery-route')==='home');
  assert.equal((await page.locator('[data-target]').boundingBox()).width,180);
  await page.evaluate(()=>disposeContract());
  assert.equal((await page.locator('[data-target]').boundingBox()).width,180);
});

test('viewsSeparateLine changes only recognised view metadata and restores native inline layout',async t=>{
  const page=await open(t,'/','<ytd-browse><ytd-rich-grid-renderer><ytd-rich-item-renderer><div id="metadata-line"><span data-target style="display:inline">1,234 views</span><span id="published" style="display:inline">3 days ago</span></div></ytd-rich-item-renderer></ytd-rich-grid-renderer></ytd-browse>');
  for(const enabled of [false,true]){
    await install(page,{viewsSeparateLine:enabled});
    assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).display),enabled?'block':'inline');
    assert.equal(await page.locator('#published').evaluate(el=>getComputedStyle(el).display),'inline');
    await page.evaluate(()=>disposeContract());
    assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).display),'inline');
  }
});

for(const [path,preference] of [['/','homeList'],['/feed/subscriptions','subscriptionsList']]) test(`${preference} changes actual card layout and stays scoped to its feed`,async t=>{
  const page=await open(t,path,'<ytd-browse><ytd-rich-grid-renderer><div id="contents" style="display:grid"><ytd-rich-item-renderer style="display:block;width:240px"><ytd-rich-grid-media><div id="dismissible" data-target><a id="thumbnail">Thumbnail</a>Title</div></ytd-rich-grid-media></ytd-rich-item-renderer></div></ytd-rich-grid-renderer></ytd-browse>');
  for(const enabled of [false,true]){
    await install(page,{[preference]:enabled});
    assert.equal(await page.locator('#contents').evaluate(el=>getComputedStyle(el).display),enabled?'block':'grid');
    assert.equal(await page.locator('[data-target]').evaluate(el=>getComputedStyle(el).display),enabled?'flex':'block');
    await page.evaluate(()=>disposeContract());
  }
  await install(page,{[preference]:true});
  await page.evaluate(next=>{history.pushState({},'',next);window.dispatchEvent(new Event('yt-navigate-finish'));},path==='/'?'/feed/subscriptions':'/');
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-ytms-discovery-list'));
  assert.equal(await page.locator('#contents').evaluate(el=>getComputedStyle(el).display),'grid');
  await page.evaluate(()=>disposeContract());
});

test('Home post hiding removes the native grid slot while retaining mixed cards, queues and channel posts',async t=>{
  const markup='<ytd-browse><ytd-rich-grid-renderer><div id="post-grid" style="display:grid;grid-template-columns:repeat(3,200px)">'+
    '<ytd-rich-item-renderer id="post-card" style="display:block;min-height:120px"><ytd-post-renderer data-target>Community post</ytd-post-renderer></ytd-rich-item-renderer>'+
    '<ytd-rich-item-renderer id="next-card" style="display:block;min-height:120px">Next video</ytd-rich-item-renderer>'+
    '<ytd-rich-item-renderer id="mixed-card" style="display:block;min-height:120px"><ytd-post-renderer>Uncertain post</ytd-post-renderer><yt-lockup-view-model>Video card</yt-lockup-view-model></ytd-rich-item-renderer>'+
    '</div></ytd-rich-grid-renderer><ytd-playlist-panel-renderer style="display:block"><ytd-post-renderer id="queued-post" style="display:block">Queued surface</ytd-post-renderer></ytd-playlist-panel-renderer></ytd-browse>';
  const page=await open(t,'/',markup),firstX=(await page.locator('#post-card').boundingBox()).x;
  await install(page,{hideHomePosts:false});
  assert.equal(await page.locator('#post-card').isVisible(),true);
  await page.evaluate(()=>disposeContract());
  await install(page,{hideHomePosts:true});
  assert.equal(await page.locator('#post-card').isVisible(),false);
  assert.equal((await page.locator('#next-card').boundingBox()).x,firstX,'The next card must occupy the removed post slot');
  assert.equal(await page.locator('#mixed-card').isVisible(),true);
  assert.equal(await page.locator('#queued-post').isVisible(),true);
  await page.evaluate(()=>{history.pushState({},'','/@Fixture/posts');window.dispatchEvent(new Event('yt-navigate-finish'));});
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-ytms-discovery-route')==='channel');
  assert.equal(await page.locator('#post-card').isVisible(),true);
  await page.evaluate(()=>disposeContract());
  assert.equal(await page.locator('[data-target]').isVisible(),true);
});
