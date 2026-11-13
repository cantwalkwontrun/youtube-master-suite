// Language: en-GB. Exercise every main scalar control through trusted UI actions.
// Runtime effects are verified separately; saving a value is not behavioural proof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { createSuiteSettings } from '../../sources/suite-settings.mjs';
import { launchFixtureBrowser, waitForSuiteHealth, saveFixtureSettings } from './fixture-browser.mjs';

const source = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const settings = createSuiteSettings(() => null, () => true);
const defaults = settings.defaults;
// Tree, ordering and legacy menu fields use the dedicated submenu/menu contracts.
const menuKeys = Object.keys(defaults).filter(key => key.startsWith('menu'));
const scalarKeys = Object.keys(defaults).filter(key => !menuKeys.includes(key));
const aliases = { colourMode: 'colour-mode', viewerColour: 'viewer-hex', ownerColour: 'owner-hex' };
const prerequisites = {
  palette: { colourMode: 'preset' }, viewerColour: { colourMode: 'custom' }, ownerColour: { colourMode: 'custom' },
  miniplayerWidth: { miniplayerSizeMode: 'custom', miniplayerEnabled: true },
  snapshotFormat: { snapshotButton: true }, snapshotQuality: { snapshotButton: true, snapshotFormat: 'jpeg' },
  theatreHideHeader: { fullWindowTheatre: true }, lowViewThreshold: { hideFeedLowViews: true },
  wheelStep: { wheelVolume: true },
  shortsHideMetadata: { redirectShorts: false }, shortsHideActions: { redirectShorts: false },
  shortsHideRelated: { redirectShorts: false }, shortsHideMusic: { redirectShorts: false }, shortsHideRemix: { redirectShorts: false },
  headerSettingsIcon: { playerSettingsIcon: 'monochrome' }, playerSettingsIcon: { headerSettingsIcon: 'colour' },
};
let browser, launch;
before(async () => { browser = await (launch = launchFixtureBrowser()); });
after(async () => { await (await launch)?.close(); });

test('every scalar setting exposes its declared choices and saves each through its real control', { timeout: 180000 }, async t => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const address = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
  await context.route('**/*', route => route.request().url() === address
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await context.addInitScript(({ key, defaults }) => {
    if (location.origin === 'https://www.youtube.com') localStorage.setItem(key, JSON.stringify({ version: 1, values: defaults }));
  }, { key: settings.key, defaults });
  await context.addInitScript({ content: source });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(address);
  await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true, errors });
  await page.locator('#ytms-settings-button').click();
  const stored = () => page.evaluate(key => JSON.parse(fixtureStorage.getItem(key)).values, settings.key);
  async function control(key) {
    const field = page.locator('#ytms-' + (aliases[key] || key));
    assert.equal(await field.count(), 1, `${key}: one real control`);
    const section = await field.evaluate(node => node.closest('[role="tabpanel"]').id.replace('ytms-section-', ''));
    await page.locator('#ytms-tab-' + section).click();
    await field.evaluate(node => { for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.localName === 'details') parent.open = true; });
    return field;
  }
  async function change(key, value) {
    const field = await control(key);
    const tag = await field.evaluate(node => node.localName);
    if (typeof value === 'boolean') await field.setChecked(value);
    else if (tag === 'select') await field.selectOption(String(value));
    else {
      if (await field.getAttribute('type') === 'number') {
        // BiDi fill can append to number inputs (720 -> 720320). Exercise the
        // trusted keyboard replacement instead, and verify the entered value.
        await field.focus(); await field.press('ControlOrMeta+A');
        await field.pressSequentially(String(value));
      } else await field.fill(String(value));
      await field.blur();
      assert.equal(await field.inputValue(), String(value), `${key}: entered value`);
    }
    return field;
  }
  for (const key of scalarKeys) await t.test(key, async () => {
    for (const [dependency, value] of Object.entries(prerequisites[key] || {})) await change(dependency, value);
    const field = await control(key);
    assert.equal(await field.isEnabled(), true, `${key}: prerequisites expose an editable control`);
    const fallback = defaults[key];
    const choices = typeof fallback === 'boolean' ? [false, true]
      : key === 'miniplayerWidth' ? [320, 720, 1200]
      : key === 'viewerColour' ? ['#123ABC', '#82A3E6']
      : key === 'ownerColour' ? ['#456DEF', '#FF9F1C']
      : await field.locator('option').evaluateAll(options => options.map(option => option.value));
    assert.ok(choices.length, `${key}: declared choices are exercised`);
    for (const value of choices) {
      await change(key, value);
      const primary = page.locator('#ytms-save-preview');
      if (await primary.getAttribute('data-action') === 'save' && await primary.isEnabled()) await saveFixtureSettings(page);
      assert.deepEqual((await stored())[key], value, `${key}: trusted UI saves ${String(value)}`);
    }
  });
  assert.equal(scalarKeys.length + menuKeys.length, Object.keys(defaults).length);
  assert.deepEqual(menuKeys.sort(), ['menuGroupChannelTools', 'menuItemOrder', 'menuLayout', 'menuShowAgeLimit', 'menuShowDontRecommend', 'menuShowDownload', 'menuShowHype', 'menuShowNotInterested', 'menuShowReport'].sort());
});
