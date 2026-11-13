// ==UserScript==
// @name         YouTube Suite Settings
// @namespace    Citizen.youtube.suite-settings
// @version      1.83
// @description  Master-only native-style settings panel accessible from the header and watch player.
// @author       Citizen
// @license      GNU GPLv3
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";
  // This canonical module uses the master's validated preference service and embedded assets.
  const settings = suite.settings;
  const BUTTON_ID = "ytms-settings-button";
  const PLAYER_BUTTON_ID = "ytms-player-settings-button";
  const TOOLTIP_ID = "ytms-player-settings-tooltip";
  const DIALOG_ID = "ytms-settings-dialog";
  let panel = null;
  let frame = 0;
  let suspended = false;
  let watchedMasthead = null;
  let watchedApp = null;
  let watchedMastheadContainer = null;
  let discoveryActive = false;
  let button = null;
  let playerButton = null;
  let playerTooltip = null;
  let playerTarget = null;
  let watchedPlayerBranch = [];
  let watchedMissingControls = false;
  let watchedThemeRoot = null;
  let watchedDocumentRoot = null;
  let watchedBody = null;
  let savedReconciliationPending = false;

  suite.openChannelAgeSettings = (channel, context) => {
    if (suspended) return;
    hidePlayerTooltip();
    try {
      openSettings(null, true);
      panel?.openChannels(channel, context);
    } catch (error) {
      suite.reportModuleError('suiteSettings', 'open channel upload filters', error);
    }
  };

  function createPanel() {
    const dialog = suite.createSettingsDialog(document);
    document.body.append(dialog);
    const panelFooter = dialog.querySelector('footer');
    let panelSession = false;

    const $ = id => dialog.querySelector(`[id="ytms-${id}"]`);
    let reloadWarnedDrafts = new Set();
    const DEFAULTS = settings.defaults;
    const GROUPS = {
      feed: [
        ['hideShorts', 'Hide Shorts'], ['hideWatchedVideos', 'Hide watched videos'],
        ['hideLiveVideos', 'Hide live videos'], ['hideUpcomingStreams', 'Hide upcoming streams and premieres'],
        ['hideMixes', 'Hide mixes'], ['hidePodcasts', 'Hide podcasts'], ['hideMembersOnly', 'Hide members-only videos'],
        ['watchedThreshold', 'Watched threshold', ['5', '10', '25', '50', '75', '80', '90', '95', '100'], value => `${value}%`],
        ['keepHoverPreviews', 'Keep hover previews with miniplayer'],
      ],
      player: [
        ['yellowCaptions', 'Readable yellow captions'], ['mirrorButton', 'Show mirror button'],
        ['liveChatButton', 'Show live chat button'],
        ['hideFullscreenQuickActions', 'Hide fullscreen action strip'],
        ['timeDisplayMode', 'Playback time display', ['native', 'elapsed', 'remaining'],
          value => ({ native: 'YouTube default', elapsed: 'Elapsed / total', remaining: 'Remaining / total' })[value]],
        ['timelinePreviewSize', 'Timeline preview size', ['auto', 'small', 'medium', 'large', 'native'],
          value => ({ auto: 'Automatic (fit player)', small: 'Small', medium: 'Medium', large: 'Large', native: 'YouTube default' })[value]],
        ['theatreMode', 'Automatic theatre mode'], ['wheelVolume', 'Mouse wheel volume'],
        ['wheelStep', 'Volume step', ['1', '2', '5', '10'], value => `${value}%`],
        ['preferredVideoQuality', 'Preferred video quality', ['off', 'highest', 'tiny', 'small', 'medium', 'large', 'hd720', 'hd1080', 'hd1440', 'hd2160'],
          value => ({ off: 'YouTube default', highest: 'Highest available', tiny: '144p', small: '240p', medium: '360p', large: '480p',
            hd720: '720p', hd1080: '1080p', hd1440: '1440p', hd2160: '2160p (4K)' })[value]],
      ],
      layout: [
        ['hideRelated', 'Hide related videos'], ['hideChat', 'Hide live chat by default'], ['hideInfoCards', 'Hide info cards'],
        ['hideEndScreens', 'Hide end-screen recommendations'], ['fullscreenComments', 'Scrollable fullscreen comments'],
        ['disableTitleHashtagLinks', 'Disable hashtag links in titles'],
      ],
      miniplayer: [
        ['miniplayerEnabled', 'Scroll miniplayer'],
        ['miniplayerSizeMode', 'Miniplayer size', ['auto', 'custom'], value => value === 'auto' ? 'Automatic' : 'Custom width'],
        ['corner', 'Preferred corner', ['top-right', 'bottom-right', 'bottom-left', 'top-left'], value => value.replace('-', ' ')],
        ['queueInfo', 'Show compact title and queue information'],
      ],
      interface: [
        ['headerSettingsIcon', 'Header button', ['off', 'colour', 'monochrome'], value => value[0].toUpperCase() + value.slice(1)],
        ['playerSettingsIcon', 'Video player button', ['off', 'colour', 'monochrome'], value => value[0].toUpperCase() + value.slice(1)],
        ['showRydTooltipBar', 'Show Return YouTube Dislike tooltip bar'],
        ['showDeArrowTitleButton', 'Show DeArrow icon beside video title'],
        ['showDeArrowQueueButton', 'Show DeArrow logo in queues'],
      ],
    };
    const DESCRIPTIONS = {
      hideShorts: 'Remove Shorts shelves and cards from feeds and search results.',
      hideWatchedVideos: 'Hide videos already watched past your threshold. Watch History is left unchanged.',
      hideLiveVideos: 'Hide cards for videos broadcasting live now in supported feeds and search. Off by default. Applies after reload.',
      hideUpcomingStreams: 'Hide cards advertising scheduled streams or premieres, including Upcoming and Notify me cards. On by default, preserving the existing filter. This does not stop playback. Applies after reload.',
      hideMixes: 'Remove automatically generated mix cards from supported feeds.',
      hidePodcasts: 'Remove podcast cards and shelves from supported feeds.',
      hideMembersOnly: 'Remove cards for videos restricted to channel members.',
      watchedThreshold: 'Choose how much watched progress is required before a video card is hidden.',
      keepHoverPreviews: 'Allow native hover previews on Home while the miniplayer is open. Honours YouTube’s Inline playback preference. Enabling this turns off Disable video previews. Experimental: unsupported layouts retain YouTube’s behaviour.',
      yellowCaptions: 'Use readable yellow subtitles with a black shadow in the player and inline previews.',
      mirrorButton: 'Show the horizontal flip control. Only the video image is mirrored, not captions or controls.',
      liveChatButton: 'Show a playback-bar button for native live chat when available, including supported fullscreen views. Chat visibility is temporary for the current video. This button preference applies after reload.',
      hideFullscreenQuickActions: 'Hide the fullscreen Likes, Dislikes, Comments, Share and More action strip. The main playback controls are unchanged. Off by default; applies after reload.',
      timeDisplayMode: 'Choose elapsed or remaining time beside the total duration using YouTube’s native timer toggle. Live streams, adverts and unsupported timers are unchanged. Applies after reload.',
      timelinePreviewSize: 'Size of the thumbnail shown when hovering over the timeline. Automatic adapts to the visible player, including fullscreen and browser zoom. Larger sizes enlarge YouTube’s existing image, not its detail. The preview may briefly flicker or resize near SponsorBlock segments or chapter boundaries. Applies after reload.',
      theatreMode: 'Start watch videos in YouTube’s theatre view.',
      wheelVolume: 'Scroll over the player to adjust volume. The right mouse button is required by default. Plain vertical scrolling takes you to comments when scrollable fullscreen comments are active.',
      wheelStep: 'Choose the volume change for each wheel step during the right-button gesture.',
      preferredVideoQuality: 'Request this quality on each new video, or the nearest lower available resolution. Opening native player settings stops pending attempts. Higher quality uses more bandwidth. Applies after reload.',
      hideRelated: 'Hide suggested videos beside the watch page without hiding the active queue. Enabling this turns off Related videos below the player.',
      hideChat: 'Start each video with live chat hidden, without removing other engagement panels. The player’s live chat button can show it temporarily without changing this saved default.',
      hideInfoCards: 'Hide in-video information cards and their buttons.',
      hideEndScreens: 'Hide end-screen recommendation tiles without taking over native autoplay.',
      fullscreenComments: 'Scroll to existing comments while page fullscreen remains active. Enabling this turns off Hide all comments. Player-only fullscreen is unchanged.',
      disableTitleHashtagLinks: 'Keep hashtag text as ordinary title text without opening hashtag pages. Preserves YouTube’s title nodes and DeArrow replacements. Applies after reload.',
      miniplayerEnabled: 'Float the watch player into a corner when it scrolls out of view.',
      miniplayerSizeMode: 'Automatic keeps the existing adaptive size. Custom uses your chosen width, reduced only when needed to fit the window. Preview changes immediately; Save keeps them.',
      corner: 'Choose the floating player’s corner. This also synchronises with other open YouTube windows.',
      queueInfo: 'Show the current title and queue position at the top of the floating player.',
      headerSettingsIcon: 'Choose the icon beside your profile button. Available on feed and watch pages.',
      playerSettingsIcon: 'Choose the icon before Mirror video in watch and live player controls.',
      showRydTooltipBar: 'Show Return YouTube Dislike’s tooltip bar. Hidden by default; dislike counts and voting buttons are unchanged. Applies after reload.',
      showDeArrowTitleButton: 'Show DeArrow’s title-button controls beside the watch-page title. Hidden by default; title and thumbnail replacements remain active. Applies after reload.',
      showDeArrowQueueButton: 'Show DeArrow’s original/custom toggle logo in queue titles. Hiding it does not disable DeArrow title or thumbnail replacements.',
      menuShowDownload: 'Show YouTube’s Download action when available. Hidden by default; this does not enable downloads or change your account permissions.',
      menuShowHype: 'Show YouTube’s Hype action when available. Hiding it does not send a Hype action.',
      menuGroupChannelTools: 'On: place Filter channel uploads, Don’t recommend channel and Report in a Channel tools submenu. Off: keep enabled actions separate in the main menu. Not interested always stays in the main menu. Save and reload to apply.',
      menuShowAgeLimit: 'Add Filter channel uploads to set how old a selected channel’s uploads can be. It appears first in Channel tools by default.',
      menuShowNotInterested: 'Keep YouTube’s Not interested action visible when the video menu provides it.',
      menuShowDontRecommend: 'Keep YouTube’s Don’t recommend channel action available, separately or inside Channel tools.',
      menuShowReport: 'Keep YouTube’s Report action available, separately or inside Channel tools. A report is never submitted automatically.',
    };
    const featureByKey = new Map(settings.features.map(feature => [feature.key, feature]));
    for (const feature of settings.features) {
      (GROUPS[feature.tab] ||= []).push([feature.key, feature.label, feature.options?.map(option => option[0]),
        value => feature.options?.find(option => option[0] === value)?.[1] || value]);
      DESCRIPTIONS[feature.key] = feature.description;
    }
    let saved = settings.read();
    let savingPreferences = false;
    let draft = { ...saved };
    let menuEditor = null;
    let lastValidMiniplayerWidth = draft.miniplayerWidth;
    let externalConflict = false;
    let pickerTarget = null;
    let pickerTrigger = null;
    let currentTab = 'comments';
    let channelEntry = 'settings';
    let channelManager = null;
    let channelFooterHost = null;

    let supportPanel = null, extraControls = null, javascriptPanel = null;
    const tabIds = ['comments', 'feed', 'channels', 'player', 'layout', 'miniplayer', 'interface', 'extensions', 'javascript', 'support', 'credits'];
    const searchBar = document.createElement('div'); searchBar.className = 'settings-search';
    const searchInput = document.createElement('input');
    searchInput.id = 'ytms-settings-search'; searchInput.type = 'search'; searchInput.maxLength = 200;
    searchInput.placeholder = 'Search settings'; searchInput.autocomplete = 'off';
    searchInput.setAttribute('aria-label', 'Search all Suite settings');
    searchInput.setAttribute('aria-controls', 'ytms-settings-search-results');
    const searchClear = document.createElement('button'); searchClear.type = 'button';
    searchClear.className = 'settings-search-clear'; searchClear.textContent = 'Clear';
    searchClear.setAttribute('aria-label', 'Clear settings search'); searchClear.hidden = true;
    searchBar.append(searchInput, searchClear);
    dialog.querySelector('nav').before(searchBar);
    const searchResults = document.createElement('section');
    searchResults.id = 'ytms-settings-search-results'; searchResults.hidden = true;
    searchResults.setAttribute('aria-label', 'Settings search results');
    const searchStatus = document.createElement('p'); searchStatus.id = 'ytms-settings-search-status';
    searchStatus.setAttribute('role', 'status'); searchStatus.setAttribute('aria-live', 'polite');
    const searchList = document.createElement('div'); searchList.className = 'settings-search-list';
    const searchActions = new WeakMap();
    searchResults.append(searchStatus, searchList); dialog.querySelector('.content').append(searchResults);
    let searchIndex = [], searchActive = false;
    let searchDestination = null;
    let searchDestinationMarks = [];
    let searchDestinationRequest = null;
    function clearSearchDestination() {
      searchDestination?.classList.remove('settings-search-destination');
      searchDestination = null;
      searchDestinationRequest = null;
      for (const mark of searchDestinationMarks) {
        const parent = mark.parentNode;
        if (!parent) continue;
        mark.replaceWith(...mark.childNodes);
        parent.normalize();
      }
      searchDestinationMarks = [];
    }
    function resetSearch() {
      clearSearchDestination();
      searchActive = false;
      searchInput.value = ''; searchClear.hidden = true; searchResults.hidden = true;
      searchList.replaceChildren(); searchStatus.textContent = '';
      dialog.querySelector('nav').hidden = false;
    }
    function selectTab(id, focus = false) {
      closePicker(false);
      resetSearch();
      currentTab = id;
      $('restore-section-defaults').disabled = ['channels', 'extensions', 'javascript', 'support', 'credits'].includes(id);
      for (const tab of tabIds) {
        const selected = tab === id;
        const section = $(`section-${tab}`), button = $(`tab-${tab}`);
        if (section.hidden === selected) section.hidden = !selected;
        if (button.getAttribute('aria-selected') !== String(selected)) button.setAttribute('aria-selected', String(selected));
        if (button.tabIndex !== (selected ? 0 : -1)) button.tabIndex = selected ? 0 : -1;
      }
      panelFooter.classList.toggle('ytms-channels-active', id === 'channels');
      if (channelFooterHost) channelFooterHost.hidden = id !== 'channels';
      dialog.querySelector('.content').scrollTop = 0;
      if (id === 'channels') renderChannelRules();
      if (id === 'support') supportPanel?.refresh();
      extraControls?.selectTab(id);
      javascriptPanel?.selectTab(id);
      if (focus) $(`tab-${id}`).focus();
    }
    for (const id of tabIds) {
      const tab = document.createElement('button');
      tab.id = `ytms-tab-${id}`; tab.textContent = id === 'javascript' ? 'Custom JS' : id[0].toUpperCase() + id.slice(1);
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `ytms-section-${id}`);
      tab.addEventListener('click', event => { if (event.isTrusted && panelSession && dialog.open) selectTab(id); });
      tab.addEventListener('keydown', event => {
        if (!event.isTrusted || !panelSession || !dialog.open) return;
        const index = tabIds.indexOf(id);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabIds.length :
          event.key === 'ArrowLeft' ? (index + tabIds.length - 1) % tabIds.length :
          event.key === 'Home' ? 0 : event.key === 'End' ? tabIds.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); selectTab(tabIds[next], true); }
      });
      dialog.querySelector('nav').append(tab);
    }
    const menuDetails = document.createElement('details'); menuDetails.id = 'ytms-video-menu-settings';
    const menuSummary = document.createElement('summary'); menuSummary.textContent = 'Video context menu';
    menuDetails.append(menuSummary); $('section-interface').append(menuDetails);
    const featureSections = new Map();
    function featureDestination(feature) {
      const key = feature.tab + ':' + feature.section;
      if (!featureSections.has(key)) {
        const details = document.createElement('details'); details.className = 'feature-group';
        const summary = document.createElement('summary'); summary.textContent = feature.section;
        const note = document.createElement('p'); note.className = 'section-note';
        note.textContent = 'Save changes and reload YouTube to apply these options.';
        details.append(summary, note); $('section-' + feature.tab).append(details);
        featureSections.set(key, details);
      }
      return featureSections.get(key);
    }
    for (const [group, rows] of Object.entries(GROUPS)) {
      for (const [key, labelText, choices, format] of rows) {
        const row = document.createElement('div'); row.className = 'row';
        const label = document.createElement('label'); label.htmlFor = `ytms-${key}`; label.textContent = labelText;
        const description = document.createElement('span'); description.className = 'description';
        description.id = `ytms-${key}-description`; description.textContent = DESCRIPTIONS[key]; label.append(description);
        const input = document.createElement(choices ? 'select' : 'input'); input.id = `ytms-${key}`;
        input.setAttribute('aria-describedby', description.id);
        if (choices) {
          for (const value of choices) { const option = document.createElement('option'); option.value = value; option.textContent = format(value); input.append(option); }
        } else { input.type = 'checkbox'; input.className = 'switch'; input.setAttribute('role', 'switch'); }
        row.append(label, input);
        if (featureByKey.has(key)) featureDestination(featureByKey.get(key)).append(row);
        else if (group === 'interface' && key.startsWith('menu')) menuDetails.append(row);
        else $(`section-${group}`).insertBefore(row, group === 'interface' ? menuDetails : null);
        input.addEventListener('change', () => {
          draft[key] = choices ? input.value : input.checked;
          resolveDraftOpposites([key]);
          syncFeatureDependencies(); updateColours();
        });
      }
    }
    const ageRow = document.createElement('div'); ageRow.className = 'row';
    const ageLabel = document.createElement('div'); ageLabel.className = 'row-label';
    ageLabel.textContent = 'Channel upload filters';
    const ageDescription = document.createElement('span'); ageDescription.className = 'description';
    ageDescription.id = 'ytms-channel-age-description';
    ageDescription.textContent = 'Search and sort saved channels, or edit their upload-age limits. Channel filters are saved separately from other settings.';
    ageLabel.append(ageDescription);
    const channelNote = document.createElement('p'); channelNote.className = 'section-note';
    channelNote.textContent = 'These are this browser profile’s Suite filters. YouTube’s own Don’t recommend channel choices are separate. Edits and removals apply only after Save filters. Channel filtering overlaps with BlockTube on supported feeds, but BlockTube also offers other filters; its existing rules are not transferred.';
    const channelHelp = document.createElement('a'); channelHelp.className = 'channel-filter-help';
    channelHelp.textContent = 'Manage YouTube’s own recommendation controls';
    channelHelp.href = 'https://support.google.com/youtube/answer/6342839?hl=en&co=GENIE.Platform%3DDesktop';
    channelHelp.target = '_blank'; channelHelp.rel = 'noopener noreferrer';
    channelHelp.setAttribute('aria-label', 'Manage YouTube’s own recommendation controls (opens in a new tab)');
    const channelNotice = document.createElement('p'); channelNotice.className = 'section-note';
    channelNotice.id = 'ytms-channel-entry-notice'; channelNotice.setAttribute('role', 'status'); channelNotice.hidden = true;
    ageRow.append(ageLabel); $('section-channels').append(ageRow, channelNote, channelHelp, channelNotice);
    channelFooterHost = document.createElement('div'); channelFooterHost.id = 'ytms-channel-footer'; channelFooterHost.hidden = true;
    panelFooter.append(channelFooterHost);
    function finishChannelEdit(wasSaved, previous = {}) {
      const fromContext = channelEntry === 'context';
      channelEntry = 'settings';
      if ((!wasSaved && !previous.hadEditor && !previous.hadDraft) ||
          (fromContext && !primaryActionState().dirty && !externalConflict)) {
        dialog.close();
        return;
      }
      selectTab('channels');
      if (fromContext) {
        channelNotice.textContent = wasSaved ? 'Channel filters saved. Other settings still have unsaved changes.' :
          'Channel edits cancelled. Other settings still have unsaved changes.';
        channelNotice.hidden = false;
      }
      channelManager.element.querySelector('#ytms-channel-search')?.focus({ preventScroll: true });
    }
    channelManager = suite.createChannelAgeDialog(document, suite.channelAge,
      change => suite.showChannelFilterConfirmation?.(change), {
        host: $('section-channels'), footerHost: channelFooterHost,
        isActive: () => panelSession && dialog.open && !searchActive && currentTab === 'channels',
        write: suite.writeChannelFilters,
        channelBackup: suite.backup, openFullBackup: () => selectTab('support', true),
        onImported: () => { channelEntry = 'settings'; channelNotice.hidden = true; channelManager.refresh(); },
        onComplete: () => finishChannelEdit(true), onCancel: previous => finishChannelEdit(false, previous),
      });
    function renderChannelRules() {
      if (panelSession && dialog.open && !searchActive && currentTab === 'channels') channelManager?.refresh();
    }
    function openChannels(channel, context) {
      channelEntry = context?.card && context?.videoId ? 'context' : 'settings';
      channelNotice.hidden = true;
      selectTab('channels');
      channelManager.open(channel, context);
    }

    menuEditor = suite.createMenuEditor(document, suite.menuLayout, {
      getPreferences: () => draft,
      getAppliedPreferences: () => settings.initial,
      setLayout: layout => {
        if (JSON.stringify(layout) === JSON.stringify(suite.menuLayout.fromPreferences(saved))) {
          for (const key of Object.keys(DEFAULTS).filter(key => key.startsWith('menu'))) {
            draft[key] = key === 'menuLayout' ? suite.menuLayout.clone(saved[key]) : Array.isArray(saved[key]) ? [...saved[key]] : saved[key];
          }
        } else draft.menuLayout = suite.menuLayout.clone(layout);
      },
      onChange: () => markDraftChanged(),
      onRender: () => refreshSearchDestination(),
      onReset: () => {
        for (const key of Object.keys(DEFAULTS).filter(key => key.startsWith('menu'))) {
          draft[key] = Array.isArray(DEFAULTS[key]) ? [...DEFAULTS[key]] : DEFAULTS[key];
        }
        markDraftChanged();
      },
    });
    const menuOrderHeading = menuEditor.heading, menuOrderNote = menuEditor.description;
    const menuLabels = suite.menuLayout.labels;
    menuDetails.append(menuEditor.element);
    const miniplayerNote = document.createElement('p'); miniplayerNote.className = 'section-note';
    miniplayerNote.textContent = 'The player keeps its proportions and stays inside the window. Cancel restores the saved size.';
    const sizeRow = document.createElement('div'); sizeRow.className = 'row'; sizeRow.id = 'ytms-miniplayer-width-row';
    const sizeLabel = document.createElement('label'); sizeLabel.htmlFor = 'ytms-miniplayerWidth'; sizeLabel.textContent = 'Custom width';
    const sizeHelp = document.createElement('span'); sizeHelp.className = 'description'; sizeHelp.id = 'ytms-miniplayer-width-description';
    sizeHelp.textContent = '320–1200 pixels. Your requested width is remembered when a smaller window requires a temporary reduction.';
    sizeLabel.append(sizeHelp);
    const sizeControls = document.createElement('div'); sizeControls.className = 'miniplayer-size-controls';
    const sizeRange = document.createElement('input'); sizeRange.type = 'range'; sizeRange.min = '320'; sizeRange.max = '1200'; sizeRange.step = '1';
    sizeRange.id = 'ytms-miniplayer-width-slider'; sizeRange.setAttribute('aria-label', 'Custom miniplayer width');
    const sizeNumber = document.createElement('input'); sizeNumber.type = 'number'; sizeNumber.min = '320'; sizeNumber.max = '1200'; sizeNumber.step = '1';
    sizeNumber.id = 'ytms-miniplayerWidth'; sizeNumber.setAttribute('aria-describedby', sizeHelp.id);
    const sizeUnit = document.createElement('span'); sizeUnit.textContent = 'px';
    sizeControls.append(sizeRange, sizeNumber, sizeUnit); sizeRow.append(sizeLabel, sizeControls);
    $('miniplayerSizeMode').closest('.row').after(sizeRow);
    $('section-miniplayer').append(miniplayerNote);
    function validSizeWidth(value) { return Number.isInteger(value) && value >= 320 && value <= 1200; }
    function applyMiniplayerSize(values) {
      if (validSizeWidth(values.miniplayerWidth)) suite.setScrollMiniplayerSize?.({ mode: values.miniplayerSizeMode, width: values.miniplayerWidth });
    }
    function updateSizeControls() {
      const custom = draft.miniplayerSizeMode === 'custom';
      if (validSizeWidth(draft.miniplayerWidth)) lastValidMiniplayerWidth = draft.miniplayerWidth;
      else if (!custom) {
        draft.miniplayerWidth = lastValidMiniplayerWidth;
        sizeNumber.value = String(draft.miniplayerWidth);
      }
      sizeRow.hidden = !custom;
      const invalid = custom && !validSizeWidth(draft.miniplayerWidth);
      sizeNumber.setAttribute('aria-invalid', String(invalid));
      if (validSizeWidth(draft.miniplayerWidth)) sizeRange.value = String(draft.miniplayerWidth);
      if (!invalid) applyMiniplayerSize(draft);
    }
    for (const input of [sizeRange, sizeNumber]) input.addEventListener('input', () => {
      draft.miniplayerWidth = input.value === '' ? NaN : Number(input.value);
      if (input === sizeRange) sizeNumber.value = sizeRange.value;
      updateSizeControls(); markDraftChanged();
    });
    const accessNote = document.createElement('p'); accessNote.className = 'section-note';
    accessNote.textContent = 'Keep at least one button enabled. With the header button off, open a video to access settings. Changes apply after reload.';
    $('section-interface').append(accessNote);
    const extensionsHeading = document.createElement('h3'); extensionsHeading.textContent = 'Recommended extensions';
    const extensionsNote = document.createElement('p'); extensionsNote.className = 'section-note';
    extensionsNote.textContent = 'Optional companions to YouTube Master Suite. Install and manage them in your browser. This list does not check installation status or enable extensions.';
    $('section-extensions').append(extensionsHeading, extensionsNote);
    for (const extension of suite.settingsAssets.recommendedExtensions) {
      const card = document.createElement('article'); card.className = 'extension-card';
      card.id = `ytms-extension-${extension.id}`; card.setAttribute('aria-labelledby', `${card.id}-name`);
      const image = document.createElement('img'); image.src = extension.logo;
      image.alt = `${extension.name} logo`; image.width = 40; image.height = 40;
      const details = document.createElement('div'); details.className = 'extension-details';
      const name = document.createElement('h4'); name.id = `${card.id}-name`; name.textContent = extension.name;
      const description = document.createElement('p'); description.textContent = extension.description;
      const note = document.createElement('p'); note.className = 'extension-note'; note.textContent = extension.note;
      const link = document.createElement('a'); link.href = extension.url;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'extension-link';
      link.textContent = 'Official website'; link.setAttribute('aria-label', `${extension.name}: official website (opens in a new tab)`);
      details.append(name, description, note, link); card.append(image, details); $('section-extensions').append(card);
    }
    const credits = document.createElement('div'); credits.className = 'credits';
    const logo = document.createElement('img'); logo.id = 'ytms-credits-logo';
    logo.src = suite.settingsAssets.logo; logo.alt = 'YouTube Master Suite logo'; logo.width = 96; logo.height = 96;
    const heading = document.createElement('h3'); heading.textContent = 'YouTube Master Suite';
    const author = document.createElement('p'); author.textContent = 'Created by Citizen';
    const version = document.createElement('p'); version.textContent = `Version ${suite.version} · GNU GPLv3`;
    credits.append(logo, heading, author, version); $('section-credits').append(credits);
    extraControls = suite.createSettingsExtraControls(document, window, suite, dialog);
    javascriptPanel = suite.createCustomJavascriptPanel(document, suite.customJavascript);
    $('section-javascript').append(javascriptPanel.element);
    const normaliseHex = settings.normaliseHex;
    function theme() { return document.documentElement.hasAttribute('dark') ? 'dark' : 'light'; }
    function colours() { return settings.colours(draft, theme() === 'dark'); }
    function rgb(hex) { return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)); }
    function hex(channels) { return '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase(); }
    function luminance(colour) {
      return rgb(colour).map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; })
        .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    }
    const preferenceKeys = Object.keys(DEFAULTS);
    const preferenceControlIds = { colourMode: 'colour-mode', viewerColour: 'viewer-hex', ownerColour: 'owner-hex' };
    const preferenceBadges = new Map();
    function samePreference(key, value, other) {
      if (key === 'menuLayout') return JSON.stringify(value) === JSON.stringify(other);
      return Array.isArray(value) && Array.isArray(other)
        ? value.length === other.length && value.every((item, index) => item === other[index])
        : value === other;
    }
    function samePreferences(left, right) {
      return preferenceKeys.every(key => samePreference(key, left[key], right[key]));
    }
    function primaryActionState() {
      const invalid = (menuEditor && !menuEditor.isValid()) || (draft.colourMode === 'custom' && ['viewer', 'owner'].some(name => !normaliseHex($(`${name}-hex`).value))) ||
        (draft.miniplayerSizeMode === 'custom' && !validSizeWidth(draft.miniplayerWidth));
      const inaccessible = draft.headerSettingsIcon === 'off' && draft.playerSettingsIcon === 'off';
      // Unlike most preferences, the floating player's corner may already
      // have been applied live by its control or a storage event. A settings
      // save on this same page does not apply it; use the actual module value
      // when available, retaining the startup baseline if it is unavailable.
      let appliedCorner = settings.initial.corner;
      let appliedSize = { miniplayerSizeMode: settings.initial.miniplayerSizeMode, miniplayerWidth: settings.initial.miniplayerWidth };
      try {
        const currentCorner = suite.getAppliedScrollMiniplayerCorner?.();
        if (['top-right', 'bottom-right', 'bottom-left', 'top-left'].includes(currentCorner)) appliedCorner = currentCorner;
        const size = suite.getAppliedScrollMiniplayerSize?.();
        if (size && ['auto', 'custom'].includes(size.mode) && validSizeWidth(size.width)) {
          appliedSize = { miniplayerSizeMode: size.mode, miniplayerWidth: size.width };
          // The panel previews a valid draft size live and restores the saved
          // size on Cancel. This preview does not create a reload requirement.
          if (size.mode === draft.miniplayerSizeMode && size.width === lastValidMiniplayerWidth) {
            appliedSize = { miniplayerSizeMode: saved.miniplayerSizeMode, miniplayerWidth: saved.miniplayerWidth };
          }
        }
      } catch { /* A failed module must not break settings. */ }
      const checked = invalid || inaccessible ? draft : settings.validate(draft);
      const applied = { ...settings.initial, corner: appliedCorner, ...appliedSize };
      return { invalid, inaccessible, checked, applied,
        dirty: invalid || inaccessible || !samePreferences(checked, saved), pendingReload: !samePreferences(saved, applied) };
    }
    function updatePreferenceStatus({ dirty, pendingReload, checked, applied }) {
      const summary = externalConflict ? 'Settings changed in another window.'
        : [dirty && 'Unsaved changes.', pendingReload && 'Saved changes need a reload.'].filter(Boolean).join(' ') || 'Saved settings are active on this page.';
      const status = $('preference-status');
      if (status.textContent !== summary) status.textContent = summary;
      if (!dirty && !pendingReload && !preferenceBadges.size) return;
      const changes = new Map();
      if (dirty || pendingReload) for (const key of preferenceKeys) {
        const unsaved = dirty && !samePreference(key, checked[key], saved[key]);
        const needsReload = pendingReload && !samePreference(key, saved[key], applied[key]);
        if (!unsaved && !needsReload) continue;
        const id = key.startsWith('menu') ? 'menu-editor-heading' : preferenceControlIds[key] || key;
        const flags = changes.get(id) || 0;
        changes.set(id, flags | (unsaved ? 1 : 0) | (needsReload ? 2 : 0));
      }
      for (const [id, badge] of preferenceBadges) {
        if (changes.has(id)) continue;
        const control = $(id);
        const references = (control?.getAttribute('aria-describedby') || '').split(/\s+/).filter(ref => ref && ref !== badge.id);
        if (references.length) control.setAttribute('aria-describedby', references.join(' '));
        else control?.removeAttribute('aria-describedby');
        badge.remove(); preferenceBadges.delete(id);
      }
      for (const [id, flags] of changes) {
        let badge = preferenceBadges.get(id);
        if (!badge) {
          const control = $(id), label = control?.labels?.[0];
          if (!label && control !== menuOrderHeading) continue;
          badge = document.createElement('span'); badge.className = 'preference-badge';
          badge.id = `ytms-${id}-state`;
          badge.setAttribute('aria-hidden', 'true');
          (label || menuOrderHeading).append(badge); preferenceBadges.set(id, badge);
          control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), badge.id].filter(Boolean).join(' '));
        }
        const text = flags === 3 ? 'Unsaved · saved version needs reload' : flags === 1 ? 'Unsaved' : 'Reload needed';
        if (badge.textContent !== text) badge.textContent = text;
      }
    }
    function updatePrimaryAction() {
      const state = primaryActionState();
      const reload = !externalConflict && !state.dirty && state.pendingReload;
      if (!reload) clearReloadConfirmation();
      const button = $('save-preview'), label = reload ? 'Reload now' : 'Save', action = reload ? 'reload' : 'save';
      const disabled = externalConflict || state.invalid || state.inaccessible || (!state.dirty && !state.pendingReload);
      if (button.textContent !== label) button.textContent = label;
      if (button.dataset.action !== action) button.dataset.action = action;
      if (button.disabled !== disabled) button.disabled = disabled;
      updatePreferenceStatus(state);
      supportPanel?.updateDraftState();
      return state;
    }
    function showConflictNotice() {
      clearReloadConfirmation();
      $('settings-status').textContent = 'Settings changed in another window. Your draft has been kept. Cancel and reopen settings before saving or reloading.';
      $('settings-status').hidden = false;
    }
    function reconcileStoredPreferences() {
      if (!panelSession || !dialog.open) return true;
      const current = settings.read();
      if (samePreferences(current, saved)) {
        // The corner storage event can arrive after a settings event already
        // adopted the new saved values. The miniplayer applies that corner on
        // the later event, so recompute the action even without a saved diff.
        const previousAction = $('save-preview').dataset.action;
        const state = updatePrimaryAction();
        if (!externalConflict && !state.dirty && previousAction !== $('save-preview').dataset.action && !$('settings-status').hidden) {
          $('settings-status').textContent = state.pendingReload
            ? 'Saved changes are waiting for reload. This page still uses its previous settings.'
            : 'Saved settings now match the settings applied to this page.';
        }
        return !externalConflict;
      }
      clearReloadConfirmation();
      if (externalConflict || primaryActionState().dirty) {
        externalConflict = true; updatePrimaryAction(); showConflictNotice();
        return false;
      }
      saved = current; draft = { ...saved };
      closePicker(false); populate();
      $('settings-status').textContent = primaryActionState().pendingReload
        ? 'Saved settings changed in another window. Reload when ready to apply them.'
        : 'Saved settings changed in another window. They now match the settings applied to this page.';
      $('settings-status').hidden = false;
      return true;
    }
    function setHidden(element, hidden) {
      if (element.hidden !== hidden) element.hidden = hidden;
    }
    function updateColours() {
      updateSizeControls();
      const custom = draft.colourMode === 'custom';
      setHidden($('custom-colours'), !custom); setHidden($('palette-row'), draft.colourMode !== 'preset');
      const pair = colours(); const preview = $('comment-preview');
      if (preview.dataset.mode !== draft.colourMode) preview.dataset.mode = draft.colourMode;
      function setColourStyle(element, name, value) {
        if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
      }
      for (const [index, name] of ['viewer', 'owner'].entries()) {
        if (pair) setColourStyle(preview, `--${name}-colour`, pair[index]);
        else if (preview.style.getPropertyValue(`--${name}-colour`)) preview.style.removeProperty(`--${name}-colour`);
        setColourStyle($(`${name}-swatch`), '--swatch', draft[`${name}Colour`]);
      }
      const inaccessible = draft.headerSettingsIcon === 'off' && draft.playerSettingsIcon === 'off';
      setHidden($('button-access-error'), !inaccessible);
      updatePrimaryAction();
      const background = luminance(theme() === 'dark' ? '#0F0F0F' : '#FFFFFF');
      setHidden($('contrast-warning'), !pair || !pair.some(colour => {
        const foreground = luminance(colour);
        return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) < 4.5;
      }));
    }
    function resolveDraftOpposites(keys) {
      const opposites = { relatedBelowPlayer: 'hideRelated', hideRelated: 'relatedBelowPlayer',
        disableVideoPreviews: 'keepHoverPreviews', keepHoverPreviews: 'disableVideoPreviews',
        hideAllComments: 'fullscreenComments', fullscreenComments: 'hideAllComments' };
      for (const key of keys) if (draft[key] && opposites[key]) {
        draft[opposites[key]] = false;
        if ($(opposites[key])) $(opposites[key]).checked = false;
      }
    }
    function syncFeatureDependencies() {
      const dependencies = { snapshotFormat: draft.snapshotButton, snapshotQuality: draft.snapshotButton && draft.snapshotFormat === 'jpeg',
        lowViewThreshold: draft.hideFeedLowViews, theatreHideHeader: draft.fullWindowTheatre,
        shortsHideMetadata: !draft.redirectShorts, shortsHideActions: !draft.redirectShorts,
        shortsHideRelated: !draft.redirectShorts, shortsHideMusic: !draft.redirectShorts, shortsHideRemix: !draft.redirectShorts };
      for (const [key, enabled] of Object.entries(dependencies)) {
        const input = $(key); if (input) input.disabled = !enabled;
      }
    }
    function populate(keys) {
      const selected = keys ? new Set(keys) : null;
      for (const [key, value] of Object.entries(draft)) {
        if (selected && !selected.has(key)) continue;
        const input = $(key); if (!input) continue;
        if (input.type === 'checkbox') input.checked = value; else input.value = value;
      }
      if (!selected || selected.has('colourMode')) $('colour-mode').value = draft.colourMode;
      if (!selected || selected.has('palette')) $('palette').value = draft.palette;
      for (const name of ['viewer', 'owner']) {
        if (selected && !selected.has(`${name}Colour`)) continue;
        $(`${name}-hex`).value = draft[`${name}Colour`];
        $(`${name}-hex`).setAttribute('aria-invalid', 'false'); $(`${name}-error`).hidden = true;
      }
      if (!selected || [...selected].some(key => key.startsWith('menu'))) menuEditor.refresh();
      updateColours();
      syncFeatureDependencies();
    }
    function closePicker(restoreFocus = true) {
      $('colour-picker').hidden = true;
      pickerTrigger?.setAttribute('aria-expanded', 'false');
      if (restoreFocus) pickerTrigger?.focus();
      pickerTarget = null; pickerTrigger = null;
    }
    function updateChannels() {
      const channels = rgb(draft[`${pickerTarget}Colour`]);
      ['red', 'green', 'blue'].forEach((name, index) => {
        $(name).value = channels[index]; $(`${name}-value`).value = channels[index];
        const start = [...channels]; const end = [...channels]; start[index] = 0; end[index] = 255;
        $(name).style.background = `linear-gradient(to right, ${hex(start)}, ${hex(end)})`;
      });
    }
    for (const name of ['viewer', 'owner']) {
      $(`${name}-hex`).addEventListener('input', event => {
        const value = normaliseHex(event.target.value);
        event.target.setAttribute('aria-invalid', String(!value)); $(`${name}-error`).hidden = Boolean(value);
        if (value) { draft[`${name}Colour`] = value; if (pickerTarget === name) updateChannels(); }
        updateColours();
      });
      $(`${name}-swatch`).addEventListener('click', event => {
        if (pickerTarget === name) { closePicker(); return; }
        closePicker(false); pickerTarget = name; pickerTrigger = event.currentTarget;
        pickerTrigger.setAttribute('aria-expanded', 'true'); $('colour-picker').hidden = false;
        $('picker-title').textContent = name === 'viewer' ? 'Viewer name colour' : 'Uploader and pinned colour';
        updateChannels(); $('red').focus();
      });
    }
    for (const name of ['red', 'green', 'blue']) {
      $(name).addEventListener('input', () => {
        if (!pickerTarget) return;
        draft[`${pickerTarget}Colour`] = hex(['red', 'green', 'blue'].map(channel => Number($(channel).value)));
        $(`${pickerTarget}-hex`).value = draft[`${pickerTarget}Colour`];
        $(`${pickerTarget}-hex`).setAttribute('aria-invalid', 'false'); $(`${pickerTarget}-error`).hidden = true;
        updateChannels(); updateColours();
      });
    }
    $('close-picker').addEventListener('click', () => closePicker());
    $('colour-mode').addEventListener('change', event => { closePicker(false); draft.colourMode = event.target.value; updateColours(); });
    $('palette').addEventListener('change', event => { draft.palette = event.target.value; updateColours(); });
    for (const key of ['compactComments', 'hideCommentControls']) {
      $(key).addEventListener('change', event => { draft[key] = event.target.checked; updateColours(); });
    }
    function openPanel() {
      if (dialog.open) return;
      panelSession = true;
      clearReloadConfirmation();
      saved = settings.read(); draft = { ...saved };
      externalConflict = false;
      supportPanel?.reset();
      extraControls.open();
      javascriptPanel.open();
      menuDetails.open = false;
      channelEntry = 'settings'; channelNotice.hidden = true; channelManager.reset({ defer: true });
      $('settings-status').hidden = true;
      closePicker(false); populate(); selectTab('comments');
      if (primaryActionState().pendingReload) {
        $('settings-status').textContent = 'Saved changes are waiting for reload. This page still uses its previous settings.';
        $('settings-status').hidden = false;
      }
      dialog.showModal(); $('tab-comments').focus();
    }

    for (const id of ['close-panel', 'cancel-panel']) $(id).addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      panelSession = false;
      javascriptPanel.close();
      clearReloadConfirmation();
      applyMiniplayerSize(settings.read());
      extraControls.close();
      closePicker(false); resetSearch(); channelEntry = 'settings'; channelManager.reset({ defer: true });
    });
    dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape' && pickerTarget) { event.preventDefault(); closePicker(); }
      else if (event.key === 'Escape' && !$('reload-confirmation').hidden) {
        event.preventDefault(); clearReloadConfirmation(true);
      }
    });
    dialog.addEventListener('cancel', event => {
      if (!$('reload-confirmation').hidden) {
        event.preventDefault(); clearReloadConfirmation(true);
      }
    });
    document.addEventListener('fullscreenchange', () => clearReloadConfirmation());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    function markDraftChanged() {
      clearReloadConfirmation();
      if (externalConflict) showConflictNotice();
      else setHidden($('settings-status'), true);
      updatePrimaryAction();
    }
    dialog.addEventListener('input', markDraftChanged);
    dialog.addEventListener('change', markDraftChanged);
    function restoreDraftDefaults(keys, message) {
      for (const key of keys) draft[key] = Array.isArray(DEFAULTS[key]) ? [...DEFAULTS[key]] : DEFAULTS[key];
      resolveDraftOpposites(keys);
      markDraftChanged(); closePicker(false); populate(keys);
      if (externalConflict) { showConflictNotice(); return; }
      const state = primaryActionState();
      $('settings-status').textContent = state.dirty ? message : state.pendingReload
        ? 'Defaults match your saved settings. Reload when ready to apply them. Saved channel filters are unchanged.'
        : 'These settings already match the defaults. Saved channel filters are unchanged.';
      $('settings-status').hidden = false;
    }
    $('restore-section-defaults').addEventListener('click', () => {
      const keys = currentTab === 'comments'
        ? ['colourMode', 'palette', 'viewerColour', 'ownerColour', 'compactComments', 'hideCommentControls', ...(GROUPS.comments || []).map(([key]) => key)]
        : (GROUPS[currentTab] || []).map(([key]) => key);
      if (!keys.length) return;
      if (currentTab === 'interface') keys.push(...Object.keys(DEFAULTS).filter(key => key.startsWith('menu')));
      if (currentTab === 'miniplayer') keys.push('miniplayerWidth');
      restoreDraftDefaults(keys, `${$(`tab-${currentTab}`).textContent} defaults restored in this draft. Save to apply. Saved channel filters are unchanged.`);
    });
    $('restore-defaults').addEventListener('click', () => {
      restoreDraftDefaults(Object.keys(DEFAULTS), 'All settings restored in this draft. Save to apply. Saved channel filters are unchanged.');
    });
    function clearReloadConfirmation(restoreFocus = false) {
      const group = $('reload-confirmation');
      const focused = group.contains(document.activeElement);
      setHidden(group, true);
      reloadWarnedDrafts.clear();
      if ((restoreFocus || focused) && dialog.open) $('save-preview').focus();
    }
    function independentDraftCategories() {
      return [channelManager.hasDraft() && 'channel-filter edits',
        javascriptPanel.hasDraft() && 'Custom JavaScript edits', ...extraControls.draftCategories()].filter(Boolean);
    }
    function independentSavingCategories() {
      return [channelManager.isSaving() && 'channel filters', supportPanel?.isSaving() && 'backup restore',
        javascriptPanel.isSaving() && 'Custom JavaScript', ...extraControls.savingCategories()].filter(Boolean);
    }
    function showReloadConfirmation() {
      const drafts = independentDraftCategories(), pending = independentSavingCategories();
      reloadWarnedDrafts = new Set(pending.length ? [] : drafts);
      $('reload-message').textContent = pending.length
        ? `Wait for ${pending.join(', ')} saves to finish before reloading.`
        : 'Reload YouTube now? This will restart the current page and video.' +
          (drafts.length ? ` Unsaved ${drafts.join(', ')} will be lost.` : '');
      setHidden($('reload-confirmation'), false);
      $('cancel-reload').focus();
    }
    $('cancel-reload').addEventListener('click', () => clearReloadConfirmation(true));
    $('confirm-reload').addEventListener('click', event => {
      if (!event.isTrusted || !panelSession || !dialog.open || $('reload-confirmation').hidden) return;
      if (!reconcileStoredPreferences() || $('reload-confirmation').hidden) return;
      const state = updatePrimaryAction();
      if (externalConflict || state.dirty || !state.pendingReload) return;
      if (independentSavingCategories().length || independentDraftCategories().some(category => !reloadWarnedDrafts.has(category))) {
        showReloadConfirmation(); return;
      }
      clearReloadConfirmation();
      location.reload();
    });
    $('save-preview').addEventListener('click', async event => {
      if (!event.isTrusted || !panelSession || !dialog.open || savingPreferences) return;
      if (!reconcileStoredPreferences()) return;
      const state = updatePrimaryAction();
      if ($('save-preview').disabled) return;
      if (!state.dirty) {
        if (state.pendingReload) showReloadConfirmation();
        return;
      }
      const confirmed = { ...draft }, baseline = saved;
      savingPreferences = true;
      $('save-preview').setAttribute('aria-busy', 'true');
      let result;
      try {
        result = await suite.writeSettings(() => {
          if (!dialog.open || !reconcileStoredPreferences() || baseline !== saved || !samePreferences(confirmed, draft)) {
            return { ok: false, error: 'Settings changed while waiting to save. Review your draft and try again.' };
          }
          return settings.save(confirmed);
        });
      } finally {
        savingPreferences = false;
        $('save-preview').removeAttribute('aria-busy');
      }
      if (!dialog.open || baseline !== saved) return;
      if (result.ok) { saved = result.values; draft = { ...saved }; }
      const next = updatePrimaryAction();
      $('settings-status').hidden = false;
      $('settings-status').textContent = !result.ok ? result.error : next.pendingReload
        ? 'Saved. Please reload this page.'
        : 'Saved. No reload needed.';
    });
    supportPanel = suite.createSettingsSupportPanel(document, suite, {
      isActive: () => panelSession && dialog.open && !searchActive && currentTab === 'support',
      hasDraft: () => externalConflict || primaryActionState().dirty || channelManager.hasDraft(),
      onRestored: result => {
        clearReloadConfirmation();
        saved = result.values; draft = { ...saved }; externalConflict = false;
        closePicker(false); populate(); renderChannelRules();
        window.dispatchEvent(new CustomEvent('yt-master-channel-age-changed'));
        $('settings-status').hidden = false;
        $('settings-status').textContent = primaryActionState().pendingReload
          ? 'Backup restored. Please reload this page.' : 'Backup restored. No reload needed.';
      },
    });
    $('section-support').append(supportPanel.element);
    // Search is a local index of static setting labels, not a copy of controls,
    // saved channel data, diagnostic reports or current setting values.
    const addSearchEntry = (tab, target, title, description, extras = '') => {
      searchIndex.push({ tab, target, title, description,
        text: `${title} ${description} ${extras} ${$(`tab-${tab}`).textContent}`.toLocaleLowerCase() });
    };
    addSearchEntry('comments', 'colour-mode', 'Name colours', 'Viewer names, uploader names and creator/pinned badges.', 'colour color preset palette');
    addSearchEntry('comments', 'palette', 'Palette', 'Theme-adaptive colours for viewer and uploader names.', 'preset');
    addSearchEntry('comments', 'viewer-hex', 'Viewer name colour', 'Custom colour for viewer names.', 'color hex');
    addSearchEntry('comments', 'owner-hex', 'Uploader and pinned badge colour', 'Custom colour for uploader names and pinned badges.', 'creator owner color hex');
    for (const key of ['compactComments', 'hideCommentControls']) {
      const label = dialog.querySelector(`label[for="ytms-${key}"]`);
      addSearchEntry('comments', key, label.firstChild.textContent, label.querySelector('.description')?.textContent || '');
    }
    for (const [group, rows] of Object.entries(GROUPS)) {
      for (const [key, label, choices, format] of rows) {
        addSearchEntry(group, key, label, DESCRIPTIONS[key] || '', choices ? choices.map(format).join(' ') : '');
      }
    }
    addSearchEntry('interface', 'menu-order', 'Video context menu editor', menuOrderNote.textContent,
      Object.values(menuLabels).join(' '));
    const menuSearchActions = { menuShowDownload:'download', menuShowHype:'hype', menuShowAgeLimit:'channelAge', menuShowNotInterested:'notInterested', menuShowDontRecommend:'dontRecommend', menuShowReport:'report' };
    const menuSearchLabels = { menuShowDownload:'Show Download in video menus', menuShowHype:'Show Hype in video menus', menuShowAgeLimit:'Show Filter channel uploads action', menuShowNotInterested:'Show Not interested', menuShowDontRecommend:'Show Don’t recommend channel', menuShowReport:'Show Report' };
    for (const key of Object.keys(menuSearchActions)) addSearchEntry('interface', key, menuSearchLabels[key], DESCRIPTIONS[key]);

    addSearchEntry('channels', 'channel-age', 'Channel upload filters', ageDescription.textContent,
      'channels block age restrictions');
    addSearchEntry('support', 'backup-heading', 'Full backup and restore',
      'Download or import saved settings and channel upload filters.', 'export import');
    addSearchEntry('support', 'support-heading', 'Troubleshooting',
      'Review a local module health and video-menu diagnostic report.', 'support diagnostics report');
    for (const extension of suite.settingsAssets.recommendedExtensions) {
      addSearchEntry('extensions', `extension-${extension.id}`, extension.name, extension.description, extension.note);
    }
    addSearchEntry('credits', 'credits-logo', 'YouTube Master Suite credits', 'Author, version and licence.', 'about');
    addSearchEntry('miniplayer', 'miniplayerSizeMode', 'Custom miniplayer width', sizeHelp.textContent, 'size resize automatic');
    addSearchEntry('player', 'playhead-marker-heading', 'Playback marker image', 'Choose a local image to replace the red playback dot.', 'playhead picture scrubber');
    addSearchEntry('credits', 'updates-heading', 'Check for script updates', 'Check a release source and open Tampermonkey to install an update.', 'latest version install');
    addSearchEntry('javascript', 'custom-js-heading', 'Custom JavaScript',
      'Run trusted saved code once on each full page load. Review the security warning and save separately.', 'script code startup automation');
    function highlightSearchText(element, text, pattern) {
      // Match literal terms only. User input and setting text never become HTML.
      let end = 0;
      for (const match of text.matchAll(pattern)) {
        element.append(document.createTextNode(text.slice(end, match.index)));
        const mark = document.createElement('mark'); mark.className = 'settings-search-match';
        mark.textContent = match[0]; element.append(mark);
        end = match.index + match[0].length;
      }
      element.append(document.createTextNode(text.slice(end)));
    }
    function highlightSearchDestination(target, pattern) {
      searchDestination = target.closest('.row, .colour-row, [data-menu-item]') || target;
      searchDestinationRequest = target.closest('[data-menu-item]') && target.id.startsWith('ytms-')
        ? { target: target.id.slice(5), pattern } : null;
      searchDestination.classList.add('settings-search-destination');
      // Change only text nodes in this owned row. Keep controls, listeners,
      // values and drafts intact; never inspect editable code or select options.
      const walker = document.createTreeWalker(searchDestination, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement?.closest('input, textarea, select, button, script, style, mark, .preference-badge')) continue;
        nodes.push(node);
      }
      for (const node of nodes) {
        const fragment = document.createDocumentFragment();
        highlightSearchText(fragment, node.data, pattern);
        const marks = [...fragment.querySelectorAll('mark')];
        if (!marks.length) continue;
        for (const mark of marks) mark.classList.add('settings-search-destination-match');
        searchDestinationMarks.push(...marks);
        node.replaceWith(fragment);
      }
    }
    function refreshSearchDestination() {
      // Menu editing replaces its owned rows. Reapply the existing destination
      // to its new control without observing DOM churn or stealing focus.
      if (!searchDestinationRequest || searchDestination?.isConnected) return;
      const { target, pattern } = searchDestinationRequest;
      clearSearchDestination();
      const replacement = $(target);
      if (replacement && !replacement.closest('[hidden]')) highlightSearchDestination(replacement, pattern);
    }
    function showSearch() {
      clearSearchDestination();
      const terms = searchInput.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      searchClear.hidden = !searchInput.value;
      if (!terms.length) { selectTab(currentTab); return; }
      searchActive = true;
      javascriptPanel?.selectTab(null);
      extraControls?.selectTab(null);
      closePicker(false);
      // A selected tab must not point to a hidden panel while results are open.
      // Tabs return when the query is cleared or a result is chosen.
      dialog.querySelector('nav').hidden = true;
      for (const tab of tabIds) $(`section-${tab}`).hidden = true;
      $('restore-section-defaults').disabled = true;
      if (channelFooterHost) channelFooterHost.hidden = true;
      panelFooter.classList.remove('ytms-channels-active');
      const matches = searchIndex.filter(entry => terms.every(term => entry.text.includes(term)));
      const highlightPattern = new RegExp([...new Set(terms)].sort((a, b) => b.length - a.length)
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'giu');
      searchStatus.textContent = matches.length === 0 ? 'No settings found' :
        matches.length === 1 ? '1 setting found' : `${matches.length} settings found`;
      searchList.replaceChildren();
      if (!matches.length) {
        const empty = document.createElement('p'); empty.className = 'settings-search-empty';
        empty.textContent = 'No settings found. Try a different search.'; searchList.append(empty);
      }
      for (const entry of matches) {
        const result = document.createElement('button'); result.type = 'button'; result.className = 'settings-search-result';
        result.dataset.tab = entry.tab; result.dataset.target = entry.target;
        const title = document.createElement('span'); title.className = 'settings-search-title';
        highlightSearchText(title, entry.title, highlightPattern);
        const section = document.createElement('span'); section.className = 'settings-search-section';
        highlightSearchText(section, $(`tab-${entry.tab}`).textContent, highlightPattern);
        const description = document.createElement('span'); description.className = 'settings-search-description';
        highlightSearchText(description, entry.description, highlightPattern);
        result.append(title, section, description);
        const activateResult = () => {
          selectTab(entry.tab);
          let target = entry.target === 'channel-age' ? $('channel-search') || ageRow : $(entry.target);
          if (entry.tab === 'interface' && (entry.target.startsWith('menu') || entry.target === 'menu-order')) menuDetails.open = true;
          if (entry.target === 'menu-order') target = menuOrderHeading;
          if (Object.hasOwn(menuSearchActions, entry.target)) target = menuEditor.focusAction(menuSearchActions[entry.target]);
          if (entry.target === 'credits-logo') target = heading;
          if (entry.tab === 'extensions') target = target?.querySelector('h4') || target;
          // Custom colour controls are conditional; do not change the user's
          // draft just to expose one. Take them to the controlling selector.
          if (!target || target.closest('[hidden]')) target = entry.tab === 'comments' ? $('colour-mode') : $(`tab-${entry.tab}`);
          const controller = { snapshotFormat: 'snapshotButton', snapshotQuality: draft.snapshotButton ? 'snapshotFormat' : 'snapshotButton',
            lowViewThreshold: 'hideFeedLowViews', theatreHideHeader: 'fullWindowTheatre', shortsHideMetadata: 'redirectShorts',
            shortsHideActions: 'redirectShorts', shortsHideRelated: 'redirectShorts', shortsHideMusic: 'redirectShorts', shortsHideRemix: 'redirectShorts' };
          if (target.disabled && controller[entry.target]) target = $(controller[entry.target]) || target;
          for (let details = target.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
          if (!target.matches('button, input, select, textarea, a[href], [tabindex]')) target.tabIndex = -1;
          highlightSearchDestination(target, highlightPattern);
          target.focus({ preventScroll: true }); searchDestination.scrollIntoView({ block: 'nearest' });
        };
        searchActions.set(result, activateResult);
        result.addEventListener('click', event => { if (event.isTrusted && panelSession && dialog.open) activateResult(); });
        searchList.append(result);
      }
      searchResults.hidden = false; dialog.querySelector('.content').scrollTop = 0;
    }
    searchInput.addEventListener('input', event => { event.stopPropagation(); showSearch(); });
    searchInput.addEventListener('change', event => event.stopPropagation());
    searchInput.addEventListener('keydown', event => {
      if (!event.isTrusted || !panelSession || !dialog.open) return;
      if (event.key === 'Escape' && searchInput.value) {
        event.preventDefault(); event.stopPropagation(); selectTab(currentTab); searchInput.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault(); searchActions.get(searchList.querySelector('button'))?.();
      }
    });
    searchClear.addEventListener('click', event => { if (event.isTrusted && panelSession && dialog.open) { selectTab(currentTab); searchInput.focus(); } });
    dialog.addEventListener('close', () => supportPanel.close());
    populate(); selectTab('comments');
    return { dialog, open: openPanel, openChannels, resetChannels: () => channelManager.reset({ defer: true }),
      updateTheme: updateColours, updateChannels: renderChannelRules, reconcileSaved: reconcileStoredPreferences };

  }

  function syncTheme() {
    const pair = settings.colours();
    const coloursCss = settings.initial.colourMode === "preset" && pair
      ? `:root { --ytms-viewer-colour: ${pair[0]}; --ytms-owner-colour: ${pair[1]}; }` : "";
    suite.setStyle("suiteSettings", suite.settingsAssets.css + coloursCss);
    if (document.getElementById(DIALOG_ID)?.open) panel?.updateTheme();
  }

  function openSettings(event, internal = false) {
    if (suspended || !internal && !event?.isTrusted) return;
    hidePlayerTooltip();
    try {
      if (panel && !panel.dialog.isConnected) panel = null;
      panel ||= createPanel();
      panel.open();
    } catch (error) {
      document.getElementById(DIALOG_ID)?.remove();
      panel = null;
      suite.reportModuleError("suiteSettings", "open settings", error);
    }
  }

  function isRendered(element, requireBox = true) {
    if (!element?.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (requireBox) {
      const box = element.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) return false;
    } else if (!element.getClientRects().length || !(element.getBoundingClientRect().width > 0)) return false;
    for (let node = element; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse' || Number(css.opacity) === 0) return false;
    }
    return true;
  }

  function getPlayerTarget() {
    if (location.pathname !== '/watch' && !location.pathname.startsWith('/live/')) return null;
    const floatingOwner = [...document.querySelectorAll('#ytsmp-player-placeholder')]
      .map(node => node.closest('ytd-watch-flexy')).find(owner => isRendered(owner, false));
    const mirrorPlayer = document.getElementById('ytppl-video-mirror-button')?.closest('#movie_player');
    const players = new Set([mirrorPlayer, ...document.querySelectorAll('#movie_player')]);
    for (const player of players) {
      if (!isRendered(player) || player.closest('ytd-miniplayer, ytd-video-preview, ytd-reel-video-renderer')) continue;
      const root = player.closest('ytd-watch-flexy') || (player.parentElement === document.body ? floatingOwner : null);
      if (isRendered(root, false) && player.querySelector('video.html5-main-video')) {
        const candidates = [...player.querySelectorAll('.ytp-right-controls')].filter(controls =>
          !controls.closest('[hidden], [inert], [aria-hidden="true"]') && controls.getClientRects().length);
        // Prefer the current controls over retained rows, but keep a sole row
        // through normal auto-hide so revealing playback controls needs no repair.
        const controls = candidates.find(candidate => {
          const box = candidate.getBoundingClientRect();
          if (!(box.width > 0 && box.height > 0)) return false;
          for (let node = candidate; node && node !== player; node = node.parentElement) {
            const css = getComputedStyle(node);
            if (css.visibility === 'hidden' || css.visibility === 'collapse' || Number(css.opacity) === 0) return false;
          }
          return true;
        }) || (candidates.length === 1 ? candidates[0] : null);
        return { player, controls, root };
      }
    }
    const root = Array.from(document.querySelectorAll('ytd-watch-flexy')).find(owner => isRendered(owner, false));
    return root ? { root, player: null, controls: null } : null;
  }

  function hidePlayerTooltip() {
    if (playerTooltip) {
      tooltipVisibilityObserver.disconnect();
      document.removeEventListener('pointermove', dismissPlayerTooltipOnPointerMove, true);
      document.removeEventListener('pointerout', dismissPlayerTooltipOnPointerOut, true);
      document.removeEventListener('pointerdown', hidePlayerTooltip, true);
      document.removeEventListener('pointercancel', hidePlayerTooltip, true);
      document.removeEventListener('scroll', hidePlayerTooltip, true);
      document.removeEventListener('visibilitychange', dismissHiddenPlayerTooltip);
      document.removeEventListener('keydown', dismissPlayerTooltipOnEscape, true);
    }
    playerTooltip?.remove(); playerTooltip = null;
    playerButton?.removeAttribute('aria-describedby');
  }

  function isPlayerTooltipOwnerVisible() {
    const player = playerTarget?.player;
    if (suspended || document.visibilityState === 'hidden' || playerButton?.disabled ||
      !isRendered(playerButton) || !player?.contains(playerButton) || player.classList.contains('ytp-autohide')) return false;
    for (let node = playerButton; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
        Number.parseFloat(style.opacity) === 0 || node.getAttribute('aria-disabled') === 'true') return false;
      if (node === player) break;
    }
    return true;
  }

  function dismissPlayerTooltipOnPointerMove(event) {
    if (!playerButton?.contains(event.target) && !hasPlayerTooltipKeyboardFocus()) hidePlayerTooltip();
  }
  function dismissPlayerTooltipOnPointerOut(event) {
    if (!event.relatedTarget && !hasPlayerTooltipKeyboardFocus()) hidePlayerTooltip();
  }
  function hasPlayerTooltipKeyboardFocus() {
    return document.activeElement === playerButton && playerButton?.matches(':focus-visible');
  }
  function hidePlayerTooltipOnMouseLeave() {
    if (!hasPlayerTooltipKeyboardFocus()) hidePlayerTooltip();
  }
  function dismissHiddenPlayerTooltip() {
    if (document.visibilityState === 'hidden') hidePlayerTooltip();
  }
  function dismissPlayerTooltipOnEscape(event) {
    if (event.key === 'Escape') hidePlayerTooltip();
  }

  function showPlayerTooltip(event) {
    if (!isPlayerTooltipOwnerVisible() ||
      (event.type === 'focus' && !playerButton.matches(':focus-visible'))) { hidePlayerTooltip(); return; }
    if (!playerTooltip) {
      const player = playerTarget.player;
      const tooltip = document.createElement('div');
      tooltip.id = TOOLTIP_ID; tooltip.setAttribute('role', 'tooltip'); tooltip.textContent = 'Suite settings';
      playerTooltip = player.appendChild(tooltip);
      playerButton.setAttribute('aria-describedby', TOOLTIP_ID);
      // Observe only the visible tooltip's owner chain, never the page subtree.
      for (let node = playerButton; node; node = node.parentElement) {
        tooltipVisibilityObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-disabled', 'disabled'] });
        if (node === player) break;
      }
      document.addEventListener('pointermove', dismissPlayerTooltipOnPointerMove, true);
      document.addEventListener('pointerout', dismissPlayerTooltipOnPointerOut, true);
      document.addEventListener('pointerdown', hidePlayerTooltip, true);
      document.addEventListener('pointercancel', hidePlayerTooltip, true);
      document.addEventListener('scroll', hidePlayerTooltip, true);
      document.addEventListener('visibilitychange', dismissHiddenPlayerTooltip);
      document.addEventListener('keydown', dismissPlayerTooltipOnEscape, true);
    }
    positionPlayerTooltip();
  }

  function positionPlayerTooltip() {
    const player = playerTarget?.player, tooltip = playerTooltip;
    if (!isPlayerTooltipOwnerVisible() || !tooltip?.isConnected ||
      !player?.contains(playerButton) || !player.contains(tooltip)) { hidePlayerTooltip(); return; }
    const playerRect = player.getBoundingClientRect(), buttonRect = playerButton.getBoundingClientRect();
    if (!playerRect.width || !playerRect.height || !buttonRect.width || !buttonRect.height) { hidePlayerTooltip(); return; }
    const width = player.offsetWidth || playerRect.width, height = player.offsetHeight || playerRect.height;
    const scaleX = playerRect.width / width, scaleY = playerRect.height / height;
    const left = (buttonRect.left + buttonRect.width / 2 - playerRect.left) / scaleX - tooltip.offsetWidth / 2;
    const progress = player.querySelector('.ytp-progress-bar-container');
    const progressRect = isRendered(progress) ? progress.getBoundingClientRect() : null;
    const aboveControls = progressRect?.width > 0 && progressRect.height > 0 &&
      progressRect.top >= playerRect.top && progressRect.bottom <= buttonRect.top + 1 &&
      progressRect.left >= playerRect.left - 1 && progressRect.right <= playerRect.right + 1;
    const bottom = aboveControls ? (progressRect.top - playerRect.top) / scaleY - 8 : (buttonRect.top - playerRect.top) / scaleY - 20;
    tooltip.style.left = `${Math.round(Math.max(8, Math.min(left, width - tooltip.offsetWidth - 8)))}px`;
    tooltip.style.top = `${Math.round(Math.max(8, bottom - tooltip.offsetHeight))}px`;
  }

  function refreshPlayerTooltip() {
    if (!playerTooltip) return;
    if (playerButton?.matches(':hover') || (document.activeElement === playerButton && playerButton.matches(':focus-visible'))) positionPlayerTooltip();
    else hidePlayerTooltip();
  }

  function installPlayerButton(target) {
    if (playerTarget?.player !== target?.player || playerTarget?.controls !== target?.controls) hidePlayerTooltip();
    playerTarget = target;
    const controls = target?.controls;
    if (!controls) { playerButton?.remove(); hidePlayerTooltip(); return; }
    if (!playerButton) {
      playerButton = document.createElement('button');
      playerButton.id = PLAYER_BUTTON_ID; playerButton.type = 'button'; playerButton.className = 'ytp-button';
      playerButton.setAttribute('aria-label', 'Suite settings');
      playerButton.setAttribute('aria-haspopup', 'dialog'); playerButton.setAttribute('aria-controls', DIALOG_ID);
      const image = document.createElement('img');
      image.src = settings.initial.playerSettingsIcon === 'colour' ? suite.settingsAssets.logo : suite.settingsAssets.playerLogo;
      image.alt = ''; image.width = 36; image.height = 36;
      image.setAttribute('aria-hidden', 'true'); playerButton.append(image);
      playerButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openSettings(event); });
      playerButton.addEventListener('mouseenter', showPlayerTooltip);
      playerButton.addEventListener('focus', showPlayerTooltip);
      playerButton.addEventListener('mouseleave', hidePlayerTooltipOnMouseLeave);
      playerButton.addEventListener('blur', hidePlayerTooltip);
    }
    const anchor = controls.querySelector('#ytppl-video-mirror-button') || controls.querySelector('.ytp-size-button, .ytp-fullscreen-button');
    const parent = anchor?.parentElement || controls;
    if (playerButton.parentElement !== parent || playerButton.nextElementSibling !== anchor) {
      hidePlayerTooltip(); parent.insertBefore(playerButton, anchor || null);
    }
    refreshPlayerTooltip();
  }

  function installButton() {
    frame = 0;
    if (suspended) return;
    const root = document.documentElement;
    if (root !== watchedThemeRoot) {
      themeObserver.disconnect();
      watchedThemeRoot = root;
      if (root) themeObserver.observe(root, { attributes: true, attributeFilter: ["dark"] });
      syncTheme();
    }
    const masthead = settings.initial.headerSettingsIcon === 'off' ? null : document.querySelector("ytd-masthead");
    const app = document.querySelector("ytd-app");
    const mastheadContainer = app?.querySelector('#masthead-container') || null;
    const target = settings.initial.playerSettingsIcon === 'off' ? null : getPlayerTarget();
    const playerBranch = new Set();
    for (let node = target?.controls || target?.player || target?.root; node && node !== document.body; node = node.parentElement) playerBranch.add(node);
    if (target && !target.controls) {
      const scope = target.player || target.root;
      for (const node of scope.querySelectorAll('#player, #player-container, #player-container-inner, #single-column-container, #full-bleed-container, #player-full-bleed-container, .ytp-chrome-bottom, .ytp-chrome-controls, .ytp-right-controls')) playerBranch.add(node);
    }
    const pageManager = app?.querySelector('ytd-page-manager, #page-manager');
    if (pageManager) playerBranch.add(pageManager);
    const branch = Array.from(playerBranch);
    if (!discoveryActive || root !== watchedDocumentRoot || document.body !== watchedBody ||
      app !== watchedApp || masthead !== watchedMasthead || mastheadContainer !== watchedMastheadContainer ||
      watchedMissingControls !== Boolean(target && !target.controls) ||
      branch.length !== watchedPlayerBranch.length || branch.some((node, index) => node !== watchedPlayerBranch[index])) {
      const registrations = [[root || document, { childList: true }]];
      if (document.body) registrations.push([document.body, { childList: true }]);
      if (app) registrations.push([app, { childList: true }]);
      if (mastheadContainer) registrations.push([mastheadContainer, { childList: true }]);
      if (masthead) registrations.push([masthead, { childList: true, subtree: true }]);
      for (const node of branch) registrations.push([node, { childList: true,
        ...(node === target?.controls ? { subtree: true } : {}),
        // A retained toolbar can be revealed with an attribute only. Observe
        // its small ownership branch until insertion recovers, then release.
        ...(target && !target.controls ? { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'inert', 'class', 'style'] } : {}),
      }]);
      discovery.replaceRegistrations(registrations);
      watchedApp = app; watchedMasthead = masthead;
      watchedDocumentRoot = root; watchedBody = document.body;
      watchedMastheadContainer = mastheadContainer; discoveryActive = true;
      watchedPlayerBranch = branch;
      watchedMissingControls = Boolean(target && !target.controls);
    }
    installPlayerButton(target);
    if (!masthead) { button?.remove(); return; }
    const avatar = masthead.querySelector("#avatar-btn, button[aria-label*='Account'], button[aria-label*='account']");
    if (!avatar) { button?.remove(); return; }
    const anchor = avatar.closest("ytd-topbar-menu-button-renderer, ytd-topbar-menu-button-view-model") || avatar;
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID; button.type = "button";
      button.setAttribute("aria-label", "Suite settings");
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", DIALOG_ID);
      button.title = "Suite settings";
      const image = document.createElement("img");
      button.dataset.icon = settings.initial.headerSettingsIcon;
      image.src = settings.initial.headerSettingsIcon === 'monochrome' ? suite.settingsAssets.playerLogo : suite.settingsAssets.logo;
      image.alt = "";
      image.width = 32; image.height = 32; image.setAttribute("aria-hidden", "true");
      button.append(image);
      button.addEventListener("click", openSettings);
    }
    if (button.parentNode !== anchor.parentNode || button.nextElementSibling !== anchor) {
      anchor.before(button);
    }
  }

  function scheduleInstall() {
    if (!suspended && !frame) frame = requestAnimationFrame(installButton);
  }
  const discovery = new MutationObserver(records => {
    // Text and comment updates cannot replace a player, control or header
    // anchor. Keep discovery for structural changes, not native label churn.
    for (const record of records) {
      if (record.type === 'attributes') { scheduleInstall(); return; }
      for (const nodes of [record.addedNodes, record.removedNodes]) {
        for (const node of nodes) {
          if (node.nodeType === 1) { scheduleInstall(); return; }
        }
      }
    }
  });
  const themeObserver = new MutationObserver(syncTheme);
  const tooltipVisibilityObserver = new MutationObserver(refreshPlayerTooltip);
  function start() {
    suspended = false;
    watchedApp = null; watchedMasthead = null;
    watchedThemeRoot = undefined;
    installButton();
  }
  function stop() {
    suspended = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    discovery.disconnect(); themeObserver.disconnect();
    watchedThemeRoot = null;
    discoveryActive = false;
    hidePlayerTooltip();
    document.getElementById(DIALOG_ID)?.close();
    panel?.resetChannels();
  }
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", start);
  window.addEventListener("yt-navigate-start", () => { hidePlayerTooltip(); document.getElementById(DIALOG_ID)?.close(); panel?.resetChannels(); });
  window.addEventListener("yt-navigate-finish", scheduleInstall);
  window.addEventListener("yt-page-data-updated", scheduleInstall);
  window.addEventListener('yt-master-channel-age-changed', () => panel?.updateChannels());
  function scheduleSavedReconciliation() {
    if (savedReconciliationPending) return;
    savedReconciliationPending = true;
    // Storage consumers apply live corner/size changes in the same delivery.
    // Reconcile after those consumers, regardless of module startup order.
    queueMicrotask(() => {
      savedReconciliationPending = false;
      panel?.reconcileSaved();
    });
  }
  suite.storage.subscribe(event => {
    if ((event.key === null || event.key === settings.key) && !document.getElementById(DIALOG_ID)?.open) {
      const values = settings.read();
      suite.setScrollMiniplayerSize?.({ mode: values.miniplayerSizeMode, width: values.miniplayerWidth });
    }
    if (event.key === null || event.key === settings.key || event.key === 'yt-master-suite.scroll-miniplayer.corner.v1') scheduleSavedReconciliation();
    if (event.key === null || event.key === suite.channelAge.key) window.dispatchEvent(new CustomEvent('yt-master-channel-age-changed'));
  });
  document.addEventListener('loadedmetadata', event => { if (event.target?.matches?.('video.html5-main-video')) scheduleInstall(); }, true);
  document.addEventListener('fullscreenchange', () => { hidePlayerTooltip(); scheduleInstall(); }, true);
  window.addEventListener('resize', refreshPlayerTooltip);
  window.addEventListener('blur', hidePlayerTooltip);
  start();
  // Start access controls and native sizing without waiting for parsed content.
  // Optional controls still wait for parsed content and validated preferences.
  suite.startNativeQueueLayout();
  suite.installVideoMenu(suite);
  const startOptionalControls = () => {
    suite.playheadMarker.start();
    suite.startFeatureControls();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startOptionalControls, { once: true });
  else queueMicrotask(startOptionalControls);
})();

