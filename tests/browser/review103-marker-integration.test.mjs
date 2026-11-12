// Language: en-GB. Generated-Suite media insertion/removal with synthetic pixels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createPlayheadMarker } from '../../sources/playhead-marker.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));

test('generated Suite restores the saved marker as nested video arrives and leaves', async t => {
  const browser = await launchFixtureBrowser(); t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en-GB"><style>
    #movie_player{position:relative;width:640px;height:360px} .ytp-progress-bar{position:absolute;bottom:20px;width:600px;height:8px}
    .ytp-scrubber-container,.ytp-scrubber-button{width:12px;height:12px} .ytp-scrubber-container{position:relative}
    </style><body><ytd-app><ytd-watch-flexy><div id="movie_player"><div class="html5-video-container"></div>
    <div class="ytp-progress-bar"><div class="ytp-scrubber-container"><div class="ytp-scrubber-button"></div></div></div>
    </div></ytd-watch-flexy></ytd-app></body></html>` }));
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  assert.equal(await page.evaluate(async factory => {
    const service = (0, eval)(`(${factory})`)({ document, window, getStorage: () => localStorage });
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
    canvas.getContext('2d').fillRect(0, 0, 24, 24);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const prepared = await service.prepareFile(new File([blob], 'synthetic.png', { type: 'image/png' }));
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { theatreMode: false, miniplayerEnabled: false } }));
    return prepared.ok && service.save(prepared.value).ok;
  }, createPlayheadMarker.toString()), true);
  await page.addScriptTag({ content: suite });
  await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
  await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
  assert.equal(await page.locator('.ytms-playhead-marker').count(), 0);
  await page.evaluate(() => document.querySelector('.html5-video-container').append(document.createElement('video')));
  await page.locator('[data-ytms-playhead-marker="1"] > .ytms-playhead-marker').waitFor();
  await page.locator('video').evaluate(video => video.remove());
  await page.locator('.ytms-playhead-marker').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.ytp-scrubber-button').evaluate(node => getComputedStyle(node).opacity), '1');
  assert.deepEqual(errors, []);
});
