// Language: en-GB. Isolated native-markup discovery and extension coexistence fixtures.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { installDiscoveryControls } from '../../sources/discovery-controls.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });
const html = `<!doctype html><html lang="en-GB"><head><style>
ytd-app,ytd-masthead,ytd-browse,ytd-search,ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-rich-grid-media,ytd-playlist-panel-renderer,ytd-guide-renderer,ytd-guide-section-renderer,ytd-channel-video-player-renderer {display:block}
ytd-rich-item-renderer{min-height:40px} #movie_player{width:640px;height:360px}
</style></head><body><ytd-app><ytd-masthead><a id="logo" href="/">YouTube</a></ytd-masthead>
<ytd-guide-renderer><div id="sections"><ytd-guide-section-renderer><a id="subscriptions" href="/feed/subscriptions">Subscriptions</a></ytd-guide-section-renderer></div></ytd-guide-renderer>
<ytd-browse><ytd-rich-grid-renderer><div id="contents"></div></ytd-rich-grid-renderer></ytd-browse>
<div id="movie_player"><video></video><div id="sponsorBlockMarker" style="left:25%"></div></div>
</ytd-app></body></html>`;
async function open(t, prefs = {}, path = '/') {
  const context = await browser.newContext({ viewport: {width:1200,height:900}, serviceWorkers:'block' });
  const url = 'https://www.youtube.com'+path;
  await context.route('**/*',route => route.request().url() === url ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  const errors = []; page.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await context.close();}});
  await page.goto(url);
  await page.evaluate(({source,prefs})=>{
    window.discoveryPrefs = prefs; window.observerCounts={constructed:0,observed:0,disconnected:0};
    class CountedObserver extends MutationObserver {
      constructor(callback){super(callback);observerCounts.constructed++;}
      observe(...args){observerCounts.observed++;return super.observe(...args);}
      disconnect(){observerCounts.disconnected++;return super.disconnect();}
    }
    window.disposeDiscovery = (0,eval)('('+source+')')({document,window,preferences:prefs,MutationObserver:CountedObserver,reportError:(id,phase,error)=>{throw error;}});
    window.addCard = (id,{metadata='10 views',badge='',href='/watch?v=aaaaaaaaaaa',collaboration=false,movie=false}={})=>{
      const card=document.createElement(movie?'ytd-movie-renderer':'ytd-rich-item-renderer');card.id=id;
      const content=document.createElement('ytd-rich-grid-media');
      const link=document.createElement('a');link.id='video-title';link.href=href;link.textContent='LIVE AI playlist collaboration auto-dubbed title';
      const meta=document.createElement('div');meta.id='metadata-line';const span=document.createElement('span');span.textContent=metadata;meta.append(span);
      const nativeBadge=document.createElement('span');nativeBadge.className='yt-badge-shape__text';nativeBadge.textContent=badge;
      const custom=document.createElement('img');custom.className='cbCustomThumbnail';custom.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      const ryd=document.createElement('span');ryd.id='return-youtube-dislike';ryd.textContent='42';
      content.append(link,meta,nativeBadge,custom,ryd);if(collaboration)card.setAttribute('is-collaboration','');card.append(content);document.querySelector('#contents').append(card);return card;
    };
  },{source:installDiscoveryControls.toString(),prefs});
  return page;
}
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }));
}
async function hidden(page,id,expected=true){await page.waitForFunction(({id,expected})=>(document.getElementById(id)?.getAttribute('data-ytms-discovery-hidden')==='1')===expected,{id,expected});await settle(page);assert.equal(await page.locator('#'+id).isVisible(),!expected);}

test('default settings perform no observation or page changes',async t=>{
  const page=await open(t);assert.deepEqual(await page.evaluate(()=>observerCounts),{constructed:0,observed:0,disconnected:0});
  assert.equal(await page.locator('#ytms-discovery-controls-style').count(),0);assert.equal(await page.locator('a#logo').getAttribute('href'),'/');
});

test('explicit native feed metadata filters independently and preserves recommended-extension content',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000',hideFeedVods:true,hideFeedPlaylists:true,hideFeedDubbed:true,hideFeedCollaborations:true,hideFeedMovies:true});
  await page.evaluate(()=>{
    addCard('low');addCard('normal',{metadata:'2,500 views'});addCard('malformed',{metadata:'1,2 views'});
    addCard('vod',{metadata:'Streamed 2 days ago'});addCard('playlist',{href:'/playlist?list=PLfixture'});
    addCard('dubbed',{metadata:'2K views',badge:'Auto-dubbed'});addCard('collab',{metadata:'3K views',collaboration:true});addCard('movie',{metadata:'3K views',movie:true});
    const queue=document.createElement('ytd-playlist-panel-renderer');queue.append(addCard('queued'));document.body.append(queue);
  });
  for(const id of ['low','vod','playlist','dubbed','collab','movie'])await hidden(page,id);
  for(const id of ['normal','malformed','queued'])await hidden(page,id,false);
  assert.equal(await page.locator('#low .cbCustomThumbnail').getAttribute('src'),'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
  assert.equal(await page.locator('#normal #return-youtube-dislike').textContent(),'42');
  assert.equal(await page.locator('#sponsorBlockMarker').getAttribute('style'),'left:25%');
});

test('recycled metadata clears filters and the shared reveal control remains reversible',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000'});
  await page.evaluate(()=>addCard('row'));await hidden(page,'row');
  await page.evaluate(()=>document.documentElement.setAttribute('data-yt-master-show-filtered','1'));
  assert.equal(await page.locator('#row').isVisible(),true);
  await page.evaluate(()=>{document.documentElement.removeAttribute('data-yt-master-show-filtered');document.querySelector('#row #metadata-line span').textContent='5K views';});
  await hidden(page,'row',false);
  await page.evaluate(()=>{history.pushState({},'','/feed/history');window.dispatchEvent(new Event('yt-navigate-start'));window.dispatchEvent(new Event('yt-navigate-finish'));addCard('history');});
  await hidden(page,'history',false);assert.equal(await page.locator('#row').getAttribute('data-ytms-discovery-reason'),null);
});

for(const [language,count] of [['fr','1,2K vues'],['de','1.234 Aufrufe']])test(`view metadata uses ${language} separators conservatively`,async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'10000'});
  await page.evaluate(({language,count})=>{document.documentElement.lang=language;addCard('local',{metadata:count});}, {language,count});await hidden(page,'local');
});

test('route-specific list and channel options never resize the playing video',async t=>{
  const page=await open(t,{homeList:true,subscriptionsList:false,feedColumns:'4',hideChannelBanner:true,fullWidthChannel:true,hideAllComments:true,hideCommentGifs:true});
  assert.equal(await page.locator('html').getAttribute('data-ytms-discovery-list'),'1');
  assert.equal(await page.locator('ytd-rich-grid-renderer').evaluate(el=>getComputedStyle(el).getPropertyValue('--ytd-rich-grid-items-per-row').trim()),'4');
  assert.deepEqual(await page.locator('#movie_player').evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})),{w:640,h:360});
  await page.evaluate(()=>{history.pushState({},'','/feed/subscriptions');window.dispatchEvent(new Event('yt-navigate-finish'));});await settle(page);
  assert.equal(await page.locator('html').getAttribute('data-ytms-discovery-list'),null);
  await page.evaluate(()=>{history.pushState({},'','/@fixture');window.dispatchEvent(new Event('yt-navigate-finish'));});await settle(page);
  assert.equal(await page.locator('html').getAttribute('data-ytms-discovery-route'),'channel');
  assert.equal(await page.locator('#sponsorBlockMarker').getAttribute('style'),'left:25%');
});

test('native Home navigation is signed-in, bounded and logo clicks retain native SPA handling',async t=>{
  const page=await open(t,{homeRedirect:true,logoToSubscriptions:true});
  await page.evaluate(()=>{
    window.nativeNavigations=0;document.getElementById('subscriptions').addEventListener('click',event=>{event.preventDefault();nativeNavigations++;window.dispatchEvent(new Event('yt-navigate-start'));window.dispatchEvent(new Event('yt-navigate-finish'));});
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });await settle(page);assert.equal(await page.evaluate(()=>nativeNavigations),0);
  await page.evaluate(()=>{const avatar=document.createElement('button');avatar.id='avatar-btn';document.querySelector('ytd-masthead').append(avatar);});await settle(page);
  assert.equal(await page.evaluate(()=>nativeNavigations),1);
  await page.evaluate(()=>{for(let i=0;i<3;i++)window.dispatchEvent(new Event('yt-navigate-finish'));});await settle(page);
  assert.equal(await page.evaluate(()=>nativeNavigations),1);
  await page.locator('a#logo').click();await settle(page);assert.equal(await page.evaluate(()=>nativeNavigations),2);
  assert.equal(await page.locator('a#logo').getAttribute('href'),'/feed/subscriptions');
  await page.evaluate(()=>disposeDiscovery());assert.equal(await page.locator('a#logo').getAttribute('href'),'/');
});

test('Dark Reader keeps theme ownership and disposal removes only Suite-owned state',async t=>{
  const page=await open(t,{interfaceTheme:'light'});assert.equal(await page.locator('html').getAttribute('data-ytms-discovery-theme'),'light');
  await page.evaluate(()=>{const sheet=document.createElement('style');sheet.className='darkreader';document.head.append(sheet);});await settle(page);
  assert.equal(await page.locator('html').getAttribute('data-ytms-discovery-theme'),null);
  await page.evaluate(()=>{document.documentElement.setAttribute('data-unrelated-extension','preserve');disposeDiscovery();});
  assert.equal(await page.locator('#ytms-discovery-controls-style').count(),0);assert.equal(await page.locator('html').getAttribute('data-unrelated-extension'),'preserve');
});

test('AI search controls leave ordinary shelves and manually authored chapters intact',async t=>{
  const page=await open(t,{hideSearchAI:true,hideAIChapters:true},'/results?search_query=fixture');
  await page.evaluate(()=>{
    const search=document.createElement('ytd-search');search.innerHTML='<yt-ai-search-result-section-renderer id="ai">AI result</yt-ai-search-result-section-renderer><ytd-shelf-renderer id="ordinary"><h2 id="title">Related videos</h2></ytd-shelf-renderer>';document.body.append(search);
    for(const [id,label]of[['generated','AI-generated chapters'],['manual','Chapters']]){const panel=document.createElement('ytd-engagement-panel-section-list-renderer');panel.id=id;panel.setAttribute('target-id','engagement-panel-macro-markers-description-chapters');const header=document.createElement('h2');header.id='header';header.textContent=label;panel.append(header);document.body.append(panel);}
  });await settle(page);
  assert.equal(await page.locator('#ai').isVisible(),false);assert.equal(await page.locator('#ordinary').isVisible(),true);
  assert.equal(await page.locator('#generated').isVisible(),false);assert.equal(await page.locator('#manual').isVisible(),true);
  assert.equal(await page.locator('#sponsorBlockMarker').getAttribute('style'),'left:25%');
});

test('a paused channel trailer can be stopped once when autoplay starts, while manual playback is respected',async t=>{
  const page=await open(t,{pauseChannelTrailers:true},'/@fixture');
  await page.evaluate(()=>{
    const host=document.createElement('ytd-channel-video-player-renderer');
    window.trailer=document.createElement('video');host.append(trailer);document.body.append(host);
    window.trailerPauses=0;window.started=false;Object.defineProperty(trailer,'paused',{get:()=>!started});trailer.pause=()=>{trailerPauses++;started=false;};
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });await settle(page);assert.equal(await page.evaluate(()=>trailerPauses),0);
  await page.evaluate(()=>{started=true;trailer.dispatchEvent(new Event('play'));});assert.equal(await page.evaluate(()=>trailerPauses),1);
  await page.evaluate(()=>{trailer.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));started=true;trailer.dispatchEvent(new Event('play'));});
  assert.equal(await page.evaluate(()=>trailerPauses),1);
  assert.equal(await page.locator('#movie_player video').evaluate(video=>video.paused),true);
});

test('native channel-tab default requests only the same channel Videos tab once',async t=>{
  const page=await open(t,{channelDefaultVideos:true},'/@fixture');
  await page.evaluate(()=>{
    const trailerHost=document.createElement('ytd-channel-video-player-renderer');const trailerPlayer=document.createElement('div');trailerPlayer.id='movie_player';const trailer=document.createElement('video');Object.defineProperty(trailer,'paused',{value:false});trailerPlayer.append(trailer);trailerHost.append(trailerPlayer);document.querySelector('ytd-browse').append(trailerHost);
    window.tabClicks=0;const tab=document.createElement('yt-tab-shape');const link=document.createElement('a');link.href='/@fixture/videos';link.textContent='Videos';
    link.addEventListener('click',event=>{event.preventDefault();tabClicks++;window.dispatchEvent(new Event('yt-navigate-finish'));});tab.append(link);document.querySelector('ytd-browse').prepend(tab);
  });await settle(page);assert.equal(await page.evaluate(()=>tabClicks),1);
  await page.evaluate(()=>window.dispatchEvent(new Event('yt-page-data-updated')));await settle(page);assert.equal(await page.evaluate(()=>tabClicks),1);
});

test('one recycled card is reconciled without rescanning the feed or touching native image/title data',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000'});
  await page.evaluate(()=>{for(let i=0;i<100;i++)addCard('card'+i,{metadata:'2K views'});});await settle(page);
  await page.evaluate(()=>{
    window.documentScans=0;const original=document.querySelectorAll;document.querySelectorAll=function(selector){if(selector.includes('ytd-rich-item-renderer'))documentScans++;return original.call(this,selector);};
    document.querySelector('#card50 #metadata-line span').textContent='5 views';
  });await hidden(page,'card50');
  assert.equal(await page.evaluate(()=>documentScans),0);
  assert.equal(await page.locator('#card50 #video-title').textContent(),'LIVE AI playlist collaboration auto-dubbed title');
  assert.equal(await page.locator('#card49 .cbCustomThumbnail').getAttribute('class'),'cbCustomThumbnail');
});

test('thumbnail labels and views styling preserve durations, LIVE badges, creators and sidebar navigation',async t=>{
  const page=await open(t,{hideThumbnailBadges:true,hideViewsIcon:true,viewsSeparateLine:true,homeList:true,listChannelHeaders:true,hideSidebarSubscriptions:true,hideSubscriptionsChannels:true});
  await page.evaluate(()=>{
    const card=addCard('styled',{metadata:'1,234 views'});const meta=card.querySelector('#metadata-line span');meta.prepend(document.createElement('svg'));
    const creator=document.createElement('a');creator.href='/@Creator';creator.textContent='Creator';card.querySelector('ytd-rich-grid-media').append(creator);
    for(const label of ['4K','LIVE','12:34']){const badge=document.createElement('span');badge.className='ytThumbnailOverlayBadgeViewModelHost';badge.textContent=label;card.append(badge);}
    const section=document.createElement('ytd-guide-section-renderer');section.id='channels';const title=document.createElement('h3');title.id='guide-section-title';title.textContent='Subscriptions';section.append(title);document.querySelector('ytd-guide-renderer').append(section);
  });await settle(page);
  assert.equal(await page.locator('#styled .ytThumbnailOverlayBadgeViewModelHost').nth(0).isVisible(),false);
  assert.equal(await page.locator('#styled .ytThumbnailOverlayBadgeViewModelHost').nth(1).isVisible(),true);
  assert.equal(await page.locator('#styled .ytThumbnailOverlayBadgeViewModelHost').nth(2).isVisible(),true);
  assert.equal(await page.locator('#styled #metadata-line svg').isVisible(),false);
  assert.equal(await page.locator('#styled .ytms-discovery-channel-heading a').textContent(),'Creator');
  assert.equal(await page.locator('#channels').isVisible(),false);assert.equal(await page.locator('#subscriptions').isVisible(),true);
  await page.evaluate(()=>disposeDiscovery());assert.equal(await page.locator('.ytms-discovery-channel-heading').count(),0);assert.equal(await page.locator('#styled .ytThumbnailOverlayBadgeViewModelHost').nth(0).isVisible(),true);
});

for(const enabled of [true,false])test(`existing feed cleanup groups can all be ${enabled?'retained':'restored'} independently of filtering`,async t=>{
  const page=await open(t,{},'/feed/history');
  await page.evaluate(()=>{
    window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);};
    document.querySelector('ytd-masthead').insertAdjacentHTML('beforeend','<button id="voice-search-button">Voice</button><button id="notification-button">Notifications</button><button id="create-button">Create</button>');
    document.querySelector('ytd-browse').insertAdjacentHTML('beforeend','<ytd-feed-filter-chip-bar-renderer style="display:block"><div id="chips-content" class="ytd-feed-filter-chip-bar-renderer">Chips</div></ytd-feed-filter-chip-bar-renderer>');
    document.body.insertAdjacentHTML('beforeend','<ytd-two-column-browse-results-renderer><div id="secondary"><ytd-browse-feed-actions-renderer><div id="contents"><button id="feedback">Send feedback</button><button id="clear-history">Clear all watch history</button></div></ytd-browse-feed-actions-renderer></div></ytd-two-column-browse-results-renderer>');
  });
  const source=readFileSync(new URL('../../sources/modules/youtube-feed-ui-cleaner.user.js',import.meta.url),'utf8');
  const keys=['hideHomeCategories','hideNotifications','hideVoiceSearch','hideCreateButton','hideSidebarSections','hideGuideFooter','hideFeedShelves','hideFeedNudges','hideHistoryAuxActions'];
  const config=Object.fromEntries(keys.map(key=>[key,enabled]));
  await page.addScriptTag({content:source.replace('  // Standalone module installs',`  Object.assign(CONFIG,${JSON.stringify(config)});\n  // Standalone module installs`)});
  await settle(page);
  for(const selector of ['#voice-search-button','#notification-button','#create-button','#chips-content','#feedback'])assert.equal(await page.locator(selector).isVisible(),!enabled,selector);
  assert.equal(await page.locator('#clear-history').isVisible(),true);
});

test('restoring Subscriptions reveals only an existing native entry and never invents missing navigation',async t=>{
  const page=await open(t,{restoreSubscriptionsLink:true});
  await page.evaluate(()=>{
    window.originalSubscriptionLinks=document.querySelectorAll('a[href="/feed/subscriptions"]').length;
    const entry=document.createElement('ytd-guide-entry-renderer');entry.id='hidden-native-entry';entry.style.display='none';
    const link=document.createElement('a');link.href='/feed/subscriptions';link.textContent='Native subscriptions';entry.append(link);document.querySelector('ytd-guide-renderer #sections ytd-guide-section-renderer').append(entry);
  });await settle(page);assert.equal(await page.locator('#hidden-native-entry').isVisible(),true);
  assert.equal(await page.locator('a[href="/feed/subscriptions"]').count(),2);
  await page.evaluate(()=>{document.querySelectorAll('a[href="/feed/subscriptions"]').forEach(anchor=>anchor.remove());});await settle(page);
  assert.equal(await page.locator('a[href="/feed/subscriptions"]').count(),0);
  await page.evaluate(()=>disposeDiscovery());assert.equal(await page.locator('#hidden-native-entry').getAttribute('style'),'display: none;');
  assert.equal(await page.locator('[data-ytms-subscriptions-restore]').count(),0);
});

test('Shorts metadata hides only while both pointer and keyboard focus are outside its native host',async t=>{
  const page=await open(t,{shortsHideMetadata:true},'/shorts/aaaaaaaaaaa');
  await page.evaluate(()=>{
    const host=document.createElement('ytd-reel-video-renderer');host.id='short';host.style.cssText='display:block;width:400px;height:120px';
    const meta=document.createElement('yt-reel-metapanel-view-model');meta.id='short-meta';meta.style.display='block';
    const link=document.createElement('a');link.href='/@Creator';link.textContent='Creator';meta.append(link);host.append(meta);document.body.append(host);
  });await page.mouse.move(0,0);await settle(page);
  assert.equal(await page.locator('#short-meta').evaluate(el=>getComputedStyle(el).opacity),'0');
  await page.locator('#short').hover();assert.equal(await page.locator('#short-meta').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.mouse.move(0,0);await page.locator('#short-meta a').focus();assert.equal(await page.locator('#short-meta').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.locator('#short-meta a').evaluate(el=>el.blur());assert.equal(await page.locator('#short-meta').evaluate(el=>getComputedStyle(el).opacity),'0');
});

test('a pure native card removal releases detached ownership without an event or full feed scan',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000',hideThumbnailBadges:true,homeList:true,listChannelHeaders:true});
  await page.evaluate(()=>{
    const card=addCard('removed');const badge=document.createElement('span');badge.className='ytThumbnailOverlayBadgeViewModelHost';badge.textContent='4K';card.append(badge);
    const creator=document.createElement('a');creator.href='/@Creator';creator.textContent='Creator';card.append(creator);
  });await hidden(page,'removed');
  assert.equal(await page.locator('#removed .ytms-discovery-channel-heading').count(),1);
  await page.evaluate(()=>{
    window.removedCard=document.getElementById('removed');window.fullFeedScans=0;
    const original=document.querySelectorAll;document.querySelectorAll=function(selector){if(selector.includes('ytd-rich-item-renderer'))fullFeedScans++;return original.call(this,selector);};
    removedCard.remove();
  });await settle(page);
  assert.deepEqual(await page.evaluate(()=>({
    marker:removedCard.getAttribute('data-ytms-discovery-hidden'),
    badge:removedCard.querySelector('[data-ytms-discovery-badge-hidden]'),
    heading:removedCard.querySelector('.ytms-discovery-channel-heading'),
    scans:fullFeedScans,
  })),{marker:null,badge:null,heading:null,scans:0});
});

for(const channel of [false,true])test(`automatic ${channel?'channel-tab':'Home'} navigation preserves a playing native queue`,async t=>{
  const page=await open(t,channel?{channelDefaultVideos:true}:{homeRedirect:true},channel?'/@fixture':'/');
  await page.evaluate(channel=>{
    window.navigationClicks=0;window.mainPlaying=true;
    const video=document.querySelector('#movie_player video');Object.defineProperty(video,'paused',{get:()=>!mainPlaying});Object.defineProperty(video,'readyState',{value:4});
    const native=document.createElement('ytd-miniplayer');native.style.cssText='display:block;opacity:0';native.append(document.getElementById('movie_player'));document.body.append(native);
    let anchor;
    if(channel){const tab=document.createElement('yt-tab-shape');anchor=document.createElement('a');anchor.href='/@fixture/videos';anchor.textContent='Videos';tab.append(anchor);document.querySelector('ytd-browse').prepend(tab);}
    else{anchor=document.getElementById('subscriptions');const avatar=document.createElement('button');avatar.id='avatar-btn';document.querySelector('ytd-masthead').append(avatar);}
    anchor.addEventListener('click',event=>{event.preventDefault();navigationClicks++;});
    window.dispatchEvent(new Event('yt-page-data-updated'));
  },channel);await settle(page);
  assert.equal(await page.evaluate(()=>navigationClicks),0);
  assert.equal(await page.locator('#movie_player video').evaluate(video=>video.paused),false);
  await page.evaluate(()=>{mainPlaying=false;window.dispatchEvent(new Event('yt-page-data-updated'));});await settle(page);
  assert.equal(await page.evaluate(()=>navigationClicks),1);
});

test('nested modern feed cards release the outer filter marker when recycled metadata becomes eligible',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000'});
  await page.evaluate(()=>{
    const outer=addCard('nested',{metadata:'10 views'}),old=outer.firstElementChild,inner=document.createElement('yt-lockup-view-model');
    inner.id='nested-inner';inner.append(...old.childNodes);old.replaceWith(inner);
  });await hidden(page,'nested');
  await page.evaluate(()=>{document.querySelector('#nested-inner #metadata-line span').textContent='5K views';});
  await hidden(page,'nested',false);
});

test('nested modern list cards receive one creator heading rather than one per renderer wrapper',async t=>{
  const page=await open(t,{homeList:true,listChannelHeaders:true});
  await page.evaluate(()=>{
    const outer=addCard('nested',{metadata:'5K views'}),old=outer.firstElementChild,inner=document.createElement('yt-lockup-view-model');
    const creator=document.createElement('a');creator.href='/@Creator';creator.textContent='Creator';old.append(creator);
    inner.append(...old.childNodes);old.replaceWith(inner);
  });await settle(page);
  assert.equal(await page.locator('#nested .ytms-discovery-channel-heading').count(),1);
});

test('independently owned cards inside an unknown wrapper remain independent',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000'});
  await page.evaluate(()=>{
    const wrapper=document.createElement('div');document.querySelector('#contents').append(wrapper);
    for(const[id,metadata]of[['low','5 views'],['keep','5K views']]){const old=addCard(id,{metadata});const card=document.createElement('yt-lockup-view-model');card.id=id;card.style.display='block';card.append(...old.firstElementChild.childNodes);old.remove();wrapper.append(card);}
  });await hidden(page,'low');await hidden(page,'keep',false);
});

test('moving a native badge between independently queued cards preserves its new owner',async t=>{
  const page=await open(t,{hideThumbnailBadges:true});
  await page.evaluate(()=>{
    const a=addCard('card-a',{metadata:'5K views'});addCard('card-b',{metadata:'5K views'});
    const badge=document.createElement('span');badge.id='moved-badge';badge.className='ytThumbnailOverlayBadgeViewModelHost';badge.textContent='4K';a.append(badge);
  });await settle(page);assert.equal(await page.locator('#moved-badge').isVisible(),false);
  await page.evaluate(()=>{
    document.querySelector('#card-b #metadata-line span').textContent='6K views';
    document.getElementById('card-b').append(document.getElementById('moved-badge'));
  });await settle(page);assert.equal(await page.locator('#moved-badge').isVisible(),false);
});

test('page suspension survives late native navigation and data events until pageshow',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000'});await page.evaluate(()=>addCard('suspended'));await hidden(page,'suspended');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.locator('#suspended').getAttribute('data-ytms-discovery-hidden'),null);
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-finish'));window.dispatchEvent(new Event('yt-page-data-updated'));});await settle(page);
  assert.equal(await page.locator('#suspended').getAttribute('data-ytms-discovery-hidden'),null);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await hidden(page,'suspended');
});

test('an initial pageshow cannot complete an unfinished native SPA transition',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000'});await page.evaluate(()=>addCard('transition'));await hidden(page,'transition');
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-start'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('yt-page-data-updated'));});await settle(page);
  assert.equal(await page.locator('#transition').getAttribute('data-ytms-discovery-hidden'),null);
  await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-finish')));await hidden(page,'transition');
});

test('a restored cached page recovers from its interrupted old SPA transition',async t=>{
  const page=await open(t,{hideFeedLowViews:true,lowViewThreshold:'1000'});await page.evaluate(()=>addCard('restored'));await hidden(page,'restored');
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-start'));window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));});
  await hidden(page,'restored');
});
