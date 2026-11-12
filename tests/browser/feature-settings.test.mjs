// Language: en-GB. Integration coverage for the expanded settings catalogue.
import { createFeatureCatalogue } from "../../sources/feature-catalogue.mjs";
import { createMenuLayout } from "../../sources/menu-layout.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { launchFixtureBrowser, waitForSuiteHealth, saveFixtureSettings } from "./fixture-browser.mjs";

const SUITE = readFileSync(new URL("../../youtube-master-suite.user.js", import.meta.url), "utf8");
const MANIFEST = JSON.parse(readFileSync(new URL("../../release-manifest.json", import.meta.url), "utf8"));
const FIXTURE = readFileSync(new URL("./watch-page.html", import.meta.url), "utf8");
const WATCH_URL = "https://www.youtube.com/watch?v=aaaaaaaaaaa&list=fixture-queue";
const KEY = "yt-master-suite.settings.v1";
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

async function openFixture(t, seed, viewport = { width: 1280, height: 900 }, strictTrustedTypes = false, trackSettingsDiscovery = false) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  await context.route("**/*", route => route.request().url().startsWith("https://www.youtube.com/watch?")
    ? route.fulfill({ contentType: "text/html", body: FIXTURE,
      headers: strictTrustedTypes ? { 'Content-Security-Policy': "require-trusted-types-for 'script'; trusted-types 'none'" } : {},
    }) : route.abort());
  if (seed !== undefined) await context.addInitScript(({ key, raw }) => {
    if (window.location.origin !== "https://www.youtube.com") return;
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem(key, raw); sessionStorage.setItem("seeded", "1");
    }
  }, { key: KEY, raw: typeof seed === "string" ? seed : JSON.stringify({ version: 1, values: seed }) });
  const discoveryProbe = () => {
    const nativeFrame = window.requestAnimationFrame.bind(window);
    window.settingsDiscoveryPasses = 0;
    window.requestAnimationFrame = callback => nativeFrame(callback.name === 'installButton' ? timestamp => {
      window.settingsDiscoveryPasses++;
      callback(timestamp);
    } : callback);
  };
  await context.addInitScript({ content: trackSettingsDiscovery ? `(${discoveryProbe.toString()})();\n${SUITE}` : SUITE });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => {
    try {
      assert.deepEqual(errors, []);
      const runtime = await page.getAttribute("html", "data-yt-master-runtime-errors");
      assert.ok(!runtime || runtime === "[]", runtime);
    } finally { await context.close(); }
  });
  await page.goto(WATCH_URL);
  await healthy(page, errors);
  return page;
}
async function healthy(page, errors = []) {
  await waitForSuiteHealth(page, MANIFEST.registeredModules, { timeoutMs: 7000, errors });
}
async function openPanel(page) { await page.locator("#ytms-settings-button").click(); }
async function colour(page, selector) { return page.locator(selector).evaluate(el => getComputedStyle(el).color); }

for (const enabled of [false, true])
test(`compiled miniplayer-restorer preference ${enabled} controls fallback insertion`, async t => {
  const page = await openFixture(t, { theatreMode: false, restoreMiniplayerButton: enabled });
  await page.locator('.ytp-miniplayer-button').evaluate(button => { button.style.display = 'none'; });
  if (enabled) await page.locator('#tmk-miniplayer-button').waitFor();
  else await page.waitForTimeout(650);
  assert.equal(await page.locator('#tmk-miniplayer-button').count(), enabled ? 1 : 0);
  if (!enabled) {
    const css = await page.locator('#yt-master-suite-style').textContent();
    assert.ok(!css.includes('/* miniplayerButtonRestorer */'), 'Disabled restorer must not install its stylesheet');
  }
  await page.locator('.ytp-miniplayer-button').evaluate(button => { button.style.display = ''; });
  await page.locator('#tmk-miniplayer-button').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.ytp-miniplayer-button').isVisible(), true);
});


for (const hiddenBy of ['hidden', 'display', 'opacity', 'visibility', 'aria-hidden', 'inert', 'scale'])
test(`player settings entry follows the current toolbar beside a retained ${hiddenBy} toolbar`, async t => {
  const page = await openFixture(t, { theatreMode: false, mirrorButton: false, playerSettingsIcon: 'monochrome' });
  await page.locator('#ytms-player-settings-button').waitFor();
  await page.evaluate(hiddenBy => {
    const old = document.querySelector('#movie_player .ytp-right-controls');
    const next = old.cloneNode(true);
    next.querySelectorAll('#ytms-player-settings-button, #tmk-miniplayer-button, #ytppl-video-mirror-button').forEach(node => node.remove());
    if (hiddenBy === 'hidden') old.hidden = true;
    if (hiddenBy === 'display') old.style.display = 'none';
    if (hiddenBy === 'opacity') old.style.opacity = '0';
    if (hiddenBy === 'visibility') old.style.visibility = 'hidden';
    if (hiddenBy === 'aria-hidden') old.setAttribute('aria-hidden', 'true');
    if (hiddenBy === 'inert') old.inert = true;
    if (hiddenBy === 'scale') old.style.transform = 'scale(0)';
    old.after(next); window.fixtureCurrentControls = next;
  }, hiddenBy);
  await page.waitForFunction(() => document.getElementById('ytms-player-settings-button')?.closest('.ytp-right-controls') === fixtureCurrentControls);
  assert.equal(await page.locator('#ytms-player-settings-button').count(), 1);
  await page.locator('#ytms-player-settings-button').click();
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(dialog => dialog.open), true);
});

for (const hiddenBy of ['opacity', 'inert', 'scale'])
test(`player settings entry belongs to the visible watch rather than a retained ${hiddenBy} watch`, async t => {
  const page = await openFixture(t, { theatreMode: false, mirrorButton: false, playerSettingsIcon: 'monochrome' });
  await page.locator('#ytms-player-settings-button').waitFor();
  await page.evaluate(hiddenBy => {
    const old = document.querySelector('ytd-watch-flexy');
    const next = old.cloneNode(true);
    next.querySelectorAll('#ytms-player-settings-button, #tmk-miniplayer-button, #ytppl-video-mirror-button').forEach(node => node.remove());
    next.querySelector('#movie_player').getVideoData = old.querySelector('#movie_player').getVideoData;
    if (hiddenBy === 'opacity') old.style.opacity = '0';
    if (hiddenBy === 'inert') old.inert = true;
    if (hiddenBy === 'scale') old.style.transform = 'scale(0)';
    old.after(next); window.fixtureCurrentWatch = next;
  }, hiddenBy);
  await page.waitForFunction(() => document.getElementById('ytms-player-settings-button')?.closest('ytd-watch-flexy') === fixtureCurrentWatch);
  assert.equal(await page.locator('#ytms-player-settings-button').count(), 1);
  await page.locator('#ytms-player-settings-button').click();
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(dialog => dialog.open), true);
});

for (const hiddenBy of ['opacity', 'scale']) test(`player settings stays accessible for a floating player with a zero-height watch owner (${hiddenBy}-hidden retained placeholder)`, async t => {
  const page = await openFixture(t, { theatreMode: false, mirrorButton: false, miniplayerEnabled: false, playerSettingsIcon: 'monochrome' });
  await page.locator('#ytms-player-settings-button').waitFor();
  await page.evaluate(hiddenBy => {
    const owner = document.querySelector('ytd-watch-flexy');
    const player = owner.querySelector('#movie_player');
    const retained = document.createElement('ytd-watch-flexy'); retained.style.cssText = 'display:block;width:500px;height:500px;' + (hiddenBy === 'opacity' ? 'opacity:0' : 'transform:scale(0)');
    const previous = document.createElement('div'); previous.id = 'ytsmp-player-placeholder'; retained.append(previous); owner.before(retained);
    const placeholder = document.createElement('div'); placeholder.id = 'ytsmp-player-placeholder'; owner.append(placeholder);
    owner.style.cssText = 'display:block;height:0';
    document.body.classList.add('ytsmp-scroll-miniplayer-active');
    player.style.cssText = 'position:fixed;top:40px;left:40px;width:640px;height:360px'; document.body.append(player);
    window.fixtureFloatingPlayer = player; window.fixtureFloatingOwner = owner;
    window.dispatchEvent(new Event('yt-page-data-updated'));
  }, hiddenBy);
  await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
  assert.equal(await page.evaluate(() => fixtureFloatingOwner.getBoundingClientRect().height), 0);
  assert.equal(await page.locator('#ytms-player-settings-button').count(), 1);
  assert.equal(await page.locator('#ytms-player-settings-button').evaluate(button => button.closest('#movie_player') === fixtureFloatingPlayer), true);
  await page.locator('#ytms-player-settings-button').click();
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(dialog => dialog.open), true);
});

test('player settings entry recovers after an attribute-only toolbar reveal', async t => {
  const page = await openFixture(t, { theatreMode: false, mirrorButton: false, playerSettingsIcon: 'monochrome' });
  await page.locator('#ytms-player-settings-button').waitFor();
  await page.evaluate(() => {
    window.fixtureCurrentControls = document.querySelector('#movie_player .ytp-right-controls');
    fixtureCurrentControls.hidden = true;
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
  await page.evaluate(() => { fixtureCurrentControls.hidden = false; });
  await page.locator('#ytms-player-settings-button').waitFor({ state: 'visible' });
  await page.locator('#ytms-player-settings-button').click();
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(dialog => dialog.open), true);
});

for (const enabled of [false, true])
test(`compiled membership-offer preference ${enabled} controls native dismissal and remains searchable`, async t => {
  const page = await openFixture(t, { theatreMode: false, dismissMembershipOffers: enabled });
  const saved = await page.evaluate(key => fixtureStorage.getItem(key), KEY);
  await page.evaluate(() => {
    const container = document.createElement('ytd-popup-container');
    const dialog = document.createElement('tp-yt-paper-dialog');
    const offer = document.createElement('ytd-sponsorships-offer-renderer');
    offer.style.cssText = 'display:block;height:100px'; offer.textContent = 'Synthetic membership offer';
    dialog.style.cssText = 'display:block;width:400px'; dialog.append(offer); container.append(dialog);
    document.querySelector('ytd-app').append(container);
    window.fixtureMembershipCloses = 0; dialog.opened = true;
    const backdrop = document.createElement('div'); backdrop.id = 'fixture-membership-backdrop'; document.body.append(backdrop);
    document.body.style.overflow = 'hidden';
    dialog.close = () => {
      fixtureMembershipCloses++; dialog.hidden = true; dialog.opened = false; backdrop.remove(); document.body.style.overflow = '';
      dialog.dispatchEvent(new CustomEvent('iron-overlay-closed', { bubbles: true }));
    };
    dialog.dispatchEvent(new CustomEvent('iron-overlay-opened', { bubbles: true }));
  });
  if (enabled) await page.waitForFunction(() => fixtureMembershipCloses === 1);
  else await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
  assert.equal(await page.evaluate(() => fixtureMembershipCloses), enabled ? 1 : 0);
  assert.equal(await page.locator('#fixture-membership-backdrop').count(), enabled ? 0 : 1);
  if (!enabled) await page.evaluate(() => document.querySelector('tp-yt-paper-dialog').close());
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), KEY), saved);
  await openPanel(page);
  await page.locator('#ytms-settings-search').fill('membership offers');
  await page.locator('#ytms-settings-search-results [data-target="dismissMembershipOffers"]').click();
  assert.equal(await page.locator('#ytms-dismissMembershipOffers').isChecked(), enabled);
  assert.equal(await page.locator('#ytms-tab-interface').getAttribute('aria-selected'), 'true');
});

const features = createFeatureCatalogue().definitions;
test('Hype visibility saves in the existing editor without resetting old submenus and filters unbound overflow after reload',async t=>{
 const old=createMenuLayout().fromPreferences({});old.nodes=old.nodes.filter(node=>node.id!=='hype');
 old.nodes.push({id:'submenu-custom',name:'My menu',parent:'root'});old.nodes.find(node=>node.id==='share').parent='submenu-custom';
 const page=await openFixture(t,{theatreMode:false,menuLayout:old,viewerColour:'#ABCDEF'});
 const initial=await page.evaluate(key=>fixtureStorage.getItem(key),KEY);await openPanel(page);
 await page.locator('#ytms-settings-search').fill('Hype');await page.locator('.settings-search-result[data-target="menuShowHype"]').click();
 assert.equal(await page.locator('#ytms-menuShowHype').isChecked(),true);
 assert.equal(await page.evaluate(key=>fixtureStorage.getItem(key),KEY),initial);
 await page.locator('#ytms-menuShowHype').uncheck();await saveFixtureSettings(page);
 const values=await page.evaluate(key=>JSON.parse(fixtureStorage.getItem(key)).values,KEY);
 assert.equal(values.viewerColour,'#ABCDEF');assert.deepEqual(values.menuLayout.nodes.filter(node=>node.id!=='hype'),old.nodes);
 assert.equal(values.menuLayout.nodes.find(node=>node.id==='hype').visible,false);
 await page.reload();await healthy(page);
 await page.evaluate(()=>{
  const container=document.createElement('ytd-popup-container'),popup=document.createElement('ytd-menu-popup-renderer');popup.id='unbound-overflow';popup.style.cssText='display:block;width:300px';container.append(popup);document.body.append(container);
  const items=[['Save','BOOKMARK_BORDER'],['Hype','HYPE'],['Download','OFFLINE_DOWNLOAD'],['Report','FLAG']].map(([label,icon])=>({menuServiceItemRenderer:{text:{simpleText:label},icon:{iconType:icon},serviceEndpoint:{}}}));
  popup.data={items};for(const item of items){const row=document.createElement('ytd-menu-service-item-renderer');row.style.cssText='display:block;height:40px';row.textContent=item.menuServiceItemRenderer.text.simpleText;row.dataset.label=row.textContent;row.data=item.menuServiceItemRenderer;popup.append(row);}
  popup.dispatchEvent(new CustomEvent('yt-popup-opened',{bubbles:true}));
 });
 await page.waitForFunction(()=>document.querySelector('#unbound-overflow [data-label="Download"]').hasAttribute('data-ytms-native-menu-hidden'));
 assert.equal(await page.locator('#unbound-overflow [data-label="Download"]').isVisible(),false);
 assert.equal(await page.locator('#unbound-overflow [data-label="Hype"]').isVisible(),false);
 assert.equal(await page.locator('#unbound-overflow [data-label="Save"]').isVisible(),true);
});
for (const [key, markup] of [
  ['hideJoinButton','<ytd-video-owner-renderer><div id="sponsor-button" data-contract-target>Join</div></ytd-video-owner-renderer>'],
  ['hideStatementBanners','<ytd-statement-banner-renderer data-contract-target>Statement</ytd-statement-banner-renderer>'],
  ['hideBrandVideoShelf','<ytd-brand-video-shelf-renderer data-contract-target>Brand videos</ytd-brand-video-shelf-renderer>'],
  ['hideStructuredDescription','<ytd-structured-description-content-renderer id="structured-description" data-contract-target>Structured description</ytd-structured-description-content-renderer>'],
]) test(`compiled setting contract: ${key} hides its native surface only when enabled`, async t => {
  for(const enabled of [false,true]) {
    const page=await openFixture(t,{theatreMode:false,[key]:enabled});
    await page.evaluate(markup=>{
      const fixture=document.createElement('div');fixture.innerHTML=markup;
      const target=fixture.querySelector('[data-contract-target]');target.style.cssText='display:block;width:200px;height:50px';
      document.querySelector('ytd-watch-flexy').append(fixture);
    },markup);
    assert.equal(await page.locator('[data-contract-target]').isVisible(),!enabled);
    assert.equal(await page.locator('#movie_player').isVisible(),true);
  }
});

test('compiled setting contract: showAutoplayUpNextCard is independent of the hidden recommendation grid', async t=>{
  for(const enabled of [false,true]) {
    const page=await openFixture(t,{theatreMode:false,hideEndScreens:true,showAutoplayUpNextCard:enabled});
    await page.evaluate(()=>{
      const card=document.createElement('div');card.id='contract-up-next';card.className='ytp-autonav-endscreen-upnext-container';
      card.style.cssText='display:block;width:200px;height:50px';card.textContent='Play now / Cancel';document.getElementById('movie_player').append(card);
    });
    assert.equal(await page.locator('#contract-up-next').isVisible(),enabled);
  }
});

async function featureControl(page, key) {
  const feature = features.find(item => item.key === key);
  await page.locator('#ytms-tab-' + feature.tab).click();
  const input = page.locator('#ytms-' + key);
  const details = input.locator('xpath=ancestor::details[1]');
  if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click();
  return input;
}

test('retired loading settings disappear and the migrated Show films draft can be cancelled or saved', async t => {
  const page = await openFixture(t, { theatreMode: false, hideFeedMovies: true, autoLoadFilteredHome: true,
    showHomeLoadMore: true, homeLoadBatchLimit: '5', homeLoadDelay: '3', miniplayerWidth: 997 });
  const before = await page.evaluate(key => fixtureStorage.getItem(key), KEY);
  await openPanel(page);
  for (const key of ['autoLoadFilteredHome','showHomeLoadMore','homeLoadBatchLimit','homeLoadDelay','hideFeedMovies'])
    assert.equal(await page.locator('#ytms-' + key).count(), 0);
  assert.equal(await page.locator('#ytms-home-load-more').count(), 0);
  const films = await featureControl(page, 'filmVisibility');
  assert.equal(await films.inputValue(), 'none');
  await films.selectOption('paid');
  await page.locator('#ytms-cancel-panel').click();
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), KEY), before);
  await openPanel(page);
  assert.equal(await (await featureControl(page, 'filmVisibility')).inputValue(), 'none');
  await (await featureControl(page, 'filmVisibility')).selectOption('paid');
  await saveFixtureSettings(page);
  const values = await page.evaluate(key => JSON.parse(fixtureStorage.getItem(key)).values, KEY);
  assert.equal(values.filmVisibility, 'paid');
  assert.equal(values.miniplayerWidth, 997);
  assert.equal(Object.hasOwn(values, 'autoLoadFilteredHome'), false);
  assert.equal(Object.hasOwn(values, 'hideFeedMovies'), false);
});

for (const mode of ['all','free','paid','none']) test(`compiled film mode ${mode} owns catalogue filtering while other paid videos remain filtered`, async t => {
  const page=await openFixture(t,{theatreMode:false,filmVisibility:mode,hidePayToWatchCards:true,hideWatchedVideos:false});
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'','/');
    const browse=document.createElement('ytd-browse'),grid=document.createElement('ytd-rich-grid-renderer');browse.append(grid);document.querySelector('ytd-app').append(browse);
    for(const [id,label,rated] of [['filmFree','Free',true],['filmPaid','Pay to watch',true],['otherPaid','Pay to watch',false]]) {
      const card=document.createElement('ytd-rich-item-renderer');card.id=id;card.style.display='block';
      const media=document.createElement('ytd-rich-grid-media'),badge=document.createElement('span');badge.className='yt-badge-shape__text';badge.textContent=label;media.append(badge);
      if(rated){const rating=document.createElement('span');rating.className='ytBadgeShapeBadgeText';rating.textContent='PG';media.append(rating);}
      card.append(media);grid.append(card);
    }
    window.dispatchEvent(new Event('yt-navigate-finish'));window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.waitForFunction(()=>document.querySelector('#otherPaid').getAttribute('data-ytppl-pay-to-watch-hidden')==='1');
  for(const [id,hidden] of [['filmFree',mode==='paid'||mode==='none'],['filmPaid',mode==='free'||mode==='none']]) {
    await page.waitForFunction(({id,hidden})=>(document.getElementById(id).getAttribute('data-ytms-discovery-hidden')==='1')===hidden,{id,hidden});
    assert.equal(await page.locator('#'+id).getAttribute('data-ytppl-pay-to-watch-hidden'),null);
    assert.equal(await page.locator('#'+id).isVisible(),!hidden);
  }
});

for (const [seed,expected] of [[{showFilms:true,hidePayToWatchCards:true},'free'],[{showFilms:true,hidePayToWatchCards:false},'all'],[{hidePayToWatchCards:false},'all']])
  test(`older visible-film record ${JSON.stringify(seed)} retains ${expected} in the menu`,async t=>{
    const page=await openFixture(t,{theatreMode:false,...seed});
    const before=await page.evaluate(key=>fixtureStorage.getItem(key),KEY);
    await openPanel(page);
    assert.equal(await (await featureControl(page,'filmVisibility')).inputValue(),expected);
    await page.locator('#ytms-cancel-panel').click();
    assert.equal(await page.evaluate(key=>fixtureStorage.getItem(key),KEY),before);
  });

test('every optional feature has one labelled searchable control without writing saved settings on open', async t => {
  const page = await openFixture(t, { theatreMode: false, viewerColour: '#ABCDEF' });
  const before = await page.evaluate(key => fixtureStorage.getItem(key), KEY);
  await openPanel(page);
  for (const feature of features) {
    const input = page.locator('#ytms-' + feature.key);
    assert.equal(await input.count(), 1, feature.key);
    assert.ok(await page.locator('label[for="ytms-' + feature.key + '"]').count(), feature.key);
    if (feature.options) assert.equal(await input.locator('option').count(), feature.options.length, feature.key);
  }
  await page.locator('#ytms-settings-search').fill('low-view videos');
  await page.locator('.settings-search-result[data-target="hideFeedLowViews"]').click();
  assert.equal(await page.locator('#ytms-hideFeedLowViews').evaluate(el => el.closest('details').open), true);
  assert.equal(await page.locator('#ytms-hideFeedLowViews').evaluate(el => document.activeElement === el), true);
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), KEY), before);
});

test('opposing menu options update together, persist and preserve prior preferences', async t => {
  const page = await openFixture(t, { theatreMode: false, keepHoverPreviews: true, hideRelated: true, fullscreenComments: true, viewerColour: '#ABCDEF' });
  await openPanel(page);
  await (await featureControl(page, 'relatedBelowPlayer')).check();
  assert.equal(await page.locator('#ytms-hideRelated').isChecked(), false);
  await (await featureControl(page, 'disableVideoPreviews')).check();
  assert.equal(await page.locator('#ytms-keepHoverPreviews').isChecked(), false);
  await (await featureControl(page, 'hideAllComments')).check();
  await saveFixtureSettings(page);
  const values = await page.evaluate(key => JSON.parse(fixtureStorage.getItem(key)).values, KEY);
  assert.equal(values.relatedBelowPlayer, true); assert.equal(values.hideRelated, false);
  assert.equal(values.disableVideoPreviews, true); assert.equal(values.keepHoverPreviews, false);
  assert.equal(values.hideAllComments, true); assert.equal(values.fullscreenComments, false);
  assert.equal(values.viewerColour, '#ABCDEF');
});

test('dependent options and section defaults behave as an editable draft and Cancel preserves storage', async t => {
  const page = await openFixture(t, { theatreMode: false }); await openPanel(page);
  const before = await page.evaluate(key => fixtureStorage.getItem(key), KEY);
  assert.equal(await (await featureControl(page, 'snapshotQuality')).isDisabled(), true);
  await (await featureControl(page, 'snapshotButton')).check();
  await page.locator('#ytms-snapshotFormat').selectOption('jpeg');
  assert.equal(await page.locator('#ytms-snapshotQuality').isDisabled(), false);
  await page.locator('#ytms-snapshotQuality').selectOption('80');
  await (await featureControl(page, 'hideAllComments')).check();
  await page.locator('#ytms-restore-section-defaults').click();
  assert.equal(await page.locator('#ytms-hideAllComments').isChecked(), false);
  await page.locator('#ytms-cancel-panel').click();
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), KEY), before);
});

test('enabled optional factories coexist with retained native player and recommended extension markers', async t => {
  const page = await openFixture(t, { theatreMode: false, snapshotButton: true, transcriptDownload: true,
    originalAudio: true, disableAutoplay: true, disableStableVolume: true, fullWindowTheatre: true, hideNextButton: true });
  await page.locator('#ytms-snapshot-button').waitFor(); await page.locator('#ytms-transcript-button').waitFor();
  const result = await page.evaluate(() => {
    const player = document.getElementById('movie_player'), video = player.querySelector('video');
    const before = { time: video.currentTime, parent: player.parentElement };
    const sponsor = document.createElement('div'); sponsor.id = 'sponsorBlockNotice'; sponsor.className = 'sponsorBlockCategoryTooltip';
    const dearrow = document.createElement('img'); dearrow.className = 'cbCustomThumbnail'; dearrow.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const ryd = document.createElement('span'); ryd.id = 'return-youtube-dislike-number'; ryd.textContent = '42';
    const blocker = document.createElement('style'); blocker.id = 'fixture-blocker'; blocker.textContent = '.synthetic-ad {display:none}';
    player.append(sponsor, dearrow, ryd, blocker);
    window.dispatchEvent(new Event('yt-page-data-updated'));
    return { sameVideo: player.querySelector('video') === video, sameParent: player.parentElement === before.parent,
      sameTime: video.currentTime === before.time, sponsor: sponsor.isConnected, dearrow: dearrow.className, ryd: ryd.textContent, blocker: blocker.textContent };
  });
  assert.deepEqual(result, { sameVideo: true, sameParent: true, sameTime: true, sponsor: true, dearrow: 'cbCustomThumbnail', ryd: '42', blocker: '.synthetic-ad {display:none}' });
});

// Restoring one section must resolve conflicts with an option in another section.
test('section defaults resolve cross-section conflicts before displaying or saving the draft', async t => {
 const page=await openFixture(t,{theatreMode:false,hideAllComments:true,fullscreenComments:false});await openPanel(page);
 await page.locator('#ytms-tab-layout').click();await page.locator('#ytms-restore-section-defaults').click();
 assert.equal(await page.locator('#ytms-fullscreenComments').isChecked(),true);
 assert.equal(await page.locator('#ytms-hideAllComments').isChecked(),false);
 await saveFixtureSettings(page);
 const saved=await page.evaluate(key=>JSON.parse(fixtureStorage.getItem(key)).values,KEY);
 assert.equal(saved.fullscreenComments,true);assert.equal(saved.hideAllComments,false);
});

test('searching a disabled dependent option focuses its controller without changing preferences',async t=>{
 const page=await openFixture(t,{theatreMode:false});await openPanel(page);const before=await page.evaluate(key=>fixtureStorage.getItem(key),KEY);
 await page.locator('#ytms-settings-search').fill('JPEG snapshot quality');await page.locator('.settings-search-result[data-target="snapshotQuality"]').click();
 assert.equal(await page.locator('#ytms-snapshotButton').evaluate(el=>document.activeElement===el),true);
 assert.equal(await page.locator('#ytms-snapshotButton').isChecked(),false);assert.equal(await page.evaluate(key=>fixtureStorage.getItem(key),KEY),before);
});
