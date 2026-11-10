import { createFeatureCatalogue } from './feature-catalogue.mjs';
import { createMenuLayout } from './menu-layout.mjs';

// Self-contained factory: the builder embeds it in the single-file userscript.
// No values from storage are used as HTML, selectors, URLs or arbitrary CSS.
export function createSuiteSettings(getStorage, isDarkTheme, catalogue = createFeatureCatalogue(), menuLayouts = createMenuLayout()) {
  const key = "yt-master-suite.settings.v1";
  const cornerKey = "yt-master-suite.scroll-miniplayer.corner.v1";
  const defaults = Object.freeze({
    ...catalogue.defaults,
    colourMode: "default", palette: "teal-coral", viewerColour: "#82A3E6", ownerColour: "#FF9F1C",
    compactComments: true, hideCommentControls: true,
    hideShorts: true, hideWatchedVideos: true, hideLiveVideos: false, hideUpcomingStreams: true,
    hideMixes: true, hidePodcasts: true, hideMembersOnly: true,
    watchedThreshold: "90", yellowCaptions: true, mirrorButton: true, liveChatButton: true, theatreMode: true,
    preferredVideoQuality: "off", timelinePreviewSize: "auto", hideFullscreenQuickActions: false,
    keepHoverPreviews: false, timeDisplayMode: "native",
    wheelVolume: true, wheelStep: "5", hideRelated: true, hideChat: true, hideInfoCards: true,
    hideEndScreens: true, fullscreenComments: true, disableTitleHashtagLinks: false, miniplayerEnabled: true,
    corner: "top-right", queueInfo: true, miniplayerSizeMode: "auto", miniplayerWidth: 720,
    headerSettingsIcon: "colour", playerSettingsIcon: "monochrome",
    showRydTooltipBar: false,
    showDeArrowTitleButton: false,
    showDeArrowQueueButton: true,
    menuShowDownload: false, menuGroupChannelTools: true, menuShowAgeLimit: true,
    menuShowNotInterested: true, menuShowDontRecommend: true, menuShowReport: true,
    menuLayout: null,
    menuItemOrder: Object.freeze(["playNext", "addToQueue", "watchLater", "savePlaylist", "download", "share",
      "notInterested", "channelAge", "dontRecommend", "report", "channelTools"]),
  });
  const choices = Object.freeze({
    ...catalogue.choices,
    colourMode: ["default", "preset", "custom", "off"],
    palette: ["teal-coral", "lavender-gold", "cyan-rose"],
    watchedThreshold: ["5", "10", "25", "50", "75", "80", "90", "95", "100"], wheelStep: ["1", "2", "5", "10"],
    preferredVideoQuality: ["off", "highest", "tiny", "small", "medium", "large", "hd720", "hd1080", "hd1440", "hd2160"],
    timelinePreviewSize: ["auto", "small", "medium", "large", "native"],
    timeDisplayMode: ["native", "elapsed", "remaining"],
    corner: ["top-right", "bottom-right", "bottom-left", "top-left"],
    miniplayerSizeMode: ["auto", "custom"],
    headerSettingsIcon: ["off", "colour", "monochrome"], playerSettingsIcon: ["off", "colour", "monochrome"],
  });
  const palettes = Object.freeze({
    dark: {
      "teal-coral": ["#80CBC4", "#FFAB91"], "lavender-gold": ["#B39DDB", "#FFD54F"], "cyan-rose": ["#81D4FA", "#F48FB1"],
    },
    light: {
      "teal-coral": ["#00695C", "#A83222"], "lavender-gold": ["#65409B", "#806000"], "cyan-rose": ["#006A8E", "#A82659"],
    },
  });
  const previousDefaultMenuOrder = ["playNext", "addToQueue", "watchLater", "savePlaylist", "download", "share",
    "notInterested", "dontRecommend", "report", "channelAge", "channelTools"];
  function isPreviousDefaultMenuOrder(value) {
    return Array.isArray(value) && value.length === previousDefaultMenuOrder.length &&
      value.every((item, index) => item === previousDefaultMenuOrder[index]);
  }
  function normaliseHex(value) {
    return typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value.trim())
      ? "#" + value.trim().replace(/^#/, "").toUpperCase() : null;
  }
  function migrateLegacySettings(input, strict = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    if (strict && Object.getPrototypeOf(input) !== Object.prototype) return null;
    const result = { ...input };
    const retired = {
      autoLoadFilteredHome: value => typeof value === 'boolean',
      showHomeLoadMore: value => typeof value === 'boolean',
      homeLoadBatchLimit: value => ['1', '3', '5', '10'].includes(value),
      homeLoadDelay: value => ['3', '5', '10'].includes(value),
    };
    for (const [name, valid] of Object.entries(retired)) if (Object.hasOwn(result, name)) {
      if (strict && !valid(result[name])) return null;
      delete result[name];
    }
    if (Object.hasOwn(result, 'hideFeedMovies')) {
      if (strict && (typeof result.hideFeedMovies !== 'boolean' ||
        Object.hasOwn(result, 'showFilms') && result.showFilms !== !result.hideFeedMovies)) return null;
      if (!Object.hasOwn(result, 'showFilms') && typeof result.hideFeedMovies === 'boolean') result.showFilms = !result.hideFeedMovies;
      delete result.hideFeedMovies;
    }
    if (Object.hasOwn(result, 'showFilms')) {
      if (strict && typeof result.showFilms !== 'boolean') return null;
      if (typeof result.showFilms === 'boolean') {
        const visibility = result.showFilms ? (result.hidePayToWatchCards === false ? 'all' : 'free') : 'none';
        if (strict && Object.hasOwn(result, 'filmVisibility') && result.filmVisibility !== visibility) return null;
        if (!Object.hasOwn(result, 'filmVisibility')) result.filmVisibility = visibility;
      }
      delete result.showFilms;
    }
    // Older partial records can predate either film switch.
    if (!Object.hasOwn(result, 'filmVisibility') && result.hidePayToWatchCards === false) result.filmVisibility = 'all';
    return result;
  }
  function validate(input) {
    const result = { ...defaults, menuItemOrder: [...defaults.menuItemOrder] };
    if (!input || typeof input !== "object" || Array.isArray(input)) return result;
    input = migrateLegacySettings(input);
    for (const [name, fallback] of Object.entries(defaults)) {
      if (!Object.hasOwn(input, name)) continue;
      const value = input[name];
      if (typeof fallback === "boolean") {
        if (typeof value === "boolean") result[name] = value;
      } else if (name === "miniplayerWidth") {
        if (Number.isInteger(value) && value >= 320 && value <= 1200) result[name] = value;
      } else if (name === "menuItemOrder") {
        if (Array.isArray(value) && value.length <= defaults.menuItemOrder.length) {
          // Adopt the revised default without overwriting explicitly rearranged menus.
          if (isPreviousDefaultMenuOrder(value)) continue;
          const order = [...new Set(value.filter(item => typeof item === "string" && defaults.menuItemOrder.includes(item)))];
          result[name] = [...order, ...defaults.menuItemOrder.filter(item => !order.includes(item))];
        }
      } else if (name === "menuLayout") {
        result[name] = value === null ? null : menuLayouts.validate(value);
      } else if (name === "viewerColour" || name === "ownerColour") {
        result[name] = normaliseHex(value) || fallback;
      } else if (choices[name]?.includes(value)) result[name] = value;
    }
    // Resolve opposing presentation choices deterministically, including imports.
    if (result.relatedBelowPlayer) result.hideRelated = false;
    if (result.disableVideoPreviews) result.keepHoverPreviews = false;
    if (result.hideAllComments) result.fullscreenComments = false;
    // Recover a corrupted or manually edited record without hiding all access.
    if (result.headerSettingsIcon === "off" && result.playerSettingsIcon === "off") result.headerSettingsIcon = defaults.headerSettingsIcon;
    return result;
  }
  function read() {
    try {
      const storage = getStorage();
      const raw = storage.getItem(key);
      let record = null;
      if (raw && raw.length <= 8192) {
        try { record = JSON.parse(raw); } catch { /* Keep defaults, but still read the existing corner. */ }
      }
      const values = validate(record?.version === 1 ? record.values : null);
      // Keep the miniplayer's existing synchronised corner as its one source of truth.
      const corner = storage.getItem(cornerKey);
      if (choices.corner.includes(corner)) values.corner = corner;
      return values;
    } catch { return { ...defaults, menuItemOrder: [...defaults.menuItemOrder] }; }
  }
  const initialValues = read();
  Object.freeze(initialValues.menuItemOrder);
  if (initialValues.menuLayout) {
    initialValues.menuLayout.nodes.forEach(Object.freeze);
    Object.freeze(initialValues.menuLayout.nodes);
    Object.freeze(initialValues.menuLayout);
  }
  const initial = Object.freeze(initialValues);
  // Reads deliberately fail open, but an editor must never turn an unknown or
  // damaged saved record into a valid-looking new one by silently discarding it.
  function savedSettingsAreWritable(raw) {
    if (raw === null) return true;
    if (typeof raw !== "string" || raw.length > 8192) return false;
    try {
      const record = JSON.parse(raw);
      if (!record || typeof record !== "object" || Array.isArray(record) ||
          Object.keys(record).some(name => name !== "version" && name !== "values") ||
          record.version !== 1 || !record.values || typeof record.values !== "object" || Array.isArray(record.values)) return false;
      const migrated = migrateLegacySettings(record.values, true);
      if (!migrated) return false;
      for (const [name, value] of Object.entries(migrated)) {
        if (!Object.hasOwn(defaults, name)) return false;
        const fallback = defaults[name];
        if (typeof fallback === "boolean") {
          if (typeof value !== "boolean") return false;
        } else if (name === "miniplayerWidth") {
          if (!Number.isInteger(value) || value < 320 || value > 1200) return false;
        } else if (name === "menuItemOrder") {
          if (!Array.isArray(value) || value.length > defaults.menuItemOrder.length ||
              new Set(value).size !== value.length || value.some(item => !defaults.menuItemOrder.includes(item))) return false;
        } else if (name === "menuLayout") {
          if (value !== null && !menuLayouts.validate(value)) return false;
        } else if (name === "viewerColour" || name === "ownerColour") {
          if (!normaliseHex(value)) return false;
        } else if (!choices[name]?.includes(value)) return false;
      }
      return !(record.values.headerSettingsIcon === "off" && record.values.playerSettingsIcon === "off");
    } catch { return false; }
  }
  function save(input) {
    if (input && Object.hasOwn(input, 'menuLayout') && input.menuLayout !== null && !menuLayouts.validate(input.menuLayout)) {
      return { ok: false, error: "The video menu layout is invalid. Check submenu names, placement and nesting before saving." };
    }
    if (input?.headerSettingsIcon === "off" && input?.playerSettingsIcon === "off") {
      return { ok: false, error: "Keep at least one settings button enabled." };
    }
    const values = validate(input);
    const desired = JSON.stringify({ version: 1, values });
    if (desired.length > 8192) return { ok: false, error: "Saved settings would exceed the supported size. Shorten submenu names or remove unused submenus." };
    let storage, previous, previousCorner;
    let cornerAttempted = false;
    try {
      storage = getStorage(); previous = storage.getItem(key);
      previousCorner = storage.getItem(cornerKey);
      if (!savedSettingsAreWritable(previous) ||
          (previousCorner !== null && !choices.corner.includes(previousCorner))) {
        return { ok: false, error: "Saved settings are incompatible or damaged. Nothing was overwritten; recover the existing data before saving." };
      }
      storage.setItem(key, desired);
      if (storage.getItem(key) !== desired || storage.getItem(cornerKey) !== previousCorner) throw Error('Settings changed during save');
      if (previousCorner !== values.corner) {
        cornerAttempted = true;
        storage.setItem(cornerKey, values.corner);
      }
      if (storage.getItem(key) !== desired || storage.getItem(cornerKey) !== values.corner) throw Error('Settings were not retained');
      return { ok: true, values };
    } catch {
      // A storage write may take effect before it throws. Restore both owned
      // partial values, preserving a newer save or clear from another window.
      try {
        if (cornerAttempted && storage?.getItem(key) === desired && storage.getItem(cornerKey) === values.corner) {
          if (previousCorner === null) storage.removeItem(cornerKey);
          else storage.setItem(cornerKey, previousCorner);
        }
      } catch { /* Attempt main-record recovery even if corner recovery fails. */ }
      try {
        if (previous !== undefined && storage?.getItem(key) === desired) {
          if (previous === null) storage.removeItem(key);
          else storage.setItem(key, previous);
        }
      } catch { /* Storage may remain unavailable; report the failure below. */ }
      return { ok: false, error: "Settings could not be saved. Browser storage is unavailable or full." };
    }
  }
  function colours(values = initial, dark = isDarkTheme()) {
    const checked = validate(values);
    if (checked.colourMode === "off") return null;
    if (checked.colourMode === "preset") return palettes[dark ? "dark" : "light"][checked.palette];
    if (checked.colourMode === "custom") return [checked.viewerColour, checked.ownerColour];
    return [defaults.viewerColour, defaults.ownerColour];
  }
  function overrides(id, config) {
    const values = initial;
    if (id === "commentCleaner") {
      const pair = colours();
      return {
        compactComments: values.compactComments, hideCommentControls: values.hideCommentControls,
        colourCommenters: values.colourMode !== "off",
        commenterColour: values.colourMode === "preset" ? "var(--ytms-viewer-colour, #82a3e6)" : (pair?.[0] || defaults.viewerColour),
        uploaderColour: values.colourMode === "preset" ? "var(--ytms-owner-colour, #ff9f1c)" : (pair?.[1] || defaults.ownerColour),
      };
    }
    if (id === "feedUiCleaner") return {
      ...Object.fromEntries(["hideHomeCategories", "hideNotifications", "hideVoiceSearch", "hideCreateButton", "hideSidebarSections", "hideGuideFooter", "hideFeedShelves", "hideFeedNudges", "hideHistoryAuxActions"].map(name => [name, values[name]])),
      tightenFeedGrid: values.compactFeedSpacing,
      showTemporaryRevealControl: values.showTemporaryRevealControl,
      filterProfiles: Object.fromEntries(Object.entries(config.filterProfiles).map(([route, profile]) => [route, {
        ...profile, mixes: values.hideMixes, membersOnly: values.hideMembersOnly, podcasts: values.hidePodcasts,
      }])),
    };
    if (id === "playerPreferencesLite") return {
      convertShortsToWatch: values.redirectShorts, hideMerchShelf: values.hideMerchandise,
      disableVideoPreviews: values.disableVideoPreviews,
      useStandardMastheadLogo: values.useStandardMastheadLogo, hidePayToWatchCards: values.hidePayToWatchCards,
      showAutoplayUpNextCard: values.showAutoplayUpNextCard, enableCleanVideoUrlCopy: values.enableCleanVideoUrlCopy,
      requireRightMouseButtonForWheelVolume: values.requireRightMouseButtonForWheelVolume,
      hideMetadataTeaserCarousel: values.hideVideoMetadata, hideInfoPanel: values.hideInfoPanels, hideAskButton: values.hideAskPanels,
      ...Object.fromEntries(["hideShareButton", "hideThanksButton", "hideJoinButton", "hideInlineSaveButton", "hideStatementBanners", "hideBrandVideoShelf", "hideHashtags", "collapseDescriptionBlankRows", "hideStructuredDescription"].map(name => [name, values[name]])),
      hideShorts: values.hideShorts, hideWatchedVideos: values.hideWatchedVideos,
      hideLiveVideos: values.hideLiveVideos, hideUpcomingStreams: values.hideUpcomingStreams,
      watchedVideoThresholdPercent: Number(values.watchedThreshold),
      useReadableYellowCaptions: values.yellowCaptions, enableVideoMirrorButton: values.mirrorButton,
      enableLiveChatButton: values.liveChatButton,
      enableTheaterMode: values.theatreMode, enablePlayerWheelVolume: values.wheelVolume,
      preferredVideoQuality: values.preferredVideoQuality, hideFullscreenQuickActions: values.hideFullscreenQuickActions,
      timelinePreviewSize: values.timelinePreviewSize,
      keepHoverPreviews: values.keepHoverPreviews, timeDisplayMode: values.timeDisplayMode,
      wheelVolumeStep: Number(values.wheelStep), hideRelatedVideos: values.hideRelated,
      hideChat: values.hideChat, hideInfoCards: values.hideInfoCards,
      hideEndScreenRecommendationGrid: values.hideEndScreens, enableFullscreenComments: values.fullscreenComments,
      disableTitleHashtagLinks: values.disableTitleHashtagLinks,
      showRydTooltipBar: values.showRydTooltipBar,
      showDeArrowTitleButton: values.showDeArrowTitleButton,
      feedFilterProfiles: Object.fromEntries(Object.entries(config.feedFilterProfiles).map(([route, profile]) => [route, {
        ...profile, ...(Object.hasOwn(profile, 'payToWatchCards') ? { payToWatchCards: values.hidePayToWatchCards } : {}),
        watchedVideos: route === "history" ? false : values.hideWatchedVideos,
      }])),
    };
    if (id === "scrollMiniplayer") return {
      enabled: values.miniplayerEnabled, showCompactQueueInfo: values.queueInfo,
      sizeMode: values.miniplayerSizeMode === "custom" ? "fixed" : "dynamic", customWidth: values.miniplayerWidth,
    };
    if (id === "watchLayoutCleaner") return {
      collapseEmptySidebar: values.collapseEmptySidebar,
      relatedVideosHideBreakpointPx: values.hideRelated ? config.relatedVideosHideBreakpointPx : 0,
      showDeArrowQueueButton: values.showDeArrowQueueButton,
    };
    if (id === "miniplayerButtonRestorer") return { enabled: values.restoreMiniplayerButton };
    return {};
  }
  const isValidMenuLayout = value => value === null || menuLayouts.validate(value) !== null;
  return Object.freeze({ key, cornerKey, defaults, initial, read, save, validate, migrateLegacySettings, colours, normaliseHex, overrides, isPreviousDefaultMenuOrder,
    isValidMenuLayout, features: catalogue.definitions });
}
