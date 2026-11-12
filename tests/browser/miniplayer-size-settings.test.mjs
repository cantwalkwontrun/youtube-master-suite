// Language: en-GB. Synthetic settings and live floating-player dimensions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth, saveFixtureSettings } from './fixture-browser.mjs';

const SUITE = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const FIXTURE = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
const WATCH_URL = 'https://www.youtube.com/watch?v=aaaaaaaaaaa&list=fixture-queue';
const KEY = 'yt-master-suite.settings.v1';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

async function openFixture(t, values = {}, viewport = { width: 1920, height: 1080 }) {
  const context = await browser.newContext({
    viewport, serviceWorkers: 'block',
    storageState: { cookies: [], origins: [{ origin: 'https://www.youtube.com', localStorage: [{
      name: KEY, value: JSON.stringify({ version: 1, values: { theatreMode: false, ...values } }),
    }] }] },
  });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: FIXTURE }) : route.abort());
  await context.addInitScript({ content: SUITE });
  t.after(async () => {
    try {
      assert.deepEqual(errors, []);
      for (const page of context.pages()) {
        const runtime = await page.getAttribute('html', 'data-yt-master-runtime-errors');
        assert.ok(!runtime || runtime === '[]', runtime);
      }
    } finally { await context.close(); }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded' });
  await waitForSuiteHealth(page, MANIFEST.registeredModules, { timeoutMs: 7000, errors });
  return page;
}

async function floatPlayer(page) {
  await page.evaluate(() => {
    const host = document.getElementById('player');
    if (!document.getElementById('single-column-container')) {
      const anchor = document.createElement('div'); anchor.id = 'single-column-container';
      host.before(anchor); anchor.append(host);
    }
    window.scrollTo(0, 900);
  });
  await page.waitForFunction(() => document.body.classList.contains('ytsmp-scroll-miniplayer-active') &&
    document.getElementById('movie_player')?.parentElement === document.body);
}

async function openMiniplayerSettings(page) {
  await page.locator('#ytms-player-settings-button').click();
  await page.locator('#ytms-tab-miniplayer').click();
}

async function widthIs(page, width) {
  try {
    await page.waitForFunction(expected => Math.abs(document.getElementById('movie_player').getBoundingClientRect().width - expected) < 1,
      width);
  } catch (error) {
    const state = await page.evaluate(() => ({
      visibility: document.visibilityState, focused: document.hasFocus(),
      activeElement: document.activeElement?.id, input: document.getElementById('ytms-miniplayerWidth')?.value,
      inputValid: document.getElementById('ytms-miniplayerWidth')?.validity.valid,
      mode: document.getElementById('ytms-miniplayerSizeMode')?.value,
      width: document.getElementById('movie_player')?.getBoundingClientRect().width,
      floating: document.body.classList.contains('ytsmp-scroll-miniplayer-active'),
      configuredWidth: document.body.style.getPropertyValue('--ytsmp-width'),
    }));
    throw new Error(`Expected synthetic miniplayer width ${width}; ${JSON.stringify(state)}`, { cause: error });
  }
}

async function recordPlayback(page) {
  return page.evaluate(() => {
    const player = document.getElementById('movie_player'), video = player.querySelector('video');
    window.sizeSettingsDocumentToken = 'same-document';
    window.sizeSettingsPlayer = player; window.sizeSettingsVideo = video;
    return { url: location.href, time: video.currentTime, paused: video.paused, volume: video.volume,
      rate: video.playbackRate, source: video.currentSrc };
  });
}

async function playbackIsUnchanged(page, before) {
  const after = await page.evaluate(() => {
    const player = document.getElementById('movie_player'), video = player.querySelector('video');
    return { state: { url: location.href, time: video.currentTime, paused: video.paused, volume: video.volume,
      rate: video.playbackRate, source: video.currentSrc }, samePlayer: player === window.sizeSettingsPlayer,
      sameVideo: video === window.sizeSettingsVideo, token: window.sizeSettingsDocumentToken };
  });
  assert.deepEqual(after.state, before);
  assert.equal(after.samePlayer, true); assert.equal(after.sameVideo, true);
  assert.equal(after.token, 'same-document', 'saving must not reload the document');
}

async function stored(page) {
  return page.evaluate(key => JSON.parse(fixtureStorage.getItem(key)).values, KEY);
}

test('Automatic is the default, retains adaptive geometry and opens without saving', async t => {
  const page = await openFixture(t);
  const raw = await page.evaluate(key => fixtureStorage.getItem(key), KEY);
  await floatPlayer(page); await widthIs(page, 720);
  await openMiniplayerSettings(page);
  assert.equal(await page.locator('#ytms-miniplayerSizeMode').inputValue(), 'auto');
  assert.equal(await page.locator('#ytms-miniplayer-width-row').isVisible(), false);
  assert.equal(await page.locator('#ytms-miniplayerWidth').inputValue(), '720');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  assert.equal(await page.locator('#ytms-save-preview').textContent(), 'Save');
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), KEY), raw);
  await page.locator('#ytms-cancel-panel').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await widthIs(page, 486);
});

test('Custom slider and number preview valid widths, reject invalid input and save without reload', async t => {
  const page = await openFixture(t);
  await floatPlayer(page); const before = await recordPlayback(page);
  await openMiniplayerSettings(page);
  await page.locator('#ytms-miniplayerSizeMode').selectOption('custom');
  const number = page.locator('#ytms-miniplayerWidth'), slider = page.locator('#ytms-miniplayer-width-slider');
  assert.equal(await slider.getAttribute('min'), '320'); assert.equal(await slider.getAttribute('max'), '1200');
  assert.equal(await number.getAttribute('min'), '320'); assert.equal(await number.getAttribute('max'), '1200');
  await slider.focus(); await page.keyboard.press('Home');
  await widthIs(page, 320); assert.equal(await number.inputValue(), '320');
  await page.keyboard.press('End');
  await widthIs(page, 1200); assert.equal(await number.inputValue(), '1200');
  await number.fill('1000'); await widthIs(page, 1000);
  assert.equal(await slider.inputValue(), '1000');
  const preferenceStatus = page.locator('#ytms-preference-status');
  const widthBadge = page.locator('label[for="ytms-miniplayerWidth"] .preference-badge');
  assert.equal(await preferenceStatus.textContent(), 'Unsaved changes.');
  assert.equal(await widthBadge.textContent(), 'Unsaved');
  const height = await page.locator('#movie_player').evaluate(player => player.getBoundingClientRect().height);
  assert.ok(Math.abs(height - 563) < 1, String(height));
  for (const value of ['319', '1201', '640.5', '']) {
    await number.fill(value);
    assert.equal(await number.getAttribute('aria-invalid'), 'true', value);
    assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true, value);
    assert.equal(await preferenceStatus.textContent(), 'Unsaved changes.', value);
    await widthIs(page, 1000);
  }
  assert.equal((await stored(page)).miniplayerWidth, undefined, 'preview must not save');
  await number.fill('1000');
  assert.equal(await number.getAttribute('aria-invalid'), 'false');
  await saveFixtureSettings(page);
  const values = await stored(page);
  assert.equal(values.miniplayerSizeMode, 'custom'); assert.equal(values.miniplayerWidth, 1000);
  assert.equal(await page.locator('#ytms-save-preview').textContent(), 'Save');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  assert.equal(await page.locator('#ytms-settings-status').textContent(), 'Saved. No reload needed.');
  assert.equal(await preferenceStatus.textContent(), 'Saved settings are active on this page.');
  assert.equal(await widthBadge.count(), 0);
  await playbackIsUnchanged(page, before);
});

test('Automatic remains usable after an invalid custom width and retains the last valid preview width', async t => {
  const page = await openFixture(t);
  await floatPlayer(page); const before = await recordPlayback(page);
  const raw = await page.evaluate(key => fixtureStorage.getItem(key), KEY);
  await openMiniplayerSettings(page);
  const mode = page.locator('#ytms-miniplayerSizeMode'), width = page.locator('#ytms-miniplayerWidth');
  await mode.selectOption('custom');
  await width.fill('1000'); await widthIs(page, 1000);
  for (const invalid of ['', '319', '1201', '640.5']) {
    await width.fill(invalid);
    assert.equal(await width.getAttribute('aria-invalid'), 'true');
    await mode.selectOption('auto');
    await widthIs(page, 720);
    assert.equal(await page.locator('#ytms-save-preview').textContent(), 'Save');
    await mode.selectOption('custom');
    assert.equal(await width.inputValue(), '1000');
    await widthIs(page, 1000);
  }
  await page.locator('#ytms-cancel-panel').click();
  await widthIs(page, 720);
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), KEY), raw);
  await openMiniplayerSettings(page);
  await mode.selectOption('custom');
  assert.equal(await width.inputValue(), '720', 'Cancel discards the retained draft width');
  await width.fill('960'); await width.fill('');
  await mode.selectOption('auto');
  await saveFixtureSettings(page);
  const values = await stored(page);
  assert.equal(values.miniplayerSizeMode, 'auto'); assert.equal(values.miniplayerWidth, 960);
  assert.equal(await page.locator('#ytms-settings-status').textContent(), 'Saved. No reload needed.');
  await widthIs(page, 720);
  await playbackIsUnchanged(page, before);
});

test('Cancel and Escape restore the saved custom size without changing storage or playback', async t => {
  const page = await openFixture(t, { miniplayerSizeMode: 'custom', miniplayerWidth: 800 });
  await floatPlayer(page); await widthIs(page, 800);
  const raw = await page.evaluate(key => fixtureStorage.getItem(key), KEY), before = await recordPlayback(page);
  for (const dismissal of ['cancel', 'escape']) {
    await openMiniplayerSettings(page);
    assert.equal(await page.locator('#ytms-miniplayerWidth').inputValue(), '800');
    await page.locator('#ytms-miniplayerWidth').fill('960'); await widthIs(page, 960);
    if (dismissal === 'cancel') await page.locator('#ytms-cancel-panel').click();
    else await page.keyboard.press('Escape');
    await page.locator('#ytms-settings-dialog').waitFor({ state: 'hidden' });
    await widthIs(page, 800);
    assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), KEY), raw);
  }
  await playbackIsUnchanged(page, before);
});

test('a smaller viewport clamps the player and preserves the requested width for later', async t => {
  const page = await openFixture(t, { miniplayerSizeMode: 'custom', miniplayerWidth: 1000 });
  await floatPlayer(page); await widthIs(page, 1000);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.waitForFunction(() => {
    const rect = document.getElementById('movie_player').getBoundingClientRect();
    return rect.width < 1000 && rect.left >= -1 && rect.right <= innerWidth + 1 &&
      rect.top >= -1 && rect.bottom <= innerHeight + 1;
  });
  await openMiniplayerSettings(page);
  assert.equal(await page.locator('#ytms-miniplayerWidth').inputValue(), '1000');
  assert.equal((await stored(page)).miniplayerWidth, 1000);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  await page.locator('#ytms-cancel-panel').click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await widthIs(page, 1000);
});

test('Miniplayer defaults preview Automatic, Cancel restores custom, and Save keeps defaults live', async t => {
  const page = await openFixture(t, { miniplayerSizeMode: 'custom', miniplayerWidth: 900, hideShorts: false });
  await floatPlayer(page); await widthIs(page, 900);
  const raw = await page.evaluate(key => fixtureStorage.getItem(key), KEY);
  await openMiniplayerSettings(page);
  await page.locator('#ytms-restore-section-defaults').click();
  await widthIs(page, 720);
  assert.equal(await page.locator('#ytms-miniplayerSizeMode').inputValue(), 'auto');
  assert.equal(await page.locator('#ytms-miniplayerWidth').inputValue(), '720');
  assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), KEY), raw);
  await page.locator('#ytms-cancel-panel').click(); await widthIs(page, 900);
  await openMiniplayerSettings(page);
  await page.locator('#ytms-restore-section-defaults').click();
  await saveFixtureSettings(page);
  const values = await stored(page);
  assert.equal(values.miniplayerSizeMode, 'auto'); assert.equal(values.miniplayerWidth, 720);
  assert.equal(values.hideShorts, false, 'defaults for another section remain saved');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  assert.equal(await page.locator('#ytms-settings-status').textContent(), 'Saved. No reload needed.');
  await widthIs(page, 720);
});

test('cross-tab saves update clean sizing, preserve a dirty preview and Cancel adopts the latest saved size', async t => {
  const page = await openFixture(t, { miniplayerSizeMode: 'custom', miniplayerWidth: 800 });
  await floatPlayer(page); await openMiniplayerSettings(page);
  const other = await page.context().newPage(); other.setDefaultTimeout(7000);
  await other.goto(WATCH_URL, { waitUntil: 'domcontentloaded' });
  await waitForSuiteHealth(other, MANIFEST.registeredModules, { timeoutMs: 7000 });
  const saveElsewhere = width => other.evaluate(({ key, width }) => {
    const record = JSON.parse(fixtureStorage.getItem(key));
    record.values.miniplayerSizeMode = 'custom'; record.values.miniplayerWidth = width;
    fixtureStorage.setItem(key, JSON.stringify(record));
  }, { key: KEY, width });

  await saveElsewhere(900);
  await page.waitForFunction(() => document.getElementById('ytms-miniplayerWidth').value === '900');
  await widthIs(page, 900);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  assert.equal(await page.locator('#ytms-save-preview').textContent(), 'Save');
  await page.bringToFront(); await page.locator('#ytms-cancel-panel').click();
  await saveElsewhere(1000); await widthIs(page, 1000);
  await page.bringToFront(); await openMiniplayerSettings(page);
  assert.equal(await page.locator('#ytms-miniplayerWidth').inputValue(), '1000');
  const widthInput = page.locator('#ytms-miniplayerWidth');
  // Native Firefox BiDi can append when filling an existing number input.
  await widthInput.press('ControlOrMeta+A'); await widthInput.press('Backspace');
  await widthInput.fill('960'); assert.equal(await widthInput.inputValue(), '960');
  await widthIs(page, 960);
  await saveElsewhere(1100);
  await page.waitForFunction(() => document.getElementById('ytms-settings-status').textContent.includes('Your draft has been kept'));
  assert.equal(await page.locator('#ytms-miniplayerWidth').inputValue(), '960');
  await widthIs(page, 960);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  assert.equal((await stored(page)).miniplayerWidth, 1100);
  await page.bringToFront(); await page.locator('#ytms-cancel-panel').click();
  await widthIs(page, 1100);
  await openMiniplayerSettings(page);
  assert.equal(await page.locator('#ytms-miniplayerWidth').inputValue(), '1100');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  assert.equal(await page.locator('#ytms-save-preview').textContent(), 'Save');
});
