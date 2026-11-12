// Language: en-GB. Optional layout controls preserve native player ownership.
export function installLayoutControls({ document, window, preferences = {}, MutationObserver = window.MutationObserver, reportError = () => {} }) {
  const flags = {
    fullWindowTheatre: preferences.fullWindowTheatre === true,
    theatreHideHeader: preferences.fullWindowTheatre === true && preferences.theatreHideHeader === true,
    relatedBelowPlayer: preferences.relatedBelowPlayer === true && preferences.hideRelated !== true,
    hideFullscreenTitle: preferences.hideFullscreenTitle === true,
    hideFullscreenRelated: preferences.hideFullscreenRelated === true,
    hideFullscreenEndscreen: preferences.hideFullscreenEndscreen === true,
    hideFullscreenVoting: preferences.hideFullscreenVoting === true,
    hideFullscreenMoreActions: preferences.hideFullscreenMoreActions === true,
    hideFullscreenControls: preferences.hideFullscreenControls === true,
    hideChatFullscreen: preferences.hideChatFullscreen === true,
  };
  if (!Object.values(flags).some(Boolean)) return () => {};

  const style = document.createElement('style');
  style.id = 'ytms-layout-controls';
  const rules = [];
  const routeAttribute = 'data-ytms-layout-watch';
  const headerAttribute = 'data-ytms-theatre-header-hidden';
  const watchScope = `:root[${routeAttribute}="1"]`;
  const theatreHost = 'ytd-watch-flexy:is([theater], [theatre])';
  const theatre = `${watchScope} ${theatreHost}`;
  if (flags.fullWindowTheatre) {
    const offset = flags.theatreHideHeader ? '0px' : 'var(--ytd-masthead-height, 56px)';
    rules.push(`
      ${theatre} #full-bleed-container {
        height: calc(100vh - ${offset}) !important;
        height: calc(100dvh - ${offset}) !important;
        min-height: 0 !important; max-height: none !important;
      }
      ${theatre} #player-theater-container {
        height: 100% !important; min-height: 0 !important; max-height: none !important;
      }
    `);
    if (flags.theatreHideHeader) rules.push(`
      :root[${headerAttribute}="1"] ytd-masthead { display: none !important; }
      :root[${headerAttribute}="1"] ytd-app { --ytd-masthead-height: 0px !important; }
      ${theatre} { --ytd-masthead-height: 0px !important; }
    `);
  }
  // These target native in-player surfaces only. RYD, SponsorBlock notices,
  // DeArrow titles and the main playback controls keep their own presentation.
  if (flags.hideFullscreenTitle) rules.push('.html5-video-player.ytp-fullscreen .ytp-chrome-top { display: none !important; }');
  if (flags.hideFullscreenRelated) rules.push('.html5-video-player.ytp-fullscreen .ytp-pause-overlay { display: none !important; }');
  if (flags.hideFullscreenEndscreen) rules.push('.html5-video-player.ytp-fullscreen .ytp-endscreen-content { display: none !important; }');
  if (flags.hideFullscreenVoting) rules.push(`
    .html5-video-player.ytp-fullscreen .ytp-fullscreen-quick-actions :is(yt-like-button-view-model, yt-dislike-button-view-model, like-button-view-model, dislike-button-view-model, .ytLikeButtonViewModelHost, .ytDislikeButtonViewModelHost) { display: none !important; }
  `);
  if (flags.hideFullscreenMoreActions) rules.push(`
    .html5-video-player.ytp-fullscreen .ytp-fullscreen-quick-actions :is(.ytp-overflow-button, yt-button-view-model:has(button[aria-label="More actions" i])) { display: none !important; }
  `);
  if (flags.hideFullscreenControls) rules.push('.html5-video-player.ytp-fullscreen .ytp-chrome-bottom { display: none !important; }');
  if (flags.hideChatFullscreen) rules.push(`
    :root:fullscreen ytd-live-chat-frame#chat:not([data-ytppl-live-chat-panel="1"]),
    :root:has(.html5-video-player.ytp-fullscreen) ytd-live-chat-frame#chat:not([data-ytppl-live-chat-panel="1"]) { display: none !important; }
  `);
  const belowAttribute = 'data-ytms-related-below';
  if (flags.relatedBelowPlayer) rules.push(`
    :root ytd-watch-flexy[${belowAttribute}="1"] { --ytd-watch-flexy-sidebar-width: 0px !important; }
    ytd-watch-flexy[${belowAttribute}="1"] #columns { flex-direction: column !important; }
    ytd-watch-flexy[${belowAttribute}="1"] #columns > #primary,
    ytd-watch-flexy[${belowAttribute}="1"] #columns > #secondary {
      width: 100% !important; max-width: none !important; min-width: 0 !important;
      box-sizing: border-box !important;
    }
    ytd-watch-flexy[${belowAttribute}="1"] #secondary { margin-inline-start: 0 !important; }
  `);
  style.textContent = rules.join('\n');
  (document.head || document.documentElement).appendChild(style);

  let disposed = false, suspended = false, pageSuspended = false, navigationPending = false, frame = 0, observedTargets = [], geometryPending = false;
  const needsObservation = flags.relatedBelowPlayer || flags.theatreHideHeader;
  const needsReconciliation = needsObservation || flags.fullWindowTheatre;
  const marked = new Set();
  const onWatchRoute = () => window.location.pathname === '/watch' || window.location.pathname.startsWith('/live/');
  function marker(element, name, value) {
    if (element.getAttribute(name) === value) return;
    if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
    geometryPending = true;
  }
  function syncRouteMarker() {
    marker(document.documentElement, routeAttribute, flags.fullWindowTheatre && onWatchRoute() && !suspended ? '1' : null);
    if (!onWatchRoute() || suspended) marker(document.documentElement, headerAttribute, null);
  }
  const relevant = '#secondary, #secondary-inner, #related, ytd-watch-flexy, ytd-playlist-panel-renderer, yt-playlist-panel-renderer, ytd-live-chat-frame, ytd-engagement-panel-section-list-renderer, #sponsorBlockPopupContainer';
  function rendered(element, boundary, requireBox = true) {
    if (!element?.isConnected) return false;
    for (let current = element; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute('aria-hidden') === 'true' || current.hasAttribute('collapsed')) return false;
      const css = window.getComputedStyle(current);
      if (css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility) || css.opacity === '0') return false;
      if (current === boundary) break;
    }
    return requireBox === false || [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
  }
  function renderedRailContent(node, boundary) {
    if (node.nodeType === 3) {
      if (!node.textContent.trim() || !rendered(node.parentElement, boundary, false)) return false;
      const range = document.createRange(); range.selectNode(node);
      return [...range.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
    }
    if (node.nodeType !== 1 || node.tagName === 'STYLE' || node.tagName === 'SCRIPT' ||
        !rendered(node, boundary, false)) return false;
    if ([...node.getClientRects()].some(rect => rect.width > 0 && rect.height > 0)) return true;
    // display:contents and zero-height overflow wrappers can have visible
    // children without a box of their own. Descend only through such wrappers.
    return [...node.childNodes].some(child => renderedRailContent(child, node));
  }
  function railHasOtherContent(watch, secondary, related) {
    const surfaces = secondary.querySelectorAll('ytd-playlist-panel-renderer, yt-playlist-panel-renderer, ytd-live-chat-frame, ytd-engagement-panel-section-list-renderer, #sponsorBlockPopupContainer');
    for (const surface of surfaces) {
      if (related.contains(surface)) continue;
      if (surface.matches('ytd-engagement-panel-section-list-renderer') &&
          surface.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN') continue;
      if (rendered(surface, watch)) return true;
    }
    // Unknown native or extension surfaces keep their rail. Do not hide or
    // relocate a new feature merely because its custom-element name changed.
    // A native or extension wrapper can contain both #related and unrelated
    // controls. Check siblings along its ancestor path, rather than treating
    // the whole shared wrapper as related content. Do not scan inside #related.
    for (let branch = related; branch && branch !== secondary; branch = branch.parentElement) {
      for (const surface of branch.parentElement?.childNodes || []) {
        if (surface === branch) continue;
        if (renderedRailContent(surface, watch)) return true;
      }
    }
    return false;
  }
  function sync() {
    frame = 0;
    if (disposed || suspended) return;
    const route = onWatchRoute();
    const visibleWatches = route && (flags.theatreHideHeader || flags.relatedBelowPlayer)
      ? [...document.querySelectorAll('ytd-watch-flexy')].filter(watch => rendered(watch, document.documentElement)) : [];
    // The masthead is global. A retained or ambiguous watch root cannot decide
    // its visibility on behalf of the currently displayed page.
    const hideHeader = flags.theatreHideHeader && visibleWatches.length === 1 && visibleWatches[0].matches(theatreHost);
    marker(document.documentElement, headerAttribute, hideHeader ? '1' : null);
    const active = new Set();
    if (flags.relatedBelowPlayer && route) {
      for (const watch of visibleWatches) {
        const secondary = watch.querySelector('#secondary');
        const related = secondary?.querySelector('#related');
        if (!secondary || !related || !rendered(related, watch) || railHasOtherContent(watch, secondary, related)) continue;
        active.add(watch);
        if (!marked.has(watch)) { marker(watch, belowAttribute, '1'); marked.add(watch); }
      }
    }
    for (const watch of marked) if (!active.has(watch)) { marker(watch, belowAttribute, null); marked.delete(watch); }
    observe();
    if (geometryPending) {
      geometryPending = false;
      // Notify after the complete owned layout transition, so native inline
      // dimensions follow the new containers without changing player ownership.
      if (route) window.dispatchEvent(new window.Event('resize'));
    }
  }
  function schedule() {
    if (!disposed && !suspended && needsReconciliation && !frame) frame = window.requestAnimationFrame(() => {
      try { sync(); } catch (error) { reportError(error); }
    });
  }
  function clearMarkers() { for (const watch of marked) marker(watch, belowAttribute, null); marked.clear(); }
  const observer = needsObservation ? new MutationObserver(mutations => {
    if (mutations.some(mutation => {
      const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
      if (target?.closest('#secondary, #secondary-inner')) return true;
      if (mutation.type === 'attributes') return observedTargets.includes(target);
      return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1 && (node.matches(relevant) || node.querySelector(relevant)));
    })) schedule();
  }) : null;
  function observe() {
    if (!observer) return;
    const targets = [];
    if (onWatchRoute()) {
      const unique = new Set([document.documentElement]);
      for (const watch of document.querySelectorAll('ytd-watch-flexy')) {
        for (let ancestor = watch; ancestor; ancestor = ancestor.parentElement) unique.add(ancestor);
        for (const secondary of watch.querySelectorAll('#secondary')) unique.add(secondary);
      }
      targets.push(...unique);
    }
    if (targets.length === observedTargets.length && targets.every((target, index) => target === observedTargets[index])) return;
    const registrations = targets.map(target => [target, target === document.documentElement
      ? { childList: true, subtree: true }
      : { attributes: true, characterData: target.id === 'secondary', subtree: target.id === 'secondary', attributeFilter: ['hidden', 'collapsed', 'visibility', 'aria-hidden', 'class', 'style', 'theater', 'theatre'] }]);
    if (typeof observer.replaceRegistrations === 'function') observer.replaceRegistrations(registrations);
    else { observer.disconnect(); for (const [target, options] of registrations) observer.observe(target, options); }
    observedTargets = targets;
  }
  function suspend() {
    suspended = true; observer?.disconnect();
    observedTargets = [];
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; clearMarkers(); syncRouteMarker();
  }
  function resume() { if (!disposed && !pageSuspended && !navigationPending) { suspended = false; syncRouteMarker(); observe(); schedule(); } }
  function navigateStart() { navigationPending = true; suspend(); }
  function navigateFinish() { navigationPending = false; resume(); }
  function pageHide() { pageSuspended = true; suspend(); }
  function pageShow() {
    const restoring = pageSuspended; pageSuspended = false;
    if (restoring) navigationPending = false;
    resume();
  }
  function pageData() { syncRouteMarker(); schedule(); }
  const listeners = [];
  function listen(type, handler) { window.addEventListener(type, handler); listeners.push([type, handler]); }
  listen('yt-navigate-start', navigateStart); listen('pagehide', pageHide);
  listen('yt-navigate-finish', navigateFinish); listen('pageshow', pageShow);
  listen('yt-page-data-updated', pageData); listen('resize', schedule);
  syncRouteMarker(); observe(); schedule();
  return () => {
    if (disposed) return;
    disposed = true; suspend();
    for (const [type, handler] of listeners) window.removeEventListener(type, handler);
    style.remove();
  };
}
