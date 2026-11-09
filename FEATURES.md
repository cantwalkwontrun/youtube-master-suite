---
lang: en-GB
---

# Optional controls and compatibility

The Suite adds 108 menu controls in this update. This includes switches for previously automatic cleanup, preserving its existing defaults. Queue fitting is on by default as requested; other optional new behaviour starts off. Save and reload to apply changes. Search settings to find individual controls; related options are grouped in expandable sections.


## Custom video menus and creator choices

Open **Suite settings → Interface → Video context menu** to create and name submenus, nest them, choose where each recognised action appears, and adjust visibility and order. Up to eight submenus and three nested levels are supported. Delete a submenu to move its contents to its parent. Use the preview to check the arrangement; Save and reload apply it. Cancel discards edits, and Reset menu layout restores the standard arrangement in the draft. Existing saved order and visibility are carried over until you customise them. Full backups include custom menu layouts.

When a video lists several verified creators, **Filter channel uploads** lets you choose whose settings to open. Each creator keeps an independent rule; a collaboration is filtered when any explicitly saved creator rule matches. Conflicting or unverified identities remain unfiltered.

For handle-only cards, **Look up channel ID** makes an explicit public-channel request. Opening a video menu alone sends no lookup. Requests omit account cookies and referrers, reject redirects and conflicting identities, and have time and size limits. Verified lookup results are held temporarily in this page's memory; permanent channel-filter rules remain in private settings storage.

## Conflicting options

- Related videos below the player turns off Hide related videos. Enabling Hide related videos clears the below-player preference. The rail stays beside the player when a queue, chat or engagement panel needs it.
- Disable video previews and Keep hover previews with miniplayer are mutually exclusive.
- Hide all comments and Scrollable fullscreen comments are mutually exclusive.
- Custom grid density applies to grid layouts; list view takes precedence. JPEG quality applies only to JPEG snapshots. Native Shorts page options apply when Shorts redirection is disabled.
- Global hiding rules take precedence over narrower rules: for example, Hide end-screen recommendations already hides those cards in fullscreen.

## Recommended extensions

- **Return YouTube Dislike:** retains ownership of voting and dislike counts. Native action cleanup does not remove its vote controls.
- **SponsorBlock:** retains skipping, categories, notices and segment markers. No additional skip engine or network interception is installed. The optional red progress colour targets only the native playback fill and dot.
- **DeArrow:** replacement titles, thumbnails and original/custom toggles are preserved. Feed filtering uses explicit native card metadata rather than guessed title keywords.
- **uBlock Origin:** remains the advertising and request-blocking component. This update installs no ad-blocking engine or request overrides.

Compatibility checks use synthetic extension markers and representative browser fixtures; they do not prove compatibility with every future extension or YouTube version. Unsupported or ambiguous native markup is left available.

Automatic navigation defaults defer while a main video or native queue is playing. Manual navigation remains available.

Compact queues retain the native corner alignment, including the bottom inset. Native queue height is restored temporarily during dragging and resizing, then fitted again at the selected corner. The video can move vertically during this temporary expansion; the title/queue bar is the reliable area for starting a drag.

## Limits and intentionally excluded controls

- This remains a desktop userscript for top-level www.youtube.com pages. The two embedded-player settings apply to directly opened /embed/ pages. Embedded iframes, youtube-nocookie.com and mobile YouTube need a separate isolated runtime before they can be covered safely. The full Suite is not injected into frames.
- Continue watching bypass and mobile background-play restrictions are not changed. No reliable public native setting was found; private activity-manager overrides or automatic resumption could defeat an intentional pause.
- Native Shorts looping is not overridden through private playback internals.
- Old experimental player/sidebar/layout rollbacks are not reproduced. Those depend on obsolete private experiment flags and can break current YouTube layouts.
- Existing Suite diagnostics cover supported troubleshooting. The other add-on’s internal debug and visual-debug options are not user-facing Suite features.
- Snapshot export is local and requires a user click. Protected or cross-origin frames can be refused by the browser; the Suite reports that result. No export server is used.
- Transcript export saves the transcript currently loaded in the native panel. It does not fetch hidden captions or create a transcription.
- Original audio, autoplay and Stable volume use guarded native APIs and bounded attempts per video. Later manual choices are respected. Unknown or missing audio metadata is not guessed.
- Ambient lighting is hidden cosmetically; this does not claim to stop native background processing. Theme overrides yield to Dark Reader when detected.
- Some native labels vary by locale or rollout. Filters and action cleanup fail open when identity is uncertain.

## Menu controls

| Area | Setting | Default | Behaviour |
| --- | --- | --- | --- |
| player / Playback | Prefer original audio | Off | Select the explicitly identified original audio track when the native player exposes it. A manual audio choice is respected for the current video. |
| player / Playback | Disable autoplay | Off | Turn off native autoplay on each new video. This does not skip or remove queue entries. |
| player / Player appearance | Hide ambient lighting | Off | Hide the native ambient lighting effect. This does not claim to stop background processing. |
| player / Playback | Disable Stable volume | Off | Turn off native volume normalisation when the player exposes its preference API. |
| player / Playback | Disable number-key seeking | Off | Prevent 0–9 from seeking while the video player has focus. Typing in fields is unaffected. |
| player / Capture and export | Show Take snapshot button | Off | Save the current video frame locally on request. Protected or cross-origin frames may be unavailable. |
| player / Capture and export | Show transcript download | Off | Download the transcript already displayed by YouTube. Open the transcript first; no transcription service is contacted. |
| player / Player appearance | Hide Next button | Off | Hide the native next-video control without changing the queue or playback. |
| player / Player appearance | Hide channel watermark | Off | Hide the channel subscription watermark over the video. |
| player / Player appearance | Hide Jump ahead button | Off | Hide YouTube’s Jump ahead control. SponsorBlock controls and skipping are separate. |
| player / Player appearance | Hide legacy annotations | Off | Hide legacy in-video annotation overlays where present. |
| player / Player appearance | Remove player background blur | Off | Remove native blurred background effects without changing the video image. |
| player / Embedded videos | Hide embedded Share button | Off | Applies only to directly opened top-level www.youtube.com/embed/ pages. Embedded iframes and other hosts are not covered. |
| player / Embedded videos | Hide embedded pause overlay | Off | Applies only to directly opened top-level www.youtube.com/embed/ pages. Embedded iframes and other hosts are not covered. |
| interface / Navigation | Open Subscriptions instead of Home | Off | Use the native Subscriptions link on signed-in Home pages. Existing watch playback is left alone. |
| interface / Navigation | YouTube logo opens Subscriptions | Off | Point the native logo link at Subscriptions while preserving normal link and middle-click behaviour. |
| feed / Feed layout | Display Home as a list | Off | Use a compact list instead of the Home grid. |
| feed / Feed layout | Display Subscriptions as a list | Off | Use a compact list for the Subscriptions feed. |
| feed / Feed layout | Hide Subscriptions Latest header | Off | Hide the native Latest header on the Subscriptions feed. |
| feed / Feed layout | Show channel headers in lists | Off | Add creator headings to list cards using their existing verified native channel links. |
| feed / Feed layout | Show full video titles | Off | Remove title line limits on feed cards without replacing DeArrow titles. |
| interface / Page appearance | Square video thumbnails | Off | Remove rounded corners from native video thumbnails. |
| interface / Page appearance | Disable themed hover effects | Off | Remove native coloured hover effects from supported video cards. |
| feed / Recommendations | Disable video previews | Off | Disable verified native inline-preview eligibility, with a visual fallback on unrecognised layouts. Enabling this turns off Keep hover previews with miniplayer. |
| feed / Search | Hide search suggestion prompts | Off | Hide native suggestion and refinement prompts in search results. |
| feed / Search | Hide AI search summaries | Off | Hide explicitly identified AI summaries in search. Ordinary video results are unaffected. |
| layout / Watch page | Hide AI-labelled chapter panels | Off | Hide explicitly AI-labelled chapter panels. Manual chapters, the seek bar and SponsorBlock markers remain available. |
| comments / Comment visibility | Hide comment GIFs | Off | Hide native GIF attachments in comments without removing the comment text. |
| comments / Comment visibility | Hide all comments | Off | Hide the comments section. Enabling this turns off scrollable fullscreen comments. |
| feed / Additional filters | Hide playlists in feeds | Off | Hide explicitly identified playlist cards in supported feeds and search. Saved playlists, queues and Watch History are excluded. |
| feed / Additional filters | Hide previously streamed videos | Off | Hide cards explicitly labelled as completed live streams. |
| feed / Additional filters | Hide collaboration videos | Off | Hide explicitly labelled collaboration cards. Ordinary multi-author text is not guessed. |
| feed / Additional filters | Hide low-view videos | Off | Filter cards with an explicit, readable native view count below the selected threshold. Unknown counts are kept. |
| feed / Additional filters | Hide labelled auto-dubbed videos | Off | Hide cards explicitly labelled auto-dubbed. Audio languages are not guessed from titles. |
| feed / Additional filters | Hide Movies and TV cards | Off | Hide explicitly identified Movies and TV cards in recommendations and search. |
| feed / Additional filters | Hide Home community posts | Off | Hide community post cards on Home. Channel post pages are unaffected. |
| interface / Page appearance | Hide native thumbnail badges | Off | Hide recognised native format and New badges. Durations, LIVE badges and extension markers are preserved. |
| interface / Page appearance | Hide Premium promotions | Off | Hide native Premium upsell surfaces. This is cosmetic and does not block advertising. |
| interface / Page appearance | Hide Open app prompts | Off | Hide native prompts to open the YouTube app. |
| feed / Feed layout | Hide view-count icon | Off | Hide the decorative view-count icon on supported native cards. |
| feed / Feed layout | View counts on a separate line | Off | Place native view metadata on its own line in supported feed cards. |
| interface / Sidebar | Hide sidebar subscription list | Off | Hide the native subscription-channel list in the sidebar while preserving the Subscriptions navigation link. |
| interface / Sidebar | Hide Explore link | Off | Hide the native Explore navigation entry. |
| feed / Feed layout | Hide Subscriptions channel strip | Off | Hide the horizontal channel selector on the Subscriptions feed. |
| interface / Sidebar | Restore Subscriptions link | Off | Show the existing native Subscriptions navigation entry where the current layout hides it. No fake entry is created. |
| layout / Channel pages | Open channel Videos tab | Off | Use the channel’s existing Videos tab when opening its main page. |
| layout / Channel pages | Pause automatic channel trailers | Off | Pause an automatically started channel trailer once, before user interaction. Manual playback is respected. |
| layout / Channel pages | Hide channel banner | Off | Hide the native channel banner without removing channel controls. |
| layout / Channel pages | Full-width channel page | Off | Use the available width on supported channel pages. |
| layout / Theatre view | Full-window theatre view | Off | Expand the video when YouTube is already in theatre mode. This does not move the player or enable theatre mode itself. |
| layout / Theatre view | Hide header in full-window theatre | Off | Hide the header only while full-window theatre view is active. |
| layout / Watch page | Related videos below the player | Off | Stack the related rail below the player when no active queue, chat or engagement panel needs it. Enabling this turns off Hide related videos. |
| layout / Fullscreen | Hide fullscreen title | Off | Hide the native title overlay in fullscreen. |
| layout / Fullscreen | Hide fullscreen voting actions | Off | Hide native fullscreen voting actions. Return YouTube Dislike counts on the watch page are separate. |
| layout / Fullscreen | Hide fullscreen More actions | Off | Hide the native More actions control in fullscreen. |
| layout / Fullscreen | Hide fullscreen related overlay | Off | Hide native fullscreen related-video overlays. |
| layout / Fullscreen | Hide fullscreen end-screen cards | Off | Hide end-screen cards in fullscreen. The general end-screen setting already hides them everywhere when enabled. |
| layout / Fullscreen | Hide fullscreen playback toolbar | Off | Hide the playback toolbar only in fullscreen. Native keyboard controls remain available. |
| layout / Fullscreen | Hide native fullscreen chat | Off | Hide native fullscreen chat surfaces. The Suite’s floating chat setting remains separate. |
| feed / Native Shorts | Hide Shorts metadata until hover | Off | Only applies when Redirect Shorts to watch pages is off. |
| feed / Native Shorts | Hide Shorts action bar | Off | Hide the native action bar on Shorts pages. Native keyboard playback controls remain available. |
| feed / Native Shorts | Hide Shorts related-video link | Off | Hide the native related-video link on Shorts pages. |
| feed / Native Shorts | Hide Shorts music link | Off | Hide the native music link on Shorts pages. |
| feed / Native Shorts | Hide Shorts Remix button | Off | Hide the native Remix control on Shorts pages. |
| feed / Native Shorts | Redirect Shorts to watch pages | On | Open Shorts with the normal watch player. Existing behaviour is preserved. |
| miniplayer / Native miniplayer | Restore native Miniplayer button | On | Restore the native control when YouTube omits it. |
| interface / Header cleanup | Hide Notifications button | On | Hide the native header Notifications button. |
| interface / Header cleanup | Hide Voice search button | On | Hide the native header Voice search button. |
| interface / Header cleanup | Hide Create button | On | Hide the native Create or upload button. |
| interface / Sidebar | Tidy extra sidebar sections | On | Hide the secondary native sidebar sections currently removed by the Suite. |
| interface / Sidebar | Hide sidebar footer | On | Hide the native guide footer links. |
| feed / Feed cleanup | Hide rich feed shelves | On | Hide native rich-section shelves. Turn this off to retain shelves alongside individual card filters. |
| feed / Feed cleanup | Hide feed nudges | On | Hide native recommendation nudges and prompt shelves. |
| feed / Feed layout | Compact feed spacing | On | Keep the Suite’s existing reduced grid spacing. |
| feed / Feed cleanup | Hide feed category chips | On | Hide native category chip bars on browse feeds. |
| layout / Watch page cleanup | Hide merchandise and shopping | On | Hide native shopping and merchandise surfaces. |
| layout / Watch page cleanup | Hide extra video metadata | On | Keep the Suite’s existing cleanup of extra watch-page metadata. |
| layout / Watch page cleanup | Hide information panels | On | Hide native contextual information panels. |
| layout / Watch page cleanup | Hide Ask panels | On | Hide native Ask and AI-question panels. |
| layout / Watch page cleanup | Collapse empty sidebar | On | Reclaim an empty secondary rail while keeping active queues and chat. |
| player / Capture and export | Snapshot format | PNG | PNG preserves image detail. JPEG produces smaller files. |
| player / Capture and export | JPEG snapshot quality | 90% | Only applies to JPEG snapshots. |
| player / Player appearance | Player background | YouTube default | Change the player background without altering the video image. |
| player / Player appearance | Playback controls background | YouTube default | Choose the native background effect behind the playback controls. |
| feed / Feed layout | Video cards per row | YouTube default | Choose grid density on supported desktop feeds. List view takes precedence. |
| feed / Additional filters | Low-view threshold | 1,000 views | Hide readable counts below this value when the low-view filter is enabled. |
| interface / Page appearance | Page theme | YouTube default | Apply an optional page palette without changing account cookies. Dark Reader takes precedence when detected. |
| feed / Search | Search thumbnail size | YouTube default | Choose thumbnail width on supported desktop search results. |
| feed / Native Shorts | Shorts cards per row | YouTube default | Choose the density of native Shorts shelves where supported. |
| layout / Watch page cleanup | Hide Share action | On | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Hide Thanks action | On | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Hide Join action | On | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Hide inline Save action | Off | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Hide Clip action | Off | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Hide statement banners | On | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Hide branded video shelves | On | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Hide watch-page hashtags | On | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Compact description spacing | On | Show or hide this watch-page surface after saving and reloading. |
| layout / Watch page cleanup | Hide structured description sections | On | Show or hide this watch-page surface after saving and reloading. |
| interface / Sidebar | Hide History auxiliary actions | On | Hide feedback and recommendation-explanation actions in the native History sidebar. Watch History entries are unchanged. |
| player / Player appearance | Classic red progress colour | Off | Use a solid red native playback progress bar and dot. SponsorBlock segments and your custom playback-marker image are separate. |
| interface / Header cleanup | Use standard YouTube logo | On | Keep the normal logo instead of special event artwork. |
| feed / Feed cleanup | Hide paid video cards | On | Hide native rent, buy and pay-to-watch cards in supported feeds. |
| player / Playback | Show autoplay Up next card | On | Retain the native next-video card separately from end-screen recommendation grids. |
| interface / Navigation | Clean copied video URLs | On | Remove tracking parameters from recognised native Copy video URL actions. Timestamp copying remains available. |
| player / Playback | Require right mouse button for wheel volume | On | Keep normal page scrolling unless the right mouse button is held. Turning this off makes wheel gestures over the player adjust volume directly. |
| feed / Feed cleanup | Show hidden-card reveal control | On | Keep the Suite’s temporary reveal control for filtered feed cards. |
| miniplayer / Native queue | Fit native queue to contents | On | Short queues fit their rows and retain native corner alignment. Longer queues scroll. Native height is restored temporarily during drag and resize interactions, then fitted again. |

The watched-video threshold also supports 5%, 10%, 25%, 50% and 75%, alongside the existing values. Settings export/import includes every control and accepts earlier valid backups, supplying defaults only for newly introduced fields.
