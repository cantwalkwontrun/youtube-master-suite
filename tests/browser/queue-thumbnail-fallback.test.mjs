// Language: en-GB. Synthetic ownership checks; no real thumbnails or profiles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const SOURCE = readFileSync(new URL('../../sources/modules/youtube-watch-layout-cleaner.user.js', import.meta.url), 'utf8');
const SUITE = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const HTML = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
const WATCH_URL = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });

async function open(t, suite) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url() === WATCH_URL
    ? route.fulfill({ contentType: 'text/html', body: HTML }) : route.abort());
  if (suite) await context.addInitScript({ content: SUITE });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(3500);
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(WATCH_URL);
  if (suite) await waitForSuiteHealth(page, MANIFEST.registeredModules, { timeoutMs: 10000, requireReady: true });
  await page.evaluate(() => {
    const panel = document.querySelector('ytd-playlist-panel-renderer');
    panel.style.cssText = 'display:block;position:fixed;top:70px;left:20px;width:300px'; panel.replaceChildren();
    const row = document.createElement('ytd-playlist-panel-video-renderer');
    row.style.cssText = 'display:block;width:280px;height:120px';
    const thumb = document.createElement('a'); thumb.id = 'thumbnail'; thumb.href = '/watch?v=aaaaaaaaaaa';
    thumb.style.cssText = 'display:block;width:120px;height:68px';
    const title = document.createElement('a'); title.id = 'video-title'; title.href = '/watch?v=aaaaaaaaaaa';
    title.textContent = 'Synthetic queue title'; row.append(thumb, title); panel.append(row);
    window.thumbnailFixture = { row, thumb, title, panel };
  });
  if (!suite) await page.addScriptTag({ content: SOURCE });
  await fallbackIs(page, 'aaaaaaaaaaa');
  return page;
}

async function fallbackIs(page, id) {
  await page.waitForFunction(id => {
    const { thumb } = thumbnailFixture;
    const value = thumb.style.getPropertyValue('--ywlc-thumbnail-fallback-image');
    return id === null ? !thumb.hasAttribute('data-ywlc-thumbnail-fallback') && value === ''
      : thumb.getAttribute('data-ywlc-thumbnail-fallback') === '1' && value.includes(`/vi/${id}/mqdefault.jpg`);
  }, id);
}

const settleMutation = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

for (const suite of [false, true]) {
  const label = suite ? 'complete Suite' : 'source';

  test(`owned queue thumbnail clears when a recycled row loses identity and recovers the new identity (${label})`, async t => {
    const page = await open(t, suite);
    await page.evaluate(() => { thumbnailFixture.thumb.removeAttribute('href'); thumbnailFixture.title.removeAttribute('href'); });
    await fallbackIs(page, null);
    await page.evaluate(() => {
      thumbnailFixture.thumb.href = '/watch?v=bbbbbbbbbbb'; thumbnailFixture.title.href = '/watch?v=bbbbbbbbbbb';
    });
    await fallbackIs(page, 'bbbbbbbbbbb');
  });

  test(`owned queue thumbnail rejects conflicting links until a recycled row has one identity (${label})`, async t => {
    const page = await open(t, suite);
    await page.evaluate(() => { thumbnailFixture.title.href = '/watch?v=bbbbbbbbbbb'; });
    await fallbackIs(page, null);
    await page.evaluate(() => { thumbnailFixture.thumb.href = '/watch?v=bbbbbbbbbbb'; });
    await fallbackIs(page, 'bbbbbbbbbbb');
    await page.evaluate(() => {
      const unrelated = document.createElement('a'); unrelated.href = 'https://example.invalid/watch?v=ccccccccccc';
      thumbnailFixture.row.append(unrelated);
    });
    await settleMutation(page);
    await fallbackIs(page, 'bbbbbbbbbbb');
  });

  test(`leaving Watch clears owned queue thumbnails before native Home reuse (${label})`, async t => {
    const page = await open(t, suite);
    await page.evaluate(() => {
      const mini = document.createElement('ytd-miniplayer'); document.querySelector('ytd-app').append(mini);
      mini.append(thumbnailFixture.panel); history.replaceState(null, '', '/');
      window.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await fallbackIs(page, null);
    await page.evaluate(() => {
      thumbnailFixture.thumb.removeAttribute('href'); thumbnailFixture.title.removeAttribute('href');
      history.replaceState(null, '', '/watch?v=bbbbbbbbbbb'); window.dispatchEvent(new Event('yt-navigate-finish'));
    });
    await fallbackIs(page, null);
    assert.equal(await page.evaluate(() => getComputedStyle(thumbnailFixture.thumb).backgroundImage), 'none');
  });

  test(`native queue adoption keeps recycled thumbnail identity current after startup timers (${label})`, async t => {
    const page = await open(t, suite);
    // Both initial repair passes must have finished before ownership changes;
    // a delayed startup pass would otherwise hide lost mutation observation.
    await page.waitForTimeout(1700);
    await page.evaluate(() => {
      const mini = document.createElement('ytd-miniplayer'); document.querySelector('ytd-app').append(mini);
      mini.append(thumbnailFixture.panel); thumbnailFixture.mini = mini;
    });
    await settleMutation(page);
    await page.evaluate(() => {
      thumbnailFixture.thumb.href = '/watch?v=bbbbbbbbbbb'; thumbnailFixture.title.href = '/watch?v=bbbbbbbbbbb';
    });
    await fallbackIs(page, 'bbbbbbbbbbb');
    assert.equal(await page.evaluate(() => location.pathname), '/watch');
    // Existing native page updates reconcile detached/reinserted panel targets;
    // the replacement must not depend on another document or a polling loop.
    await page.evaluate(() => {
      thumbnailFixture.panel.remove(); window.dispatchEvent(new Event('yt-page-data-updated'));
    });
    await settleMutation(page);
    await page.evaluate(() => {
      thumbnailFixture.thumb.href = '/watch?v=ccccccccccc'; thumbnailFixture.title.href = '/watch?v=ccccccccccc';
      thumbnailFixture.mini.append(thumbnailFixture.panel); window.dispatchEvent(new Event('yt-page-data-updated'));
    });
    await fallbackIs(page, 'ccccccccccc');
  });

  for (const destination of ['detached', 'outside-panel']) {
    test(`owned queue thumbnail clears when a row leaves its panel (${destination}, ${label})`, async t => {
      const page = await open(t, suite);
      await page.evaluate(() => { thumbnailFixture.panel.append(thumbnailFixture.row); });
      await settleMutation(page);
      await fallbackIs(page, 'aaaaaaaaaaa');
      await page.evaluate(destination => {
        if (destination === 'detached') thumbnailFixture.row.remove();
        else document.body.append(thumbnailFixture.row);
      }, destination);
      await fallbackIs(page, null);
      await page.evaluate(() => {
        thumbnailFixture.thumb.href = '/watch?v=bbbbbbbbbbb'; thumbnailFixture.title.href = '/watch?v=bbbbbbbbbbb';
        thumbnailFixture.panel.append(thumbnailFixture.row);
      });
      await fallbackIs(page, 'bbbbbbbbbbb');
    });
  }

  for (const custom of [false, true]) {
    test(`queue fallback cleanup preserves loaded ${custom ? 'DeArrow' : 'native'} image sources and styles (${label})`, async t => {
      const page = await open(t, suite);
      const original = await page.evaluate(async custom => {
        const image = document.createElement('img');
        image.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="68"%3E%3Crect width="120" height="68" fill="orange"/%3E%3C/svg%3E';
        image.style.cssText = 'display:block;width:120px;height:68px';
        if (custom) image.className = 'cbCustomThumbnail';
        thumbnailFixture.thumb.append(image); await image.decode();
        thumbnailFixture.image = image;
        const values = { src: image.getAttribute('src'), style: image.getAttribute('style'), className: image.className };
        thumbnailFixture.thumb.removeAttribute('href'); thumbnailFixture.title.removeAttribute('href');
        return values;
      }, custom);
      await fallbackIs(page, null);
      assert.deepEqual(await page.evaluate(() => ({ src: thumbnailFixture.image.getAttribute('src'),
        style: thumbnailFixture.image.getAttribute('style'), className: thumbnailFixture.image.className })), original);
      assert.equal(await page.evaluate(() => thumbnailFixture.image.isConnected), true);
    });
  }
}
