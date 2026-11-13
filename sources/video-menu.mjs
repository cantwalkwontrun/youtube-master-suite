/** Customise recognised video-card menus without replacing native action handlers.
 * Unknown action rows stay native; an unrecognised model/layout is left untouched.
 */
export function installVideoMenu(suite) {
  const preferences = suite.settings.initial;
  const cardSelector = 'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer, ytd-watch-metadata, ytd-video-primary-info-renderer';
  const popupSelector = 'ytd-menu-popup-renderer, yt-sheet-view-model';
  const rowSelector = 'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, ytd-menu-service-item-download-renderer, yt-list-item-view-model, yt-download-list-item-view-model';
  const defaultOrder = ['playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'download', 'hype', 'share', 'notInterested', 'channelAge', 'dontRecommend', 'report', 'channelTools'];
  const order = [...new Set([...(Array.isArray(preferences.menuItemOrder) ? preferences.menuItemOrder.filter(id => defaultOrder.includes(id)) : []), ...defaultOrder])];
  const legacyVisible = id => id === 'download' ? preferences.menuShowDownload === true :
    id === 'hype' ? preferences.menuShowHype !== false :
    id === 'channelAge' ? preferences.menuShowAgeLimit !== false :
    id === 'notInterested' ? preferences.menuShowNotInterested !== false :
    id === 'dontRecommend' ? preferences.menuShowDontRecommend !== false :
    id === 'report' ? preferences.menuShowReport !== false : true;
  let layout;
  try { layout = suite.menuLayout?.fromPreferences(preferences); } catch { /* A missing helper retains the legacy layout. */ }
  if (!layout) layout = { version:1, nodes:order.map(id => id === 'channelTools'
    ? { id, name:'Channel tools', parent:'root' }
    : { id, parent:preferences.menuGroupChannelTools !== false && ['channelAge','dontRecommend','report'].includes(id) ? 'channelTools' : 'root', visible:legacyVisible(id) }) };
  const layoutNodes = layout.nodes;
  const layoutById = new Map(layoutNodes.map(node => [node.id,node]));
  const rank = id => layoutNodes.findIndex(node => node.id === id);
  const creatorPage = '@creators';
  const nextPath = 'M9 5l7 7-7 7-1.4-1.4 5.6-5.6-5.6-5.6L9 5z';
  const controller = element => element?.polymerController || element?.getPolymerController?.() || element;
  let trigger = null;
  let active = null;
  let waiting = null;
  let firstFrame = 0;
  let secondFrame = 0;
  let refitFrame = 0;
  let style = null;
  let disposed = false;
  let triggerReason = 'missing-trigger';
  const pendingIcons = new Set();
  let pendingIconObserver = null;
  const compatibilityStates = {
    idle: 'not-checked', disposed: 'not-checked', ready: 'recognised',
    'missing-trigger': 'not-applicable',
    'captured-trigger': 'awaiting-menu', 'waiting-for-menu': 'awaiting-menu', 'waiting-for-visible-popup': 'awaiting-menu',
    'unavailable-model': 'loading-menu', 'unsupported-model': 'loading-menu', 'row-count': 'loading-menu', 'row-binding': 'loading-menu',
  };

  function compatibility(status) {
    const root = document.documentElement;
    if (root?.getAttribute?.('data-ytms-video-menu-compatibility') !== status) root?.setAttribute?.('data-ytms-video-menu-compatibility', status);
  }

  function diagnostic(reason) {
    // Fixed reason codes only: never expose titles, channel IDs, URLs or account data.
    const root = document.documentElement;
    if (root?.getAttribute?.('data-ytms-video-menu-status') !== reason) root?.setAttribute?.('data-ytms-video-menu-status', reason);
    compatibility(compatibilityStates[reason] || 'unsupported');
    return false;
  }

  function endpointFor(item) {
    const model = item?.menuServiceItemRenderer || item?.menuNavigationItemRenderer || item?.menuServiceItemDownloadRenderer || item?.listItemViewModel;
    return model?.serviceEndpoint || model?.navigationEndpoint || model?.rendererContext?.commandContext?.onTap?.innertubeCommand;
  }

  function queuedVideoId(item) {
    const actions = endpointFor(item)?.signalServiceEndpoint?.actions;
    if (!Array.isArray(actions) || actions.length !== 1) return null;
    const command = actions[0]?.addToPlaylistCommand;
    const ids = command?.videoIds || [command?.videoId];
    return command?.listType === 'PLAYLIST_EDIT_LIST_TYPE_QUEUE' && Array.isArray(ids) && ids.length === 1 &&
      typeof ids[0] === 'string' && /^[\w-]{11}$/.test(ids[0]) &&
      (command.videoId === undefined || command.videoId === ids[0]) ? ids[0] : null;
  }

  function identify(item, selection) {
    if (item?.downloadListItemViewModel) return 'download';
    const model = item?.menuServiceItemRenderer || item?.menuNavigationItemRenderer || item?.menuServiceItemDownloadRenderer || item?.listItemViewModel;
    const icon = String(model?.icon?.iconType || model?.leadingImage?.sources?.[0]?.clientResource?.imageName || '').toUpperCase();
    // BlockTube's menu commands deliberately reuse YouTube's NOT_INTERESTED
    // icon (and can clone its endpoint). Its current model uses these exact
    // English titles; older models also expose an explicit action marker.
    // Keep such rows as unknown native actions, preserving their handlers and
    // their slots; never relax the duplicate guard for actual YouTube actions.
    const title = typeof model?.title?.content === 'string' ? model.title.content :
      typeof model?.text?.simpleText === 'string' ? model.text.simpleText :
        Array.isArray(model?.text?.runs) ? model.text.runs.map(run => typeof run?.text === 'string' ? run.text : '').join('') : '';
    if (['block_channel', 'block_video'].includes(model?._btMenuAction) ||
        (icon === 'NOT_INTERESTED' && ['Block Channel', 'Block Video'].includes(title))) return null;
    if (['QUEUE_PLAY_NEXT', 'ADD_TO_QUEUE_HEAD'].includes(icon) || model?.targetId === 'yt-master-play-next') return 'playNext';
    if (queuedVideoId(item)) return 'addToQueue';
    if (['WATCH_LATER', 'WATCH_LATER_OUTLINE'].includes(icon)) return 'watchLater';
    if (['PLAYLIST_ADD', 'ADD_TO_PLAYLIST', 'PLAYLIST_ADD_OUTLINE', 'BOOKMARK_BORDER'].includes(icon)) return 'savePlaylist';
    if (['DOWNLOAD', 'OFFLINE_DOWNLOAD', 'FILE_DOWNLOAD'].includes(icon) || item?.menuServiceItemDownloadRenderer) return 'download';
    if (['HYPE', 'HYPE_OUTLINE'].includes(icon) || title === 'Hype') return 'hype';
    if (['SHARE', 'SHARE_OUTLINE'].includes(icon)) return 'share';
    const library = location.pathname === '/feed/history' || location.pathname === '/playlist' ||
      selection.card.matches('ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer');
    if (['NOT_INTERESTED', 'NOT_INTERESTED_OUTLINE'].includes(icon) || (!library && icon === 'HIDE')) return 'notInterested';
    if (icon === 'DONT_RECOMMEND_CHANNEL' || (!library && ['REMOVE', 'DO_NOT_DISTURB_ON', 'BLOCK'].includes(icon) && endpointFor(item)?.feedbackEndpoint)) return 'dontRecommend';
    if (['FLAG', 'FLAG_OUTLINE', 'REPORT'].includes(icon)) return 'report';
    return null; // Unrecognised actions retain their native position and behaviour.
  }

  function watchVideoId(card) {
    // Description links do not identify the playing video. Bind watch menus
    // only to the rendered owner and its current player, agreeing with the URL.
    const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') :
      /^\/live\/([\w-]{11})\/?$/.exec(location.pathname)?.[1];
    const owner = card.closest('ytd-watch-flexy');
    if (!owner || !/^[\w-]{11}$/.test(id || '')) return null;
    const visible = (node, ownerOnly = false) => {
      if (!node?.isConnected || node.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const box = node.getBoundingClientRect();
      if (!(box.width > 0 && (ownerOnly === true || box.height > 0))) return false;
      for (let current = node; current; current = current.parentElement) {
        const css = getComputedStyle(current);
        if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) return false;
      }
      return true;
    };
    try {
      if (!visible(owner, true) || !visible(card) || (owner.getAttribute('video-id') && owner.getAttribute('video-id') !== id)) return null;
      const model = typeof card.componentProps?.data === 'function' ? card.componentProps.data() : controller(card)?.data;
      if (model?.videoId && model.videoId !== id) return null;
      const players = [...owner.querySelectorAll('#movie_player')].filter(player =>
        player.closest('ytd-watch-flexy') === owner && !player.closest('ytd-miniplayer, ytd-video-preview, ytd-reel-video-renderer') && visible(player));
      if (document.body?.classList.contains('ytsmp-scroll-miniplayer-active')) {
        const placeholders = [...document.querySelectorAll('#ytsmp-player-placeholder')].filter(node =>
          !node.hidden && !node.hasAttribute('inert') && node.getClientRects().length && node.getBoundingClientRect().width>0 && node.getBoundingClientRect().height>0 &&
          !node.parentElement?.closest('[hidden], [inert], [aria-hidden="true"]') && visible(node.closest('ytd-watch-flexy'), true));
        if (placeholders.length === 1 && placeholders[0].closest('ytd-watch-flexy') === owner) {
          for (const player of document.body.querySelectorAll(':scope > #movie_player')) if (visible(player)) players.push(player);
        }
      }
      return players.length === 1 && players[0].getVideoData?.()?.video_id === id ? id : null;
    } catch { return null; }
  }

  function videoIdFromCard(card) {
    if (card.matches('ytd-watch-metadata, ytd-video-primary-info-renderer')) return watchVideoId(card);
    const ids = new Set();
    for (const anchor of card.querySelectorAll('a[href]')) {
      try {
        const url = new URL(anchor.getAttribute('href'), location.origin);
        if (url.origin !== location.origin) continue;
        const id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/shorts\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
        if (typeof id === 'string' && /^[\w-]{11}$/.test(id)) ids.add(id);
      } catch { /* Malformed links cannot identify a menu target. */ }
    }
    if (ids.size !== 1) return null;
    const id = [...ids][0];
    try {
      const model = typeof card.componentProps?.data === 'function' ? card.componentProps.data() : controller(card)?.data;
      if (model?.contentType && model.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
      if (model?.videoId && model.videoId !== id) return null;
      if (model?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && model.contentId && model.contentId !== id) return null;
    } catch { return null; }
    return id;
  }

  function menuSignature(items) {
    if (!Array.isArray(items) || !items.length || items.length > 60) return null;
    try {
      let fields = 0;
      const value = JSON.stringify(items, (_key, entry) => {
        if (++fields > 4000 || (typeof entry === 'string' && entry.length > 16384)) throw new Error('Menu model exceeds its bound');
        return entry;
      });
      return value.length <= 131072 ? value : null;
    } catch { return null; }
  }

  function sheetBindingMatches(row,item) {
    const bound=typeof row?.componentProps?.data==='function' ? row.componentProps.data() : controller(row)?.data;
    const expected=item?.downloadListItemViewModel || item?.listItemViewModel;
    if(!bound || typeof bound!=='object' || bound===item || bound===expected)return true;
    const candidate=bound.downloadListItemViewModel || bound.listItemViewModel || bound;
    const expectedSignature=menuSignature([expected]);
    return expectedSignature!==null && expectedSignature===menuSignature([candidate]);
  }

  function nativeMenuSignature(button, card) {
    // Some queue/library menus have no Add to queue command. Require their
    // exact native model instead; a trusted click alone cannot bind a popup.
    const host = button.closest('ytd-menu-renderer');
    if (host && !card.contains(host)) return null;
    try {
      const models = [];
      if (host) {
        if (typeof host.componentProps?.data === 'function') models.push(host.componentProps.data());
        const legacy = controller(host)?.data;
        if (legacy && typeof legacy === 'object') models.push(legacy);
      }
      const model = typeof card.componentProps?.data === 'function' ? card.componentProps.data() : controller(card)?.data;
      if (model?.menu?.menuRenderer) models.push(model.menu.menuRenderer);
      const signatures = models.map(model => Array.isArray(model?.items) && !model.items.some(queuedVideoId) ? menuSignature(model.items) : null);
      // Conflicting retained host/row models are not evidence of a safe target.
      return signatures.length && signatures.every(value => value && value === signatures[0]) ? signatures[0] : null;
    } catch { return null; }
  }

  function matchesNativeMenu(items, selection) {
    return Boolean(selection.nativeSignature) && menuSignature(items) === selection.nativeSignature;
  }

  function captureTrigger(event) {
    if (!event.isTrusted || (event.type === 'keydown' && !['Enter', ' ', 'ArrowDown'].includes(event.key))) return;
    const button = event.target?.closest?.('button, tp-yt-paper-icon-button, yt-icon-button, [role="button"]');
    const card = button?.closest(cardSelector);
    if (!card || !button.closest('ytd-menu-renderer, .ytLockupMetadataViewModelMenuButton, [aria-haspopup="menu"], [aria-haspopup="true"]') ||
        card.closest('#movie_player')) {
      if (!active?.popup.contains(event.target)) {
        trigger = null;
        triggerReason = card ? 'unsupported-trigger' : 'missing-trigger';
        if (waiting) reset();
      }
      return;
    }
    reset();
    const videoId = videoIdFromCard(card);
    if (!videoId) { trigger = null; triggerReason = 'card-identity'; diagnostic(triggerReason); return; }
    trigger = { button, card, videoId, time: performance.now(), nativeSignature: nativeMenuSignature(button, card),
      keyboard: event.type === 'keydown' || event.detail === 0 };
    triggerReason = 'captured-trigger';
    diagnostic(triggerReason);
    startDiscovery(trigger);
  }

  function ensureStyle() {
    if (style?.isConnected) return;
    style = document.createElement('style');
    style.textContent = `
      .ytms-video-menu-action { box-sizing: border-box; border: 0; border-radius: 0; background: transparent;
        color: var(--yt-sys-color-baseline--text-primary, var(--yt-spec-text-primary, inherit)); cursor: pointer; display: flex; align-items: center; gap: 12px;
        min-height: 40px; width: 100%; padding: 8px 16px; text-align: start; font: 400 14px/20px Roboto, Arial, sans-serif; }
      ytd-menu-popup-renderer .ytms-video-menu-action { min-height: 36px; padding-block: 6px; }
      .ytms-video-menu-action:hover, .ytms-video-menu-action:focus-visible { background: var(--yt-spec-badge-chip-background, #8883); }
      .ytms-video-menu-action:focus-visible { outline: 2px solid var(--yt-spec-call-to-action, #3ea6ff); outline-offset: -2px; }
      .ytms-video-menu-action[aria-disabled="true"] { opacity: .55; cursor: default; }
      .ytms-video-menu-action svg { width: 24px; height: 24px; flex: 0 0 24px; fill: currentColor; }
      .ytms-video-menu-action small { display: block; white-space: normal; max-width: 240px; font-size: 12px; line-height: 16px; margin-top: 3px; }
      .ytms-video-menu-action[hidden] { display: none !important; }
      .ytms-video-menu-message { padding:8px 16px;max-width:300px;font:400 12px/18px Roboto,Arial,sans-serif;overflow-wrap:anywhere; }
      [data-ytms-video-menu="1"]:focus { outline: none; }
      /* Native mouseover classes can outlive row movement; retain real hover and keyboard focus. */
      [data-ytms-video-menu="1"] .ytListItemViewModelHovered:not(:hover):not(:focus-within) { background-color: transparent !important; }
    `;
    (document.head || document.documentElement).append(style);
  }

  function customAction(id, label, path) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ytms-video-menu-action';
    button.dataset.ytmsMenuAction = id;
    button.setAttribute('role', 'menuitem');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    const text = document.createElement('span');
    text.textContent = label;
    button.append(svg, text);
    return button;
  }

  function clearPendingIcons() {
    pendingIconObserver?.disconnect(); pendingIconObserver = null;
    for (const item of pendingIcons) item.svg.remove();
    pendingIcons.clear();
  }

  function prunePendingIcons() {
    for (const item of pendingIcons) {
      let valid = false;
      try {
        const current = active;
        const data = current?.popup.matches('yt-sheet-view-model') ? current.popup.componentProps?.data?.() : controller(current?.popup)?.data;
        const items = current?.popup.matches('yt-sheet-view-model') ? data?.content?.listViewModel?.listItems : data?.items;
        valid = current && current.popup.contains(item.row) && item.svg.isConnected &&
          items?.includes(item.model) && identify(item.model,current) === 'notInterested' &&
          item.row.contains(item.svg) && ![...item.slot.children].some(child => child !== item.svg);
      } catch { /* A changing native model releases our temporary icon. */ }
      if (!valid) { item.svg.remove(); pendingIcons.delete(item); }
    }
    if (!pendingIcons.size) { pendingIconObserver?.disconnect(); pendingIconObserver = null; }
  }

  function pendingNativeIcon(row, id, model) {
    // The native async SVG renderer clears this known slot on completion.
    // Cover only the exact recognised Not interested action's empty slot;
    // BlockTube/unknown actions and already supplied native glyphs stay native.
    if (id !== 'notInterested') return;
    const slot = row.querySelector('.ytListItemViewModelLeading .yt-icon-shape, yt-icon .yt-icon-shape');
    if (!slot || slot.childElementCount) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
    svg.setAttribute('data-ytms-menu-icon-fallback','notInterested');
    svg.style.cssText = 'display:block;width:24px;height:24px;fill:currentColor;pointer-events:none';
    const path = document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d','M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 1.8a7.2 7.2 0 0 1 5.72 11.58L7.62 6.28A7.17 7.17 0 0 1 12 4.8zm-5.72 2.82 10.1 10.1A7.2 7.2 0 0 1 6.28 7.62z');
    svg.append(path); slot.append(svg);
    pendingIcons.add({svg,slot,row,model});
    if (!pendingIconObserver) pendingIconObserver = new MutationObserver(prunePendingIcons);
    pendingIconObserver.observe(row,{childList:true,subtree:true,attributes:true,attributeFilter:['data-target-id']});
    if (row.parentElement) pendingIconObserver.observe(row.parentElement,{childList:true});
    const popup = row.closest('ytd-menu-popup-renderer,yt-sheet-view-model');
    if (popup) pendingIconObserver.observe(popup,{childList:true});
  }

  function focusable(row) {
    // Current sheets can put tabindex on a presentation wrapper as well as on
    // their real button. Focus the action, not its non-activating wrapper.
    const actions = 'button, a[href], [role="menuitem"]';
    const candidates = [...(row.matches(actions) ? [row] : []), ...row.querySelectorAll(actions),
      ...(row.hasAttribute('tabindex') ? [row] : []), ...row.querySelectorAll('[tabindex]')];
    return candidates.find(element => element.getAttribute('role') !== 'presentation' &&
      !element.matches(':disabled, [disabled]') && !element.closest('[inert]') &&
      (element.matches('button, a[href]') || element.hasAttribute('tabindex')) && visiblePopup(element)) || null;
  }

  function navigableRows(current) {
    return [...current.parent.children].filter(row => row === current.back ? current.stack.length > 0 :
      current.entries.some(entry => entry.row === row && entry.enabled && entry.parent === current.page) ||
      [...current.groups.values()].some(group => group.row === row && group.enabled && group.parent === current.page) ||
      (current.page === creatorPage && current.creatorRows.includes(row)))
      .map(row => ({ row, target: focusable(row) })).filter(entry => entry.target);
  }

  function focusTarget(current, target) {
    if (!target || active !== current || current.redirectingFocus) return;
    current.redirectingFocus = true;
    try { if (document.activeElement !== target) target.focus({ preventScroll: true }); }
    finally { current.redirectingFocus = false; }
  }

  function focusPage(current) {
    const firstGroup = [...current.groups.values()].find(group => group.enabled && group.parent === current.page)?.row;
    const target = current.keyboard ? (current.stack.length ? current.back : firstGroup || navigableRows(current)[0]?.row) : current.popup;
    focusTarget(current, !target || target === current.popup ? current.popup : focusable(target));
  }

  function focused(event) {
    const current = active;
    if (!current || current.redirectingFocus || !current.popup.contains(event.target) || event.target === current.popup) return;
    // A late native autofocus can otherwise light up the original Add to queue
    // after Play next was inserted above it. Keep neutral container focus for
    // pointer input; the native :hover styling and action handlers stay intact.
    if (current.keyboard && current.interacted) return;
    if (event.target.matches('input, textarea, select, [contenteditable]')) return;
    // Finish native focus handlers first, including their focus/blur classes.
    // No timer, frame loop or page-wide mutation observer is needed.
    if (current.focusQueued) return;
    current.focusQueued = true;
    queueMicrotask(() => {
      current.focusQueued = false;
      if (active !== current || !current.popup.contains(document.activeElement)) return;
      if (!current.keyboard) focusTarget(current, current.popup);
      else if (!current.interacted) focusTarget(current, navigableRows(current)[0]?.target);
    });
  }

  function pointer(event) {
    const current = active;
    if (!current || !event.isTrusted || !current.popup.contains(event.target)) return;
    current.interacted = true;
    if (current.keyboard) {
      current.keyboard = false;
      focusTarget(current, current.popup);
    }
  }

  function refit() {
    const current = active;
    if (!current) return;
    const resize = () => {
      if (active !== current || !visiblePopup(current.popup)) return;
      try { controller(current.popup.closest('tp-yt-iron-dropdown'))?.refit?.(); } catch { /* A dismissed popup may no longer have a native controller. */ }
    };
    resize();
    if (refitFrame) cancelAnimationFrame(refitFrame);
    // Legacy popup rows settle after their first native measurement. One
    // coalesced frame avoids retaining the submenu's stale size constraints.
    refitFrame = requestAnimationFrame(() => {
      refitFrame = 0;
      resize();
      // Legacy menus briefly hide their native rows while reopening/refitting.
      // Recheck initial keyboard focus once they settle, without moving focus
      // after the user has navigated, switched input or left the popup.
      if (active === current && current.keyboard && !current.interacted && current.popup.contains(document.activeElement)) {
        focusTarget(current, navigableRows(current)[0]?.target);
      }
    });
  }

  function restoreRow(row, saved) {
    if (!saved.owned) return;
    saved.owned = false;
    // An external native/extension update supersedes our temporary hide.
    if (row.style.getPropertyValue('display') !== 'none' || row.style.getPropertyPriority('display') !== 'important') return;
    if (saved.value) row.style.setProperty('display', saved.value, saved.priority);
    else row.style.removeProperty('display');
  }

  function appendInOrder(parent, nodes) {
    // Native icon/rendering hosts keep their existing connection when their
    // order is already correct. Insert only new or genuinely misplaced rows.
    let next = null;
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index];
      if (node.parentNode !== parent || node.nextSibling !== next) parent.insertBefore(node, next);
      next = node;
    }
  }

  function hideRow(entry) {
    const value = entry.row.style.getPropertyValue('display');
    const priority = entry.row.style.getPropertyPriority('display');
    if (value !== 'none' || priority !== 'important') {
      entry.display.value = value; entry.display.priority = priority; entry.display.owned = true;
      entry.row.style.setProperty('display','none','important');
    }
  }

  function cancelLookup(current) {
    current.lookupController?.abort(); current.lookupController = null;
    for (const row of current.creatorRows) { row.disabled = false; row.removeAttribute('aria-busy'); }
  }

  function setPage(page, focus = true) {
    const current = active;
    if (!current || !current.popup.isConnected) return;
    cancelLookup(current);
    current.page = page === false ? 'root' : page === true ? 'channelTools' : page;
    current.tools = current.page === 'channelTools';
    for (const entry of current.entries) {
      if (entry.enabled && entry.parent === current.page) restoreRow(entry.row,entry.display);
      else hideRow(entry);
    }
    for (const group of current.groups.values()) {
      group.row.hidden = !group.enabled || group.parent !== current.page;
      group.row.setAttribute('aria-expanded',String(current.page === group.id || current.stack.includes(group.id)));
    }
    for (const row of current.creatorRows) row.hidden = current.page !== creatorPage;
    if (current.lookupStatus) current.lookupStatus.hidden = current.page !== creatorPage;
    current.back.hidden = current.stack.length === 0;
    refit();
    if (focus) focusPage(current);
  }

  function enterPage(page) {
    const current = active;
    // Keyboard submenu entry must retain the same card and native model
    // ownership as pointer entry while YouTube recycles an open popup.
    if (!current || !validCurrent(current)) return;
    current.stack.push(current.page); setPage(page);
  }

  function goBack() {
    const current = active;
    if (!current) return;
    setPage(current.stack.pop() || 'root');
  }

  function reset() {
    clearPendingIcons();
    if (waiting) {
      waiting.observer.disconnect();
      clearTimeout(waiting.timer);
      waiting = null;
      compatibility('not-checked');
    }
    if (firstFrame) cancelAnimationFrame(firstFrame);
    if (secondFrame) cancelAnimationFrame(secondFrame);
    if (refitFrame) cancelAnimationFrame(refitFrame);
    refitFrame = 0;
    firstFrame = secondFrame = 0;
    if (!active) return;
    const current = active;
    active = null;
    if (current.ownsTabIndex && current.popup.getAttribute('tabindex') === '-1') current.popup.removeAttribute('tabindex');
    cancelLookup(current);
    for (const row of current.ownedRows) row.remove();
    for (const entry of current.entries) {
      if (!entry.custom) restoreRow(entry.row, entry.display);
    }
    // Only restore a still-owned, fully stamped list. Do not resurrect detached native rows.
    if (current.original.every(row => row.parentElement === current.parent)) {
      appendInOrder(current.parent, current.original);
    }
    if (current.popup.getAttribute('data-ytms-video-menu') === '1') current.popup.removeAttribute('data-ytms-video-menu');
  }

  function channelIdentity(card) {
    try {
      const service = suite.channelAge;
      const identity = service?.channelIdentityFromCard?.(card);
      if (identity && ['unique','multiple','missing','conflict'].includes(identity.status)) {
        return { status:identity.status,
          channels:identity.status === 'conflict' ? [] : (Array.isArray(identity.channels) ? identity.channels.slice(0,10) : []),
          handles:identity.status === 'conflict' ? [] : (Array.isArray(identity.handles) ? identity.handles.slice(0,10) : []) };
      }
      const channel = service?.channelFromCard(card);
      return { status:channel?.channelId ? 'unique' : 'missing',channels:channel?.channelId ? [channel] : [],handles:[] };
    } catch { return {status:'missing',channels:[],handles:[]}; }
  }

  function validCurrent(current) {
    if (disposed || active !== current || !current.card.isConnected || !visiblePopup(current.popup) ||
        videoIdFromCard(current.card) !== current.videoId) return false;
    try {
      const data = current.popup.matches('yt-sheet-view-model') ? current.popup.componentProps?.data?.() : controller(current.popup)?.data;
      const items = current.popup.matches('yt-sheet-view-model') ? data?.content?.listViewModel?.listItems : data?.items;
      return data === current.model && items === current.items;
    } catch { return false; }
  }

  function openSelectedChannel(current, channelId) {
    if (!validCurrent(current)) return;
    const identity = channelIdentity(current.card);
    const channel = identity.status !== 'conflict' && identity.channels.find(channel => channel.channelId === channelId);
    if (!channel) return;
    const context = {card:current.card,videoId:current.videoId,selectedChannelId:channel.channelId};
    try { current.popup.closest('tp-yt-iron-dropdown')?.close?.(); } catch { /* Settings can open after native closure. */ }
    reset(); trigger = null; triggerReason = 'missing-trigger';
    suite.openChannelAgeSettings?.(channel,context);
  }

  function creatorOptions(current) {
    if (!validCurrent(current)) return false;
    const identity = channelIdentity(current.card);
    if (identity.status === 'conflict') return false;
    for (const row of current.creatorRows) { current.ownedRows.delete(row); row.remove(); }
    current.creatorRows = [];
    if (current.lookupStatus) { current.ownedRows.delete(current.lookupStatus); current.lookupStatus.remove(); }
    const add = (action,label,note) => {
      const row = customAction(action,label,nextPath);
      if (note) { const small = document.createElement('small'); small.textContent = note; row.lastElementChild.append(small); }
      current.creatorRows.push(row); current.ownedRows.add(row); current.parent.append(row);
      return row;
    };
    identity.channels.forEach((channel,index) => {
      const row = add('creator-'+index,'Filter uploads from '+(channel.name || channel.channelId),
        identity.channels.filter(other => other.name === channel.name).length > 1 ? channel.channelId : '');
      row.dataset.ytmsChannelId = channel.channelId;
    });
    // Known unique identities keep their direct action. A proven collaboration
    // can explicitly resolve each remaining unrecognised creator handle.
    if (!identity.channels.length || identity.status === 'multiple') {
      identity.handles.forEach((candidate,index) => {
        const row = add('lookup-'+index,'Look up '+candidate.handle,candidate.name && candidate.name !== candidate.handle ? candidate.name : '');
        row.dataset.ytmsHandleUrl = candidate.url;
      });
    }
    const status = document.createElement('div'); status.className = 'ytms-video-menu-message';
    status.setAttribute('role','status'); current.lookupStatus = status; current.ownedRows.add(status); current.parent.append(status);
    if (!current.creatorRows.length) status.textContent = 'Channel ID unavailable; add it manually in Channels settings.';
    return true;
  }

  async function lookupCreator(current, candidate) {
    if (!validCurrent(current)) return;
    const before = channelIdentity(current.card);
    if (before.status === 'conflict' || !before.handles.some(handle => handle.url === candidate.url && handle.handle === candidate.handle)) return;
    cancelLookup(current);
    const request = new AbortController(); current.lookupController = request;
    for (const row of current.creatorRows) if (row.dataset.ytmsHandleUrl) { row.disabled = true; row.setAttribute('aria-busy','true'); }
    current.lookupStatus.textContent = 'Looking up '+candidate.handle+'…'; refit();
    try {
      if (typeof suite.channelLookup?.lookup !== 'function') throw new Error('Channel lookup is unavailable. Use Channels settings to add the ID manually.');
      const result = await suite.channelLookup.lookup(candidate,{signal:request.signal});
      if (request.signal.aborted || active !== current || current.lookupController !== request ||
          current.page !== creatorPage || !validCurrent(current)) return;
      if (!result?.ok) throw new Error(result?.error || 'The channel ID could not be found.');
      const fresh = channelIdentity(current.card);
      if (fresh.status === 'conflict' || !fresh.handles.some(handle => handle.url === candidate.url && handle.handle === candidate.handle)) {
        throw new Error('The creator changed. Reopen the video menu and try again.');
      }
      if (!suite.channelLookup.isVerified?.(candidate,result.channel)) throw new Error('The channel lookup could not be verified.');
      const remembered = suite.channelAge?.rememberResolvedChannel?.(current.card,candidate,result.channel,current.videoId);
      if (!remembered?.ok) throw new Error(remembered?.error || 'The creator changed. Reopen the video menu and try again.');
      openSelectedChannel(current,result.channel.channelId);
    } catch (error) {
      if (!request.signal.aborted && active === current && current.lookupController === request && validCurrent(current)) {
        current.lookupStatus.textContent = typeof error?.message === 'string' ? error.message.slice(0,300) : 'The channel ID could not be found.';
      }
    } finally {
      if (active === current && current.lookupController === request) { cancelLookup(current); refit(); }
    }
  }

  function decorate(popup, selection) {
    if (disposed || trigger !== selection || !selection.card.isConnected || !popup.isConnected ||
        performance.now() - selection.time > 5000 || videoIdFromCard(selection.card) !== selection.videoId) return diagnostic('stale-target');
    const sheet = popup.matches('yt-sheet-view-model');
    let data;
    try { data = sheet ? popup.componentProps?.data?.() : controller(popup)?.data; } catch { return diagnostic('unavailable-model'); }
    const items = sheet ? data?.content?.listViewModel?.listItems : data?.items;
    if (!Array.isArray(items) || !items.length || items.length > 60) return diagnostic('unsupported-model');
    const queueIds = items.map(queuedVideoId).filter(Boolean);
    if (!queueIds.length && !matchesNativeMenu(items, selection)) return diagnostic('no-queue-action');
    if (queueIds.length && !queueIds.includes(selection.videoId)) return diagnostic('queue-target-mismatch');
    // Native Download is an outer action host containing its own list-item row.
    // Keep that original host and handler intact; do not count or move its child.
    const rows = [...popup.querySelectorAll(rowSelector)].filter(row => {
      const downloadHost = row.closest('yt-download-list-item-view-model');
      return !downloadHost || row === downloadHost;
    });
    if (rows.length !== items.length) return diagnostic('row-count');
    if (rows.some(row => row.parentElement !== rows[0].parentElement)) return diagnostic('row-parent');
    const parent = rows[0].parentElement;
    if (sheet && rows.some((row, index) => !sheetBindingMatches(row,items[index]) || (items[index]?.downloadListItemViewModel
      ? !row.matches('yt-download-list-item-view-model')
      : !items[index]?.listItemViewModel || !row.matches('yt-list-item-view-model')))) return diagnostic('row-binding');
    if (rows.some(row => !popup.contains(row)) || rows.some((row, index) => {
      if (sheet) return false;
      const model = items[index].menuServiceItemRenderer || items[index].menuNavigationItemRenderer || items[index].menuServiceItemDownloadRenderer;
      return !model || typeof model !== 'object' || controller(row)?.data !== model;
    })) return diagnostic('row-binding');
    const ids = items.map(item => identify(item, selection));
    // Ambiguous duplicate recognised actions and mismatched native lists remain untouched.
    if (ids.some((id, index) => id && ids.indexOf(id) !== index)) return diagnostic('duplicate-actions');
    const identity = channelIdentity(selection.card);
    const channel = identity.channels.length === 1 && identity.status === 'unique' ? identity.channels[0] : null;
    ensureStyle();
    const entries = rows.map((row,index) => {
      const node = layoutById.get(ids[index]);
      return { row,id:ids[index],enabled:node ? node.visible : true,parent:node?.parent || 'root',
        display:{ value:row.style.getPropertyValue('display'),priority:row.style.getPropertyPriority('display') } };
    });
    entries.forEach((entry,index) => pendingNativeIcon(entry.row,entry.id,items[index]));
    const ownedRows = new Set(), groups = new Map();
    let age = null;
    const ageNode = layoutById.get('channelAge');
    if (ageNode?.visible) {
      age = customAction('channelAge','Filter channel uploads','M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm12 8v10H5V10h14zM5 6h14v2H5V6zm6 6v5h5v-2h-3v-3h-2z');
      const note = document.createElement('small');
      if (identity.status === 'conflict') {
        age.setAttribute('aria-disabled','true'); note.textContent = 'Channel information disagrees; reopen the video menu or use Channels settings.';
      } else if (identity.status === 'multiple') {
        age.setAttribute('aria-haspopup','menu'); note.textContent = 'Choose which creator’s channel to filter.';
      } else if (!channel && identity.handles.length) {
        age.lastElementChild.firstChild.textContent = 'Look up channel ID';
        note.textContent = 'Find the permanent ID from the creator’s public YouTube channel page.';
      } else if (!channel) {
        age.setAttribute('aria-disabled','true'); note.textContent = 'Channel ID unavailable; add it manually in Channels settings.';
      }
      if (note.textContent) age.lastElementChild.append(note);
      ownedRows.add(age);
      entries.push({row:age,id:'channelAge',enabled:true,parent:ageNode.parent,custom:true,display:{value:'',priority:''}});
    }
    for (const node of layoutNodes.filter(node => !Object.hasOwn(node,'visible'))) {
      const row = customAction(node.id,node.name,nextPath);
      row.setAttribute('aria-haspopup','menu'); ownedRows.add(row);
      groups.set(node.id,{...node,row,enabled:false});
    }
    const groupEnabled = (id,seen = new Set()) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return entries.some(entry => entry.enabled && entry.parent === id) ||
        [...groups.values()].some(group => group.parent === id && groupEnabled(group.id,new Set(seen)));
    };
    for (const group of groups.values()) group.enabled = groupEnabled(group.id);
    const back = customAction('back','Back','M15 5l-7 7 7 7 1.4-1.4-5.6-5.6 5.6-5.6L15 5z');
    ownedRows.add(back);
    // Unknown rows keep their original native slots. Only recognised native
    // rows are reordered; owned menu entries are inserted at their chosen rank.
    const sorted = entries.filter(entry => !entry.custom && entry.id).sort((a,b) => rank(a.id)-rank(b.id));
    let index = 0;
    const arranged = entries.filter(entry => !entry.custom).map(entry => entry.id ? sorted[index++] : entry);
    for (const item of [...entries.filter(entry => entry.custom),...groups.values()].sort((a,b) => rank(a.id)-rank(b.id))) {
      const before = arranged.findIndex(entry => entry.id && rank(entry.id)>rank(item.id));
      arranged.splice(before<0 ? arranged.length : before,0,item);
    }
    active = { popup,parent,original:rows,entries,age,groups,back,channel,identity,ownedRows,
      creatorRows:[],lookupStatus:null,lookupController:null,card:selection.card,videoId:selection.videoId,
      model:data,items,trigger:selection.button,page:'root',stack:[],tools:false,
      keyboard:selection.keyboard,interacted:false,redirectingFocus:false,ownsTabIndex:!popup.hasAttribute('tabindex') };
    if (active.ownsTabIndex) popup.setAttribute('tabindex','-1');
    // Opaque sheet rows lose their original slot once submenus rearrange them.
    // Share this verified native stamp before the first physical layout move.
    suite.queueMenuBindings?.capture(popup, { data, items, rows, sheet });
    appendInOrder(parent,[back,...arranged.map(entry => entry.row)]);
    popup.setAttribute('data-ytms-video-menu', '1');
    setPage(false, false);
    const focusedElement = document.activeElement;
    if (focusedElement === selection.button || focusedElement === document.body || popup.contains(focusedElement)) {
      focusTarget(active, selection.keyboard ? navigableRows(active)[0]?.target || popup : popup);
    }
    diagnostic('ready');
    return true;
  }

  function visiblePopup(popup) {
    if (!popup.isConnected || !popup.getClientRects().length) return false;
    const box = popup.getBoundingClientRect();
    // A newly stamped native popup can have no row height until refit. A
    // transform-collapsed laid-out popup is different: its layout height is
    // positive even though its painted height is zero.
    if (!(box.width > 0) || (!(box.height > 0) && popup.offsetHeight > 0)) return false;
    for (let element = popup; element; element = element.parentElement) {
      if (element.hidden || element.hasAttribute('inert') || element.getAttribute('aria-hidden') === 'true') return false;
      const css = getComputedStyle(element);
      if (css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility) || Number(css.opacity) === 0) return false;
    }
    return true;
  }

  function matchesSelection(popup, selection) {
    try {
      const data = popup.matches('yt-sheet-view-model') ? popup.componentProps?.data?.() : controller(popup)?.data;
      const items = popup.matches('yt-sheet-view-model') ? data?.content?.listViewModel?.listItems : data?.items;
      if (!Array.isArray(items) || items.length > 60) return false;
      const queueIds = items.map(queuedVideoId).filter(Boolean);
      return queueIds.length ? queueIds.includes(selection.videoId) : matchesNativeMenu(items, selection);
    } catch { return false; }
  }

  function startDiscovery(selection, eventPopup = null) {
    reset();
    const containers = [...document.querySelectorAll('ytd-popup-container')];
    const existing = eventPopup ? [eventPopup] : [...document.querySelectorAll(popupSelector)];
    const roots = containers.length ? containers : [...new Set(existing.map(popup => popup.closest('tp-yt-iron-dropdown') || popup))];
    diagnostic('waiting-for-menu');
    let request;
    function attempt() {
      secondFrame = 0;
      if (waiting !== request || trigger !== selection) return;
      try {
        const visible = [...document.querySelectorAll(popupSelector)].filter(popup =>
          roots.some(root => root === popup || root.contains(popup)) && visiblePopup(popup));
        if (visible.length) request.sawPopup = true;
        const matching = visible.filter(popup => matchesSelection(popup, selection));
        if (matching.length > 1 || (visible.length > 1 && matching.length !== 1)) {
          diagnostic('ambiguous-popup'); return;
        }
        const popup = matching[0] || (visible.length === 1 ? visible[0] : null);
        if (!popup) { diagnostic('waiting-for-visible-popup'); return; }
        // A visible old menu for another video is not owned by this request.
        request.popup = matching.length === 1 ? popup : null;
        if (decorate(popup, selection) && waiting === request) {
          request.observer.disconnect();
          clearTimeout(request.timer);
          if (firstFrame) cancelAnimationFrame(firstFrame);
          if (secondFrame) cancelAnimationFrame(secondFrame);
          firstFrame = secondFrame = 0;
          waiting = null;
        }
      } catch { reset(); compatibility('unsupported'); }
    }
    // YouTube reuses cached sheets without another yt-popup-opened event. Watch
    // only known popup containers after this trusted activation, never the page.
    const observer = new MutationObserver(() => {
      if (waiting === request && !firstFrame && !secondFrame) secondFrame = requestAnimationFrame(attempt);
    });
    for (const root of roots) observer.observe(root, { childList: true, subtree: true,
      attributes: true, attributeFilter: ['hidden', 'style', 'aria-hidden', 'opened'] });
    request = { popup: eventPopup && matchesSelection(eventPopup, selection) ? eventPopup : null, roots, observer, sawPopup: false, timer: setTimeout(() => {
      if (waiting === request) {
        observer.disconnect(); waiting = null;
        if (trigger === selection) { trigger = null; triggerReason = 'expired-trigger'; }
        if (firstFrame) cancelAnimationFrame(firstFrame);
        if (secondFrame) cancelAnimationFrame(secondFrame);
        firstFrame = secondFrame = 0;
        compatibility(request.sawPopup ? 'unsupported' : 'no-menu');
      }
    }, 1500) };
    waiting = request;
    // A microtask from the capture listener can run before the same trusted
    // event reaches YouTube's target handler. Wait for that event to finish,
    // then reconcile in one frame before paint; retain all binding checks.
    firstFrame = requestAnimationFrame(() => {
      firstFrame = 0;
      attempt();
    });
  }

  function opened(event) {
    const popup = event.target;
    if (!popup?.matches?.(popupSelector)) return;
    if (!trigger) { diagnostic(triggerReason); return; }
    startDiscovery(trigger, popup);
  }

  function activate(event) {
    const current = active;
    if (!current) return;
    if (!current.popup.contains(event.target)) {
      // Automatic theatre-mode and other native helpers use synthetic clicks.
      // They must not cancel a menu that the user has just opened.
      if (event.isTrusted) { reset(); trigger = null; triggerReason = 'missing-trigger'; }
      return;
    }
    const action = event.target.closest?.('[data-ytms-menu-action]')?.dataset.ytmsMenuAction;
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.isTrusted) return;
    current.keyboard = event.detail === 0;
    current.interacted = true;
    if (action === 'back') goBack();
    else if (current.groups.has(action)) {
      const group = current.groups.get(action);
      if (group.enabled && group.parent === current.page && validCurrent(current)) enterPage(action);
    } else if (action === 'channelAge') {
      if (!validCurrent(current) || event.target.closest('[aria-disabled="true"]')) return;
      const identity = channelIdentity(current.card);
      if (identity.status === 'conflict') return;
      if (identity.status === 'unique' && identity.channels.length === 1) {
        openSelectedChannel(current,identity.channels[0].channelId);
      } else if (creatorOptions(current)) {
        enterPage(creatorPage);
        if (!identity.channels.length && identity.handles.length === 1) void lookupCreator(current,identity.handles[0]);
      }
    } else if (current.page === creatorPage && action?.startsWith('creator-')) {
      const id = event.target.closest('[data-ytms-channel-id]')?.dataset.ytmsChannelId;
      if (id) openSelectedChannel(current,id);
    } else if (current.page === creatorPage && action?.startsWith('lookup-')) {
      const url = event.target.closest('[data-ytms-handle-url]')?.dataset.ytmsHandleUrl;
      const candidate = channelIdentity(current.card).handles.find(handle => handle.url === url);
      if (candidate) void lookupCreator(current,candidate);
    }
  }

  function keyboard(event) {
    const current = active;
    if (!current || !current.popup.contains(event.target) || !event.isTrusted) return;
    current.keyboard = true;
    current.interacted = true;
    const ownedAction = event.target.closest?.('[data-ytms-menu-action]')?.dataset.ytmsMenuAction;
    if (event.key === 'ArrowRight' && current.groups.get(ownedAction)?.enabled) {
      event.preventDefault(); event.stopImmediatePropagation(); enterPage(ownedAction); return;
    }
    if ((event.key === 'ArrowLeft' || event.key === 'Escape') && current.stack.length) {
      event.preventDefault(); event.stopImmediatePropagation(); goBack(); return;
    }
    if (event.key === 'Escape') { reset(); trigger = null; triggerReason = 'missing-trigger'; return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    const rows = navigableRows(current);
    if (!rows.length) return;
    const focused = rows.findIndex(({ row }) => row === event.target || row.contains(event.target));
    if (event.key === 'Enter' || event.key === ' ') {
      if (focused < 0) {
        // A neutral pointer-open menu has no selected action. The first key
        // selects a visible action; it must not execute a stale native default.
        event.preventDefault(); event.stopImmediatePropagation();
        focusTarget(current, rows[0].target);
      }
      return;
    }
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 :
      focused < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1) :
        (focused + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    event.preventDefault(); event.stopImmediatePropagation();
    focusTarget(current, rows[next].target);
  }

  function closed(event) {
    const popup = active?.popup || waiting?.popup;
    if ((popup && (event.target === popup || event.target?.contains?.(popup))) ||
        (!active && waiting?.roots.some(root => root === event.target))) {
      reset(); trigger = null; triggerReason = 'missing-trigger';
    }
  }

  function navigated() { reset(); trigger = null; triggerReason = 'missing-trigger'; compatibility('not-checked'); }
  document.addEventListener('click', captureTrigger, true);
  document.addEventListener('keydown', captureTrigger, true);
  document.addEventListener('click', activate, true);
  document.addEventListener('keydown', keyboard, true);
  document.addEventListener('focusin', focused, true);
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('pointermove', pointer, { capture: true, passive: true });
  window.addEventListener('yt-popup-opened', opened, true);
  const closeEvents = ['yt-popup-closed', 'iron-overlay-closed'];
  closeEvents.forEach(type => window.addEventListener(type, closed, true));
  const resetEvents = ['yt-navigate-start', 'pagehide'];
  resetEvents.forEach(type => window.addEventListener(type, navigated, true));
  diagnostic('idle');
  return function disposeVideoMenu() {
    disposed = true;
    navigated();
    style?.remove(); style = null;
    document.removeEventListener('click', captureTrigger, true);
    document.removeEventListener('keydown', captureTrigger, true);
    document.removeEventListener('click', activate, true);
    document.removeEventListener('keydown', keyboard, true);
    document.removeEventListener('focusin', focused, true);
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('pointermove', pointer, true);
    window.removeEventListener('yt-popup-opened', opened, true);
    closeEvents.forEach(type => window.removeEventListener(type, closed, true));
    resetEvents.forEach(type => window.removeEventListener(type, navigated, true));
    diagnostic('disposed');
  };
}
