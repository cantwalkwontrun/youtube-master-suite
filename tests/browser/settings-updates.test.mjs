// Language: en-GB. Isolated Credits update controls with synthetic release data.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createSettingsExtraControls } from '../../sources/settings-extra-controls.mjs';
import { createSuiteUpdates } from '../../sources/suite-updates.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';

const PAGE_URL = 'https://www.youtube.com/fixture-settings-updates';
const SOURCE_URL = 'https://github.com/fixture-owner/fixture-suite/releases/latest';
const API_URL = 'https://api.github.com/repos/fixture-owner/fixture-suite/releases/latest';
const SOURCE_KEY = 'yt-master-suite.update-source.v1';
const SETTINGS_KEY = 'yt-master-suite.settings.v1';
const HASH = 'a'.repeat(64);
const downloadUrl = version => `https://github.com/fixture-owner/fixture-suite/releases/download/v${version}/youtube-master-suite.user.js`;
const release = (version = '1.2.62') => ({ draft: false, prerelease: false, published_at: '2026-01-01T12:00:00Z',
  tag_name: `v${version}`, assets: [{ name: 'youtube-master-suite.user.js', state: 'uploaded', size: 900000,
    digest: `sha256:${HASH}`, browser_download_url: downloadUrl(version) }] });
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Synthetic update settings</title>
<style>dialog{width:640px}section{padding:8px}input[type=url]{width:100%}.extra-settings-controls{display:flex;gap:8px;margin:12px 0}button,a{padding:8px}</style>
</head><body><button id="fixture-open">Open settings</button><dialog id="ytms-settings-dialog">
<nav><button id="fixture-credits">Credits</button><button id="fixture-player">Player</button></nav>
<section id="ytms-section-credits"></section><section id="ytms-section-player" hidden></section>
<label>Main preference <input id="fixture-main-setting" type="checkbox"></label>
<button id="fixture-main-save" disabled>Save preferences</button><button id="fixture-close">Close settings</button>
</dialog></body></html>`;

let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

async function pageFor(t, { initialSource = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const network = { requests: [], hold: false, pending: [], value: release(), onRequest: null,
    release() { this.pending.splice(0).forEach(resolve => resolve()); } };
  await context.route('**/*', async route => {
    if (route.request().url() === PAGE_URL) return route.fulfill({ contentType: 'text/html', body: html });
    if (route.request().url() === API_URL) {
      network.requests.push(route.request());
      network.onRequest?.();
      if (network.hold) await new Promise(resolve => network.pending.push(resolve));
      try { await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': 'https://www.youtube.com' }, body: JSON.stringify(network.value) }); }
      catch { /* The real helper deliberately aborts cancelled checks. */ }
      return;
    }
    return route.abort();
  });
  await context.addInitScript(({ initialSource, sourceKey, settingsKey }) => {
    if (location.origin !== 'https://www.youtube.com') return;
    localStorage.setItem(settingsKey, JSON.stringify({ version: 1, values: { fixturePreference: true } }));
    if (initialSource !== null) localStorage.setItem(sourceKey, initialSource);
  }, { initialSource, sourceKey: SOURCE_KEY, settingsKey: SETTINGS_KEY });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    network.release();
    try { assert.deepEqual(errors, []); }
    finally { await context.close(); }
  });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: `
    const createSuiteUpdates = (${createSuiteUpdates.toString()});
    const createSettingsExtraControls = (${createSettingsExtraControls.toString()});
    const dialog = document.getElementById('ytms-settings-dialog');
    const suite = {
      playheadMarker: { defaultSize:24, read:()=>({ok:true,value:null}), prepareFile:async()=>({ok:false,error:'No fixture image'}), save:()=>({ok:true}), remove:()=>({ok:true}) },
      updates: createSuiteUpdates({getStorage:()=>localStorage,installedVersion:'1.2.61',defaultSourceUrl:${JSON.stringify(SOURCE_URL)},fetch:(url,options)=>fetch(url,options)})
    };
    const controls = createSettingsExtraControls(document,window,suite,dialog);
    window.fixture = { controls, suite, draftEvents:[], installEvents:[] };
    for(const type of ['input','change']) dialog.addEventListener(type,event=>{
      window.fixture.draftEvents.push({type,id:event.target.id}); document.getElementById('fixture-main-save').disabled=false;
    });
    const select=id=>{controls.selectTab(id);document.getElementById('ytms-section-credits').hidden=id!=='credits';document.getElementById('ytms-section-player').hidden=id!=='player';};
    document.getElementById('fixture-open').addEventListener('click',()=>{dialog.showModal();controls.open();select('credits');});
    document.getElementById('fixture-close').addEventListener('click',()=>{controls.close();dialog.close();});
    document.getElementById('fixture-credits').addEventListener('click',()=>select('credits'));
    document.getElementById('fixture-player').addEventListener('click',()=>select('player'));
    for(const type of ['click','auxclick']) document.getElementById('ytms-updates-install').addEventListener(type,event=>{
      window.fixture.installEvents.push({type,prevented:event.defaultPrevented,href:event.currentTarget.getAttribute('href')});event.preventDefault();
    });
  ` });
  await page.locator('#fixture-open').click();
  return { page, context, network };
}

async function checkNewer(page) {
  await page.locator('#ytms-updates-source').fill(SOURCE_URL);
  await page.locator('#ytms-updates-check').click();
  await page.locator('#ytms-updates-install').waitFor({ state: 'visible' });
}

test('Credits opening and source typing never contact the update source or dirty main settings', async t => {
  const { page, network } = await pageFor(t);
  assert.equal(network.requests.length, 0);
  assert.equal(await page.locator('#ytms-updates-source').inputValue(), SOURCE_URL);
  assert.equal(await page.locator('#ytms-updates-latest').textContent(), 'Latest version: Not checked');
  await page.locator('#ytms-updates-source').fill(SOURCE_URL);
  await page.locator('#ytms-updates-source').dispatchEvent('change');
  assert.equal(network.requests.length, 0);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SOURCE_KEY), null);
  assert.deepEqual(await page.evaluate(() => window.fixture.draftEvents), []);
  assert.equal(await page.locator('#fixture-main-save').isDisabled(), true);
  await page.locator('#fixture-main-setting').check();
  assert.equal(await page.locator('#fixture-main-save').isEnabled(), true, 'the fixture can observe ordinary main-setting input');
});

test('the prefilled latest release checks without typing and clearing a custom source restores it', async t => {
  const { page, network } = await pageFor(t, { initialSource: JSON.stringify({ version: 1, url: 'https://other.example.invalid/release-manifest.json' }) });
  assert.equal(await page.locator('#ytms-updates-source').inputValue(), 'https://other.example.invalid/release-manifest.json');
  await page.locator('#ytms-updates-source').fill('');
  await page.locator('#ytms-updates-save-source').click();
  await page.locator('#ytms-updates-check').click();
  await page.locator('#ytms-updates-install').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#ytms-updates-source').inputValue(), SOURCE_URL);
  assert.equal(network.requests.length, 1);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SOURCE_KEY), null);
  await page.locator('#fixture-close').click();
  await page.locator('#fixture-open').click();
  assert.equal(await page.locator('#ytms-updates-source').inputValue(), SOURCE_URL);
  await page.locator('#ytms-updates-check').click();
  await page.locator('#ytms-updates-install').waitFor({ state: 'visible' });
  assert.equal(network.requests.length, 2);
});

test('checking reads the saved source without writing it and exposes a newer-release install link', async t => {
  const { page, network } = await pageFor(t);
  const mainBefore = await page.evaluate(key => localStorage.getItem(key), SETTINGS_KEY);
  await checkNewer(page);
  assert.equal(network.requests.length, 1);
  assert.equal(network.requests[0].url(), API_URL);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SOURCE_KEY), null);
  assert.equal(await page.locator('#ytms-updates-latest').textContent(), 'Latest version: 1.2.62');
  assert.match(await page.locator('#ytms-updates-status').textContent(), /update is available/);
  const install = page.locator('#ytms-updates-install');
  assert.equal(await install.getAttribute('href'), downloadUrl('1.2.62'));
  assert.equal(await install.getAttribute('target'), '_blank');
  assert.equal(await install.getAttribute('rel'), 'noopener noreferrer');
  await install.click();
  assert.deepEqual(await page.evaluate(() => window.fixture.installEvents), [{ type: 'click', prevented: false, href: downloadUrl('1.2.62') }]);
  assert.equal(network.requests.length, 1, 'installation does not fetch userscript code in the page');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SETTINGS_KEY), mainBefore);
  assert.deepEqual(await page.evaluate(() => window.fixture.draftEvents), []);
  assert.equal(await page.locator('#fixture-main-save').isDisabled(), true);
});

test('invalid or credential-bearing source input cannot initiate a request or overwrite a saved source', async t => {
  const raw = JSON.stringify({ version: 1, url: SOURCE_URL });
  const { page, network } = await pageFor(t, { initialSource: raw });
  await page.locator('#ytms-updates-source').fill('https://name:password@updates.example.invalid/release-manifest.json');
  await page.locator('#ytms-updates-save-source').click();
  assert.match(await page.locator('#ytms-updates-status').textContent(), /without credentials/);
  assert.equal(network.requests.length, 0);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SOURCE_KEY), raw);
  assert.equal(await page.locator('#ytms-updates-install').getAttribute('href'), null);
});

test('page-script clicks cannot change the release source or check for updates', async t => {
  const { page, network } = await pageFor(t);
  const edited = 'https://other.example.invalid/release-manifest.json';
  await page.locator('#ytms-updates-source').fill(edited);
  await page.evaluate(() => {
    document.getElementById('ytms-updates-save-source').click();
    document.getElementById('ytms-updates-check').click();
  });
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SOURCE_KEY), null);
  assert.equal(network.requests.length, 0);
  await page.locator('#ytms-updates-check').click();
  assert.match(await page.locator('#ytms-updates-status').textContent(), /Save the edited/);
  await page.locator('#ytms-updates-save-source').click();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).url, SOURCE_KEY), edited);
  assert.equal(network.requests.length, 0);
});

for (const [version, status] of [['1.2.61', /latest version/], ['1.2.60', /installed version is newer/]]) {
  test(`a ${version} release reports its version without enabling installation`, async t => {
    const { page, network } = await pageFor(t); network.value = release(version);
    await page.locator('#ytms-updates-source').fill(SOURCE_URL);
    await page.locator('#ytms-updates-check').click();
    await page.waitForFunction(() => document.getElementById('ytms-updates-check').disabled === false && document.getElementById('ytms-updates-latest').textContent !== 'Latest version: Not checked');
    assert.equal(await page.locator('#ytms-updates-latest').textContent(), `Latest version: ${version}`);
    assert.match(await page.locator('#ytms-updates-status').textContent(), status);
    assert.equal(await page.locator('#ytms-updates-install').isHidden(), true);
    assert.equal(await page.locator('#ytms-updates-install').getAttribute('href'), null);
  });
}

for (const action of ['edit', 'close', 'tab']) {
  test(`${action} cancels a pending check and a late response cannot restore installation access`, async t => {
    const { page, network } = await pageFor(t); network.hold = true;
    const requested = new Promise(resolve => { network.onRequest = resolve; });
    await page.locator('#ytms-updates-source').fill(SOURCE_URL);
    await page.locator('#ytms-updates-check').click();
    await requested;
    await page.waitForFunction(() => document.getElementById('ytms-updates-check').disabled);
    if (action === 'edit') await page.locator('#ytms-updates-source').fill('https://other.example.invalid/release-manifest.json');
    if (action === 'close') await page.locator('#fixture-close').click();
    if (action === 'tab') await page.locator('#fixture-player').click();
    network.release(); network.hold = false;
    await page.waitForTimeout(100);
    if (action === 'close') await page.locator('#fixture-open').click();
    if (action === 'tab') await page.locator('#fixture-credits').click();
    assert.equal(await page.locator('#ytms-updates-check').isEnabled(), true);
    assert.equal(await page.locator('#ytms-updates-install').isHidden(), true);
    assert.equal(await page.locator('#ytms-updates-install').getAttribute('href'), null);
    assert.doesNotMatch(await page.locator('#ytms-updates-status').textContent(), /update is available/);
    assert.equal(await page.locator('#ytms-updates-latest').textContent(), 'Latest version: Not checked');
    assert.equal(network.requests.length, 1, 'cancellation and reopening do not check automatically');
    assert.deepEqual(await page.evaluate(() => window.fixture.draftEvents), []);
  });
}

test('editing the source or leaving Credits removes a completed install link immediately', async t => {
  const { page, network } = await pageFor(t);
  await checkNewer(page);
  await page.locator('#ytms-updates-source').fill('https://other.example.invalid/release-manifest.json');
  assert.equal(await page.locator('#ytms-updates-install').getAttribute('href'), null);
  assert.equal(await page.locator('#ytms-updates-install').isHidden(), true);
  await checkNewer(page);
  await page.locator('#fixture-player').click();
  await page.locator('#fixture-credits').click();
  assert.equal(await page.locator('#ytms-updates-install').getAttribute('href'), null);
  assert.equal(network.requests.length, 2);
});

test('a changed saved source prevents both primary and middle-button installation', async t => {
  const { page } = await pageFor(t);
  await checkNewer(page);
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, url: 'https://other.example.invalid/release-manifest.json' })), SOURCE_KEY);
  await page.locator('#ytms-updates-install').evaluate(node => node.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })));
  const [event] = await page.evaluate(() => window.fixture.installEvents);
  assert.equal(event.prevented, true);
  assert.equal(event.href, null);
  assert.equal(await page.locator('#ytms-updates-install').isHidden(), true);
});

test('a source changed in another tab removes the stale link without another request', async t => {
  const { page, context, network } = await pageFor(t);
  await checkNewer(page);
  const other = await context.newPage();
  await other.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await other.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, url: 'https://other.example.invalid/release-manifest.json' })), SOURCE_KEY);
  await page.waitForFunction(() => document.getElementById('ytms-updates-install').getAttribute('href') === null);
  assert.equal(await page.locator('#ytms-updates-install').isHidden(), true);
  assert.equal(network.requests.length, 1);
});
