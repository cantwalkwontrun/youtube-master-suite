// Language: en-GB. Recover native Home continuations without fetching or scrolling.
export function installHomeFeedLoading({ document, window, preferences = {},
  MutationObserver = window.MutationObserver, reportError = () => {} }) {
  const automatic = preferences.autoLoadFilteredHome === true;
  const manual = preferences.showHomeLoadMore === true;
  if ((!automatic && !manual) || !document.body || !MutationObserver) return () => {};
  const limit = [1, 3, 5, 10].includes(Number(preferences.homeLoadBatchLimit)) ? Number(preferences.homeLoadBatchLimit) : 3;
  const delay = [3, 5, 10].includes(Number(preferences.homeLoadDelay)) ? Number(preferences.homeLoadDelay) * 1000 : 3000;
  const continuationSelector = 'ytd-continuation-item-renderer,yt-continuation-item-view-model';
  const cardSelector = 'ytd-rich-item-renderer';
  const flags = ['data-clean-up-youtube-hidden', 'data-clean-up-youtube-permanent-hidden',
    'data-ytppl-live-hidden', 'data-ytppl-upcoming-hidden', 'data-ytppl-pay-to-watch-hidden',
    'data-ytppl-watched-hidden', 'data-ytms-discovery-hidden'];
  const filteredSelector = flags.map(flag => `[${flag}="1"]`).join(',');
  const excluded = 'ytd-miniplayer,ytd-playlist-panel-renderer,ytd-popup-container,ytd-engagement-panel-section-list-renderer';
  let disposed = false, navigating = false, suspended = false, observing = false;
  let grid = null, footer = null, button = null, status = null, style = null;
  let timer = 0, pending = null, attempts = new Set(), automaticCount = 0, lastRequest = -Infinity;
  let paused = '', cards = [], cardsDirty = true;
  const attemptedByGrid = new WeakMap();
  const confirmedEndByGrid = new WeakSet();
  let automaticReadyAt = window.performance.now() + delay;
  const listeners = [];
  const home = () => ['/', '/feed/recommended'].includes(window.location.pathname);
  const active = () => !disposed && !navigating && !suspended && !document.hidden && home();
  const listen = (target, type, fn, options) => { target.addEventListener(type, fn, options); listeners.push([target, type, fn, options]); };
  const visible = el => {
    if (!el?.isConnected || el.closest('[hidden],[aria-hidden="true"]')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
  };
  const clearTimer = () => { if (timer) window.clearTimeout(timer); timer = 0; };
  function schedule(ms = 180) {
    if (!active() || timer) return;
    timer = window.setTimeout(() => { timer = 0; try { reconcile(); } catch { paused = 'Loading recovery paused for this page.'; reportError(); } }, ms);
  }
  function removeUi() {
    footer?.remove(); style?.remove(); footer = button = status = style = null;
  }
  function reset() {
    clearTimer(); observer.disconnect(); observing = false; removeUi();
    if (grid) confirmedEndByGrid.delete(grid);
    grid = null; cards = []; cardsDirty = true; pending = null;
    attempts = new Set(); automaticCount = 0; lastRequest = -Infinity; paused = '';
    automaticReadyAt = window.performance.now() + delay;
  }
  function ensureUi() {
    if (!manual || !grid?.parentElement) return;
    if (!footer) {
      style = document.createElement('style'); style.id = 'ytms-home-loading-style';
      style.textContent = '#ytms-home-loading{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:20px 12px;color:var(--yt-spec-text-secondary,#aaa);font:14px/20px Roboto,Arial,sans-serif}#ytms-home-loading button{font:500 14px/20px Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#f1f1f1);background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.2));border:0;border-radius:20px;padding:10px 18px;cursor:pointer}#ytms-home-loading button:disabled{opacity:.5;cursor:default}#ytms-home-loading button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#3ea6ff);outline-offset:3px}';
      (document.head || document.documentElement).append(style);
      footer = document.createElement('div'); footer.id = 'ytms-home-loading'; footer.lang = 'en-GB';
      button = document.createElement('button'); button.type = 'button'; button.textContent = 'Load more';
      status = document.createElement('span'); status.id = 'ytms-home-loading-status';
      status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      button.setAttribute('aria-describedby', status.id);
      button.addEventListener('click', () => { if (active()) { clearTimer(); reconcile(true); } });
      footer.append(button, status);
    }
    if (footer.previousElementSibling !== grid) grid.after(footer);
  }
  // The checked native controller owns endpoint dispatch, spinner and response
  // handling. Never construct requests, tokens, endpoints or synthetic yt-actions.
  function contract(host) {
    try {
      const candidates = [...new Set([host.inst, host.polymerController, host].filter(Boolean))];
      const owner = candidates.find(c => c.hostElement === host || c === host);
      if (!owner || typeof owner.triggerContinuation !== 'function') return null;
      const data = owner.data;
      if (!data || typeof data !== 'object' || typeof owner.spinnerActive !== 'boolean' ||
        typeof owner.endOfList !== 'boolean' || typeof owner.showButton !== 'boolean') return null;
      if (owner.endOfList) return { host, owner, token: null, ended: true, busy: false, buttonMode: owner.showButton };
      let token, invoke;
      if (!owner.showButton && data.trigger === 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN') {
        if (typeof owner.resetIntersectionObserver !== 'function') return null;
        token = data.continuationEndpoint?.continuationCommand?.token;
        // Match the native intersection callback's complete sequence. Leaving
        // its observer armed could dispatch this same token again afterwards.
        invoke = () => { try { owner.triggerContinuation(); } finally { owner.resetIntersectionObserver(); } };
      } else if (owner.showButton && ['CONTINUATION_TRIGGER_ON_BUTTON_CLICK', 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN'].includes(data.trigger)) {
        const renderer = host.querySelector('#button ytd-button-renderer');
        const nativeButton = renderer?.querySelector('button');
        const model = renderer?.data || renderer?.polymerController?.data;
        token = data.button?.buttonRenderer?.command?.continuationCommand?.token;
        if (!nativeButton || nativeButton.disabled || !visible(nativeButton) ||
          model?.command?.continuationCommand?.token !== token) return null;
        invoke = () => nativeButton.click();
      } else return null;
      if (typeof token !== 'string' || !token.length || token.length > 16384) return null;
      return { host, owner, token, invoke, busy: owner.spinnerActive,
        ended: owner.endOfList, buttonMode: owner.showButton };
    } catch { return null; }
  }
  function current() {
    const hosts = [...grid.querySelectorAll(continuationSelector)].filter(el =>
      el.closest('ytd-rich-grid-renderer') === grid && !el.closest(excluded) && visible(el));
    return hosts.length === 1 ? contract(hosts[0]) : null;
  }
  function setStatus(text, enabled = false) {
    if (!status) return;
    if (status.textContent !== text) status.textContent = text;
    button.disabled = !enabled;
    const label = pending ? 'Loading…' : 'Load more';
    if (button.textContent !== label) button.textContent = label;
    footer.setAttribute('aria-busy', pending ? 'true' : 'false');
  }
  function nearEnd() {
    // Walk backwards only until a visible card is found. No image/title reads or
    // geometry writes, and no document-wide feed scan during scrolling.
    for (let i = cards.length - 1; i >= 0; i--) {
      const rect = cards[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return rect.bottom <= window.innerHeight + 240;
    }
    return grid.getBoundingClientRect().top <= window.innerHeight + 240;
  }
  function request(next, isManual) {
    if (!active() || pending || next.busy || next.ended || attempts.has(next.token) ||
      attempts.size >= 128 || window.performance.now() - lastRequest < delay) return;
    if (!isManual && (paused || next.buttonMode || automaticCount >= limit)) return;
    // Record before invoking: synchronous native events cannot dispatch twice.
    attempts.add(next.token); lastRequest = window.performance.now();
    if (!isManual) automaticCount++;
    pending = { host: next.host, owner: next.owner, token: next.token, cardCount: cards.length, deadline: window.performance.now() + 10000 };
    try { next.invoke(); } catch { pending = null; paused = 'YouTube could not load more. Automatic loading paused.'; reportError(); }
    setStatus(pending ? 'Waiting for YouTube…' : paused);
    schedule(pending ? 10000 : 180);
  }
  function reconcile(isManual = false) {
    if (!active()) return;
    if (!observing) {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: [...flags, 'hidden', 'aria-hidden', 'aria-busy', 'active'] });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-yt-master-show-filtered'] });
      observing = true;
    }
    if (!grid?.isConnected || !visible(grid)) {
      const grids = [...document.querySelectorAll('ytd-browse ytd-rich-grid-renderer')].filter(el =>
        !el.closest(excluded) && visible(el));
      if (grids.length !== 1) { removeUi(); return; }
      grid = grids[0]; cardsDirty = true;
      if (!attemptedByGrid.has(grid)) attemptedByGrid.set(grid, new Set());
      attempts = attemptedByGrid.get(grid);
    }
    ensureUi();
    if (cardsDirty) { cards = [...grid.querySelectorAll(cardSelector)].filter(el => el.closest('ytd-rich-grid-renderer') === grid); cardsDirty = false; }
    const next = current();
    if (pending) {
      // A new native token is the proof of continuation advancement. Merely
      // changing a spinner, unrelated rows or a title cannot authorise a retry.
      if (next && next.token !== pending.token) pending = null;
      else if (!pending.host.isConnected && !next && cards.length > pending.cardCount) {
        if (pending.owner.endOfList === true) confirmedEndByGrid.add(grid);
        pending = null;
      }
      else if (window.performance.now() >= pending.deadline) {
        pending = null; paused = 'YouTube has not supplied another batch. Automatic loading paused.';
      } else { setStatus('Waiting for YouTube…'); schedule(pending.deadline - window.performance.now()); return; }
    }
    if (!next) {
      setStatus(grid.querySelector(continuationSelector) ? 'Loading is unavailable for this YouTube layout.' :
        confirmedEndByGrid.has(grid) ? 'YouTube has no more recommendations available.' :
          'YouTube isn’t offering another batch right now.'); return;
    }
    if (next.ended) { confirmedEndByGrid.add(grid); setStatus('YouTube has no more recommendations available.'); return; }
    confirmedEndByGrid.delete(grid);
    if (next.busy) { setStatus(paused || 'YouTube is loading recommendations…'); return; }
    if (attempts.has(next.token)) { setStatus(paused || 'Waiting for YouTube to supply another batch.'); return; }
    if (attempts.size >= 128) { setStatus('Loading recovery limit reached for this Home visit.'); return; }
    const remaining = delay - (window.performance.now() - lastRequest);
    if (remaining > 0) { setStatus('Please wait before loading another batch.'); schedule(remaining); return; }
    setStatus(paused || (automaticCount >= limit && automatic ? 'Automatic batch limit reached. You can load another batch manually.' : ''), true);
    if (isManual) { request(next, true); return; }
    if (automatic && cards.length > 0 && !paused && !next.buttonMode && automaticCount < limit &&
      document.documentElement.getAttribute('data-yt-master-show-filtered') !== '1' &&
      grid.querySelector(filteredSelector) && nearEnd()) {
      // Give native intersection loading first refusal and filters time to settle.
      if (window.performance.now() < automaticReadyAt) schedule(automaticReadyAt - window.performance.now());
      else request(next, false);
    }
  }
  const observer = new MutationObserver(records => {
    let relevant = false;
    for (const record of records) {
      if (record.target === footer || footer?.contains(record.target)) continue;
      if (record.target === document.documentElement) { relevant = true; continue; }
      if (record.type === 'attributes' && record.target.matches?.('ytd-browse,ytd-rich-grid-renderer')) {
        relevant = true; grid = null; cardsDirty = true; continue;
      }
      if (grid?.contains(record.target)) {
        if (record.type === 'attributes' || record.target.closest?.(continuationSelector) ||
          [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
            (node.matches(`${cardSelector},ytd-rich-grid-row,${continuationSelector}`) || node.querySelector(`${cardSelector},${continuationSelector}`)))) {
          relevant = true; cardsDirty = true;
        }
      } else if ([...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches('ytd-browse,ytd-rich-grid-renderer') || node.querySelector('ytd-rich-grid-renderer')))) { relevant = true; grid = null; cardsDirty = true; }
    }
    if (relevant) { clearTimer(); schedule(); }
  });
  listen(window, 'scroll', () => schedule(220), { passive: true });
  listen(window, 'resize', () => schedule());
  listen(window, 'yt-navigate-start', () => { navigating = true; reset(); });
  listen(window, 'yt-navigate-finish', () => {
    navigating = false;
    if (home()) { if (!grid) automaticReadyAt = window.performance.now() + delay; schedule(); }
    else reset();
  });
  listen(window, 'yt-page-data-updated', () => {
    if (grid) confirmedEndByGrid.delete(grid);
    cardsDirty = true; clearTimer(); schedule();
  });
  listen(document, 'visibilitychange', () => { clearTimer(); if (active()) schedule(); });
  listen(window, 'pagehide', () => {
    suspended = true; clearTimer(); observer.disconnect(); observing = false; removeUi();
  });
  listen(window, 'pageshow', () => { suspended = false; schedule(); });
  schedule();
  return () => { disposed = true; reset(); for (const [target, type, fn, options] of listeners) target.removeEventListener(type, fn, options); };
}
