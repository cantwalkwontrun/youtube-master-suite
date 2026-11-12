// Language: en-GB. Synthetic native surfaces; no real YouTube requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
let browser, launching;
before(async () => { browser = await (launching = launchFixtureBrowser()); });
after(async () => { await (await launching)?.close(); });
async function open(t, preferences, path = '/watch?v=aaaaaaaaaaa') {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/')
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await context.addInitScript(preferences => {
    if (location.origin === 'https://www.youtube.com') localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { theatreMode: false, ...preferences } }));
  }, preferences);
  await context.addInitScript({ content: suite });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com' + path, { waitUntil: 'domcontentloaded' });
  return page;
}
for (const enabled of [false, true]) test(`useStandardMastheadLogo ${enabled} changes only the native doodle model`, async t => {
  const page = await open(t, { useStandardMastheadLogo: enabled });
  await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
  await page.evaluate(() => {
    const logo = document.createElement('ytd-topbar-logo-renderer'); logo.id = 'native-doodle';
    logo.logoEntity = { syntheticDoodle: true }; logo.set = (name, value) => { logo[name] = value; };
    const ordinary = document.createElement('div'); ordinary.id = 'other-logo'; ordinary.logoEntity = { untouched: true };
    document.querySelector('ytd-masthead').append(logo, ordinary);
  });
  if (enabled) await page.waitForFunction(() => document.getElementById('native-doodle').logoEntity === null);
  else await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(await page.locator('#native-doodle').evaluate(node => node.logoEntity), enabled ? null : { syntheticDoodle: true });
  assert.deepEqual(await page.locator('#other-logo').evaluate(node => node.logoEntity), { untouched: true });
});
for (const enabled of [false, true]) test(`redirectShorts ${enabled} rewrites recycled links while preserving queued links`, async t => {
  const page = await open(t, { redirectShorts: enabled });
  await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
  await page.evaluate(() => {
    const link = document.createElement('a'); link.id = 'short-link'; link.href = '/shorts/bbbbbbbbbbb'; link.textContent = 'Short';
    const queue = document.createElement('ytd-playlist-panel-renderer');
    const queued = link.cloneNode(true); queued.id = 'queued-short-link'; queue.append(queued);
    document.querySelector('ytd-masthead').append(link, queue);
  });
  const expected = id => enabled ? `/watch?v=${id}` : `/shorts/${id}`;
  await page.waitForFunction(expected => document.getElementById('short-link').getAttribute('href')?.endsWith(expected), expected('bbbbbbbbbbb'));
  assert.equal(await page.locator('#queued-short-link').getAttribute('href'), '/shorts/bbbbbbbbbbb');
  await page.locator('#short-link').evaluate(link => { link.href = '/shorts/ccccccccccc'; });
  await page.waitForFunction(expected => document.getElementById('short-link').getAttribute('href')?.endsWith(expected), expected('ccccccccccc'));
  assert.equal(await page.locator('#short-link').getAttribute('data-ytppl-shorts-converted'), enabled ? 'ccccccccccc' : null);
});
for (const enabled of [false, true]) test(`redirectShorts ${enabled} controls direct Shorts navigation`, async t => {
  const page = await open(t, { redirectShorts: enabled }, '/shorts/bbbbbbbbbbb');
  await page.waitForURL(enabled ? '**/watch?v=bbbbbbbbbbb' : '**/shorts/bbbbbbbbbbb');
  if (!enabled) await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
  assert.equal(new URL(page.url()).pathname, enabled ? '/watch' : '/shorts/bbbbbbbbbbb');
});
