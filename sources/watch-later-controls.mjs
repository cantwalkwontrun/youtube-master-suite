// Language: en-GB. Local library-search and History action labelling.
// Search only filters already-rendered rows. It never edits a playlist or calls YouTube APIs.
export function installWatchLaterControls({
  document, window, MutationObserver = window.MutationObserver, ResizeObserver = window.ResizeObserver,
}) {
  const searchClass = 'ytms-library-search';
  const searchStatusClass = 'ytms-library-search-status';
  const searchAttribute = 'data-ytms-library-search';
  const searchPlacementAttribute = 'data-ytms-library-search-placement';
  const searchHiddenAttribute = 'data-ytms-watch-later-search-hidden';
  const historyLabelAttribute = 'data-ytms-history-action-labelled';
  const historyVisibleLabelAttribute = 'data-ytms-history-visible-label';
  const historyIconSlotAttribute = 'data-ytms-history-icon-slot';
  const downloadLabelAttribute = 'data-ytms-watch-later-download-labelled';
  const rowSelector = 'ytd-playlist-video-renderer,yt-lockup-view-model';
  const legacyList = 'ytd-playlist-video-list-renderer';
  const modernList = 'yt-section-list-renderer';
  const excludedPlaylist = 'ytd-miniplayer,ytd-playlist-panel-renderer,yt-playlist-panel-renderer,ytd-watch-flexy';
  const styleId = 'ytms-watch-later-controls-style';
  const labelledHistoryActions = new Map();
  const labelledDownloadActions = new Map();
  const historyActionDefinitions = [
    { label: 'Clear all watch history', pattern: /\bclear\s+(?:all\s+)?watch\s+history\b/i },
    { label: 'Pause watch history', pattern: /\bpause\s+watch\s+history\b/i },
    { label: 'Resume watch history', pattern: /\bresume\s+watch\s+history\b/i, group: 'Pause watch history' },
    { label: 'Manage all history', pattern: /\bmanage\s+(?:all\s+)?history\b/i },
  ];
  let searchRecord = null;
  let searchFrame = 0;
  let reconcileFrame = 0;
  let retryTimer = 0;
  let retryCount = 0;
  let retryGeneration = 0;
  let disposed = false;
  let navigating = false;
  let pageHidden = false;
  let historyActionsObserver = null;
  let observedHistoryActions = null;

  const text = value => String(value?.textContent ?? value ?? '').replace(/\s+/g, ' ').trim();
  // YouTube can keep an action's native label in the DOM while hiding it
  // during a renderer transition. Use rendered text for this decision so a
  // fallback is present in that state without duplicating a visible label.
  const visibleText = value => String(value?.innerText ?? '').replace(/\s+/g, ' ').trim();
  const normalise = value => text(value).normalize('NFKC').toLowerCase();
  const active = () => !disposed && !navigating && !pageHidden && !document.hidden;

  function libraryRoute() {
    try {
      if (window.location.pathname !== '/playlist') return null;
      const list = new window.URLSearchParams(window.location.search).get('list');
      if (list === 'WL') return {
        key: 'watch-later', label: 'Watch Later', searchId: 'ytms-watch-later-search',
      };
      if (list === 'LL') return {
        key: 'liked-videos', label: 'Liked videos', searchId: 'ytms-liked-videos-search',
      };
    } catch {
      // A transient route read is treated as an unsupported page and retried.
    }
    return null;
  }

  function isWatchLaterRoute() {
    return libraryRoute()?.key === 'watch-later';
  }

  function sameLibraryRoute(route) {
    return Boolean(route) && libraryRoute()?.key === route.key;
  }

  function isHistoryRoute() {
    return window.location.pathname === '/feed/history';
  }

  function addStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      [${searchHiddenAttribute}="1"] { display:none !important; }
      .${searchClass}[${searchAttribute}="1"] {
        display:flex !important;
        align-items:center !important;
        box-sizing:border-box !important;
        width:min(100%, 540px) !important;
        min-height:40px !important;
        margin:0 0 16px !important;
        border-bottom:1px solid var(--yt-spec-10-percent-layer, #717171) !important;
        color:var(--yt-spec-text-primary, #f1f1f1) !important;
        font:400 14px/20px Roboto, Arial, sans-serif !important;
      }
      .${searchClass}[${searchAttribute}="1"]:focus-within { border-bottom-color:var(--yt-spec-call-to-action, #3ea6ff) !important; }
      .${searchClass}[${searchAttribute}="1"] svg { flex:0 0 auto !important; width:24px !important; height:24px !important; margin:0 12px 0 2px !important; fill:currentColor !important; }
      .${searchClass}[${searchAttribute}="1"] input {
        min-width:0 !important;
        flex:1 1 auto !important;
        border:0 !important;
        outline:0 !important;
        background:transparent !important;
        color:inherit !important;
        font:inherit !important;
      }
      .${searchClass}[${searchAttribute}="1"] input::placeholder { color:var(--yt-spec-text-secondary, #aaa) !important; opacity:1 !important; }
      .${searchClass}[${searchAttribute}="1"] button {
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        width:32px !important;
        height:32px !important;
        margin-inline-start:8px !important;
        padding:0 !important;
        border:0 !important;
        border-radius:50% !important;
        background:transparent !important;
        color:inherit !important;
        cursor:pointer !important;
      }
      .${searchClass}[${searchAttribute}="1"] button:hover { background:var(--yt-spec-10-percent-layer, rgba(255,255,255,.1)) !important; }
      .${searchClass}[${searchAttribute}="1"] button svg { width:20px !important; height:20px !important; margin:0 !important; }
      .${searchStatusClass} {
        display:block !important;
        margin:0 0 16px !important;
        color:var(--yt-spec-text-secondary, #aaa) !important;
        font:400 14px/20px Roboto, Arial, sans-serif !important;
      }
      .${searchClass}[${searchAttribute}="1"] button[hidden],
      .${searchStatusClass}[hidden] { display:none !important; }
      [${historyLabelAttribute}="1"] :is(button, a) {
        display:inline-flex !important;
        align-items:center !important;
        justify-content:flex-start !important;
        box-sizing:border-box !important;
        width:auto !important;
        min-width:0 !important;
        min-height:36px !important;
        margin:0 !important;
        padding:0 8px !important;
        border:0 !important;
        text-decoration:none !important;
        gap:12px !important;
        white-space:nowrap !important;
      }
      /* YouTube currently uses more than one native icon host here. Give each
         host the same slot so an icon-specific inline margin cannot move the
         glyph while leaving its action label in place. */
      [${historyLabelAttribute}="1"] :is(button, a) [${historyIconSlotAttribute}="1"] {
        display:grid !important;
        place-items:center !important;
        flex:0 0 24px !important;
        box-sizing:border-box !important;
        width:24px !important;
        min-width:24px !important;
        height:24px !important;
        margin:0 !important;
        line-height:0 !important;
      }
      [${historyLabelAttribute}="1"] :is(button, a) [${historyIconSlotAttribute}="1"]
        :is([data-ytms-history-action-icon], yt-icon, yt-icon-shape, svg) {
        margin:0 !important;
      }
      /* A few renderer variants insert an unlabelled span or div between the
         slot and glyph. Its inline spacing must not offset only one action. */
      [${historyLabelAttribute}="1"] :is(button, a) [${historyIconSlotAttribute}="1"] > :is(span, div, yt-icon, yt-icon-shape, svg) {
        margin:0 !important;
        padding:0 !important;
      }
      :is(button, a)[${historyVisibleLabelAttribute}]::after {
        content:attr(${historyVisibleLabelAttribute}) !important;
        display:block !important;
        color:var(--yt-spec-text-primary, #f1f1f1) !important;
        font:500 14px/20px Roboto, Arial, sans-serif !important;
        pointer-events:none !important;
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  function createIcon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
  }

  function clearAttribute(record, name, applied) {
    if (record.element.getAttribute(name) !== applied) return;
    if (record.previous === null) record.element.removeAttribute(name);
    else record.element.setAttribute(name, record.previous);
  }

  function releaseLabelledActions(records, marker) {
    for (const record of records.values()) {
      clearAttribute(record.title, 'title', record.title.applied);
      clearAttribute(record.aria, 'aria-label', record.aria.applied);
      if (record.visibleLabel) clearAttribute(record.visibleLabel, historyVisibleLabelAttribute, record.visibleLabel.applied);
      if (record.iconSlot) clearAttribute(record.iconSlot, historyIconSlotAttribute, record.iconSlot.applied);
      if (record.host.getAttribute(marker) === '1') record.host.removeAttribute(marker);
    }
    records.clear();
  }

  function describeAction(host, button, label, records, marker) {
    let record = records.get(button);
    if (!record) {
      record = {
        host,
        button,
        title: { element: button, previous: button.getAttribute('title'), applied: label },
        aria: { element: button, previous: button.getAttribute('aria-label'), applied: label },
      };
      records.set(button, record);
    }
    if (record.host !== host && record.host.getAttribute(marker) === '1') record.host.removeAttribute(marker);
    record.host = host;
    for (const [name, tracking] of [['title', record.title], ['aria-label', record.aria]]) {
      const current = button.getAttribute(name);
      if (current !== tracking.applied) tracking.previous = current;
    }
    if (button.getAttribute('title') !== label) button.setAttribute('title', label);
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    record.title.applied = label;
    record.aria.applied = label;
    if (host.getAttribute(marker) !== '1') host.setAttribute(marker, '1');
  }

  function describeHistoryVisibleLabel(record, definition) {
    if (!record.visibleLabel) {
      record.visibleLabel = {
        element: record.button,
        previous: record.button.getAttribute(historyVisibleLabelAttribute),
        applied: null,
      };
    }
    const visibleLabel = record.visibleLabel;
    const applied = definition.pattern.test(visibleText(record.host)) ? null : definition.label;
    if (visibleLabel.applied === applied && (applied === null ||
        visibleLabel.element.getAttribute(historyVisibleLabelAttribute) === applied)) return;
    if (applied === null) {
      if (visibleLabel.element.getAttribute(historyVisibleLabelAttribute) === visibleLabel.applied) {
        if (visibleLabel.previous === null) visibleLabel.element.removeAttribute(historyVisibleLabelAttribute);
        else visibleLabel.element.setAttribute(historyVisibleLabelAttribute, visibleLabel.previous);
      }
    } else {
      visibleLabel.element.setAttribute(historyVisibleLabelAttribute, applied);
    }
    visibleLabel.applied = applied;
  }

  function visibleHistoryIcon(node) {
    if (!visibleNode(node)) return false;
    const rect = node.getBoundingClientRect?.();
    if (rect?.width > 0 && rect.height > 0) return true;
    return [...node.querySelectorAll('*')].some(child => {
      if (!visibleNode(child)) return false;
      const childRect = child.getBoundingClientRect?.();
      return childRect?.width > 0 && childRect.height > 0;
    });
  }

  function historyIconSlot(button, definition) {
    const selectors = [
      '[data-ytms-history-action-icon]',
      '.yt-spec-button-shape-next__icon',
      '.ytIconWrapperHost',
      '[id="icon"]',
      'yt-icon',
      'yt-icon-shape',
      'svg',
    ];
    for (const selector of selectors) {
      const icon = [...button.querySelectorAll(selector)].find(node =>
        node.closest('button,a') === button && visibleHistoryIcon(node));
      if (!icon) continue;
      // Prefer the visual icon's direct button child. This normalises wrappers
      // used by both the older and current History renderer without touching
      // the sibling that holds the native action label.
      const slot = [...button.children].find(child =>
        child.contains(icon) && !definition.pattern.test(visibleText(child)));
      return slot || icon;
    }
    return null;
  }

  function describeHistoryIconSlot(record, definition) {
    const element = historyIconSlot(record.button, definition);
    if (record.iconSlot?.element === element) {
      if (element?.getAttribute(historyIconSlotAttribute) !== '1') element?.setAttribute(historyIconSlotAttribute, '1');
      return;
    }
    if (record.iconSlot) clearAttribute(record.iconSlot, historyIconSlotAttribute, record.iconSlot.applied);
    record.iconSlot = null;
    if (!element) return;
    record.iconSlot = {
      element,
      previous: element.getAttribute(historyIconSlotAttribute),
      applied: '1',
    };
    element.setAttribute(historyIconSlotAttribute, '1');
  }

  function historyActions() {
    const selector = 'ytd-two-column-browse-results-renderer #secondary ytd-browse-feed-actions-renderer > #contents';
    const candidates = new Map(historyActionDefinitions.map(definition => [definition.group || definition.label, []]));
    // Hidden browse roots may be retained through SPA navigation. Scope the
    // lookup to the active root so an old copy cannot make an action ambiguous.
    const browse = activeBrowse();
    if (!browse) return [];
    for (const container of browse.querySelectorAll(selector)) {
      for (const host of container.children) {
        const controls = host.matches('button,a') ? [host] : [...host.querySelectorAll('button,a')];
        if (controls.length !== 1) continue;
        const button = controls[0];
        const record = labelledHistoryActions.get(button);
        const native = (name, tracking) => {
          const value = button.getAttribute(name);
          return tracking && value === tracking.applied ? tracking.previous : value;
        };
        const labels = [visibleText(button), native('aria-label', record?.aria), button.getAttribute('data-tooltip-text'),
          host === button ? null : host.getAttribute('aria-label'), native('title', record?.title), text(button)];
        const definition = labels.map(label => label && historyActionDefinitions.find(action => action.pattern.test(label))).find(Boolean);
        if (definition) candidates.get(definition.group || definition.label).push({ host, button, definition });
      }
    }
    return [...candidates.values()].flatMap(matches => matches.length === 1 ? matches : []);
  }

  function releaseHistoryActionsObserver() {
    historyActionsObserver?.disconnect();
    historyActionsObserver = null;
    observedHistoryActions = null;
  }

  function observeHistoryActions() {
    if (typeof MutationObserver !== 'function' || !isHistoryRoute() || !active()) {
      releaseHistoryActionsObserver();
      return;
    }
    const browse = activeBrowse();
    const contents = browse?.querySelector(
      'ytd-two-column-browse-results-renderer #secondary ytd-browse-feed-actions-renderer > #contents',
    ) || null;
    if (contents === observedHistoryActions) return;
    releaseHistoryActionsObserver();
    if (!contents) return;
    observedHistoryActions = contents;
    historyActionsObserver = new MutationObserver(records => {
      if (!active() || !isHistoryRoute() || contents !== observedHistoryActions) return;
      if (records.some(record => record.type === 'childList' || record.type === 'characterData' || record.type === 'attributes')) {
        scheduleReconcile();
      }
    });
    historyActionsObserver.observe(contents, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'hidden', 'inert', 'style', 'class'],
    });
  }

  function reconcileHistoryLabel() {
    const found = new Set();
    if (isHistoryRoute()) {
      for (const action of historyActions()) {
        found.add(action.button);
        describeAction(action.host, action.button, action.definition.label, labelledHistoryActions, historyLabelAttribute);
        const record = labelledHistoryActions.get(action.button);
        describeHistoryVisibleLabel(record, action.definition);
        describeHistoryIconSlot(record, action.definition);
      }
    }
    for (const [button, record] of labelledHistoryActions) {
      if (found.has(button)) continue;
      clearAttribute(record.title, 'title', record.title.applied);
      clearAttribute(record.aria, 'aria-label', record.aria.applied);
      if (record.visibleLabel) clearAttribute(record.visibleLabel, historyVisibleLabelAttribute, record.visibleLabel.applied);
      if (record.iconSlot) clearAttribute(record.iconSlot, historyIconSlotAttribute, record.iconSlot.applied);
      if (record.host.getAttribute(historyLabelAttribute) === '1') record.host.removeAttribute(historyLabelAttribute);
      labelledHistoryActions.delete(button);
    }
  }

  function downloadAction() {
    const header = activeBrowse()?.querySelector('ytd-playlist-header-renderer');
    if (!header || header.closest('ytd-miniplayer,ytd-watch-flexy')) return null;
    const matches = [...header.querySelectorAll('button')].filter(button => {
      const host = button.closest('ytd-button-renderer,yt-button-view-model,button-view-model') || button;
      const label = [button, host].flatMap(node => [node.getAttribute('aria-label'), node.getAttribute('title'),
        node.getAttribute('data-tooltip-text'), node.id, node.className, text(node)]).join(' ');
      return /\bdownload\b/i.test(label);
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function reconcileDownloadLabel() {
    const found = new Set();
    if (isWatchLaterRoute()) {
      const button = downloadAction();
      if (button) {
        found.add(button);
        const host = button.closest('ytd-button-renderer,yt-button-view-model,button-view-model') || button;
        describeAction(host, button, 'Download Watch Later', labelledDownloadActions, downloadLabelAttribute);
      }
    }
    for (const [button, record] of labelledDownloadActions) {
      if (found.has(button)) continue;
      clearAttribute(record.title, 'title', record.title.applied);
      clearAttribute(record.aria, 'aria-label', record.aria.applied);
      if (record.host.getAttribute(downloadLabelAttribute) === '1') record.host.removeAttribute(downloadLabelAttribute);
      labelledDownloadActions.delete(button);
    }
  }

  function listRoot() {
    const browse = activeBrowse();
    if (!browse) return null;
    const candidates = [...browse.querySelectorAll(legacyList)].filter(list => visibleNode(list) && !list.closest(excludedPlaylist));
    if (candidates.length > 1) return null;
    if (candidates.length === 1) {
      const list = candidates[0], contents = list.querySelector(':scope > #contents') || list.querySelector('#contents');
      return contents ? { list, contents, modern: false } : null;
    }
    const modern = [...browse.querySelectorAll('ytd-two-column-browse-results-renderer > #primary > ' + modernList)]
      .filter(list => visibleNode(list) && !list.closest(excludedPlaylist) &&
        [...list.querySelectorAll('yt-item-section-renderer yt-lockup-view-model')].some(isVideoLockup));
    return modern.length === 1 ? { list: modern[0], contents: modern[0], modern: true } : null;
  }

  function searchHost(root) {
    const browse = activeBrowse();
    const secondary = browse?.querySelector('ytd-two-column-browse-results-renderer > #secondary');
    const rect = secondary?.getBoundingClientRect?.();
    const usableSecondary = visibleNode(secondary) && (!rect || rect.width >= 120);
    if (usableSecondary && !secondary.contains(root.list) &&
        !secondary.closest('ytd-miniplayer,ytd-playlist-panel-renderer,yt-playlist-panel-renderer,ytd-watch-flexy')) {
      return { host: secondary, before: secondary.firstChild, placement: 'sidebar' };
    }
    const host = root.list.parentElement;
    return host ? { host, before: root.list, placement: 'list' } : null;
  }

  function activeBrowse() {
    const candidates = [...document.querySelectorAll('ytd-browse')].filter(visibleNode);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function visibleNode(node) {
    if (!node?.isConnected || node.closest('[hidden],[inert]')) return false;
    const style = window.getComputedStyle?.(node);
    return !style || (style.display !== 'none' && style.visibility !== 'hidden');
  }

  function rows(record) {
    return [...record.contents.querySelectorAll(rowSelector)].filter(row => {
      if (record.modern) return row.closest(modernList) === record.list &&
        row.closest('yt-item-section-renderer') && !row.closest(excludedPlaylist) && isVideoLockup(row);
      if (row.closest(legacyList) !== record.list) return false;
      return !row.matches('yt-lockup-view-model') || !row.closest('ytd-playlist-video-renderer');
    });
  }

  function isVideoLockup(row) {
    return row.matches('yt-lockup-view-model') && Boolean(row.querySelector('a[href^="/watch?v="], a[href^="/shorts/"], a[href^="/live/"]'));
  }

  function rowSearchText(row) {
    const selectors = [
      '#video-title', '.yt-lockup-metadata-view-model__title', '.ytLockupMetadataViewModelTitle',
      '#byline a', '#channel-name a', 'ytd-channel-name',
      '.yt-content-metadata-view-model__metadata-row', '.ytContentMetadataViewModelMetadataRow',
    ].join(',');
    const fields = [...row.querySelectorAll(selectors)].map(text).filter(Boolean);
    const value = fields.length ? fields.join(' ') : `${row.getAttribute('aria-label') || ''} ${text(row)}`;
    return normalise(value).slice(0, 16384);
  }

  function applySearch(record) {
    if (!record || searchRecord !== record || !record.ui.isConnected || !active() || !sameLibraryRoute(record.route)) return;
    const query = normalise(record.input.value);
    let noMatches = false;
    if (query) {
      const loaded = rows(record);
      const hidden = new Set();
      for (const row of loaded) {
        if (rowSearchText(row).includes(query)) continue;
        hidden.add(row);
        if (row.getAttribute(searchHiddenAttribute) !== '1') row.setAttribute(searchHiddenAttribute, '1');
      }
      // YouTube can move a row out of the playlist while retaining its node.
      for (const row of record.hiddenRows) {
        if (!hidden.has(row)) row.removeAttribute(searchHiddenAttribute);
      }
      record.hiddenRows = hidden;
      noMatches = loaded.length > 0 && hidden.size === loaded.length;
    } else {
      clearRows(record);
    }
    const statusHidden = !noMatches;
    if (record.status.hidden !== statusHidden) {
      record.status.textContent = noMatches ? `No loaded ${record.route.label} videos match your search.` : '';
      record.status.hidden = statusHidden;
    }
    record.clear.hidden = !query;
  }

  function scheduleSearch() {
    if (!active() || !searchRecord || searchFrame) return;
    searchFrame = window.requestAnimationFrame(() => {
      searchFrame = 0;
      applySearch(searchRecord);
    });
  }

  function clearRows(record) {
    for (const row of record.hiddenRows) row.removeAttribute(searchHiddenAttribute);
    record.hiddenRows.clear();
  }

  function releaseSearch() {
    if (searchFrame) window.cancelAnimationFrame(searchFrame);
    searchFrame = 0;
    const record = searchRecord;
    searchRecord = null;
    if (!record) return;
    record.observer?.disconnect();
    record.surfaceObserver?.disconnect();
    record.secondaryObserver?.disconnect();
    record.secondaryResizeObserver?.disconnect();
    clearRows(record);
    record.status.remove();
    record.ui.remove();
  }

  function observeSearchSurface(record) {
    if (typeof MutationObserver !== 'function') return;
    const columns = activeBrowse()?.querySelector('ytd-two-column-browse-results-renderer');
    if (record.columns !== columns) {
      record.surfaceObserver?.disconnect();
      record.columns = columns || null;
      record.surfaceObserver = null;
      if (columns) {
        record.surfaceObserver = new MutationObserver(records => {
          if (!active() || searchRecord !== record || !sameLibraryRoute(record.route)) return;
          if (records.some(change => change.type === 'childList')) scheduleReconcile();
        });
        record.surfaceObserver.observe(columns, { childList: true });
      }
    }
    const secondary = columns?.querySelector(':scope > #secondary') || null;
    if (record.secondary === secondary) return;
    record.secondaryObserver?.disconnect();
    record.secondaryResizeObserver?.disconnect();
    record.secondary = secondary;
    record.secondaryObserver = null;
    record.secondaryResizeObserver = null;
    if (secondary) {
      record.secondaryObserver = new MutationObserver(records => {
        if (!active() || searchRecord !== record || !sameLibraryRoute(record.route)) return;
        if (records.some(change => change.type === 'attributes')) scheduleReconcile();
      });
      record.secondaryObserver.observe(secondary, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'inert', 'style'],
      });
      if (typeof ResizeObserver === 'function') {
        record.secondaryResizeObserver = new ResizeObserver(() => {
          if (active() && searchRecord === record && sameLibraryRoute(record.route)) scheduleReconcile();
        });
        record.secondaryResizeObserver.observe(secondary);
      }
    }
  }

  function createSearch(root, route, target, initialQuery = '', restoreFocus = null) {
    const ui = document.createElement('form');
    ui.id = route.searchId;
    ui.className = searchClass;
    ui.lang = 'en-GB';
    ui.setAttribute(searchAttribute, '1');
    ui.setAttribute(searchPlacementAttribute, target.placement);
    ui.setAttribute('role', 'search');
    ui.setAttribute('aria-label', `Search ${route.label}`);
    const input = document.createElement('input');
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = `Search ${route.label}`;
    input.setAttribute('aria-label', `Search ${route.label}`);
    input.value = initialQuery;
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.hidden = true;
    clear.title = `Clear ${route.label} search`;
    clear.setAttribute('aria-label', `Clear ${route.label} search`);
    clear.append(createIcon('M18.3 5.71 16.89 4.29 12 9.17 7.11 4.29 5.7 5.71 10.59 10.59 5.7 15.48 7.11 16.9 12 12 16.89 16.9 18.3 15.48 13.41 10.59z'));
    ui.append(createIcon('M9.5 3a6.5 6.5 0 1 0 4.02 11.61l4.43 4.43 1.41-1.41-4.43-4.43A6.5 6.5 0 0 0 9.5 3m0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9'));
    ui.append(input, clear);
    const status = document.createElement('p');
    status.id = `${route.searchId}-status`;
    status.className = searchStatusClass;
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    target.host.insertBefore(ui, target.before);
    target.host.insertBefore(status, ui.nextSibling);
    if (!ui.isConnected || !status.isConnected) {
      ui.remove();
      status.remove();
      return null;
    }
    const record = {
      ...root, ...target, route, ui, input, clear, status,
      hiddenRows: new Set(),
      observer: null, columns: null, secondary: null, surfaceObserver: null,
      secondaryObserver: null, secondaryResizeObserver: null,
    };
    ui.addEventListener('submit', event => event.preventDefault());
    input.addEventListener('input', scheduleSearch);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !input.value) return;
      event.preventDefault();
      input.value = '';
      scheduleSearch();
    });
    clear.addEventListener('click', () => {
      input.value = '';
      input.focus({ preventScroll: true });
      scheduleSearch();
    });
    if (typeof MutationObserver === 'function') {
      record.observer = new MutationObserver(records => {
        if (!active() || searchRecord !== record || !sameLibraryRoute(record.route)) return;
        if (record.input.value && records.some(change => change.type !== 'childList' ||
            change.addedNodes.length || change.removedNodes.length)) scheduleSearch();
      });
      record.observer.observe(root.contents, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['aria-label', 'href'] });
    }
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        if (!active() || searchRecord !== record || !sameLibraryRoute(record.route) || !input.isConnected) return;
        input.focus({ preventScroll: true });
        try {
          input.setSelectionRange(restoreFocus.start, restoreFocus.end, restoreFocus.direction);
        } catch {
          // Search inputs may reject a selection while the native page is restoring focus.
        }
      });
    }
    return record;
  }

  function reconcileSearch() {
    const route = libraryRoute();
    if (!route || !active()) {
      releaseSearch();
      return;
    }
    const root = listRoot();
    const target = root && searchHost(root);
    if (!root || !target) {
      releaseSearch();
      return;
    }
    if (searchRecord && (searchRecord.list !== root.list || searchRecord.contents !== root.contents ||
        searchRecord.route.key !== route.key || searchRecord.host !== target.host || !searchRecord.ui.isConnected)) {
      const retainFilter = searchRecord.list === root.list && searchRecord.contents === root.contents &&
        searchRecord.route.key === route.key;
      const query = retainFilter ? searchRecord.input.value : '';
      const restoreFocus = retainFilter && document.activeElement === searchRecord.input
        ? {
          start: searchRecord.input.selectionStart ?? query.length,
          end: searchRecord.input.selectionEnd ?? query.length,
          direction: searchRecord.input.selectionDirection || 'none',
        }
        : null;
      releaseSearch();
      searchRecord = createSearch(root, route, target, query, restoreFocus);
    }
    if (!searchRecord) searchRecord = createSearch(root, route, target);
    if (searchRecord) {
      observeSearchSurface(searchRecord);
      applySearch(searchRecord);
    }
  }

  function reconcile() {
    if (disposed) return;
    reconcileHistoryLabel();
    observeHistoryActions();
    reconcileDownloadLabel();
    reconcileSearch();
    if ((libraryRoute() && !searchRecord) ||
        (isHistoryRoute() && labelledHistoryActions.size < 3)) scheduleRetry();
    else cancelRetry();
  }

  function scheduleReconcile() {
    if (!active() || reconcileFrame) return;
    reconcileFrame = window.requestAnimationFrame(() => {
      reconcileFrame = 0;
      reconcile();
    });
  }

  function cancelRetry() {
    retryGeneration++;
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = 0;
    retryCount = 0;
  }

  function scheduleRetry() {
    if (!active() || retryTimer || retryCount >= 4) return;
    const delays = [80, 220, 600, 1400];
    const generation = retryGeneration;
    const delay = delays[retryCount++];
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      if (generation !== retryGeneration || !active()) return;
      scheduleReconcile();
    }, delay);
  }

  function suspend() {
    navigating = true;
    if (reconcileFrame) window.cancelAnimationFrame(reconcileFrame);
    reconcileFrame = 0;
    cancelRetry();
    releaseSearch();
    releaseHistoryActionsObserver();
    releaseLabelledActions(labelledHistoryActions, historyLabelAttribute);
    releaseLabelledActions(labelledDownloadActions, downloadLabelAttribute);
  }

  function resume() {
    navigating = false;
    pageHidden = false;
    cancelRetry();
    scheduleReconcile();
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (searchFrame) window.cancelAnimationFrame(searchFrame);
      if (reconcileFrame) window.cancelAnimationFrame(reconcileFrame);
      searchFrame = reconcileFrame = 0;
      cancelRetry();
    } else scheduleReconcile();
  }

  function handleRendererStamped(event) {
    if (!active() || !libraryRoute()) return;
    const target = event?.target;
    if (!target?.closest) return;
    const stampedList = target.matches?.('ytd-playlist-video-list-renderer')
      ? target
      : target.closest('ytd-playlist-video-list-renderer');
    if (!stampedList) return;
    if (listRoot()?.list === stampedList) scheduleReconcile();
  }

  addStyle();
  const listeners = [
    ['yt-navigate-start', suspend],
    ['yt-navigate-finish', resume],
    ['yt-page-data-updated', scheduleReconcile],
    ['yt-playlist-data-updated', scheduleReconcile],
    ['pagehide', () => { pageHidden = true; suspend(); }],
    ['pageshow', resume],
    ['visibilitychange', handleVisibilityChange],
    ['yt-rendererstamper-finished', handleRendererStamped],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  reconcile();

  return () => {
    disposed = true;
    if (reconcileFrame) window.cancelAnimationFrame(reconcileFrame);
    reconcileFrame = 0;
    cancelRetry();
    releaseSearch();
    releaseHistoryActionsObserver();
    releaseLabelledActions(labelledHistoryActions, historyLabelAttribute);
    releaseLabelledActions(labelledDownloadActions, downloadLabelAttribute);
    document.getElementById(styleId)?.remove();
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
  };
}
