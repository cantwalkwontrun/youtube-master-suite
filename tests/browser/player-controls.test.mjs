// Language: en-GB. Optional player contracts exercised without a live account or media.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { installPlayerControls } from '../../sources/player-controls.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';
let browser;
before(async () => { browser = await launchFixtureBrowser(); });
after(async () => { await browser?.close(); });
const HTML = `<!doctype html><html lang="en-GB"><head><style>
#movie_player{position:relative;display:block;width:640px;height:360px;background:#222}
.ytp-right-controls{position:absolute;bottom:0;right:0;display:flex}button.ytp-button{width:36px;height:36px;padding:0}
ytd-watch-flexy,ytd-watch-metadata,ytd-transcript-renderer,ytd-transcript-segment-renderer,yt-button-view-model{display:block}
</style></head><body><ytd-watch-flexy><div id="movie_player" class="html5-video-player" tabindex="0"><video></video>
<div class="ytp-right-controls"><button class="ytp-settings-button ytp-button">Settings</button></div>
<div class="ytp-autonav-toggle-button" aria-checked="true"></div><div class="ytp-next-button">Next</div>
<div class="ytp-watermark">Watermark</div><div class="ytp-gradient-bottom">Gradient</div>
<div class="ytp-share-panel">Embedded share</div><div class="ytp-pause-overlay">Paused</div>
<div class="sponsorBlockPreviewBar">SponsorBlock</div><input id="player-input"></div>
<div id="cinematics">Lighting</div><ytd-watch-metadata><div id="actions"><yt-button-view-model id="clip"><button aria-label="Clip">Clip</button></yt-button-view-model>
<yt-button-view-model id="vote"><button aria-label="like this video">Like</button><span id="return-youtube-dislike">12</span></yt-button-view-model></div></ytd-watch-metadata>
<ytd-transcript-renderer><ytd-transcript-segment-renderer><span class="segment-timestamp">0:00</span><span class="segment-text">First line</span></ytd-transcript-segment-renderer>
<ytd-transcript-segment-renderer><span class="segment-timestamp">0:03</span><span class="segment-text">Second line</span></ytd-transcript-segment-renderer></ytd-transcript-renderer>
<img class="cbCustomThumbnail" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"></ytd-watch-flexy><input id="outside-input"></body></html>`;
async function open(t, preferences = {}, setup = '', path = '/watch?v=aaaaaaaaaaa') {
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url() === 'https://www.youtube.com' + path
    ? route.fulfill({ contentType: 'text/html', body: HTML }) : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  await page.goto('https://www.youtube.com' + path);
  await page.evaluate(() => {
    const player = document.getElementById('movie_player'), video = player.querySelector('video');
    window.audit = { id: 'aaaaaaaaaaa', calls: [], reports: [], downloads: [], revoked: [], apiReads: 0, numberEvents: 0 };
    const original = { getLanguageInfo: () => ({ getIsDefault: () => true, getIsAutoDubbed: () => false }) };
    const dubbed = { getLanguageInfo: () => ({ getIsDefault: () => false, getIsAutoDubbed: () => true }) };
    player.tracks = [original, dubbed]; player.track = dubbed; player.drc = 1;
    player.getVideoData = () => { audit.apiReads++; return { video_id: audit.id }; };
    player.getAvailableAudioTracks = () => player.tracks; player.getAudioTrack = () => player.track;
    player.setAudioTrack = track => { audit.calls.push(['audio', track === original]); player.track = track; };
    player.setAutonav = (...args) => { audit.calls.push(['autoplay', ...args]); player.querySelector('.ytp-autonav-toggle-button').setAttribute('aria-checked', String(args[0])); };
    player.getDrcUserPreference = () => player.drc;
    player.setDrcUserPreference = value => { audit.calls.push(['drc', value]); player.drc = value; };
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 42 });
    video.play = () => { throw Error('Unexpected playback start'); }; video.pause = () => { throw Error('Unexpected pause'); };
    Object.defineProperties(video, { videoWidth: { configurable: true, value: 1280 }, videoHeight: { configurable: true, value: 720 }, readyState: { configurable: true, value: 4 } });
    HTMLCanvasElement.prototype.getContext = () => ({ drawImage: () => audit.calls.push(['draw']) });
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { audit.calls.push(['blob', type, quality]); callback(new Blob(['frame'], { type })); };
    URL.createObjectURL = blob => { audit.lastBlob = blob; return 'blob:https://www.youtube.com/fixture-' + (audit.downloads.length + 1); };
    URL.revokeObjectURL = url => audit.revoked.push(url);
    HTMLAnchorElement.prototype.click = function() { audit.downloads.push({ name: this.download, url: this.href }); };
    window.addEventListener('keydown', event => { if (/^[0-9]$/.test(event.key)) audit.numberEvents++; });
  });
  if (setup) await page.evaluate(`(${setup})()`);
  await page.evaluate(({ factory, preferences }) => {
    window.stopPlayerControls = eval('(' + factory + ')')({ document, window, preferences,
      MutationObserver: window.testMutationObserver || MutationObserver,
      reportError: (action, error) => audit.reports.push({ action, name: error.name }) });
  }, { factory: installPlayerControls.toString(), preferences });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page;
}

test('disabled player additions install no style, buttons or native API work', async t => {
  const page = await open(t);
  assert.deepEqual(await page.evaluate(() => ({ styles: document.querySelectorAll('#ytms-player-controls-style').length,
    buttons: document.querySelectorAll('[id^="ytms-snapshot"], [id^="ytms-transcript"]').length, calls: audit.calls, reads: audit.apiReads })),
  { styles: 0, buttons: 0, calls: [], reads: 0 });
});

test('native audio, autoplay and stable-volume choices apply once per video and honour later user changes', async t => {
  const page = await open(t, { originalAudio: true, disableAutoplay: true, disableStableVolume: true });
  assert.deepEqual(await page.evaluate(() => audit.calls), [['audio', true], ['autoplay', false, true], ['drc', 0]]);
  await page.evaluate(() => {
    const player = document.getElementById('movie_player'); player.track = player.tracks[1]; player.drc = 1;
    player.querySelector('.ytp-autonav-toggle-button').setAttribute('aria-checked', 'true');
    window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => audit.calls.length), 3, 'a user choice must not be fought by later mutations');
  await page.evaluate(() => { audit.id = 'bbbbbbbbbbb'; document.querySelector('video').dispatchEvent(new Event('loadedmetadata', { bubbles: true })); });
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => ({ count: audit.calls.length, time: document.querySelector('video').currentTime, reports: audit.reports })), { count: 6, time: 42, reports: [] });
});

test('unknown or ambiguous original tracks and unknown volume states leave native choices untouched', async t => {
  const page = await open(t, { originalAudio: true, disableStableVolume: true }, `() => {
    const player=document.getElementById('movie_player'); player.tracks=[player.tracks[0],player.tracks[0]]; player.drc=7;
  }`);
  assert.deepEqual(await page.evaluate(() => audit.calls), []);
});

test('failed native setters are bounded and report once without playback changes', async t => {
  const page = await open(t, { originalAudio: true }, `() => { document.getElementById('movie_player').setAudioTrack=()=>{throw new TypeError('fixture');}; }`);
  await page.evaluate(() => { for(let i=0;i<10;i++)window.dispatchEvent(new Event('yt-page-data-updated')); });
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => audit.reports), [{ action: 'original audio', name: 'TypeError' }]);
});

test('local frame and transcript exports require a trusted user gesture and release owned download URLs', async t => {
  const page = await open(t, { snapshotButton: true, snapshotFormat: 'jpeg', snapshotQuality: '80', transcriptDownload: true });
  await page.evaluate(() => { document.getElementById('ytms-snapshot-button').click(); document.getElementById('ytms-transcript-button').click(); });
  assert.equal(await page.evaluate(() => audit.downloads.length), 0);
  await page.locator('#ytms-snapshot-button').click();
  assert.deepEqual(await page.evaluate(() => audit.calls), [['draw'], ['blob', 'image/jpeg', 0.8]]);
  await page.locator('#ytms-transcript-button').click();
  assert.deepEqual(await page.evaluate(() => audit.downloads.map(x => x.name)), ['youtube-frame.jpg', 'youtube-transcript.txt']);
  assert.equal(await page.evaluate(() => audit.lastBlob.text()), '0:00 First line\n0:03 Second line\n');
  await page.evaluate(() => stopPlayerControls());
  assert.deepEqual(await page.evaluate(() => ({ revoked: audit.revoked.length, controls: document.querySelectorAll('#ytms-snapshot-button, #ytms-transcript-button, #ytms-player-action-status, #ytms-player-controls-style').length, time: document.querySelector('video').currentTime })), { revoked: 2, controls: 0, time: 42 });
});

test('blocked canvas export produces an accessible status without a download', async t => {
  const page = await open(t, { snapshotButton: true }, `() => { HTMLCanvasElement.prototype.getContext=()=>({drawImage(){throw new DOMException('Blocked','SecurityError');}}); }`);
  await page.locator('#ytms-snapshot-button').click();
  assert.equal(await page.locator('#ytms-player-action-status').textContent(), 'This video does not allow local frame export.');
  assert.equal(await page.evaluate(() => audit.downloads.length), 0);
});

test('number seeking suppression preserves editing and unrelated page keyboard events', async t => {
  const page = await open(t, { disableNumberKeySeeking: true });
  await page.locator('#movie_player').focus(); await page.keyboard.press('5');
  assert.equal(await page.evaluate(() => audit.numberEvents), 0);
  await page.locator('#player-input').focus(); await page.keyboard.press('5');
  await page.locator('#outside-input').focus(); await page.keyboard.press('6');
  assert.equal(await page.evaluate(() => audit.numberEvents), 2);
  assert.equal(await page.locator('#player-input').inputValue(), '5');
  assert.equal(await page.locator('#outside-input').inputValue(), '6');
});

test('scoped presentation options preserve recommended-extension nodes and ordinary watch overlays', async t => {
  const page = await open(t, { disableAmbientMode: true, hideNextButton: true, hidePlayerWatermark: true,
    hideClipButton: true, playerBackground: 'transparent', embedHideShare: true, embedHidePauseOverlay: true });
  assert.equal(await page.locator('#cinematics').isVisible(), false);
  assert.equal(await page.locator('#clip').isVisible(), false);
  assert.equal(await page.locator('#vote').isVisible(), true);
  assert.equal(await page.locator('.sponsorBlockPreviewBar').isVisible(), true);
  assert.equal(await page.locator('.ytp-share-panel').isVisible(), true);
  assert.equal(await page.locator('.ytp-pause-overlay').isVisible(), true);
  assert.equal(await page.locator('#return-youtube-dislike').textContent(), '12');
  assert.equal(await page.locator('.cbCustomThumbnail').count(), 1);
});

test('embedded-only options stay scoped to embedded native overlays', async t => {
  const page = await open(t, { embedHideShare: true, embedHidePauseOverlay: true }, '', '/embed/aaaaaaaaaaa');
  assert.equal(await page.locator('.ytp-share-panel').isVisible(), false);
  assert.equal(await page.locator('.ytp-pause-overlay').isVisible(), false);
});

test('unrelated comments and caption churn do not repeat native preference reads', async t => {
  const page = await open(t, { disableStableVolume: true });
  const before = await page.evaluate(() => audit.apiReads);
  await page.evaluate(() => {
    const captions=document.createElement('div'); captions.className='ytp-caption-window-container'; document.getElementById('movie_player').append(captions);
    const comments=document.createElement('ytd-comments'); document.body.append(comments);
    for(let i=0;i<100;i++){captions.append(document.createElement('span'));comments.append(document.createElement('div'));}
  });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => audit.apiReads), before);
});

test('navigation suspension disconnects observation and cannot be revived by resize or page data', async t => {
  const page = await open(t, { snapshotButton: true, disableStableVolume: true }, `() => {
    const NativeObserver=MutationObserver; audit.observations=0; audit.disconnects=0;
    window.testMutationObserver=class extends NativeObserver {
      observe(...args){audit.observations++;return super.observe(...args);}
      disconnect(){audit.disconnects++;return super.disconnect();}
    };
  }`);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('yt-navigate-start')); audit.id='bbbbbbbbbbb'; document.getElementById('movie_player').drc=1;
    window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => ({ observations:audit.observations,disconnects:audit.disconnects,
    buttons:document.querySelectorAll('#ytms-snapshot-button').length,calls:audit.calls })),
  { observations:1,disconnects:1,buttons:0,calls:[['drc',0]] });
  await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-finish')));
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => ({ observations:audit.observations,buttons:document.querySelectorAll('#ytms-snapshot-button').length,calls:audit.calls })),
  { observations:2,buttons:1,calls:[['drc',0],['drc',0]] });
});

for (const mode of ['transparent', 'blurred']) test(`control background ${mode} overrides only the toolbar backing`, async t => {
  const page = await open(t, { playerControlsBackground: mode }, `() => {
    const controls=document.createElement('div'); controls.className='ytp-chrome-controls'; controls.style.cssText='width:640px;height:48px;background-color:rgba(0,0,0,.45)';
    document.getElementById('movie_player').append(controls);
  }`);
  const result = await page.locator('.ytp-chrome-controls').evaluate(el => ({ background:getComputedStyle(el).backgroundColor,
    blur:getComputedStyle(el).backdropFilter, width:el.getBoundingClientRect().width, height:el.getBoundingClientRect().height }));
  assert.deepEqual(result, { background: mode === 'transparent' ? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0.18)',
    blur: mode === 'transparent' ? 'none' : 'blur(12px)', width:640,height:48 });
  assert.equal(await page.locator('.sponsorBlockPreviewBar').isVisible(), true);
});

test('pending snapshots reject repeat activation and discard a late frame from the preceding video', async t => {
  const page = await open(t, { snapshotButton: true }, `() => {
    audit.blobCallbacks=[]; HTMLCanvasElement.prototype.toBlob=function(callback){audit.blobCallbacks.push(callback);};
  }`);
  await page.locator('#ytms-snapshot-button').click();
  for(let i=0;i<4;i++) await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => audit.blobCallbacks.length), 1);
  assert.equal(await page.locator('#ytms-snapshot-button').isDisabled(), true);
  await page.evaluate(() => { audit.id='bbbbbbbbbbb'; audit.blobCallbacks.shift()(new Blob(['old frame'])); });
  assert.equal(await page.evaluate(() => audit.downloads.length), 0);
  assert.equal(await page.locator('#ytms-snapshot-button').isEnabled(), true);
  await page.locator('#ytms-snapshot-button').click();
  await page.evaluate(() => { window.dispatchEvent(new Event('yt-navigate-start')); audit.blobCallbacks.shift()(new Blob(['old route'])); });
  assert.equal(await page.evaluate(() => audit.downloads.length), 0);
});

test('rapid transcript activations keep no more than four outstanding download URLs', async t => {
  const page = await open(t, { transcriptDownload: true });
  await page.locator('#ytms-transcript-button').focus();
  for(let i=0;i<6;i++) await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => audit.downloads.length), 4);
  assert.equal(await page.locator('#ytms-player-action-status').textContent(), 'Please wait for the previous exports to finish.');
  await page.evaluate(() => stopPlayerControls());
  assert.equal(await page.evaluate(() => audit.revoked.length), 4);
});

test('late native export controls replace only the corresponding Suite action', async t => {
  const page = await open(t, { snapshotButton: true, transcriptDownload: true });
  await page.evaluate(() => {
    const native=document.createElement('button'); native.className='ytp-snapshot-button'; native.textContent='Native snapshot';
    document.querySelector('.ytp-right-controls').append(native);
  });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#ytms-snapshot-button').count(), 0);
  assert.equal(await page.locator('.ytp-snapshot-button').count(), 1);
  assert.equal(await page.locator('#ytms-transcript-button').count(), 1);
  await page.evaluate(() => document.querySelector('.ytp-snapshot-button').remove());
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#ytms-snapshot-button').count(), 1);
});

test('unsupported native audio metadata consumes at most eight attempts per video', async t => {
  const page = await open(t, { originalAudio: true }, `() => {
    audit.audioReads=0; document.getElementById('movie_player').getAvailableAudioTracks=()=>{audit.audioReads++;return [];};
  }`);
  await page.evaluate(async () => {
    for(let i=0;i<20;i++) { window.dispatchEvent(new Event('resize')); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); }
  });
  assert.equal(await page.evaluate(() => audit.audioReads), 8);
});

test('new action tooltips follow native surfaces and dismiss with controls and navigation', async t => {
  const page = await open(t, { snapshotButton: true, transcriptDownload: true }, `() => {
    document.getElementById('movie_player').classList.add('ytp-delhi-modern','ytp-big-mode');
  }`);
  for(const id of ['ytms-snapshot-button','ytms-transcript-button']) {
    const button=page.locator('#'+id), tooltip=page.locator('#ytms-export-tooltip');
    await button.hover(); await tooltip.waitFor();
    assert.equal(await button.getAttribute('title'), null);
    assert.equal(await button.getAttribute('aria-describedby'), 'ytms-export-tooltip');
    assert.deepEqual(await tooltip.evaluate(el=>{const s=getComputedStyle(el);return{radius:s.borderRadius,background:s.backgroundColor,blur:s.backdropFilter,line:s.lineHeight};}),
      {radius:'8px',background:'rgba(0, 0, 0, 0.3)',blur:'blur(16px)',line:'22px'});
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true})));
    assert.equal(await tooltip.count(), 0);
    await button.focus(); await tooltip.waitFor();
    await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
    assert.equal(await tooltip.count(), 0);
    assert.equal(await button.getAttribute('aria-describedby'), null);
    await page.mouse.move(0,0); await button.hover(); await tooltip.waitFor();
    await page.evaluate(() => document.getElementById('movie_player').classList.add('ytp-autohide'));
    await tooltip.waitFor({state:'detached'});
    await page.evaluate(() => document.getElementById('movie_player').classList.remove('ytp-autohide'));
  }
  await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-start')));
  assert.equal(await page.locator('#ytms-export-tooltip').count(), 0);
});

test('classic progress colour changes native paint without changing SponsorBlock or an image marker', async t => {
  const page = await open(t, { classicProgressColour: true }, `() => {
    const player=document.getElementById('movie_player');
    player.insertAdjacentHTML('beforeend','<div class="ytp-play-progress" style="background:linear-gradient(90deg,red,pink);height:4px;width:200px"></div><div class="ytp-scrubber-container"><div class="ytp-scrubber-button" style="background:pink;width:12px;height:12px"></div></div><div class="ytp-scrubber-container" data-ytms-playhead-marker="1"><div class="ytp-scrubber-button" style="opacity:0;background:pink;width:12px;height:12px"></div><img class="ytms-playhead-marker" src="data:image/svg+xml,%3Csvg xmlns=\\"http://www.w3.org/2000/svg\\"/%3E"></div>');
    document.querySelector('.sponsorBlockPreviewBar').style.background='rgb(0, 255, 0)';
  }`);
  assert.equal(await page.locator('.ytp-play-progress').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgb(255, 0, 0)');
  assert.equal(await page.locator('.ytp-play-progress').evaluate(el=>getComputedStyle(el).backgroundImage), 'none');
  assert.equal(await page.locator('.ytp-scrubber-container:not([data-ytms-playhead-marker]) > .ytp-scrubber-button').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgb(255, 0, 0)');
  assert.equal(await page.locator('[data-ytms-playhead-marker] > .ytp-scrubber-button').evaluate(el=>getComputedStyle(el).opacity), '0');
  assert.equal(await page.locator('.ytms-playhead-marker').count(), 1);
  assert.equal(await page.locator('.sponsorBlockPreviewBar').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgb(0, 255, 0)');
});

test('an already selected original track with an equivalent native identity is not restarted', async t => {
  const page=await open(t,{originalAudio:true},`()=>{
    const player=document.getElementById('movie_player');
    const info=()=>({getIsDefault:()=>true,getIsAutoDubbed:()=>false,getId:()=>'source.0'});
    player.tracks[0]={getLanguageInfo:info};player.track={getLanguageInfo:info};
  }`);
  assert.deepEqual(await page.evaluate(()=>audit.calls),[]);
});

test('export actions use the native settings anchor parent in nested modern toolbars', async t => {
  const page=await open(t,{snapshotButton:true,transcriptDownload:true},`()=>{
    const controls=document.querySelector('.ytp-right-controls'),settings=controls.querySelector('.ytp-settings-button');
    const nested=document.createElement('div');nested.className='ytp-right-controls-left';controls.append(nested);nested.append(settings);
    audit.nativeSettings=settings;
  }`);
  assert.deepEqual(await page.locator('.ytp-right-controls-left').evaluate(el=>[...el.children].map(button=>button.id||'native-settings')),
    ['ytms-snapshot-button','ytms-transcript-button','native-settings']);
  assert.equal(await page.evaluate(()=>document.querySelector('.ytp-settings-button')===audit.nativeSettings),true);
});

test('pagehide remains suspended despite late native signals until pageshow', async t => {
  const page=await open(t,{snapshotButton:true});
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('yt-page-data-updated'));
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#ytms-snapshot-button').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#ytms-snapshot-button').count(),1);
});

test('initial pageshow cannot finish an unrelated pending SPA navigation', async t => {
  const page=await open(t,{snapshotButton:true});
  await page.evaluate(()=>{window.dispatchEvent(new Event('yt-navigate-start'));window.dispatchEvent(new Event('pageshow'));});
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#ytms-snapshot-button').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('yt-navigate-finish')));
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#ytms-snapshot-button').count(),1);
});

test('a retained player inside an opacity-hidden native host cannot displace the visible watch player', async t => {
  const page=await open(t,{snapshotButton:true},`()=>{
    const hidden=document.createElement('ytd-miniplayer');hidden.style.cssText='display:block;opacity:0';
    hidden.append(document.getElementById('movie_player').cloneNode(true));document.body.append(hidden);
  }`);
  assert.equal(await page.locator('ytd-watch-flexy #ytms-snapshot-button').count(),1);
  assert.equal(await page.locator('ytd-miniplayer #ytms-snapshot-button').count(),0);
  assert.equal(await page.evaluate(()=>document.querySelector('ytd-watch-flexy video').currentTime),42);
});

// Relevant backing declarations verified against YouTube's public player CSS:
// https://www.youtube.com/s/player/f5321ed3/www-player.css
for (const mode of ['transparent', 'blurred']) test(`modern native control backplates honour ${mode} without changing hover or overlays`, async t => {
  const page = await open(t, { playerControlsBackground: mode }, `() => {
    const player=document.getElementById('movie_player'); player.classList.add('ytp-delhi-modern');
    const classes=['ytp-right-controls','ytp-play-button','ytp-prev-button','ytp-next-button','ytp-mute-button ytp-standalone-mute-button','ytp-volume-area','ytp-time-wrapper','ytp-chapter-title'];
    const nativeStyle=document.createElement('style'); nativeStyle.id='native-presentation-reference';
    nativeStyle.textContent=classes.map(name=>'.ytp-delhi-modern .ytp-chrome-controls .'+name.split(' ').join('.')+'{background:var(--yt-sys-color-baseline--overlay-background-medium-light,rgba(0,0,0,.3));backdrop-filter:var(--yt-frosted-glass-backdrop-filter-override,blur(16px));border-radius:28px}').join('')+
      '.ytp-delhi-modern .ytp-gradient-bottom{display:none}.ytp-delhi-modern .ytp-right-controls .ytp-button::before{content:"";position:absolute;inset:0;background-color:transparent;border-radius:40px}.ytp-delhi-modern .ytp-right-controls .ytp-button:hover::before{background-color:rgba(255,255,255,.1)}';
    document.head.append(nativeStyle);
    const toolbar=document.createElement('div'); toolbar.className='ytp-chrome-controls';toolbar.id='modern-test-toolbar';toolbar.style.cssText='position:absolute;left:0;bottom:0;width:640px;height:72px;background-color:rgba(0,0,0,.45)';
    for(const name of classes){const pill=document.createElement('div');pill.className=name;pill.dataset.testBacking='1';pill.style.cssText='width:48px;height:32px';toolbar.append(pill);}
    const button=document.createElement('button');button.className='ytp-button';button.id='native-hover-reference';button.textContent='S';button.style.cssText='position:relative;width:36px;height:32px';toolbar.querySelector('.ytp-right-controls').append(button);
    const popup=document.createElement('div');popup.className='ytp-volume-popover';popup.style.cssText='background-color:rgba(0,0,0,.3);backdrop-filter:blur(16px);position:absolute;left:300px;top:0;width:40px;height:40px';toolbar.append(popup);player.append(toolbar);
    const tip=document.createElement('div');tip.id='native-tooltip-reference';tip.style.cssText='background-color:rgba(0,0,0,.3);backdrop-filter:blur(16px);position:absolute;left:10px;top:10px;width:80px;height:25px';player.append(tip);
    document.querySelector('.sponsorBlockPreviewBar').style.backgroundColor='rgb(0,255,0)';
    audit.backingRects=[...toolbar.querySelectorAll('[data-test-backing]')].map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}));
  }`);
  const paint=await page.locator('#modern-test-toolbar [data-test-backing]').evaluateAll(elements=>elements.map(el=>({background:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter})));
  assert.equal(paint.length,8);
  for(const actual of paint) assert.deepEqual(actual,{background:mode==='transparent'?'rgba(0, 0, 0, 0)':'rgba(0, 0, 0, 0.18)',blur:mode==='transparent'?'none':'blur(12px)'});
  assert.deepEqual(await page.locator('#modern-test-toolbar').evaluate(el=>({background:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter})),{background:'rgba(0, 0, 0, 0)',blur:'none'});
  assert.deepEqual(await page.locator('#modern-test-toolbar [data-test-backing]').evaluateAll(elements=>elements.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}))),await page.evaluate(()=>audit.backingRects));
  await page.locator('#native-hover-reference').hover();
  assert.deepEqual(await page.locator('#native-hover-reference').evaluate(el=>({background:getComputedStyle(el,'::before').backgroundColor,radius:getComputedStyle(el,'::before').borderRadius})),{background:'rgba(255, 255, 255, 0.1)',radius:'40px'});
  for(const selector of ['.ytp-volume-popover','#native-tooltip-reference']) assert.deepEqual(await page.locator(selector).evaluate(el=>({background:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter})),{background:'rgba(0, 0, 0, 0.3)',blur:'blur(16px)'});
  assert.equal(await page.locator('.sponsorBlockPreviewBar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 255, 0)');
});
