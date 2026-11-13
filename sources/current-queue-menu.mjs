// Language: en-GB. Expose verified native actions for the current queue item.
export function installCurrentQueueMenu({ document, window, preferences = {}, MutationObserver = window.MutationObserver }) {
  if (preferences.currentQueueMenu === false) return () => {};
  const panels = 'ytd-playlist-panel-renderer, yt-playlist-panel-renderer';
  const rows = 'ytd-playlist-panel-video-renderer, yt-playlist-panel-video-renderer';
  const marker = 'data-ytms-current-queue-menu', owned = 'data-ytms-current-queue-menu-owned';
  const records = new Map();
  let failed = new WeakMap();
  let frame = 0, generation = 0, disposed = false, navigating = false, pageHidden = false, style = null, waitingForDefinition = false;
  const topology = new MutationObserver(schedule), content = new MutationObserver(schedule), visibility = new MutationObserver(schedule);
  const controller = node => node?.polymerController || node?.getPolymerController?.() || node;
  const validId = value => typeof value === 'string' && /^[\w-]{11}$/.test(value);
  function modelsOf(node) {
    const current = typeof node?.componentProps?.data === 'function' ? node.componentProps.data() : null;
    const legacy = controller(node)?.data;
    return [...new Set([current, legacy].filter(value => value && typeof value === 'object'))];
  }
  function conflictingIdentity(left, right) {
    return ['videoId', 'playlistSetVideoId', 'playlistId', 'currentIndex', 'selected'].some(key =>
      key in left && key in right && left[key] !== right[key]);
  }
  function dataOf(node) {
    const models = modelsOf(node), first = models[0];
    for (const other of models.slice(1)) {
      if (conflictingIdentity(first, other)) return null;
      if (Array.isArray(first.contents) && Array.isArray(other.contents) &&
          (first.contents.length > 1000 || first.contents.length !== other.contents.length || first.contents.some((item, index) => {
            const left = item?.playlistPanelVideoRenderer, right = other.contents[index]?.playlistPanelVideoRenderer;
            return !left || !right || conflictingIdentity(left, right);
          }))) return null;
      if (first.menu?.menuRenderer && other.menu?.menuRenderer &&
          signature(first.menu.menuRenderer) !== signature(other.menu.menuRenderer)) return null;
    }
    return first;
  }
  function menuStampOf(node) {
    const stamps = modelsOf(node).map(signature);
    return stamps.length && stamps.every(stamp => stamp && stamp === stamps[0]) ? stamps[0] : null;
  }
  function visible(node) {
    if (!node?.isConnected || node.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const box = node.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    for (let current = node; current; current = current.parentElement) {
      const css = window.getComputedStyle(current);
      if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) return false;
    }
    return true;
  }
  function signature(model) {
    if (!Array.isArray(model?.items) || !model.items.length || model.items.length > 60) return null;
    let fields = 0;
    try {
      const value = JSON.stringify(model, (_key, entry) => {
        if (++fields > 4000 || (typeof entry === 'string' && entry.length > 16384)) throw new Error('Bounded native menu');
        return entry;
      });
      return value.length <= 131072 ? value : null;
    } catch { return null; }
  }
  function fallbackModel(data, entries, rowList, current) {
    const actions = new Map();
    const make = (id, text, icon, endpoint, apiUrl) => {
      if (actions.has(id)) return;
      actions.set(id, { menuServiceItemRenderer: { text:{ simpleText:text }, icon:{ iconType:icon },
        serviceEndpoint:{ commandMetadata:{ webCommandMetadata:{ sendPost:true, apiUrl } }, ...endpoint } } });
    };
    for (let i = 0; i < entries.length; i++) {
      if (entries[i] === current) continue;
      const row = dataOf(rowList[i]), model = row?.menu?.menuRenderer || entries[i].menu?.menuRenderer;
      if (!signature(model) || (row?.menu?.menuRenderer && entries[i].menu?.menuRenderer &&
          signature(row.menu.menuRenderer) !== signature(entries[i].menu.menuRenderer))) continue;
      for (const item of model.items) {
        const endpoint = item?.menuServiceItemRenderer?.serviceEndpoint;
        const edit = endpoint?.playlistEditEndpoint, action = edit?.actions?.length === 1 ? edit.actions[0] : null;
        // Inspect only known native action schemas. Rebuild every target field
        // from the verified current entry; never copy tokens, commands or
        // tracking data belonging to the other video.
        if (edit?.playlistId === 'WL' && action?.action === 'ACTION_ADD_VIDEO' && action.addedVideoId === entries[i].videoId)
          make('watchLater', 'Save to Watch Later', 'WATCH_LATER', { playlistEditEndpoint:{ playlistId:'WL', actions:[{ action:'ACTION_ADD_VIDEO', addedVideoId:current.videoId }] } }, '/youtubei/v1/browse/edit_playlist');
        if (endpoint?.addToPlaylistServiceEndpoint?.videoId === entries[i].videoId)
          make('savePlaylist', 'Save to playlist', 'PLAYLIST_ADD', { addToPlaylistServiceEndpoint:{ videoId:current.videoId } }, '/youtubei/v1/playlist/get_add_to_playlist');
        if (edit?.playlistId === data.playlistId && action?.action === 'ACTION_REMOVE_VIDEO' && action.setVideoId === entries[i].playlistSetVideoId &&
            entries.filter(item=>item.playlistSetVideoId===current.playlistSetVideoId).length===1)
          make('remove', 'Remove from playlist', 'REMOVE', { playlistEditEndpoint:{ playlistId:data.playlistId, actions:[{ action:'ACTION_REMOVE_VIDEO', setVideoId:current.playlistSetVideoId }] } }, '/youtubei/v1/browse/edit_playlist');
      }
      if (actions.size === 3) break;
    }
    const items = ['watchLater','savePlaylist','remove'].flatMap(id => actions.has(id) ? [actions.get(id)] : []);
    return items.length ? { items, accessibility:{ accessibilityData:{ label:'More actions' } } } : null;
  }
  function targetsCurrentEntry(model, data, entries, current) {
    // Native Download rows have their own renderer. Inspect both supported
    // bindings independently so a conflicting supplied action cannot hide
    // behind an agreeing normal service renderer.
    for (const item of model.items) for (const endpoint of [
      item?.menuServiceItemRenderer?.serviceEndpoint,
      item?.menuServiceItemDownloadRenderer?.serviceEndpoint,
    ]) {
      const download = endpoint?.offlineVideoEndpoint;
      if (Object.hasOwn(endpoint || {}, 'offlineVideoEndpoint') &&
          (!download || typeof download !== 'object' || download.videoId !== current.videoId)) return false;
      const edit = endpoint?.playlistEditEndpoint;
      if (Array.isArray(edit?.actions)) for (const action of edit.actions) {
        if (action?.action === 'ACTION_ADD_VIDEO' && action.addedVideoId !== current.videoId) return false;
        if (action?.action === 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID' && action.removedVideoId !== current.videoId) return false;
        if (['ACTION_REMOVE_VIDEO', 'ACTION_MOVE_VIDEO_AFTER'].includes(action?.action) &&
            (edit.playlistId !== data.playlistId || action.setVideoId !== current.playlistSetVideoId ||
             entries.filter(entry => entry.playlistSetVideoId === current.playlistSetVideoId).length !== 1)) return false;
      }
      const save = endpoint?.addToPlaylistServiceEndpoint;
      if (save && (('videoId' in save && save.videoId !== current.videoId) ||
          ('videoIds' in save && (!Array.isArray(save.videoIds) || save.videoIds.length !== 1 || save.videoIds[0] !== current.videoId)))) return false;
      const signals = endpoint?.signalServiceEndpoint?.actions;
      if (Array.isArray(signals)) for (const signal of signals) {
        const queue = signal?.addToPlaylistCommand;
        if (queue === undefined) continue;
        // Recycled native queue commands can lag behind both row models.
        // Every supplied target must identify this exact current video.
        if (!queue || typeof queue !== 'object' ||
            (!('videoId' in queue) && !('videoIds' in queue)) ||
            ('videoId' in queue && queue.videoId !== current.videoId) ||
            ('videoIds' in queue && (!Array.isArray(queue.videoIds) || queue.videoIds.length !== 1 || queue.videoIds[0] !== current.videoId))) return false;
      }
    }
    return true;
  }
  function ownsWatchPlayer(panel, player) {
    const owner = panel.closest('ytd-watch-flexy');
    if (!owner || owner.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (player.closest('ytd-watch-flexy') === owner) return true;
    const placeholders = [...document.querySelectorAll('#ytsmp-player-placeholder')].filter(node => {
      // Our spacer is intentionally visibility:hidden/aria-hidden. Its
      // rendered parent ownership matters, not its accessibility visibility.
      const box=node.getBoundingClientRect();
      if (!node.isConnected || node.hidden || node.hasAttribute('inert') || !node.getClientRects().length ||
          !(box.width>0 && box.height>0) || node.parentElement?.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      for(let parent=node.parentElement;parent;parent=parent.parentElement){const css=window.getComputedStyle(parent);if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)===0)return false;}
      return true;
    });
    return player.parentElement === document.body && document.body.classList.contains('ytsmp-scroll-miniplayer-active') &&
      placeholders.length === 1 && placeholders[0].closest('ytd-watch-flexy') === owner;
  }
  function proof(panel) {
    try {
      if (!visible(panel)) return null;
      const data = dataOf(panel), entries = data?.contents?.map(item => item.playlistPanelVideoRenderer);
      let index = data?.currentIndex;
      if (Array.isArray(entries) && !('currentIndex' in data)) {
        const selected = entries.filter(entry => entry?.selected === true);
        if (selected.length === 1) index = entries.indexOf(selected[0]);
      }
      if (typeof data?.playlistId !== 'string' || !data.playlistId || data.playlistId.length>1024 || !Array.isArray(entries) || !entries.length || entries.length > 1000 ||
          entries.some(entry => !validId(entry?.videoId) || typeof entry.playlistSetVideoId!=='string' || !entry.playlistSetVideoId || entry.playlistSetVideoId.length>1024) ||
          !Number.isInteger(index) || index < 0 || index >= entries.length) return null;
      const rowList = [...panel.querySelectorAll(rows)].filter(row => row.closest(panels) === panel);
      if (rowList.length !== entries.length || rowList.some((row, i) => {
        const value = dataOf(row);
        return value?.videoId !== entries[i].videoId || value?.playlistSetVideoId !== entries[i].playlistSetVideoId;
      })) return null;
      const row = rowList[index], value = dataOf(row), entry = entries[index];
      if (!visible(row) || !row.hasAttribute('selected') || !value.selected || !entry.selected ||
          entries.some((item, i) => i !== index && item.selected)) return null;
      const mini = panel.closest('ytd-miniplayer');
      const players = [...document.querySelectorAll('#movie_player')].filter(player => {
        if (!visible(player) || (mini && player.closest('ytd-miniplayer') !== mini) || (!mini && player.closest('ytd-miniplayer, ytd-video-preview, ytd-reel-video-renderer'))) return false;
        const ids = player.getPlaylist?.();
        const listId = player.getPlaylistId?.(), playerIndex = player.getPlaylistIndex?.();
        const uniquePlayingEntry = entries.filter(item => item.videoId === entry.videoId).length === 1;
        // The native Home miniplayer can omit these API values while its own
        // rendered panel still supplies an exact, independently checked order.
        const matchesList = listId === data.playlistId || ((listId == null || listId === '') && uniquePlayingEntry &&
          ((mini && typeof data.playlistId === 'string' && data.playlistId.startsWith('TLPQ')) || ownsWatchPlayer(panel, player)));
        return player.getVideoData?.()?.video_id === entry.videoId && matchesList &&
          Array.isArray(ids) && ids.length === entries.length && ids.every((id, i) => id === entries[i].videoId) &&
          (playerIndex === undefined ? uniquePlayingEntry : playerIndex === index);
      });
      if (players.length !== 1) return null;
      const rowModel = value.menu?.menuRenderer, panelModel = entry.menu?.menuRenderer;
      const model = rowModel || panelModel || fallbackModel(data, entries, rowList, entry);
      const stamp = signature(model);
      if (rowModel && panelModel && signature(panelModel) !== stamp) return null;
      // Recycled row and panel models can agree before their menu endpoints
      // catch up. Matching model references alone cannot authorise an action
      // still naming the previous video or playlist entry.
      return stamp && targetsCurrentEntry(model, data, entries, entry) ?
        { panel, row, player: players[0], model, stamp, videoId: entry.videoId, setId: entry.playlistSetVideoId } : null;
    } catch { return null; }
  }
  function release(row) {
    const record = records.get(row);
    if (!record) return;
    records.delete(row);
    if (record.guard) {
      record.menu.removeEventListener('click', record.guard, true);
      record.menu.removeEventListener('keydown', record.guard, true);
    }
    if (record.stop) record.menu.removeEventListener('click', record.stop);
    record.menu.removeAttribute(marker); row.removeAttribute(marker);
    if (record.created && record.menu.getAttribute(owned) === '1') {
      let adopted = false;
      try {
        const nextRow = record.menu.closest(rows), stamp = menuStampOf(record.menu);
        adopted = nextRow && nextRow !== row && stamp && stamp !== record.stamp &&
          signature(dataOf(nextRow)?.menu?.menuRenderer) === stamp;
      } catch { /* An unverified move does not transfer the owned control. */ }
      record.menu.removeAttribute(owned);
      if (!adopted) record.menu.remove();
    }
  }
  function same(left, right) {
    return right && left.panel === right.panel && left.row === right.row && left.player === right.player && left.videoId === right.videoId && left.setId === right.setId && left.stamp === right.stamp;
  }
  function bound(record) {
    try { return record.menu.closest(rows) === record.row && menuStampOf(record.menu) === record.stamp; }
    catch { return false; }
  }
  function install(current) {
    const request = generation;
    const active = () => request === generation && !disposed && !navigating && !pageHidden;
    if (!active()) return;
    const existing = records.get(current.row);
    if (existing && existing.menu.isConnected && same(existing, current) && bound(existing)) return;
    release(current.row);
    if (!active()) return;
    const candidates = [...current.row.querySelectorAll('ytd-menu-renderer')].filter(menu => menu.closest(rows) === current.row);
    if (candidates.length > 1) return;
    let menu = candidates[0], created = false;
    if (menu) {
      try { if (menuStampOf(menu) !== current.stamp) return; } catch { return; }
    } else {
      // Let YouTube stamp its own icon, labels, handlers and popup from the
      // current menu or a recognised schema rebuilt for the current entry.
      // Unsupported native components remain untouched.
      if (!window.customElements?.get('ytd-menu-renderer')) {
        if (!waitingForDefinition && typeof window.customElements?.whenDefined === 'function') {
          waitingForDefinition = true;
          window.customElements.whenDefined('ytd-menu-renderer').then(schedule, () => {});
        }
        return;
      }
      if (same(failed.get(current.row) || {}, current)) return;
      menu = document.createElement('ytd-menu-renderer'); created = true;
      if (!active()) return;
      menu.setAttribute(owned, '1');
      menu.classList.add('style-scope', 'ytd-playlist-panel-video-renderer');
      // Register ownership before native connected/data callbacks can interrupt
      // installation. Lifecycle cleanup must see even a partly stamped menu.
      const pending = { ...current, menu, created };
      records.set(current.row, pending);
      const retained = () => active() && records.get(current.row) === pending;
      try {
        current.row.append(menu);
        if (!retained()) return;
        const owner = controller(menu);
        if (!retained()) return;
        if (typeof owner.set === 'function') owner.set('data', current.model);
        else owner.data = current.model;
        if (!retained()) return;
        if (menuStampOf(menu) !== current.stamp) {
          if (retained()) { failed.set(current.row, current); release(current.row); }
          return;
        }
        const fresh = proof(current.panel);
        if (!retained()) return;
        if (!same(current, fresh) || menu.closest(rows) !== current.row) { release(current.row); return; }
      } catch {
        if (retained()) { failed.set(current.row, current); release(current.row); }
        return;
      }
    }
    if (!active()) return;
    if (!style) {
      style = document.createElement('style');
      style.textContent = `[${marker}] ytd-menu-renderer[${marker}] { display:flex !important; visibility:visible !important; opacity:1 !important; pointer-events:auto !important; }
${rows.split(', ').map(row => `${row}[${marker}]`).join(',')} { position:relative; }
ytd-menu-renderer[${owned}="1"] { position:absolute; inset-inline-end:0; top:50%; transform:translateY(-50%); z-index:1; }
${rows.split(', ').map(row => `${row}[${marker}] #meta`).join(',')} { padding-inline-end:32px; }`;
      (document.head || document.documentElement).append(style);
    }
    const record = created ? records.get(current.row) : { ...current, menu, created };
    if (!active() || !record || record.menu !== menu) return;
    record.guard = event => {
      if (event.type === 'keydown' && !['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
      // Native icon buttons can synthesise their click from a trusted key.
      // Opening remains native; revalidate identity for every activation path.
      if (!active() || !same(record, proof(record.panel)) || !bound(record) || !active()) {
        event.preventDefault(); event.stopImmediatePropagation(); release(record.row); schedule();
      }
    };
    // Preserve native target handlers while stopping row-level navigation.
    record.stop = event => event.stopPropagation();
    menu.addEventListener('click', record.guard, true); menu.addEventListener('keydown', record.guard, true);
    menu.addEventListener('click', record.stop);
    records.set(current.row, record);
    menu.setAttribute(marker, '1');
    if (active()) current.row.setAttribute(marker, '1');
  }
  function refresh() {
    frame = 0;
    if (disposed || navigating || pageHidden) return;
    const request = generation;
    topology.disconnect(); content.disconnect(); visibility.disconnect();
    const roots = new Set([document.documentElement, document.body,
      ...document.querySelectorAll('ytd-app, ytd-page-manager, #page-manager, ytd-watch-flexy, ytd-miniplayer, #secondary, #secondary-inner, #panels, .ytdMiniplayerComponentContent')]);
    for (const root of roots) if (root) topology.observe(root, { childList: true });
    const currentRows = new Set();
    for (const panel of document.querySelectorAll(panels)) {
      if (request !== generation || disposed || navigating || pageHidden) return;
      content.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected', 'aria-selected', 'aria-current', 'hidden'] });
      // Native queues can reappear through an ancestor attribute without any
      // child insertion. Watch only their visibility path and row roots.
      const path = new Set([...panel.querySelectorAll(rows)]);
      for (let node = panel; node; node = node.parentElement) path.add(node);
      for (const node of path) visibility.observe(node, { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'inert', 'class', 'style', 'collapsed'] });
      const current = proof(panel);
      if (request !== generation || disposed || navigating || pageHidden) return;
      if (current) { currentRows.add(current.row); install(current); }
    }
    if (request !== generation || disposed || navigating || pageHidden) return;
    for (const row of [...records.keys()]) if (!currentRows.has(row)) release(row);
  }
  function schedule() {
    if (!disposed && !navigating && !pageHidden && !frame) frame = window.requestAnimationFrame(refresh);
  }
  function clear() {
    generation++;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; topology.disconnect(); content.disconnect(); visibility.disconnect();
    for (const row of [...records.keys()]) release(row);
    failed = new WeakMap();
  }
  const start = () => { navigating = true; clear(); };
  const finish = () => { navigating = false; schedule(); };
  const hide = () => { pageHidden = true; clear(); };
  const show = () => { if (pageHidden) navigating = false; pageHidden = false; schedule(); };
  const listeners = [['yt-navigate-start', start], ['yt-navigate-finish', finish], ['yt-page-data-updated', schedule],
    ['yt-playlist-data-updated', schedule], ['pagehide', hide], ['pageshow', show], ['DOMContentLoaded', schedule]];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  schedule();
  return () => { disposed = true; clear(); style?.remove(); for (const [type, listener] of listeners) window.removeEventListener(type, listener, true); };
}
