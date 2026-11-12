import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { launchFixtureBrowser, waitForSuiteHealth } from "./fixture-browser.mjs";

const MINIPLAYER = readFileSync(new URL("../../sources/modules/youtube-scroll-miniplayer.user.js", import.meta.url), "utf8");
const SUITE = readFileSync(new URL("../../youtube-master-suite.user.js", import.meta.url), "utf8");
const MANIFEST = JSON.parse(readFileSync(new URL("../../release-manifest.json", import.meta.url), "utf8"));
const FIXTURE = readFileSync(new URL("./watch-page.html", import.meta.url), "utf8");
const WATCH_URL = "https://www.youtube.com/watch?v=aaaaaaaaaaa&list=fixture-queue";
let browser;

before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); }, { timeout: 10000 });

async function openFloatingFixture(t, viewport, { suite = false } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  await context.route("**/*", route => route.request().url() === WATCH_URL
    ? route.fulfill({ contentType: "text/html", body: FIXTURE }) : route.abort());
  if (suite) await context.addInitScript({ content: SUITE });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => {
    try { assert.deepEqual(errors, []); }
    finally { await context.close(); }
  });
  await page.goto(WATCH_URL);
  if (suite) await waitForSuiteHealth(page, MANIFEST.registeredModules, { timeoutMs: 10000, requireReady: true });
  await page.evaluate(() => {
    const playerHost = document.getElementById("player");
    const anchor = document.createElement("div");
    anchor.id = "single-column-container";
    playerHost.before(anchor);
    anchor.append(playerHost);
    const player = document.getElementById("movie_player");
    const chrome = document.createElement("div");
    chrome.className = "ytp-chrome-bottom";
    chrome.style.cssText = "position:absolute;bottom:0;height:48px";
    const progress = document.createElement("div");
    progress.className = "ytp-progress-bar-container";
    progress.style.cssText = "position:absolute;top:0;width:100%;height:4px;background:red";
    progress.addEventListener("click", () => { window.fixture.seekClicks = (window.fixture.seekClicks || 0) + 1; });
    chrome.append(progress, player.querySelector(".ytp-right-controls"));
    player.append(chrome);
    const panel = document.querySelector("ytd-playlist-panel-renderer");
    for (const id of ["aaaaaaaaaaa", "bbbbbbbbbbb"]) {
      const item = document.createElement("ytd-playlist-panel-video-renderer");
      const link = document.createElement("a");
      link.href = `/watch?v=${id}`;
      const title = document.createElement("span");
      title.id = "video-title";
      title.textContent = id === "aaaaaaaaaaa" ? "Video A with a deliberately long queue title" : "Video B";
      link.append(title); item.append(link); panel.append(item);
    }
  });
  if (!suite) await page.addScriptTag({ content: MINIPLAYER });
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.locator("#ytsmp-compact-queue-info").waitFor({ state: "visible" });
  return page;
}

async function assertTopStrip(page) {
  const geometry = await page.evaluate(() => {
    const player = document.getElementById("movie_player");
    const strip = document.getElementById("ytsmp-compact-queue-info");
    const corner = document.getElementById("ytsmp-corner-button");
    const bounds = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      player: bounds(player), strip: bounds(strip), corner: bounds(corner),
      progress: bounds(player.querySelector(".ytp-progress-bar-container")),
      chrome: bounds(player.querySelector(".ytp-chrome-bottom")),
      pointerEvents: getComputedStyle(strip).pointerEvents,
      overflow: getComputedStyle(strip).overflow,
      role: strip.getAttribute("role"), live: strip.getAttribute("aria-live"),
      titleOverflow: getComputedStyle(strip.querySelector(".ytsmp-queue-title")).textOverflow,
    };
  });
  assert.equal(geometry.strip.y - geometry.player.y, 8, "Queue status belongs at the top of the floating player");
  assert.equal(geometry.strip.x - geometry.player.x, 12);
  assert.ok(geometry.corner.x - (geometry.strip.x + geometry.strip.width) >= 12, "Status leaves room for permanent corner and close controls");
  assert.ok(geometry.strip.y + geometry.strip.height < geometry.progress.y, "Status must not cover the native progress bar");
  assert.equal(geometry.chrome.y + geometry.chrome.height, geometry.player.y + geometry.player.height, "Native playback chrome stays at the bottom");
  assert.equal(geometry.pointerEvents, "none");
  assert.equal(geometry.overflow, "hidden", "Narrow-player labels cannot spill into the corner controls");
  assert.equal(geometry.role, "status");
  assert.equal(geometry.live, "polite");
  assert.equal(geometry.titleOverflow, "ellipsis");
  return geometry;
}

async function settlePlayerFrames(page) {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 16; frame += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  });
}

for (const suite of [false, true]) for (const restoration of [false, true]) {
  test(`${restoration ? "actual BFCache restoration releases" : "late initial pageshow preserves"} the pending scroll-miniplayer navigation lock (${suite ? "complete Suite" : "source"})`, async t => {
    const page = await openFloatingFixture(t, { width: 1280, height: 900 }, { suite });
    await page.evaluate(restoration => {
      window.dispatchEvent(new Event("yt-navigate-start"));
      if (restoration) window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: restoration }));
    }, restoration);
    await settlePlayerFrames(page);
    assert.equal(await page.evaluate(() => document.body.classList.contains("ytsmp-scroll-miniplayer-active")), restoration);
    if (!restoration) {
      assert.equal(await page.locator("ytd-watch-flexy #movie_player").count(), 1);
      await page.evaluate(() => window.dispatchEvent(new Event("yt-navigate-finish")));
      await page.waitForFunction(() => document.body.classList.contains("ytsmp-scroll-miniplayer-active"));
    }
    assert.equal(await page.locator("body > #movie_player").count(), 1);
  });
}

for (const suite of [false, true]) test(`a scale-hidden retained watch cannot donate or lose its player during a current-watch handoff (${suite ? 'complete Suite' : 'source'})`, async t => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await context.route("**/*", route => route.request().url() === WATCH_URL
    ? route.fulfill({ contentType: "text/html", body: FIXTURE }) : route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto(WATCH_URL);
  await page.evaluate(() => {
    const old = document.querySelector("ytd-watch-flexy");
    const host = old.querySelector("#player"), anchor = document.createElement("div");
    anchor.id = "single-column-container"; host.before(anchor); anchor.append(host);
    old.style.cssText = "position:absolute;top:0;left:0;width:1280px;transform:scale(0);transform-origin:0 0";
    const current = document.createElement("ytd-watch-flexy");
    current.style.cssText = "position:absolute;top:100px;left:0;width:1280px";
    current.innerHTML = '<div id="single-column-container"><div id="player" style="width:640px;height:360px"><div id="movie_player" class="html5-video-player"><video class="html5-main-video"></video><div class="ytp-right-controls"><button class="ytp-settings-button ytp-button">Settings</button></div></div></div></div>';
    const player = current.querySelector("#movie_player");
    player.getVideoData = () => ({ video_id: fixture.playerId });
    old.after(current);
    window.handoffFixture = { oldPlayer: host.querySelector("#movie_player"), oldHost: host,
      current, player, currentHost: current.querySelector("#player"), oldAdoptions: 0 };
    new MutationObserver(records => {
      handoffFixture.oldAdoptions += records.filter(record => [...record.addedNodes].includes(handoffFixture.oldPlayer)).length;
    }).observe(document.body, { childList: true });
  });
  await page.addScriptTag({ content: suite ? SUITE : MINIPLAYER });
  if (suite) await waitForSuiteHealth(page, MANIFEST.registeredModules, { timeoutMs: 10000, requireReady: true });
  await settlePlayerFrames(page);
  assert.deepEqual(await page.evaluate(() => ({
    oldAdoptions: handoffFixture.oldAdoptions,
    oldOwner: handoffFixture.oldPlayer.parentElement === handoffFixture.oldHost,
    oldConnected: handoffFixture.oldPlayer.isConnected,
    currentOwner: handoffFixture.player.parentElement === handoffFixture.currentHost,
  })), { oldAdoptions: 0, oldOwner: true, oldConnected: true, currentOwner: true });
  await page.evaluate(() => {
    handoffFixture.current.style.top = "-600px";
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => handoffFixture.player.parentElement === document.body);
  assert.equal(await page.evaluate(() => handoffFixture.oldPlayer.parentElement === handoffFixture.oldHost), true);
  await page.evaluate(() => {
    handoffFixture.current.style.top = "100px";
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => handoffFixture.player.parentElement === handoffFixture.currentHost);
  assert.equal(await page.evaluate(() => handoffFixture.oldAdoptions), 0);
});

for (const suite of [false, true]) {
  for (const hiddenStyle of ["opacity:0", "display:none", "width:0;height:0"]) {
    test(`hidden native miniplayer ownership prevents floating takeover (${hiddenStyle}, ${suite ? "complete Suite" : "source"})`, async t => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      await context.route("**/*", route => route.request().url() === WATCH_URL
        ? route.fulfill({ contentType: "text/html", body: FIXTURE }) : route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      t.after(async () => {
        try { assert.deepEqual(errors, []); }
        finally { await context.close(); }
      });
      await page.goto(WATCH_URL);
      await page.evaluate(hiddenStyle => {
        const host = document.getElementById("player");
        const anchor = document.createElement("div");
        anchor.id = "single-column-container";
        host.before(anchor); anchor.append(host);
        const native = document.createElement("ytd-miniplayer");
        native.style.cssText = `display:block;position:fixed;right:16px;bottom:16px;width:400px;height:301px;${hiddenStyle}`;
        const wrapper = document.createElement("ytd-miniplayer-player-container");
        wrapper.style.cssText = "display:block;width:400px;height:225px";
        const player = document.getElementById("movie_player");
        const video = player.querySelector("video");
        player.style.cssText = "width:400px;height:225px";
        video.style.cssText = "width:400px;height:225px";
        video.currentTime = 42;
        wrapper.append(player); native.append(wrapper);
        document.querySelector("ytd-app").append(native);
        fixture.nativeMiniplayer = native; fixture.nativeWrapper = wrapper;
        fixture.adoptedPlayer = player; fixture.adoptedVideo = video;
        fixture.bodyAdoptions = 0;
        // Count mutation records, not just the final owner: the broken path
        // repeatedly steals and returns the player between animation frames.
        new MutationObserver(records => {
          fixture.bodyAdoptions += records.filter(record => [...record.addedNodes].includes(player)).length;
        }).observe(document.body, { childList: true });
        window.scrollTo(0, 800);
      }, hiddenStyle);
      await page.addScriptTag({ content: suite ? SUITE : MINIPLAYER });
      if (suite) await waitForSuiteHealth(page, MANIFEST.registeredModules, { timeoutMs: 10000, requireReady: true });
      await settlePlayerFrames(page);
      assert.deepEqual(await page.evaluate(() => ({
        bodyAdoptions: fixture.bodyAdoptions,
        nativeOwner: fixture.adoptedPlayer.parentElement === fixture.nativeWrapper,
        active: document.body.classList.contains("ytsmp-scroll-miniplayer-active"),
        time: fixture.adoptedVideo.currentTime,
      })), { bodyAdoptions: 0, nativeOwner: true, active: false, time: 42 });
      await page.evaluate(() => {
        fixture.nativeMiniplayer.style.cssText = "display:block;position:fixed;right:16px;bottom:16px;width:400px;height:301px";
        window.dispatchEvent(new Event("resize"));
      });
      await settlePlayerFrames(page);
      assert.deepEqual(await page.evaluate(() => ({
        bodyAdoptions: fixture.bodyAdoptions,
        nativeOwner: fixture.adoptedPlayer.parentElement === fixture.nativeWrapper,
        samePlayer: fixture.adoptedPlayer === document.getElementById("movie_player"),
        sameVideo: fixture.adoptedPlayer.querySelector("video") === fixture.adoptedVideo,
        width: fixture.adoptedPlayer.getBoundingClientRect().width,
        videoWidth: fixture.adoptedVideo.getBoundingClientRect().width,
        time: fixture.adoptedVideo.currentTime,
      })), { bodyAdoptions: 0, nativeOwner: true, samePlayer: true, sameVideo: true, width: 400, videoWidth: 400, time: 42 });
    });
  }
}

for (const suite of [false, true]) test(`native miniplayer adoption releases floating geometry before native resize reads it (${suite ? "complete Suite" : "source"})`, async t => {
  const page = await openFloatingFixture(t, { width: 1280, height: 900 }, { suite });
  const immediate = await page.evaluate(() => {
    const player = document.getElementById("movie_player");
    const video = player.querySelector("video");
    video.currentTime = 42;
    const native = document.createElement("ytd-miniplayer");
    native.style.cssText = "display:block;position:fixed;left:24px;top:80px;width:388px;height:266.25px;background:black";
    document.querySelector("ytd-app").append(native);
    native.append(player);
    player.style.cssText = "position:relative;width:388px;height:218.25px;overflow:hidden";
    video.style.cssText = "position:absolute;left:0;top:0;margin:0;width:388px;height:218.25px";
    fixture.adoptedPlayer = player; fixture.adoptedVideo = video; fixture.nativeMiniplayer = native;
    const bounds = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    // Model a native resize callback reading the player synchronously during
    // adoption, before Suite mutation observers or animation frames can run.
    fixture.nativeResizeMeasurement = bounds(player);
    return {
      stillActive: document.body.classList.contains("ytsmp-scroll-miniplayer-active"),
      player: fixture.nativeResizeMeasurement, video: bounds(video), time: video.currentTime,
    };
  });
  assert.equal(immediate.stillActive, true, "The assertion must precede asynchronous floating-state cleanup");
  const expected = { x: 24, y: 80, width: 388, height: 218.25 };
  assert.deepEqual(immediate.player, expected, "Native resize must see the adopted player's dimensions immediately");
  assert.deepEqual(immediate.video, expected, "Native video dimensions must no longer inherit floating CSS");
  assert.equal(immediate.time, 42);
  await page.waitForFunction(() => !document.body.classList.contains("ytsmp-scroll-miniplayer-active") &&
    !document.getElementById("ytsmp-close-button") && !document.getElementById("ytsmp-compact-queue-info"));
  assert.deepEqual(await page.evaluate(() => ({
    playerPreserved: document.getElementById("movie_player") === fixture.adoptedPlayer,
    videoPreserved: fixture.adoptedPlayer.querySelector("video") === fixture.adoptedVideo,
    nativeOwner: fixture.adoptedPlayer.parentElement === fixture.nativeMiniplayer,
    time: fixture.adoptedVideo.currentTime,
  })), { playerPreserved: true, videoPreserved: true, nativeOwner: true, time: 42 });
  await page.evaluate(() => {
    fixture.nativeMiniplayer.style.opacity = "0";
    fixture.bodyReadoptions = 0;
    new MutationObserver(records => {
      fixture.bodyReadoptions += records.filter(record => [...record.addedNodes].includes(fixture.adoptedPlayer)).length;
    }).observe(document.body, { childList: true });
    window.dispatchEvent(new Event("yt-page-data-updated"));
    window.dispatchEvent(new Event("scroll"));
  });
  await settlePlayerFrames(page);
  assert.deepEqual(await page.evaluate(() => ({
    bodyReadoptions: fixture.bodyReadoptions,
    nativeOwner: fixture.adoptedPlayer.parentElement === fixture.nativeMiniplayer,
    active: document.body.classList.contains("ytsmp-scroll-miniplayer-active"),
    time: fixture.adoptedVideo.currentTime,
  })), { bodyReadoptions: 0, nativeOwner: true, active: false, time: 42 },
  "A temporarily hidden native host must keep the player after the floating handoff");
});

test("floating queue status remains above playback controls in all four corners", async t => {
  const page = await openFloatingFixture(t, { width: 1280, height: 900 });
  assert.equal(await page.locator(".ytsmp-queue-position").textContent(), "Queue 1 / 2");
  for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
    await page.locator("#ytsmp-corner-button").click();
    const option = page.locator(`.ytsmp-corner-option[data-corner="${corner}"]`);
    if (await option.count()) await option.click();
    else await page.locator("#ytsmp-corner-button").press("Escape");
    await assertTopStrip(page);
  }
  const { progress } = await assertTopStrip(page);
  await page.mouse.click(progress.x + progress.width / 2, progress.y + progress.height / 2);
  assert.equal(await page.evaluate(() => window.fixture.seekClicks), 1, "Native seek-bar input remains reachable");
  await page.locator("#ytsmp-close-button").click();
  await page.locator("#ytsmp-compact-queue-info").waitFor({ state: "detached" });
  assert.equal(await page.locator("#player #movie_player").count(), 1, "Closing still restores the original player host");
});

test("narrow floating miniplayer keeps its top status within the player and clear of playback controls", async t => {
  const page = await openFloatingFixture(t, { width: 375, height: 720 });
  const { player, strip } = await assertTopStrip(page);
  assert.ok(strip.width > 0 && strip.x >= player.x && strip.x + strip.width <= player.x + player.width,
    JSON.stringify({ player, strip }));
  assert.equal(await page.locator(".ytsmp-queue-title").textContent(), "Video A with a deliberately long queue title");
});
