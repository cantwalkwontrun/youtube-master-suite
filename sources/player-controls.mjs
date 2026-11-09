// Language: en-GB. Optional native player preferences and local, user-initiated exports.
// This factory never replaces media, rewrites requests, seeks, or starts playback.
export function installPlayerControls({ document, window, preferences = {}, MutationObserver = window.MutationObserver, reportError = () => {} }) {
  const p = preferences;
  const css = [];
  if (p.disableAmbientMode) css.push('ytd-watch-flexy #cinematics { display: none !important; }');
  if (p.hideNextButton) css.push('#movie_player .ytp-next-button { display: none !important; }');
  if (p.hidePlayerWatermark) css.push('#movie_player .ytp-watermark { display: none !important; }');
  if (p.hideJumpAhead) css.push('#movie_player .ytp-skip-forward-button, #movie_player .ytp-skip-ahead-button { display: none !important; }');
  if (p.hidePlayerAnnotations) css.push('#movie_player .annotation, #movie_player .ytp-cards-teaser { display: none !important; }');
  if (p.classicProgressColour) css.push('#movie_player .ytp-play-progress, #movie_player .ytp-scrubber-container:not([data-ytms-playhead-marker="1"]) > .ytp-scrubber-button { background:#f00 !important; }');
  if (p.playerBackground === 'black' || p.playerBackground === 'transparent') {
    css.push(`#movie_player.html5-video-player { background-color: ${p.playerBackground === 'black' ? '#000' : 'transparent'} !important; }`);
  }
  if (p.disablePlayerBlur) css.push('#movie_player .ytp-cinematic-container, #movie_player .ytp-background-blur { display: none !important; }');
  if (p.playerControlsBackground === 'transparent') css.push('#movie_player .ytp-gradient-bottom { background: none !important; } #movie_player .ytp-chrome-controls { background-color: transparent !important; }');
  if (p.playerControlsBackground === 'blurred') css.push('#movie_player .ytp-chrome-controls { background-color: rgba(0,0,0,.18) !important; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }');
  if (['transparent', 'blurred'].includes(p.playerControlsBackground)) {
    // Delhi uses separate pill backings; the legacy gradient is normally hidden.
    // Leave hover pseudo-elements, popovers, tooltips and timeline overlays alone.
    const backplates = '#movie_player.ytp-delhi-modern .ytp-chrome-controls :is(.ytp-right-controls, .ytp-play-button, .ytp-prev-button, .ytp-next-button, .ytp-mute-button.ytp-standalone-mute-button, .ytp-volume-area, .ytp-time-wrapper, .ytp-chapter-title)';
    const background = p.playerControlsBackground === 'transparent' ? 'transparent' : 'rgba(0,0,0,.18)';
    const filter = p.playerControlsBackground === 'transparent' ? 'none' : 'blur(12px)';
    css.push(`#movie_player.ytp-delhi-modern .ytp-chrome-controls { background-color:transparent !important; -webkit-backdrop-filter:none !important; backdrop-filter:none !important; } ${backplates} { background:${background} !important; -webkit-backdrop-filter:${filter} !important; backdrop-filter:${filter} !important; }`);
  }
  if (p.hideClipButton) {
    // Recognise only native watch action hosts. Other languages/layouts retain
    // their actions when no stable target ID or known native label is exposed.
    css.push('ytd-watch-metadata #actions :is(ytd-button-renderer, yt-button-view-model):has(button[aria-label="Clip"]), ytd-watch-metadata #actions [target-id="watch-clip-button"] { display:none !important; }');
  }
  if (window.location.pathname.startsWith('/embed/')) {
    if (p.embedHideShare) css.push('#movie_player .ytp-share-button, #movie_player .ytp-share-panel { display:none !important; }');
    if (p.embedHidePauseOverlay) css.push('#movie_player .ytp-pause-overlay, #movie_player .ytp-pause-overlay-container { display:none !important; }');
  }
  const active = css.length || p.originalAudio || p.disableAutoplay || p.disableStableVolume ||
    p.disableNumberKeySeeking || p.snapshotButton || p.transcriptDownload;
  if (!active) return () => {};

  const style = document.createElement('style');
  style.id = 'ytms-player-controls-style';
  style.textContent = css.join('\n') + `
    #ytms-player-action-status { position:absolute; left:12px; bottom:60px; z-index:1001; max-width:calc(100% - 40px); padding:8px 12px; border-radius:8px; background:rgba(28,28,28,.9); color:#eee; font:13px/1.4 Roboto,Arial,sans-serif; pointer-events:none; }
    #ytms-export-tooltip { position:absolute; z-index:1000; box-sizing:border-box; max-width:calc(100% - 16px); padding:5px 9px; border-radius:2px; background:rgba(28,28,28,.9); color:inherit; font-family:inherit; font-size:118%; font-weight:500; line-height:15px; pointer-events:none; }
    .ytp-big-mode #ytms-export-tooltip { line-height:22px; }
    .ytp-delhi-modern #ytms-export-tooltip { border-radius:8px; background:var(--yt-sys-color-baseline--overlay-background-medium-light,rgba(0,0,0,.3)); -webkit-backdrop-filter:var(--yt-frosted-glass-backdrop-filter-override,blur(16px)); backdrop-filter:var(--yt-frosted-glass-backdrop-filter-override,blur(16px)); text-shadow:0 0 2px #000; }
  `;
  (document.head || document.documentElement).appendChild(style);
  let disposed = false, suspended = false, pageSuspended = false, navigationPending = false, observing = false, snapshotPending = false, captureGeneration = 0, frame = 0, statusTimer = 0, status = null, owner = null;
  const buttons = new Set(), attempts = new WeakMap(), downloads = new Map();
  let tooltip = null, tooltipButton = null;
  const visible = el => {
    if (!el?.isConnected || el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    // Opacity is not inherited: a retained native host can hide an otherwise
    // measurable player without changing that player's own computed opacity.
    for (let current = el; current; current = current.parentElement) {
      const s = window.getComputedStyle(current);
      if (s.display === 'none' || ['hidden', 'collapse'].includes(s.visibility) || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  function selectedPlayer() {
    const players = [...document.querySelectorAll('#movie_player')].filter(el => visible(el) &&
      !el.closest('ytd-video-preview, ytd-reel-video-renderer') && !el.matches('.ad-showing, .ad-interrupting'));
    return players.length === 1 ? players[0] : null;
  }
  function identity(player) {
    try {
      const id = player.getVideoData?.()?.video_id;
      if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id;
    } catch { /* A changing player can expose its identity on a later native signal. */ }
    return '';
  }
  function attempt(player, name, callback) {
    const id = identity(player), video = player.querySelector('video');
    if (!id || !video) return;
    let record = attempts.get(player);
    if (!record || record.id !== id || record.video !== video) {
      record = { id, video, done: new Set(), counts: new Map() }; attempts.set(player, record);
    }
    const count = record.counts.get(name) || 0;
    if (record.done.has(name) || count >= 8) return;
    record.counts.set(name, count + 1);
    try { if (callback()) record.done.add(name); }
    catch (error) { record.done.add(name); reportError(name, error); }
  }
  function applyNativePreferences(player) {
    if (p.originalAudio) attempt(player, 'original audio', () => {
      if (typeof player.getAvailableAudioTracks !== 'function' || typeof player.getAudioTrack !== 'function' || typeof player.setAudioTrack !== 'function') return false;
      const tracks = player.getAvailableAudioTracks();
      if (!Array.isArray(tracks) || tracks.length < 2 || tracks.length > 64) return false;
      const originals = tracks.filter(track => {
        const info = track?.getLanguageInfo?.();
        // Native audioIsDefault identifies the source default, independent of
        // the user's selected language. An automatic dub must never qualify.
        return info && typeof info.getIsDefault === 'function' && typeof info.getIsAutoDubbed === 'function' &&
          info.getIsDefault() === true && info.getIsAutoDubbed() === false;
      });
      if (originals.length !== 1) return false;
      const current = player.getAudioTrack(), currentId = current?.getLanguageInfo?.()?.getId?.();
      const originalId = originals[0].getLanguageInfo()?.getId?.();
      const sameId = typeof currentId === 'string' && currentId.length > 0 && currentId === originalId;
      if (current !== originals[0] && !sameId) player.setAudioTrack(originals[0]);
      return true;
    });
    if (p.disableAutoplay) attempt(player, 'autoplay', () => {
      const toggle = player.querySelector('.ytp-autonav-toggle-button[aria-checked]');
      const checked = toggle?.getAttribute('aria-checked');
      if (!['true', 'false'].includes(checked) || typeof player.setAutonav !== 'function') return false;
      if (checked === 'true') player.setAutonav(false, true);
      return true;
    });
    if (p.disableStableVolume) attempt(player, 'stable volume', () => {
      if (typeof player.getDrcUserPreference !== 'function' || typeof player.setDrcUserPreference !== 'function') return false;
      const current = player.getDrcUserPreference();
      if (current !== 0 && current !== 1) return false;
      if (current === 1) player.setDrcUserPreference(0);
      return true;
    });
  }
  function message(text) {
    window.clearTimeout(statusTimer); status?.remove();
    if (!owner?.isConnected) return;
    status = document.createElement('div'); status.id = 'ytms-player-action-status'; status.setAttribute('role', 'status');
    status.textContent = text; owner.appendChild(status);
    statusTimer = window.setTimeout(() => { status?.remove(); status = null; statusTimer = 0; }, 6000);
  }
  function describe(button, add) {
    const ids = (button.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== 'ytms-export-tooltip');
    if (add) ids.push('ytms-export-tooltip');
    if (ids.length) button.setAttribute('aria-describedby', ids.join(' ')); else button.removeAttribute('aria-describedby');
  }
  function tooltipOwnerVisible() {
    if (!owner || !tooltipButton || !buttons.has(tooltipButton) || tooltipButton.disabled || owner.classList.contains('ytp-autohide')) return false;
    return owner.contains(tooltipButton) && visible(tooltipButton);
  }
  function hideTooltip() {
    if (tooltipButton) describe(tooltipButton, false);
    tooltip?.remove(); tooltip = null; tooltipButton = null;
    document.removeEventListener('pointermove', pointerOutside, true);
    document.removeEventListener('pointerdown', hideTooltip, true);
    document.removeEventListener('pointercancel', hideTooltip, true);
    document.removeEventListener('scroll', hideTooltip, true);
    window.removeEventListener('blur', hideTooltip, true);
  }
  function pointerOutside(event) {
    if (tooltipButton?.matches(':focus-visible') && document.activeElement === tooltipButton) return;
    if (tooltipButton && !tooltipButton.contains(event.target)) hideTooltip();
  }
  function positionTooltip() {
    if (!tooltip || !tooltipOwnerVisible()) { hideTooltip(); return; }
    const playerRect = owner.getBoundingClientRect(), buttonRect = tooltipButton.getBoundingClientRect();
    const width = owner.clientWidth || playerRect.width, scale = playerRect.width / width;
    if (!Number.isFinite(scale) || scale <= 0) { hideTooltip(); return; }
    const progress = owner.querySelector('.ytp-progress-bar-container');
    const barTop = progress && visible(progress) ? progress.getBoundingClientRect().top : buttonRect.top;
    const left = (buttonRect.left + buttonRect.width / 2 - playerRect.left) / scale - tooltip.offsetWidth / 2;
    tooltip.style.left = `${Math.round(Math.max(8, Math.min(left, width - tooltip.offsetWidth - 8)))}px`;
    tooltip.style.top = `${Math.round(Math.max(8, (Math.min(barTop, buttonRect.top) - playerRect.top) / scale - tooltip.offsetHeight - 8))}px`;
  }
  function showTooltip(event) {
    const button = event.currentTarget;
    if (disposed || suspended || !buttons.has(button) || (event.type === 'focus' && !button.matches(':focus-visible'))) return;
    hideTooltip(); tooltipButton = button;
    if (!tooltipOwnerVisible()) { tooltipButton = null; return; }
    tooltip = document.createElement('div'); tooltip.id = 'ytms-export-tooltip'; tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = button.getAttribute('aria-label'); owner.appendChild(tooltip); describe(button, true);
    document.addEventListener('pointermove', pointerOutside, true);
    document.addEventListener('pointerdown', hideTooltip, true);
    document.addEventListener('pointercancel', hideTooltip, true);
    document.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('blur', hideTooltip, true);
    positionTooltip();
  }
  function leaveTooltip() {
    if (tooltipButton?.matches(':focus-visible') && document.activeElement === tooltipButton) return;
    hideTooltip();
  }
  function download(blob, filename) {
    if (downloads.size >= 4) { message('Please wait for the previous exports to finish.'); return false; }
    let url = null, anchor = null;
    try {
      url = window.URL.createObjectURL(blob); anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename;
      // Keep blob URLs until the browser has consumed the click, then release.
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      const timer = window.setTimeout(() => { window.URL.revokeObjectURL(url); downloads.delete(url); }, 1000);
      downloads.set(url, timer);
      return true;
    } catch {
      anchor?.remove(); if (url) window.URL.revokeObjectURL(url);
      message('The browser could not start this download.'); return false;
    }
  }
  function releaseSnapshot() {
    snapshotPending = false;
    const button = document.getElementById('ytms-snapshot-button');
    if (button && buttons.has(button)) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
  function snapshot(event) {
    if (!event.isTrusted) return;
    event.preventDefault(); event.stopPropagation();
    if (snapshotPending) return;
    const player = selectedPlayer(), video = player?.querySelector('video.html5-main-video, video');
    if (player !== owner || !video || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
      message('A video frame is not available yet.'); return;
    }
    if (video.videoWidth * video.videoHeight > 33554432) { message('This frame is too large to export safely.'); return; }
    const generation = captureGeneration, capturedId = identity(player);
    snapshotPending = true;
    event.currentTarget.disabled = true; event.currentTarget.setAttribute('aria-busy', 'true');
    try {
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) { releaseSnapshot(); message('This browser cannot create a snapshot.'); return; }
      context.drawImage(video, 0, 0);
      const jpeg = p.snapshotFormat === 'jpeg', type = jpeg ? 'image/jpeg' : 'image/png';
      const quality = ['70', '80', '90', '100'].includes(p.snapshotQuality) ? Number(p.snapshotQuality) / 100 : 0.9;
      canvas.toBlob(blob => {
        releaseSnapshot();
        if (disposed || suspended || generation !== captureGeneration || player !== owner || !player.isConnected ||
            video !== player.querySelector('video.html5-main-video, video') || (capturedId && capturedId !== identity(player))) return;
        if (!blob) { message('The browser could not export this frame.'); return; }
        if (download(blob, `youtube-frame.${jpeg ? 'jpg' : 'png'}`)) message('Snapshot saved.');
      }, type, quality);
    } catch (error) {
      releaseSnapshot();
      message(error?.name === 'SecurityError' ? 'This video does not allow local frame export.' : 'The browser could not export this frame.');
    }
  }
  function transcript(event) {
    if (!event.isTrusted) return;
    event.preventDefault(); event.stopPropagation();
    const panels = [...document.querySelectorAll('ytd-transcript-renderer')].filter(visible);
    if (panels.length !== 1) { message('Open YouTube’s transcript panel first, then try again.'); return; }
    const rows = [...panels[0].querySelectorAll('ytd-transcript-segment-renderer')];
    if (!rows.length || rows.length > 50000) { message('The loaded transcript is unavailable or too large.'); return; }
    const lines = rows.map(row => {
      const text = row.querySelector('.segment-text')?.textContent?.trim() || '';
      const time = row.querySelector('.segment-timestamp')?.textContent?.trim() || '';
      return text ? `${time ? time + ' ' : ''}${text}` : '';
    }).filter(Boolean);
    const text = lines.join('\n');
    if (!text || text.length > 4 * 1024 * 1024) { message('The loaded transcript is unavailable or too large.'); return; }
    if (download(new window.Blob([text + '\n'], { type: 'text/plain;charset=utf-8' }), 'youtube-transcript.txt')) message('Loaded transcript saved.');
  }
  function actionButton(player, id, label, path, handler, competingSelector) {
    const controls = player.querySelector('.ytp-right-controls');
    if (!controls) return;
    let button = document.getElementById(id);
    if (player.querySelector(competingSelector)) {
      if (button && buttons.has(button)) {
        if (tooltipButton === button) hideTooltip();
        button.remove(); buttons.delete(button);
      }
      return;
    }
    if (button && !buttons.has(button)) return;
    if (!button) {
      button = document.createElement('button'); button.id = id; button.type = 'button'; button.className = 'ytp-button';
      button.setAttribute('aria-label', label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 36 36'); svg.setAttribute('width', '36'); svg.setAttribute('height', '36'); svg.setAttribute('aria-hidden', 'true');
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('class', 'ytp-svg-fill'); shape.setAttribute('d', path); svg.appendChild(shape);
      button.appendChild(svg); button.addEventListener('click', handler); buttons.add(button);
      button.addEventListener('mouseenter', showTooltip); button.addEventListener('focus', showTooltip);
      button.addEventListener('mouseleave', leaveTooltip); button.addEventListener('blur', hideTooltip);
    }
    const anchor = controls.querySelector('.ytp-settings-button'), parent = anchor?.parentElement || controls;
    if (button.parentElement !== parent) parent.insertBefore(button, anchor);
    if (id === 'ytms-snapshot-button') {
      button.disabled = snapshotPending;
      if (snapshotPending) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy');
    }
  }
  function clearButtons() {
    captureGeneration++;
    hideTooltip();
    for (const button of buttons) button.remove(); buttons.clear();
    window.clearTimeout(statusTimer); statusTimer = 0; status?.remove(); status = null;
  }
  function reconcile() {
    frame = 0;
    if (disposed || suspended || document.hidden) return;
    const player = selectedPlayer();
    if (owner !== player) { clearButtons(); owner = player; }
    if (!player) return;
    for (const button of buttons) if (!button.isConnected) buttons.delete(button);
    applyNativePreferences(player);
    if (p.snapshotButton) actionButton(player, 'ytms-snapshot-button', 'Save video frame', 'M12 9l2-3h8l2 3h5v20H7V9h5zm-3 2v16h18V11h-4l-2-3h-6l-2 3H9zm9 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', snapshot, '.ytp-snapshot-button, #take-snapshot-button, [data-ytms-native-snapshot]');
    if (p.transcriptDownload) actionButton(player, 'ytms-transcript-button', 'Save loaded transcript', 'M9 6h13l5 5v19H9V6zm2 2v20h14V12h-5V8h-9zm11 1v1h1l-1-1zm-9 7h10v2H13v-2zm0 4h10v2H13v-2zm0 4h7v2h-7v-2z', transcript, '.ytp-transcript-download-button, [data-ytms-native-transcript-download]');
    if (tooltip) positionTooltip();
  }
  function schedule() {
    if (!disposed && !suspended && !frame) frame = window.requestAnimationFrame(reconcile);
  }
  function numberKey(event) {
    if (!p.disableNumberKeySeeking || !event.isTrusted || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing || !/^[0-9]$/.test(event.key)) return;
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    if (!target || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], .ytp-settings-menu, .ytp-popup')) return;
    const player = selectedPlayer();
    if (!player || !(player.contains(target) || player.contains(document.activeElement))) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  const relevant = '#movie_player, .html5-video-player, .ytp-right-controls, .ytp-autonav-toggle-button, ytd-transcript-renderer';
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes'
      ? record.target.matches?.('.ytp-autonav-toggle-button, #movie_player, .ytp-chrome-bottom, .ytp-chrome-controls, .ytp-right-controls')
      : record.target.matches?.('.ytp-right-controls') || [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && (node.matches(relevant + ', video') ||
          (node.matches('ytd-app, ytd-watch-flexy, ytd-player, #player-container') && node.querySelector(relevant)))))) schedule();
  });
  function startObservation() {
    if (disposed || observing) return;
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'class'] }); observing = true;
  }
  function suspend() {
    suspended = true; observer.disconnect(); observing = false;
    if (frame) window.cancelAnimationFrame(frame); frame = 0; clearButtons(); owner = null;
  }
  function resume() {
    if (disposed || pageSuspended || navigationPending || document.hidden) return;
    suspended = false; startObservation(); schedule();
  }
  function navigateStart() { navigationPending = true; suspend(); }
  function navigateFinish() { navigationPending = false; resume(); }
  function pageHide() { pageSuspended = true; suspend(); }
  function pageShow() {
    const restoring = pageSuspended; pageSuspended = false;
    if (restoring) navigationPending = false;
    resume();
  }
  function visibility() { if (document.hidden) suspend(); else resume(); }
  function media(event) { if (event.target?.localName === 'video' && event.target.closest('#movie_player')) schedule(); }
  const listeners = [];
  function listen(target, type, callback) { target.addEventListener(type, callback, true); listeners.push([target, type, callback]); }
  listen(document, 'keydown', numberKey);
  for (const type of ['loadedmetadata', 'emptied', 'durationchange']) listen(document, type, media);
  listen(window, 'yt-navigate-start', navigateStart); listen(window, 'pagehide', pageHide);
  listen(window, 'yt-navigate-finish', navigateFinish); listen(window, 'pageshow', pageShow);
  for (const type of ['yt-page-data-updated', 'resize']) listen(window, type, resume);
  listen(document, 'visibilitychange', visibility);
  startObservation(); schedule();
  return () => {
    disposed = true; suspend(); snapshotPending = false; observer.disconnect(); style.remove();
    for (const [url, timer] of downloads) { window.clearTimeout(timer); window.URL.revokeObjectURL(url); } downloads.clear();
    for (const [target, type, callback] of listeners) target.removeEventListener(type, callback, true);
  };
}
