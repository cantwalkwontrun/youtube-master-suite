import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const SUITE = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const BASE = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
const KEY = 'yt-master-suite.settings.v1';
const CSS = `<style>
  #movie_player { width: min(100vw - 32px, 1600px); height: 700px; }
  .ytp-progress-bar-container { position:absolute; bottom:40px; left:8px; right:8px; height:16px; z-index:3; }
  .ytp-progress-bar { height:100%; }
  .ytp-tooltip { position:absolute; bottom:70px; left:500px; width:200px; height:150px; z-index:2; }
  .ytp-tooltip-bg { width:200px; height:112px; border-radius:8px;
    background-image:linear-gradient(45deg,red,blue); background-size:1000px 560px; background-position:-400px -224px; }
  .ytp-tooltip-text { height:38px; color:white; background:#222; font-size:14px; line-height:18px; overflow:hidden; }
  .ytp-tooltip-edu { position:absolute; bottom:150px; left:0; width:200px; text-align:center; font-size:12px; line-height:16px; }
</style>`;
const MARKUP = `<div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
  <div class="ytp-tooltip ytp-preview"><div class="ytp-tooltip-edu">Pull up for precise seeking</div><div class="ytp-tooltip-bg"></div><div class="ytp-tooltip-text"><span>4:42 Video starts</span></div></div>`;
const FLOATING_SETUP = `<script>
  const host=document.getElementById('player'), anchor=document.createElement('div');
  anchor.id='single-column-container'; host.before(anchor); anchor.append(host);
  const movie=document.getElementById('movie_player'), chrome=document.createElement('div');
  chrome.className='ytp-chrome-bottom'; chrome.style.cssText='position:absolute;bottom:0;height:56px;width:100%';
  const controls=movie.querySelector('.ytp-right-controls'); controls.style.cssText='position:absolute;bottom:0;right:0';
  chrome.append(movie.querySelector('.ytp-progress-bar-container'),controls); movie.append(chrome);
</script>`;
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(t, mode = 'auto', viewport = { width: 1920, height: 1080 }, {miniplayer=false}={}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ KEY, mode, miniplayer }) => localStorage.setItem(KEY, JSON.stringify({ version:1,
    values:{ timelinePreviewSize:mode, theatreMode:false, miniplayerEnabled:miniplayer } })), { KEY, mode, miniplayer });
  await page.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?') ?
    route.fulfill({ contentType:'text/html', body:BASE.replace('</head>', CSS + '</head>')
      .replace('<video class="html5-main-video"></video>', '<video class="html5-main-video"></video>' + MARKUP)
      .replace('</body>', `${miniplayer?FLOATING_SETUP:''}<script>${SUITE}</script></body>`) }) : route.abort());
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(page, MANIFEST.registeredModules, { timeoutMs:10000, errors });
  return page;
}
async function hover(page) {
  await page.locator('.ytp-progress-bar').hover({timeout:3000});
  await page.waitForTimeout(80);
}
async function geometry(page) {
  return page.evaluate(() => {
    const node = document.querySelector('.ytp-tooltip'), image = node.querySelector('.ytp-tooltip-bg');
    const rect = element => { const r=element.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
    return { tip:rect(node), image:rect(image), player:rect(document.getElementById('movie_player')),
      labels:[...node.querySelectorAll('.ytp-tooltip-edu, .ytp-tooltip-text')].map(rect),
      track:rect(document.querySelector('.ytp-progress-bar-container')), scale:node.style.scale,
      nativeWidth:node.style.width, background:getComputedStyle(image).backgroundPosition,
      backgroundSize:getComputedStyle(image).backgroundSize };
  });
}
for (const [mode, expected] of [['auto',320], ['small',240], ['medium',320], ['large',480], ['native',200]]) {
  test(`${mode} preview uses the requested width without altering the storyboard sprite`, async t => {
    const page = await fixture(t, mode); await hover(page);
    const g = await geometry(page);
    assert.ok(Math.abs(g.image.width - expected) < 1, JSON.stringify(g));
    assert.equal(g.background, '-400px -224px'); assert.equal(g.backgroundSize, '1000px 560px');
    assert.equal(g.nativeWidth, '');
    if (mode === 'native') assert.equal(g.scale, '');
  });
}
test('Large preserves hint size, enlarges combined time and chapter, and restores styles', async t => {
  const page = await fixture(t, 'large');
  const labels = page.locator('.ytp-tooltip-edu, .ytp-tooltip-text span');
  const native = await labels.evaluateAll(nodes => nodes.map(node => ({
    font: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight),
    inlineFont: node.style.fontSize, inlineLine: node.style.lineHeight,
  })));
  await hover(page);
  const scaled = await labels.evaluateAll(nodes => nodes.map(node => ({
    font: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight),
    scale: parseFloat(node.closest('.ytp-tooltip').style.scale),
  })));
  for (let i = 0; i < native.length; i++) {
    const boost = i === 0 ? 1 : 1.3;
    assert.ok(Math.abs(scaled[i].font * scaled[i].scale - native[i].font * boost) < .15);
    assert.ok(Math.abs(scaled[i].line * scaled[i].scale - native[i].line * boost) < .15);
  }
  await page.mouse.move(10, 10);
  assert.deepEqual(await labels.evaluateAll(nodes => nodes.map(node => ({
    font: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight),
    inlineFont: node.style.fontSize, inlineLine: node.style.lineHeight,
  }))), native);
});
for (const width of [1024, 1920]) {
  test(`time-only label is slightly larger and readable at ${width}px, then restores`, async t => {
    const page = await fixture(t, 'large', { width, height:1080 });
    const timestamp = page.locator('.ytp-tooltip-text');
    await timestamp.evaluate(node => { node.textContent = '2:41'; });
    const before = await timestamp.evaluate(node => ({
      font:parseFloat(getComputedStyle(node).fontSize), background:node.style.backgroundColor,
      colour:node.style.color, inlineFont:node.style.fontSize,
    }));
    await hover(page);
    const after = await timestamp.evaluate(node => ({
      font:parseFloat(getComputedStyle(node).fontSize), background:getComputedStyle(node).backgroundColor,
      colour:getComputedStyle(node).color, scale:parseFloat(node.closest('.ytp-tooltip').style.scale),
      playerWidth:document.querySelector('#movie_player').getBoundingClientRect().width,
    }));
    const boost = 1.15 + .15 * Math.max(0, Math.min(1, (after.playerWidth - 400) / 1200));
    assert.ok(Math.abs(after.font * after.scale - before.font * boost) < .15, JSON.stringify(after));
    assert.equal(after.background, 'rgb(34, 34, 34)', 'timestamp itself keeps its native background');
    assert.equal(after.colour, 'rgb(255, 255, 255)');
    await page.mouse.move(10, 10);
    assert.deepEqual(await timestamp.evaluate(node => ({
      font:parseFloat(getComputedStyle(node).fontSize), background:node.style.backgroundColor,
      colour:node.style.color, inlineFont:node.style.fontSize,
    })), before);
  });
}
for (const width of [800, 1920]) {
  test(`chapter label follows player width at ${width}px without shrinking Large`, async t => {
    const page = await fixture(t, 'large', { width, height:1080 });
    await page.locator('.ytp-tooltip-text').evaluate(node => {
      node.className = 'ytp-tooltip-title';
      node.textContent = 'A chapter title';
      node.style.cssText = 'height:38px;color:white;background:transparent;font-size:14px;line-height:18px';
    });
    const chapter = page.locator('.ytp-tooltip-title');
    const before = await chapter.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    await hover(page);
    const result = await chapter.evaluate(node => ({
      font: parseFloat(getComputedStyle(node).fontSize),
      scale: parseFloat(node.closest('.ytp-tooltip').style.scale),
      playerWidth: document.querySelector('#movie_player').getBoundingClientRect().width,
      imageWidth: document.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,
      textBottom: node.getBoundingClientRect().bottom,
      trackTop: document.querySelector('.ytp-progress-bar-container').getBoundingClientRect().top,
    }));
    const boost = 1.15 + .15 * Math.max(0, Math.min(1, (result.playerWidth - 400) / 1200));
    assert.ok(Math.abs(result.font * result.scale - before * boost) < .15, JSON.stringify(result));
    assert.ok(Math.abs(result.imageWidth - 480) < 1, JSON.stringify(result));
    assert.ok(result.textBottom <= result.trackTop, JSON.stringify(result));
    await page.mouse.move(10, 10);
    assert.equal(await chapter.evaluate(node => node.style.fontSize), '14px');
  });
}
test('a combined time and chapter label keeps native colours', async t => {
  const page = await fixture(t, 'large');
  const label = page.locator('.ytp-tooltip-text');
  const before = await label.evaluate(node => ({ colour:getComputedStyle(node).color, background:getComputedStyle(node).backgroundColor }));
  await hover(page);
  assert.deepEqual(await label.evaluate(node => ({ colour:getComputedStyle(node).color, background:getComputedStyle(node).backgroundColor })), before);
  assert.equal(await label.evaluate(node => node.style.backgroundColor), '');
  assert.notEqual(await label.locator('span').evaluate(node => getComputedStyle(node).textShadow), 'none',
    'a combined timestamp and chapter remains readable over bright footage');
});
test('native preview mode leaves a time-only timestamp entirely unchanged', async t => {
  const page = await fixture(t, 'native');
  const timestamp = page.locator('.ytp-tooltip-text');
  await timestamp.evaluate(node => {
    node.textContent = '2:41'; node.style.background = 'transparent';
    const pill = document.createElement('div'); pill.className = 'ytp-tooltip-bottom-text';
    pill.style.cssText = 'height:38px;border-radius:20px;background-color:rgba(0,0,0,.5)';
    node.replaceWith(pill); pill.append(node);
  });
  const before = await timestamp.evaluate(node => node.getAttribute('style'));
  await hover(page);
  assert.equal(await timestamp.evaluate(node => node.getAttribute('style')), before);
});
for (const dark of [true, false]) {
  test(`native rounded timestamp pill is less transparent in ${dark ? 'dark' : 'light'} theme`, async t => {
    const page = await fixture(t, 'large');
    await page.evaluate(dark => document.documentElement.toggleAttribute('dark', dark), dark);
    await page.locator('.ytp-tooltip-text').evaluate(node => {
      node.textContent = '2:41';
      node.style.background = 'transparent';
      const pill = document.createElement('div');
      pill.className = 'ytp-tooltip-bottom-text';
      pill.style.cssText = 'height:38px;border-radius:20px;background-color:rgba(0,0,0,.5)';
      node.replaceWith(pill); pill.append(node);
    });
    await hover(page);
    assert.deepEqual(await page.locator('.ytp-tooltip-text').evaluate(node => ({
      background:getComputedStyle(node).backgroundColor, colour:getComputedStyle(node).color,
      pill:getComputedStyle(node.parentElement).backgroundColor,
      radius:getComputedStyle(node.parentElement).borderTopLeftRadius,
    })), { background:'rgba(0, 0, 0, 0)', colour:'rgb(255, 255, 255)', pill:'rgba(0, 0, 0, 0.65)', radius:'20px' });
    assert.notEqual(await page.locator('.ytp-tooltip-edu').evaluate(node => getComputedStyle(node).textShadow), 'none');
    await page.mouse.move(10, 10);
    assert.equal(await page.locator('.ytp-tooltip-bottom-text').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0.5)');
    assert.equal(await page.locator('.ytp-tooltip-edu').evaluate(node => node.style.textShadow), '');
  });
}
test('unrecognised, opaque, square or image-backed timestamp backgrounds are left alone', async t => {
  const page = await fixture(t, 'large');
  const stamp = page.locator('.ytp-tooltip-text');
  await stamp.evaluate(node => {
    node.textContent='2:41'; node.style.background='transparent';
    const pill=document.createElement('div'); pill.className='ytp-tooltip-bottom-text';
    pill.style.cssText='height:38px;border-radius:20px;background-color:rgba(0,0,0,.5)';
    node.replaceWith(pill); pill.append(node);
  });
  for (const style of [
    'height:38px;border-radius:0;background-color:rgba(0,0,0,.5)',
    'height:38px;border-radius:20px;background-color:rgb(0,0,0)',
    'height:38px;border-radius:20px;background-color:rgba(0,0,0,.5);background-image:linear-gradient(black,transparent)',
  ]) {
    await page.mouse.move(10,10);
    await page.locator('.ytp-tooltip-bottom-text').evaluate((node, css) => { node.style.cssText=css; }, style);
    const before=await page.locator('.ytp-tooltip-bottom-text').evaluate(node=>node.style.backgroundColor);
    await hover(page);
    assert.equal(await page.locator('.ytp-tooltip-bottom-text').evaluate(node=>node.style.backgroundColor),before);
  }
});
test('time-only pill preserves another extension’s later background changes after hover', async t => {
  const page = await fixture(t, 'large');
  const stamp = page.locator('.ytp-tooltip-text');
  await stamp.evaluate(node => {
    node.textContent='2:41';
    const pill=document.createElement('div'); pill.className='ytp-tooltip-bottom-text';
    pill.style.cssText='height:38px;border-radius:20px;background-color:rgba(0,0,0,.5)';
    node.replaceWith(pill); pill.append(node);
  });
  await hover(page);
  await page.locator('.ytp-tooltip-bottom-text').evaluate(node => node.style.setProperty('background-color','rgb(10, 20, 30)','important'));
  await page.waitForTimeout(100); await page.mouse.move(10,10);
  assert.deepEqual(await page.locator('.ytp-tooltip-bottom-text').evaluate(node => [node.style.getPropertyValue('background-color'),node.style.getPropertyPriority('background-color')]), ['rgb(10, 20, 30)','important']);
});
test('forced colours keep system timestamp colours while retaining a larger time', async t => {
  const page = await fixture(t, 'large');
  await page.emulateMedia({ forcedColors:'active' });
  assert.equal(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), true);
  const stamp = page.locator('.ytp-tooltip-text');
  await stamp.evaluate(node => {
    node.textContent='2:41';
    const pill=document.createElement('div'); pill.className='ytp-tooltip-bottom-text';
    pill.style.cssText='height:38px;border-radius:20px;background-color:rgba(0,0,0,.5)';
    node.replaceWith(pill); pill.append(node);
  });
  const before = await stamp.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  await hover(page);
  const result = await stamp.evaluate(node => ({
    background:node.style.backgroundColor, colour:node.style.color,
    font:parseFloat(getComputedStyle(node).fontSize), scale:parseFloat(node.closest('.ytp-tooltip').style.scale),
  }));
  assert.equal(result.background, '');
  assert.equal(result.colour, '');
  assert.equal(await stamp.evaluate(node => node.style.textShadow), '');
  assert.equal(await page.locator('.ytp-tooltip-bottom-text').evaluate(node => node.style.backgroundColor), 'rgba(0, 0, 0, 0.5)');
  assert.equal(await page.locator('.ytp-tooltip-edu').evaluate(node => node.style.textShadow), '');
  assert.ok(result.font * result.scale > before);
});

test('timestamp and instruction shadows remain visible over white without changing pill shape', async t => {
  const page = await fixture(t, 'large');
  const hint = page.locator('.ytp-tooltip-edu');
  const stamp = page.locator('.ytp-tooltip-text');
  await page.evaluate(() => {
    const player = document.querySelector('#movie_player');
    player.style.background = '#fff';
    const hint = document.querySelector('.ytp-tooltip-edu');
    hint.style.color = '#fff';
    hint.innerHTML = '<span style="color:#fff;text-shadow:none">Pull up for precise seeking</span>';
    const stamp = document.querySelector('.ytp-tooltip-text');
    stamp.style.cssText = 'height:38px;color:#fff;background:transparent';
    stamp.innerHTML = '<span style="color:#fff;text-shadow:none">2:41</span>';
  });
  await hover(page);
  for (const locator of [hint.locator('span'), stamp.locator('span')]) {
    const result = await locator.evaluate(node => ({
      shadow: getComputedStyle(node).textShadow,
      background: getComputedStyle(node).backgroundColor,
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
    }));
    assert.notEqual(result.shadow, 'none');
    assert.equal(result.background, 'rgba(0, 0, 0, 0)');
    assert.ok(result.width > 0 && result.height > 0);
    const png = await locator.screenshot();
    const darkPixels = await page.evaluate(async encoded => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) count++;
      }
      return count;
    }, png.toString('base64'));
    assert.ok(darkPixels > 10, `Expected visible dark shadow pixels on white, got ${darkPixels}`);
  }
  await page.mouse.move(10, 10);
  assert.equal(await hint.locator('span').evaluate(node => node.style.textShadow), 'none');
  assert.equal(await stamp.locator('span').evaluate(node => node.style.textShadow), 'none');
});

test('later extension text-shadow changes are retained after the preview closes', async t => {
  const page = await fixture(t, 'large');
  const stamp = page.locator('.ytp-tooltip-text');
  await stamp.evaluate(node => { node.textContent = '2:41'; });
  await hover(page);
  await stamp.evaluate(node => node.style.setProperty('text-shadow', '1px 1px 1px blue', 'important'));
  await page.waitForTimeout(100);
  await page.mouse.move(10, 10);
  assert.deepEqual(await stamp.evaluate(node => [node.style.getPropertyValue('text-shadow'), node.style.getPropertyPriority('text-shadow')]),
    ['blue 1px 1px 1px', 'important']);
});

for (const mode of ['small', 'large']) {
  test(`${mode} preview retains a consistent rendered shadow thickness`, async t => {
    const page = await fixture(t, mode);
    await page.locator('.ytp-tooltip-text').evaluate(node => { node.textContent = '2:41'; });
    await hover(page);
    const geometry = await page.locator('.ytp-tooltip-text').evaluate(node => {
      const player = document.querySelector('#movie_player');
      const preview = node.closest('.ytp-tooltip');
      const lengths = [...getComputedStyle(node).textShadow.matchAll(/(-?\d*\.?\d+)px/g)].map(match => Number(match[1]));
      return { blur:lengths[2], scale:parseFloat(preview.style.scale),
        playerScale:player.getBoundingClientRect().width / player.offsetWidth };
    });
    assert.ok(Math.abs(geometry.blur * geometry.scale * geometry.playerScale - 2) < .1, JSON.stringify(geometry));
  });
}
test('timestamp pill is styled separately from its chapter title', async t => {
  const page = await fixture(t, 'large');
  await page.locator('.ytp-tooltip-text').evaluate(node => {
    node.textContent = '';
    const pill = document.createElement('span'); pill.className='ytp-tooltip-progress-bar-pill';
    pill.style.cssText='border-radius:20px;background-color:rgba(0,0,0,.5)';
    const stamp = document.createElement('span'); stamp.className='ytp-tooltip-progress-bar-pill-time-stamp'; stamp.textContent='2:41';
    const title = document.createElement('span'); title.className='ytp-tooltip-progress-bar-pill-title'; title.textContent='Chapter';
    pill.append(stamp, document.createTextNode(' '), title); node.append(pill);
  });
  await hover(page);
  const result = await page.evaluate(() => {
    const stamp=document.querySelector('.ytp-tooltip-progress-bar-pill-time-stamp');
    const title=document.querySelector('.ytp-tooltip-progress-bar-pill-title');
    return { stampBg:getComputedStyle(stamp).backgroundColor, titleBg:getComputedStyle(title).backgroundColor,
      pillBg:getComputedStyle(stamp.parentElement).backgroundColor,
      stampFont:parseFloat(getComputedStyle(stamp).fontSize), titleFont:parseFloat(getComputedStyle(title).fontSize),
      stampShadow:getComputedStyle(stamp).textShadow, titleShadow:title.style.textShadow };
  });
  assert.equal(result.stampBg, 'rgba(0, 0, 0, 0)');
  assert.equal(result.pillBg, 'rgba(0, 0, 0, 0.65)');
  assert.equal(result.titleBg, 'rgba(0, 0, 0, 0)');
  assert.ok(Math.abs(result.stampFont - result.titleFont) < .1);
  assert.notEqual(result.stampShadow, 'none');
  assert.equal(result.titleShadow, '', 'a separate chapter title keeps its native shadow');
});
test('recognised out-of-flow and wrapping labels are bounded or safely left native at both edges', async t => {
  const page = await fixture(t, 'large');
  for (const left of [-60, 1490]) {
    await page.mouse.move(10, 10);
    await page.locator('.ytp-tooltip').evaluate((node, left) => {
      node.style.left = left + 'px';
      node.querySelector('.ytp-tooltip-edu').style.lineHeight = 'normal';
      node.querySelector('.ytp-tooltip-edu').textContent = 'Pull up for precise seeking and additional long instructions that may wrap';
    }, left);
    await hover(page);
    const result = await page.evaluate(() => {
      const tip = document.querySelector('.ytp-tooltip'), image = tip.querySelector('.ytp-tooltip-bg').getBoundingClientRect();
      const player = document.querySelector('#movie_player').getBoundingClientRect(), track = document.querySelector('.ytp-progress-bar-container').getBoundingClientRect();
      const labels = [...tip.querySelectorAll('.ytp-tooltip-edu, .ytp-tooltip-text')].map(node => node.getBoundingClientRect());
      return { scale: tip.style.scale, safe: labels.every(r => r.left >= Math.max(0, player.left) && r.right <= Math.min(innerWidth, player.right) &&
        r.top >= Math.max(0, player.top) && r.bottom <= Math.min(innerHeight, player.bottom, track.top) &&
        !(r.left < image.right - 1 && r.right > image.left + 1 && r.top < image.bottom - 1 && r.bottom > image.top + 1)) };
    });
    assert.ok(!result.scale || result.safe, JSON.stringify(result));
  }
});
test('unrecognised preview labels do not receive resized presentation', async t => {
  const page = await fixture(t, 'large');
  await page.locator('.ytp-tooltip').evaluate(node => {
    node.querySelector('.ytp-tooltip-edu').className = 'unknown-label';
    node.querySelector('.ytp-tooltip-text').className = 'unknown-timestamp';
  });
  await hover(page);
  assert.equal((await geometry(page)).scale, '');
});
test('oversized label trees and images outside the preview box are left native', async t => {
  const page = await fixture(t, 'large');
  await page.locator('.ytp-tooltip-text').evaluate(node => {
    for (let index = 0; index < 140; index++) node.append(document.createTextNode(' '));
  });
  await hover(page);
  assert.equal((await geometry(page)).scale, '');
  await page.mouse.move(10, 10);
  await page.locator('.ytp-tooltip-text').evaluate(node => node.replaceChildren(document.createTextNode('4:42')));
  await page.locator('.ytp-tooltip-bg').evaluate(node => node.style.width = '300px');
  await hover(page);
  assert.equal((await geometry(page)).scale, '');
});
test('mixed unknown text and excessively long labels leave native sizing untouched', async t => {
  const page = await fixture(t, 'large');
  await page.locator('.ytp-tooltip').evaluate(node => {
    const unknown = document.createElement('span'); unknown.className = 'unknown-label';
    unknown.textContent = 'Additional label'; node.append(unknown);
  });
  await hover(page); assert.equal((await geometry(page)).scale, '');
  await page.mouse.move(10, 10);
  await page.locator('.ytp-tooltip').evaluate(node => {
    node.querySelector('.unknown-label').remove();
    node.querySelector('.ytp-tooltip-edu').textContent = 'x'.repeat(2049);
  });
  await hover(page); assert.equal((await geometry(page)).scale, '');
});
test('external label font changes remain intact when preview sizing ends', async t => {
  const page = await fixture(t, 'large'); await hover(page);
  const text = page.locator('.ytp-tooltip-text span');
  await text.evaluate(node => node.style.setProperty('font-size', '19px', 'important'));
  await page.waitForTimeout(80);
  await page.mouse.move(10, 10);
  assert.deepEqual(await text.evaluate(node => [node.style.getPropertyValue('font-size'), node.style.getPropertyPriority('font-size')]), ['19px', 'important']);
});
for (const viewport of [{width:1024,height:768}, {width:2560,height:1440}, {width:3840,height:2160}]) {
  test(`automatic preview fits a ${viewport.width}px viewport and follows player resizing`, async t => {
    const page = await fixture(t, 'auto', viewport); await hover(page);
    const initial = await geometry(page);
    assert.ok(Math.abs(initial.image.width - Math.max(192, Math.min(480, initial.player.width * .2))) < 1, JSON.stringify(initial));
    await page.evaluate(() => { const p=document.getElementById('movie_player'); p.style.width='400px'; p.style.height='260px'; });
    await hover(page);
    const g = await geometry(page);
    assert.ok(g.tip.left >= g.player.left+7 && g.tip.right <= g.player.right-7, JSON.stringify(g));
    assert.ok(g.tip.top >= g.player.top+7 && g.tip.bottom <= g.track.top-7, JSON.stringify(g));
  });
}
for (const left of [-60, 1490]) {
  test(`preview is clamped at the ${left < 0 ? 'left' : 'right'} timeline edge`, async t => {
    const page = await fixture(t, 'large');
    await page.locator('.ytp-tooltip').evaluate((n,left) => n.style.left=left+'px', left);
    await hover(page); const g=await geometry(page);
    assert.ok(g.tip.left >= g.player.left+7 && g.tip.right <= g.player.right-7, JSON.stringify(g));
    await page.locator('.ytp-tooltip').evaluate(n => n.style.left='400px');
    await page.waitForTimeout(80);
    assert.ok(Math.abs((await geometry(page)).image.width-480)<1);
  });
}
test('preview preserves native inline geometry and restores only its own styles on leave', async t => {
  const page=await fixture(t); await hover(page);
  assert.notEqual((await geometry(page)).scale, '');
  await page.mouse.move(10,10); await page.waitForTimeout(50);
  assert.equal((await geometry(page)).scale, '');
  await hover(page);
  await page.locator('.ytp-tooltip').evaluate(n => n.style.setProperty('scale','1.1','important'));
  await page.waitForTimeout(50); await page.mouse.move(10,10);
  assert.equal((await geometry(page)).scale, '1.1');
});
test('no competing transforms, ordinary text tooltips or precise-seeking surfaces are resized', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(n => n.style.transform='translateX(3px)');
  await hover(page); assert.equal((await geometry(page)).scale, '');
  await page.mouse.move(10,10);
  await page.locator('.ytp-tooltip').evaluate(n => { n.style.transform=''; n.classList.remove('ytp-preview'); });
  await hover(page); assert.equal((await geometry(page)).scale, '');
});
test('late native preview insertion and viewport changes are handled only during a hover', async t => {
  const page=await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(n => { window.preview=n; n.remove(); });
  await hover(page);
  await page.evaluate(() => document.getElementById('movie_player').append(window.preview));
  await page.waitForFunction(() => document.querySelector('.ytp-tooltip').style.scale !== '');
  await page.setViewportSize({width:1280,height:900}); await hover(page);
  assert.ok(Math.abs((await geometry(page)).image.width-249.6)<1);
  await page.mouse.move(10,10); await page.waitForTimeout(50);
  await page.evaluate(() => {
    window.ownedWrites=0; new MutationObserver(records => { window.ownedWrites+=records.length; })
      .observe(document.querySelector('.ytp-tooltip'), {attributes:true,attributeFilter:['style']});
  });
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => window.ownedWrites),0);
});
test('navigation and pagehide restore presentation without touching playback', async t => {
  const page=await fixture(t);
  for (const name of ['yt-navigate-start','pagehide']) {
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow'))); await hover(page);
    assert.notEqual((await geometry(page)).scale,'');
    const before=await page.locator('video').evaluate(v => ({time:v.currentTime,paused:v.paused,src:v.getAttribute('src')}));
    await page.evaluate(name => window.dispatchEvent(new Event(name)),name);
    assert.equal((await geometry(page)).scale,'');
    assert.deepEqual(await page.locator('video').evaluate(v => ({time:v.currentTime,paused:v.paused,src:v.getAttribute('src')})),before);
    await page.mouse.move(10,10);
  }
});

test('fullscreen layout notifications do not cancel an existing timeline hover', async t => {
  const page=await fixture(t); await hover(page);
  await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange')));
  await page.waitForTimeout(80);
  assert.notEqual((await geometry(page)).scale,'');
});
test('Player settings expose the size selector with normal save, revert and defaults behaviour', async t => {
  const page=await fixture(t);
  await page.locator('#ytms-settings-button').click(); await page.locator('#ytms-tab-player').click();
  const control=page.locator('#ytms-timelinePreviewSize');
  assert.equal(await page.getByText('The preview may briefly flicker or resize near SponsorBlock segments or chapter boundaries.', { exact: false }).count(),1);
  assert.equal(await control.inputValue(),'auto');
  await control.selectOption('large'); assert.equal(await page.locator('#ytms-save-preview').isEnabled(),true);
  await control.selectOption('auto'); assert.equal(await page.locator('#ytms-save-preview').isDisabled(),true);
  await control.selectOption('medium'); await page.locator('#ytms-save-preview').click();
  assert.equal(await page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).values.timelinePreviewSize,KEY),'medium');
});

test('transformed scroll players use visible dimensions, not their unscaled layout size', async t => {
  const page=await fixture(t);
  await page.locator('#movie_player').evaluate(n => { n.style.transformOrigin='top left'; n.style.transform='scale(.5)'; });
  await hover(page); const g=await geometry(page);
  assert.ok(Math.abs(g.image.width-192)<1,JSON.stringify(g));
  assert.ok(g.tip.left >= g.player.left+7 && g.tip.right <= g.player.right-7,JSON.stringify(g));
});

test('native sprite dimensions and positioning can change while the preview remains open', async t => {
  const page=await fixture(t); await hover(page);
  await page.locator('.ytp-tooltip-bg').evaluate(n => { n.style.width='160px'; n.style.backgroundPosition='-160px -90px'; });
  await page.locator('.ytp-tooltip').evaluate(n => { n.style.width='160px'; n.style.left='900px'; });
  await page.waitForTimeout(80); const g=await geometry(page);
  assert.ok(Math.abs(g.image.width-320)<1,JSON.stringify(g));
  assert.equal(g.background,'-160px -90px'); assert.equal(g.nativeWidth,'160px');
  await page.mouse.move(10,10); assert.equal((await geometry(page)).nativeWidth,'160px');
});

test('removed players restore owned styles and are not retained as active observers', async t => {
  const page=await fixture(t); await hover(page);
  await page.locator('#movie_player').evaluate(n => { window.oldPlayer=n; n.remove(); });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.oldPlayer.querySelector('.ytp-tooltip').style.scale),'');
});

for (const dark of [true,false]) {
  test(`timeline preview keeps native colours in ${dark?'dark':'light'} mode`, async t => {
    const page=await fixture(t);
    await page.evaluate(dark=>document.documentElement.toggleAttribute('dark',dark),dark);
    const before=await page.locator('.ytp-tooltip-text').evaluate(n=>({colour:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor}));
    await hover(page);
    assert.deepEqual(await page.locator('.ytp-tooltip-text').evaluate(n=>({colour:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor})),before);
  });
}

test('entering and exiting real page fullscreen recalculates the preview for the new player area', async t => {
  const page=await fixture(t); await hover(page);
  await page.mouse.move(10,10);
  await page.locator('#page-fullscreen').click();
  await page.waitForFunction(()=>Boolean(document.fullscreenElement));
  await hover(page); const g=await geometry(page);
  assert.ok(Math.abs(g.image.width-Math.max(192,Math.min(480,g.player.width*.2)))<1,JSON.stringify(g));
  assert.ok(g.tip.left>=g.player.left+7 && g.tip.right<=g.player.right-7,JSON.stringify(g));
  await page.evaluate(()=>document.exitFullscreen());
  await page.waitForFunction(()=>!document.fullscreenElement);
  await hover(page); assert.ok(Math.abs((await geometry(page)).image.width-320)<1);
});

test('native timeline pointer and click handlers still receive their events', async t => {
  const page=await fixture(t);
  await page.evaluate(()=>{
    window.seekEvents=[];
    const track=document.querySelector('.ytp-progress-bar');
    for(const name of ['pointerdown','pointerup','click']) track.addEventListener(name,e=>window.seekEvents.push([name,e.defaultPrevented]));
  });
  await hover(page); await page.locator('.ytp-progress-bar').click();
  assert.deepEqual(await page.evaluate(()=>window.seekEvents),[['pointerdown',false],['pointerup',false],['click',false]]);
});

test('hovering a compact native miniplayer never installs preview sizing there', async t => {
  const page=await fixture(t);
  await page.locator('#movie_player').evaluate(p=>{
    const mini=document.createElement('ytd-miniplayer'); p.replaceWith(mini); mini.append(p);
  });
  await hover(page); assert.equal((await geometry(page)).scale,'');
});

async function floatPlayer(page) {
  await page.mouse.move(10,10);
  await page.evaluate(()=>window.scrollTo(0,900));
  await page.waitForFunction(()=>document.body.classList.contains('ytsmp-scroll-miniplayer-active') &&
    document.getElementById('movie_player')?.parentElement===document.body);
  await hover(page);
}

test('scroll-miniplayer timestamp stays proportional and retains a readable backing', async t => {
  const page = await fixture(t, 'large', { width:1920, height:1080 }, { miniplayer:true });
  const timestamp = page.locator('.ytp-tooltip-text');
  await timestamp.evaluate(node => {
    node.textContent = '2:41'; node.style.background = 'transparent';
    const pill = document.createElement('div'); pill.className = 'ytp-tooltip-bottom-text';
    pill.style.cssText = 'height:38px;border-radius:20px;background-color:rgba(0,0,0,.5)';
    node.replaceWith(pill); pill.append(node);
  });
  const nativeFont = await timestamp.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  await floatPlayer(page);
  const result = await timestamp.evaluate(node => {
    const player = document.querySelector('#movie_player');
    return { font:parseFloat(getComputedStyle(node).fontSize),
      scale:parseFloat(node.closest('.ytp-tooltip').style.scale),
      background:getComputedStyle(node.parentElement).backgroundColor,
      width:player.getBoundingClientRect().width };
  });
  const boost = 1.15 + .15 * Math.max(0, Math.min(1, (result.width - 400) / 1200));
  assert.ok(Number.isFinite(result.scale));
  assert.ok(Math.abs(result.font * Math.max(1, result.scale) - nativeFont * boost) < .15, JSON.stringify(result));
  assert.equal(result.background, 'rgba(0, 0, 0, 0.65)');
});

for (const mode of ['auto','small','medium','large']) {
  test(`${mode} preview is proportionate to the real scroll miniplayer and follows its resizing`, async t=>{
    const page=await fixture(t,mode,{width:1920,height:1080},{miniplayer:true});
    const before=await page.evaluate(KEY=>({settings:localStorage.getItem(KEY),id:fixture.playerId,
      time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused}),KEY);
    await floatPlayer(page);
    const assertFloating=g=>{
      const fraction=({auto:.2,small:.2,medium:320/1200,large:.4})[mode];
      const desired=g.player.width*fraction;
      const labelTop=Math.min(g.tip.top,...g.labels.map(label=>label.top));
      const labelBottom=Math.max(g.tip.bottom,...g.labels.map(label=>label.bottom));
      // Font compensation makes text height independent of the image scale;
      // check the rendered union rather than a fixed native-height ratio.
      assert.ok(g.image.width<=desired+1,JSON.stringify(g));
      assert.ok(labelBottom-labelTop<=g.player.height*.45+1,JSON.stringify(g));
      if (g.image.width<desired-1) assert.ok(labelBottom-labelTop>=g.player.height*.45-2,JSON.stringify(g));
      assert.ok(g.tip.height<=g.player.height*.45+1,JSON.stringify(g));
      assert.ok(g.tip.left>=g.player.left+7 && g.tip.right<=g.player.right-7,JSON.stringify(g));
      assert.ok(g.tip.top>=g.player.top+7 && g.tip.bottom<=g.track.top-7,JSON.stringify(g));
    };
    const original=await geometry(page); assertFloating(original);
    await page.setViewportSize({width:1280,height:900}); await hover(page);
    const smaller=await geometry(page); assertFloating(smaller);
    assert.ok(smaller.player.width<original.player.width);
    assert.ok(smaller.image.width<original.image.width);
    assert.deepEqual(await page.evaluate(KEY=>({settings:localStorage.getItem(KEY),id:fixture.playerId,
      time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused}),KEY),before);
  });
}

test('Large returns to its normal target after leaving the real scroll miniplayer', async t=>{
  const page=await fixture(t,'large',{width:1920,height:1080},{miniplayer:true});
  await hover(page); assert.ok(Math.abs((await geometry(page)).image.width-480)<1);
  await floatPlayer(page); assert.ok((await geometry(page)).image.width<300);
  await page.mouse.move(10,10); await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForFunction(()=>!document.body.classList.contains('ytsmp-scroll-miniplayer-active') &&
    document.getElementById('movie_player')?.parentElement?.id==='player');
  await hover(page); assert.ok(Math.abs((await geometry(page)).image.width-480)<1);
});

test('fullscreen entered from the floating player restores Large and returns to proportionate sizing on exit', async t=>{
  const page=await fixture(t,'large',{width:1920,height:1080},{miniplayer:true});
  await floatPlayer(page);
  await page.locator('.ytp-fullscreen-button').click();
  await page.waitForFunction(()=>document.fullscreenElement?.id==='movie_player' &&
    !document.body.classList.contains('ytsmp-scroll-miniplayer-active'));
  await hover(page); assert.ok(Math.abs((await geometry(page)).image.width-480)<1);
  await page.evaluate(()=>document.exitFullscreen());
  await page.waitForFunction(()=>!document.fullscreenElement);
  await floatPlayer(page); assert.ok((await geometry(page)).image.width<300);
});

for(const imageHeight of [150,300]) {
  test(`Large floating previews with ${imageHeight}px-tall native images remain below the height limit`,async t=>{
    const page=await fixture(t,'large',{width:1920,height:1080},{miniplayer:true});
    await page.locator('.ytp-tooltip-bg').evaluate((n,h)=>n.style.height=h+'px',imageHeight);
    await page.locator('.ytp-tooltip').evaluate((n,h)=>n.style.height=(h+38)+'px',imageHeight);
    await page.locator('.ytp-tooltip-edu').evaluate((n,h)=>n.style.bottom=(h+38)+'px',imageHeight);
    await floatPlayer(page); const g=await geometry(page);
    assert.ok(g.image.width<=g.player.width*.4+1,JSON.stringify(g));
    assert.ok(g.tip.height<=g.player.height*.45+1,JSON.stringify(g));
    assert.ok(g.tip.bottom<=g.track.top-7,JSON.stringify(g));
  });
}

test('YouTube default does not gain floating preview styles',async t=>{
  const page=await fixture(t,'native',{width:1920,height:1080},{miniplayer:true});
  await floatPlayer(page);
  assert.equal((await geometry(page)).scale,'');
});
