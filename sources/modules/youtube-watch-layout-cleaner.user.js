// ==UserScript==
// @name         YouTube Watch Layout Cleaner
// @namespace    Citizen.youtube.watch-layout-cleaner
// @version      1.100
// @description  Expands YouTube watch pages, keeps the right rail fixed at SponsorBlock-friendly width, preserves its visible popup, and widens metadata/comments.
// @author       Citizen
// @updateURL    none
// @downloadURL  none
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    sidebarWidthPx: 374,
    queueLayoutBreakpointPx: 1000,
    relatedVideosHideBreakpointPx: 1400,
    showDeArrowQueueButton: true,
    collapseEmptySidebar: true,
  };

  const STYLE_ID = "tm-youtube-watch-layout-cleaner";
  const PLAYLIST_PANEL_SELECTORS = [
    "ytd-playlist-panel-renderer",
    "yt-playlist-panel-renderer",
  ];
  const PLAYLIST_PANEL_SELECTOR = PLAYLIST_PANEL_SELECTORS.join(",");
  const QUEUE_THUMBNAIL_FALLBACK_DELAYS_MS = [750, 1500];
  const QUEUE_ITEM_SELECTOR = [
    "ytd-playlist-panel-video-renderer",
    "yt-playlist-panel-video-renderer",
  ].join(",");
  const QUEUE_THUMBNAIL_TARGET_SELECTOR = [
    "a#thumbnail",
    "ytd-thumbnail",
    "yt-thumbnail-view-model",
    ".ytThumbnailViewModelHost",
  ].join(",");
  const QUEUE_THUMBNAIL_FALLBACK_ATTRIBUTE =
    "data-ywlc-thumbnail-fallback";
  const QUEUE_THUMBNAIL_FALLBACK_CSS_PROPERTY =
    "--ywlc-thumbnail-fallback-image";
  const QUEUE_THUMBNAIL_FALLBACK_ROOT_MARGIN = "200px 0px";
  const QUEUE_THUMBNAIL_FALLBACK_STYLE_SELECTOR = PLAYLIST_PANEL_SELECTORS.map(
    (panelSelector) =>
      `${panelSelector} [${QUEUE_THUMBNAIL_FALLBACK_ATTRIBUTE}="1"]`,
  ).join(",\n");
  const EMPTY_SECONDARY_RAIL_ATTRIBUTE = "data-ywlc-empty-secondary-rail";
  const MANAGED_LIVE_CHAT_ATTRIBUTE = "data-ywlc-managed-chat";
  const AUXILIARY_RAIL_SURFACE_SELECTOR = [
    "#sponsorBlockPopupContainer",
    "#sponsorBlockPopupContainer iframe",
  ].join(",");
  const CHAT_SURFACE_SELECTOR = [
    "ytd-live-chat-frame#chat",
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-live-chat"]',
    "ytd-engagement-panel-section-list-renderer:has(yt-live-chat-app)",
  ].join(",");
  const ENGAGEMENT_PANEL_SELECTOR =
    "ytd-engagement-panel-section-list-renderer";
  const RAIL_MUTATION_TARGET_SELECTOR = [
    PLAYLIST_PANEL_SELECTOR,
    CHAT_SURFACE_SELECTOR,
    ENGAGEMENT_PANEL_SELECTOR,
    "#chat-container",
    "#panels",
    "#related",
    "#secondary",
    "#secondary-inner",
    AUXILIARY_RAIL_SURFACE_SELECTOR,
  ].join(",");
  const QUEUE_ITEM_MUTATION_ATTRIBUTES = [
    "aria-current",
    "aria-selected",
    "href",
    "selected",
    "src",
  ];
  const SURFACE_STATE_MUTATION_ATTRIBUTES = [
    "aria-current",
    "aria-hidden",
    "aria-selected",
    "class",
    "collapsed",
    "hidden",
    "selected",
    "style",
    "visibility",
    "data-ytppl-live-chat-panel",
  ];
  const DISCOVERY_MUTATION_ATTRIBUTES = [
    ...new Set([
      ...QUEUE_ITEM_MUTATION_ATTRIBUTES,
      ...SURFACE_STATE_MUTATION_ATTRIBUTES,
    ]),
  ];
  const PANEL_MUTATION_ATTRIBUTES = DISCOVERY_MUTATION_ATTRIBUTES;
  const WATCH_FLEXY_SELECTORS = [
    "ytd-watch-flexy[flexy]",
    "ytd-watch-flexy[flexy_]",
    "ytd-watch-flexy[is-two-columns]",
    "ytd-watch-flexy[is-two-columns_]",
    "ytd-watch-flexy[theater]",
    "ytd-watch-flexy[theatre]",
    "ytd-watch-flexy[is-watch-wide]",
  ];
  const WATCH_FLEXY_SELECTOR = WATCH_FLEXY_SELECTORS.join(",\n");
  const TWO_COLUMN_WATCH_FLEXY_SELECTORS = [
    "ytd-watch-flexy[is-two-columns]",
    "ytd-watch-flexy[is-two-columns_]",
  ];
  const TWO_COLUMN_WATCH_FLEXY_SELECTOR =
    TWO_COLUMN_WATCH_FLEXY_SELECTORS.join(",\n");
  const EMPTY_SECONDARY_RAIL_SELECTOR =
    TWO_COLUMN_WATCH_FLEXY_SELECTORS.map(
      (watchSelector) =>
        `${watchSelector}[${EMPTY_SECONDARY_RAIL_ATTRIBUTE}="1"]:not([${MANAGED_LIVE_CHAT_ATTRIBUTE}="open"])`,
    ).join(",\n");
  let queueThumbnailFallbackTimers = [];
  let queueThumbnailFallbackObserver = null;
  let observedRailMutationTargets = new Set();
  let queueThumbnailMutationFrame = 0;
  let railStateReconciliationFrame = 0;
  const pendingQueueThumbnailItems = new Set();

  function px(value) {
    return `${value}px`;
  }

  function watchFlexyChildSelector(...childSelectors) {
    return WATCH_FLEXY_SELECTORS.flatMap((watchSelector) =>
      childSelectors.map(
        (childSelector) => `${watchSelector} ${childSelector}`,
      ),
    ).join(",\n");
  }

  function buildQueueCompatibilityCss() {
    const titleParentSelector =
      ":is(ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer) " +
      ":has(> #video-title.cbCustomTitle)";
    if (!CONFIG.showDeArrowQueueButton) {
      return `
/* Hide only DeArrow's original-title button in queue rows, not its replacements. */
${titleParentSelector} > .cbShowOriginal {
  display: none !important;
}
`;
    }

    return `
/* Reserve the slot before DeArrow inserts its button so hover cannot reflow titles.
   Keep DeArrow's original/custom title and button visibility rules untouched. */
${titleParentSelector} {
  position: relative !important;
  box-sizing: border-box !important;
  padding-inline-end: 25px !important;
}

${titleParentSelector} > .cbShowOriginal {
  position: absolute !important;
  inset-inline-end: 0 !important;
  top: 0 !important;
  width: 20px !important;
  height: 20px !important;
  max-width: 20px !important;
  max-height: 20px !important;
  box-sizing: border-box !important;
  margin: 0 !important;
  padding: 0 !important;
}
`;
  }

  function buildCss() {
    return `
/* Watch pages only. Keeps the right rail while allowing the player column to use wide screens. */
${WATCH_FLEXY_SELECTOR}{
  --ytd-watch-flexy-max-player-width: none !important;
  --ytd-watch-flexy-max-player-width-wide-screen: none !important;
}

@media (min-width: ${px(CONFIG.queueLayoutBreakpointPx + 1)}) {
  ${TWO_COLUMN_WATCH_FLEXY_SELECTOR}{
    --ytd-watch-flexy-sidebar-width: ${px(CONFIG.sidebarWidthPx)} !important;
  }
}

/* Preserve the native video/chat reservation while managed chat is open. */
@media (min-width: ${px(CONFIG.queueLayoutBreakpointPx + 1)}) {
  ${EMPTY_SECONDARY_RAIL_SELECTOR}{
    --ytd-watch-flexy-sidebar-width: 0px !important;
  }
}

/* YouTube shares its sidebar variable between the video and lower content.
   Capture the native reserve before zeroing only the otherwise-empty columns. */
ytd-watch-flexy[${MANAGED_LIVE_CHAT_ATTRIBUTE}="open"] {
  --ywlc-live-chat-reserve: var(--ytd-watch-flexy-sidebar-width, ${px(CONFIG.sidebarWidthPx)}) !important;
}

ytd-watch-flexy[${MANAGED_LIVE_CHAT_ATTRIBUTE}][${EMPTY_SECONDARY_RAIL_ATTRIBUTE}="1"] #columns.ytd-watch-flexy {
  --ytd-watch-flexy-sidebar-width: 0px !important;
}

/* Explicitly hiding chat must release video space even when a real queue or
   SponsorBlock widget still needs its separate, below-video rail. */
ytd-watch-flexy[${MANAGED_LIVE_CHAT_ATTRIBUTE}="hidden"] #full-bleed-container,
ytd-watch-flexy[${MANAGED_LIVE_CHAT_ATTRIBUTE}="hidden"] #columns #primary #player.ytd-watch-flexy,
ytd-watch-flexy[${MANAGED_LIVE_CHAT_ATTRIBUTE}="open"] #columns #primary #player.ytd-watch-flexy {
  --ytd-watch-flexy-sidebar-width: 0px !important;
}

/* Legacy/default view nests the video inside the full-width primary column.
   Reserve once on its wrapper, never on the player or video element itself. */
@media (min-width: 768px) {
  :root:not(:fullscreen) ytd-watch-flexy[${MANAGED_LIVE_CHAT_ATTRIBUTE}="open"][${EMPTY_SECONDARY_RAIL_ATTRIBUTE}="1"] #columns #primary #player.ytd-watch-flexy {
    width: calc(100% - var(--ywlc-live-chat-reserve, ${px(CONFIG.sidebarWidthPx)})) !important;
  }
}

/* Retain the existing responsive overlay when both panes cannot fit. */
@media (max-width: 767px) {
  ytd-watch-flexy[${MANAGED_LIVE_CHAT_ATTRIBUTE}="open"] {
    --ytd-watch-flexy-sidebar-width: 0px !important;
  }
}

${watchFlexyChildSelector("#columns.ytd-watch-flexy")}{
  max-width: none !important;
  box-sizing: border-box !important;
}

${watchFlexyChildSelector("#primary.ytd-watch-flexy")}{
  flex: 1 1 auto !important;
  min-width: 0 !important;
  max-width: none !important;
}

${watchFlexyChildSelector(
  "#primary-inner.ytd-watch-flexy",
  "#above-the-fold",
  "#description",
  "#top-row",
  "#player.ytd-watch-flexy",
  "#player-container-outer.ytd-watch-flexy",
)}{
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: none !important;
}

ytd-comments #sections {
  margin-right: 0 !important;
}

ytd-comments,
ytd-comments ytd-item-section-renderer,
ytd-comments ytd-comment-thread-renderer {
  max-width: 100% !important;
}

${QUEUE_THUMBNAIL_FALLBACK_STYLE_SELECTOR} {
  background-image: var(${QUEUE_THUMBNAIL_FALLBACK_CSS_PROPERTY}) !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;
}

/* Leave only comments below the video once YouTube switches to its narrow layout. */
@media (max-width: ${px(CONFIG.relatedVideosHideBreakpointPx)}) {
  #related {
    display: none !important;
  }
}

${buildQueueCompatibilityCss()}
`;
  }

  function isWatchPath() {
    return location.pathname === "/watch" || location.pathname.startsWith("/live/");
  }

  function ensureStyle() {
    const css = isWatchPath() ? buildCss() : buildQueueCompatibilityCss();
    if (!css) {
      removeStyle();
      return;
    }

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    if (style.textContent !== css) style.textContent = css;
  }

  function removeStyle() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function getQueueItemVideoId(item) {
    const links = item.querySelectorAll('a[href*="/watch"]');
    const videoIds = new Set();

    for (const link of links) {
      let videoId = "";
      try {
        const url = new URL(link.href || link.getAttribute("href"), location.origin);
        if (url.origin !== location.origin || url.pathname !== "/watch") continue;
        videoId = url.searchParams.get("v") || "";
      } catch {
        continue;
      }

      if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) videoIds.add(videoId);
    }

    // Recycled rows can briefly retain the old thumbnail link beside a new
    // title link. Do not choose an image until their valid identities agree.
    return videoIds.size === 1 ? videoIds.values().next().value : "";
  }

  function hasLoadedQueueThumbnail(item) {
    return Array.from(item.querySelectorAll("img")).some((image) => {
      if (!image.complete || image.naturalWidth <= 0) return false;

      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0
      );
    });
  }

  function clearQueueThumbnailFallback(item) {
    item.querySelectorAll(
      `[${QUEUE_THUMBNAIL_FALLBACK_ATTRIBUTE}="1"]`,
    ).forEach((target) => {
      target.removeAttribute(QUEUE_THUMBNAIL_FALLBACK_ATTRIBUTE);
      target.style.removeProperty(QUEUE_THUMBNAIL_FALLBACK_CSS_PROPERTY);
    });
  }

  function applyQueueThumbnailFallback(item) {
    if (hasLoadedQueueThumbnail(item)) {
      clearQueueThumbnailFallback(item);
      return;
    }

    const videoId = getQueueItemVideoId(item);
    if (!videoId) {
      clearQueueThumbnailFallback(item);
      return;
    }

    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    item.querySelectorAll(QUEUE_THUMBNAIL_TARGET_SELECTOR).forEach(
      (target) => {
        target.setAttribute(QUEUE_THUMBNAIL_FALLBACK_ATTRIBUTE, "1");
        target.style.setProperty(
          QUEUE_THUMBNAIL_FALLBACK_CSS_PROPERTY,
          `url("${thumbnailUrl}")`,
        );
      },
    );
  }

  function getQueueThumbnailFallbackObserver() {
    if (
      queueThumbnailFallbackObserver ||
      typeof IntersectionObserver !== "function"
    ) {
      return queueThumbnailFallbackObserver;
    }

    queueThumbnailFallbackObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (
            !entry.target.isConnected ||
            !entry.target.closest(PLAYLIST_PANEL_SELECTOR) ||
            !isWatchPath()
          ) {
            observer.unobserve(entry.target);
            pendingQueueThumbnailItems.delete(entry.target);
            clearQueueThumbnailFallback(entry.target);
            return;
          }
          if (!entry.isIntersecting) return;

          observer.unobserve(entry.target);
          applyQueueThumbnailFallback(entry.target);
        });
      },
      { rootMargin: QUEUE_THUMBNAIL_FALLBACK_ROOT_MARGIN },
    );

    return queueThumbnailFallbackObserver;
  }

  function addQueueItemsFromNode(items, node) {
    const element =
      node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!element) return;

    const closestItem = element.closest?.(QUEUE_ITEM_SELECTOR);
    if (closestItem?.closest(PLAYLIST_PANEL_SELECTOR)) {
      items.add(closestItem);
    }
    element.querySelectorAll?.(QUEUE_ITEM_SELECTOR).forEach((item) => {
      if (item.closest(PLAYLIST_PANEL_SELECTOR)) items.add(item);
    });
  }

  function unobserveRemovedQueueItems(node) {
    if (node?.nodeType !== Node.ELEMENT_NODE) return;

    const items = new Set(node.querySelectorAll(QUEUE_ITEM_SELECTOR));
    if (node.matches(QUEUE_ITEM_SELECTOR)) items.add(node);
    items.forEach((item) => {
      if (item.isConnected && item.closest(PLAYLIST_PANEL_SELECTOR)) return;
      queueThumbnailFallbackObserver?.unobserve(item);
      pendingQueueThumbnailItems.delete(item);
      clearQueueThumbnailFallback(item);
    });
  }

  function flushPendingQueueThumbnailItems() {
    queueThumbnailMutationFrame = 0;
    const items = Array.from(pendingQueueThumbnailItems);
    pendingQueueThumbnailItems.clear();
    if (!isWatchPath()) return;

    const observer = getQueueThumbnailFallbackObserver();
    items.forEach((item) => {
      if (!item.isConnected || !item.closest(PLAYLIST_PANEL_SELECTOR)) return;
      if (observer) {
        observer.observe(item);
      } else {
        applyQueueThumbnailFallback(item);
      }
    });
  }

  function scheduleQueueThumbnailItems(items) {
    items.forEach((item) => pendingQueueThumbnailItems.add(item));
    if (!pendingQueueThumbnailItems.size || queueThumbnailMutationFrame) return;

    queueThumbnailMutationFrame = requestAnimationFrame(
      flushPendingQueueThumbnailItems,
    );
  }

  function canRenderSurface(element) {
    if (
      !element?.isConnected ||
      element.hidden ||
      element.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    const style = getComputedStyle(element);
    return style.display !== "none" && !["hidden", "collapse"].includes(
      style.visibility,
    );
  }

  function isElementOrAncestorHidden(element, boundary) {
    if (!element?.isConnected) return true;

    let current = element;
    while (current) {
      if (!canRenderSurface(current)) return true;
      if (current === boundary) return false;
      current = current.parentElement;
    }
    return true;
  }

  function isFloatingChatSurface(surface) {
    const selector = 'ytd-live-chat-frame#chat[data-ytppl-live-chat-panel="1"]';
    try {
      const frame = surface.matches?.(selector) ? surface :
        surface.matches?.(CHAT_SURFACE_SELECTOR) ? surface.querySelector?.(selector) : null;
      // The marker alone is insufficient during native presentation changes.
      // Only our actually open, out-of-flow chat releases its former column.
      return Boolean(frame?.matches?.(":popover-open"));
    } catch {
      return false; // Unsupported selectors retain the native rail safely.
    }
  }

  function isActiveChatSurface(surface) {
    return (
      !isFloatingChatSurface(surface) &&
      !surface.hasAttribute("collapsed") &&
      !isElementOrAncestorHidden(surface, surface.closest("ytd-watch-flexy"))
    );
  }

  function getManagedLiveChatState(chatSurfaces) {
    if (chatSurfaces.some(isFloatingChatSurface)) return "open";
    return chatSurfaces.some(surface =>
      surface.tagName?.toLowerCase() === "ytd-live-chat-frame" && surface.id === "chat" &&
      surface.classList?.contains("ytppl-live-chat-hidden"),
    ) ? "hidden" : "";
  }

  function isActiveQueuePanel(panel) {
    return (
      Boolean(panel.querySelector(QUEUE_ITEM_SELECTOR)) &&
      !isElementOrAncestorHidden(panel, panel.closest("ytd-watch-flexy"))
    );
  }

  function isActiveEngagementPanel(panel) {
    const visibility = panel.getAttribute("visibility");
    return (
      !isFloatingChatSurface(panel) &&
      (!visibility || visibility === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") &&
      !panel.hasAttribute("collapsed") &&
      !isElementOrAncestorHidden(panel, panel.closest("ytd-watch-flexy"))
    );
  }

  function isActiveAuxiliaryRailSurface(surface) {
    if (
      isElementOrAncestorHidden(surface, surface.closest("ytd-watch-flexy"))
    ) {
      return false;
    }

    const bounds = surface.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  }

  function reconcileSecondaryRailState() {
    railStateReconciliationFrame = 0;
    const watchRoute = isWatchPath();
    let layoutChanged = false;
    document.querySelectorAll("ytd-watch-flexy").forEach((watchFlexy) => {
      const chatSurfaces = Array.from(watchFlexy.querySelectorAll(CHAT_SURFACE_SELECTOR));
      const managedChatState = watchRoute ? getManagedLiveChatState(chatSurfaces) : "";
      if (managedChatState) {
        if (watchFlexy.getAttribute(MANAGED_LIVE_CHAT_ATTRIBUTE) !== managedChatState) {
          watchFlexy.setAttribute(MANAGED_LIVE_CHAT_ATTRIBUTE, managedChatState);
          layoutChanged = true;
        }
      } else if (watchFlexy.hasAttribute(MANAGED_LIVE_CHAT_ATTRIBUTE)) {
        watchFlexy.removeAttribute(MANAGED_LIVE_CHAT_ATTRIBUTE);
        layoutChanged = true;
      }
      const eligible =
        CONFIG.collapseEmptySidebar !== false && watchRoute &&
        (watchFlexy.matches(TWO_COLUMN_WATCH_FLEXY_SELECTOR) || Boolean(managedChatState));
      const related = eligible ? watchFlexy.querySelector("#related") : null;
      const relatedHidden =
        eligible &&
        (!related || isElementOrAncestorHidden(related, watchFlexy));
      const chatVisible =
        relatedHidden && chatSurfaces.some(isActiveChatSurface);
      const queueVisible =
        relatedHidden && !chatVisible &&
        Array.from(
          watchFlexy.querySelectorAll(PLAYLIST_PANEL_SELECTOR),
        ).some(isActiveQueuePanel);
      const auxiliarySurfaceVisible =
        relatedHidden && !chatVisible && !queueVisible &&
        Array.from(
          watchFlexy.querySelectorAll(AUXILIARY_RAIL_SURFACE_SELECTOR),
        ).some(isActiveAuxiliaryRailSurface);
      const engagementPanelVisible =
        relatedHidden && !chatVisible && !queueVisible && !auxiliarySurfaceVisible &&
        Array.from(
          watchFlexy.querySelectorAll(`#secondary ${ENGAGEMENT_PANEL_SELECTOR}`),
        ).some(isActiveEngagementPanel);
      const railIsEmpty =
        eligible &&
        relatedHidden &&
        !chatVisible &&
        !queueVisible &&
        !auxiliarySurfaceVisible &&
        !engagementPanelVisible;

      if (railIsEmpty) {
        if (watchFlexy.getAttribute(EMPTY_SECONDARY_RAIL_ATTRIBUTE) !== "1") {
          watchFlexy.setAttribute(EMPTY_SECONDARY_RAIL_ATTRIBUTE, "1");
          layoutChanged = true;
        }
      } else if (watchFlexy.hasAttribute(EMPTY_SECONDARY_RAIL_ATTRIBUTE)) {
        watchFlexy.removeAttribute(EMPTY_SECONDARY_RAIL_ATTRIBUTE);
        layoutChanged = true;
      }
    });
    // Native inline player dimensions must follow the scoped CSS variables.
    // Notify once per actual state transition; stable reconciliation is silent.
    if (watchRoute && layoutChanged) window.dispatchEvent(new Event("resize"));
  }

  function scheduleSecondaryRailStateReconciliation() {
    if (railStateReconciliationFrame) return;
    railStateReconciliationFrame = requestAnimationFrame(
      reconcileSecondaryRailState,
    );
  }

  function getRailMutationTargets() {
    if (!isWatchPath()) return [];

    // The native miniplayer can adopt a queue without leaving the watch route.
    // Keep observing every panel that the thumbnail fallback itself can own.
    const targets = new Set(document.querySelectorAll(PLAYLIST_PANEL_SELECTOR));
    document.querySelectorAll("ytd-watch-flexy").forEach((watchFlexy) => {
      watchFlexy
        .querySelectorAll(RAIL_MUTATION_TARGET_SELECTOR)
        .forEach((target) => targets.add(target));
      const secondary = watchFlexy.querySelector("#secondary");
      targets.add(secondary || watchFlexy);
      if (secondary?.parentElement) {
        targets.add(secondary.parentElement);
      }
    });
    return Array.from(targets);
  }

  function getNodeElement(node) {
    return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  }

  function nodeContainsRailMutationTarget(node) {
    const element = getNodeElement(node);
    return Boolean(
      element &&
        (element.matches(RAIL_MUTATION_TARGET_SELECTOR) ||
          element.querySelector(RAIL_MUTATION_TARGET_SELECTOR)),
    );
  }

  function nodeContainsQueueItem(node) {
    const element = getNodeElement(node);
    return Boolean(
      element &&
        (element.matches(QUEUE_ITEM_SELECTOR) ||
          element.querySelector(QUEUE_ITEM_SELECTOR)),
    );
  }

  function isDiscoveryMutationTarget(target) {
    return target.matches("ytd-watch-flexy, #secondary");
  }

  function isSecondaryRailMutationAnchor(target) {
    return Array.from(target.children || []).some(
      (child) =>
        child.matches?.("#secondary") &&
        child.closest("ytd-watch-flexy") === target.closest("ytd-watch-flexy"),
    );
  }

  function mutationAffectsRailState(mutation) {
    const element = getNodeElement(mutation.target);
    if (!element) return false;

    if (mutation.type === "attributes") {
      if (
        ["aria-current", "aria-selected", "selected"].includes(
          mutation.attributeName,
        ) &&
        element.closest(QUEUE_ITEM_SELECTOR)
      ) {
        return true;
      }
      return (
        SURFACE_STATE_MUTATION_ATTRIBUTES.includes(mutation.attributeName) &&
        (element.matches(RAIL_MUTATION_TARGET_SELECTOR) ||
          isDiscoveryMutationTarget(element))
      );
    }

    if (mutation.type !== "childList") return false;
    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    if (element.closest(AUXILIARY_RAIL_SURFACE_SELECTOR)) {
      return true;
    }
    if (element.closest(`${CHAT_SURFACE_SELECTOR}, #chat-container`)) {
      return true;
    }
    if (element.closest(PLAYLIST_PANEL_SELECTOR)) {
      return changedNodes.some(nodeContainsQueueItem);
    }
    return changedNodes.some(
      (node) =>
        nodeContainsRailMutationTarget(node) || nodeContainsQueueItem(node),
    );
  }

  function refreshRailMutationObserver() {
    const nextTargets = new Set(getRailMutationTargets());
    if (
      nextTargets.size === observedRailMutationTargets.size &&
      [...nextTargets].every((target) =>
        observedRailMutationTargets.has(target),
      )
    ) {
      return;
    }

    const registrations = [...nextTargets].map((target) => {
      const isSecondaryRailAnchor =
        isSecondaryRailMutationAnchor(target);
      const isDiscoveryTarget = isDiscoveryMutationTarget(target);
      const isPlaylistPanel = target.matches(PLAYLIST_PANEL_SELECTOR);
      const isAuxiliaryRailSurface = target.matches(
        AUXILIARY_RAIL_SURFACE_SELECTOR,
      );
      return [
        target,
        isSecondaryRailAnchor
          ? {
              childList: true,
            }
          : isDiscoveryTarget
          ? {
              attributeFilter: DISCOVERY_MUTATION_ATTRIBUTES,
              attributes: true,
              childList: true,
              subtree: true,
            }
          : isPlaylistPanel
          ? {
              attributeFilter: PANEL_MUTATION_ATTRIBUTES,
              attributes: true,
              childList: true,
              subtree: true,
            }
          : isAuxiliaryRailSurface
          ? {
              attributeFilter: SURFACE_STATE_MUTATION_ATTRIBUTES,
              attributes: true,
              childList: true,
              subtree: true,
            }
          : {
              attributeFilter: SURFACE_STATE_MUTATION_ATTRIBUTES,
              attributes: true,
              childList: target.matches(
                "#chat-container, ytd-engagement-panel-section-list-renderer",
              ),
            },
      ];
    });
    replaceObserverRegistrations(railMutationObserver, registrations);
    observedRailMutationTargets = nextTargets;
  }

  function replaceObserverRegistrations(targetObserver, registrations) {
    if (typeof targetObserver.replaceRegistrations === "function") {
      targetObserver.replaceRegistrations(registrations);
      return;
    }

    targetObserver.disconnect();
    registrations.forEach(([target, options]) =>
      targetObserver.observe(target, options),
    );
  }

  const railMutationObserver = new MutationObserver((mutations) => {
    if (!isWatchPath()) return;

    const items = new Set();
    let railStateMayHaveChanged = false;
    let targetsMayHaveChanged = false;
    mutations.forEach((mutation) => {
      railStateMayHaveChanged ||= mutationAffectsRailState(mutation);
      if (mutation.type === "attributes") {
        if (QUEUE_ITEM_MUTATION_ATTRIBUTES.includes(mutation.attributeName)) {
          addQueueItemsFromNode(items, mutation.target);
        }
        return;
      }
      if (mutation.type !== "childList") return;

      addQueueItemsFromNode(items, mutation.target);
      mutation.addedNodes?.forEach((node) => addQueueItemsFromNode(items, node));
      mutation.removedNodes?.forEach(unobserveRemovedQueueItems);
      targetsMayHaveChanged ||=
        Array.from(mutation.addedNodes || []).some(
          nodeContainsRailMutationTarget,
        ) ||
        Array.from(mutation.removedNodes || []).some(
          nodeContainsRailMutationTarget,
        );
    });
    scheduleQueueThumbnailItems(items);
    if (railStateMayHaveChanged) {
      scheduleSecondaryRailStateReconciliation();
      scheduleQueuePlayingMarkerReconciliation();
    }
    if (targetsMayHaveChanged) refreshRailMutationObserver();
  });

  function applyQueueThumbnailFallbacks() {
    const panels = isWatchPath()
      ? Array.from(document.querySelectorAll(PLAYLIST_PANEL_SELECTOR))
      : [];
    refreshRailMutationObserver();
    scheduleSecondaryRailStateReconciliation();
    if (!panels.length) return;

    const observer = getQueueThumbnailFallbackObserver();
    panels.forEach((panel) => {
      panel.querySelectorAll(QUEUE_ITEM_SELECTOR).forEach((item) => {
        if (observer) {
          observer.observe(item);
        } else {
          applyQueueThumbnailFallback(item);
        }
      });
    });
  }

  function scheduleQueueThumbnailFallbacks() {
    if (queueThumbnailFallbackObserver) {
      queueThumbnailFallbackObserver.disconnect();
      queueThumbnailFallbackObserver.takeRecords();
    }
    queueThumbnailFallbackTimers.forEach((timerId) => clearTimeout(timerId));
    refreshRailMutationObserver();
    scheduleSecondaryRailStateReconciliation();
    if (!isWatchPath()) {
      queueThumbnailFallbackTimers = [];
      if (queueThumbnailMutationFrame) cancelAnimationFrame(queueThumbnailMutationFrame);
      queueThumbnailMutationFrame = 0;
      pendingQueueThumbnailItems.clear();
      document.querySelectorAll(QUEUE_ITEM_SELECTOR).forEach(clearQueueThumbnailFallback);
      return;
    }
    queueThumbnailFallbackTimers = QUEUE_THUMBNAIL_FALLBACK_DELAYS_MS.map(
      (delay) => setTimeout(applyQueueThumbnailFallbacks, delay),
    );
  }

  function installQueuePlayingMarkerReconciliation() {
    const panelSelector = "ytd-playlist-panel-renderer, yt-playlist-panel-renderer";
    const rowSelector = "ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer";
    const controller = element => element?.polymerController || element?.getPolymerController?.() || element;
    const attempted = new WeakMap();
    let frame = 0;
    let navigating = false;

    function reconcile() {
      frame = 0;
      if (navigating) return;
      const players = [...document.querySelectorAll('#movie_player')].filter(player =>
        player.isConnected && !player.closest('ytd-video-preview, ytd-reel-video-renderer') && player.getClientRects().length);
      if (players.length !== 1 || players[0].classList.contains('ad-showing') ||
          players[0].classList.contains('ad-interrupting')) return;
      const player = players[0];
      let videoId, listId;
      try {
        videoId = player.getVideoData?.()?.video_id;
        listId = player.getPlaylistId?.();
      } catch { return; }
      if (typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId) ||
          typeof listId !== 'string' || !listId.startsWith('TLPQ')) return;
      for (const panel of document.querySelectorAll(panelSelector)) {
        try {
          const owner = controller(panel), data = owner?.data;
          if (!panel.isConnected || data?.playlistId !== listId || !Array.isArray(data.contents) ||
              !data.contents.length || data.contents.length > 1000 ||
              !Number.isInteger(data.currentIndex) ||
              (Number.isInteger(data.totalVideos) && data.totalVideos !== data.contents.length)) continue;
          const videos = data.contents.map(item => item.playlistPanelVideoRenderer);
          const index = data.currentIndex;
          if (videos.some(video => !video || typeof video.videoId !== 'string' || !/^[\w-]{11}$/.test(video.videoId)) ||
              videos[index]?.videoId !== videoId || videos.filter(video => video.videoId === videoId).length !== 1) continue;
          const items = panel.querySelector('#items');
          const rows = items ? [...items.children] : [];
          // Do not touch a partially stamped panel or a DOM move awaiting commit.
          if (rows.length !== videos.length || rows.some((row, i) => !row.matches(rowSelector) ||
              controller(row)?.data?.videoId !== videos[i].videoId ||
              !videos[i].playlistSetVideoId || controller(row)?.data?.playlistSetVideoId !== videos[i].playlistSetVideoId)) continue;
          const reorder = owner.ytReorderableController;
          if (reorder && Object.getOwnPropertyNames(reorder).some(name =>
            name.endsWith('dragListGroup') && reorder[name]?.isDragging?.())) continue;
          const modelMismatch = videos.some((video, i) => Boolean(video.selected) !== (i === index));
          const rowMismatch = (row, i) => {
            const rowOwner = controller(row), selected = i === index;
            return Boolean(rowOwner.data.selected) !== selected ||
              (typeof rowOwner.selected === 'boolean' && rowOwner.selected !== selected) ||
              row.hasAttribute('selected') !== selected;
          };
          if (!modelMismatch && !rows.some(rowMismatch)) { attempted.delete(panel); continue; }
          const signature = JSON.stringify([listId, videoId, index, videos.map((video, i) =>
            [video.playlistSetVideoId, Boolean(video.selected), Boolean(controller(rows[i]).data.selected),
              controller(rows[i]).selected, rows[i].hasAttribute('selected')])]);
          if (attempted.get(panel) === signature) continue; // A native no-op must not create a restamping loop.
          if (modelMismatch) {
            if (typeof owner.set !== 'function') continue;
            attempted.set(panel, signature);
            // Rebind only the panel's display model. The native playlist manager,
            // queue order, endpoints and playback are deliberately left alone.
            owner.set('data', { ...data, contents: data.contents.map((item, i) =>
              Boolean(videos[i].selected) === (i === index) ? item :
                { ...item, playlistPanelVideoRenderer: { ...videos[i], selected: i === index } }) });
            continue; // Let the native stamper finish before checking reused rows.
          }
          rows.forEach((row, i) => {
            const rowOwner = controller(row), selected = i === index;
            if (typeof rowOwner.set !== 'function') return;
            if (rowMismatch(row, i)) {
              attempted.set(panel, signature);
              // selected is a native computed property of data; rebind data rather
              // than overriding that property or hiding its arrow with CSS.
              rowOwner.set('data', { ...rowOwner.data, selected });
            }
          });
        } catch { /* Unknown native bindings are left untouched. */ }
      }
    }

    function schedule() {
      if (!navigating && !frame) frame = requestAnimationFrame(reconcile);
    }
    ['yt-playlist-data-updated', 'yt-page-data-updated'].forEach(type => window.addEventListener(type, schedule, true));
    window.addEventListener('yt-rendererstamper-finished', event => {
      if (event.target?.closest?.(panelSelector)) schedule();
    }, true);
    window.addEventListener('yt-navigate-start', () => {
      navigating = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }, true);
    ['yt-navigate-finish', 'pageshow'].forEach(type => window.addEventListener(type, () => {
      navigating = false;
      schedule();
    }, true));
    window.addEventListener('pagehide', () => {
      navigating = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }, true);
    schedule();
    return schedule;
  }

  function installQueuePlayNext(options = {}) {
    const uniqueVideos = options.uniqueVideos === true;
    const queueMenuBindings = options.menuBindings;
    const marker = "ytMasterPlayNext";
    const panelSelector = "ytd-playlist-panel-renderer, yt-playlist-panel-renderer";
    const rowSelector = "ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer";
    const entries = new WeakMap();
    const sheets = new WeakMap();
    const menuBindings = new WeakMap();
    const pendingIcons = new Set();
    const nativeQueueEntries = new WeakMap();
    const appendReservations = new WeakMap();
    const knownAppendReservations = new Map();
    const unownedAppendReservations = new Set();
    const removalReservations = new WeakMap();
    const idleAttempts = new WeakMap();
    let idleQueued = false;
    let pendingIconObserver = null;
    let pending = null;
    let operationGeneration = 0;
    let confirmedMiniOrders = new WeakMap();
    let hasConfirmedMiniOrders = false;
    let menuActivation = 0;
    let toast = null;
    let toastTimer = 0;
    let menuFrame = 0;
    let navigating = false, pageSuspended = false;

    const controller = (element) => element?.polymerController || element?.getPolymerController?.() || element;
    const validId = (value) => typeof value === "string" && /^[\w-]{11}$/.test(value);

    function sheetData(popup) {
      // Current view-model wrappers deliberately return a Symbol from .data.
      // Their native reactive getter and external .data setter remain separate.
      const read = popup?.componentProps?.data;
      try { return typeof read === "function" ? read() : null; }
      catch { return null; } // A dismissed native sheet may already be disposed.
    }

    function queueCommand(item) {
      const data = item?.menuServiceItemRenderer || item?.listItemViewModel;
      const endpoint = data?.serviceEndpoint || data?.rendererContext?.commandContext?.onTap?.innertubeCommand;
      const actions = endpoint?.signalServiceEndpoint?.actions;
      if (!Array.isArray(actions) || actions.length !== 1) return null;
      const command = actions[0]?.addToPlaylistCommand;
      if (command?.listType !== "PLAYLIST_EDIT_LIST_TYPE_QUEUE") return null;
      const ids = command.videoIds || [command.videoId];
      if (!Array.isArray(ids) || ids.length !== 1 || !validId(ids[0]) ||
          (command.videoId !== undefined && command.videoId !== ids[0])) return null;
      return { endpoint, command, videoId: ids[0], sourceItem: item, signature: boundedMenuSignature(command) };
    }

    function isVisibleQueuePlayer(player) {
      if (!player.isConnected || !player.getClientRects().length ||
          player.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const box = player.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) return false;
      for (let node = player; node; node = node.parentElement) {
        const css = getComputedStyle(node);
        if (css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility) || Number(css.opacity) === 0) return false;
      }
      return true;
    }

    function activeVideoId() {
      const ids = new Set();
      let visible = 0;
      const players = [...document.querySelectorAll('#movie_player')].filter(player => player.isConnected &&
        !player.closest('ytd-video-preview, ytd-reel-video-renderer'));
      for (const player of players) {
        if (!isVisibleQueuePlayer(player)) continue;
        visible++;
        const id = player.getVideoData?.()?.video_id;
        if (validId(id)) ids.add(id);
      }
      if (visible) return visible === 1 && ids.size === 1 ? [...ids][0] : undefined;
      // A measurable fading player can still own a queue. Its temporary
      // invisibility must not turn Play next into append-only queue creation.
      // Closed/non-rendered retained players must still permit a new queue.
      return players.some(player => player.getClientRects().length &&
        validId(player.getVideoData?.()?.video_id)) ? undefined : null;
    }

    function activePlayer(anchor) {
      return [...document.querySelectorAll('#movie_player')].find(player =>
        !player.closest('ytd-video-preview, ytd-reel-video-renderer') &&
        isVisibleQueuePlayer(player) &&
        player.getVideoData?.()?.video_id === anchor);
    }

    const sameIds = (left, right) => left.length === right.length && left.every((id, i) => id === right[i]);

    function confirmedAnchor(proof, anchor) {
      if (!proof || proof.expectedEntries.filter(entry => entry.videoId === proof.anchor).length !== 1) return false;
      const previous = proof.expectedEntries.findIndex(entry => entry.videoId === proof.anchor);
      return anchor === proof.anchor || !pending && proof.expectedEntries[previous + 1]?.videoId === anchor;
    }

    function miniplayerQueue(player, anchor) {
      const mini = player?.closest("ytd-miniplayer");
      if (!mini) return null;
      const ids = player.getPlaylist?.();
      if (Array.isArray(ids) && !ids.length) return null; // A standalone video has no existing queue.
      if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => !validId(id))) return { unavailable: true };
      const requiresConfirmed = ids.filter(id => id === anchor).length !== 1;
      const proof = confirmedMiniOrders.get(player);
      const nativeIndex = uniqueVideos ? player.getPlaylistIndex?.() : undefined;
      const indexedAnchor = Number.isInteger(nativeIndex) && ids[nativeIndex] === anchor;
      if (requiresConfirmed && !indexedAnchor && (!proof || proof.mini !== mini || !Array.isArray(proof.playerPlaylist) ||
          !sameIds(ids, proof.playerPlaylist) || !confirmedAnchor(proof, anchor))) return { unavailable: true };
      return { mini, ids: [...ids], requiresConfirmed };
    }

    const queueEntries = videos => videos.map(video => ({ videoId: video.videoId, playlistSetVideoId: video.playlistSetVideoId }));
    const sameEntries = (left, right) => left.length === right.length && left.every((entry, index) =>
      entry.videoId === right[index].videoId && entry.playlistSetVideoId === right[index].playlistSetVideoId);

    function captureOrderProof(queue, player, expectedEntries, playlist) {
      return { player, anchor: queue.videos[queue.currentIndex].videoId, panel: queue.panel, owner: queue.owner, mini: queue.mini, listId: queue.listId,
        playerListId: queue.playerListId, playerPlaylist: Array.isArray(playlist) ? [...playlist] : null,
        expectedEntries, currentEntryId: queue.videos[queue.currentIndex].playlistSetVideoId,
        playerIndex: uniqueVideos ? player.getPlaylistIndex?.() : undefined };
    }

    function uniqueOrderProof(queue, player, playlist, proof) {
      if (!proof || proof.player !== player || proof.panel !== queue.panel || proof.owner !== queue.owner ||
          proof.mini !== queue.mini || player.closest('ytd-miniplayer') !== proof.mini || proof.listId !== queue.listId ||
          proof.anchor !== queue.videos[queue.currentIndex]?.videoId ||
          proof.currentEntryId !== queue.videos[queue.currentIndex]?.playlistSetVideoId ||
          !sameEntries(queueEntries(queue.videos), proof.expectedEntries) || !Array.isArray(playlist)) return false;
      const index = player.getPlaylistIndex?.();
      return (sameIds(playlist, proof.playerPlaylist || []) && index === proof.playerIndex ||
        sameIds(playlist, proof.expectedEntries.map(entry => entry.videoId)) && index === queue.currentIndex) && Boolean(reorderRows(queue));
    }

    function isAppendOrder(entries, proof, videoId) {
      if (!proof || entries.length !== proof.expectedEntries.length + 1 ||
          !sameEntries(entries.slice(0, -1), proof.expectedEntries)) return false;
      const added = entries[entries.length - 1];
      return added.videoId === videoId && typeof added.playlistSetVideoId === 'string' &&
        added.playlistSetVideoId.length > 0 &&
        entries.filter(entry => entry.playlistSetVideoId === added.playlistSetVideoId).length === 1;
    }

    function rememberMiniOrder(queue, player, proof, expectedEntries, operation) {
      if (!proof || proof.player !== player || proof.anchor !== operation.anchor ||
          proof.panel !== queue.panel || proof.owner !== queue.owner || proof.mini !== queue.mini ||
          proof.listId !== queue.listId || proof.playerListId !== queue.playerListId ||
          !sameEntries(queueEntries(queue.videos), expectedEntries) || !reorderRows(queue) || pending !== operation) return;
      confirmedMiniOrders.set(player, { player, anchor: proof.anchor, panel: proof.panel, owner: proof.owner,
        mini: proof.mini, listId: proof.listId, playerListId: proof.playerListId,
        playerPlaylist: proof.playerPlaylist, expectedEntries, currentEntryId: proof.currentEntryId, playerIndex: proof.playerIndex });
      hasConfirmedMiniOrders = true;
    }

    function allowsLaggingPlayerOrder(queue, player, anchor, nativePlaylist, recovery) {
      // The native playlist API can lag its own panel after an accepted append
      // or handleDrop. Accept only our exact, independently bound transition;
      // an unrelated order, entry, owner or playback change still fails closed.
      const entries = queueEntries(queue.videos);
      if (uniqueVideos && [pending?.removal, pending?.uniquenessProof, confirmedMiniOrders.get(player)]
          .some(proof => uniqueOrderProof(queue, player, nativePlaylist, proof))) return true;
      const matchesContext = proof => proof && proof.player === player && proof.anchor === anchor && proof.mini === queue.mini &&
        player.closest('ytd-miniplayer') === proof.mini && proof.panel === queue.panel &&
        proof.owner === queue.owner && proof.listId === queue.listId &&
        proof.playerListId === queue.playerListId &&
        Array.isArray(proof.playerPlaylist) && sameIds(nativePlaylist, proof.playerPlaylist);
      // Recovery separately verifies the exact optimistic DOM move before
      // restoring it. Only its captured pre-move native model is eligible here.
      if (recovery?.anchor === anchor && matchesContext(recovery.move) &&
          sameEntries(entries, recovery.move.entries)) return true;
      const activeMove = pending?.committed && pending.anchor === anchor ? pending.move : null;
      for (const proof of [activeMove, confirmedMiniOrders.get(player)]) {
        if (matchesContext(proof) && sameEntries(entries, proof.expectedEntries) && reorderRows(queue)) return true;
      }
      // A confirmed queue may advance while the player's playlist API still
      // reports its pre-reorder snapshot. Carry proof across exactly the next
      // bound entry, never an unexplained jump or an in-flight operation.
      const confirmed = confirmedMiniOrders.get(player);
      // Native minimisation/maximisation can adopt the exact completed queue without
      // refreshing the player's order API. Rebind only that intact shared
      // ownership transition; never carry an in-flight move or changed model.
      const ownershipChanged = confirmed && confirmed.mini !== queue.mini &&
        (confirmed.mini === null && queue.mini?.isConnected && confirmed.panel.closest('ytd-miniplayer') === queue.mini ||
          confirmed.mini && queue.mini === null && !confirmed.panel.closest('ytd-miniplayer'));
      if (!pending && ownershipChanged) {
        const adopted = { ...confirmed, mini: queue.mini, anchor };
        // The same native queue ID can disappear again when a watch queue is
        // minimised. Carry only its proven panel ID across this exact handoff.
        if (confirmed.mini === null && queue.mini && confirmed.playerListId === confirmed.listId &&
            (queue.playerListId == null || queue.playerListId === '')) adopted.playerListId = queue.playerListId;
        // Home can omit the native queue ID until maximisation. Accept only
        // the same panel's already-proven ID becoming readable on its player.
        if (confirmed.mini && queue.mini === null &&
            (confirmed.playerListId == null || confirmed.playerListId === '') &&
            queue.playerListId === confirmed.listId) adopted.playerListId = queue.playerListId;
        if (confirmedAnchor(confirmed, anchor) && matchesContext(adopted) &&
            sameEntries(entries, confirmed.expectedEntries) && reorderRows(queue)) {
          confirmedMiniOrders.set(player, adopted);
          return true;
        }
      }
      if (!pending && confirmed && anchor !== confirmed.anchor && confirmedAnchor(confirmed, anchor)) {
        const previous = confirmed.expectedEntries.findIndex(entry => entry.videoId === confirmed.anchor);
        const advanced = { ...confirmed, anchor };
        if (queue.currentIndex === previous + 1 && matchesContext(advanced) &&
            sameEntries(entries, confirmed.expectedEntries) && reorderRows(queue)) {
          confirmedMiniOrders.set(player, advanced);
          return true;
        }
      }
      // A panel-less restoration cannot capture queue-entry bindings until its
      // panel returns. Its original native IDs still independently prove this
      // one append while the player's playlist API lags the restored panel.
      const restoring = pending?.restore;
      if (restoring && pending.anchor === anchor && restoring.player === player &&
          restoring.mini === queue.mini && player.closest('ytd-miniplayer') === restoring.mini &&
          restoring.listId === queue.listId && queue.currentIndex === restoring.currentIndex &&
          (queue.playerListId === restoring.listId || queue.playerListId == null || queue.playerListId === "") &&
          sameIds(nativePlaylist, restoring.ids) &&
          sameIds(entries.map(entry => entry.videoId), [...restoring.ids, pending.videoId]) && reorderRows(queue)) return true;
      const append = pending && !pending.committed && pending.anchor === anchor ? pending.appendProof : null;
      return matchesContext(append) && isAppendOrder(entries, append, pending.videoId) && Boolean(reorderRows(queue));
    }

    function queueState(anchor, recovery = null) {
      const queues = [];
      const player = activePlayer(anchor);
      const activeListId = player?.getPlaylistId?.();
      const missingListId = activeListId == null || activeListId === "";
      if (!missingListId && typeof activeListId !== "string") return { unavailable: true };
      const mini = player?.closest("ytd-miniplayer");
      const miniQueue = miniplayerQueue(player, anchor);
      if (missingListId && miniQueue?.unavailable) return { unavailable: true };
      const nativePlaylist = missingListId ? miniQueue?.ids : player?.getPlaylist?.();
      for (const panel of document.querySelectorAll(panelSelector)) {
        if (!panel.isConnected) continue;
        const ownedMini = mini && panel.closest("ytd-miniplayer") === mini;
        // YouTube retains the watch panel after adopting its queue into the
        // miniplayer. A hidden copy outside that player is not a second queue,
        // even when its stale model still has the same playlist ID. Exclude it
        // before accessing native bindings, which may already be disposed.
        if (mini && !ownedMini && !isVisibleQueuePlayer(panel)) continue;
        const owner = controller(panel);
        const data = owner?.data;
        if (typeof data?.playlistId !== "string" || !data.playlistId.startsWith("TLPQ")) continue;
        if (missingListId && ownedMini && !miniQueue?.mini) return { unavailable: true };
        if (!panel.getClientRects().length && data.playlistId !== activeListId && !ownedMini) continue;
        // Visible panels can also belong to a previous queue during navigation.
        // On Home the native miniplayer reports no playlist ID. Only its own
        // panel, with the player's exact ordered video IDs, can identify it.
        if (data.playlistId !== activeListId && !(missingListId && ownedMini)) return { unavailable: true };
        if (!Array.isArray(data.contents) || data.contents.length > 1000 || owner.canReorder === false) {
          return { unavailable: true };
        }
        const videos = data.contents.map(item => item.playlistPanelVideoRenderer);
        if (!videos.length || videos.some(video => !validId(video?.videoId))) return { unavailable: true };
        if (uniqueVideos && (!Array.isArray(nativePlaylist) || !nativePlaylist.length || nativePlaylist.length > 1000 ||
            nativePlaylist.some(id => !validId(id)))) return { unavailable: true };
        if (uniqueVideos && (data.playlistId.length > 1024 || videos.some(video =>
            typeof video.playlistSetVideoId !== 'string' || !video.playlistSetVideoId || video.playlistSetVideoId.length > 1024) ||
            new Set(videos.map(video => video.playlistSetVideoId)).size !== videos.length)) return { unavailable: true };
        // Native display selection can retain the previous playing marker,
        // especially on Home where the miniplayer reports no playlist ID.
        // Prefer the independently verified index and unique playing video;
        // only older models without an index use the strict selection fallback.
        let currentIndex = data.currentIndex;
        if (!("currentIndex" in data)) {
          const selected = videos.filter(video => video.selected === true);
          if (selected.length !== 1 || selected[0].videoId !== anchor) return { unavailable: true };
          currentIndex = videos.indexOf(selected[0]);
        }
        if (!Number.isInteger(currentIndex) || videos[currentIndex]?.videoId !== anchor ||
            (Number.isInteger(data.totalVideos) && data.totalVideos > videos.length)) return { unavailable: true };
        const queue = { panel, owner, data, videos, currentIndex, listId: data.playlistId, playerListId: activeListId, mini: ownedMini ? mini : null };
        if (videos.filter(video => video.videoId === anchor).length !== 1) {
          const index = uniqueVideos ? player?.getPlaylistIndex?.() : undefined;
          if (!uniqueVideos || !(Number.isInteger(index) && index === currentIndex && Array.isArray(nativePlaylist) &&
              sameIds(videos.map(video => video.videoId), nativePlaylist)) &&
              ![pending?.removal, pending?.uniquenessProof, confirmedMiniOrders.get(player)]
                .some(proof => uniqueOrderProof(queue, player, nativePlaylist, proof))) return { unavailable: true };
        }
        if (missingListId && !sameIds(videos.map(video => video.videoId), miniQueue.ids) &&
            !allowsLaggingPlayerOrder(queue, player, anchor, miniQueue.ids, recovery)) return { unavailable: true };
        // A known queue ID does not prove that a retained panel has the current
        // order. Honour an independently readable native order, allowing only
        // this operation's exact captured append/reorder when that API lags.
        if (!missingListId && Array.isArray(nativePlaylist) && nativePlaylist.length > 0 &&
            nativePlaylist.length <= 1000 && nativePlaylist.every(validId) &&
            !sameIds(videos.map(video => video.videoId), nativePlaylist) &&
            !allowsLaggingPlayerOrder(queue, player, anchor, nativePlaylist, recovery)) return { unavailable: true };
        queues.push(queue);
        if (uniqueVideos) {
          const reservations = appendReservations.get(player);
          for (const video of videos) {
            reservations?.get(queue.listId)?.delete(video.videoId);
            reservations?.get('')?.delete(video.videoId);
            knownAppendReservations.get(queue.listId)?.delete(video.videoId);
            unownedAppendReservations.delete(video.videoId);
          }
          for (const [key, ids] of reservations || []) if (!ids.size) reservations.delete(key);
          if (!knownAppendReservations.get(queue.listId)?.size) knownAppendReservations.delete(queue.listId);
        }
      }
      // A collapsed Home queue may not have stamped a panel yet. Never mistake
      // its existing playlist for no queue and send an append-only command.
      if (!queues.length && miniQueue?.requiresConfirmed) return { unavailable: true };
      if (!queues.length && miniQueue?.mini && (missingListId || activeListId?.startsWith("TLPQ"))) {
        return { awaitingPanel: true, ...miniQueue };
      }
      // A known miniplayer queue ID remains meaningful when its playlist API
      // is unavailable or empty. On watch, a non-empty native playlist also
      // proves an existing queue. Neither can append safely without a panel
      // that can verify and reorder the addition.
      if (!queues.length && activeListId?.startsWith("TLPQ") &&
          (mini || (Array.isArray(nativePlaylist) && nativePlaylist.length > 0))) return { unavailable: true };
      return queues.length > 1 ? { unavailable: true } : queues[0] || null;
    }

    function reorderRows(queue) {
      const items = queue.panel.querySelector("#items");
      const rows = items ? [...items.children].filter(row => row.matches(rowSelector)) : [];
      if (typeof queue.owner.handleDrop !== "function" || rows.length !== queue.videos.length ||
          rows.some((row, i) => {
            const data = controller(row)?.data;
            return items.childNodes[i] !== row || data?.videoId !== queue.videos[i].videoId ||
              !data?.playlistSetVideoId || data.playlistSetVideoId !== queue.videos[i].playlistSetVideoId;
          })) return null;
      const reorder = queue.owner.ytReorderableController;
      if (reorder && Object.getOwnPropertyNames(reorder).some(name =>
        name.endsWith("dragListGroup") && reorder[name]?.isDragging?.())) return null;
      return { items, rows };
    }

    function reserveAppend(player, listId, videoId, reservations = appendReservations) {
      if (!uniqueVideos) return true;
      if (!player) {
        if (unownedAppendReservations.has(videoId) || unownedAppendReservations.size >= 1000) return false;
        unownedAppendReservations.add(videoId); return true;
      }
      if (reservations === appendReservations && typeof listId === 'string' && listId.startsWith('TLPQ')) {
        let ids = knownAppendReservations.get(listId);
        if (!ids) {
          if (knownAppendReservations.size >= 4) return false;
          knownAppendReservations.set(listId, ids = new Set());
        }
        if (ids.has(videoId) || ids.size >= 1000) return false;
        ids.add(videoId);
        const creation = appendReservations.get(player)?.get('');
        if (creation?.has(videoId) || unownedAppendReservations.has(videoId)) {
          // Bind an uncertain creation to the first verified queue used by a
          // later request, rather than letting its newly readable ID retry it.
          creation?.delete(videoId);
          unownedAppendReservations.delete(videoId);
          return false;
        }
        return true;
      }
      let queues = reservations.get(player);
      if (!queues) reservations.set(player, queues = new Map());
      const key = listId || '';
      let ids = queues.get(key);
      if (!ids) {
        if (queues.size >= 4) return false;
        queues.set(key, ids = new Set());
      }
      if (ids.has(videoId) || ids.size >= 1000) return false;
      ids.add(videoId);
      return true;
    }

    function uniqueQueueStep(queue, player, operation) {
      const entries = queueEntries(queue.videos), binding = reorderRows(queue);
      if (!binding || entries.some(entry => typeof entry.playlistSetVideoId !== 'string' || !entry.playlistSetVideoId) ||
          new Set(entries.map(entry => entry.playlistSetVideoId)).size !== entries.length) return false;
      const currentEntryId = entries[queue.currentIndex].playlistSetVideoId;
      if (!operation.uniquenessProof) {
        const playlist = player.getPlaylist?.();
        if (!uniqueInitialOrder(queue, player, playlist)) return false;
        operation.uniquenessProof = captureOrderProof(queue, player, entries, playlist);
      }
      const proof = operation.uniquenessProof;
      if (proof.player !== player || proof.panel !== queue.panel || proof.owner !== queue.owner || proof.mini !== queue.mini ||
          proof.listId !== queue.listId || proof.currentEntryId !== currentEntryId) {
        finish('The queue changed; no further queue entries were changed.'); return false;
      }
      if (operation.removal) {
        if (sameEntries(entries, operation.removal.expectedEntries)) {
          removalReservations.get(player)?.get(queue.listId)?.delete(operation.removal.removedEntryId);
          operation.uniquenessProof = operation.removal;
          operation.removal = null;
          operation.removed = (operation.removed || 0) + 1;
          rememberMiniOrder(queue, player, operation.uniquenessProof, entries, operation);
          if (pending !== operation) return false;
        } else if (sameEntries(entries, operation.removal.beforeEntries)) return false;
        else { finish('The queue changed; no further queue entries were changed.'); return false; }
      } else if (!sameEntries(entries, proof.expectedEntries)) {
        // A newly accepted native append may arrive after the initial snapshot.
        if (!operation.appendProof || !isAppendOrder(entries, operation.appendProof, operation.videoId)) {
          finish('The queue changed; no further queue entries were changed.'); return false;
        }
        operation.uniquenessProof = captureOrderProof(queue, player, entries, player.getPlaylist?.());
      }
      const kept = new Map([[operation.anchor, currentEntryId]]);
      const duplicate = entries.find(entry => {
        if (!kept.has(entry.videoId)) { kept.set(entry.videoId, entry.playlistSetVideoId); return false; }
        return kept.get(entry.videoId) !== entry.playlistSetVideoId;
      });
      if (!duplicate) return true;
      const expectedEntries = entries.filter(entry => entry.playlistSetVideoId !== duplicate.playlistSetVideoId);
      operation.removal = { ...captureOrderProof(queue, player, expectedEntries, player.getPlaylist?.()), beforeEntries: entries,
        removedEntryId: duplicate.playlistSetVideoId };
      const dispatch = queueDispatcher(queue.panel);
      if (!dispatch || pending !== operation) return false;
      if (operation.mode === 'normalise' && operation.idleSignature) {
        idleAttempts.set(queue.panel, { owner: queue.owner, player, signature: operation.idleSignature });
      }
      if (!reserveAppend(player, queue.listId, duplicate.playlistSetVideoId, removalReservations)) {
        finish('An earlier duplicate removal is still unconfirmed. Please check the queue.'); return false;
      }
      // This native action removes an exact queue entry. Never remove by video
      // ID: that could include the independently verified playing occurrence.
      if (dispatch({ signalServiceEndpoint: { signal: 'CLIENT_SIGNAL', actions: [{
        playlistRemoveVideosAction: { setVideoIds: [duplicate.playlistSetVideoId] },
      }] } }) === false) {
        finish('Could not confirm duplicate removal. Please check the queue.'); return false;
      }
      if (pending === operation) scheduleMove();
      return false;
    }

    function uniqueInitialOrder(queue, player, playlist) {
      return Array.isArray(playlist) && playlist.length > 0 && playlist.length <= 1000 && playlist.every(validId) &&
        (sameIds(playlist, queue.videos.map(video => video.videoId)) ||
          allowsLaggingPlayerOrder(queue, player, queue.videos[queue.currentIndex].videoId, playlist));
    }

    function scheduleUniqueQueue() {
      if (!uniqueVideos || pending || idleQueued || navigating || pageSuspended || document.hidden) return;
      idleQueued = true;
      const generation = operationGeneration;
      queueMicrotask(() => {
        idleQueued = false;
        if (pending || navigating || pageSuspended || document.hidden || generation !== operationGeneration) return;
        try {
          const anchor = activeVideoId(), player = anchor && activePlayer(anchor);
          if (player?.classList.contains('ad-showing') || player?.classList.contains('ad-interrupting')) return;
          const queue = anchor && queueState(anchor);
          if (!queue || queue.unavailable || queue.awaitingPanel || !reorderRows(queue) ||
              !uniqueInitialOrder(queue, player, player.getPlaylist?.()) ||
              new Set(queue.videos.map(video => video.videoId)).size === queue.videos.length) return;
          const signature = JSON.stringify([queue.listId, queue.currentIndex, queueEntries(queue.videos)]);
          const attempted = idleAttempts.get(queue.panel);
          if (attempted?.owner === queue.owner && attempted.player === player && attempted.signature === signature) return;
          const operation = pending = { anchor, videoId: null, mode: 'normalise', player, listId: queue.listId, mini: queue.mini,
            idleSignature: signature,
            generation: ++operationGeneration, observer: observeQueue(), moveQueued: false, frame: 0,
            deadline: Date.now() + 8000, timer: 0 };
          operation.timer = setTimeout(() => {
            if (pending === operation) finish('Duplicate cleanup was not confirmed. Please check the queue.');
          }, 8000);
          scheduleMove();
        } catch { /* Unknown native state cannot authorise duplicate removal. */ }
      });
    }

    function notify(message) {
      clearTimeout(toastTimer);
      toast?.remove();
      toast = document.createElement("div");
      toast.setAttribute("role", "status");
      toast.setAttribute("data-yt-master-queue-status", "");
      toast.textContent = message;
      Object.assign(toast.style, {
        position: "fixed", bottom: "24px", left: "24px", zIndex: "2202",
        padding: "14px 20px", borderRadius: "8px", font: "14px Roboto, Arial, sans-serif",
        background: "var(--yt-spec-raised-background, #212121)",
        color: "var(--yt-spec-text-primary, #fff)", boxShadow: "0 4px 16px #0005",
        maxWidth: "calc(100vw - 48px)", pointerEvents: "none",
      });
      document.body?.appendChild(toast);
      toastTimer = setTimeout(() => { toast?.remove(); toast = null; toastTimer = 0; }, 4000);
    }

    function recoverMove(operation) {
      const move = operation?.move;
      if (!move) return;
      try {
        const { panel, owner, player, items, rows, rowOwners, row, nodes, expected, entries, currentIndex,
          listId, playerListId, playerPlaylist, mini, from } = move;
        if (!panel.isConnected || !items.isConnected || controller(panel) !== owner ||
            panel.querySelector('#items') !== items || activeVideoId() !== operation.anchor ||
            activePlayer(operation.anchor) !== player || player.closest('ytd-miniplayer') !== mini ||
            player.getPlaylistId?.() !== playerListId) return;
        // The native player can change before its panel catches up. Restore
        // only if both independent native bindings still describe the old order.
        const playlist = player.getPlaylist?.();
        if (Array.isArray(playerPlaylist) ? !Array.isArray(playlist) || !sameIds(playlist, playerPlaylist)
          : playerPlaylist != null || playlist !== playerPlaylist) return;
        const queue = queueState(operation.anchor, operation);
        if (!queue || queue.panel !== panel || queue.owner !== owner || queue.listId !== listId || queue.currentIndex !== currentIndex ||
            queue.videos.length !== entries.length || queue.videos.some((video, index) =>
              video.videoId !== entries[index].videoId || video.playlistSetVideoId !== entries[index].playlistSetVideoId)) return;
        const reorder = owner.ytReorderableController;
        if (reorder && Object.getOwnPropertyNames(reorder).some(name =>
          name.endsWith('dragListGroup') && reorder[name]?.isDragging?.())) return;
        if (!sameIds([...items.childNodes], expected) || rows.some((original, index) => {
          const data = controller(original)?.data;
          return controller(original) !== rowOwners[index] || data?.videoId !== entries[index].videoId ||
            data?.playlistSetVideoId !== entries[index].playlistSetVideoId;
        })) return;
        // Undo our one DOM move, preserving the original nodes and trailing
        // native nodes. Never write native queue data or dispatch another move.
        if (pending || operationGeneration !== operation.generation) return;
        items.insertBefore(row, nodes[from + 1] || null);
      } catch { /* A changed or disposed native binding must remain untouched. */ }
    }

    function finish(message, recover = false) {
      const operation = pending;
      pending = null; // DOM recovery can synchronously trigger native callbacks.
      if (operation) {
        operation.observer.disconnect();
        clearTimeout(operation.timer);
        if (operation.frame) cancelAnimationFrame(operation.frame);
        if (recover) recoverMove(operation);
      }
      if (uniqueVideos && operation && message) {
        if (operation.committed || operation.removed) message = message.replace('the queue was not reordered', 'no further queue changes were made')
          .replace('no item was moved', 'no further queue changes were made');
        if (operation.removed && /could not|not (?:fully )?confirmed|queue changed|playback changed|unconfirmed/i.test(message)) {
          message = operation.removed + (operation.removed === 1 ? ' duplicate queue entry was removed. ' : ' duplicate queue entries were removed. ') + message;
        }
      }
      if (message) notify(message);
    }

    function tryMoveNext() {
      if (!pending) return;
      const operation = pending;
      try {
        if (uniqueVideos && operation.deadline && Date.now() >= operation.deadline) {
          finish('The queue update was not fully confirmed. Please check the queue.', true); return;
        }
        const playing = activeVideoId();
        // Native player adoption can briefly fade the sole player, or expose
        // both retained hosts. Unknown visibility is not a playback change.
        // Wait for the next native signal within this operation's deadline.
        if (playing === undefined) return;
        if (playing !== operation.anchor) {
          finish("Playback changed; the queue was not reordered.");
          return;
        }
        const player = activePlayer(operation.anchor);
        if (uniqueVideos && (player?.classList.contains('ad-showing') || player?.classList.contains('ad-interrupting') ||
            operation.mode === 'normalise' && document.hidden)) return;
        const activeListId = player?.getPlaylistId?.();
        if (operation.listId && activeListId !== operation.listId &&
            !((activeListId == null || activeListId === "") && operation.mini &&
              player?.closest("ytd-miniplayer") === operation.mini)) {
          finish("The queue changed; no item was moved.");
          return;
        }
        if (operation.restore) {
          const proof = operation.restore;
          const ids = player?.getPlaylist?.();
          // Home can stop exposing its queue ID while the same native player
          // restores its panel. Keep the captured ID for the panel check below;
          // a different non-empty ID, player or ordered playlist still cancels.
          if (player !== proof.player || player.closest('ytd-miniplayer') !== proof.mini ||
              (activeListId !== proof.listId && activeListId != null && activeListId !== "") || !Array.isArray(ids) ||
              (!sameIds(ids, proof.ids) && !sameIds(ids, [...proof.ids, operation.videoId]))) {
            finish("The queue changed; no item was moved.");
            return;
          }
        }
        const queue = queueState(operation.anchor);
        if (pending !== operation) return;
        if (operation.preparing) {
          const current = miniplayerQueue(player, operation.anchor);
          if (player !== operation.player || !current?.mini || current.mini !== operation.mini || !sameIds(current.ids, operation.ids)) {
            finish("The queue changed; no video was added.");
            return;
          }
          if (!queue || queue.unavailable || queue.awaitingPanel || !reorderRows(queue)) return;
          if (operation.listId && queue.listId !== operation.listId) {
            finish("The queue changed; no video was added.");
            return;
          }
          const { entry, popup, activation, mode } = operation;
          finish();
          begin(entry, popup, activation, mode);
          return;
        }
        if (!queue || queue.unavailable || queue.awaitingPanel) return;
        if (operation.restore) {
          const proof = operation.restore;
          if (queue.mini !== proof.mini || queue.listId !== proof.listId ||
              queue.currentIndex !== proof.currentIndex) {
            finish("The queue changed; no item was moved.");
            return;
          }
          const ids = queue.videos.map(video => video.videoId);
          // Restoring the panel and accepting its append are separate native
          // updates. The exact original queue is still a valid waiting state;
          // only its verified append may progress to the reorder below.
          if (sameIds(ids, proof.ids)) return;
          if (!sameIds(ids, [...proof.ids, operation.videoId])) {
            finish("The queue changed; no item was moved.");
            return;
          }
          if (!reorderRows(queue)) return; // Native model and rows may stamp separately.
          const entries = queueEntries(queue.videos);
          if (entries.some(entry => typeof entry.playlistSetVideoId !== 'string' || !entry.playlistSetVideoId) ||
              new Set(entries.map(entry => entry.playlistSetVideoId)).size !== entries.length) {
            finish("Could not identify the queue entries. Please reorder them manually.");
            return;
          }
          operation.appendProof = captureOrderProof(queue, player, entries.slice(0, -1), proof.ids);
          operation.restore = null;
        }
        if (operation.listId && queue.listId !== operation.listId) {
          finish("The queue changed; no item was moved.");
          return;
        }
        const currentIndex = queue.currentIndex;
        if (uniqueVideos && !operation.committed && !uniqueQueueStep(queue, player, operation)) return;
        if (uniqueVideos && operation.mode === 'normalise') {
          finish(operation.removed ? 'Removed duplicate queue entries' : undefined); return;
        }
        if (uniqueVideos && operation.videoId === operation.anchor) { finish('This video is already playing.'); return; }
        const next = queue.videos[operation.mode === 'tail' ? queue.videos.length - 1 : currentIndex + 1];
        if (operation.committed) {
          // A duplicate video may have appeared next independently while the
          // native move was pending. Confirm the specific committed queue
          // entry, not merely another occurrence with the same video ID.
          if (next?.videoId === operation.videoId && next.playlistSetVideoId === operation.entryId &&
              (!uniqueVideos || sameEntries(queueEntries(queue.videos), operation.move.expectedEntries))) {
            rememberMiniOrder(queue, player, operation.move, operation.move.expectedEntries, operation);
            if (pending !== operation) return;
            finish(operation.mode === 'tail' ? 'Queued at the end' : "Playing next in queue");
          }
          return; // Wait for native data to confirm, never commit twice.
        }
        if (next?.videoId === operation.videoId) {
          const entries = queueEntries(queue.videos);
          if (isAppendOrder(entries, operation.appendProof, operation.videoId)) {
            rememberMiniOrder(queue, player, operation.appendProof, entries, operation);
          }
          if (pending !== operation) return;
          finish(operation.mode === 'tail' ? 'Queued at the end' : "Playing next in queue"); return;
        }
        const matches = queue.videos.flatMap((video, index) => video.videoId === operation.videoId ? [index] : []);
        if (!matches.length) return;
        if (matches.length > 1) {
          finish("This video appears more than once in the queue. Please reorder it manually.");
          return;
        }
        const index = matches[0];
        if (index === currentIndex) { finish("Playing next in queue"); return; }
        const binding = reorderRows(queue);
        if (!binding) return;
        const entryId = queue.videos[index].playlistSetVideoId;
        if (!entryId || queue.videos.filter(video => video.playlistSetVideoId === entryId).length !== 1) {
          finish("Could not identify the queue entry. Please reorder it manually.");
          return;
        }
        const { items, rows } = binding;
        const row = rows[index];
        const nodes = [...items.childNodes];
        const expected = nodes.filter(node => node !== row);
        expected.splice(operation.mode === 'tail' ? expected.indexOf(rows[rows.length - 1]) + 1 : expected.indexOf(rows[currentIndex]) + 1, 0, row);
        const playlist = player.getPlaylist?.();
        const expectedEntries = queueEntries(queue.videos);
        const [movedEntry] = expectedEntries.splice(index, 1);
        expectedEntries.splice(operation.mode === 'tail' ? expectedEntries.length : index < currentIndex ? currentIndex : currentIndex + 1, 0, movedEntry);
        operation.move = { anchor: operation.anchor, expectedEntries, panel: queue.panel, owner: queue.owner, player, items, rows, rowOwners: rows.map(controller), row, nodes, expected,
          entries: queue.videos.map(video => ({ videoId: video.videoId, playlistSetVideoId: video.playlistSetVideoId })),
          currentIndex, listId: queue.listId, playerListId: player.getPlaylistId?.(),
          playerPlaylist: Array.isArray(playlist) ? [...playlist] : playlist, mini: player.closest('ytd-miniplayer'), from: index,
          currentEntryId: queue.videos[currentIndex].playlistSetVideoId, playerIndex: uniqueVideos ? player.getPlaylistIndex?.() : undefined };
        // This is the same DOM move + controller commit used by native dragging.
        // Never change the queue model, call a private network API or reload playback.
        if (pending !== operation) return;
        items.insertBefore(row, operation.mode === 'tail' ? rows[rows.length - 1].nextSibling : rows[currentIndex].nextSibling);
        if (pending !== operation) return;
        operation.committed = true;
        operation.entryId = entryId;
        try {
          const commit = queue.owner.handleDrop;
          // Native method accessors can synchronously navigate or suspend the
          // page. A returned callable cannot revive that cancelled operation.
          if (pending !== operation) return;
          commit.call(queue.owner, { currDragItem: row });
          if (pending === operation) scheduleMove();
        } catch {
          // Never retry an ambiguous native commit. Only restore the owned DOM
          // move when every captured native binding still proves no change.
          if (pending === operation) finish("Could not confirm Play next. Please check the queue.", true);
        }
      } catch {
        if (pending === operation) finish("Could not move the video next. Please check the queue.", true);
      }
    }

    function scheduleMove() {
      if (!pending) return;
      const operation = pending;
      // Native stamping can finish inside an animation frame. Waiting for a
      // second frame paints the temporary tail position before moving it next.
      // Coalesce after the native stack, but before paint; readiness and commit
      // guards in tryMoveNext still own every move and confirmation attempt.
      if (!operation.moveQueued) {
        operation.moveQueued = true;
        queueMicrotask(() => {
          if (pending !== operation) return;
          operation.moveQueued = false;
          tryMoveNext();
        });
      }
      // A native row/model binding may settle in a later microtask without
      // another observable mutation. Retain one coalesced frame as a backstop,
      // not a polling loop; an unready attempt waits for the next native signal.
      if (!operation.frame) operation.frame = requestAnimationFrame(() => {
        if (pending !== operation) return;
        operation.frame = 0;
        tryMoveNext();
      });
    }

    function nativeQueueChanged() {
      if (pending) { scheduleMove(); return; }
      if (uniqueVideos) scheduleUniqueQueue();
      if (!hasConfirmedMiniOrders) return;
      // Record each independently verified native advance, even when the user
      // does not choose Play next between videos. Coalescing these signals can
      // lose the intermediate entry and strand an otherwise coherent queue.
      try {
        const anchor = activeVideoId();
        if (!anchor) return;
        const player = activePlayer(anchor), proof = confirmedMiniOrders.get(player);
        if (proof && anchor !== proof.anchor && confirmedAnchor(proof, anchor)) queueState(anchor);
      } catch { /* A changing native binding must not manufacture order proof. */ }
    }

    function queueDispatcher(popup) {
      const app = document.querySelector("ytd-app");
      // Some older clients expose this method on the host, others only on its
      // controller. Preserve the callable receiver rather than choosing blindly.
      const targets = popup.matches("yt-sheet-view-model") ? [app, popup] : [popup, app];
      for (const target of targets) {
        for (const owner of [target, controller(target)]) {
          const resolve = owner?.resolveCommand;
          if (typeof resolve === "function") return endpoint => resolve.call(owner, endpoint);
        }
      }
      if (!app?.isConnected) return null;
      // Current clients no longer expose resolveCommand on elements. This is
      // YouTube's native action-router contract; its handler invokes the internal
      // command service and appends an acknowledgement to returnValue.
      return endpoint => {
        const action = { actionName: "yt-command-executor-command", optionalAction: false,
          args: [endpoint, popup], returnValue: [] };
        app.dispatchEvent(new CustomEvent("yt-action", { detail: action, bubbles: true, composed: true }));
        return action.returnValue.length > 0;
      };
    }

    function observeQueue() {
      const observer = new MutationObserver(records => {
        if (records.some(record => record.target.closest?.(panelSelector) ||
            [...record.addedNodes].some(node => node.matches?.(panelSelector) || node.querySelector?.(panelSelector)))) scheduleMove();
      });
      observer.observe(document.querySelector("ytd-app") || document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ["selected", "aria-selected", "href"],
      });
      return observer;
    }

    function queueExpansionControl(queue) {
      const toggles = queue?.mini ? [...queue.mini.querySelectorAll("ytd-miniplayer-info-bar button[aria-expanded]")]
        .filter(button => button.closest("ytd-miniplayer") === queue.mini && isVisibleQueuePlayer(button)) : [];
      return toggles.length === 1 && ['true', 'false'].includes(toggles[0].getAttribute('aria-expanded')) ? toggles[0] : null;
    }

    function queueRestorationProof(queue, entry, anchor) {
      const player = activePlayer(anchor);
      const listId = player?.getPlaylistId?.();
      if (!queue?.awaitingPanel || !queue.mini || player?.closest('ytd-miniplayer') !== queue.mini ||
          typeof listId !== 'string' || !listId.startsWith('TLPQ') ||
          player.classList.contains('ad-showing') || queue.ids.includes(entry.videoId) ||
          new Set(queue.ids).size !== queue.ids.length) return null;
      return { player, mini: queue.mini, listId, ids: [...queue.ids], currentIndex: queue.ids.indexOf(anchor) };
    }

    function prepareMiniplayer(entry, popup, anchor, activation, startingGeneration, mode) {
      const player = activePlayer(anchor);
      const queue = miniplayerQueue(player, anchor);
      const toggle = queueExpansionControl(queue);
      if (!toggle) {
        notify("Could not prepare Play next. Expand the video player once, then try again. Nothing was added.");
        return;
      }
      // Expansion can stamp asynchronously. The same ordered video IDs do not
      // identify a replacement player or another queue created meanwhile.
      const listId = player.getPlaylistId?.();
      if (operationGeneration !== startingGeneration) return;
      const operation = pending = { anchor, player, listId, videoId: entry.videoId, entry, popup, activation, mode, preparing: true, generation: ++operationGeneration,
        mini: queue.mini, ids: queue.ids, observer: observeQueue(), moveQueued: false, frame: 0, timer: 0 };
      operation.timer = setTimeout(() => {
        if (pending === operation) finish("Could not prepare Play next. Nothing was added; please try again.");
      }, 2000);
      // The native queue header is outside the player's unrelated expand controls.
      if (toggle.getAttribute("aria-expanded") === "false") toggle.click();
      scheduleMove();
    }

    function begin(entry, popup, activation = menuActivation, mode = 'next') {
      if (entry.used === activation) return;
      if (navigating || pageSuspended) {
        notify("YouTube is changing pages. Reopen the menu once it finishes.");
        return;
      }
      const startingGeneration = operationGeneration;
      // Native menu objects can be recycled in place while a menu or queue
      // preparation is open. Never dispatch a changed command under an older
      // captured video ID, even when its object identity was retained.
      const fresh = queueCommand(entry.sourceItem);
      if (!fresh || fresh.videoId !== entry.videoId || fresh.endpoint !== entry.endpoint ||
          fresh.command !== entry.command || entry.signature === null || fresh.signature !== entry.signature) {
        notify("This menu changed. Reopen it and choose Play next again.");
        return;
      }
      if (pending) { notify("Please wait for the queue to update, then try again."); return; }
      const anchor = activeVideoId();
      if (anchor === undefined) { notify("Could not identify the playing video. Please try again."); return; }
      const queue = anchor ? queueState(anchor) : null;
      if (uniqueVideos && anchor && (activePlayer(anchor)?.classList.contains('ad-showing') ||
          activePlayer(anchor)?.classList.contains('ad-interrupting'))) {
        notify('The native player is busy. Nothing was changed; please try again.'); return;
      }
      if (queue?.unavailable) { notify("The queue is still updating. Please try again."); return; }
      if (anchor === entry.videoId && !uniqueVideos) { notify("This video is already playing."); return; }
      if (uniqueVideos && anchor === entry.videoId && !queue) { notify('This video is already playing.'); return; }
      if (uniqueVideos && anchor && !queue && activePlayer(anchor)?.getPlaylistId?.()?.startsWith('TLPQ')) {
        notify('The queue is still updating. Nothing was added; please try again.'); return;
      }
      let restore = null;
      if (queue?.awaitingPanel || (queue?.mini && !reorderRows(queue))) {
        // After end-of-video adoption YouTube can retain its queue in the
        // player but discard both its panel and expansion control. A single
        // original native append can restore that presentation. Require the
        // exact old queue plus this one addition before attempting any move.
        if (!queueExpansionControl(queue)) restore = queueRestorationProof(queue, entry, anchor);
        if (!restore) {
          prepareMiniplayer(entry, popup, anchor, activation, startingGeneration, mode);
          return;
        }
      }
      const playlist = anchor && activePlayer(anchor)?.getPlaylist?.();
      if (uniqueVideos && queue?.videos && !uniqueInitialOrder(queue, activePlayer(anchor), playlist)) {
        notify('The native queue order is unavailable. Nothing was changed; please try again.'); return;
      }
      const existing = queue?.videos?.some(video => video.videoId === entry.videoId) ||
        ((!uniqueVideos || queue?.awaitingPanel) && Array.isArray(playlist) && playlist.includes(entry.videoId)) ||
        (uniqueVideos && anchor === entry.videoId);
      if (queue && !existing && !restore && !reorderRows(queue)) {
        notify("The queue is still updating. Nothing was added; please try again.");
        return;
      }
      const dispatch = existing ? null : queueDispatcher(popup);
      if (!existing && !dispatch) { notify("Play next is unavailable in this menu."); return; }
      if (operationGeneration !== startingGeneration) return;
      entry.used = activation; // Consume one opening, not a cached native model forever.
      const generation = ++operationGeneration;
      if (anchor) {
        const operation = pending = { anchor, videoId: entry.videoId, mode, listId: restore?.listId || queue?.listId, mini: queue?.mini, generation, restore,
          deadline: uniqueVideos ? Date.now() + 8000 : undefined,
          observer: observeQueue(), moveQueued: false, frame: 0, timer: 0 };
        if (uniqueVideos && queue?.videos) operation.uniquenessProof = captureOrderProof(queue, activePlayer(anchor), queueEntries(queue.videos), playlist);
        if (!existing && queue && !restore) operation.appendProof = captureOrderProof(queue, activePlayer(anchor), queueEntries(queue.videos), playlist);
        if (pending !== operation) return;
        operation.timer = setTimeout(() => {
          if (pending !== operation) return;
          if (operation.committed || (uniqueVideos && operation.removal)) tryMoveNext(); // A native confirmation may have settled silently.
          if (pending !== operation) return;
          finish(operation.committed ? "Could not confirm Play next. Please check the queue."
            : existing ? "Could not move the queued video next. Please try again."
              : "Added to queue, but could not move it next. Please check the queue.", true);
        }, 8000);
      }
      if (!existing) {
        const reservationPlayer = anchor && activePlayer(anchor);
        const reservationListId = restore?.listId || queue?.listId;
        const command = { ...entry.command };
        // Resolving a native dispatcher can recycle the source command in
        // place. Validate the materialised copy before changing our one field.
        if (boundedMenuSignature(command) !== entry.signature) {
          if (operationGeneration === generation && (!anchor || pending?.generation === generation)) {
            finish("This menu changed. Reopen it and choose Play next again.");
          }
          return;
        }
        if (mode !== 'tail' || restore) command.openMiniplayer = restore ? true : anchor ? false : command.openMiniplayer;
        const endpoint = {
          ...entry.endpoint,
          signalServiceEndpoint: { ...entry.endpoint.signalServiceEndpoint,
            actions: [{ ...entry.endpoint.signalServiceEndpoint.actions[0], addToPlaylistCommand: command }] },
        };
        // Native metadata getters can synchronously navigate or suspend while
        // the dispatch copy is built. Recheck its generation at the final
        // side-effect boundary, including queue creation without a player.
        if (operationGeneration !== generation || (anchor && pending?.generation !== generation)) return;
        if (!reserveAppend(reservationPlayer, reservationListId, entry.videoId)) {
          finish('An earlier queue addition is still unconfirmed. Nothing was added.'); return;
        }
        // Keep the original native creation command and metadata. Do not retry:
        // an ambiguous resolver result can still mean the video was added.
        if (dispatch(endpoint) === false) {
          finish("YouTube could not accept Play next. Please check the queue.");
          return;
        }
      }
      scheduleMove();
    }

    function dismissMenu(popup) {
      const dropdown = popup.closest("tp-yt-iron-dropdown");
      for (const owner of new Set([dropdown, controller(dropdown)])) {
        if (typeof owner?.close !== "function") continue;
        owner.close();
        return; // A throwing native close is not retried through another route.
      }
      // Current sheet hosts can omit the dropdown method. Ask YouTube's popup
      // owner to close this renderer, without hiding DOM or clicking elsewhere.
      popup.dispatchEvent(new CustomEvent("yt-action", { bubbles: true, composed: true,
        detail: { actionName: "yt-close-popup-action", optionalAction: false,
          args: [popup.localName], returnValue: [] } }));
    }

    function boundedMenuSignature(model) {
      try {
        let fields = 0;
        const value = JSON.stringify(model, (_key, entry) => {
          if (++fields > 1000 || (typeof entry === 'string' && entry.length > 16384)) throw new Error('Menu signature exceeds its bound');
          return entry;
        });
        return typeof value === 'string' && value.length <= 32768 ? value : null;
      }
      catch { return null; }
    }

    function ownedRowMatches(row, record) {
      try {
        const model = typeof row?.componentProps?.data === 'function'
          ? row.componentProps.data() : controller(row)?.data;
        // Native sheet rows can expose an opaque/write-only model. An explicit
        // object binding is stronger evidence than a retained data-target-id.
        if (!model || typeof model !== 'object') return true;
        const bound = model.listItemViewModel || model.menuServiceItemRenderer || model;
        if (bound === record) return true;
        const expected = boundedMenuSignature(record);
        return expected !== null && boundedMenuSignature(bound) === expected;
      } catch { return false; } // Disposal must not cancel another accepted request.
    }

    function clearPendingIcons(popup = null) {
      for (const item of pendingIcons) if (!popup || item.popup === popup || popup.contains?.(item.svg)) {
        item.svg.remove(); pendingIcons.delete(item);
      }
      if (!pendingIcons.size) { pendingIconObserver?.disconnect(); pendingIconObserver = null; }
    }

    function prunePendingIcons() {
      for (const item of pendingIcons) {
        let valid = false;
        try {
          const binding = menuBindings.get(item.popup);
          const data = binding?.sheet ? sheetData(item.popup) : controller(item.popup)?.data;
          valid = item.svg.isConnected && binding && binding === item.binding && data === binding.data &&
            boundedMenuSignature(binding.record) === binding.ownedSignature && item.row.contains(item.svg) &&
            (binding.sheet ? item.row.matches('yt-list-item-view-model[data-target-id="yt-master-play-next"]') : controller(item.row)?.data === binding.record) &&
            ![...item.slot.children].some(child => child !== item.svg);
        } catch { /* A dismissed or rebound renderer releases the temporary glyph. */ }
        if (!valid) { item.svg.remove(); pendingIcons.delete(item); }
      }
      if (!pendingIcons.size) { pendingIconObserver?.disconnect(); pendingIconObserver = null; }
    }

    function showPendingPlayNextIcon(popup) {
      const binding = menuBindings.get(popup);
      if (!binding || !popup.isConnected) return;
      let row;
      try {
        row = binding.sheet
          ? popup.querySelector('yt-list-item-view-model[data-target-id="yt-master-play-next"]')
          : [...popup.querySelectorAll('ytd-menu-service-item-renderer')].find(node => controller(node)?.data === binding.record);
        if (!row || (binding.sheet ? sheetData(popup) !== binding.data : controller(popup)?.data !== binding.data)) return;
      } catch { clearPendingIcons(popup); return; } // Native row getters can dispose before the queued icon pass.
      binding.row = row;
      // YouTube's known icon-shape renderer leaves this host empty while its
      // SVG promise is pending, then replaces its children when the icon loads.
      // Supply only our action's temporary glyph; never replace native content.
      const slot = row.querySelector(binding.sheet ? '.ytListItemViewModelLeading .yt-icon-shape' : 'yt-icon .yt-icon-shape');
      if (!slot || slot.childElementCount) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('data-ytms-play-next-fallback', '1');
      svg.style.cssText = 'display:block;width:24px;height:24px;fill:currentColor;pointer-events:none';
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', 'M3 6h12v2H3V6zm0 4h12v2H3v-2zm0 4h8v2H3v-2zm14-4v10l6-5-6-5z');
      svg.append(path); slot.append(svg);
      pendingIcons.add({ svg, slot, row, popup, binding });
      if (!pendingIconObserver) pendingIconObserver = new MutationObserver(prunePendingIcons);
      pendingIconObserver.observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-target-id'] });
      if (row.parentElement) pendingIconObserver.observe(row.parentElement, { childList: true });
      pendingIconObserver.observe(popup, { childList: true });
    }

    function captureNativeQueueMenu(popup) {
      if (!uniqueVideos || !queueMenuBindings?.capture || !popup?.matches?.('ytd-menu-popup-renderer, yt-sheet-view-model')) return;
      try {
        const sheet = popup.matches('yt-sheet-view-model'), data = sheet ? sheetData(popup) : controller(popup)?.data;
        const items = sheet ? data?.content?.listViewModel?.listItems : data?.items;
        const rows = [...popup.querySelectorAll('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, ytd-menu-service-item-download-renderer, yt-list-item-view-model, yt-download-list-item-view-model')]
          .filter(row => row.closest('ytd-menu-popup-renderer, yt-sheet-view-model') === popup &&
            (!row.closest('yt-download-list-item-view-model') || row.matches('yt-download-list-item-view-model')));
        queueMenuBindings.capture(popup, { data, items, rows, sheet });
      } catch { /* A partially stamped popup has no native action ownership. */ }
    }

    function openMenu(event) {
      const popup = event.target;
      if (!popup?.matches?.("ytd-menu-popup-renderer, yt-sheet-view-model")) return;
      captureNativeQueueMenu(popup);
      queueMicrotask(() => captureNativeQueueMenu(popup));
      try {
        const sheet = popup.matches("yt-sheet-view-model");
        clearPendingIcons(popup);
        sheets.delete(popup);
        const owner = controller(popup);
        const data = sheet ? sheetData(popup) : owner?.data;
        const list = data?.content?.listViewModel;
        const sourceItems = sheet ? list?.listItems : data?.items;
        if (!Array.isArray(sourceItems) || sourceItems.length > 60 ||
            (sheet ? typeof popup.setters?.data !== "function" : typeof owner.set !== "function")) return;
        const cached = menuBindings.get(popup);
        const cachedEntry = cached && queueCommand(sourceItems[cached.queueIndex]);
        if (cached && cached.data === data && cached.items === sourceItems &&
            cached.row?.isConnected && cached.row.closest('ytd-menu-popup-renderer, yt-sheet-view-model') === popup &&
            (sheet ? cached.row.matches('yt-list-item-view-model[data-target-id="yt-master-play-next"]') : controller(cached.row)?.data === cached.record) &&
            cached.rows.length === sourceItems.length && cached.rows.every((item, index) => sourceItems[index] === item) &&
            (sourceItems[cached.ownedIndex]?.menuServiceItemRenderer || sourceItems[cached.ownedIndex]?.listItemViewModel) === cached.record &&
            cached.record[marker] === true && cachedEntry?.videoId === cached.entry.videoId &&
            cachedEntry.endpoint === cached.entry.endpoint && cachedEntry.command === cached.entry.command &&
            cached.signature !== null && cachedEntry.signature === cached.signature &&
            cached.ownedSignature !== null && boundedMenuSignature(cached.record) === cached.ownedSignature) {
          // Cached native rows already have the owned action. Renew its fresh
          // activation binding without replacing the complete native menu.
          if (sheet) sheets.set(popup, { data, entry: cachedEntry });
          else entries.set(cached.record, cachedEntry);
          showPendingPlayNextIcon(popup);
          return;
        }
        if (cached) entries.delete(cached.record);
        menuBindings.delete(popup);
        const items = sourceItems.filter(item =>
          (item?.menuServiceItemRenderer || item?.listItemViewModel)?.[marker] !== true);
        if (items.some(item => {
          const icon = item?.menuServiceItemRenderer?.icon?.iconType ||
            item?.listItemViewModel?.leadingImage?.sources?.[0]?.clientResource?.imageName;
          return ["QUEUE_PLAY_NEXT", "ADD_TO_QUEUE_HEAD"].includes(icon?.toUpperCase());
        })) return;
        const index = items.findIndex(item => queueCommand(item));
        if (index < 0 || (sheet && !items[index].listItemViewModel)) return;
        const entry = queueCommand(items[index]);
        const endpoint = { signalServiceEndpoint: { signal: "CLIENT_SIGNAL", actions: [] } };
        if (sheet) {
          const record = {
            ...items[index].listItemViewModel,
            title: { content: "Play next in queue" },
            leadingImage: { sources: [{ clientResource: { imageName: "QUEUE_PLAY_NEXT" } }] },
            rendererContext: { accessibilityContext: { label: "Play next in queue" },
              commandContext: { onTap: { innertubeCommand: endpoint } } },
            targetId: "yt-master-play-next", [marker]: true,
          };
          items.splice(index, 0, { listItemViewModel: record });
          const updated = { ...data, content: { ...data.content, listViewModel: { ...list, listItems: items } } };
          // Native view-model rows do not expose .data. Bind activation to the
          // owned sheet's exact model and native target ID, not text or position.
          sheets.set(popup, { data: updated, entry });
          popup.data = updated;
          menuBindings.set(popup, { sheet, data: updated, items, rows: [...items], record,
            ownedIndex: index, queueIndex: index + 1, entry, signature: entry.signature, ownedSignature: boundedMenuSignature(record) });
        } else {
          const record = {
            text: { simpleText: "Play next in queue" }, icon: { iconType: "QUEUE_PLAY_NEXT" },
            serviceEndpoint: endpoint, [marker]: true,
          };
          entries.set(record, entry);
          items.splice(index, 0, { menuServiceItemRenderer: record });
          const updated = { ...data, items };
          owner.set("data", updated);
          menuBindings.set(popup, { sheet, data: updated, items, rows: [...items], record,
            ownedIndex: index, queueIndex: index + 1, entry, signature: entry.signature, ownedSignature: boundedMenuSignature(record) });
        }
        showPendingPlayNextIcon(popup);
        queueMicrotask(() => showPendingPlayNextIcon(popup));
        // Stamp through the native menu, then let its dropdown fit the extra row.
        if (menuFrame) cancelAnimationFrame(menuFrame);
        menuFrame = requestAnimationFrame(() => {
          menuFrame = 0;
          showPendingPlayNextIcon(popup);
          if (popup.isConnected) popup.closest("tp-yt-iron-dropdown")?.refit?.();
        });
      } catch { /* An unrecognised menu keeps its native Add to queue action. */ }
    }

    function renewMenuActivation(event) {
      if (!event.isTrusted || !event.target?.isConnected ||
          (event.type === 'keydown' && (event.repeat || !['Enter', ' ', 'ArrowDown'].includes(event.key))) ||
          event.target.closest?.('ytd-menu-popup-renderer, yt-sheet-view-model')) return;
      // Cached native menus can reopen without yt-popup-opened. A fresh trusted
      // outside-menu activation rearms them; events within one opening share the
      // same token, retaining the keydown/click/tap duplicate guard.
      ++menuActivation;
    }

    function activate(event) {
      const source = event.detail?.sourceEvent;
      if (!event.isTrusted && !(source instanceof Event && source.isTrusted)) return;
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      const row = event.target?.closest?.("ytd-menu-service-item-renderer, yt-list-item-view-model");
      const popup = row?.closest("ytd-menu-popup-renderer, yt-sheet-view-model");
      const sheet = sheets.get(popup);
      let entry, nativeItem, mode = 'next';
      try {
        entry = row?.matches('yt-list-item-view-model[data-target-id="yt-master-play-next"]')
          ? sheet?.entry
          : row && entries.get(controller(row)?.data);
        if (!entry && uniqueVideos) {
          nativeItem = queueMenuBindings?.get(row, popup)?.item;
          const record = nativeItem?.menuServiceItemRenderer || nativeItem?.listItemViewModel;
          const icon = record?.icon?.iconType || record?.leadingImage?.sources?.[0]?.clientResource?.imageName;
          const parsed = queueCommand(nativeItem);
          if (parsed) {
            const cached = nativeQueueEntries.get(nativeItem);
            entry = cached?.signature === parsed.signature && cached.endpoint === parsed.endpoint && cached.command === parsed.command ? cached : parsed;
            nativeQueueEntries.set(nativeItem, entry);
            mode = ['QUEUE_PLAY_NEXT', 'ADD_TO_QUEUE_HEAD'].includes(icon?.toUpperCase()) ? 'next' : 'tail';
          }
        }
      } catch { return; } // No verified owned action: leave native activation alone.
      if (!entry && uniqueVideos && queueMenuBindings?.isStaleQueueAction?.(row, popup)) {
        // A previously verified queue row with a recycled command must not
        // bypass the policy through its native handler. Unrelated/replaced
        // native actions are deliberately outside this narrow classification.
        event.preventDefault();
        event.stopImmediatePropagation();
        notify('This menu changed. Reopen it and choose the queue action again.');
        try { dismissMenu(popup); } catch { /* The native popup may already be disposed. */ }
        return;
      }
      if (!entry) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const previousOperation = pending;
      try {
        if (nativeItem) {
          if (!isVisibleQueuePlayer(popup) || !isVisibleQueuePlayer(row)) return;
          if (queueMenuBindings?.get(row, popup)?.item !== nativeItem) {
            notify('This menu changed. Reopen it and choose the queue action again.'); return;
          }
          begin(entry, popup, menuActivation, mode);
          return;
        }
        const binding = menuBindings.get(popup);
        const data = row.matches('yt-list-item-view-model') ? sheetData(popup) : controller(popup)?.data;
        const items = row.matches('yt-list-item-view-model') ? data?.content?.listViewModel?.listItems : data?.items;
        // The native renderer may reuse a record in place without reopening
        // its popup. A stale weak entry binding must not activate a row that
        // has since become a different action, even if Add to queue is intact.
        const ownedRecord = binding?.record;
        if (!binding || data !== binding.data || items !== binding.items || !items?.includes(entry.sourceItem) ||
            !items.some(item => (item?.menuServiceItemRenderer || item?.listItemViewModel) === ownedRecord) ||
            ownedRecord?.[marker] !== true || binding.ownedSignature === null ||
            boundedMenuSignature(ownedRecord) !== binding.ownedSignature ||
            !ownedRowMatches(row, ownedRecord) ||
            (!row.matches('yt-list-item-view-model') && controller(row)?.data !== ownedRecord)) {
          notify("This menu changed. Reopen it and choose Play next again.");
          return;
        }
        begin(entry, popup);
      }
      catch {
        // A disposed/rebound second popup does not own an earlier accepted
        // request. Cancel only work created by this activation, preserving the
        // first request's native append and its eventual reorder confirmation.
        if (pending !== previousOperation) finish("Play next could not be completed. Please check the queue.");
        else notify("Play next could not be completed. Please check the queue.");
      }
      finally {
        // Native activation is suppressed above, so dismiss rejected and
        // preparing selections too. Resolve/dispatch before native teardown.
        try { dismissMenu(popup); }
        catch { /* Closing an already disposed native popup is harmless. */ }
      }
    }

    function reset(event) {
      if (event?.type === 'yt-navigate-start') navigating = true;
      if (event?.type === 'pagehide') pageSuspended = true;
      ++operationGeneration;
      finish();
      // A completed queue may be adopted by the same player during SPA
      // navigation. Keep its weak proof, which still requires exact native
      // ownership, entry and row binding checks; cancel every pending move.
      // Page suspension and explicit disposal must discard that proof.
      if (event?.type !== 'yt-navigate-start') {
        confirmedMiniOrders = new WeakMap();
        hasConfirmedMiniOrders = false;
      }
      // YouTube may keep this native menu model and reopen its owned row
      // without another popup-open event after SPA navigation or BFCache.
      // Retain its weak bindings: the placeholder has no native command of its
      // own. Activation still requires the current exact model, source item
      // and unchanged command; detached/rebound menus retain no strong roots.
      clearPendingIcons();
      if (menuFrame) cancelAnimationFrame(menuFrame);
      menuFrame = 0;
      clearTimeout(toastTimer);
      toastTimer = 0;
      toast?.remove();
      toast = null;
    }
    window.addEventListener("yt-popup-opened", openMenu, true);
    ['yt-popup-closed', 'iron-overlay-closed'].forEach(type => window.addEventListener(type, event => {
      if (event.target?.contains) clearPendingIcons(event.target);
    }, true));
    ['click', 'keydown', 'contextmenu'].forEach(type => document.addEventListener(type, renewMenuActivation, true));
    ["click", "tap", "keydown"].forEach(type => document.addEventListener(type, activate, true));
    ["yt-playlist-data-updated", "yt-page-data-updated"].forEach(type => window.addEventListener(type, nativeQueueChanged, true));
    if (uniqueVideos) window.addEventListener('yt-rendererstamper-finished', event => {
      if (event.target?.matches?.('ytd-menu-popup-renderer, yt-sheet-view-model')) captureNativeQueueMenu(event.target);
      if (event.target?.closest?.(panelSelector)) {
        if (pending) scheduleMove(); else scheduleUniqueQueue();
      }
    }, true);
    if (uniqueVideos) document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { if (pending) scheduleMove(); else scheduleUniqueQueue(); }
    });
    ["yt-navigate-start", "pagehide"].forEach(type => window.addEventListener(type, reset, true));
    window.addEventListener('yt-navigate-finish', () => { navigating = false; }, true);
    window.addEventListener('pageshow', event => {
      // A late initial pageshow is not a completed SPA navigation. Only an
      // actual page suspension/restoration may release that interrupted lock.
      if (pageSuspended || event.persisted === true) navigating = false;
      pageSuspended = false;
      if (uniqueVideos) scheduleUniqueQueue();
    }, true);
    scheduleUniqueQueue();
    return reset;
  }

  function installQueueStepControls() {
    const panelSelector = "ytd-playlist-panel-renderer, yt-playlist-panel-renderer";
    const rowSelector = "ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer";
    const controlSelector = 'button[data-ywlc-queue-step]';
    const arrowPaths = { up: 'M0 16 8 0l8 16z', down: 'M0 0l8 16 8-16z' };
    const records = new Map();
    const listeners = [];
    const controller = node => node?.polymerController || node?.getPolymerController?.() || node;
    const validId = value => typeof value === "string" && /^[\w-]{11}$/.test(value);
    const same = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
    let frame = 0, pending = null, focusRequest = null, navigating = false, disposed = false;
    let navigationPending = false, pageSuspended = false;
    let toast = null, toastTimer = 0;
    const sharedStyle = typeof suite !== 'undefined' && typeof suite.setStyle === 'function' && typeof suite.removeStyle === 'function';
    const stepCss = `
      [data-ywlc-queue-step-controls] { position: relative !important; overflow: visible !important; }
      [data-ywlc-queue-step-controls] > button[data-ywlc-queue-step] {
        position: absolute; left: 50%; transform: translate(-50%, -50%); display: flex;
        align-items: center; justify-content: center; width: 24px; height: 24px;
        min-width: 0; padding: 0; margin: 0; border: 0; border-radius: 3px;
        background: transparent; color: var(--yt-spec-icon-inactive, var(--yt-spec-text-secondary, #aaa)); cursor: pointer; line-height: 0;
        opacity: 0; pointer-events: none;
      }
      [data-ywlc-queue-step="up"] { top: calc(50% - 18px); }
      [data-ywlc-queue-step="down"] { top: calc(50% + 18px); }
      :is(ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer):hover [data-ywlc-queue-step-controls] > button[data-ywlc-queue-step],
      [data-ywlc-queue-step-controls]:has(> button[data-ywlc-queue-step]:focus-visible) > button[data-ywlc-queue-step] {
        opacity: 1; pointer-events: auto;
      }
      [data-ywlc-queue-step-controls] > button[data-ywlc-queue-step]:hover:not(:disabled) {
        background: var(--yt-spec-10-percent-layer, #ffffff1a);
      }
      [data-ywlc-queue-step-controls] > button[data-ywlc-queue-step]:disabled { color: color-mix(in srgb, var(--yt-spec-icon-inactive, var(--yt-spec-text-secondary, #aaa)) 25%, transparent); cursor: default; }
      [data-ywlc-queue-step-controls] > button[data-ywlc-queue-step]:focus-visible { opacity: 1; pointer-events: auto; outline: 2px solid currentColor; outline-offset: 1px; }
      [data-ywlc-queue-step-controls] > button[data-ywlc-queue-step] svg { width: 14px; height: 14px; fill: currentColor; pointer-events: none; }
      .dragging [data-ywlc-queue-step-controls] > button[data-ywlc-queue-step] { visibility: hidden; }
      [data-ywlc-queue-presentation="1"] > #container,
      [data-ywlc-queue-presentation="1"] > a > #container { align-items: center !important; }
      [data-ywlc-queue-presentation="1"] :is(.playlist-drag-handle, a#thumbnail, ytd-thumbnail, yt-thumbnail-view-model, .ytThumbnailViewModelHost) {
        align-self: center !important;
      }
      [data-ywlc-queue-presentation="1"] #meta { min-width: 0; }
      #video-title[data-ywlc-queue-title="1"]:not([hidden]):not([aria-hidden="true"]) {
        display: -webkit-box;
        -webkit-box-orient: vertical !important; -webkit-line-clamp: 2 !important; line-clamp: 2 !important;
        overflow: hidden !important;
        text-overflow: ellipsis; white-space: normal; overflow-wrap: anywhere;
      }
      [data-ywlc-queue-title-tooltip] {
        position: fixed; z-index: 2203; box-sizing: border-box; width: max-content;
        max-width: min(320px, calc(100vw - 16px)); max-height: calc(100vh - 16px);
        padding: 8px; border-radius: 4px; background: #212121; color: #fff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, .24);
        font: 400 13px/1.4 Roboto, Arial, sans-serif; text-shadow: none;
        white-space: normal; overflow-wrap: anywhere; overflow: hidden; pointer-events: none;
      }
    `;
    let style = null;
    if (sharedStyle) suite.setStyle('watchLayoutCleanerQueueSteps', stepCss);
    else {
      style = document.createElement('style'); style.id = 'ywlc-queue-step-style'; style.textContent = stepCss;
      (document.head || document.documentElement).append(style);
    }
    const titlePresentation = installTitlePresentation();

    function installTitlePresentation() {
      const titleAttribute = 'data-ywlc-queue-title', rowAttribute = 'data-ywlc-queue-presentation';
      const tooltipId = 'ywlc-queue-title-tooltip';
      let active = null;
      const setAttribute = (node, name, value) => value === null ? node.removeAttribute(name) : node.setAttribute(name, value);
      function hideTooltip(current) {
        current.tooltip?.remove();
        current.tooltip = null;
        if (current.description) {
          const { node, before, owned } = current.description, value = node.getAttribute('aria-describedby');
          if (value === owned) setAttribute(node, 'aria-describedby', before);
          else if (value?.split(/\s+/).includes(tooltipId)) {
            const remaining = value.split(/\s+/).filter(id => id && id !== tooltipId).join(' ');
            setAttribute(node, 'aria-describedby', remaining || null);
          }
          current.description = null;
        }
      }
      function dismiss() {
        const current = active; active = null; if (!current) return;
        clearTimeout(current.timer); current.observer?.disconnect();
        for (const [node, type, callback] of current.listeners) node.removeEventListener(type, callback, true);
        hideTooltip(current);
        for (const { node, value } of current.nativeTitles) if (node.getAttribute('title') === '') setAttribute(node, 'title', value);
      }
      function cancel(target = null) {
        const current = active; if (!current) return;
        if (target && !current.title.contains(target)) { dismiss(); return; }
        clearTimeout(current.timer); current.timer = 0; current.silenced = true;
        // Closing our tooltip must not re-enable the browser's tooltip while
        // the same title remains hovered or keyboard-focused.
        hideTooltip(current);
      }
      function ownTitle(target) {
        const title = target?.closest?.(`[${titleAttribute}="1"]`), row = title?.closest(rowSelector);
        const panel = row?.closest(panelSelector), record = records.get(panel);
        if (!record?.titles?.has(title) || record.titles.get(title).row !== row) return null;
        return { title, row, panel, record, listId: record.owner.data?.playlistId,
          key: controller(row)?.data?.playlistSetVideoId };
      }
      function rendered(current) {
        if (disposed || navigating || document.hidden || pending || !current.title.isConnected ||
            current.title.getAttribute(titleAttribute) !== '1' || current.row.getAttribute(rowAttribute) !== '1' ||
            records.get(current.panel) !== current.record || controller(current.panel) !== current.record.owner ||
            typeof current.listId !== 'string' || !current.listId.startsWith('TLPQ') ||
            current.record.owner.data?.playlistId !== current.listId ||
            controller(current.row)?.data?.playlistSetVideoId !== current.key || dragging(current.record.owner) ||
            current.row.parentElement !== current.record.items || !current.record.titles.has(current.title)) return false;
        for (let node = current.title; node; node = node.parentElement) {
          if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
          const css = getComputedStyle(node);
          if (css.display === 'none' || (node === current.title && ['hidden','collapse'].includes(css.visibility)) || css.opacity === '0') return false;
        }
        const box = current.title.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
      }
      function truncated(title) {
        return title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1;
      }
      function text(title) { return (title.innerText || title.textContent || '').replace(/\s+/g, ' ').trim(); }
      function pointerInside(current) {
        const box = current.title.getBoundingClientRect(), point = current.pointer;
        return point && point.x >= box.left && point.x < box.right && point.y >= box.top && point.y < box.bottom;
      }
      function position(current) {
        const anchor = current.title.getBoundingClientRect(), box = current.tooltip.getBoundingClientRect();
        const left = Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8));
        const below = anchor.bottom + 8;
        const top = below + box.height <= innerHeight - 8 ? below : Math.max(8, anchor.top - box.height - 8);
        const nextLeft = `${Math.round(left)}px`, nextTop = `${Math.round(top)}px`;
        if (current.tooltip.style.left !== nextLeft) current.tooltip.style.left = nextLeft;
        if (current.tooltip.style.top !== nextTop) current.tooltip.style.top = nextTop;
      }
      function refresh() {
        const current = active; if (!current) return;
        if (!rendered(current) || (current.tooltip && current.tooltip.parentElement !== document.body) ||
            current.nativeTitles.some(({ node }) => node.getAttribute('title') !== '') ||
            [...current.title.querySelectorAll('[title]')].some(node => !current.nativeTitles.some(entry => entry.node === node)) ||
            (!current.focus && (!current.title.matches(':hover') || !pointerInside(current))) ||
            (current.focus && (document.activeElement !== current.focus || !current.focus.matches(':focus-visible')))) { dismiss(); return; }
        if (!current.ready || current.silenced || !truncated(current.title)) { hideTooltip(current); return; }
        const label = text(current.title); if (!label) { dismiss(); return; }
        if (!current.tooltip) {
          if (!document.body || document.getElementById(tooltipId)) { dismiss(); return; }
          const tooltip = document.createElement('div'); tooltip.id = tooltipId;
          tooltip.setAttribute('data-ywlc-queue-title-tooltip', ''); tooltip.setAttribute('role', 'tooltip');
          tooltip.textContent = label; current.tooltip = tooltip; document.body.append(tooltip);
          const node = current.focus || current.title, before = node.getAttribute('aria-describedby');
          const owned = [before, tooltipId].filter(Boolean).join(' ');
          current.description = { node, before, owned }; node.setAttribute('aria-describedby', owned);
        }
        if (current.tooltip.textContent !== label) current.tooltip.textContent = label;
        position(current);
      }
      function show(current) {
        if (active !== current) return;
        current.timer = 0; current.ready = true; refresh();
      }
      function start(found, focus = null, pointer = null) {
        if (active?.title === found.title && active.focus === focus) return;
        dismiss();
        const current = { ...found, focus, pointer, viewportWidth: innerWidth, viewportHeight: innerHeight,
          timer: 0, ready: false, silenced: false, tooltip: null, observer: null, listeners: [], nativeTitles: [], description: null };
        if (!rendered(current) || !text(current.title)) return;
        active = current;
        const nativeNodes = new Set([current.title, ...current.title.querySelectorAll('[title]')]);
        if (focus) nativeNodes.add(focus);
        for (let node = current.title.parentElement; node; node = node.parentElement) {
          if (node.hasAttribute('title')) nativeNodes.add(node); if (node === current.row) break;
        }
        // Empty title blocks inherited browser tooltips too. Preserve absence,
        // empty values and third-party updates rather than deleting attributes.
        for (const node of nativeNodes) {
          current.nativeTitles.push({ node, value: node.getAttribute('title') }); node.setAttribute('title', '');
        }
        const on = (node, type, callback) => { node.addEventListener(type, callback, true); current.listeners.push([node, type, callback]); };
        const exit = event => {
          if (current.focus) return;
          if (!current.title.contains(event.target)) { dismiss(); return; }
          const box = current.title.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX >= box.right || event.clientY < box.top || event.clientY >= box.bottom) dismiss();
          else if (event.isTrusted) current.pointer = { x: event.clientX, y: event.clientY };
        };
        on(document, 'pointermove', exit);
        on(current.title, 'pointerleave', () => { if (!current.focus) dismiss(); });
        on(document, 'mouseleave', event => { if (event.target === document || event.target === document.documentElement) dismiss(); });
        on(document, 'focusout', event => { if (event.target === current.focus) dismiss(); });
        on(document, 'scroll', dismiss); on(document, 'pointercancel', dismiss);
        on(document, 'visibilitychange', () => { if (document.hidden) dismiss(); });
        on(window, 'blur', dismiss);
        on(window, 'resize', event => {
          if (event.isTrusted || innerWidth !== current.viewportWidth || innerHeight !== current.viewportHeight) dismiss();
          else refresh(); // Native Suite layout hints are not viewport changes.
        });
        current.observer = new MutationObserver(refresh);
        current.observer.observe(current.title, { childList: true, subtree: true, characterData: true, attributes: true,
          attributeFilter: ['title', 'class', 'style', 'hidden', 'aria-hidden'] });
        for (let node = current.title.parentElement; node; node = node.parentElement) current.observer.observe(node, {
          attributes: true, attributeFilter: ['title', 'class', 'style', 'hidden', 'aria-hidden'] });
        if (focus) show(current); else current.timer = setTimeout(() => show(current), 500);
      }
      function clear(record) {
        if (active?.record === record) dismiss();
        for (const [title, entry] of record.titles || []) if (title.getAttribute(titleAttribute) === '1') setAttribute(title, titleAttribute, entry.before);
        for (const [row, before] of record.titleRows || []) if (row.getAttribute(rowAttribute) === '1') setAttribute(row, rowAttribute, before);
        record.titles?.clear(); record.titleRows?.clear();
      }
      function removeClonedDescription(node) {
        if (active?.description?.node === node) return;
        const value = node.getAttribute('aria-describedby');
        if (!value?.split(/\s+/).includes(tooltipId)) return;
        const remaining = value.split(/\s+/).filter(id => id && id !== tooltipId).join(' ');
        setAttribute(node, 'aria-describedby', remaining || null);
      }
      function cleanClonedPresentation(row, record) {
        const current = active;
        if (current?.record === record && current.row !== row && !current.row.isConnected &&
            controller(row)?.data?.playlistSetVideoId === current.key) {
          const counterpart = original => {
            const path = []; let node = original;
            while (node && node !== current.row) {
              const parent = node.parentNode; if (!parent) return null;
              path.push([...parent.childNodes].indexOf(node)); node = parent;
            }
            if (node !== current.row) return null;
            let candidate = row;
            for (const index of path.reverse()) candidate = candidate?.childNodes[index];
            return candidate?.isEqualNode(original) ? candidate : null;
          };
          // Read all counterparts before restoring any attributes. Recover a
          // suppressed value only from a proven clone of the same native row.
          const titles = current.nativeTitles.map(entry => ({ ...entry, clone: counterpart(entry.node) }));
          const description = current.description && { ...current.description, clone: counterpart(current.description.node) };
          for (const { clone, value } of titles) if (clone?.getAttribute('title') === '') setAttribute(clone, 'title', value);
          if (description?.clone?.getAttribute('aria-describedby') === description.owned) {
            setAttribute(description.clone, 'aria-describedby', description.before);
          }
        }
        // Unknown restamps still must not reference a tooltip owned by an old
        // element. Leave their other attributes untouched rather than guessing.
        for (const node of [row, ...row.querySelectorAll('[aria-describedby]')]) removeClonedDescription(node);
      }
      function sync(state, record) {
        record.titles ||= new Map(); record.titleRows ||= new Map();
        const rows = new Set(state.rows), titles = new Set();
        for (const row of state.rows) {
          if (!record.titleRows.has(row)) {
            cleanClonedPresentation(row, record);
            const before = row.getAttribute(rowAttribute);
            record.titleRows.set(row, before === '1' ? null : before); row.setAttribute(rowAttribute, '1');
          }
          for (const title of row.querySelectorAll('#video-title')) {
            if (title.closest(rowSelector) !== row) continue;
            titles.add(title);
            if (!record.titles.has(title)) {
              if (active?.record === record && active.row === row && !active.title.isConnected && title.isEqualNode(active.title)) {
                const original = active.nativeTitles.find(entry => entry.node === active.title);
                if (original && title.getAttribute('title') === '') setAttribute(title, 'title', original.value);
              }
              for (const node of title.querySelectorAll('[aria-describedby]')) removeClonedDescription(node);
              for (let node = title; node; node = node.parentElement) { removeClonedDescription(node); if (node === row) break; }
              const before = title.getAttribute(titleAttribute);
              record.titles.set(title, { row, before: before === '1' ? null : before }); title.setAttribute(titleAttribute, '1');
            }
          }
        }
        for (const [title, entry] of record.titles) if (!titles.has(title)) {
          if (title.getAttribute(titleAttribute) === '1') setAttribute(title, titleAttribute, entry.before); record.titles.delete(title);
        }
        for (const [row, before] of record.titleRows) if (!rows.has(row)) {
          if (row.getAttribute(rowAttribute) === '1') setAttribute(row, rowAttribute, before); record.titleRows.delete(row);
        }
        refresh();
      }
      return { sync, clear, dismiss, cancel,
        hover(event) {
          if (!event.isTrusted) return;
          const found = ownTitle(event.target); if (found) start(found, null, { x: event.clientX, y: event.clientY });
        },
        focus(event) {
          if (!event.target?.matches?.(':focus-visible') || event.target.closest('button, .playlist-drag-handle')) return;
          const found = ownTitle(event.target) || [...(records.get(event.target.closest(panelSelector))?.titles?.keys() || [])]
            .filter(title => event.target.contains(title)).map(ownTitle).find(item => item && rendered(item));
          if (found) start(found, event.target);
        },
      };
    }

    function listen(target, type, callback) {
      target.addEventListener(type, callback, true); listeners.push([target, type, callback]);
    }
    function visible(node) {
      if (!node?.isConnected || node.closest('[hidden], [inert], [aria-hidden="true"]') || !node.getClientRects().length) return false;
      for (let current = node; current; current = current.parentElement) {
        const css = getComputedStyle(current);
        if (css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility) || Number(css.opacity) === 0) return false;
      }
      return true;
    }
    function activePlayer() {
      const players = [...document.querySelectorAll('#movie_player')].filter(player => {
        if (!visible(player)) return false;
        const box = player.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      if (players.length !== 1 || players[0].classList.contains('ad-showing') || players[0].classList.contains('ad-interrupting')) return null;
      return players[0];
    }
    function dragging(owner) {
      const reorder = owner?.ytReorderableController;
      return Boolean(reorder && Object.getOwnPropertyNames(reorder).some(name =>
        name.endsWith('dragListGroup') && reorder[name]?.isDragging?.()));
    }
    function nativeGroups(owner) {
      const reorder = owner?.ytReorderableController;
      return (reorder ? Object.getOwnPropertyNames(reorder) : []).filter(name => name.endsWith('dragListGroup'))
        .map(name => reorder[name]).filter(group => group?.addEventListener && group?.removeEventListener);
    }
    function snapshot(panel) {
      try {
        if (!visible(panel)) return null;
        const owner = controller(panel), data = owner?.data, player = activePlayer();
        if (!player || typeof data?.playlistId !== 'string' || !data.playlistId.startsWith('TLPQ') ||
            typeof owner.handleDrop !== 'function' || owner.canReorder === false ||
            !(owner.canReorder === true || panel.hasAttribute('can-reorder')) || dragging(owner) ||
            !Array.isArray(data.contents) || !data.contents.length || data.contents.length > 1000 ||
            (Number.isInteger(data.totalVideos) && data.totalVideos !== data.contents.length)) return null;
        const videos = data.contents.map(item => item.playlistPanelVideoRenderer);
        if (videos.some(video => !validId(video?.videoId) || typeof video.playlistSetVideoId !== 'string' || !video.playlistSetVideoId) ||
            new Set(videos.map(video => video.playlistSetVideoId)).size !== videos.length) return null;
        const anchor = player.getVideoData?.()?.video_id, listId = player.getPlaylistId?.();
        if (!validId(anchor) || videos.filter(video => video.videoId === anchor).length !== 1) return null;
        const ids = videos.map(video => video.videoId), playlist = player.getPlaylist?.();
        if (playlist != null && !Array.isArray(playlist)) return null;
        const mini = player.closest('ytd-miniplayer');
        if (listId !== data.playlistId && !((listId == null || listId === '') && mini && panel.closest('ytd-miniplayer') === mini &&
            Array.isArray(playlist) && same(playlist, ids))) return null;
        if (Array.isArray(playlist) && !same(playlist, ids)) return null;
        let currentIndex = data.currentIndex;
        if (!('currentIndex' in data)) {
          const selected = videos.filter(video => video.selected === true);
          if (selected.length !== 1 || selected[0].videoId !== anchor) return null;
          currentIndex = videos.indexOf(selected[0]);
        }
        if (!Number.isInteger(currentIndex) || videos[currentIndex]?.videoId !== anchor) return null;
        const items = panel.querySelector('#items'), rows = items ? [...items.children] : [];
        if (rows.length !== videos.length || rows.some((row, index) => !row.matches(rowSelector) ||
            items.childNodes[index] !== row || controller(row)?.data?.videoId !== videos[index].videoId ||
            controller(row)?.data?.playlistSetVideoId !== videos[index].playlistSetVideoId)) return null;
        return { panel, owner, player, anchor, listId: data.playlistId, videos, items, rows,
          playerListId: listId, playerPlaylist: Array.isArray(playlist) ? [...playlist] : playlist,
          keys: videos.map(video => video.playlistSetVideoId) };
      } catch { return null; }
    }
    function notify(message) {
      clearTimeout(toastTimer); toast?.remove();
      toast = document.createElement('div'); toast.setAttribute('role', 'status');
      toast.setAttribute('data-ywlc-queue-step-status', ''); toast.textContent = message;
      Object.assign(toast.style, { position: 'fixed', bottom: '24px', left: '24px', zIndex: '2202',
        padding: '12px 16px', borderRadius: '8px', background: 'var(--yt-spec-raised-background, #212121)',
        color: 'var(--yt-spec-text-primary, #fff)', font: '14px Roboto, Arial, sans-serif',
        maxWidth: 'calc(100vw - 48px)', pointerEvents: 'none' });
      document.body?.append(toast);
      toastTimer = setTimeout(() => { toast?.remove(); toast = null; toastTimer = 0; }, 3000);
    }
    function disableAll() {
      for (const record of records.values()) for (const entry of record.controls.values()) {
        if (!entry.up.disabled) entry.up.disabled = true;
        if (!entry.down.disabled) entry.down.disabled = true;
      }
    }
    function currentControls(row, entry) {
      if (!entry || row.querySelector('.playlist-drag-handle') !== entry.handle ||
          !entry.handle.hasAttribute('data-ywlc-queue-step-controls') ||
          entry.handle.querySelectorAll(controlSelector).length !== 2) return false;
      return [['up', entry.up], ['down', entry.down]].every(([direction, button]) =>
        button.parentElement === entry.handle && button.getAttribute('data-ywlc-queue-step') === direction &&
        button.querySelector('svg path')?.getAttribute('d') === arrowPaths[direction]);
    }
    function removeControls(entry) {
      entry.up.remove(); entry.down.remove(); entry.handle.removeAttribute('data-ywlc-queue-step-controls');
    }
    function clearRecord(panel) {
      const record = records.get(panel); if (!record) return;
      record.observer.disconnect();
      titlePresentation.clear(record);
      for (const [group, type, callback] of record.groups) { try { group.removeEventListener(type, callback); } catch { /* Native disposal may already have run. */ } }
      for (const entry of record.controls.values()) removeControls(entry);
      records.delete(panel);
    }
    function finish(message) {
      if (pending) clearTimeout(pending.timer);
      pending = null;
      if (message) notify(message);
      schedule();
    }
    function rollbackOwned(operation) {
      try {
        const { panel, owner, player, anchor, listId, playerListId, playerPlaylist, items, rows, row, expected, keys, from } = operation;
        if (!panel.isConnected || controller(panel) !== owner || activePlayer() !== player ||
            player.getVideoData?.()?.video_id !== anchor || owner.data?.playlistId !== listId || dragging(owner) ||
            panel.querySelector('#items') !== items || !same(owner.data.contents.map(item => item.playlistPanelVideoRenderer?.playlistSetVideoId), keys)) return false;
        // Native dispatch can change the player before its renderer catches up.
        // Restore only while both original player bindings remain provable.
        const playlist = player.getPlaylist?.();
        if (player.getPlaylistId?.() !== playerListId || (Array.isArray(playerPlaylist)
          ? !Array.isArray(playlist) || !same(playlist, playerPlaylist)
          : playerPlaylist != null || playlist !== playerPlaylist)) return false;
        const current = [...items.children];
        if (current.length !== rows.length || !same(current.map(item => controller(item)?.data?.playlistSetVideoId), expected) ||
            current.some(item => !rows.includes(item))) return false;
        items.insertBefore(row, rows[from + 1] || null);
        return true;
      } catch { return false; }
    }
    function confirmPending() {
      if (!pending) return;
      const operation = pending;
      try {
        const player = activePlayer();
        if (!operation.panel.isConnected || player !== operation.player || player.getVideoData?.()?.video_id !== operation.anchor) {
          finish('Playback or queue changed; no further queue move was made.'); return;
        }
        const current = snapshot(operation.panel);
        if (current && current.owner === operation.owner && current.listId === operation.listId && same(current.keys, operation.expected)) {
          if (!operation.focusMoved && (document.activeElement === document.body || document.activeElement === operation.button)) {
            focusRequest = { panel: current.panel, key: operation.keys[operation.from], direction: operation.direction,
              focused: document.activeElement };
          }
          finish();
        }
      } catch { /* Wait only until the bounded timeout for native confirmation. */ }
    }
    function ensureRecord(state) {
      let record = records.get(state.panel);
      const groups = nativeGroups(state.owner);
      if (record && (record.items !== state.items || record.owner !== state.owner || !same(record.groupRefs, groups))) {
        clearRecord(state.panel); record = null;
      }
      if (record) return record;
      record = { items: state.items, owner: state.owner, controls: new Map(), groups: [], groupRefs: groups, nativeDragging: false, observer: null };
      record.observer = new MutationObserver(mutations => {
        // Native Like/Dislike SVG animations are unrelated to our two glyphs.
        if (!record.nativeDragging && mutations.some(mutation => mutation.attributeName !== 'd' ||
            mutation.target.closest?.(controlSelector))) schedule();
      });
      record.observer.observe(state.panel, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['selected', 'can-reorder', 'hidden', 'aria-hidden',
          'data-ywlc-queue-step-controls', 'data-ywlc-queue-step', 'd'] });
      if (state.panel.parentElement) record.observer.observe(state.panel.parentElement, { childList: true });
      for (const group of groups) {
        const start = () => { titlePresentation.dismiss(); record.nativeDragging = true; disableAll(); };
        const end = () => { record.nativeDragging = false; schedule(); };
        for (const [type, callback] of [['dragstart', start], ['dragend', end], ['e', end]]) {
          group.addEventListener(type, callback); record.groups.push([group, type, callback]);
        }
      }
      records.set(state.panel, record); return record;
    }
    function createButton(direction) {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('data-ywlc-queue-step', direction);
      button.setAttribute('aria-label', direction === 'up' ? 'Move up in queue' : 'Move down in queue');
      button.title = direction === 'up' ? 'Move up in queue' : 'Move down in queue';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', arrowPaths[direction]);
      svg.append(path); button.append(svg); return button;
    }
    function reconcile() {
      frame = 0; if (disposed || navigating) return;
      confirmPending();
      if (pending) { disableAll(); return; }
      // Keep the native handle and listeners stable throughout native dragging.
      if ([...records.keys()].some(panel => {
        try { return panel.isConnected && dragging(controller(panel)); } catch { return false; }
      })) { disableAll(); return; }
      const states = [...document.querySelectorAll(panelSelector)].map(snapshot).filter(Boolean);
      // Two native panels for the active queue are ambiguous during transitions.
      const state = states.length === 1 ? states[0] : null;
      for (const panel of records.keys()) if (!state || panel !== state.panel) clearRecord(panel);
      if (!state) return;
      const record = ensureRecord(state);
      titlePresentation.sync(state, record);
      const rowSet = new Set(state.rows);
      for (const [row, entry] of record.controls) if (!rowSet.has(row) || !currentControls(row, entry)) {
        removeControls(entry); record.controls.delete(row);
      }
      state.rows.forEach((row, index) => {
        let entry = record.controls.get(row);
        if (!entry) {
          const handle = row.querySelector('.playlist-drag-handle');
          if (!handle || handle.closest('button')) return;
          // Native restamping may clone our previous light-DOM controls. They
          // carry no live ownership; replace only those marked copies.
          for (const child of handle.querySelectorAll(controlSelector)) child.remove();
          handle.removeAttribute('data-ywlc-queue-step-controls');
          entry = { handle, up: createButton('up'), down: createButton('down') };
          handle.setAttribute('data-ywlc-queue-step-controls', ''); handle.prepend(entry.up); handle.append(entry.down);
          record.controls.set(row, entry);
        }
        const atStart = index === 0, atEnd = index === state.rows.length - 1;
        if (entry.up.disabled !== atStart) entry.up.disabled = atStart;
        if (entry.down.disabled !== atEnd) entry.down.disabled = atEnd;
      });
      if (focusRequest?.panel === state.panel) {
        const request = focusRequest; focusRequest = null;
        const entry = record.controls.get(state.rows[state.keys.indexOf(request.key)]);
        const preferred = request.direction === 'up' ? entry?.up : entry?.down;
        const fallback = request.direction === 'up' ? entry?.down : entry?.up;
        const target = preferred && !preferred.disabled ? preferred : fallback;
        if (target && !target.disabled) queueMicrotask(() => {
          if (target.isConnected && !target.disabled &&
              (document.activeElement === document.body || document.activeElement === request.focused)) target.focus({ preventScroll: true });
        });
      }
    }
    function schedule() {
      if (!disposed && !navigating && !frame) frame = requestAnimationFrame(reconcile);
    }
    function activate(event) {
      const button = event.target?.closest?.(controlSelector); if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.isTrusted || button.disabled || pending || navigating || disposed) return;
      const panel = button.closest(panelSelector), row = button.closest(rowSelector);
      const entry = records.get(panel)?.controls.get(row), state = panel && snapshot(panel);
      if (!entry || !state || !currentControls(row, entry) || (button !== entry.up && button !== entry.down)) { schedule(); return; }
      const from = state.rows.indexOf(row), direction = button === entry.up ? 'up' : 'down';
      const to = from + (direction === 'up' ? -1 : 1);
      if (from < 0 || to < 0 || to >= state.rows.length) { schedule(); return; }
      const expected = [...state.keys]; expected.splice(to, 0, expected.splice(from, 1)[0]);
      const operation = pending = { ...state, row, button, from, direction, expected, timer: 0 };
      disableAll();
      operation.timer = setTimeout(() => {
        if (pending !== operation) return;
        confirmPending();
        if (pending === operation) {
          const restored = rollbackOwned(operation);
          finish(restored ? 'The queue did not confirm the move. Please try again.' : 'The queue changed. Check its order before trying again.');
        }
      }, 3000);
      try {
        state.items.insertBefore(row, direction === 'up' ? state.rows[to] : state.rows[to].nextSibling);
        state.owner.handleDrop({ currDragItem: row }); confirmPending();
      }
      catch {
        const restored = rollbackOwned(operation);
        finish(restored ? 'Could not move this queue item. Please try again.' : 'The queue changed. Check its order before trying again.');
      }
      schedule();
    }
    function guardPointer(event) {
      titlePresentation.cancel(event.target);
      const button = event.target?.closest?.(controlSelector);
      if (button) { event.stopImmediatePropagation(); return; }
      if (pending && event.target?.closest?.('.playlist-drag-handle')?.closest(panelSelector) === pending.panel) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }
    function suspend() {
      navigating = true;
      titlePresentation.dismiss();
      if (frame) cancelAnimationFrame(frame); frame = 0;
      if (pending) { rollbackOwned(pending); clearTimeout(pending.timer); }
      pending = null;
      focusRequest = null;
      for (const panel of records.keys()) clearRecord(panel);
      clearTimeout(toastTimer); toast?.remove(); toast = null; toastTimer = 0;
    }
    listen(document, 'pointerdown', guardPointer); listen(document, 'mousedown', guardPointer);
    listen(document, 'focusin', event => {
      // A later focus choice remains the user's even if that control is then
      // restamped and the browser falls back to the body before confirmation.
      if (pending && event.target !== pending.button) pending.focusMoved = true;
      if (focusRequest && event.target !== focusRequest.focused) focusRequest = null;
    });
    listen(document, 'click', activate);
    listen(document, 'keydown', event => {
      if (event.key === 'Escape') titlePresentation.cancel();
      if (event.target?.closest?.(controlSelector) && (event.key === 'Enter' || event.key === ' ')) event.stopImmediatePropagation();
    });
    for (const type of ['pointerover', 'focusin']) listen(document, type, event => {
      const panel = event.target?.closest?.(panelSelector);
      // Most tracked panels reconcile through scoped mutations. Also repair
      // only the hovered/focused row if native stamping invalidated its owned
      // controls without an observed event; ordinary hover does no queue scan.
      const record = panel && records.get(panel), row = event.target?.closest?.(rowSelector);
      if (panel && (!record || (row && !currentControls(row, record.controls.get(row))))) schedule();
      if (panel && records.has(panel)) {
        if (event.type === 'pointerover') titlePresentation.hover(event);
        else titlePresentation.focus(event);
      }
    });
    for (const type of ['yt-playlist-data-updated', 'yt-page-data-updated']) listen(window, type, schedule);
    listen(window, 'yt-rendererstamper-finished', event => { if (event.target?.closest?.(panelSelector)) schedule(); });
    listen(window, 'yt-navigate-start', () => { navigationPending = true; suspend(); });
    listen(window, 'pagehide', () => { pageSuspended = true; suspend(); });
    const resume = () => { navigating = navigationPending || pageSuspended; schedule(); };
    listen(window, 'yt-navigate-finish', () => { navigationPending = false; resume(); });
    listen(window, 'pageshow', () => { pageSuspended = false; resume(); });
    schedule();
    return () => {
      suspend(); disposed = true;
      for (const [target, type, callback] of listeners) target.removeEventListener(type, callback, true);
      if (sharedStyle) suite.removeStyle('watchLayoutCleanerQueueSteps');
      else style?.remove();
    };
  }

  function installQueueDragAssistance() {
    const panelSelector =
      "ytd-playlist-panel-renderer, yt-playlist-panel-renderer";
    const rowSelector =
      "ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer";
    const placeholderAttribute = "data-ywlc-drag-placeholder";
    let gesture = null;

    function setMarkerStyle(css) {
      const style = document.createElement("style");
      style.id = "tm-youtube-watch-layout-cleaner-drag";
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
      return style;
    }

    function removeMarkerStyle(style) {
      style?.remove();
    }

    function release(callback) {
      try {
        callback();
      } catch {
        // Native teardown or another script may already have released it.
      }
    }

    function clearGesture() {
      const current = gesture;
      if (!current) return;
      gesture = null;
      current.groupListeners.forEach(([type, listener]) => {
        release(() => current.group.removeEventListener(type, listener));
      });
      current.domListeners.forEach(([target, type, listener]) => {
        release(() => target.removeEventListener(type, listener, true));
      });
      release(() => current.observer?.disconnect());
      release(() => current.motionQuery?.removeEventListener(
        "change", current.motionListener,
      ));
      clearAnimations(current);
      release(() => {
        if (current.marker?.getAttribute(placeholderAttribute) === "1") {
          current.marker.removeAttribute(placeholderAttribute);
        }
      });
      release(() => removeMarkerStyle(current.markerStyle));
      release(() => {
        const style = current.items.style;
        if (
          current.anchor &&
          style.getPropertyValue("overflow-anchor") === "none" &&
          style.getPropertyPriority("overflow-anchor") === ""
        ) {
          if (current.anchor.value) {
            style.setProperty(
              "overflow-anchor", current.anchor.value, current.anchor.priority,
            );
          } else {
            style.removeProperty("overflow-anchor");
          }
        }
      });
      release(() => {
        if (
          current.support && current.scrollDelta &&
          current.support.calculateScrollDelta === current.scrollDelta
        ) {
          // The native timer stays native-owned; discard only our cached step.
          release(() => {
            if (current.support.scrollDelta_) current.support.scrollDelta_.y = 0;
          });
          if (current.scrollDescriptor) {
            Object.defineProperty(
              current.support,
              "calculateScrollDelta",
              current.scrollDescriptor,
            );
          } else {
            delete current.support.calculateScrollDelta;
          }
        }
      });
    }

    function clearAnimations(current = gesture) {
      if (!current?.animations) return;
      current.animations.forEach((animation) => release(() => animation.cancel()));
      current.animations.clear();
      current.positions.clear();
    }

    function ownsNativeDrag(current) {
      return Boolean(
        current === gesture &&
          current.panel.isConnected &&
          current.items.isConnected &&
          current.row.parentElement === current.items &&
          (current.panel.polymerController ||
            current.panel.getPolymerController?.() || current.panel) ===
            current.owner &&
          (current.owner.ytReorderableController ||
            current.panel.ytReorderableController) === current.controller &&
          Object.getOwnPropertyDescriptor(
            current.controller, current.groupProperty,
          )?.value === current.group &&
          current.group.currDragItem_ === current.row &&
          current.group.isDragging() &&
          current.controller.dragScrollSupport === current.support,
      );
    }

    function visibleScrollBounds(items) {
      const rect = items.getBoundingClientRect();
      const bounds = {
        left: Math.max(0, rect.left),
        right: Math.min(window.innerWidth, rect.right),
        top: Math.max(0, rect.top),
        bottom: Math.min(window.innerHeight, rect.bottom),
      };
      for (let element = items; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse"
        ) {
          return null;
        }
        const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
        const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
        if (!clipX && !clipY) continue;
        const clip = element.getBoundingClientRect();
        if (clipX) {
          bounds.left = Math.max(bounds.left, clip.left);
          bounds.right = Math.min(bounds.right, clip.right);
        }
        if (clipY) {
          bounds.top = Math.max(bounds.top, clip.top);
          bounds.bottom = Math.min(bounds.bottom, clip.bottom);
        }
      }
      return bounds.right > bounds.left && bounds.bottom > bounds.top
        ? bounds
        : null;
    }

    function innerContainer(row) {
      return Array.from(row.children).find((child) => child.id === "container");
    }

    function recordPositions() {
      const current = gesture;
      if (!current?.active || !ownsNativeDrag(current)) {
        clearGesture();
        return;
      }
      current.positions.clear();
      if (current.motionQuery?.matches) {
        clearAnimations(current);
        return;
      }
      const bounds = visibleScrollBounds(current.items);
      if (!bounds) return;
      const rows = Array.from(current.items.children);
      const index = rows.indexOf(current.row);
      // Bound geometry reads even for long queues; only neighbours can shift.
      const neighbours = rows.slice(Math.max(0, index - 20), index + 21);
      neighbours.forEach((row) => {
        if (
          row === current.row ||
          !row.matches(rowSelector) ||
          current.group.draggerEl_?.contains(row) ||
          getComputedStyle(row).visibility !== "visible"
        ) {
          return;
        }
        const inner = innerContainer(row);
        if (!inner || typeof inner.animate !== "function") return;
        const ownedAnimation = current.animations.get(inner);
        if (
          (inner.getAnimations?.() || []).some(
            (animation) => animation !== ownedAnimation,
          ) ||
          (!ownedAnimation && getComputedStyle(inner).transform !== "none")
        ) {
          return;
        }
        const rect = inner.getBoundingClientRect();
        if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) return;
        current.positions.set(inner, rect.top);
        ownedAnimation?.cancel();
        current.animations.delete(inner);
      });
    }

    function animatePositions() {
      const current = gesture;
      if (!current?.active || !ownsNativeDrag(current)) {
        clearGesture();
        return;
      }
      if (current.motionQuery?.matches) {
        clearAnimations(current);
        return;
      }
      current.positions.forEach((top, inner) => {
        if (
          !inner.isConnected ||
          inner.parentElement?.parentElement !== current.items ||
          inner.parentElement === current.row ||
          getComputedStyle(inner).transform !== "none" ||
          (inner.getAnimations?.() || []).length
        ) {
          return;
        }
        const delta = top - inner.getBoundingClientRect().top;
        if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
        const animation = inner.animate(
          [
            { transform: `translateY(${delta}px)` },
            { transform: "none" },
          ],
          { duration: 120, easing: "ease-out" },
        );
        current.animations.set(inner, animation);
        animation.onfinish = () => {
          if (current.animations.get(inner) === animation) {
            current.animations.delete(inner);
          }
        };
      });
      current.positions.clear();
    }

    function beginNativeDrag() {
      const current = gesture;
      if (!current || current.active) return;
      const support = current.controller.dragScrollSupport;
      if (
        current.group.currDragItem_ !== current.row ||
        !current.group.isDragging() ||
        support?.containerNode_ !== current.items ||
        support.horizontalScrolling_ !== false ||
        typeof support.calculateScrollDelta !== "function"
      ) {
        clearGesture();
        return;
      }
      current.support = support;
      current.scrollDescriptor = Object.getOwnPropertyDescriptor(
        support,
        "calculateScrollDelta",
      );
      current.scrollDelta = () => {
        try {
          if (!ownsNativeDrag(current) || document.hidden) {
            clearGesture();
            return 0;
          }
          const bounds = visibleScrollBounds(current.items);
          const { x, y } = current.pointer;
          if (
            !bounds ||
            x < bounds.left ||
            x > bounds.right ||
            y < bounds.top ||
            y > bounds.bottom
          ) {
            return 0;
          }
          const edge = Math.min(40, (bounds.bottom - bounds.top) / 2);
          const upwards = y < bounds.top + edge;
          const distance = upwards
            ? bounds.top + edge - y
            : y - (bounds.bottom - edge);
          if (distance <= 0) return 0;
          const step = Math.min(16, (distance / edge) * 16);
          const available = upwards
            ? current.items.scrollTop
            : current.items.scrollHeight - current.items.clientHeight -
              current.items.scrollTop;
          return available > 0 ? (upwards ? -1 : 1) * Math.min(step, available) : 0;
        } catch {
          clearGesture();
          return 0;
        }
      };
      try {
        support.calculateScrollDelta = current.scrollDelta;
        if (support.calculateScrollDelta !== current.scrollDelta) {
          clearGesture();
          return;
        }
      } catch {
        clearGesture();
        return;
      }
      current.active = true;
      const listStyle = current.items.style;
      if (typeof listStyle?.getPropertyValue === "function") {
        current.anchor = {
          value: listStyle.getPropertyValue("overflow-anchor"),
          priority: listStyle.getPropertyPriority("overflow-anchor"),
        };
        // Native placeholder movement must not pull the scrollport with it.
        listStyle.setProperty("overflow-anchor", "none");
      }
      const inner = innerContainer(current.row);
      if (
        inner &&
        !inner.hasAttribute(placeholderAttribute) &&
        ["relative", "absolute", "fixed", "sticky"].includes(
          getComputedStyle(inner).position,
        )
      ) {
        // Reveal only an empty outline, never the hidden row's real contents.
        const style = setMarkerStyle(`[${placeholderAttribute}="1"]::after {
  content: "";
  position: absolute;
  inset: 3px;
  visibility: visible;
  pointer-events: none;
  border: 1px solid var(--yt-spec-call-to-action, #3ea6ff);
  border-radius: 4px;
  box-sizing: border-box;
}`);
        current.marker = inner;
        current.markerStyle = style;
        inner.setAttribute(placeholderAttribute, "1");
      }
    }

    function armDrag(event) {
      if (
        !event.isTrusted || event.button !== 0 || document.hidden ||
        event.ctrlKey || event.altKey || event.metaKey ||
        !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)
      ) {
        return;
      }
      clearGesture();
      const target = event.target;
      if (
        !target?.closest ||
        target.closest(
          'button, input, textarea, select, [role="button"], ' +
            '[contenteditable]:not([contenteditable="false"])',
        )
      ) {
        return;
      }
      const row = target.closest(rowSelector);
      const panel = row?.closest(panelSelector);
      const items = row?.parentElement;
      if (
        !panel?.isConnected ||
        items?.id !== "items" ||
        panel.querySelector("#items") !== items ||
        (!panel.closest("ytd-miniplayer") &&
          location.pathname !== "/watch" &&
          !location.pathname.startsWith("/live/")) ||
        !visibleScrollBounds(items)
      ) {
        return;
      }
      let owner;
      let controller;
      let group;
      let groupProperty;
      try {
        owner = panel.polymerController ||
          panel.getPolymerController?.() || panel;
        if (owner.canReorder === false || panel.canReorder === false) return;
        controller = owner.ytReorderableController ||
          panel.ytReorderableController;
        if (!controller) return;
        const entry = Object.getOwnPropertyNames(controller)
          .filter((name) => name.endsWith("dragListGroup"))
          .map((name) => ({
            name, value: Object.getOwnPropertyDescriptor(controller, name)?.value,
          }))
          .find(({ value }) =>
            value &&
            typeof value.addEventListener === "function" &&
            typeof value.removeEventListener === "function" &&
            typeof value.isDragging === "function" &&
            typeof value.getHandleForDragItem_ === "function",
          );
        group = entry?.value;
        groupProperty = entry?.name;
        if (!group || group.isDragging()) return;
        const handle = group.getHandleForDragItem_(row);
        if (!handle || !row.contains(handle) || !handle.contains(target)) return;
      } catch {
        return;
      }
      const current = {
        panel, items, row, owner, controller, group, groupProperty,
        pointer: { x: event.clientX, y: event.clientY },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        active: false,
        groupListeners: [],
        domListeners: [],
        animations: new Map(),
        positions: new Map(),
        motionQuery: typeof matchMedia === "function"
          ? matchMedia("(prefers-reduced-motion: reduce)")
          : null,
      };
      gesture = current;
      function listen(target, type, listener) {
        current.domListeners.push([target, type, listener]);
        target.addEventListener(type, listener, true);
      }
      [
        ["dragstart", beginNativeDrag],
        ["beforedragmove", recordPositions],
        ["dragmove", animatePositions],
        ["dragend", clearGesture],
        ["e", clearGesture],
      ].forEach(([type, listener]) => {
        const guarded = (...args) => {
          try {
            listener(...args);
          } catch {
            // Never let assistance interrupt native insertBefore/drop handling.
            clearGesture();
          }
        };
        current.groupListeners.push([type, guarded]);
        group.addEventListener(type, guarded);
      });
      listen(document, "mousemove", (move) => {
        if (!move.isTrusted) return;
        if (
          !(move.buttons & 1) ||
          !Number.isFinite(move.clientX) || !Number.isFinite(move.clientY)
        ) {
          clearGesture();
          return;
        }
        current.pointer = { x: move.clientX, y: move.clientY };
      });
      listen(document, "mouseup", clearGesture);
      listen(document, "pointercancel", clearGesture);
      listen(document, "keydown", (key) => {
        if (key.key === "Escape") clearGesture();
      });
      listen(document, "visibilitychange", () => {
        if (document.hidden) clearGesture();
      });
      ["blur", "pagehide", "yt-navigate-start"].forEach((type) => {
        listen(window, type, clearGesture);
      });
      listen(window, "resize", (resize) => {
        // Suite/YouTube layout notifications are not actual viewport changes.
        if (
          resize.isTrusted ||
          window.innerWidth !== current.viewport.width ||
          window.innerHeight !== current.viewport.height
        ) {
          clearGesture();
        }
      });
      current.motionListener = () => clearAnimations(current);
      current.motionQuery?.addEventListener("change", current.motionListener);
      if (typeof MutationObserver === "function") {
        current.observer = new MutationObserver(() => {
          if (!panel.isConnected || !items.isConnected || !items.contains(row)) {
            clearGesture();
          }
        });
        current.observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
    }

    const onMouseDown = (event) => {
      try {
        armDrag(event);
      } catch {
        clearGesture();
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => {
      clearGesture();
      document.removeEventListener("mousedown", onMouseDown, true);
    };
  }

  const scheduleQueuePlayingMarkerReconciliation = installQueuePlayingMarkerReconciliation();
  installQueuePlayNext();
  installQueueStepControls();
  installQueueDragAssistance();
  ensureStyle();
  scheduleQueueThumbnailFallbacks();

  const narrowLayoutMediaQuery = matchMedia(
    `(max-width: ${px(CONFIG.queueLayoutBreakpointPx)})`,
  );
  narrowLayoutMediaQuery.addEventListener(
    "change",
    scheduleQueueThumbnailFallbacks,
  );
  const relatedVideosMediaQuery = matchMedia(
    `(max-width: ${px(CONFIG.relatedVideosHideBreakpointPx)})`,
  );
  relatedVideosMediaQuery.addEventListener(
    "change",
    scheduleSecondaryRailStateReconciliation,
  );

  // YouTube is an SPA; re-apply after in-site navigation
  window.addEventListener(
    "yt-navigate-finish",
    () => {
      ensureStyle();
      scheduleQueueThumbnailFallbacks();
    },
    true,
  );
  window.addEventListener(
    "yt-page-data-updated",
    () => {
      ensureStyle();
      scheduleQueueThumbnailFallbacks();
    },
    true,
  );
  window.addEventListener(
    "pageshow",
    () => {
      ensureStyle();
      scheduleQueueThumbnailFallbacks();
    },
    true,
  );
})();
