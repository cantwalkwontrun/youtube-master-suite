// Language: en-GB. Private, synchronous Tampermonkey persistence; no page bridge.
export function createIsolatedStorage({ getValue, setValue, addValueChangeListener,
  removeValueChangeListener, getLegacyStorage, beforeMigrationWrite, enqueue = callback => queueMicrotask(callback) }) {
  const keys = Object.freeze([
    'yt-master-suite.settings.v1',
    'yt-master-suite.scroll-miniplayer.corner.v1',
    'yt-master-suite.channel-age.v1',
    'yt-master-suite.playhead-image.v1',
    'yt-master-suite.update-source.v1',
  ]);
  const migrationKey = 'yt-master-suite.storage-migration.v1';
  const emptyBaselineKey = 'yt-master-suite.storage-empty-baseline.v1';
  const allowed = new Set(keys), maxRecordLength = 262144, maxSnapshotLength = 1048576;
  const subscribers = new Set(), listenerIds = [], changed = new Set();
  let disposed = false, scheduled = false;
  const fail = () => { throw new Error('Tampermonkey storage is unavailable or incompatible. Existing site settings were left unchanged.'); };
  const synchronous = value => {
    if (value && typeof value.then === 'function') {
      value.catch?.(() => {});
      fail();
    }
    return value;
  };
  function raw(value) {
    if (value !== null && (typeof value !== 'string' || value.length > maxRecordLength)) fail();
    return value;
  }
  function read(name, fallback) { return synchronous(getValue(name, fallback)); }
  function write(name, value) { synchronous(setValue(name, value)); }
  function parseSnapshot(value) {
    if (typeof value !== 'string' || value.length > maxSnapshotLength) fail();
    let record;
    try { record = JSON.parse(value); } catch { fail(); }
    if (!record || Array.isArray(record) || record.version !== 1 ||
        Object.keys(record).length !== 2 || !Object.hasOwn(record, 'values') ||
        !record.values || Array.isArray(record.values) || typeof record.values !== 'object' ||
        Object.keys(record.values).length !== keys.length ||
        keys.some(key => !Object.hasOwn(record.values, key))) fail();
    for (const key of keys) raw(record.values[key]);
    return Object.freeze(record.values);
  }
  if ([getValue, setValue, addValueChangeListener, removeValueChangeListener, getLegacyStorage]
    .some(value => typeof value !== 'function')) fail();

  let snapshot = read(migrationKey, undefined);
  // Explicit recovery never replaces the original protected snapshot, even
  // when it was absent in this tab's cache. A later visible original wins.
  const emptyBaseline = snapshot === undefined && read(emptyBaselineKey, undefined) === '1';
  if (emptyBaseline) snapshot = read(migrationKey, undefined);
  if (snapshot === undefined && !emptyBaseline) {
    // A single baseline commit prevents a partially copied set becoming active.
    // Never normalise these strings: older, malformed and future records remain
    // recoverable and the existing services retain their own validation rules.
    const legacy = getLegacyStorage();
    const values = Object.fromEntries(keys.map(key => [key, raw(legacy.getItem(key))]));
    if (keys.some(key => legacy.getItem(key) !== values[key])) fail();
    snapshot = read(migrationKey, undefined);
    if (snapshot === undefined) {
      const proposed = JSON.stringify({ version: 1, values });
      if (proposed.length > maxSnapshotLength) fail();
      beforeMigrationWrite?.();
      write(migrationKey, proposed);
      snapshot = read(migrationKey, undefined);
      if (snapshot !== proposed) fail();
    }
  }
  const recovered = snapshot === undefined && emptyBaseline;
  const baseline = recovered
    ? Object.freeze(Object.fromEntries(keys.map(key => [key, null]))) : parseSnapshot(snapshot);
  const namespaceKey = key => recovered ? key + ':recovered' : key;
  function storedRecord(key) {
    const value = read(namespaceKey(key), undefined);
    // The recovery baseline may read surviving records, but editing recovery
    // settings must never overwrite them or reuse their coordination receipts.
    return recovered && value === undefined ? read(key, undefined) : value;
  }
  // Detect incompatible protected records before settings.initial is frozen.
  for (const key of keys) {
    const value = storedRecord(key);
    if (value !== undefined) raw(value);
  }
  function checkKey(key) {
    if (disposed || !allowed.has(key)) fail();
  }
  function getItem(key) {
    checkKey(key);
    const value = storedRecord(key);
    return value === undefined ? baseline[key] : raw(value);
  }
  function setItem(key, value) {
    checkKey(key);
    if (typeof value !== 'string') fail();
    raw(value);
    const target = namespaceKey(key);
    write(target, value);
    if (read(target, undefined) !== value) fail();
  }
  function removeItem(key) {
    checkKey(key);
    // A null tombstone prevents deletion from resurrecting the migration copy.
    const target = namespaceKey(key);
    write(target, null);
    if (read(target, undefined) !== null) fail();
  }
  function notify(key, oldValue, newValue, remote) {
    if (disposed || remote !== true || !allowed.has(key)) return;
    changed.add(key);
    if (scheduled) return;
    scheduled = true;
    enqueue(() => {
      scheduled = false;
      const pending = [...changed]; changed.clear();
      if (disposed) return;
      for (const key of pending) {
        let value;
        try { value = getItem(key); } catch { continue; }
        const event = Object.freeze({ key, newValue: value });
        for (const subscriber of [...subscribers]) {
          try { subscriber(event); } catch { /* One consumer cannot stop the others. */ }
        }
      }
    });
  }
  try {
    for (const key of keys) {
      const id = synchronous(addValueChangeListener(namespaceKey(key), (_changedKey, oldValue, newValue, remote) =>
        notify(key, oldValue, newValue, remote)));
      if (typeof id !== 'number' && typeof id !== 'string') fail();
      listenerIds.push(id);
    }
  } catch {
    for (const id of listenerIds) {
      try { removeValueChangeListener(id); } catch { /* Preserve the startup error. */ }
    }
    fail();
  }
  return Object.freeze({
    getItem, setItem, removeItem, namespaceKey,
    subscribe(callback) {
      if (disposed || typeof callback !== 'function') fail();
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    dispose() {
      if (disposed) return;
      disposed = true; subscribers.clear(); changed.clear();
      for (const id of listenerIds) {
        try { removeValueChangeListener(id); } catch { /* No page state is exposed. */ }
      }
    },
  });
}
