// Language: en-GB. Optional native-page presentation and discovery controls.
// All markers, styles and links are owned; native content and extension data stay intact.
export function installDiscoveryControls({ document, window, preferences = {}, MutationObserver = window.MutationObserver, reportError = () => {} }) {
  const p = preferences, root = document.documentElement;
  const keys = ['homeRedirect','logoToSubscriptions','homeList','subscriptionsList','hideSubscriptionsHeaders','fullFeedTitles','squareCorners','disableThemedHover','disableVideoPreviews','hideSearchPrompts','hideSearchAI','hideAIChapters','hideCommentGifs','hideAllComments','hideFeedPlaylists','hideFeedVods','hideFeedCollaborations','hideFeedLowViews','hideFeedDubbed','hideFeedMovies','hideHomePosts','hideThumbnailBadges','hidePremiumUpsells','hideOpenApp','hideViewsIcon','viewsSeparateLine','listChannelHeaders','hideSidebarSubscriptions','hideExplore','hideSubscriptionsChannels','restoreSubscriptionsLink','channelDefaultVideos','pauseChannelTrailers','hideChannelBanner','fullWidthChannel','shortsHideMetadata','shortsHideActions','shortsHideRelated','shortsHideMusic','shortsHideRemix'];
  if (!root || (!keys.some(key => p[key] === true) && !['dark','light'].includes(p.interfaceTheme) && !/^[2-6]$/.test(p.feedColumns || '') && !/^[3-6]$/.test(p.shortsColumns || '') && !['small','medium','large'].includes(p.searchThumbnailSize))) return () => {};
  const attr = 'data-ytms-discovery-hidden', reasonAttr = 'data-ytms-discovery-reason';
  const owned = new Set(), filteredCards = new Set(), pendingCards = new Set(), badgeNodes = new Set(), viewNodes = new Set(), headings = new Set(), restoredNavigation = new Set(), cardHeadings = new WeakMap(), cardDecorations = new WeakMap(), decorationOwners = new WeakMap(), rootOwned = new Map(), logoRecords = new Map(), attemptedRoutes = new Set();
  const manuallyPlayed = new WeakSet(), pausedTrailers = new WeakSet();
  const outerCardSelector = 'ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-playlist-renderer,ytd-movie-renderer';
  const cardSelector = outerCardSelector+',yt-lockup-view-model';
  // Modern rich items contain a lockup renderer for the same video. Treat the
  // native outer card as its one owner, including metadata-only recycling.
  const canonicalCard = element => element?.closest?.(outerCardSelector) || element?.closest?.('yt-lockup-view-model') || null;
  const excluded = 'ytd-miniplayer,ytd-playlist-panel-renderer,yt-playlist-panel-renderer,ytd-playlist-video-list-renderer,ytd-popup-container,ytd-engagement-panel-section-list-renderer';
  const feedSurface = 'ytd-browse ytd-rich-grid-renderer,ytd-search ytd-section-list-renderer,ytd-two-column-search-results-renderer';
  let frame = 0, disposed = false, suspended = false, navigationPending = false, pageSuspended = false, observerActive = false, scanAllCards = true, observedRoute = null;
  const listeners = [];
  const listen = (target, type, handler) => { target.addEventListener(type, handler, true); listeners.push([target,type,handler]); };
  const text = el => el?.textContent?.replace(/\s+/g,' ').trim() || '';
  const route = () => window.location.pathname;
  const channelBase = () => /^\/(?:@[\w.%-]+|channel\/UC[\w-]{22}|c\/[^/]+|user\/[^/]+)\/?$/.test(route());
  const isChannel = () => /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(?:\/(?:featured|videos|streams|shorts|playlists|community|posts|about))?\/?$/.test(route());
  const routeKind = () => ['/', '/feed/recommended'].includes(route()) ? 'home' : route() === '/feed/subscriptions' ? 'subscriptions' : route() === '/results' ? 'search' : route().startsWith('/shorts/') ? 'shorts' : isChannel() ? 'channel' : 'other';
  const eligibleFeed = () => ['home','subscriptions','search','channel'].includes(routeKind());
  const setRoot = (name, value) => {
    if (!rootOwned.has(name)) rootOwned.set(name, { previous: root.getAttribute(name), value: null });
    const record = rootOwned.get(name); record.value = value;
    if (value === null) root.removeAttribute(name); else if (root.getAttribute(name) !== value) root.setAttribute(name,value);
  };
  const hide = (el, reason, found) => {
    if (!el || el.closest(excluded)) return;
    found.add(el); owned.add(el);
    if (el.getAttribute(attr) !== '1') el.setAttribute(attr,'1');
    if (el.getAttribute(reasonAttr) !== reason) el.setAttribute(reasonAttr,reason);
  };
  const style = document.createElement('style'); style.id = 'ytms-discovery-controls-style';
  const rules = [];
  const add = (enabled, selector, css = 'display:none!important') => { if (enabled) rules.push(`${selector}{${css}}`); };
  add(true, `:root:not([data-yt-master-show-filtered="1"]) [${attr}="1"]`);
  add(p.hideAllComments, 'ytd-watch-flexy ytd-comments,ytd-watch-grid ytd-comments');
  add(p.hideCommentGifs, 'ytd-comments img[src*="tenor.com"],ytd-comments img[src*="giphy.com"],ytd-comments img[src$=".gif"],ytd-comments img[src*=".gif?"]');
  add(p.hideHomePosts, '[data-ytms-discovery-route="home"] ytd-browse ytd-post-renderer,[data-ytms-discovery-route="home"] ytd-browse ytd-backstage-post-thread-renderer');
  add(p.hideSubscriptionsHeaders, '[data-ytms-discovery-route="subscriptions"] ytd-browse ytd-rich-grid-renderer #header,[data-ytms-discovery-route="subscriptions"] ytd-browse ytd-feed-filter-chip-bar-renderer');
  add(p.hideChannelBanner, '[data-ytms-discovery-route="channel"] ytd-c4-tabbed-header-renderer #channel-header-container #banner,[data-ytms-discovery-route="channel"] yt-page-header-renderer yt-image-banner-view-model,[data-ytms-discovery-route="channel"] ytd-c4-tabbed-header-renderer #banner');
  add(p.fullWidthChannel, '[data-ytms-discovery-route="channel"] ytd-two-column-browse-results-renderer,[data-ytms-discovery-route="channel"] ytd-browse #primary', 'max-width:none!important;width:100%!important');
  add(p.fullFeedTitles, feedSurface.split(',').flatMap(surface => [surface+' #video-title',surface+' .yt-lockup-metadata-view-model__title']).join(','), '-webkit-line-clamp:unset!important;max-height:none!important;white-space:normal!important');
  add(p.squareCorners, 'ytd-browse ytd-thumbnail,ytd-search ytd-thumbnail,ytd-browse .ytThumbnailViewModelHost,ytd-search .ytThumbnailViewModelHost,ytd-browse .yt-thumbnail-view-model', 'border-radius:0!important');
  add(p.disableThemedHover, 'ytd-browse .ytThumbnailHoverOverlayToggleActionsViewModelHost,ytd-search .ytThumbnailHoverOverlayToggleActionsViewModelHost', 'background:transparent!important;backdrop-filter:none!important');
  add(p.disableVideoPreviews, 'ytd-browse ytd-video-preview,ytd-search ytd-video-preview');
  add(p.hideSearchPrompts, 'ytd-search ytd-search-refinement-card-renderer,ytd-search ytd-search-refinement-card-list-renderer,ytd-search ytd-inline-survey-renderer,ytd-search yt-search-refinement-card-view-model');
  add(true, '[data-ytms-discovery-badge-hidden="1"]');
  add(true, '[data-ytms-discovery-view-line="1"]', 'display:block!important;flex-basis:100%!important;width:100%!important');
  add(p.hidePremiumUpsells, 'ytd-mealbar-promo-renderer,yt-premium-spotlight-banner-renderer,ytd-statement-banner-renderer:has(a[href^="/premium"]),ytd-guide-entry-renderer:has(a[href^="/premium"])');
  add(p.hideOpenApp, 'ytm-bottom-sheet-renderer:has(a[href^="vnd.youtube:"]),ytm-open-app-button-renderer,ytd-app-install-promo-renderer');
  add(p.hideSubscriptionsChannels, '[data-ytms-discovery-route="subscriptions"] ytd-channel-list-sub-menu-renderer');
  add(p.hideExplore, 'ytd-guide-entry-renderer:has(a[href="/feed/trending"]),ytd-guide-entry-renderer:has(a[href="/feed/explore"]),ytd-guide-entry-renderer:has(a[href="/gaming"])');
  add(p.listChannelHeaders, '.ytms-discovery-channel-heading', 'display:block;margin:12px 0 8px;font:500 16px/24px Roboto,Arial,sans-serif');
  add(p.listChannelHeaders, '.ytms-discovery-channel-heading a', 'color:inherit;text-decoration:none');
  add(p.homeList || p.subscriptionsList, '[data-ytms-discovery-list="1"] ytd-rich-grid-renderer > #contents', 'display:block!important');
  add(p.homeList || p.subscriptionsList, '[data-ytms-discovery-list="1"] ytd-rich-grid-row', 'display:contents!important');
  add(p.homeList || p.subscriptionsList, '[data-ytms-discovery-list="1"] ytd-rich-item-renderer', 'width:100%!important;max-width:none!important;margin:0 0 16px!important');
  add(p.homeList || p.subscriptionsList, '[data-ytms-discovery-list="1"] ytd-rich-grid-media #dismissible', 'display:flex!important;gap:16px!important;align-items:flex-start!important');
  add(p.homeList || p.subscriptionsList, '[data-ytms-discovery-list="1"] ytd-rich-grid-media #thumbnail', 'flex:0 0 min(36%,320px)!important;width:min(36%,320px)!important');
  add(p.homeList || p.subscriptionsList, '[data-ytms-discovery-list="1"] .ytLockupViewModelHost,[data-ytms-discovery-list="1"] .yt-lockup-view-model', 'flex-direction:row!important;gap:16px!important');
  if (/^[2-6]$/.test(p.feedColumns || '')) {
    add(true, '[data-ytms-discovery-route="home"] ytd-rich-grid-renderer,[data-ytms-discovery-route="subscriptions"] ytd-rich-grid-renderer', `--ytd-rich-grid-items-per-row:${p.feedColumns}!important;--ytd-rich-grid-posts-per-row:${p.feedColumns}!important`);
  }
  if (['small','medium','large'].includes(p.searchThumbnailSize)) {
    const width = {small:240,medium:320,large:400}[p.searchThumbnailSize];
    add(true, 'ytd-search ytd-video-renderer ytd-thumbnail', `width:min(${width}px,40vw)!important;max-width:${width}px!important;min-width:0!important`);
  }
  if (/^[3-6]$/.test(p.shortsColumns || '')) add(true, 'ytd-rich-grid-renderer:has(ytd-rich-grid-slim-media)', `--ytd-rich-grid-slim-items-per-row:${p.shortsColumns}!important`);
  const shorts = '[data-ytms-discovery-route="shorts"] ';
  add(p.shortsHideMetadata, shorts+'ytd-reel-video-renderer:not(:hover):not(:focus-within) ytd-reel-player-header-renderer,'+shorts+'ytd-reel-video-renderer:not(:hover):not(:focus-within) yt-reel-metapanel-view-model', 'opacity:0!important;pointer-events:none!important');
  add(p.shortsHideActions, shorts+'ytd-reel-player-overlay-renderer #actions,'+shorts+'.ytReelPlayerOverlayViewModelActionsContainer');
  add(p.shortsHideRelated, shorts+'yt-reel-multi-format-link-view-model');
  add(p.shortsHideMusic, shorts+'ytd-reel-player-overlay-renderer #sound-metadata,'+shorts+'.ytReelSoundMetadataViewModelHost');
  add(p.shortsHideRemix, shorts+'ytd-reel-player-overlay-renderer #remix-button,'+shorts+'yt-reel-player-overlay-view-model button[aria-label="Remix"]');
  add(p.restoreSubscriptionsLink, 'html ytd-guide-renderer #sections ytd-guide-entry-renderer[data-ytms-subscriptions-restore="1"],html ytd-guide-renderer #sections > ytd-guide-section-renderer[data-ytms-subscriptions-restore="1"],html ytd-mini-guide-renderer ytd-mini-guide-entry-renderer[data-ytms-subscriptions-restore="1"]', 'display:block!important');
  for (const [theme, bg, raised, fg, secondary] of [['dark','#0f0f0f','#272727','#f1f1f1','#aaa'],['light','#fff','#f2f2f2','#0f0f0f','#606060']]) {
    add(true, `[data-ytms-discovery-theme="${theme}"]`, `color-scheme:${theme};--yt-spec-base-background:${bg}!important;--yt-spec-raised-background:${raised}!important;--yt-spec-menu-background:${bg}!important;--yt-spec-text-primary:${fg}!important;--yt-spec-text-secondary:${secondary}!important;--yt-spec-wordmark-text:${fg}!important;--yt-spec-general-background-a:${bg}!important;--yt-spec-general-background-b:${raised}!important`);
    add(true, `[data-ytms-discovery-theme="${theme}"] ytd-app`, `background:${bg}!important;color:${fg}!important`);
  }
  style.textContent = rules.join('\n'); (document.head || root).append(style);

  function parseViews(value) {
    const match = value.normalize('NFKC').match(/^([\d\s.,]+)\s*([KMB])?\s+(?:views?|vues?|Aufrufe|visualizaciones|visualizzazioni|visualizaç(?:ão|ões))$/i);
    if (!match) return null;
    let language = document.documentElement.lang || window.navigator.language || 'en';
    try {
      const parts = new window.Intl.NumberFormat(language).formatToParts(12345.6);
      const group = parts.find(x=>x.type === 'group')?.value.normalize('NFKC') || ',';
      const decimal = parts.find(x=>x.type === 'decimal')?.value || '.';
      let number = match[1].trim().replace(/\s/g,'');
      if (!/\s/.test(group) && number.includes(group)) {
        const groups = number.split(decimal)[0].split(group);
        if (groups.some((part,index) => !/^\d+$/.test(part) || (index > 0 && part.length !== 3))) return null;
        number = number.split(group).join('');
      }
      if (decimal !== '.') number = number.replace(decimal,'.');
      if (!/^\d+(?:\.\d+)?$/.test(number)) return null;
      const result = Number(number) * ({K:1000,M:1000000,B:1000000000}[match[2]?.toUpperCase()] || 1);
      return Number.isFinite(result) && result >= 0 && (match[2] || Number.isInteger(result)) ? result : null;
    } catch { return null; }
  }
  function filterReason(card) {
    if (!eligibleFeed() || card.closest(excluded) || !card.closest(feedSurface)) return '';
    const badges = [...card.querySelectorAll('ytd-badge-supported-renderer,.ytBadgeShapeBadgeText,.yt-badge-shape__text,.ytThumbnailOverlayBadgeViewModelHost')].map(text);
    const metadata = [...card.querySelectorAll('#metadata-line span,.yt-content-metadata-view-model__metadata-text,.ytContentMetadataViewModelMetadataText')].map(text);
    const nativeLinks = [...card.querySelectorAll('a#thumbnail,a#video-title,a.yt-lockup-view-model__content-image,a.yt-lockup-metadata-view-model__title')];
    if (p.hideFeedPlaylists && (card.matches('ytd-playlist-renderer') || nativeLinks.some(a => { try { const u = new window.URL(a.href); return u.origin === window.location.origin && u.pathname === '/playlist' && u.searchParams.has('list'); } catch { return false; } }))) return 'Playlist';
    if (p.hideFeedVods && metadata.some(x => /^Streamed\s.+\sago$/i.test(x))) return 'Stream archive';
    if (p.hideFeedDubbed && badges.some(x => /^auto[- ]dubbed$/i.test(x))) return 'Auto-dubbed';
    if (p.hideFeedMovies && (card.matches('ytd-movie-renderer') || badges.some(x => /^(?:Movies?\s*(?:&|and)\s*TV|Buy or rent)$/i.test(x)))) return 'Film or television';
    if (p.hideFeedCollaborations && (card.hasAttribute('is-collaboration') || [...card.querySelectorAll('.ytContentMetadataViewModelAvatarStack yt-avatar-stack-view-model')].some(stack => stack.querySelectorAll('img').length >= 2))) return 'Collaboration';
    if (p.hideFeedLowViews) {
      const values = metadata.map(parseViews).filter(x => x !== null);
      const minimum = Number(p.lowViewThreshold);
      if (values.length === 1 && [100,1000,10000].includes(minimum) && values[0] < minimum) return 'Low view count';
    }
    return '';
  }
  function clearDecorations(card) {
    for (const node of cardDecorations.get(card) || []) {
      if (decorationOwners.get(node) !== card) continue;
      node.removeAttribute('data-ytms-discovery-badge-hidden'); node.removeAttribute('data-ytms-discovery-view-line');
      badgeNodes.delete(node); viewNodes.delete(node);
      decorationOwners.delete(node);
    }
    cardDecorations.delete(card);
  }
  function decorateCard(card) {
    clearDecorations(card);
    const valid = eligibleFeed() && !card.closest(excluded) && card.closest(feedSurface);
    const list = routeKind() === 'home' && p.homeList || routeKind() === 'subscriptions' && p.subscriptionsList;
    let heading = cardHeadings.get(card);
    if (valid && list && p.listChannelHeaders) {
      const source = [...card.querySelectorAll('a[href]')].find(anchor => {
        if (anchor.closest('.ytms-discovery-channel-heading')) return false;
        try { const url = new window.URL(anchor.href); return url.origin === window.location.origin && /^\/(?:@[^/]+|channel\/UC[\w-]{22})\/?$/.test(url.pathname) && text(anchor); } catch { return false; }
      });
      if (source) {
        if (!heading) { heading = document.createElement('div'); heading.className = 'ytms-discovery-channel-heading'; const link = document.createElement('a'); heading.append(link); cardHeadings.set(card,heading); headings.add(heading); }
        const link = heading.firstElementChild;
        headings.add(heading);
        if (link.href !== source.href) link.href = source.href;
        if (link.textContent !== text(source)) link.textContent = text(source);
        if (heading.parentElement !== card) card.prepend(heading);
      } else if (heading) { heading.remove(); headings.delete(heading); cardHeadings.delete(card); }
    } else if (heading) { heading.remove(); headings.delete(heading); cardHeadings.delete(card); }
    if (!valid) return;
    const nodes = new Set();
    if (p.hideThumbnailBadges) for (const badge of card.querySelectorAll('.ytThumbnailOverlayBadgeViewModelHost,ytd-badge-supported-renderer .badge,.ytBadgeShapeBadgeText,.yt-badge-shape__text')) {
      if (/^(?:New|4K|8K|HD|HDR|CC|360°|VR180)$/i.test(text(badge))) { badge.setAttribute('data-ytms-discovery-badge-hidden','1'); badgeNodes.add(badge); nodes.add(badge); }
    }
    if (p.hideViewsIcon || p.viewsSeparateLine) for (const meta of card.querySelectorAll('#metadata-line > span,.yt-content-metadata-view-model__metadata-text,.ytContentMetadataViewModelMetadataText')) {
      if (parseViews(text(meta)) === null) continue;
      if (p.viewsSeparateLine) { meta.setAttribute('data-ytms-discovery-view-line','1'); viewNodes.add(meta); nodes.add(meta); }
      if (p.hideViewsIcon) for (const icon of meta.querySelectorAll('svg,yt-icon,.ytIconHost')) { icon.setAttribute('data-ytms-discovery-badge-hidden','1'); badgeNodes.add(icon); nodes.add(icon); }
    }
    for (const node of nodes) decorationOwners.set(node,card);
    cardDecorations.set(card,nodes);
  }
  function clearNestedCardOwnership(card) {
    for (const nested of card.querySelectorAll(cardSelector)) {
      if (canonicalCard(nested) !== card) continue;
      nested.removeAttribute(attr); nested.removeAttribute(reasonAttr); filteredCards.delete(nested);
      clearDecorations(nested);
      const heading = cardHeadings.get(nested);
      if (heading) { heading.remove(); headings.delete(heading); cardHeadings.delete(nested); }
    }
  }
  function restoreLogos() {
    for (const [anchor, previous] of logoRecords) {
      if (anchor.getAttribute('href') === '/feed/subscriptions') previous === null ? anchor.removeAttribute('href') : anchor.setAttribute('href',previous);
    }
    logoRecords.clear();
  }
  function syncLogos() {
    if (!p.logoToSubscriptions) return;
    for (const [anchor,previous] of logoRecords) if (!anchor.isConnected) {
      if (anchor.getAttribute('href') === '/feed/subscriptions') previous === null ? anchor.removeAttribute('href') : anchor.setAttribute('href',previous);
      logoRecords.delete(anchor);
    }
    for (const anchor of document.querySelectorAll('ytd-masthead a#logo,ytd-masthead #logo a[href]')) {
      if (!logoRecords.has(anchor)) logoRecords.set(anchor,anchor.getAttribute('href'));
      if (anchor.getAttribute('href') !== '/feed/subscriptions') anchor.setAttribute('href','/feed/subscriptions');
    }
  }
  function navigationAnchor(kind) {
    let anchor;
    if (kind === 'subscriptions') anchor = [...document.querySelectorAll('ytd-guide-renderer a[href],ytd-mini-guide-renderer a[href]')].find(a => a.getAttribute('href') === '/feed/subscriptions');
    else anchor = [...document.querySelectorAll('ytd-browse yt-tab-shape a[href],ytd-browse tp-yt-paper-tab a[href]')].find(a => { try { const u = new window.URL(a.href); return u.origin === window.location.origin && u.pathname.replace(/\/$/,'') === route().replace(/\/$/,'')+'/videos'; } catch { return false; } });
    return anchor && !anchor.closest('[inert]') ? anchor : null;
  }
  function nativeNavigate(kind) {
    const key = kind+':'+route();
    if (attemptedRoutes.has(key)) return;
    const anchor = navigationAnchor(kind);
    if (anchor) { attemptedRoutes.add(key); anchor.click(); }
  }
  function hasActivePlayback() {
    // Automatic page preferences must not navigate away from an ongoing main
    // video or queue. A hidden native player can still be playing audio.
    return [...document.querySelectorAll('#movie_player video')].some(video =>
      !video.closest('ytd-video-preview,ytd-reel-video-renderer,ytd-channel-video-player-renderer') &&
      !video.paused && !video.ended,
    );
  }
  function syncSubscriptionsLink() {
    const found = new Set();
    if (p.restoreSubscriptionsLink) for (const anchor of document.querySelectorAll('ytd-guide-renderer a[href="/feed/subscriptions"],ytd-mini-guide-renderer a[href="/feed/subscriptions"]')) {
      for (const node of [anchor.closest('ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer'),anchor.closest('ytd-guide-section-renderer')]) if (node) { found.add(node); restoredNavigation.add(node); if (node.getAttribute('data-ytms-subscriptions-restore') !== '1') node.setAttribute('data-ytms-subscriptions-restore','1'); }
    }
    for (const node of restoredNavigation) if (!found.has(node)) { if (node.getAttribute('data-ytms-subscriptions-restore') === '1') node.removeAttribute('data-ytms-subscriptions-restore'); restoredNavigation.delete(node); }
  }
  function pauseTrailer(video) {
    if (!p.pauseChannelTrailers || !isChannel() || !video?.matches?.('video') || !video.closest('ytd-channel-video-player-renderer') || manuallyPlayed.has(video) || pausedTrailers.has(video)) return;
    if (!video.paused && !video.ended) { pausedTrailers.add(video); video.pause(); }
  }
  function reconcile() {
    frame = 0; if (disposed || suspended) return;
    try {
      const kind = routeKind(), found = new Set();
      if (observedRoute !== route()) { observedRoute = route(); attemptedRoutes.clear(); }
      setRoot('data-ytms-discovery-route',kind);
      setRoot('data-ytms-discovery-list', (kind === 'home' && p.homeList || kind === 'subscriptions' && p.subscriptionsList) ? '1' : null);
      const darkReader = document.querySelector('style.darkreader,link.darkreader') || root.hasAttribute('data-darkreader-mode');
      setRoot('data-ytms-discovery-theme', !darkReader && ['dark','light'].includes(p.interfaceTheme) ? p.interfaceTheme : null);
      const candidates = scanAllCards ? document.querySelectorAll(cardSelector) : pendingCards;
      const cards = new Set([...candidates].map(canonicalCard).filter(Boolean));
      for (const card of cards) {
        clearNestedCardOwnership(card);
        decorateCard(card);
        const reason = filterReason(card);
        if (reason) { filteredCards.add(card); if (card.getAttribute(attr) !== '1') card.setAttribute(attr,'1'); if (card.getAttribute(reasonAttr) !== reason) card.setAttribute(reasonAttr,reason); }
        else { card.removeAttribute(attr); card.removeAttribute(reasonAttr); filteredCards.delete(card); }
      }
      for (const card of filteredCards) if (!card.isConnected) { card.removeAttribute(attr); card.removeAttribute(reasonAttr); filteredCards.delete(card); }
      for (const node of badgeNodes) if (!node.isConnected) { node.removeAttribute('data-ytms-discovery-badge-hidden'); badgeNodes.delete(node); }
      for (const node of viewNodes) if (!node.isConnected) { node.removeAttribute('data-ytms-discovery-view-line'); viewNodes.delete(node); }
      for (const node of headings) if (!node.isConnected) { node.remove(); headings.delete(node); }
      scanAllCards = false; pendingCards.clear();
      if (p.hideSearchAI && kind === 'search') for (const el of document.querySelectorAll('ytd-search yt-ai-search-input-view-model,ytd-search yt-ai-search-result-section-renderer,ytd-search yt-ai-search-ghost-card-view-model')) hide(el,'AI search',found);
      if (p.hideSearchAI && kind === 'search') for (const shelf of document.querySelectorAll('ytd-search ytd-shelf-renderer')) if (/^(?:AI-powered overview|AI overview|AI-generated summary)$/i.test(text(shelf.querySelector('#title')))) hide(shelf,'AI search',found);
      if (p.hideAIChapters) for (const panel of document.querySelectorAll('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"]')) {
        if ([...panel.querySelectorAll('#header,.ytd-macro-markers-list-renderer')].some(el => /^(?:AI-generated chapters|Chapters generated with AI)$/i.test(text(el)))) { found.add(panel); owned.add(panel); if (panel.getAttribute(attr) !== '1') panel.setAttribute(attr,'1'); }
      }
      if (p.hideSidebarSubscriptions) for (const section of document.querySelectorAll('ytd-guide-section-renderer')) if (/^Subscriptions$/i.test(text(section.querySelector('#guide-section-title')))) hide(section,'Subscribed channels',found);
      for (const el of owned) if (!found.has(el)) { el.removeAttribute(attr); el.removeAttribute(reasonAttr); owned.delete(el); }
      syncLogos(); syncSubscriptionsLink();
      if (p.homeRedirect && kind === 'home' && document.querySelector('ytd-masthead #avatar-btn') && !hasActivePlayback()) nativeNavigate('subscriptions');
      if (p.channelDefaultVideos && channelBase() && !hasActivePlayback()) nativeNavigate('videos');
      if (p.pauseChannelTrailers && isChannel()) document.querySelectorAll('ytd-channel-video-player-renderer video').forEach(pauseTrailer);
      syncObservation();
    } catch (error) { reportError('discoveryControls','reconcile',error); }
  }
  function schedule(full = true) { if (full !== false) scanAllCards = true; if (!disposed && !suspended && !frame) frame = window.requestAnimationFrame(reconcile); }
  const filters = ['hideFeedPlaylists','hideFeedVods','hideFeedCollaborations','hideFeedLowViews','hideFeedDubbed','hideFeedMovies','hideThumbnailBadges','hideViewsIcon','viewsSeparateLine','listChannelHeaders'].some(k=>p[k]);
  const observer = new MutationObserver(mutations => {
    let changed = false;
    for (const m of mutations) {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!el || el.closest('#ytms-settings-dialog,#ytms-age-dialog,.html5-video-player')) continue;
      if (m.attributeName === 'data-darkreader-mode' && el === root) changed = true;
      const card = canonicalCard(el); if (card) { pendingCards.add(card); changed = true; }
      if (el.closest('ytd-masthead,ytd-guide-renderer,yt-tab-group-shape,yt-tab-shape,tp-yt-paper-tab,ytd-engagement-panel-section-list-renderer')) changed = true;
      for (const node of m.addedNodes) if (node.nodeType === 1) {
        if (node.matches(cardSelector)) { const card = canonicalCard(node); if (card) pendingCards.add(card); changed = true; }
        for (const child of node.querySelectorAll(cardSelector)) { const card = canonicalCard(child); if (card) pendingCards.add(card); changed = true; }
        if (node.matches('ytd-browse,ytd-guide-renderer,ytd-masthead,yt-tab-shape,tp-yt-paper-tab,ytd-engagement-panel-section-list-renderer,style.darkreader,link.darkreader') || node.querySelector('ytd-guide-renderer,ytd-masthead,yt-tab-shape,tp-yt-paper-tab')) changed = true;
      }
      // Native virtualisation can remove cards without adding a replacement.
      // Release detached owned markers in the next batch, without a feed scan.
      for (const node of m.removedNodes) if (node.nodeType === 1 &&
        (node.matches(cardSelector) || node.querySelector(cardSelector))) changed = true;
    }
    if (changed) schedule(false);
  });
  function syncObservation() {
    const needed = !disposed && !suspended && (filters && eligibleFeed() || p.logoToSubscriptions || p.restoreSubscriptionsLink || p.homeRedirect && routeKind() === 'home' || p.channelDefaultVideos && channelBase() || p.hideSearchAI && routeKind() === 'search' || p.hideAIChapters || p.hideSidebarSubscriptions || ['dark','light'].includes(p.interfaceTheme));
    if (needed && !observerActive) { observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','aria-label','title','overlay-style','is-collaboration','class','data-darkreader-mode']}); observerActive = true; }
    else if (!needed && observerActive) { observer.disconnect(); observerActive = false; }
  }
  const cancel = () => { if (frame) window.cancelAnimationFrame(frame); frame = 0; observer.disconnect(); observerActive = false; };
  function clearAllDecorations() { for (const node of badgeNodes) { node.removeAttribute('data-ytms-discovery-badge-hidden'); decorationOwners.delete(node); } for (const node of viewNodes) { node.removeAttribute('data-ytms-discovery-view-line'); decorationOwners.delete(node); } for (const node of headings) node.remove(); badgeNodes.clear(); viewNodes.clear(); headings.clear(); }
  const start = () => { suspended = true; cancel(); restoreLogos(); for (const el of [...owned,...filteredCards]) { el.removeAttribute(attr); el.removeAttribute(reasonAttr); } owned.clear(); filteredCards.clear(); pendingCards.clear(); clearAllDecorations(); scanAllCards = true; };
  const navigateStart = () => { navigationPending = true; start(); };
  const navigateFinish = () => { navigationPending = false; if (!pageSuspended) { suspended = false; schedule(); } };
  const pageHide = () => { pageSuspended = true; start(); };
  const pageShow = () => { if (!pageSuspended) return; pageSuspended = false; navigationPending = false; suspended = false; schedule(); };
  listen(window,'yt-navigate-start',navigateStart); listen(window,'yt-navigate-finish',navigateFinish);
  listen(window,'yt-page-data-updated',schedule); listen(window,'pageshow',pageShow); listen(window,'pagehide',pageHide);
  if (p.logoToSubscriptions) listen(document,'click',event => {
    if (disposed || suspended || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target?.closest?.('ytd-masthead a#logo,ytd-masthead #logo a[href]');
    if (!anchor || !logoRecords.has(anchor)) return;
    const native = navigationAnchor('subscriptions');
    if (!native) return;
    event.preventDefault(); event.stopImmediatePropagation(); native.click();
  });
  if (p.pauseChannelTrailers) {
    const interaction = event => { if (event.type === 'keydown' && ![' ','Enter','k','K'].includes(event.key)) return; event.target?.closest?.('ytd-channel-video-player-renderer')?.querySelectorAll('video').forEach(video => manuallyPlayed.add(video)); };
    listen(document,'pointerdown',interaction); listen(document,'keydown',interaction); listen(document,'play',event => pauseTrailer(event.target));
  }
  reconcile();
  return () => {
    disposed = true; cancel(); restoreLogos(); style.remove();
    for (const node of restoredNavigation) if (node.getAttribute('data-ytms-subscriptions-restore') === '1') node.removeAttribute('data-ytms-subscriptions-restore'); restoredNavigation.clear();
    for (const [target,type,handler] of listeners) target.removeEventListener(type,handler,true);
    for (const el of [...owned,...filteredCards]) { el.removeAttribute(attr); el.removeAttribute(reasonAttr); } owned.clear(); filteredCards.clear(); pendingCards.clear();
    clearAllDecorations();
    for (const [name,record] of rootOwned) if (root.getAttribute(name) === record.value) { if (record.previous === null) root.removeAttribute(name); else root.setAttribute(name,record.previous); }
  };
}
