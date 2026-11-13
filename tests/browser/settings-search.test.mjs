// Language: en-GB. Synthetic settings-search tests; no user profile or network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const fixture = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const settingsKey = 'yt-master-suite.settings.v1';
const channelKey = 'yt-master-suite.channel-age.v1';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

async function pageFor(t, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: options.light ? fixture.replace('<html lang="en" dark>', '<html lang="en">') : fixture }) : route.abort());
  await context.addInitScript(({ settingsKey, channelKey, channels }) => {
    if (location.origin !== 'https://www.youtube.com') return;
    localStorage.setItem(settingsKey, JSON.stringify({ version: 1, values: { theatreMode: false } }));
    if (channels) localStorage.setItem(channelKey, JSON.stringify({ version: 1, rules: channels }));
  }, { settingsKey, channelKey, channels: options.channels });
  await context.addInitScript({ content: suite });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    try { assert.deepEqual(errors, []); }
    finally { await context.close(); }
  });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa&list=fixture-queue');
  await waitForSuiteHealth(page, manifest.registeredModules, { timeoutMs: 10000, errors });
  await page.locator('#ytms-settings-button').click();
  return page;
}

test('search finds settings in other tabs case-insensitively and activates the real control', async t => {
  const page = await pageFor(t);
  const search = page.locator('#ytms-settings-search');
  assert.equal(await search.isVisible(), true);
  assert.ok(await search.getAttribute('aria-label'), 'search has an accessible name');
  await search.fill('TIMELINE PREVIEW');
  const result = page.locator('#ytms-settings-search-results [data-tab="player"][data-target="timelinePreviewSize"]');
  assert.equal(await result.count(), 1);
  await result.click();
  assert.equal(await page.locator('#ytms-tab-player').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#ytms-timelinePreviewSize').isVisible(), true);
  assert.equal(await page.locator('#ytms-timelinePreviewSize').count(), 1);
  assert.equal(await page.locator('#ytms-timelinePreviewSize').evaluate(el => document.activeElement === el), true);
});

test('search highlights literal keywords without changing result text, controls or drafts', async t => {
  const page = await pageFor(t);
  const search = page.locator('#ytms-settings-search');
  const result = page.locator('#ytms-settings-search-results [data-target="timelinePreviewSize"]');
  await search.fill('TIMELINE PREVIEW');
  const original = await result.textContent();
  assert.deepEqual(await result.locator('.settings-search-title mark').allTextContents(), ['Timeline', 'preview']);
  await search.fill('prev PREVIEW preview');
  assert.equal(await result.textContent(), original);
  assert.deepEqual(await result.locator('.settings-search-title mark').allTextContents(), ['preview']);
  await search.fill('SponsorBlock segments');
  assert.deepEqual(await result.locator('.settings-search-description mark').allTextContents(), ['SponsorBlock', 'segments']);
  await search.fill('player');
  assert.deepEqual(await result.locator('.settings-search-section mark').allTextContents(), ['Player']);
  await search.fill('.');
  const dots = await page.locator('#ytms-settings-search-results mark').allTextContents();
  assert.ok(dots.length > 0);
  assert.ok(dots.every(text => text === '.'), 'Regular-expression punctuation remains literal');
  for (const query of ['[', '\\', '.*', '<img/onerror=alert(1)>']) {
    await search.fill(query);
    assert.equal(await page.locator('#ytms-settings-search-results img, #ytms-settings-search-results script').count(), 0);
  }
  await search.fill('timeline preview');
  await result.locator('mark').first().click();
  assert.equal(await page.locator('#ytms-timelinePreviewSize').evaluate(el => document.activeElement === el), true);
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
});

test('opening a search result keeps its row and literal keyword matches highlighted', async t => {
  const page = await pageFor(t);
  const control = page.locator('#ytms-hideShorts');
  const row = control.locator('..');
  const original = await row.textContent();
  const checked = await control.isChecked();
  await control.evaluate(el => { window.originalSearchControl = el; });
  await page.locator('#ytms-settings-search').fill('rem');
  await page.locator('.settings-search-result[data-target="hideShorts"]').click();
  assert.equal(await row.evaluate(el => el.classList.contains('settings-search-destination')), true);
  assert.deepEqual(await row.locator('mark').allTextContents(), ['Rem']);
  assert.equal(await row.textContent(), original);
  assert.equal(await control.evaluate(el => el === window.originalSearchControl && document.activeElement === el), true);
  assert.equal(await control.isChecked(), checked);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
  // Moving the pointer or focus must not erase the user's visual reference.
  await page.locator('#ytms-settings-search').click();
  assert.equal(await row.locator('mark').count(), 1);
  assert.equal(await row.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  await control.setChecked(!checked);
  assert.equal(await page.locator('#ytms-save-preview').isEnabled(), true);
});

test('destination highlighting clears on new searches, tab changes and reopening without damaging labels', async t => {
  const page = await pageFor(t);
  const search = page.locator('#ytms-settings-search');
  const control = page.locator('#ytms-hideShorts');
  const row = control.locator('..');
  const original = await row.textContent();
  const openResult = async () => {
    await search.fill('rem');
    await page.locator('.settings-search-result[data-target="hideShorts"]').click();
    assert.equal(await row.locator('mark').count(), 1);
  };
  await openResult();
  await search.fill('Hype');
  assert.equal(await row.locator('mark').count(), 0);
  assert.equal(await page.locator('.settings-search-destination').count(), 0);
  await search.press('Escape');
  await openResult();
  await page.locator('#ytms-tab-player').click();
  assert.equal(await page.locator('.settings-search-destination').count(), 0);
  await openResult();
  await page.locator('#ytms-cancel-panel').click();
  await page.locator('#ytms-settings-button').click();
  assert.equal(await page.locator('.settings-search-destination, .settings-search-destination-match').count(), 0);
  assert.equal(await row.textContent(), original);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
});

test('keyboard results mark nested menu controls and conditional controlling rows', async t => {
  const page = await pageFor(t);
  const search = page.locator('#ytms-settings-search');
  await search.fill('Show Hype in video menus');
  await page.locator('.settings-search-result[data-target="menuShowHype"]').focus();
  await page.keyboard.press('Enter');
  const action = page.locator('#ytms-menuShowHype');
  assert.equal(await action.evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('[data-menu-item="hype"].settings-search-destination').count(), 1);
  assert.deepEqual(await page.locator('[data-menu-item="hype"] mark').allTextContents(), ['Hype']);
  await search.fill('viewer colour');
  await page.locator('.settings-search-result[data-target="viewer-hex"]').click();
  const target = page.locator('.settings-search-destination');
  assert.equal(await target.count(), 1);
  assert.equal(await target.isVisible(), true);
  assert.equal(await target.locator('#ytms-colour-mode, #ytms-viewer-hex').count(), 1);
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
});

test('search includes descriptive text and can reveal a collapsed context-menu control', async t => {
  const page = await pageFor(t);
  const search = page.locator('#ytms-settings-search');
  await search.fill('SponsorBlock segments');
  assert.equal(await page.locator('#ytms-settings-search-results [data-tab="player"][data-target="timelinePreviewSize"]').count(), 1);
  await search.fill('Show Download in video menus');
  const result = page.locator('#ytms-settings-search-results [data-tab="interface"][data-target="menuShowDownload"]');
  await result.click();
  assert.equal(await page.locator('#ytms-tab-interface').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#ytms-video-menu-settings').evaluate(el => el.open), true);
  assert.equal(await page.locator('#ytms-menuShowDownload').isVisible(), true);
  assert.equal(await page.locator('#ytms-menuShowDownload').evaluate(el => document.activeElement === el), true);
  await page.locator('#ytms-cancel-panel').click();
  await page.locator('#ytms-settings-button').click();
  assert.equal(await page.locator('#ytms-settings-search').inputValue(), '');
  await page.locator('#ytms-tab-interface').click();
  assert.equal(await page.locator('#ytms-video-menu-settings').evaluate(el => el.open), false);
});

test('no-results and Escape preserve the selected tab and unsaved draft', async t => {
  const page = await pageFor(t);
  await page.locator('#ytms-tab-feed').click();
  const flag = page.locator('#ytms-hideLiveVideos');
  const initial = await flag.isChecked();
  await flag.setChecked(!initial);
  assert.equal(await page.locator('#ytms-save-preview').isEnabled(), true);
  const search = page.locator('#ytms-settings-search');
  await search.fill('qzx no such setting');
  assert.match(await page.locator('#ytms-settings-search-status').textContent(), /(?:no|0) settings/i);
  assert.equal(await page.locator('#ytms-settings-search-results .settings-search-empty').isVisible(), true);
  await search.press('Escape');
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(el => el.open), true);
  assert.equal(await page.locator('#ytms-tab-feed').getAttribute('aria-selected'), 'true');
  assert.equal(await flag.isChecked(), !initial);
  assert.equal(await page.locator('#ytms-save-preview').isEnabled(), true);
});

test('typing or clearing search never dirties settings or removes a saved status', async t => {
  const page = await pageFor(t);
  const save = page.locator('#ytms-save-preview');
  const search = page.locator('#ytms-settings-search');
  assert.equal(await save.isDisabled(), true);
  await search.fill('preview');
  assert.equal(await save.isDisabled(), true);
  await search.fill('');
  await page.locator('#ytms-tab-feed').click();
  await page.locator('#ytms-hideLiveVideos').check();
  await save.click();
  const status = page.locator('#ytms-settings-status');
  // Saving uses the cross-tab write lock; confirm persistence before its UI acknowledgement.
  await page.waitForFunction(key => JSON.parse(GM_getValue(key, 'null'))?.values.hideLiveVideos === true, settingsKey);
  await status.waitFor({ state: 'visible' });
  assert.equal(await status.isVisible(), true);
  const before = await status.textContent();
  await search.fill('captions');
  await search.fill('');
  assert.equal(await status.isVisible(), true);
  assert.equal(await status.textContent(), before);
  assert.equal(await save.textContent(), 'Reload now');
});

test('search results work by keyboard and do not index saved channel names', async t => {
  const page = await pageFor(t, { channels: [{ channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Synthetic Canary Channel', maxAge: 1, unit: 'weeks', enabled: true, blocked: false }] });
  const search = page.locator('#ytms-settings-search');
  await search.fill('Synthetic Canary Channel');
  assert.match(await page.locator('#ytms-settings-search-status').textContent(), /(?:no|0) settings/i);
  await search.fill('hide live videos');
  const result = page.locator('#ytms-settings-search-results [data-tab="feed"][data-target="hideLiveVideos"]');
  await result.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ytms-tab-feed').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#ytms-hideLiveVideos').evaluate(el => document.activeElement === el), true);
});

test('static comments, channel filters and backup entry points are searchable', async t => {
  const page = await pageFor(t);
  const search = page.locator('#ytms-settings-search');
  for (const [query, tab, target] of [
    ['name colours', 'comments', 'colour-mode'],
    ['channel upload filters', 'channels', 'channel-age'],
    ['backup', 'support', 'backup-heading'],
    ['video context menu order', 'interface', 'menu-order'],
  ]) {
    await search.fill(query);
    assert.equal(await page.locator(`#ytms-settings-search-results [data-tab="${tab}"][data-target="${target}"]`).count(), 1, query);
  }
});

test('searching a conditional colour setting does not change the active colour mode', async t => {
  const page = await pageFor(t);
  const search = page.locator('#ytms-settings-search');
  const mode = page.locator('#ytms-colour-mode');
  const before = await mode.inputValue();
  await search.fill('viewer colour');
  const result = page.locator('#ytms-settings-search-results [data-tab="comments"][data-target="viewer-hex"]');
  await result.click();
  assert.equal(await mode.inputValue(), before);
  const viewer = page.locator('#ytms-viewer-hex');
  const focused = await page.evaluate(() => document.activeElement?.id);
  if (await viewer.isVisible()) assert.equal(focused, 'ytms-viewer-hex');
  else assert.equal(focused, 'ytms-colour-mode');
  assert.equal(await page.locator('#ytms-save-preview').isDisabled(), true);
});

for (const light of [false, true]) {
  test(`search results remain readable and usable in ${light ? 'light' : 'dark'} mode on a narrow window`, async t => {
    const page = await pageFor(t, { viewport: { width: 360, height: 600 }, light });
    const search = page.locator('#ytms-settings-search');
    await search.fill('timeline preview');
    assert.equal(await page.locator('#ytms-settings-dialog nav').isVisible(), false);
    const result = page.locator('#ytms-settings-search-results [data-tab="player"][data-target="timelinePreviewSize"]');
    assert.equal(await result.isVisible(), true);
    const appearance = await result.evaluate(el => {
      const dialog = el.closest('dialog');
      const input = dialog.querySelector('#ytms-settings-search');
      const container = dialog.querySelector('.content');
      const mark = el.querySelector('mark');
      return { color: getComputedStyle(el).color, surface: getComputedStyle(dialog).backgroundColor,
        input: getComputedStyle(input).color, inputBackground: getComputedStyle(input).backgroundColor,
        markColor: getComputedStyle(mark).color, markBackground: getComputedStyle(mark).backgroundColor,
        scrollWidth: container.scrollWidth, clientWidth: container.clientWidth };
    });
    const luminance = colour => {
      const rgb = colour.match(/\d+/g)?.slice(0, 3).map(Number);
      assert.equal(rgb?.length, 3, colour);
      return rgb.map(value => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    assert.ok(contrast(appearance.color, appearance.surface) >= 4.5, JSON.stringify(appearance));
    assert.ok(contrast(appearance.input, appearance.inputBackground) >= 4.5, JSON.stringify(appearance));
    assert.ok(contrast(appearance.markColor, appearance.markBackground) >= 4.5, JSON.stringify(appearance));
    assert.ok(appearance.scrollWidth <= appearance.clientWidth + 1, JSON.stringify(appearance));
    await result.click();
    assert.equal(await page.locator('#ytms-settings-dialog nav').isVisible(), true);
    assert.equal(await page.locator('#ytms-timelinePreviewSize').isVisible(), true);
    const destination = await page.locator('.settings-search-destination').evaluate(el => {
      const style = getComputedStyle(el), mark = getComputedStyle(el.querySelector('mark'));
      const content = el.closest('.content'), box = content.getBoundingClientRect();
      const control = el.querySelector('select').getBoundingClientRect();
      return { outline: style.outlineStyle, outlineColor: style.outlineColor,
        surface: getComputedStyle(el.closest('dialog')).backgroundColor,
        markColor: mark.color, markBackground: mark.backgroundColor,
        scrollWidth: content.scrollWidth, clientWidth: content.clientWidth,
        controlVisible: control.top >= box.top && control.bottom <= box.bottom };
    });
    assert.equal(destination.outline, 'solid');
    assert.ok(contrast(destination.outlineColor, destination.surface) >= 3, JSON.stringify(destination));
    assert.ok(contrast(destination.markColor, destination.markBackground) >= 4.5, JSON.stringify(destination));
    assert.ok(destination.scrollWidth <= destination.clientWidth + 1, JSON.stringify(destination));
    assert.equal(destination.controlVisible, true);
  });
}

test('navigating from search to another tab retains an open channel filter draft', async t => {
  const page = await pageFor(t, { channels: [{ channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Synthetic Canary Channel', maxAge: 1, unit: 'weeks', enabled: true, blocked: false }] });
  await page.locator('#ytms-tab-channels').click();
  await page.getByRole('button', { name: 'Edit filter for Synthetic Canary Channel', exact: true }).click();
  await page.getByLabel('Maximum age', { exact: true }).fill('3');
  await page.locator('#ytms-settings-search').fill('timeline preview');
  await page.locator('#ytms-settings-search-results [data-tab="player"][data-target="timelinePreviewSize"]').click();
  await page.locator('#ytms-tab-channels').click();
  assert.equal(await page.getByLabel('Maximum age', { exact: true }).inputValue(), '3');
  assert.equal(await page.evaluate(key => JSON.parse(fixtureStorage.getItem(key)).rules[0].maxAge, channelKey), 1);
});

test('search result navigation gives keyboard focus to the backup heading', async t => {
  const page = await pageFor(t);
  await page.locator('#ytms-settings-search').fill('backup');
  const result = page.locator('#ytms-settings-search-results [data-tab="support"][data-target="backup-heading"]');
  await result.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ytms-tab-support').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#ytms-backup-heading').evaluate(el => document.activeElement === el), true);
});
