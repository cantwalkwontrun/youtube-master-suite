import { wrapFixtureUserscript } from './fixture-gm-storage.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const base = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const css = `<style>
  #movie_player { width: 1600px; height: 700px; }
  .ytp-progress-bar-container { position:absolute; bottom:40px; left:8px; right:8px; height:16px; }
  .ytp-progress-bar { height:100%; }
  .ytp-tooltip.ytp-preview { position:absolute; bottom:70px; left:500px; width:200px; height:150px; }
  .ytp-tooltip-bg { width:200px; height:112px; background:#444; }
  .ytp-tooltip-text { height:38px; font-size:14px; line-height:18px; }
  .ytp-tooltip-edu { position:absolute; bottom:150px; left:0; width:200px; font-size:12px; line-height:16px; }
</style>`;
const markup = `<div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
  <div class="ytp-tooltip ytp-preview"><div class="ytp-tooltip-edu">Pull up for precise seeking</div><div class="ytp-tooltip-bg"></div><div class="ytp-tooltip-text"><span>41:55</span></div></div>`;
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(t) {
  const context = await browser.newContext({ viewport:{width:1920,height:1080} });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({version:1,values:{timelinePreviewSize:'large',theatreMode:false}})));
  await page.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?') ?
    route.fulfill({contentType:'text/html',body:base.replace('</head>',css+'</head>')
      .replace('<video class="html5-main-video"></video>','<video class="html5-main-video"></video>'+markup)
      .replace('</body>',`<script>${wrapFixtureUserscript(suite)}</script></body>`)}) : route.abort());
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  // Explicit Suite health and geometry checks below define fixture readiness.
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa', { waitUntil: 'domcontentloaded' });
  await waitForSuiteHealth(page, manifest.registeredModules, {timeoutMs:10000,errors});
  await page.locator('.ytp-progress-bar').hover();
  await page.waitForFunction(() => document.querySelector('.ytp-tooltip.ytp-preview').style.scale !== '');
  return page;
}

test('unrecognised synthetic chapter labels safely fall back to native size', async t => {
  const page = await fixture(t);
  const before = await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width);
  assert.ok(Math.abs(before-480)<1);
  await page.locator('.ytp-tooltip').evaluate(node => {
    const chapter = document.createElement('span');
    chapter.className = 'ytp-tooltip-chapter-title';
    chapter.textContent = 'AI bubble, AI hype';
    node.append(chapter);
  });
  await page.waitForTimeout(200);
  const after = await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width);
  assert.ok(Math.abs(after-200)<1, `Unsupported preview changed from ${before} to ${after}px`);
});

test('hidden native duration and shortcut labels do not disable Large after hover begins', async t => {
  const page = await fixture(t);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-480)<1);
  await page.locator('.ytp-tooltip').evaluate(node => {
    // These element names and ownership follow the locally cached YouTube player template;
    // visibility is synthetic and must be verified separately in the live player.
    const duration = document.createElement('div'); duration.className = 'ytp-tooltip-duration';
    duration.hidden = true; duration.textContent = '1:16:00'; node.querySelector('.ytp-tooltip-bg').append(duration);
    const title = document.createElement('div'); title.className = 'ytp-tooltip-bottom-text';
    const shortcut = document.createElement('div'); shortcut.className = 'ytp-tooltip-keyboard-shortcut';
    shortcut.hidden = true; shortcut.textContent = 'Keyboard shortcut'; title.append(shortcut); node.append(title);
  });
  await page.waitForTimeout(200);
  const after = await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width);
  assert.ok(Math.abs(after-480)<1, `Hidden native labels shrank the preview to ${after}px`);
});

test('CSS-hidden unknown labels stay safe, but visible aria-hidden labels fail open', async t => {
  const page = await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(node => {
    const container = document.createElement('div'); container.style.display = 'none';
    const label = document.createElement('span'); label.className = 'fixture-unknown';
    label.textContent = 'Unknown label'; container.append(label); node.append(container);
  });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-480)<1);
  await page.locator('.fixture-unknown').evaluate(node => {
    node.parentElement.style.display = '';
    node.setAttribute('aria-hidden', 'true');
  });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-200)<1);
});

test('Large persists through a late native-style progress-bar pill mode switch', async t => {
  const page = await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(node => {
    // The cached player template has this pill either inside its text wrapper
    // or as a tooltip child depending on the player experiment.
    node.classList.add('ytp-tooltip-progress-bar-style');
    node.querySelector('.ytp-tooltip-text').hidden = true;
    const pill = document.createElement('div'); pill.className = 'ytp-tooltip-progress-bar-pill';
    pill.style.cssText = 'position:absolute;left:0;top:112px;width:200px;height:38px;white-space:nowrap';
    const time = document.createElement('span'); time.className = 'ytp-tooltip-progress-bar-pill-time-stamp';
    time.textContent = '41:55';
    const title = document.createElement('span'); title.className = 'ytp-tooltip-progress-bar-pill-title';
    title.textContent = ' AI bubble, AI hype';
    pill.append(time, title); node.append(pill);
  });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-480)<1);
  await page.locator('.ytp-tooltip').evaluate(node => {
    node.classList.remove('ytp-tooltip-progress-bar-style');
    node.querySelector('.ytp-tooltip-progress-bar-pill').remove();
    node.querySelector('.ytp-tooltip-text').hidden = false;
  });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-480)<1);
});

test('visibility-hidden recognised labels do not trigger image-overlap fallback', async t => {
  const page = await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(node => {
    const label = document.createElement('div'); label.className = 'ytp-tooltip-title';
    label.textContent = 'Hidden title';
    label.style.cssText = 'position:absolute;left:0;top:0;width:150px;height:25px;visibility:hidden';
    node.append(label);
  });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-480)<1);
  await page.locator('.ytp-tooltip-title').evaluate(node => { node.style.visibility = 'visible'; });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-200)<1);
});

test('visible descendants of hidden recognised labels remain protected', async t => {
  const page = await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(node => {
    const label = document.createElement('div'); label.className = 'ytp-tooltip-title';
    label.style.cssText = 'position:absolute;left:0;top:0;width:150px;height:25px;visibility:hidden';
    const child = document.createElement('span'); child.style.visibility = 'visible';
    child.textContent = 'Visible title'; label.append(child); node.append(label);
  });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-200)<1);
});

test('a visible recognised label with hidden text can still paint over the image', async t => {
  const page = await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(node => {
    const label = document.createElement('div'); label.className = 'ytp-tooltip-title';
    label.style.cssText = 'position:absolute;left:0;top:0;width:150px;height:25px;background:red';
    const child = document.createElement('span'); child.style.visibility = 'hidden';
    child.textContent = 'Hidden title'; label.append(child); node.append(label);
  });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-200)<1);
});

test('losing preview class restores owned styles and disconnects text observation', async t => {
  const page = await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(node => { node.classList.remove('ytp-preview'); });
  await page.waitForFunction(() => document.querySelector('.ytp-tooltip').style.scale === '');
  await page.locator('.ytp-tooltip-text span').evaluate(node => { node.firstChild.data = 'Changed while not a preview'; });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.ytp-tooltip').evaluate(node => node.style.scale), '');
  await page.locator('.ytp-tooltip').evaluate(node => { node.classList.add('ytp-preview'); });
  await page.waitForFunction(() => document.querySelector('.ytp-tooltip').style.scale !== '');
});

test('direct text-node updates on the preview trigger bounded reconciliation', async t => {
  const page = await fixture(t);
  await page.locator('.ytp-tooltip').evaluate(node => {
    const span = document.createElement('span'); span.className = 'fixture-live-unknown';
    span.appendChild(document.createTextNode('  ')); node.append(span);
  });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-480)<1);
  await page.locator('.fixture-live-unknown').evaluate(node => { node.firstChild.data = 'Unknown text'; });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-200)<1);
  await page.locator('.fixture-live-unknown').evaluate(node => { node.firstChild.data = '  '; });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-480)<1);
  await page.mouse.move(10,10);
  await page.locator('.fixture-live-unknown').evaluate(node => { node.firstChild.data = 'Unknown text'; });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.ytp-tooltip').evaluate(node => node.style.scale), '');
});

test('character-data observation follows replaced preview and ignores other player text', async t => {
  const page = await fixture(t);
  await page.evaluate(() => {
    const player = document.querySelector('#movie_player');
    const other = document.createElement('span'); other.id = 'fixture-player-time';
    other.append(document.createTextNode('0')); player.append(other);
    window.fixtureStyleChanges = 0;
    window.fixtureStyleObserver = new MutationObserver(records => { window.fixtureStyleChanges += records.length; });
    window.fixtureStyleObserver.observe(document.querySelector('.ytp-tooltip'), {attributes:true,attributeFilter:['style']});
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.fixtureStyleChanges = 0;
    const other = document.querySelector('#fixture-player-time').firstChild;
    for (let i = 0; i < 200; i++) other.data = String(i);
  });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.fixtureStyleChanges), 0);
  await page.evaluate(() => {
    const old = document.querySelector('.ytp-tooltip'); window.fixtureOldPreview = old;
    const next = old.cloneNode(true);
    for (const name of ['scale','translate','transform-origin']) next.style.removeProperty(name);
    for (const child of next.querySelectorAll('*')) {
      child.style.removeProperty('font-size'); child.style.removeProperty('line-height');
    }
    old.replaceWith(next);
  });
  await page.waitForFunction(() => document.querySelector('.ytp-tooltip').style.scale !== '');
  await page.locator('.ytp-tooltip').evaluate(node => {
    const span = document.createElement('span'); span.className = 'fixture-live-unknown';
    span.appendChild(document.createTextNode('  ')); node.append(span);
  });
  await page.waitForTimeout(120);
  await page.locator('.fixture-live-unknown').evaluate(node => { node.firstChild.data = 'Visible unknown'; });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-200)<1);
});

test('a persistent competing transform retains native sizing', async t => {
  const page = await fixture(t);
  const before = await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width);
  assert.ok(Math.abs(before-480)<1);
  await page.locator('.ytp-tooltip').evaluate(node => { node.style.transform = 'translateX(3px)'; });
  await page.waitForTimeout(200);
  const after = await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width);
  assert.ok(Math.abs(after-200)<1, `Competing transform changed preview from ${before} to ${after}px`);
});

test('preview remains Large when a recognised timestamp gains a chapter title', async t => {
  const page = await fixture(t);
  const before = await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width);
  assert.ok(Math.abs(before-480)<1);
  await page.locator('.ytp-tooltip-text span').evaluate(node => { node.textContent = '41:55 AI bubble, AI hype'; });
  await page.waitForTimeout(200);
  const after = await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width);
  assert.ok(Math.abs(after-480)<1, `Preview shrank from ${before} to ${after}px`);
});

test('Large resumes after a temporary native tooltip animation ends', async t => {
  const page = await fixture(t);
  const before = await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width);
  assert.ok(Math.abs(before-480)<1);
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '@keyframes fixture-tooltip-motion { from { transform: translateX(4px); } to { transform: translateX(0px); } } .fixture-tooltip-animating { animation: fixture-tooltip-motion .3s linear; }';
    document.head.append(style);
    document.querySelector('.ytp-tooltip').classList.add('fixture-tooltip-animating');
  });
  await page.waitForTimeout(700);
  const state = await page.locator('.ytp-tooltip').evaluate(node => ({
    width:node.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,
    transform:getComputedStyle(node).transform,
    scale:node.style.scale,
  }));
  assert.equal(state.transform, 'none');
  assert.ok(Math.abs(state.width-480)<1, JSON.stringify(state));
});

test('Large resumes after a native tooltip transform transitions back to none', async t => {
  const page = await fixture(t);
  assert.ok(Math.abs(await page.locator('.ytp-tooltip-bg').evaluate(n => n.getBoundingClientRect().width)-480)<1);
  await page.locator('.ytp-tooltip').evaluate(node => {
    node.style.transition = 'transform 300ms linear';
    node.style.transform = 'translateX(4px)';
  });
  await page.waitForTimeout(120);
  await page.locator('.ytp-tooltip').evaluate(node => { node.style.transform = ''; });
  await page.waitForTimeout(700);
  const state = await page.locator('.ytp-tooltip').evaluate(node => ({
    width:node.querySelector('.ytp-tooltip-bg').getBoundingClientRect().width,
    transform:getComputedStyle(node).transform,
    scale:node.style.scale,
  }));
  assert.equal(state.transform, 'none');
  assert.ok(Math.abs(state.width-480)<1, JSON.stringify(state));
});

test('motion events after pointer exit do not resume preview assistance', async t => {
  const page = await fixture(t);
  await page.mouse.move(10,10);
  assert.equal(await page.locator('.ytp-tooltip').evaluate(node => node.style.scale), '');
  await page.locator('.ytp-tooltip').evaluate(node => {
    for (const type of ['animationend','animationcancel','transitionend','transitioncancel']) {
      node.dispatchEvent(new Event(type, {bubbles:true}));
    }
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.ytp-tooltip').evaluate(node => node.style.scale), '');
});
