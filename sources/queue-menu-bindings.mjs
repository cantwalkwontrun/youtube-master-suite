// Language: en-GB. Capture native menu ownership before Suite layout moves rows.
export function createQueueMenuBindings() {
  const popupSelector = 'ytd-menu-popup-renderer, yt-sheet-view-model';
  const rowSelector = 'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, ytd-menu-service-item-download-renderer, yt-list-item-view-model, yt-download-list-item-view-model';
  const popups = new WeakMap(), bindings = new WeakMap(), conflict = Symbol('conflicting native model');
  const controller = node => node?.polymerController || node?.getPolymerController?.() || node;
  function signature(value) {
    try {
      let fields = 0;
      const json = JSON.stringify(value, (_key, entry) => {
        if (++fields > 4000 || typeof entry === 'string' && entry.length > 16384) throw Error('Bounded native menu');
        return entry;
      });
      return typeof json === 'string' && json.length <= 131072 ? json : null;
    } catch { return null; }
  }
  const normalise = value => value?.listItemViewModel || value?.downloadListItemViewModel || value;
  function model(node, sheetRow = false) {
    const current = typeof node?.componentProps?.data === 'function' ? node.componentProps.data() : null;
    const legacy = controller(node)?.data;
    if (current && typeof current === 'object' && legacy && typeof legacy === 'object') {
      const left = sheetRow ? normalise(current) : current, right = sheetRow ? normalise(legacy) : legacy;
      const stamp = signature(left);
      if (stamp === null || stamp !== signature(right)) return conflict;
    }
    return current && typeof current === 'object' ? current : legacy;
  }
  function nativeRows(popup) {
    return [...popup.querySelectorAll(rowSelector)].filter(row => row.closest(popupSelector) === popup &&
      (!row.closest('yt-download-list-item-view-model') || row.matches('yt-download-list-item-view-model')));
  }
  function queueItem(item) {
    const value = item?.menuServiceItemRenderer || item?.listItemViewModel;
    const endpoint = value?.serviceEndpoint || value?.rendererContext?.commandContext?.onTap?.innertubeCommand;
    const actions = endpoint?.signalServiceEndpoint?.actions;
    if (!Array.isArray(actions) || actions.length !== 1) return false;
    const command = actions[0]?.addToPlaylistCommand, ids = command?.videoIds || [command?.videoId];
    return command?.listType === 'PLAYLIST_EDIT_LIST_TYPE_QUEUE' && Array.isArray(ids) && ids.length === 1 &&
      typeof ids[0] === 'string' && /^[\w-]{11}$/.test(ids[0]) &&
      (command.videoId === undefined || command.videoId === ids[0]);
  }
  function rowMatches(row, item, sheet) {
    const fields = sheet ? ['downloadListItemViewModel', 'listItemViewModel'] :
      ['menuServiceItemRenderer', 'menuNavigationItemRenderer', 'menuServiceItemDownloadRenderer'];
    if (fields.filter(key => item?.[key] !== undefined).length !== 1) return false;
    const expected = sheet ? item?.downloadListItemViewModel || item?.listItemViewModel :
      item?.menuServiceItemRenderer || item?.menuNavigationItemRenderer || item?.menuServiceItemDownloadRenderer;
    if (!expected || typeof expected !== 'object') return false;
    const tag = sheet ? item.downloadListItemViewModel ? 'yt-download-list-item-view-model' : 'yt-list-item-view-model' :
      item.menuServiceItemRenderer ? 'ytd-menu-service-item-renderer' : item.menuNavigationItemRenderer ? 'ytd-menu-navigation-item-renderer' : 'ytd-menu-service-item-download-renderer';
    if (!row.matches(tag)) return false;
    const target = row.getAttribute('data-target-id');
    if (typeof expected.targetId === 'string' && target !== null && target !== expected.targetId) return false;
    const bound = model(row, sheet);
    if (bound === conflict) return false;
    // Native sheet rows can have an opaque model. Only the original, complete
    // native stamp can establish their slot; get() never infers a new slot.
    if (sheet && (!bound || typeof bound !== 'object')) return true;
    if (!sheet) return bound === expected;
    const stamp = signature(expected);
    return stamp !== null && stamp === signature(normalise(bound));
  }
  function forget(popup) {
    const record = popups.get(popup);
    if (record) for (const row of record.rows) if (bindings.get(row)?.record === record) bindings.delete(row);
    popups.delete(popup);
  }
  function capture(popup, { data, items, rows, sheet = popup?.matches('yt-sheet-view-model') } = {}) {
    // An already arranged popup cannot establish native positions again.
    if (popup?.hasAttribute('data-ytms-video-menu')) return false;
    forget(popup);
    try {
      if (!popup?.isConnected || !popup.matches(popupSelector) || sheet !== popup.matches('yt-sheet-view-model') ||
          model(popup) !== data || !Array.isArray(items) || !items.length || items.length > 60 ||
          (sheet ? data?.content?.listViewModel?.listItems : data?.items) !== items ||
          new Set(items).size !== items.length || !Array.isArray(rows) || rows.length !== items.length) return false;
      const actual = nativeRows(popup), parent = rows[0]?.parentElement, stamp = signature(data);
      if (!parent || stamp === null || actual.length !== rows.length || actual.some((row, i) => row !== rows[i]) ||
          rows.some((row, i) => row.parentElement !== parent || !rowMatches(row, items[i], sheet))) return false;
      const record = { popup, data, items, sourceItems: [...items], rows: [...rows], parent, sheet, stamp };
      const entries = rows.map((row, i) => ({ record, row, item: items[i], stamp: signature(items[i]),
        target: row.getAttribute('data-target-id'), queue: queueItem(items[i]) }));
      if (entries.some(entry => entry.stamp === null)) return false;
      popups.set(popup, record);
      for (const entry of entries) bindings.set(entry.row, entry);
      return true;
    } catch { return false; }
  }
  function owns(entry, popup) {
    const record = entry?.record, row = entry?.row;
    if (!record || record.popup !== popup || popups.get(popup) !== record || !popup.isConnected || !row.isConnected ||
        row.closest(popupSelector) !== popup || row.parentElement !== record.parent ||
        row.getAttribute('data-target-id') !== entry.target || model(popup) !== record.data ||
        (record.sheet ? record.data.content?.listViewModel?.listItems : record.data.items) !== record.items ||
        record.items.length !== record.sourceItems.length || record.items.some((item, i) => item !== record.sourceItems[i]) ||
        !record.items.includes(entry.item) || !rowMatches(row, entry.item, record.sheet)) return false;
    const actual = nativeRows(popup);
    return actual.length === record.rows.length && actual.every(node => record.rows.includes(node) && node.parentElement === record.parent) &&
      record.rows.every((node, i) => rowMatches(node, record.items[i], record.sheet));
  }
  function get(row, popup = row?.closest?.(popupSelector)) {
    try {
      const entry = bindings.get(row), record = entry?.record;
      if (!owns(entry, popup) || signature(record.data) !== record.stamp || signature(entry.item) !== entry.stamp) return null;
      return { item: entry.item, data: record.data, items: record.items, sheet: record.sheet };
    } catch { return null; }
  }
  function isStaleQueueAction(row, popup = row?.closest?.(popupSelector)) {
    try {
      const entry = bindings.get(row);
      // A changed target on the same native queue action must not fall through
      // to its native handler. This is cancellation authority only: a rebound
      // Share row, new popup model or copied row retains no such classification.
      return Boolean(entry?.queue && owns(entry, popup) && queueItem(entry.item) && !get(row, popup));
    } catch { return false; }
  }
  return Object.freeze({ capture, get, forget, isStaleQueueAction });
}
