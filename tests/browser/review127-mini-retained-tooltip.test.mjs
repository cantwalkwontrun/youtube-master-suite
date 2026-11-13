// Language: en-GB. Synthetic retained focus must not displace a visible native tooltip.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { installMiniplayerControls } from '../../sources/miniplayer-controls.mjs';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
const settle = page => page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });

for (const compiled of [false, true]) for (const navigation of [false, true]) test(`retained hidden Play focus cannot displace the visible Play tooltip (${compiled ? 'Suite' : 'source'}, navigation ${navigation})`, async t => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en-GB"><style>ytd-miniplayer{display:block;width:400px}#movie_player{position:relative;width:400px;height:225px}.ytp-miniplayer-controls{display:flex;align-items:center;width:200px;margin:80px 20px}.ytp-play-button{width:40px;height:40px}.ytp-tooltip{position:absolute;pointer-events:none;height:24px}.ytp-tooltip-bottom-text{padding:4px 8px}</style><body><ytd-miniplayer><div id="movie_player" data-generation="old"><div class="ytp-miniplayer-ui"><div class="ytp-miniplayer-controls"><button class="ytp-play-button">Play</button></div></div><div class="ytp-tooltip ytp-bottom"><div class="ytp-tooltip-text-wrapper"><div class="ytp-tooltip-bottom-text">Play</div></div></div></div></ytd-miniplayer></body></html>' }) : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    // Close the focused page before removing its Firefox context. Keep cleanup
    // failures visible, alongside every runtime assertion below.
    try { await page.close(); assert.deepEqual(errors, []); }
    finally { await context.close(); }
  });
  await page.goto('https://www.youtube.com/');
  await page.evaluate(() => {
    window.bindPlayer = player => {
      player.getPlaylist = () => ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'];
      player.getPlaylistIndex = () => 1; player.getVideoData = () => ({ video_id: 'bbbbbbbbbbb' });
      player.nextVideo = player.previousVideo = () => { throw new Error('Tooltip changes must not navigate'); };
    };
    bindPlayer(document.querySelector('#movie_player'));
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { miniplayerNavigation: navigation, miniplayerEnabled: false, theatreMode: false } }));
  });
  if (compiled) {
    await page.addScriptTag({ content: readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8') });
    const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
    await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
  } else await page.evaluate(({ factory, navigation }) => { window.disposeMini = (0, eval)(`(${factory})`)({ document, window, preferences: { miniplayerNavigation: navigation } }); }, { factory: installMiniplayerControls.toString(), navigation });
  await page.mouse.move(700, 500); await page.keyboard.press('Tab'); await page.locator('.ytp-play-button').focus();
  await page.evaluate(() => {
    const old = document.querySelector('#movie_player'), next = old.cloneNode(true);
    next.dataset.generation = 'new'; next.querySelectorAll('[data-ytms-mini-nav-button]').forEach(button => button.remove());
    next.style.removeProperty('--ytms-mini-play-tip-x'); next.style.removeProperty('--ytms-mini-play-tip-y');
    bindPlayer(next); old.style.opacity = '0'; old.style.pointerEvents = 'none'; old.after(next);
  });
  await settle(page);
  assert.equal(await page.locator('[data-generation="old"] .ytp-play-button').evaluate(button => button.matches(':focus-visible')), true, 'Opacity-hidden native controls can retain keyboard focus');
  await page.locator('[data-generation="new"] .ytp-play-button').hover();
  await settle(page);
  assert.notEqual(await page.locator('[data-generation="new"]').evaluate(player => player.style.getPropertyValue('--ytms-mini-play-tip-x')), '', 'The visible hovered Play control retains its native tooltip anchor after synchronisation');
  assert.equal(await page.locator('[data-generation="old"]').evaluate(player => player.style.getPropertyValue('--ytms-mini-play-tip-x')), '', 'A hidden retained control does not regain tooltip ownership');
});
