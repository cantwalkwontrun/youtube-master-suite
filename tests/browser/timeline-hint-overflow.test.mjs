import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth, navigateWatchFixture } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const base = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const css = `<style>
  #movie_player { width: 1200px; height: 700px; }
  .ytp-progress-bar-container { position:absolute; bottom:40px; left:8px; right:8px; height:16px; }
  .ytp-progress-bar { height:100%; }
  .fixture-clip { position:absolute; top:200px; left:0; width:100%; height:450px; overflow:hidden; pointer-events:none; }
  .ytp-tooltip.ytp-preview { position:absolute; bottom:100px; left:500px; width:200px; height:150px; }
  .ytp-tooltip-bg { width:200px; height:112px; background:#444; }
  .ytp-tooltip-text { height:38px; font-size:14px; line-height:18px; }
  .ytp-tooltip-edu { position:absolute; bottom:150px; left:0; width:200px; height:16px; font-size:12px; line-height:16px; color:white; pointer-events:auto; }
</style>`;
const markup = `<div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
  <div class="fixture-clip"><div class="ytp-tooltip ytp-preview"><div class="ytp-tooltip-edu"><span>Pull up for precise seeking</span></div><div class="ytp-tooltip-bg"></div><div class="ytp-tooltip-text">4:42</div></div></div>`;
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(t, { mode = 'large', clipStyle = '', tipStyle = '', scroll = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  t.after(() => context.close());
  await context.addInitScript(mode => localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({version:1,values:{timelinePreviewSize:mode,theatreMode:false}})), mode);
  const page = await context.newPage();
  const fixtureHtml = base.replace('</head>',css+'</head>').replace('<video class="html5-main-video"></video>','<video class="html5-main-video"></video>'+markup);
  await page.route('**/*', route => route.abort());
  // Explicit Suite health and geometry checks below define fixture readiness.
  await navigateWatchFixture(page, { html: fixtureHtml });
  await page.addScriptTag({ content: suite });
  await waitForSuiteHealth(page, manifest.registeredModules, {timeoutMs:10000});
  await page.evaluate(({ clipStyle, tipStyle, scroll }) => {
    const clip = document.querySelector('.fixture-clip');
    clip.style.cssText = clipStyle;
    document.querySelector('.ytp-tooltip').style.cssText = tipStyle;
    if (scroll) {
      const filler = document.createElement('div');
      filler.style.cssText = 'position:absolute;top:850px;width:1px;height:1px';
      clip.append(filler);
      clip.scrollTop = 40;
    }
  }, { clipStyle, tipStyle, scroll });
  return page;
}

async function visibleHint(page) {
  return page.evaluate(() => {
    const hint = document.querySelector('.ytp-tooltip-edu span'), rect = hint.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { hit: hit === hint, top:rect.top, clipTop:document.querySelector('.fixture-clip').getBoundingClientRect().top,
      imageWidth:document.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,
      scale:document.querySelector('.ytp-tooltip').style.scale };
  });
}

test('a large preview preserves a native hint above an intermediate vertical overflow clip', async t => {
  const page = await fixture(t);
  assert.equal((await visibleHint(page)).hit, true, 'the native hint starts visible');
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(150);
  const result = await visibleHint(page);
  assert.ok(result.imageWidth > 400, JSON.stringify(result));
  assert.equal(result.hit, true, `resizing must not clip the hint: ${JSON.stringify(result)}`);
});

test('horizontal ancestor clipping constrains a large preview without losing the hint', async t => {
  const page = await fixture(t, {clipStyle:'left:400px;width:500px', tipStyle:'left:110px'});
  assert.equal((await visibleHint(page)).hit, true);
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(150);
  const result = await visibleHint(page);
  assert.ok(result.imageWidth > 400, JSON.stringify(result));
  assert.equal(result.hit, true, JSON.stringify(result));
  const geometry = await page.evaluate(() => {
    const clip = document.querySelector('.fixture-clip').getBoundingClientRect();
    const image = document.querySelector('.ytp-tooltip-bg').getBoundingClientRect();
    return {clipLeft:clip.left,clipRight:clip.right,imageLeft:image.left,imageRight:image.right};
  });
  assert.ok(geometry.imageLeft >= geometry.clipLeft && geometry.imageRight <= geometry.clipRight, JSON.stringify(geometry));
});

test('a scrolled clipping ancestor still keeps the native hint visible', async t => {
  const page = await fixture(t, {clipStyle:'overflow:auto',scroll:true});
  assert.equal(await page.locator('.fixture-clip').evaluate(node => node.scrollTop), 40);
  assert.equal((await visibleHint(page)).hit, true);
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(150);
  const result = await visibleHint(page);
  assert.ok(result.imageWidth > 400, JSON.stringify(result));
  assert.equal(result.hit, true, JSON.stringify(result));
});

test('YouTube default leaves native preview and hint untouched', async t => {
  const page = await fixture(t, {mode:'native'});
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(150);
  const result = await visibleHint(page);
  assert.equal(result.imageWidth, 200);
  assert.equal(result.scale, '');
  assert.equal(result.hit, true);
});

test('a rotated clipping ancestor retains the native preview rather than guessing its clip', async t => {
  const page = await fixture(t, {clipStyle:'transform:rotate(1deg);transform-origin:top left'});
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(150);
  const result = await visibleHint(page);
  assert.equal(result.scale, '');
});

test('an independently rotated clipping ancestor retains native presentation', async t => {
  const page = await fixture(t, {clipStyle:'rotate:1deg;transform-origin:top left'});
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(150);
  assert.equal((await visibleHint(page)).scale, '');
});

test('a rotated non-clipping intermediary retains native presentation', async t => {
  const page = await fixture(t, {clipStyle:'overflow:visible;transform:rotate(1deg);transform-origin:top left'});
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(150);
  assert.equal((await visibleHint(page)).scale, '');
});

for (const target of ['.fixture-clip', '.ytp-tooltip-edu']) {
  test(`a non-rectangular clip on ${target} leaves native presentation`, async t => {
    const page = await fixture(t);
    await page.locator(target).evaluate(node => node.style.clipPath = 'circle(49%)');
    await page.locator('.ytp-progress-bar').hover();
    await page.waitForTimeout(150);
    assert.equal((await visibleHint(page)).scale, '');
  });
}

test('an intentionally hidden native hint remains hidden', async t => {
  const page = await fixture(t);
  await page.locator('.ytp-tooltip-edu').evaluate(node => node.style.visibility = 'hidden');
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.ytp-tooltip-edu').evaluate(node => getComputedStyle(node).visibility), 'hidden');
});
