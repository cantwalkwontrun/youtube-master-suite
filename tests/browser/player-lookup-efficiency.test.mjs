import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { launchFixtureBrowser } from "./fixture-browser.mjs";

const MINIPLAYER = readFileSync(
  new URL("../../sources/modules/youtube-miniplayer-button-restorer.user.js", import.meta.url), "utf8",
);
const COHERENCE = readFileSync(
  new URL("../../sources/modules/youtube-page-coherence.user.js", import.meta.url), "utf8",
).replace('const INCLUDE_DETAILED_DIAGNOSTICS = false;', 'const INCLUDE_DETAILED_DIAGNOSTICS = true;');
const WATCH_URL = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
let browser;

before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

async function open(t, { native = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await context.route("**/*", route => route.request().url() === WATCH_URL
    ? route.fulfill({ contentType: "text/html", body: `<!doctype html>
      <html lang="en-GB"><title>Player lookup fixture</title><style>
      ytd-watch-flexy { display:block } [hidden] { display:none !important }
      .html5-video-player { position:relative;width:900px;height:500px }
      .ytp-chrome-bottom { position:absolute;bottom:0;width:100%;height:48px }
      .ytp-right-controls { display:flex;justify-content:flex-end }
      .ytp-button { width:48px;height:36px }
      </style><body></body></html>` })
    : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => {
    try { assert.deepEqual(errors, []); }
    finally { await context.close(); }
  });
  await page.goto(WATCH_URL);
  await page.evaluate(native => {
    window.fixture = {
      documentQueries: 0, playerScans: 0, rectReads: 0, apiReads: 0,
      reset() { this.documentQueries = this.playerScans = this.rectReads = this.apiReads = 0; },
      makeWatch(videoId, native = false) {
        const watch = document.createElement("ytd-watch-flexy");
        watch.setAttribute("video-id", videoId);
        watch.data = { playerResponse: { videoDetails: { videoId } } };
        watch.innerHTML = `<div id="movie_player" class="html5-video-player"><video></video>
          <div class="ytp-chrome-bottom"><div class="ytp-right-controls">
          ${native ? '<button class="ytp-button ytp-miniplayer-button" aria-label="Native miniplayer"></button>' : ""}
          <button class="ytp-button ytp-fullscreen-button" aria-label="Fullscreen"></button>
          </div></div></div><ytd-comments></ytd-comments>`;
        watch.querySelector("#movie_player").getVideoData = () => {
          fixture.apiReads++;
          return { video_id: videoId, title: "Fixture video" };
        };
        const rects = watch.getClientRects.bind(watch);
        watch.getClientRects = () => { fixture.rectReads++; return rects(); };
        document.body.append(watch);
        return watch;
      },
    };
    fixture.first = fixture.makeWatch("aaaaaaaaaaa", native);
    const query = document.querySelector.bind(document);
    document.querySelector = selector => { fixture.documentQueries++; return query(selector); };
    const queryAll = document.querySelectorAll.bind(document);
    document.querySelectorAll = selector => {
      if (selector === '[id="movie_player"]') fixture.playerScans++;
      return queryAll(selector);
    };
  }, native);
  return page;
}

for (const surface of ['comments', 'captions', 'progress'])
test(`source skips player discovery and layout reads for 2000 ordinary ${surface} batches`, async t => {
  const page = await open(t);
  await page.evaluate(surface => {
    let content = fixture.first.querySelector('ytd-comments');
    if (surface !== 'comments') {
      content = document.createElement('div');
      content.className = surface === 'captions' ? 'ytp-caption-window-container' : 'ytp-progress-bar-container';
      fixture.first.querySelector('#movie_player').append(content);
    }
    fixture.ordinaryContent = content;
  }, surface);
  await page.addScriptTag({ content: MINIPLAYER });
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const counts = await page.evaluate(async () => {
    const comments = fixture.ordinaryContent;
    fixture.reset();
    for (let index = 0; index < 1000; index++) {
      const span = comments.appendChild(document.createElement("span"));
      await Promise.resolve();
      span.remove();
      await Promise.resolve();
    }
    return { queries: fixture.documentQueries, rectReads: fixture.rectReads };
  });
  assert.deepEqual(counts, { queries: 0, rectReads: 0 });
  const unknown = await page.evaluate(async () => {
    fixture.reset();
    const node = document.body.appendChild(document.createElement("div"));
    await Promise.resolve();
    const counts = { queries: fixture.documentQueries, rectReads: fixture.rectReads };
    node.remove();
    return counts;
  });
  assert.ok(unknown.queries > 0 && unknown.rectReads > 0, "Unknown batches retain the existing discovery path");
});

for (const hiddenBy of ['hidden', 'opacity', 'inert', 'scale'])
test(`source preserves retained-watch ${hiddenBy}, toolbar replacement and BFCache recovery`, async t => {
  const page = await open(t, { native: false });
  await page.addScriptTag({ content: MINIPLAYER });
  // Keep the pointer elsewhere so the reused button cannot legitimately receive
  // a new mouseenter when its replacement player occupies the same coordinates.
  await page.locator("#tmk-miniplayer-button").dispatchEvent("mouseenter");
  await page.locator("#tmk-miniplayer-tooltip").waitFor({ state: "visible" });
  await page.evaluate(hiddenBy => {
    fixture.next = fixture.makeWatch("bbbbbbbbbbb");
    if (hiddenBy === 'hidden') fixture.first.hidden = true;
    if (hiddenBy === 'opacity') fixture.first.style.opacity = '0';
    if (hiddenBy === 'inert') fixture.first.inert = true;
    if (hiddenBy === 'scale') fixture.first.style.transform = 'scale(0)';
    fixture.next.querySelector("ytd-comments").append(document.createElement("span"));
  }, hiddenBy);
  await page.waitForFunction(() => document.getElementById("tmk-miniplayer-button")
    ?.closest("ytd-watch-flexy") === fixture.next);
  assert.equal(await page.locator("#tmk-miniplayer-tooltip").count(), 0);
  await page.evaluate(() => {
    fixture.commands = [];
    for (const [name, owner] of [['old', fixture.first], ['current', fixture.next]])
      owner.querySelector('#movie_player').addEventListener('keydown', event => {
        if (event.key === 'i') fixture.commands.push(name);
      });
  });
  await page.locator('#tmk-miniplayer-button').click();
  assert.deepEqual(await page.evaluate(() => fixture.commands), ['current']);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
    const old = fixture.next.querySelector(".ytp-right-controls");
    fixture.replacement = document.createElement("div");
    fixture.replacement.className = "ytp-right-controls";
    old.replaceWith(fixture.replacement);
    window.dispatchEvent(new Event("pageshow"));
  });
  await page.waitForFunction(() => document.getElementById("tmk-miniplayer-button")?.parentElement === fixture.replacement);
  assert.equal(await page.locator("#tmk-miniplayer-button").count(), 1);
});

for (const hiddenBy of ['hidden', 'display', 'opacity', 'visibility', 'aria-hidden', 'inert', 'scale'])
test(`restored Miniplayer control uses the current toolbar beside a retained ${hiddenBy} toolbar`, async t => {
  const page = await open(t, { native: false });
  await page.evaluate(hiddenBy => {
    fixture.currentControls = fixture.first.querySelector('.ytp-right-controls');
    const retained = fixture.currentControls.cloneNode(true);
    if (hiddenBy === 'hidden') retained.hidden = true;
    if (hiddenBy === 'display') retained.style.display = 'none';
    if (hiddenBy === 'opacity') retained.style.opacity = '0';
    if (hiddenBy === 'visibility') retained.style.visibility = 'hidden';
    if (hiddenBy === 'aria-hidden') retained.setAttribute('aria-hidden', 'true');
    if (hiddenBy === 'inert') retained.inert = true;
    if (hiddenBy === 'scale') retained.style.transform = 'scale(0)';
    retained.id = 'retained-controls';
    fixture.currentControls.before(retained);
  }, hiddenBy);
  await page.addScriptTag({ content: MINIPLAYER });
  await page.waitForFunction(() => document.getElementById('tmk-miniplayer-button')?.parentElement === fixture.currentControls);
  assert.equal(await page.locator('#tmk-miniplayer-button').count(), 1);
  assert.equal(await page.locator('#tmk-miniplayer-button').isVisible(), true);
});

test("restored Miniplayer control follows a late toolbar while its previous toolbar is retained", async t => {
  const page = await open(t, { native: false });
  await page.addScriptTag({ content: MINIPLAYER });
  await page.locator('#tmk-miniplayer-button').waitFor();
  await page.evaluate(() => {
    const old = fixture.first.querySelector('.ytp-right-controls');
    const next = old.cloneNode(true); next.querySelector('#tmk-miniplayer-button').remove();
    old.hidden = true; old.after(next); fixture.currentControls = next;
  });
  await page.waitForFunction(() => document.getElementById('tmk-miniplayer-button')?.parentElement === fixture.currentControls);
  assert.equal(await page.locator('#tmk-miniplayer-button').count(), 1);
});

for (const surface of ['ytd-miniplayer', 'ytd-video-preview', 'ytd-reel-video-renderer'])
test(`watch Miniplayer restoration does not borrow a ${surface} toolbar`, async t => {
  const page = await open(t, { native: false });
  await page.evaluate(surface => {
    const host = document.createElement(surface); host.style.display = 'block';
    host.append(fixture.first.querySelector('#movie_player'));
    fixture.first.replaceWith(host);
  }, surface);
  await page.addScriptTag({ content: MINIPLAYER });
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#tmk-miniplayer-button').count(), 0);
});

test('native toolbar auto-hide preserves the restored Miniplayer button identity', async t => {
  const page = await open(t, { native: false });
  await page.addScriptTag({ content: MINIPLAYER });
  await page.locator('#tmk-miniplayer-button').waitFor();
  await page.evaluate(() => {
    fixture.button = document.getElementById('tmk-miniplayer-button');
    fixture.first.querySelector('.ytp-chrome-bottom').style.visibility = 'hidden';
    fixture.first.querySelector('.ytp-chrome-bottom').style.opacity = '0';
  });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.getElementById('tmk-miniplayer-button') === fixture.button), true);
  await page.evaluate(() => fixture.first.querySelector('.ytp-chrome-bottom').removeAttribute('style'));
  assert.equal(await page.locator('#tmk-miniplayer-button').isVisible(), true);
});

test("coherence source selects once per snapshot and rereads a replaced or floated player", async t => {
  const page = await open(t);
  await page.addScriptTag({ content: COHERENCE });
  const initial = await page.evaluate(() => {
    fixture.reset();
    for (let index = 0; index < 1000; index++) {
      const snapshot = __YT_MASTER_STATE__.snapshot();
      if (snapshot.playerVideoId !== "aaaaaaaaaaa") throw new Error("Wrong fixture identity");
    }
    return { scans: fixture.playerScans, reads: fixture.apiReads };
  });
  assert.deepEqual(initial, { scans: 1000, reads: 2000 });
  const replaced = await page.evaluate(() => {
    fixture.first.hidden = true;
    fixture.next = fixture.makeWatch("bbbbbbbbbbb");
    history.replaceState(null, "", "/watch?v=bbbbbbbbbbb");
    fixture.reset();
    const snapshot = __YT_MASTER_STATE__.snapshot();
    return { scans: fixture.playerScans, reads: fixture.apiReads,
      player: snapshot.playerVideoId, flexy: snapshot.flexyVideoId, coherent: snapshot.confirmedCoherent };
  });
  assert.deepEqual(replaced, { scans: 1, reads: 2, player: "bbbbbbbbbbb", flexy: "bbbbbbbbbbb", coherent: true });
  const floated = await page.evaluate(() => {
    document.body.append(fixture.next.querySelector("#movie_player"));
    const placeholder = document.createElement("div");
    placeholder.id = "ytsmp-player-placeholder";
    fixture.next.append(placeholder);
    fixture.reset();
    const snapshot = __YT_MASTER_STATE__.snapshot();
    return { scans: fixture.playerScans, player: snapshot.playerVideoId, flexy: snapshot.flexyVideoId };
  });
  assert.deepEqual(floated, { scans: 1, player: "bbbbbbbbbbb", flexy: "bbbbbbbbbbb" });
});

test("coherence source scans retained comments once per off-watch event and keeps later snapshots fresh", async t => {
  const page = await open(t);
  await page.evaluate(() => {
    history.replaceState(null, "", "/");
    fixture.first.hidden = true;
    const comments = fixture.first.querySelector("ytd-comments");
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 500; index++) {
      const renderer = document.createElement("ytd-comment-thread-renderer");
      const published = document.createElement("span"); published.id = "published-time-text";
      const link = document.createElement("a");
      link.href = `/watch?v=aaaaaaaaaaa&lc=fixture-${index}`;
      published.append(link); renderer.append(published); fragment.append(renderer);
    }
    comments.append(fragment);
    const links = [...comments.querySelectorAll("a")];
    fixture.replaceCommentIds = videoId => links.forEach((link, index) => {
      link.href = `/watch?v=${videoId}&lc=fixture-${index}`;
    });
    fixture.commentScans = fixture.linksRead = 0;
    const queryAll = comments.querySelectorAll.bind(comments);
    comments.querySelectorAll = selector => {
      const result = queryAll(selector);
      fixture.commentScans++; fixture.linksRead += result.length;
      return result;
    };
  });
  await page.addScriptTag({ content: COHERENCE });
  const keys = await page.evaluate(() => Object.keys(__YT_MASTER_STATE__.snapshot()).sort());
  for (const type of ["yt-page-data-updated", "yt-navigate-finish", "pageshow"]) {
    const result = await page.evaluate(type => {
      fixture.commentScans = fixture.linksRead = 0;
      window.dispatchEvent(new Event(type));
      return { scans: fixture.commentScans, linksRead: fixture.linksRead,
        state: JSON.parse(document.documentElement.getAttribute("data-yt-master-state")) };
    }, type);
    assert.deepEqual({ scans: result.scans, linksRead: result.linksRead }, { scans: 1, linksRead: 500 });
    assert.deepEqual(Object.keys(result.state).sort(), keys);
    assert.deepEqual(result.state.commentVideoIds, ["aaaaaaaaaaa"]);
    assert.equal(result.state.identityStatus, "not-watch-page");
  }
  const nextEvent = await page.evaluate(() => {
    fixture.replaceCommentIds("bbbbbbbbbbb"); fixture.commentScans = fixture.linksRead = 0;
    window.dispatchEvent(new Event("yt-page-data-updated"));
    return { scans: fixture.commentScans, linksRead: fixture.linksRead,
      ids: JSON.parse(document.documentElement.getAttribute("data-yt-master-state")).commentVideoIds };
  });
  assert.deepEqual(nextEvent, { scans: 1, linksRead: 500, ids: ["bbbbbbbbbbb"] });
  for (const [method, videoId] of [["snapshot", "ccccccccccc"], ["check", "aaaaaaaaaaa"]]) {
    const fresh = await page.evaluate(({ method, videoId }) => {
      fixture.replaceCommentIds(videoId); fixture.commentScans = fixture.linksRead = 0;
      const state = __YT_MASTER_STATE__[method]({ commentVideoIds: ["aaaaaaaaaaa"] });
      return { scans: fixture.commentScans, linksRead: fixture.linksRead, ids: state.commentVideoIds };
    }, { method, videoId });
    assert.deepEqual(fresh, { scans: 1, linksRead: 500, ids: [videoId] });
  }
});
