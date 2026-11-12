// Language: en-GB. Independent hidden-route ownership regressions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';

const source = readFileSync(new URL('../../sources/modules/youtube-scroll-miniplayer.user.js', import.meta.url), 'utf8');
const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const fixture = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('<html lang="en"', '<html lang="en-GB"');
const url = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

async function frames(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
  });
}

for (const complete of [false, true]) {
  for (const mode of ['display-none', 'hidden-ancestor', 'aria-hidden-ancestor', 'opacity-ancestor']) {
    test(`retained invisible watch cannot donate a floating player (${mode}, ${complete ? 'Suite' : 'source'})`, async t => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
      t.after(() => context.close());
      await context.route('**/*', route => route.request().url() === url
        ? route.fulfill({ contentType: 'text/html', body: fixture }) : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.evaluate(mode => {
        const root = document.querySelector('ytd-watch-flexy');
        const host = root.querySelector('#player');
        const trigger = document.createElement('div');
        trigger.id = 'single-column-container';
        host.before(trigger); trigger.append(host);
        const wrapper = document.createElement('div');
        root.before(wrapper); wrapper.append(root);
        window.fixture.retainedHost = host;
        window.fixture.retainedPlayer = host.querySelector('#movie_player');
        window.fixture.retainedWrapper = wrapper;
        if (mode === 'display-none') root.style.display = 'none';
        if (mode === 'hidden-ancestor') wrapper.hidden = true;
        if (mode === 'aria-hidden-ancestor') wrapper.setAttribute('aria-hidden', 'true');
        if (mode === 'opacity-ancestor') wrapper.style.opacity = '0';
        document.body.style.minHeight = '3000px';
      }, mode);
      await page.addScriptTag({ content: complete ? suite : source });
      if (complete) await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
      await page.evaluate(() => { window.scrollTo(0, 800); window.dispatchEvent(new Event('resize')); });
      await frames(page);
      assert.deepEqual(await page.evaluate(() => ({
        owned: fixture.retainedPlayer.parentElement === fixture.retainedHost,
        floating: document.body.classList.contains('ytsmp-scroll-miniplayer-active'),
      })), { owned: true, floating: false }, 'Invisible retained watch content must remain in its native host');
      await page.evaluate(() => {
        document.querySelector('ytd-watch-flexy').style.removeProperty('display');
        fixture.retainedWrapper.hidden = false;
        fixture.retainedWrapper.removeAttribute('aria-hidden');
        fixture.retainedWrapper.style.removeProperty('opacity');
        window.dispatchEvent(new Event('resize'));
      });
      await frames(page);
      assert.equal(await page.evaluate(() => fixture.retainedPlayer.parentElement === document.body), true,
        'A revealed watch page must still float its existing player when scrolled past');
      await page.evaluate(() => {
        fixture.bodyStyleMutations = 0;
        fixture.idleObserver = new MutationObserver(records => { fixture.bodyStyleMutations += records.length; });
        fixture.idleObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
      });
      await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => fixture.bodyStyleMutations) <= 2,
        'A settled floating player must not continuously rewrite body geometry or classes');
      await page.evaluate(() => {
        fixture.idleObserver.disconnect();
        const other = document.createElement('ytd-watch-flexy');
        other.style.cssText = 'position:absolute;top:0;left:0;width:640px;height:400px';
        other.innerHTML = '<div id="single-column-container"><div id="player"><div id="movie_player" class="html5-video-player"><video></video></div></div></div>';
        document.querySelector('ytd-app').append(other);
        fixture.otherWatchRoot = other;
      });
      await page.evaluate(() => { fixture.retainedWrapper.hidden = true; });
      await frames(page);
      assert.equal(await page.evaluate(() => fixture.retainedPlayer.parentElement === fixture.retainedHost), true,
        'Hiding an already floated watch ancestor must restore ownership without a resize or navigation event');
      await page.evaluate(() => { fixture.otherWatchRoot.remove(); fixture.retainedWrapper.hidden = false; window.dispatchEvent(new Event('resize')); });
      await frames(page);
      assert.equal(await page.evaluate(() => fixture.retainedPlayer.parentElement === document.body), true);
      await page.evaluate(() => {
        const hidden = document.createElement('div');
        hidden.hidden = true;
        fixture.retainedWrapper.before(hidden);
        hidden.append(fixture.retainedWrapper);
        fixture.hiddenReparentHost = hidden;
      });
      await frames(page);
      assert.equal(await page.evaluate(() => fixture.retainedPlayer.parentElement === fixture.retainedHost), true,
        'Reparenting the origin beneath an already-hidden ancestor must also restore ownership');
      await page.evaluate(() => { fixture.hiddenReparentHost.hidden = false; window.dispatchEvent(new Event('resize')); });
      await frames(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await frames(page);
      assert.equal(await page.evaluate(() => fixture.retainedPlayer.parentElement === fixture.retainedHost), true,
        'Returning to the player must restore the same native host');
      assert.deepEqual(errors, []);
    });
  }
}

for (const hideHashtags of [false, true]) for (const content of ['plain', 'linked']) {
  test(`blank-row cleanup respects hashtag-only descriptions (${content}, hide ${hideHashtags})`, async t => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    t.after(() => context.close());
    await context.route('**/*', route => route.request().url() === url
      ? route.fulfill({ contentType: 'text/html', body: fixture }) : route.abort());
    await context.addInitScript(hideHashtags => {
      localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1,
        values: { hideHashtags, collapseDescriptionBlankRows: true, theatreMode: false } }));
    }, hideHashtags);
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(content => {
      const description = document.createElement('div');
      description.id = 'description';
      description.innerHTML = '<ytd-text-inline-expander id="description-inline-expander"><div id="expanded"></div></ytd-text-inline-expander>';
      description.querySelector('#expanded').innerHTML = content === 'linked'
        ? '<a href="/hashtag/fixture">#fixture</a>' : '#fixture';
      description.querySelector('#expanded').insertAdjacentHTML('beforeend', '<button>Show less</button>');
      document.querySelector('ytd-watch-metadata').append(description);
    }, content);
    await page.addScriptTag({ content: suite });
    await waitForSuiteHealth(page, manifest.registeredModules, { requireReady: true });
    await frames(page);
    assert.equal(await page.locator('#expanded').evaluate(node => getComputedStyle(node).display === 'none'), hideHashtags,
      'Blank-row cleanup must not hide text which the hashtag preference preserves');
    await page.locator('#expanded').evaluate(node => { node.innerHTML = 'Recycled ordinary description<button>Show less</button>'; });
    await frames(page);
    assert.equal(await page.locator('#expanded').evaluate(node => getComputedStyle(node).display === 'none'), false,
      'Ordinary replacement content must restore an earlier collapsed description');
    await page.locator('#expanded').evaluate((node, content) => {
      node.innerHTML = content === 'linked' ? '<a href="/hashtag/recycled">#recycled</a>' : '#recycled';
      node.insertAdjacentHTML('beforeend', '<button>Show less</button>');
    }, content);
    await frames(page);
    assert.equal(await page.locator('#expanded').evaluate(node => getComputedStyle(node).display === 'none'), hideHashtags,
      'Recycled hashtag content must retain the independent preference');
  });
}
