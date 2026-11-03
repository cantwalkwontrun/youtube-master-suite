import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launchFixtureBrowser } from './fixture-browser.mjs';

const source = readFileSync(new URL('../../sources/modules/youtube-feed-ui-cleaner.user.js', import.meta.url), 'utf8');
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });

async function open(t, route = '/feed/history') {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const url = `https://www.youtube.com${route}`;
  await context.route('**/*', request => request.request().url() === url ? request.fulfill({ contentType:'text/html', body:`<!doctype html><html lang="en-GB"><body>
    <ytd-app><ytd-browse><ytd-two-column-browse-results-renderer><div id="secondary">
      <ytd-browse-feed-actions-renderer><div id="contents">
        <ytd-button-renderer id="clear"><button>Clear all watch history</button></ytd-button-renderer>
        <ytd-button-renderer id="pause"><button>Pause watch history</button></ytd-button-renderer>
        <ytd-button-renderer id="topics"><button>Hide topics</button></ytd-button-renderer>
        <ytd-button-renderer id="feedback"><button>Send feedback</button></ytd-button-renderer>
        <ytd-compact-link-renderer id="why"><a>Why am I seeing this?</a></ytd-compact-link-renderer>
        <ytd-button-renderer id="composite"><button>Send feedback</button><button>Keep me</button></ytd-button-renderer>
      </div></ytd-browse-feed-actions-renderer>
    </div><div id="primary">
      <ytd-browse-feed-actions-renderer><div id="contents">
        <ytd-button-renderer id="primary-feedback"><button>Send feedback</button></ytd-button-renderer>
      </div></ytd-browse-feed-actions-renderer>
    </div></ytd-two-column-browse-results-renderer></ytd-browse></ytd-app>
    <button id="outside">Send feedback</button>
  </body></html>` }) : request.abort());
  const page = await context.newPage();
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(url);
  await page.evaluate(() => { window.GM_addStyle = css => { const style=document.createElement('style'); style.textContent=css; document.head.append(style); }; });
  await page.addScriptTag({ content: source });
  return page;
}

test('only the two exact history sidebar actions are hidden in light and dark modes', async t => {
  const page = await open(t);
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.toggleAttribute('dark', value), dark);
    for (const id of ['feedback','why']) assert.equal(await page.locator('#'+id).evaluate(node => getComputedStyle(node).display), 'none');
    for (const id of ['clear','pause','topics','composite','outside']) assert.notEqual(await page.locator('#'+id).evaluate(node => getComputedStyle(node).display), 'none');
  }
});

test('a same-structured primary History action stays visible while its sidebar counterpart is hidden', async t => {
  const page = await open(t);
  const sidebar = page.locator('#feedback');
  const primary = page.locator('#primary-feedback');
  assert.equal(await sidebar.getAttribute('data-ytms-history-aux-hidden'), '1');
  assert.equal(await sidebar.evaluate(node => getComputedStyle(node).display), 'none');
  assert.equal(await primary.getAttribute('data-ytms-history-aux-hidden'), null);
  assert.notEqual(await primary.evaluate(node => getComputedStyle(node).display), 'none');
});

test('late and recycled rows are reconciled; navigation and suspension restore native rows', async t => {
  const page = await open(t);
  await page.locator('#feedback button').evaluate(node => { node.textContent='Another action'; });
  await page.waitForFunction(() => !document.querySelector('#feedback').hasAttribute('data-ytms-history-aux-hidden'));
  await page.locator('#why a').evaluate(node => { node.textContent='Another link'; });
  await page.waitForFunction(() => !document.querySelector('#why').hasAttribute('data-ytms-history-aux-hidden'));
  await page.locator('#feedback button').evaluate(node => { node.textContent='Send feedback'; });
  await page.waitForFunction(() => document.querySelector('#feedback').getAttribute('data-ytms-history-aux-hidden')==='1');
  await page.evaluate(() => {
    const row=document.createElement('ytd-button-renderer'); row.id='late';
    const button=document.createElement('button'); button.textContent='Why am I seeing this?'; row.append(button);
    document.querySelector('ytd-browse-feed-actions-renderer #contents').append(row);
  });
  await page.waitForFunction(() => document.querySelector('#late').getAttribute('data-ytms-history-aux-hidden')==='1');
  await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-start')));
  assert.equal(await page.locator('[data-ytms-history-aux-hidden]').count(), 0);
  await page.evaluate(() => { history.pushState({}, '', '/'); window.dispatchEvent(new Event('yt-navigate-finish')); });
  assert.equal(await page.locator('[data-ytms-history-aux-hidden]').count(), 0);
  await page.evaluate(() => { history.pushState({}, '', '/feed/history'); window.dispatchEvent(new Event('yt-navigate-finish')); });
  assert.equal(await page.locator('#feedback').getAttribute('data-ytms-history-aux-hidden'), '1');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.locator('[data-ytms-history-aux-hidden]').count(), 0);
});

test('identical labels outside History do not alter native actions', async t => {
  const page = await open(t, '/feed/library');
  assert.equal(await page.locator('[data-ytms-history-aux-hidden]').count(), 0);
});

test('late sidebar wrapped in a generic container under History secondary is discovered', async t => {
  const page = await open(t);
  await page.locator('#secondary ytd-browse-feed-actions-renderer').evaluate(node => node.remove());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    const wrapper = document.createElement('div');
    const actions = document.createElement('ytd-browse-feed-actions-renderer');
    const contents = document.createElement('div'); contents.id = 'contents';
    const row = document.createElement('ytd-button-renderer'); row.id = 'late-wrapped';
    const button = document.createElement('button'); button.textContent = 'Send feedback';
    row.append(button); contents.append(row); actions.append(contents); wrapper.append(actions);
    document.querySelector('ytd-two-column-browse-results-renderer #secondary').append(wrapper);
  });
  await page.waitForFunction(() => document.querySelector('#late-wrapped')?.getAttribute('data-ytms-history-aux-hidden') === '1');
});

test('unrelated History content churn does not scan added generic subtrees for sidebars', async t => {
  const page = await open(t);
  await page.evaluate(() => {
    window.historySidebarUnrelatedScans = 0;
    const primary = document.querySelector('ytd-two-column-browse-results-renderer #primary');
    for (let index = 0; index < 100; index++) {
      const node = document.createElement('div');
      const query = node.querySelector.bind(node);
      node.querySelector = selector => {
        if (selector === 'ytd-browse-feed-actions-renderer') window.historySidebarUnrelatedScans++;
        return query(selector);
      };
      primary.append(node);
    }
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.historySidebarUnrelatedScans), 0);
});
