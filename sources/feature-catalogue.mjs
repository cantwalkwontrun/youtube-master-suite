// Language: en-GB. Static catalogue shared by validation, settings, search and backups.
export function createFeatureCatalogue() {
 const definitions = [
  {
    "key": "originalAudio",
    "tab": "player",
    "section": "Playback",
    "label": "Prefer original audio",
    "description": "Select the explicitly identified original audio track when the native player exposes it. A manual audio choice is respected for the current video.",
    "default": false
  },
  {
    "key": "disableAutoplay",
    "tab": "player",
    "section": "Playback",
    "label": "Disable autoplay",
    "description": "Turn off native autoplay on each new video. This does not skip or remove queue entries.",
    "default": false
  },
  {
    "key": "disableAmbientMode",
    "tab": "player",
    "section": "Player appearance",
    "label": "Hide ambient lighting",
    "description": "Hide the native ambient lighting effect. This does not claim to stop background processing.",
    "default": false
  },
  {
    "key": "disableStableVolume",
    "tab": "player",
    "section": "Playback",
    "label": "Disable Stable volume",
    "description": "Turn off native volume normalisation when the player exposes its preference API.",
    "default": false
  },
  {
    "key": "disableNumberKeySeeking",
    "tab": "player",
    "section": "Playback",
    "label": "Disable number-key seeking",
    "description": "Prevent 0–9 from seeking while the video player has focus. Typing in fields is unaffected.",
    "default": false
  },
  {
    "key": "snapshotButton",
    "tab": "player",
    "section": "Capture and export",
    "label": "Show Take snapshot button",
    "description": "Save the current video frame locally on request. Protected or cross-origin frames may be unavailable.",
    "default": false
  },
  {
    "key": "transcriptDownload",
    "tab": "player",
    "section": "Capture and export",
    "label": "Show transcript download",
    "description": "Download the transcript already displayed by YouTube. Open the transcript first; no transcription service is contacted.",
    "default": false
  },
  {
    "key": "hideNextButton",
    "tab": "player",
    "section": "Player appearance",
    "label": "Hide Next button",
    "description": "Hide the native next-video control without changing the queue or playback.",
    "default": false
  },
  {
    "key": "hidePlayerWatermark",
    "tab": "player",
    "section": "Player appearance",
    "label": "Hide channel watermark",
    "description": "Hide the channel subscription watermark over the video.",
    "default": false
  },
  {
    "key": "hideJumpAhead",
    "tab": "player",
    "section": "Player appearance",
    "label": "Hide Jump ahead button",
    "description": "Hide YouTube’s Jump ahead control. SponsorBlock controls and skipping are separate.",
    "default": false
  },
  {
    "key": "hidePlayerAnnotations",
    "tab": "player",
    "section": "Player appearance",
    "label": "Hide legacy annotations",
    "description": "Hide legacy in-video annotation overlays where present.",
    "default": false
  },
  {
    "key": "disablePlayerBlur",
    "tab": "player",
    "section": "Player appearance",
    "label": "Remove player background blur",
    "description": "Remove native blurred background effects without changing the video image.",
    "default": false
  },
  {
    "key": "embedHideShare",
    "tab": "player",
    "section": "Embedded videos",
    "label": "Hide embedded Share button",
    "description": "Applies only to directly opened top-level www.youtube.com/embed/ pages. Embedded iframes and other hosts are not covered.",
    "default": false
  },
  {
    "key": "embedHidePauseOverlay",
    "tab": "player",
    "section": "Embedded videos",
    "label": "Hide embedded pause overlay",
    "description": "Applies only to directly opened top-level www.youtube.com/embed/ pages. Embedded iframes and other hosts are not covered.",
    "default": false
  },
  {
    "key": "homeRedirect",
    "tab": "interface",
    "section": "Navigation",
    "label": "Open Subscriptions instead of Home",
    "description": "Use the native Subscriptions link on signed-in Home pages. Existing watch playback is left alone.",
    "default": false
  },
  {
    "key": "logoToSubscriptions",
    "tab": "interface",
    "section": "Navigation",
    "label": "YouTube logo opens Subscriptions",
    "description": "Point the native logo link at Subscriptions while preserving normal link and middle-click behaviour.",
    "default": false
  },
  {
    "key": "homeList",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Display Home as a list",
    "description": "Use a compact list instead of the Home grid.",
    "default": false
  },
  {
    "key": "subscriptionsList",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Display Subscriptions as a list",
    "description": "Use a compact list for the Subscriptions feed.",
    "default": false
  },
  {
    "key": "hideSubscriptionsHeaders",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Hide Subscriptions Latest header",
    "description": "Hide the native Latest header on the Subscriptions feed.",
    "default": false
  },
  {
    "key": "listChannelHeaders",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Show channel headers in lists",
    "description": "Add creator headings to list cards using their existing verified native channel links.",
    "default": false
  },
  {
    "key": "fullFeedTitles",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Show full video titles",
    "description": "Remove title line limits on feed cards without replacing DeArrow titles.",
    "default": false
  },
  {
    "key": "squareCorners",
    "tab": "interface",
    "section": "Page appearance",
    "label": "Square video thumbnails",
    "description": "Remove rounded corners from native video thumbnails.",
    "default": false
  },
  {
    "key": "disableThemedHover",
    "tab": "interface",
    "section": "Page appearance",
    "label": "Disable themed hover effects",
    "description": "Remove native coloured hover effects from supported video cards.",
    "default": false
  },
  {
    "key": "disableVideoPreviews",
    "tab": "feed",
    "section": "Recommendations",
    "label": "Disable video previews",
    "description": "Disable verified native inline-preview eligibility, with a visual fallback on unrecognised layouts. Enabling this turns off Keep hover previews with miniplayer.",
    "default": false
  },
  {
    "key": "hideSearchPrompts",
    "tab": "feed",
    "section": "Search",
    "label": "Hide search suggestion prompts",
    "description": "Hide native suggestion and refinement prompts in search results.",
    "default": false
  },
  {
    "key": "hideSearchAI",
    "tab": "feed",
    "section": "Search",
    "label": "Hide AI search summaries",
    "description": "Hide explicitly identified AI summaries in search. Ordinary video results are unaffected.",
    "default": false
  },
  {
    "key": "hideAIChapters",
    "tab": "layout",
    "section": "Watch page",
    "label": "Hide AI-labelled chapter panels",
    "description": "Hide explicitly AI-labelled chapter panels. Manual chapters, the seek bar and SponsorBlock markers remain available.",
    "default": false
  },
  {
    "key": "hideCommentGifs",
    "tab": "comments",
    "section": "Comment visibility",
    "label": "Hide comment GIFs",
    "description": "Hide native GIF attachments in comments without removing the comment text.",
    "default": false
  },
  {
    "key": "hideAllComments",
    "tab": "comments",
    "section": "Comment visibility",
    "label": "Hide all comments",
    "description": "Hide the comments section. Enabling this turns off scrollable fullscreen comments.",
    "default": false
  },
  {
    "key": "hideFeedPlaylists",
    "tab": "feed",
    "section": "Additional filters",
    "label": "Hide playlists in feeds",
    "description": "Hide explicitly identified playlist cards in supported feeds and search. Saved playlists, queues and Watch History are excluded.",
    "default": false
  },
  {
    "key": "hideFeedVods",
    "tab": "feed",
    "section": "Additional filters",
    "label": "Hide previously streamed videos",
    "description": "Hide cards explicitly labelled as completed live streams.",
    "default": false
  },
  {
    "key": "hideFeedCollaborations",
    "tab": "feed",
    "section": "Additional filters",
    "label": "Hide collaboration videos",
    "description": "Hide explicitly labelled collaboration cards. Ordinary multi-author text is not guessed.",
    "default": false
  },
  {
    "key": "hideFeedLowViews",
    "tab": "feed",
    "section": "Additional filters",
    "label": "Hide low-view videos",
    "description": "Filter cards with an explicit, readable native view count below the selected threshold. Unknown counts are kept.",
    "default": false
  },
  {
    "key": "hideFeedDubbed",
    "tab": "feed",
    "section": "Additional filters",
    "label": "Hide labelled auto-dubbed videos",
    "description": "Hide cards explicitly labelled auto-dubbed. Audio languages are not guessed from titles.",
    "default": false
  },
  {
    "key": "hideFeedMovies",
    "tab": "feed",
    "section": "Additional filters",
    "label": "Hide Movies and TV cards",
    "description": "Hide explicitly identified Movies and TV cards in recommendations and search.",
    "default": false
  },
  {
    "key": "hideHomePosts",
    "tab": "feed",
    "section": "Additional filters",
    "label": "Hide Home community posts",
    "description": "Hide community post cards on Home. Channel post pages are unaffected.",
    "default": false
  },
  {
    "key": "hideThumbnailBadges",
    "tab": "interface",
    "section": "Page appearance",
    "label": "Hide native thumbnail badges",
    "description": "Hide recognised native format and New badges. Durations, LIVE badges and extension markers are preserved.",
    "default": false
  },
  {
    "key": "hidePremiumUpsells",
    "tab": "interface",
    "section": "Page appearance",
    "label": "Hide Premium promotions",
    "description": "Hide native Premium upsell surfaces. This is cosmetic and does not block advertising.",
    "default": false
  },
  {
    "key": "hideOpenApp",
    "tab": "interface",
    "section": "Page appearance",
    "label": "Hide Open app prompts",
    "description": "Hide native prompts to open the YouTube app.",
    "default": false
  },
  {
    "key": "hideViewsIcon",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Hide view-count icon",
    "description": "Hide the decorative view-count icon on supported native cards.",
    "default": false
  },
  {
    "key": "viewsSeparateLine",
    "tab": "feed",
    "section": "Feed layout",
    "label": "View counts on a separate line",
    "description": "Place native view metadata on its own line in supported feed cards.",
    "default": false
  },
  {
    "key": "hideSidebarSubscriptions",
    "tab": "interface",
    "section": "Sidebar",
    "label": "Hide sidebar subscription list",
    "description": "Hide the native subscription-channel list in the sidebar while preserving the Subscriptions navigation link.",
    "default": false
  },
  {
    "key": "hideExplore",
    "tab": "interface",
    "section": "Sidebar",
    "label": "Hide Explore link",
    "description": "Hide the native Explore navigation entry.",
    "default": false
  },
  {
    "key": "hideSubscriptionsChannels",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Hide Subscriptions channel strip",
    "description": "Hide the horizontal channel selector on the Subscriptions feed.",
    "default": false
  },
  {
    "key": "restoreSubscriptionsLink",
    "tab": "interface",
    "section": "Sidebar",
    "label": "Restore Subscriptions link",
    "description": "Show the existing native Subscriptions navigation entry where the current layout hides it. No fake entry is created.",
    "default": false
  },
  {
    "key": "channelDefaultVideos",
    "tab": "layout",
    "section": "Channel pages",
    "label": "Open channel Videos tab",
    "description": "Use the channel’s existing Videos tab when opening its main page.",
    "default": false
  },
  {
    "key": "pauseChannelTrailers",
    "tab": "layout",
    "section": "Channel pages",
    "label": "Pause automatic channel trailers",
    "description": "Pause an automatically started channel trailer once, before user interaction. Manual playback is respected.",
    "default": false
  },
  {
    "key": "hideChannelBanner",
    "tab": "layout",
    "section": "Channel pages",
    "label": "Hide channel banner",
    "description": "Hide the native channel banner without removing channel controls.",
    "default": false
  },
  {
    "key": "fullWidthChannel",
    "tab": "layout",
    "section": "Channel pages",
    "label": "Full-width channel page",
    "description": "Use the available width on supported channel pages.",
    "default": false
  },
  {
    "key": "fullWindowTheatre",
    "tab": "layout",
    "section": "Theatre view",
    "label": "Full-window theatre view",
    "description": "Expand the video when YouTube is already in theatre mode. This does not move the player or enable theatre mode itself.",
    "default": false
  },
  {
    "key": "theatreHideHeader",
    "tab": "layout",
    "section": "Theatre view",
    "label": "Hide header in full-window theatre",
    "description": "Hide the header only while full-window theatre view is active.",
    "default": false
  },
  {
    "key": "relatedBelowPlayer",
    "tab": "layout",
    "section": "Watch page",
    "label": "Related videos below the player",
    "description": "Stack the related rail below the player when no active queue, chat or engagement panel needs it. Enabling this turns off Hide related videos.",
    "default": false
  },
  {
    "key": "hideFullscreenTitle",
    "tab": "layout",
    "section": "Fullscreen",
    "label": "Hide fullscreen title",
    "description": "Hide the native title overlay in fullscreen.",
    "default": false
  },
  {
    "key": "hideFullscreenVoting",
    "tab": "layout",
    "section": "Fullscreen",
    "label": "Hide fullscreen voting actions",
    "description": "Hide native fullscreen voting actions. Return YouTube Dislike counts on the watch page are separate.",
    "default": false
  },
  {
    "key": "hideFullscreenMoreActions",
    "tab": "layout",
    "section": "Fullscreen",
    "label": "Hide fullscreen More actions",
    "description": "Hide the native More actions control in fullscreen.",
    "default": false
  },
  {
    "key": "hideFullscreenRelated",
    "tab": "layout",
    "section": "Fullscreen",
    "label": "Hide fullscreen related overlay",
    "description": "Hide native fullscreen related-video overlays.",
    "default": false
  },
  {
    "key": "hideFullscreenEndscreen",
    "tab": "layout",
    "section": "Fullscreen",
    "label": "Hide fullscreen end-screen cards",
    "description": "Hide end-screen cards in fullscreen. The general end-screen setting already hides them everywhere when enabled.",
    "default": false
  },
  {
    "key": "hideFullscreenControls",
    "tab": "layout",
    "section": "Fullscreen",
    "label": "Hide fullscreen playback toolbar",
    "description": "Hide the playback toolbar only in fullscreen. Native keyboard controls remain available.",
    "default": false
  },
  {
    "key": "hideChatFullscreen",
    "tab": "layout",
    "section": "Fullscreen",
    "label": "Hide native fullscreen chat",
    "description": "Hide native fullscreen chat surfaces. The Suite’s floating chat setting remains separate.",
    "default": false
  },
  {
    "key": "shortsHideMetadata",
    "tab": "feed",
    "section": "Native Shorts",
    "label": "Hide Shorts metadata until hover",
    "description": "Only applies when Redirect Shorts to watch pages is off.",
    "default": false
  },
  {
    "key": "shortsHideActions",
    "tab": "feed",
    "section": "Native Shorts",
    "label": "Hide Shorts action bar",
    "description": "Hide the native action bar on Shorts pages. Native keyboard playback controls remain available.",
    "default": false
  },
  {
    "key": "shortsHideRelated",
    "tab": "feed",
    "section": "Native Shorts",
    "label": "Hide Shorts related-video link",
    "description": "Hide the native related-video link on Shorts pages.",
    "default": false
  },
  {
    "key": "shortsHideMusic",
    "tab": "feed",
    "section": "Native Shorts",
    "label": "Hide Shorts music link",
    "description": "Hide the native music link on Shorts pages.",
    "default": false
  },
  {
    "key": "shortsHideRemix",
    "tab": "feed",
    "section": "Native Shorts",
    "label": "Hide Shorts Remix button",
    "description": "Hide the native Remix control on Shorts pages.",
    "default": false
  },
  {
    "key": "redirectShorts",
    "tab": "feed",
    "section": "Native Shorts",
    "label": "Redirect Shorts to watch pages",
    "description": "Open Shorts with the normal watch player. Existing behaviour is preserved.",
    "default": true
  },
  {
    "key": "restoreMiniplayerButton",
    "tab": "miniplayer",
    "section": "Native miniplayer",
    "label": "Restore native Miniplayer button",
    "description": "Restore the native control when YouTube omits it.",
    "default": true
  },
  {
    "key": "hideNotifications",
    "tab": "interface",
    "section": "Header cleanup",
    "label": "Hide Notifications button",
    "description": "Hide the native header Notifications button.",
    "default": true
  },
  {
    "key": "hideVoiceSearch",
    "tab": "interface",
    "section": "Header cleanup",
    "label": "Hide Voice search button",
    "description": "Hide the native header Voice search button.",
    "default": true
  },
  {
    "key": "hideCreateButton",
    "tab": "interface",
    "section": "Header cleanup",
    "label": "Hide Create button",
    "description": "Hide the native Create or upload button.",
    "default": true
  },
  {
    "key": "hideSidebarSections",
    "tab": "interface",
    "section": "Sidebar",
    "label": "Tidy extra sidebar sections",
    "description": "Hide the secondary native sidebar sections currently removed by the Suite.",
    "default": true
  },
  {
    "key": "hideGuideFooter",
    "tab": "interface",
    "section": "Sidebar",
    "label": "Hide sidebar footer",
    "description": "Hide the native guide footer links.",
    "default": true
  },
  {
    "key": "hideFeedShelves",
    "tab": "feed",
    "section": "Feed cleanup",
    "label": "Hide rich feed shelves",
    "description": "Hide native rich-section shelves. Turn this off to retain shelves alongside individual card filters.",
    "default": true
  },
  {
    "key": "hideFeedNudges",
    "tab": "feed",
    "section": "Feed cleanup",
    "label": "Hide feed nudges",
    "description": "Hide native recommendation nudges and prompt shelves.",
    "default": true
  },
  {
    "key": "compactFeedSpacing",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Compact feed spacing",
    "description": "Keep the Suite’s existing reduced grid spacing.",
    "default": true
  },
  {
    "key": "hideHomeCategories",
    "tab": "feed",
    "section": "Feed cleanup",
    "label": "Hide feed category chips",
    "description": "Hide native category chip bars on browse feeds.",
    "default": true
  },
  {
    "key": "hideMerchandise",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide merchandise and shopping",
    "description": "Hide native shopping and merchandise surfaces.",
    "default": true
  },
  {
    "key": "hideVideoMetadata",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide extra video metadata",
    "description": "Keep the Suite’s existing cleanup of extra watch-page metadata.",
    "default": true
  },
  {
    "key": "hideInfoPanels",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide information panels",
    "description": "Hide native contextual information panels.",
    "default": true
  },
  {
    "key": "hideAskPanels",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide Ask panels",
    "description": "Hide native Ask and AI-question panels.",
    "default": true
  },
  {
    "key": "collapseEmptySidebar",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Collapse empty sidebar",
    "description": "Reclaim an empty secondary rail while keeping active queues and chat.",
    "default": true
  },
  {
    "key": "snapshotFormat",
    "tab": "player",
    "section": "Capture and export",
    "label": "Snapshot format",
    "description": "PNG preserves image detail. JPEG produces smaller files.",
    "default": "png",
    "options": [
      [
        "png",
        "PNG"
      ],
      [
        "jpeg",
        "JPEG"
      ]
    ]
  },
  {
    "key": "snapshotQuality",
    "tab": "player",
    "section": "Capture and export",
    "label": "JPEG snapshot quality",
    "description": "Only applies to JPEG snapshots.",
    "default": "90",
    "options": [
      [
        "70",
        "70%"
      ],
      [
        "80",
        "80%"
      ],
      [
        "90",
        "90%"
      ],
      [
        "100",
        "100%"
      ]
    ]
  },
  {
    "key": "playerBackground",
    "tab": "player",
    "section": "Player appearance",
    "label": "Player background",
    "description": "Change the player background without altering the video image.",
    "default": "default",
    "options": [
      [
        "default",
        "YouTube default"
      ],
      [
        "black",
        "Black"
      ],
      [
        "transparent",
        "Transparent"
      ]
    ]
  },
  {
    "key": "playerControlsBackground",
    "tab": "player",
    "section": "Player appearance",
    "label": "Playback controls background",
    "description": "Choose the native background effect behind the playback controls.",
    "default": "default",
    "options": [
      [
        "default",
        "YouTube default"
      ],
      [
        "blurred",
        "Blurred"
      ],
      [
        "transparent",
        "Transparent"
      ]
    ]
  },
  {
    "key": "feedColumns",
    "tab": "feed",
    "section": "Feed layout",
    "label": "Video cards per row",
    "description": "Choose grid density on supported desktop feeds. List view takes precedence.",
    "default": "auto",
    "options": [
      [
        "auto",
        "YouTube default"
      ],
      [
        "2",
        "2"
      ],
      [
        "3",
        "3"
      ],
      [
        "4",
        "4"
      ],
      [
        "5",
        "5"
      ],
      [
        "6",
        "6"
      ]
    ]
  },
  {
    "key": "lowViewThreshold",
    "tab": "feed",
    "section": "Additional filters",
    "label": "Low-view threshold",
    "description": "Hide readable counts below this value when the low-view filter is enabled.",
    "default": "1000",
    "options": [
      [
        "100",
        "100 views"
      ],
      [
        "1000",
        "1,000 views"
      ],
      [
        "10000",
        "10,000 views"
      ]
    ]
  },
  {
    "key": "interfaceTheme",
    "tab": "interface",
    "section": "Page appearance",
    "label": "Page theme",
    "description": "Apply an optional page palette without changing account cookies. Dark Reader takes precedence when detected.",
    "default": "default",
    "options": [
      [
        "default",
        "YouTube default"
      ],
      [
        "dark",
        "Dark"
      ],
      [
        "light",
        "Light"
      ]
    ]
  },
  {
    "key": "searchThumbnailSize",
    "tab": "feed",
    "section": "Search",
    "label": "Search thumbnail size",
    "description": "Choose thumbnail width on supported desktop search results.",
    "default": "default",
    "options": [
      [
        "default",
        "YouTube default"
      ],
      [
        "small",
        "Small"
      ],
      [
        "medium",
        "Medium"
      ],
      [
        "large",
        "Large"
      ]
    ]
  },
  {
    "key": "shortsColumns",
    "tab": "feed",
    "section": "Native Shorts",
    "label": "Shorts cards per row",
    "description": "Choose the density of native Shorts shelves where supported.",
    "default": "auto",
    "options": [
      [
        "auto",
        "YouTube default"
      ],
      [
        "3",
        "3"
      ],
      [
        "4",
        "4"
      ],
      [
        "5",
        "5"
      ],
      [
        "6",
        "6"
      ]
    ]
  },
  {
    "key": "hideShareButton",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide Share action",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": true
  },
  {
    "key": "hideThanksButton",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide Thanks action",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": true
  },
  {
    "key": "hideJoinButton",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide Join action",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": true
  },
  {
    "key": "hideInlineSaveButton",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide inline Save action",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": false
  },
  {
    "key": "hideClipButton",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide Clip action",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": false
  },
  {
    "key": "hideStatementBanners",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide statement banners",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": true
  },
  {
    "key": "hideBrandVideoShelf",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide branded video shelves",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": true
  },
  {
    "key": "hideHashtags",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide watch-page hashtags",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": true
  },
  {
    "key": "collapseDescriptionBlankRows",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Compact description spacing",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": true
  },
  {
    "key": "hideStructuredDescription",
    "tab": "layout",
    "section": "Watch page cleanup",
    "label": "Hide structured description sections",
    "description": "Show or hide this watch-page surface after saving and reloading.",
    "default": true
  },
  {
    "key": "hideHistoryAuxActions",
    "tab": "interface",
    "section": "Sidebar",
    "label": "Hide History auxiliary actions",
    "description": "Hide feedback and recommendation-explanation actions in the native History sidebar. Watch History entries are unchanged.",
    "default": true
  },
  {
    "key": "classicProgressColour",
    "tab": "player",
    "section": "Player appearance",
    "label": "Classic red progress colour",
    "description": "Use a solid red native playback progress bar and dot. SponsorBlock segments and your custom playback-marker image are separate.",
    "default": false
  },
  {
    "key": "useStandardMastheadLogo",
    "tab": "interface",
    "section": "Header cleanup",
    "label": "Use standard YouTube logo",
    "description": "Keep the normal logo instead of special event artwork.",
    "default": true
  },
  {
    "key": "hidePayToWatchCards",
    "tab": "feed",
    "section": "Feed cleanup",
    "label": "Hide paid video cards",
    "description": "Hide native rent, buy and pay-to-watch cards in supported feeds.",
    "default": true
  },
  {
    "key": "showAutoplayUpNextCard",
    "tab": "player",
    "section": "Playback",
    "label": "Show autoplay Up next card",
    "description": "Retain the native next-video card separately from end-screen recommendation grids.",
    "default": true
  },
  {
    "key": "enableCleanVideoUrlCopy",
    "tab": "interface",
    "section": "Navigation",
    "label": "Clean copied video URLs",
    "description": "Remove tracking parameters from recognised native Copy video URL actions. Timestamp copying remains available.",
    "default": true
  },
  {
    "key": "requireRightMouseButtonForWheelVolume",
    "tab": "player",
    "section": "Playback",
    "label": "Require right mouse button for wheel volume",
    "description": "Keep normal page scrolling unless the right mouse button is held. Turning this off makes wheel gestures over the player adjust volume directly.",
    "default": true
  },
  {
    "key": "showTemporaryRevealControl",
    "tab": "feed",
    "section": "Feed cleanup",
    "label": "Show hidden-card reveal control",
    "description": "Keep the Suite’s temporary reveal control for filtered feed cards.",
    "default": true
  },
  {
    "key": "compactNativeQueue",
    "tab": "miniplayer",
    "section": "Native queue",
    "label": "Fit native queue to contents",
    "description": "Short queues fit their rows and keep the native corner alignment; longer queues scroll. YouTube’s usual height is temporarily restored while dragging or resizing.",
    "default": true
  }
];
 for (const item of definitions) { if (item.options) { item.options.forEach(Object.freeze); Object.freeze(item.options); } Object.freeze(item); }
 return Object.freeze({ definitions: Object.freeze(definitions), defaults: Object.freeze(Object.fromEntries(definitions.map(item => [item.key, item.default]))), choices: Object.freeze(Object.fromEntries(definitions.filter(item => item.options).map(item => [item.key, Object.freeze(item.options.map(option => option[0]))]))) });
}
