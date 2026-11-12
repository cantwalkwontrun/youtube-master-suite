// Language: en-GB. Generated diagnostic-mode lifecycle integration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

test('diagnostic timeline hover releases its native resize registration across navigation', async t => {
  const browser = await launchFixtureBrowser();
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  const url = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
  const base = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
  const html = base.replace('</head>', `<style>
    #movie_player { width:1600px;height:700px }
    .ytp-progress-bar-container { position:absolute;bottom:40px;left:8px;right:8px;height:16px }
    .ytp-progress-bar { height:100% }
    .ytp-tooltip.ytp-preview { position:absolute;bottom:70px;left:500px;width:200px;height:150px }
    .ytp-tooltip-bg { width:200px;height:112px;background:#444 }
    .ytp-tooltip-text { height:38px;font-size:14px;line-height:18px }
    </style></head>`).replace('<video class="html5-main-video"></video>', `<video class="html5-main-video"></video>
    <div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div>
    <div class="ytp-tooltip ytp-preview"><div class="ytp-tooltip-bg"></div><div class="ytp-tooltip-text">41:55</div></div>`);
  await context.route('**/*', route => route.request().url() === url
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version:1, values:{ timelinePreviewSize:'large', theatreMode:false } }));
    const add = window.addEventListener, remove = window.removeEventListener;
    const registrations = new Map();
    window.fixtureResizeRegistrations = registrations;
    window.addEventListener = function(type, listener, options) {
      if (type === 'resize') {
        const captures = registrations.get(listener) || new Set();
        captures.add(typeof options === 'boolean' ? options : Boolean(options?.capture));
        registrations.set(listener, captures);
      }
      return add.call(this, type, listener, options);
    };
    window.removeEventListener = function(type, listener, options) {
      if (type === 'resize') {
        const captures = registrations.get(listener);
        captures?.delete(typeof options === 'boolean' ? options : Boolean(options?.capture));
        if (!captures?.size) registrations.delete(listener);
      }
      return remove.call(this, type, listener, options);
    };
  });
  const generated = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
  const diagnostic = generated.replace('const DIAGNOSTICS = Object.freeze({\n    enabled: false,', 'const DIAGNOSTICS = Object.freeze({\n    enabled: true,');
  assert.notEqual(diagnostic, generated, 'Only the existing diagnostic flag is enabled in this fixture');
  await page.addScriptTag({ content: diagnostic });
  const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
  await waitForSuiteHealth(page, manifest.registeredModules, { requireReady:true });
  const count = () => page.evaluate(() => [...fixtureResizeRegistrations.values()].reduce((sum, values) => sum + values.size, 0));
  const baseline = await count();
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.mouse.move(5, 5);
    await page.locator('.ytp-progress-bar').hover();
    await page.waitForFunction(() => document.querySelector('.ytp-tooltip.ytp-preview').style.scale !== '');
    assert.equal(await count(), baseline + 1, 'Active timeline owns exactly one additional native resize callback');
    await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-start')));
    assert.equal(await count(), baseline, 'Stopping hover removes the exact registered callback');
    await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-finish')));
  }
});
