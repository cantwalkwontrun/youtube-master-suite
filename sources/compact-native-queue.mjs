// Language: en-GB. Native controls retain ownership; only idle queue height is reduced.
export function installCompactNativeQueue({ document, window, enabled = true,
  MutationObserver = window.MutationObserver, ResizeObserver = window.ResizeObserver, reportError = () => {} }) {
  if (!enabled || !document || !MutationObserver || !ResizeObserver) return () => {};
  const hostSelector = 'ytd-miniplayer.ytdMiniplayerComponentHost';
  const panelSelector = 'ytd-playlist-panel-renderer.ytdMiniplayerComponentPlaylistPanel';
  const marker = 'data-ytms-compact-native-queue';
  const panelMarker = 'data-ytms-compact-native-queue-panel';
  const heightVar = '--ytms-native-queue-host-height', panelVar = '--ytms-native-queue-panel-height';
  const animationClasses = ['ytdMiniplayerComponentAnimatingSnap',
    'ytdMiniplayerComponentAnimatingPlaylistExpand', 'ytdMiniplayerComponentAnimatingFade'];
  let disposed = false, frame = 0, host = null, panel = null, gesture = null, released = false;
  let nativeSignature = '', resizeTargets = new Set(), sizes = null, style = null;
  let visibilityObserver = null, visibilityAncestors = [];
  let visibilitySignatures = new WeakMap();
  let suspended = document.hidden, pageSuspended = false, settleTimer = 0, settling = '', settled = '';
  let clickGuard = null, clickTimer = 0;
  let measurements = null;
  function measure(node, property) {
    const read = () => property === 'rect' ? node.getBoundingClientRect() : window.getComputedStyle(node);
    if (!measurements) return read();
    let entry = measurements.get(node);
    if (!entry) { entry = {}; measurements.set(node,entry); }
    return entry[property] ||= read();
  }
  function ensureStyle() {
    if (style) return;
    style = document.createElement('style');
    style.textContent = `${hostSelector}[${marker}] { height:var(${heightVar}) !important; }
${hostSelector}[${marker}] ${panelSelector}[${panelMarker}] {
 height:var(${panelVar}) !important; min-height:var(${panelVar}) !important;
 max-height:var(${panelVar}) !important; flex:0 0 var(${panelVar}) !important;
}`;
    (document.head || document.documentElement).append(style);
  }

  function release() {
    host?.removeAttribute(marker);
    panel?.removeAttribute(panelMarker);
  }
  function clearOwned() {
    release();
    host?.style.removeProperty(heightVar);
    host?.style.removeProperty(panelVar);
  }
  function clearSettlement() {
    if (settleTimer) window.clearTimeout(settleTimer);
    settleTimer = 0; settling = ''; settled = '';
  }
  function clearClickGuard() {
    if (clickTimer) window.clearTimeout(clickTimer);
    for (const node of clickGuard?.boundaries || []) node.removeEventListener('click', click, true);
    clickTimer = 0; clickGuard = null;
  }
  function signature(node) {
    return node ? ['height', 'width', 'top', 'bottom', 'left', 'right', 'transform', 'display', 'opacity']
      .map(name => node.style.getPropertyValue(name)).join('|') : '';
  }
  function visible(node) {
    if (!node?.isConnected) return false;
    const box = measure(node,'rect'), css = measure(node,'css');
    if (!(box.width > 0 && box.height > 0) || css.visibility !== 'visible') return false;
    for (let current = node; current; current = current.parentElement) {
      const currentCss = measure(current,'css');
      if (current.hidden || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true' ||
          currentCss.display === 'none' || Number(currentCss.opacity) === 0) return false;
    }
    return true;
  }
  function animating(node) {
    const transform = measure(node,'css').transform;
    const transformed = transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)' &&
      transform !== 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)';
    const classes = animationClasses.filter(name => node.classList.contains(name)).join(' ');
    if (!classes) { clearSettlement(); return transformed; }
    const key = `${classes}|${signature(node)}`;
    if (settling !== key) {
      clearSettlement(); settling = key;
      // Native transitions last at most500ms. One bounded follow-up also handles
      // reduced-motion browsers that retain a class without a transition event.
      settleTimer = window.setTimeout(() => { settleTimer = 0; settled = key; schedule(); }, 650);
    }
    const active = typeof node.getAnimations === 'function' &&
      node.getAnimations().some(animation => animation.pending || animation.playState === 'running');
    return transformed || active || settled !== key;
  }
  function observeSizes(nodes) {
    const next = new Set(nodes.filter(Boolean));
    if (next.size && !sizes) sizes = new ResizeObserver(schedule);
    for (const node of resizeTargets) if (!next.has(node)) sizes.unobserve(node);
    for (const node of next) if (!resizeTargets.has(node)) sizes.observe(node);
    resizeTargets = next;
  }
  function visibilitySignature(node) {
    const css = measure(node, 'css');
    return [node.hidden, node.hasAttribute('inert'), node.getAttribute('aria-hidden'), css.display, css.visibility, css.opacity, css.transform].join('|');
  }
  function observeHostVisibility(hosts) {
    const candidates = new Set();
    for (const candidate of hosts) {
      for (let node = candidate; node; node = node.parentElement) candidates.add(node);
      // Native adoption can fade a wrapper inside the host without resizing it.
      // Follow the supported queue's bounded layout paths as well as the host's
      // ancestors, including hidden paths which must wake on an attribute reveal.
      for (const queue of candidate.querySelectorAll(panelSelector)) {
        if (queue.closest(hostSelector) !== candidate) continue;
        const list = queue.querySelector('.playlist-items');
        const roots = [queue, list,
          ...[...queue.querySelectorAll('ytd-playlist-panel-video-renderer')].slice(0, 64),
          ...[...(list?.children || [])].slice(0, 64)];
        for (const root of roots) for (let node = root; node && node !== candidate; node = node.parentElement) candidates.add(node);
      }
    }
    const next = [...candidates];
    if (next.length === visibilityAncestors.length && next.every((node,index) => node === visibilityAncestors[index])) return;
    visibilityObserver?.disconnect();
    visibilityAncestors = next;
    visibilitySignatures = new WeakMap();
    if (!next.length) return;
    // Keep these non-subtree registrations separate from the shared broker:
    // merging ancestor attributes with global child discovery would capture
    // unrelated descendant style changes throughout the page.
    visibilityObserver ||= new window.MutationObserver(() => {
      let changed = false;
      // An ancestor selector or inherited custom property can change a host
      // without changing the ancestor's own paint. Compare this scoped chain,
      // not only the attribute target; unrelated variables still schedule no fit.
      for (const node of visibilityAncestors) {
        const signature = visibilitySignature(node);
        if (signature !== visibilitySignatures.get(node)) changed = true;
        visibilitySignatures.set(node, signature);
      }
      if (changed) schedule();
    });
    for (const node of next) {
      visibilitySignatures.set(node, visibilitySignature(node));
      visibilityObserver.observe(node,{ attributes:true,
        attributeFilter:['class','style','hidden','aria-hidden','inert'] });
    }
  }
  function adopt(next) {
    if (host === next) return;
    clearOwned(); clearSettlement(); clearClickGuard(); details.disconnect(); observeSizes([]); observeHostVisibility([]);
    host?.removeEventListener('mousedown', startMain);
    host?.removeEventListener('touchstart', startMain);
    host = next; panel = null; gesture = null; released = false;
    nativeSignature = signature(host);
    if (host) details.observe(host, { subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'inert', 'collapsed', 'loading', 'is-loading', 'aria-expanded'] });
    host?.addEventListener('mousedown', startMain, { passive: true });
    host?.addEventListener('touchstart', startMain, { passive: true });
  }
  function sync() {
    frame = 0;
    if (disposed || suspended) return;
    try {
      measurements = new WeakMap();
      const hosts = [...document.querySelectorAll(hostSelector)];
      const shown = hosts.filter(visible);
      adopt(shown.length === 1 ? shown[0] : hosts.length === 1 ? hosts[0] : null);
      // Adoption can release a previous owner's geometry. Reuse measurements
      // only within this read phase, never across frames, writes or gestures.
      measurements = new WeakMap();
      observeHostVisibility(hosts);
      if (!host) { observeSizes(hosts); return; }
      nativeSignature = signature(host);
      // A stylesheet or an ancestor can reveal this host without changing any
      // of its own attributes. Keep one size observation until it is visible.
      if (!visible(host)) { release(); observeSizes(hosts); return; }
      if (gesture?.dragging || animating(host)) { release(); return; }
      released = false;
      const candidates = [...host.querySelectorAll(panelSelector)]
        .filter(node => node.closest(hostSelector) === host && visible(node));
      const nextPanel = candidates.length === 1 ? candidates[0] : null;
      if (panel !== nextPanel) {
        clearOwned(); panel = nextPanel;
        // Releasing the old fit moves bottom-anchored panels. Discard the
        // candidate geometry measured before that write, even in this frame.
        measurements = new WeakMap();
      }
      // Retained zero-size hosts can become visible without an attribute on
      // the selected host. Keep their size in the existing observation set.
      const basicTargets = [...hosts, panel];
      if (!panel || panel.matches('[collapsed], [loading], [is-loading]') ||
          host.querySelector('ytd-miniplayer-info-bar button[aria-expanded="false"]')) {
        release(); observeSizes(basicTargets); return;
      }
      const lists = [...panel.querySelectorAll('.playlist-items')].filter(visible);
      const list = lists.length === 1 ? lists[0] : null;
      const header = panel.querySelector('.header');
      const container = panel.querySelector('#container');
      const content = host.querySelector('.ytdMiniplayerComponentContent');
      const rows = list ? [...list.querySelectorAll('ytd-playlist-panel-video-renderer')]
        .filter(node => node.closest('ytd-playlist-panel-renderer') === panel) : [];
      const contents = list ? [...list.children].filter(visible) : [];
      observeSizes([...basicTargets, content, list, header, container, ...rows.slice(0, 64), ...contents.slice(0, 64)]);
      // An empty/loading or virtualised queue is not a trustworthy content extent.
      if (!list || !header || !visible(container) || !visible(content) || content.scrollTop !== 0 ||
          !rows.length || rows.length > 64 || contents.length > 64 ||
          rows.some(row => !visible(row))) { release(); return; }
      const declared = host.style.height;
      const nativeHeight = /^\d+(?:\.\d+)?px$/.test(declared) ? Number.parseFloat(declared) : NaN;
      if (!(nativeHeight > 285)) { release(); return; }
      const nativeTop = host.style.top, nativeBottom = host.style.bottom;
      const pxAnchor = value => /^\d+(?:\.\d+)?px$/.test(value);
      const unset = value => value === '' || value === 'auto';
      const south = pxAnchor(nativeBottom) && unset(nativeTop);
      if (!south && !(pxAnchor(nativeTop) && unset(nativeBottom))) { release(); return; }
      const panelBox = measure(panel,'rect'), listBox = measure(list,'rect');
      const listCss = measure(list,'css'), containerCss = measure(container,'css');
      const px = value => Number.parseFloat(value) || 0;
      // Native continuation/unavailable rows can also occupy list space. Their
      // actual extent must remain visible even though they are not video rows.
      const rowBottom = Math.max(...[...new Set([...rows, ...contents])].map(row => measure(row,'rect').bottom));
      const contentHeight = listBox.top - panelBox.top + rowBottom - listBox.top + list.scrollTop +
        px(listCss.paddingBottom) + px(listCss.borderBottomWidth) + px(containerCss.borderBottomWidth);
      const upperHeight = nativeHeight - 285;
      const maximum = measure(host,'css').maxHeight;
      if (!pxAnchor(maximum)) { release(); return; }
      const effectiveHeight = Math.min(nativeHeight, px(maximum), window.innerHeight - 32);
      const available = Math.min(285, effectiveHeight - upperHeight);
      const target = Math.min(Math.ceil(contentHeight), available);
      const minimum = listBox.top - panelBox.top + measure(rows[0],'rect').height +
        px(listCss.paddingBottom) + px(listCss.borderBottomWidth) + px(containerCss.borderBottomWidth);
      // Keep the native scrolling layout for long queues or unknown geometry.
      if (!(target > 0 && target < 284 && contentHeight > 0) || available < minimum) { release(); return; }
      const values = [[heightVar, `${upperHeight + target}px`], [panelVar, `${target}px`]];
      ensureStyle();
      for (const [name, value] of values) if (host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value);
      // Native top/bottom anchors remain authoritative as the queue grows.
      if (!host.hasAttribute(marker)) host.setAttribute(marker, '');
      if (!panel.hasAttribute(panelMarker)) panel.setAttribute(panelMarker, '');
      nativeSignature = signature(host);
    } catch (error) {
      release();
      try { reportError(error); } catch { /* Reporting must not obstruct native controls. */ }
    } finally { measurements = null; }
  }
  function schedule() {
    if (!disposed && !suspended && !frame) frame = window.requestAnimationFrame(sync);
  }
  const details = new MutationObserver(records => {
    if (records.some(record => {
      const node = record.target;
      if (node === host) return record.attributeName !== 'style' || signature(host) !== nativeSignature;
      if (record.attributeName === 'aria-expanded' && node.matches?.('ytd-miniplayer-info-bar button')) return true;
      if (node.closest?.('#movie_player')) return false;
      if (node.matches?.('.ytdMiniplayerComponentContent')) return true;
      // A hidden panel releases ownership. Observe its native structure too so
      // an attribute-only reveal can select it again without a resize/event.
      const targetPanel = node.closest?.(panelSelector);
      if (!targetPanel || targetPanel.closest(hostSelector) !== host) return false;
      return node === targetPanel || node.matches?.('.playlist-items, .header, #container, ytd-playlist-panel-video-renderer');
    })) schedule();
  });
  const discovery = new MutationObserver(records => {
    if (records.some(record => record.target === host ||
        (host?.contains(record.target) && !record.target.closest?.('#movie_player')) ||
        [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
          (node.matches?.(hostSelector) || node.querySelector?.(hostSelector))))) schedule();
  });
  discovery.observe(document.documentElement || document, { childList: true, subtree: true });
  function coordinates(event) {
    const point = event.touches?.[0] || event.changedTouches?.[0] || event;
    return Number.isFinite(point.clientX) && Number.isFinite(point.clientY)
      ? { x: point.clientX, y: point.clientY } : null;
  }
  function pointerDown(event) {
    if (!event.isTrusted) return;
    // A delayed touch compatibility mousedown is not a new pointer contact.
    if (event.type !== 'mousedown' || !clickGuard?.touch ||
        (!window.PointerEvent && !event.sourceCapabilities?.firesTouchEvents)) clearClickGuard();
  }
  function start(event, main = false) {
    pointerDown(event);
    if (!host || (event.type === 'mousedown' && event.button !== 0)) return;
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (target?.closest(hostSelector) !== host) return;
    const handle = target.closest('yt-draggable.ytdMiniplayerComponentResizer');
    if (handle?.classList.contains('ytdMiniplayerComponentResizerDisabled')) return;
    if (main ? handle || !target.closest('yt-draggable.ytdMiniplayerComponentDraggable') : !handle) return;
    const point = coordinates(event);
    if (!point) return;
    const control = target.closest('button, input, textarea, select, a, [role="button"], [role="slider"], ' +
      '.ytp-chrome-controls, .ytp-progress-bar-container, .ytp-volume-panel');
    gesture = { ...point, dragging: !!handle, trusted: event.isTrusted,
      protectClick: !handle && !control, type: event.type === 'touchstart' ? 'touch' : 'mouse' };
    if (handle) { released = true; release(); }
  }
  function startMain(event) { start(event, true); }
  function move(event) {
    if (!gesture || gesture.dragging) return;
    const point = coordinates(event);
    if (point && Math.hypot(point.x - gesture.x, point.y - gesture.y) > 5) {
      gesture.protectClick &&= gesture.trusted && event.isTrusted;
      gesture.dragging = true; released = true; release();
    }
  }
  function end(event) {
    if (gesture?.dragging && gesture.protectClick && event.isTrusted &&
        ((gesture.type === 'mouse' && event.type === 'mouseup') ||
         (gesture.type === 'touch' && event.type === 'touchend'))) {
      const point = coordinates(event);
      if (point) {
        // Native draggable capture must run first so accepted drags clear its
        // own click flag. Intercept rejected attempts before playback targets.
        const boundaries = [...host.querySelectorAll('yt-draggable.ytdMiniplayerComponentDraggable > ' +
          'ytd-miniplayer-player-container, yt-draggable.ytdMiniplayerComponentDraggable > ytd-miniplayer-info-bar')];
        clearClickGuard(); clickGuard = { ...point, host, boundaries, touch: event.type === 'touchend' };
        for (const node of boundaries) node.addEventListener('click', click, { capture: true });
        clickTimer = window.setTimeout(clearClickGuard, event.type === 'mouseup' ? 0 : 1000);
      }
    }
    if (event.type === 'touchcancel') clearClickGuard();
    if (gesture || released) { gesture = null; schedule(); }
  }
  function click(event) {
    if (!clickGuard || !event.isTrusted || event.button !== 0 || event.detail === 0) return;
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (!clickGuard.host?.contains(target) || Math.hypot(event.clientX - clickGuard.x, event.clientY - clickGuard.y) > 8) return;
    clearClickGuard(); event.preventDefault(); event.stopImmediatePropagation();
  }
  function blur(event) {
    if (event.target === window) { clearClickGuard(); gesture = null; schedule(); }
  }
  function resize(event) {
    // Layout refreshes can dispatch resize inside an animation frame. Keep the
    // fitted box until remeasurement instead of exposing native height for a
    // frame; actual viewport changes still release before native handlers run.
    if (event.isTrusted) release();
    schedule();
  }
  function lifecycle(event) {
    if (event.type === 'pagehide') pageSuspended = true;
    else if (event.type === 'pageshow') pageSuspended = false;
    suspended = pageSuspended || document.hidden;
    if (suspended) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0; gesture = null; released = false;
      clearSettlement(); clearClickGuard(); release(); observeSizes([]); observeHostVisibility([]);
    } else schedule();
  }
  function animation(event) { if (event.target === host) schedule(); }
  function scroll(event) {
    if (event.target?.matches?.('.ytdMiniplayerComponentContent') && host?.contains(event.target)) schedule();
  }
  const events = [['pointerdown', pointerDown], ['mousedown', start], ['touchstart', start], ['mousemove', move], ['touchmove', move],
    ['mouseup', end], ['touchend', end], ['touchcancel', end], ['blur', blur], ['resize', resize],
    ['transitionend', animation], ['transitioncancel', animation], ['animationend', animation], ['animationcancel', animation],
    ['pagehide', lifecycle], ['pageshow', lifecycle], ['visibilitychange', lifecycle],
    ['scroll', scroll],
    ['yt-navigate-start', clearClickGuard],
    ['yt-navigate-finish', schedule], ['yt-page-data-updated', schedule], ['yt-playlist-data-updated', schedule]];
  for (const [name, listener] of events) window.addEventListener(name, listener, { capture: true, passive: true });
  sync();
  return function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame) window.cancelAnimationFrame(frame);
    discovery.disconnect(); details.disconnect(); sizes?.disconnect();
    visibilityObserver?.disconnect(); visibilityAncestors = [];
    host?.removeEventListener('mousedown', startMain);
    host?.removeEventListener('touchstart', startMain);
    for (const [name, listener] of events) window.removeEventListener(name, listener, true);
    clearSettlement(); clearClickGuard(); clearOwned(); style?.remove(); resizeTargets.clear(); gesture = null; host = null; panel = null;
  };
}
