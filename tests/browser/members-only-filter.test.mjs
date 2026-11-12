// Language: en-GB. Synthetic native badges; no live profiles or account data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const source = readFileSync(new URL('../../sources/modules/youtube-feed-ui-cleaner.user.js', import.meta.url), 'utf8');
const bundle = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
const marker = 'data-clean-up-youtube-hidden';
const badges = {
  legacy: '<ytd-badge-supported-renderer><div class="badge badge-style-type-members-only">Members only</div></ytd-badge-supported-renderer>',
  modern: '<yt-badge-view-model><badge-shape><div class="yt-badge-shape__text">Members only</div></badge-shape></yt-badge-view-model>',
  camel: '<badge-shape><span class="ytBadgeShapeBadgeText">Members only</span></badge-shape>',
  metadata: '<div class="yt-content-metadata-view-model__metadata-row"><span class="yt-content-metadata-view-model__metadata-text">Members only</span></div>',
};
async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t, { badge = '', enabled = true, route = '/', compiled = false, preferences = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  const card = `<ytd-rich-item-renderer id="fixture-card"><yt-lockup-view-model><a id="title" href="/watch?v=aaaaaaaaaaa">Synthetic video</a><div id="badges">${badge}</div></yt-lockup-view-model></ytd-rich-item-renderer>`;
  const feed = route.startsWith('/results') ? `<ytd-two-column-search-results-renderer><div id="contents">${card}</div></ytd-two-column-search-results-renderer>` : `<ytd-browse><ytd-rich-grid-renderer>${card}</ytd-rich-grid-renderer></ytd-browse>`;
  await context.route('**/*', r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en-GB"><style>ytd-rich-item-renderer,yt-lockup-view-model,ytd-browse,ytd-rich-grid-renderer{display:block}#fixture-card{min-height:80px}</style><body><ytd-app>${feed}</ytd-app></body></html>` }));
  await page.goto('https://www.youtube.com' + route);
  if (compiled) {
    await page.evaluate(({ enabled, preferences }) => localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { ...preferences, hideMembersOnly: enabled } })), { enabled, preferences });
    await page.addScriptTag({ content: bundle });
    await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true, timeoutMs: 10000, errors });
  } else await page.addScriptTag({ content: `function GM_addStyle(css){const style=document.createElement('style');style.textContent=css;document.head.append(style);}\n` + (enabled ? source : source.replaceAll('membersOnly: true', 'membersOnly: false')) });
  await settle(page);
  return page;
}

for (const [kind, badge] of Object.entries(badges)) for (const route of ['/', '/results?search_query=fixture'])
test(`${kind} members-only badge is hidden on ${route}`, async t => {
  const page = await open(t, { badge, route });
  assert.equal(await page.locator('#fixture-card').getAttribute(marker), '1');
  assert.equal(await page.locator('#fixture-card').getAttribute('data-clean-up-youtube-reason'), 'Members only');
});

test('late native badge labels hide the card and recycling to public restores it', async t => {
  const page = await open(t);
  await page.evaluate(() => document.getElementById('badges').innerHTML = '<yt-badge-view-model><badge-shape><span class="yt-badge-shape__text">Public</span></badge-shape></yt-badge-view-model>');
  await settle(page); assert.equal(await page.locator('#fixture-card').getAttribute(marker), null);
  await page.evaluate(() => document.querySelector('.yt-badge-shape__text').firstChild.data = 'Members only');
  await page.waitForFunction(key => document.getElementById('fixture-card').getAttribute(key) === '1', marker);
  await page.evaluate(() => document.querySelector('.yt-badge-shape__text').firstChild.data = 'Public');
  await page.waitForFunction(key => !document.getElementById('fixture-card').hasAttribute(key), marker);
  await page.evaluate(() => document.getElementById('badges').innerHTML = '<yt-badge-view-model><badge-shape>Members only</badge-shape></yt-badge-view-model>');
  await page.waitForFunction(key => document.getElementById('fixture-card').getAttribute(key) === '1', marker);
  await page.evaluate(() => document.getElementById('badges').replaceChildren());
  await page.waitForFunction(key => !document.getElementById('fixture-card').hasAttribute(key), marker);
});

test('disabled membership filtering leaves explicit members-only badges visible', async t => {
  const page = await open(t, { badge: badges.modern, enabled: false });
  assert.equal(await page.locator('#fixture-card').isVisible(), true);
  assert.equal(await page.locator('#fixture-card').getAttribute(marker), null);
});

test('ordinary titles mentioning members only are not membership badges', async t => {
  const page = await open(t);
  await page.evaluate(() => document.getElementById('title').textContent = 'How members only communities work');
  await settle(page);
  assert.equal(await page.locator('#fixture-card').getAttribute(marker), null);
});

test('a channel-name metadata row mentioning membership is not a members-only label', async t => {
  const page = await open(t, { badge: '<div class="ytContentMetadataViewModelMetadataRow ytContentMetadataViewModelMetadataRowMetadataRowWrap">Members Only Fan Channel</div>' });
  assert.equal(await page.locator('#fixture-card').getAttribute(marker), null);
});

for (const modern of [false,true]) for (const nested of [false,true]) test(`a creator named exactly Members only is not a badge (modern ${modern}, nested ${nested})`, async t => {
  const row=modern?'yt-content-metadata-view-model__metadata-row':'ytContentMetadataViewModelMetadataRow ytContentMetadataViewModelMetadataRowMetadataRowWrap';
  const text=modern?'yt-content-metadata-view-model__metadata-text':'ytContentMetadataViewModelMetadataText';
  const creator=nested?`<span class="${text}"><a href="/@FixtureCreator">Members only</a></span>`:`<a href="/@FixtureCreator"><span class="${text}">Members only</span></a>`;
  const page = await open(t, { badge: `<div class="${row}">${creator}</div>` });
  assert.equal(await page.locator('#fixture-card').getAttribute(marker), null);
});

for(const modern of [false,true]) test(`a real badge beside creator links remains authoritative (modern ${modern})`,async t=>{
  const row=modern?'yt-content-metadata-view-model__metadata-row':'ytContentMetadataViewModelMetadataRow ytContentMetadataViewModelMetadataRowMetadataRowWrap';
  const text=modern?'yt-content-metadata-view-model__metadata-text':'ytContentMetadataViewModelMetadataText';
  const page=await open(t,{badge:`<div class="${row}"><span class="${text}"><a href="/@FixtureCreator">Members only</a></span>${badges.modern}</div>`});
  assert.equal(await page.locator('#fixture-card').getAttribute(marker),'1');
  await page.evaluate(()=>document.querySelector('#badges .yt-badge-shape__text').remove());
  await page.waitForFunction(key=>!document.getElementById('fixture-card').hasAttribute(key),marker);
});

test('accessible native badge labels and class changes reconcile without a page event', async t => {
  const page = await open(t, { badge: '<span id="changing-badge" aria-label="Members only"></span>' });
  assert.equal(await page.locator('#fixture-card').getAttribute(marker), null);
  await page.evaluate(() => document.getElementById('changing-badge').className = 'ytBadgeShapeBadgeText');
  await page.waitForFunction(key => document.getElementById('fixture-card').hasAttribute(key), marker);
  await page.evaluate(() => document.getElementById('changing-badge').setAttribute('aria-label', 'Public'));
  await page.waitForFunction(key => !document.getElementById('fixture-card').hasAttribute(key), marker);
  await page.evaluate(() => document.getElementById('changing-badge').setAttribute('aria-label', 'Members-only'));
  await page.waitForFunction(key => document.getElementById('fixture-card').hasAttribute(key), marker);
});

for (const enabled of [false, true]) test(`compiled saved membership preference ${enabled} controls modern native badge cards`, async t => {
  const page = await open(t, { compiled: true, enabled, badge: '<span>YouTube featured</span>' + badges.modern });
  assert.equal(await page.locator('#fixture-card').getAttribute(marker), enabled ? '1' : null);
  assert.equal(await page.locator('#fixture-card').isVisible(), !enabled);
});

test('hiding thumbnail badges does not override the saved members-only filter choice', async t => {
  for (const enabled of [false, true]) {
    const page = await open(t, { compiled: true, enabled, badge: badges.modern, preferences: { hideThumbnailBadges: true } });
    assert.equal(await page.locator('#fixture-card').getAttribute(marker), enabled ? '1' : null);
    assert.equal(await page.locator('#fixture-card').isVisible(), !enabled);
  }
});
