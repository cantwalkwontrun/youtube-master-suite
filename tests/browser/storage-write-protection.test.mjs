// Language: en-GB. Synthetic records only; no real account or browser profile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const fixture = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8');
const settingsKey = 'yt-master-suite.settings.v1';
const channelKey = 'yt-master-suite.channel-age.v1';
const channelId = `UC${'a'.repeat(22)}`;
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

async function openFixture(t, key, raw) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: fixture }) : route.abort());
  const seed = `if (location.origin === 'https://www.youtube.com') localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(raw)});`;
  await context.addInitScript({ content: `${seed}\n${suite}` });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  await waitForSuiteHealth(page, manifest.registeredModules, { timeoutMs: 10000, errors });
  await page.locator('#ytms-settings-button').click();
  return page;
}

for (const [name, raw] of [
  ['unsupported version', JSON.stringify({ version: 2, values: { hideShorts: false } })],
  ['malformed JSON', '{invalid'],
  ['unknown field', JSON.stringify({ version: 1, values: { futureOption: true } })],
]) {
  test(`settings preserve a synthetic ${name} record and show a recoverable save error`, async t => {
    const page = await openFixture(t, settingsKey, raw);
    await page.getByRole('tab', { name: 'Feed', exact: true }).click();
    const toggle = page.locator('#ytms-hideShorts');
    await toggle.setChecked(!(await toggle.isChecked()));
    await page.locator('#ytms-save-preview').click();
    assert.match(await page.locator('#ytms-settings-status').textContent(), /incompatible or damaged.*nothing was overwritten/i);
    assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), settingsKey), raw);
    assert.equal(await page.locator('#ytms-settings-dialog').isVisible(), true);
    assert.equal(await page.locator('#ytms-save-preview').isEnabled(), true);
  });
}

for (const [name, raw] of [
  ['unsupported version', JSON.stringify({ version: 2, rules: [{ channelId }] })],
  ['malformed JSON', '{invalid'],
  ['unknown field', JSON.stringify({ version: 1, rules: [{ channelId, name: 'Example', maxAge: 1, unit: 'weeks', enabled: true, blocked: false, futureOption: true }] })],
]) {
  test(`channel editor preserves a synthetic ${name} record and keeps its draft`, async t => {
    const page = await openFixture(t, channelKey, raw);
    await page.getByRole('tab', { name: 'Channels', exact: true }).click();
    await page.locator('#ytms-age-add').click();
    const list = page.locator('#ytms-channel-filter-list');
    await list.getByLabel('Channel name', { exact: true }).last().fill('Synthetic channel');
    // Existing valid-but-unknown-field data may populate the list, so use a different ID.
    await list.getByLabel('Channel ID or channel URL', { exact: true }).last().fill(`UC${'b'.repeat(22)}`);
    await list.getByLabel('Maximum age', { exact: true }).last().fill('1');
    await list.getByLabel('Unit', { exact: true }).last().selectOption('weeks');
    await page.locator('#ytms-age-save').click();
    assert.match(await page.locator('#ytms-age-status').textContent(), /incompatible or damaged.*nothing was overwritten/i);
    assert.equal(await page.evaluate(key => fixtureStorage.getItem(key), channelKey), raw);
    assert.equal(await page.locator('#ytms-settings-dialog').isVisible(), true);
    assert.equal(await list.getByLabel('Channel name', { exact: true }).last().inputValue(), 'Synthetic channel');
  });
}

test('valid version-1 settings remain editable', async t => {
  const raw = JSON.stringify({ version: 1, values: { hideShorts: true } });
  const page = await openFixture(t, settingsKey, raw);
  await page.getByRole('tab', { name: 'Feed', exact: true }).click();
  await page.locator('#ytms-hideShorts').uncheck();
  await page.locator('#ytms-save-preview').click();
  assert.equal(await page.evaluate(key => JSON.parse(fixtureStorage.getItem(key)).values.hideShorts, settingsKey), false);
});

test('valid version-1 channel filters remain editable', async t => {
  const raw = JSON.stringify({ version: 1, rules: [{ channelId, name: 'Synthetic channel', maxAge: 1, unit: 'weeks', enabled: true, blocked: false }] });
  const page = await openFixture(t, channelKey, raw);
  await page.getByRole('tab', { name: 'Channels', exact: true }).click();
  await page.getByRole('button', { name: 'Edit filter for Synthetic channel', exact: true }).click();
  await page.locator('#ytms-channel-filter-list').getByLabel('Maximum age', { exact: true }).fill('2');
  await page.locator('#ytms-age-save').click();
  assert.equal(await page.evaluate(key => JSON.parse(fixtureStorage.getItem(key)).rules[0].maxAge, channelKey), 2);
});
