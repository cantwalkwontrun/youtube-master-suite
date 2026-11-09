// Language: en-GB. Synthetic hydration and toolbar convergence; no live account.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser, waitForSuiteHealth } from './fixture-browser.mjs';
const suite = readFileSync(new URL('../../youtube-master-suite.user.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8'));
const fixture = readFileSync(new URL('./watch-page.html', import.meta.url), 'utf8').replace('lang="en"', 'lang="en-GB"');
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });

test('a comment-heavy watch page converges toolbar order after late native controls without idle movement', async t => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  // Hydrate after the fixture's own renderer: inserting server markup earlier
  // would merely be replaced by its two native comments before module startup.
  const hydrate = `<script>const commentsForStartup=document.querySelector('ytd-comments');const nativeThreadForStartup=commentsForStartup.firstElementChild;for(let i=0;i<100;i++){const thread=nativeThreadForStartup.cloneNode(true);thread.setAttribute('data-startup-fixture-comment','1');commentsForStartup.append(thread);}</script>`;
  const html = fixture.replace('</body>', hydrate + '</body>');
  await context.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await context.addInitScript(() => {
    if (location.origin !== 'https://www.youtube.com') return;
    localStorage.setItem('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values: { theatreMode: false } }));
    window.toolbarAudit = { changes: 0 };
    new MutationObserver(records => {
      for (const record of records) if (record.target.nodeType === 1 && record.target.matches('.ytp-right-controls')) {
        toolbarAudit.changes += [...record.addedNodes, ...record.removedNodes].filter(node => node.nodeType === 1).length;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await context.addInitScript({ content: suite });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa&list=fixture-queue', { waitUntil: 'commit' });
  await waitForSuiteHealth(page, manifest.registeredModules, { timeoutMs: 10000, errors });
  await page.locator('#ytms-player-settings-button').waitFor();
  await page.locator('#ytppl-video-mirror-button').waitFor();
  assert.equal(await page.locator('[data-startup-fixture-comment="1"]').count(), 100);
  const order = () => page.locator('.ytp-right-controls').evaluate(controls => [...controls.children].map(button =>
    button.id || ['ytp-settings-button', 'ytp-size-button', 'ytp-fullscreen-button', 'ytp-miniplayer-button'].find(name => button.classList.contains(name)) || 'other'));
  const expected = ['ytp-settings-button', 'ytms-player-settings-button', 'ytppl-video-mirror-button', 'ytp-size-button', 'ytp-fullscreen-button', 'ytp-miniplayer-button'];
  assert.deepEqual(await order(), expected);
  const beforeIdle = await page.evaluate(() => toolbarAudit.changes);
  await page.waitForTimeout(750);
  assert.equal(await page.evaluate(() => toolbarAudit.changes), beforeIdle, 'a settled toolbar must not be moved repeatedly');
  assert.ok(beforeIdle <= 16, `startup inserted or moved ${beforeIdle} toolbar elements`);

  // Native hydration can temporarily omit both preferred anchors. Keep the
  // existing player and controls, then restore anchors in the same task.
  await page.evaluate(() => {
    const controls = document.querySelector('.ytp-right-controls');
    for (const selector of ['.ytp-settings-button', '.ytp-size-button']) controls.querySelector(selector).remove();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const controls = document.querySelector('.ytp-right-controls');
    const settings = document.createElement('button'); settings.className = 'ytp-settings-button ytp-button'; settings.textContent = 'S';
    const size = document.createElement('button'); size.className = 'ytp-size-button ytp-button'; size.textContent = 'D';
    controls.prepend(settings); controls.insertBefore(size, controls.querySelector('.ytp-fullscreen-button'));
  });
  await page.waitForFunction(() => {
    const controls = document.querySelector('.ytp-right-controls'), settings = controls.querySelector('.ytp-settings-button');
    return settings?.nextElementSibling?.id === 'ytms-player-settings-button' && settings.nextElementSibling.nextElementSibling?.id === 'ytppl-video-mirror-button';
  });
  assert.deepEqual(await order(), expected);

  // A separately suppressed native control requires one fallback, followed by
  // removal when native hydration makes the real control usable again.
  await page.locator('.ytp-miniplayer-button').evaluate(button => { button.style.display = 'none'; });
  await page.locator('#tmk-miniplayer-button').waitFor();
  await page.locator('.ytp-miniplayer-button').evaluate(button => { button.style.display = ''; });
  await page.locator('#tmk-miniplayer-button').waitFor({ state: 'detached' });
  await page.waitForTimeout(100);
  assert.deepEqual(await order(), expected);
  const afterHydration = await page.evaluate(() => toolbarAudit.changes);
  await page.waitForTimeout(750);
  assert.equal(await page.evaluate(() => toolbarAudit.changes), afterHydration);
  assert.ok(afterHydration <= 40, `hydration inserted or moved ${afterHydration} toolbar elements`);
});
