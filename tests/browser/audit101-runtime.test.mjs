// Language: en-GB. Independent runtime audit with synthetic native contracts.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { installPlayerControls } from '../../sources/player-controls.mjs';
import { installLayoutControls } from '../../sources/layout-controls.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';
let browser, launching;
before(async () => { browser = await (launching = launchFixtureBrowser()); });
after(async () => { await (await launching)?.close(); });
const html = '<!doctype html><html lang="en-GB"><body><div id="movie_player" style="width:640px;height:360px"><video></video><button class="ytp-settings-button">Settings</button><button class="ytp-autonav-toggle-button" aria-checked="true">Autoplay</button></div></body></html>';

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const preferences = ['originalAudio', 'disableAutoplay', 'disableStableVolume'];
async function openPreference(t, preference, mode = 'ignore') {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.route('**/*', route => route.request().url() === 'https://www.youtube.com/watch?v=aaaaaaaaaaa'
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  const page = await context.newPage(); await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await page.evaluate(({ factory, preference, mode }) => {
    const player = document.getElementById('movie_player');
    window.audit101 = { calls: 0, ready: false, audio: 1, drc: 1, reports: 0, id: 'aaaaaaaaaaa' };
    const request = apply => {
      audit101.calls++;
      if (!audit101.ready && mode === 'throw') throw new TypeError('Synthetic temporarily unavailable native setter');
      if (mode === 'async') audit101.complete = apply;
      else if (audit101.ready) apply();
    };
    const tracks = [0,1].map(index => ({ getLanguageInfo: () => ({ getId: () => String(index), getIsDefault: () => index === 0, getIsAutoDubbed: () => index === 1 }) }));
    player.getVideoData = () => ({ video_id: audit101.id });
    player.getAvailableAudioTracks = () => tracks; player.getAudioTrack = () => tracks[audit101.audio];
    player.setAudioTrack = track => request(() => { audit101.audio = tracks.indexOf(track); });
    player.getDrcUserPreference = () => audit101.drc;
    player.setDrcUserPreference = value => request(() => { audit101.drc = value; });
    player.setAutonav = value => request(() => { player.querySelector('.ytp-autonav-toggle-button').setAttribute('aria-checked', String(value)); });
    window.dispose101 = (0, eval)('(' + factory + ')')({ document, window, preferences: { [preference]: true }, reportError: () => audit101.reports++ });
  }, { factory: installPlayerControls.toString(), preference, mode });
  await settle(page);
  return page;
}

for (const preference of preferences) for (const mode of ['ignore', 'throw'])
test(`${preference} recovers when its first native setter fails (${mode})`, async t => {
  const page = await openPreference(t, preference, mode);
  assert.equal(await page.evaluate(() => audit101.calls), 1);
  await page.evaluate(() => { audit101.ready = true; document.querySelector('video').dispatchEvent(new Event('loadedmetadata')); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = await page.evaluate(preference => ({ calls: audit101.calls, applied: preference === 'originalAudio' ? audit101.audio === 0 : preference === 'disableStableVolume' ? audit101.drc === 0 : document.querySelector('.ytp-autonav-toggle-button').getAttribute('aria-checked') === 'false' }), preference);
  assert.equal(result.applied, true, `native preference remains unapplied after readiness; setter calls=${result.calls}`);
  assert.equal(await page.evaluate(() => audit101.reports), mode === 'throw' ? 1 : 0);
});

for (const preference of preferences) test(`${preference} confirms asynchronous completion without retrying on class or ARIA churn`, async t => {
  const page = await openPreference(t, preference, 'async');
  for (let i = 0; i < 10; i++) {
    await page.evaluate(i => {
      document.getElementById('movie_player').classList.toggle('synthetic-animation', i % 2 === 0);
      document.querySelector('.ytp-autonav-toggle-button').setAttribute('aria-checked', String(i % 2 === 0));
      window.dispatchEvent(new Event('resize'));
    }, i);
    await settle(page);
  }
  assert.equal(await page.evaluate(() => audit101.calls), 1);
  await page.evaluate(() => { audit101.complete(); document.querySelector('video').dispatchEvent(new Event('durationchange')); });
  await settle(page);
  assert.equal(await page.evaluate(() => audit101.calls), 1, 'confirmed native completion is observed without repeating its request');
});

for (const preference of preferences) test(`${preference} retries are bounded and reset only for another video`, async t => {
  const page = await openPreference(t, preference, 'throw');
  for (let i = 0; i < 16; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event('yt-page-data-updated')));
    await settle(page);
  }
  assert.equal(await page.evaluate(() => audit101.calls), 8);
  assert.equal(await page.evaluate(() => audit101.reports), 1);
  await page.evaluate(() => { audit101.id = 'bbbbbbbbbbb'; audit101.ready = true; document.querySelector('video').dispatchEvent(new Event('loadedmetadata')); });
  await settle(page);
  assert.equal(await page.evaluate(() => audit101.calls), 9);
});

for (const preference of preferences) test(`${preference} still yields to manual intent while a failed attempt awaits readiness`, async t => {
  const page = await openPreference(t, preference);
  await page.locator(preference === 'disableAutoplay' ? '.ytp-autonav-toggle-button' : '.ytp-settings-button').click();
  await page.evaluate(() => { audit101.ready = true; document.querySelector('video').dispatchEvent(new Event('loadedmetadata')); });
  await settle(page);
  assert.equal(await page.evaluate(() => audit101.calls), 1);
  await page.evaluate(() => { audit101.id = 'bbbbbbbbbbb'; document.querySelector('video').dispatchEvent(new Event('loadedmetadata')); });
  await settle(page);
  assert.equal(await page.evaluate(() => audit101.calls), 2);
});

for (const preference of preferences) test(`${preference} retries readiness after returning from a hidden tab`, async t => {
  const page = await openPreference(t, preference);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    audit101.ready = true;
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await settle(page);
  assert.equal(await page.evaluate(() => audit101.calls), 2);
});

for (const hidden of [true, false]) test(`theatre header hiding ignores a retained watch root (hidden ancestor=${hidden})`, async t => {
  const context = await browser.newContext({ serviceWorkers: 'block' }); t.after(() => context.close());
  const body = `<!doctype html><html lang="en-GB"><body><ytd-masthead style="display:block;height:56px">Header</ytd-masthead><div style="opacity:${hidden ? 0 : 1}"><ytd-watch-flexy theater style="display:block;width:640px;height:360px">Retained theatre</ytd-watch-flexy></div><ytd-watch-flexy style="display:block;width:640px;height:360px">Current normal player</ytd-watch-flexy></body></html>`;
  await context.route('**/*', route => route.request().url() === 'https://www.youtube.com/watch?v=aaaaaaaaaaa' ? route.fulfill({ contentType: 'text/html', body }) : route.abort());
  const page = await context.newPage(); await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await page.evaluate(source => { window.disposeLayout101 = (0,eval)('('+source+')')({ document, window, preferences: { fullWindowTheatre: true, theatreHideHeader: true } }); }, installLayoutControls.toString());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('ytd-masthead').isVisible(), true, 'a hidden retained theatre root must not hide the active normal-page masthead');
  await page.evaluate(() => {
    const watches = document.querySelectorAll('ytd-watch-flexy'); watches[0].remove(); watches[1].setAttribute('theater','');
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await settle(page);
  assert.equal(await page.locator('ytd-masthead').isVisible(), false, 'a unique visible theatre root still hides the masthead');
});

test('related-below layout leaves an ancestor-hidden retained watch root untouched', async t => {
  const context = await browser.newContext({ serviceWorkers: 'block' }); t.after(() => context.close());
  const watch = id => `<ytd-watch-flexy id="${id}" style="display:block;width:640px;height:360px"><div id="secondary"><div id="related" style="width:100px;height:80px">Related</div></div></ytd-watch-flexy>`;
  const body = `<!doctype html><html lang="en-GB"><body><div style="opacity:0">${watch('retained')}</div>${watch('active')}</body></html>`;
  await context.route('**/*', route => route.request().url() === 'https://www.youtube.com/watch?v=aaaaaaaaaaa' ? route.fulfill({ contentType: 'text/html', body }) : route.abort());
  const page = await context.newPage(); await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await page.evaluate(source => { window.disposeLayout101 = (0,eval)('('+source+')')({ document, window, preferences: { relatedBelowPlayer: true } }); }, installLayoutControls.toString());
  await settle(page);
  assert.equal(await page.locator('#retained').getAttribute('data-ytms-related-below'), null);
  assert.equal(await page.locator('#active').getAttribute('data-ytms-related-below'), '1');
});
