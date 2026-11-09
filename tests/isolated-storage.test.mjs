import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedStorage } from '../sources/isolated-storage.mjs';

const keys = ['settings', 'scroll-miniplayer.corner', 'channel-age', 'playhead-image', 'update-source']
  .map(name => `yt-master-suite.${name}.v1`);
const migrationKey = 'yt-master-suite.storage-migration.v1';
const seed = ['{"version":1,"values":{"miniplayerWidth":960}}', 'bottom-left',
  '{"version":1,"rules":[]}', '{"version":1,"size":24,"dataUrl":"synthetic-image"}',
  '{"version":1,"url":"https://example.org/release-manifest.json"}'];
const snapshot = values => JSON.stringify({ version: 1, values: Object.fromEntries(keys.map((key, i) => [key, values[i] ?? null])) });
function fixture(initial = seed) {
  const legacy = new Map(keys.map((key, i) => [key, initial[i] ?? null]));
  const stored = new Map(), listeners = new Map(), writes = [], tasks = [];
  let serial = 0, legacyReads = 0;
  function options(overrides = {}) {
    const owner = Symbol('instance');
    return {
      getValue: (key, fallback) => stored.has(key) ? stored.get(key) : fallback,
      setValue(key, value) {
        writes.push(key);
        const old = stored.get(key); stored.set(key, value);
        for (const entry of listeners.values()) if (entry.key === key) entry.callback(key, old, value, entry.owner !== owner);
      },
      addValueChangeListener(key, callback) { const id = ++serial; listeners.set(id, { key, callback, owner }); return id; },
      removeValueChangeListener: id => listeners.delete(id),
      getLegacyStorage: () => ({
        getItem(key) { legacyReads++; return legacy.get(key) ?? null; },
        setItem() { throw new Error('Legacy writes are forbidden'); },
        removeItem() { throw new Error('Legacy deletion is forbidden during the rollback period'); },
      }),
      enqueue: callback => tasks.push(callback),
      ...overrides,
    };
  }
  return { legacy, stored, listeners, writes, options, legacyReads: () => legacyReads,
    open: overrides => createIsolatedStorage(options(overrides)),
    flush() { while (tasks.length) tasks.shift()(); },
  };
}

test('migration preserves all five exact raw records and the frozen legacy rollback copy', () => {
  const f = fixture(), before = [...f.legacy];
  const storage = f.open();
  assert.deepEqual(keys.map(key => storage.getItem(key)), seed);
  assert.equal(f.stored.get(migrationKey), snapshot(seed));
  assert.deepEqual([...f.legacy], before);
  assert.deepEqual(f.writes, [migrationKey]);
});
test('migration preserves absence and damaged or future records without normalisation', () => {
  const input = [' {"version":90,"unknown":true} ', '', '{bad json', null, null];
  const f = fixture(input), storage = f.open();
  assert.deepEqual(keys.map(key => storage.getItem(key)), input);
});
test('protected overrides win and subsequent instances never remigrate page data', () => {
  const f = fixture(); f.stored.set(keys[0], 'private settings');
  const first = f.open();
  assert.equal(first.getItem(keys[0]), 'private settings');
  const reads = f.legacyReads();
  f.legacy.set(keys[0], 'old tab changes'); f.legacy.clear();
  const second = f.open();
  assert.equal(f.legacyReads(), reads);
  assert.equal(second.getItem(keys[0]), 'private settings');
  assert.equal(second.getItem(keys[1]), seed[1]);
});
test('individual protected writes preserve unrelated records and never mirror to the page', () => {
  const f = fixture(), before = [...f.legacy], first = f.open(), second = f.open();
  first.setItem(keys[0], 'settings from first'); second.setItem(keys[2], 'channels from second');
  assert.equal(first.getItem(keys[2]), 'channels from second');
  assert.equal(second.getItem(keys[0]), 'settings from first');
  assert.deepEqual([...f.legacy], before);
  assert.equal(f.stored.get(migrationKey), snapshot(seed));
});
test('a protected deletion remains deleted across reload without resurrecting its baseline', () => {
  const f = fixture(), first = f.open();
  first.removeItem(keys[3]);
  assert.equal(f.stored.get(keys[3]), null);
  assert.equal(first.getItem(keys[3]), null);
  assert.equal(f.open().getItem(keys[3]), null);
  assert.equal(f.legacy.get(keys[3]), seed[3]);
});
test('unknown keys, non-string writes and oversized values cannot reach the backend', () => {
  const f = fixture(), storage = f.open(), before = f.writes.length;
  for (const call of [() => storage.getItem('unrelated'), () => storage.setItem(migrationKey, '{}'),
    () => storage.removeItem('unrelated'), () => storage.setItem(keys[0], {}),
    () => storage.setItem(keys[0], 'x'.repeat(262145))]) assert.throws(call, /storage is unavailable/);
  assert.equal(f.writes.length, before);
});
test('missing and asynchronous-only APIs fail before migration or defaults can start', () => {
  for (const name of ['getValue', 'setValue', 'addValueChangeListener', 'removeValueChangeListener']) {
    const f = fixture(); assert.throws(() => f.open({ [name]: undefined })); assert.equal(f.stored.size, 0);
  }
  const f = fixture(); assert.throws(() => f.open({ getValue: () => Promise.resolve(undefined) }));
  assert.equal(f.stored.size, 0); assert.equal(f.legacyReads(), 0);
});
test('unavailable legacy storage or a changing snapshot does not commit migration', () => {
  const f = fixture();
  assert.throws(() => f.open({ getLegacyStorage() { throw new Error('blocked'); } }));
  let reads = 0;
  assert.throws(() => f.open({ getLegacyStorage: () => ({ getItem() { return ++reads <= 5 ? 'old' : 'new'; } }) }));
  assert.equal(f.stored.size, 0);
});
test('an already committed concurrent migration is adopted without overwriting it', () => {
  const f = fixture(); let reads = 0;
  const other = snapshot(['other settings', null, null, null, null]);
  const storage = f.open({ getValue(key, fallback) {
    if (key === migrationKey && ++reads === 2) f.stored.set(key, other);
    return f.stored.has(key) ? f.stored.get(key) : fallback;
  } });
  assert.equal(storage.getItem(keys[0]), 'other settings'); assert.deepEqual(f.writes, []);
});
test('dropped or rejected baseline writes leave all original site values intact', () => {
  for (const setValue of [() => {}, () => { throw new Error('quota'); }]) {
    const f = fixture(), before = [...f.legacy];
    assert.throws(() => f.open({ setValue })); assert.deepEqual([...f.legacy], before);
  }
});
test('malformed or unsupported protected migration records are not overwritten', () => {
  for (const value of [null, '{}', '{bad', snapshot(seed).replace('"version":1', '"version":2'),
    JSON.stringify({ version: 1, values: { [keys[0]]: 'partial' } }), 'x'.repeat(1048577)]) {
    const f = fixture(); f.stored.set(migrationKey, value);
    assert.throws(() => f.open()); assert.deepEqual(f.writes, []); assert.equal(f.legacyReads(), 0);
  }
});
test('incompatible existing overrides stop startup without replacing their contents', () => {
  const f = fixture(); f.stored.set(migrationKey, snapshot(seed)); f.stored.set(keys[0], { unexpected: true });
  assert.throws(() => f.open()); assert.deepEqual(f.writes, []);
});
test('failed protected writes and removals are reported rather than falsely succeeding', () => {
  const f = fixture(); f.stored.set(migrationKey, snapshot(seed));
  const storage = f.open({ setValue() {} });
  assert.throws(() => storage.setItem(keys[0], 'not retained'));
  assert.throws(() => storage.removeItem(keys[3]));
  assert.equal(storage.getItem(keys[0]), seed[0]); assert.equal(storage.getItem(keys[3]), seed[3]);
});
test('private remote notifications are coalesced and read the latest value; local saves do not notify themselves', () => {
  const f = fixture(), first = f.open(), second = f.open(), local = [], remote = [];
  first.subscribe(event => local.push(event)); second.subscribe(event => remote.push(event));
  first.setItem(keys[1], 'top-left'); first.setItem(keys[1], 'bottom-right');
  f.flush();
  assert.deepEqual(local, []); assert.deepEqual(remote, [{ key: keys[1], newValue: 'bottom-right' }]);
  assert.equal(Object.isFrozen(remote[0]), true);
});
test('remote deletion notifies privately and one failing consumer cannot stop another', () => {
  const f = fixture(), first = f.open(), second = f.open(), events = [];
  second.subscribe(() => { throw new Error('consumer'); }); second.subscribe(event => events.push(event));
  first.removeItem(keys[3]); f.flush();
  assert.deepEqual(events, [{ key: keys[3], newValue: null }]);
});
test('unsubscribe, disposal and partial listener registration release owned callbacks', () => {
  const f = fixture(), first = f.open(), second = f.open(), events = [];
  const unsubscribe = second.subscribe(event => events.push(event)); unsubscribe();
  first.setItem(keys[1], 'top-left'); f.flush(); assert.deepEqual(events, []);
  second.subscribe(event => events.push(event)); first.setItem(keys[1], 'top-right'); second.dispose(); f.flush();
  assert.deepEqual(events, []); assert.equal(f.listeners.size, 5); second.dispose();
  assert.throws(() => second.getItem(keys[0])); first.dispose(); assert.equal(f.listeners.size, 0);
  const broken = fixture(), options = broken.options(); let count = 0;
  assert.throws(() => createIsolatedStorage({ ...options, addValueChangeListener(key, callback) {
    if (++count === 3) throw new Error('listener failure');
    return options.addValueChangeListener(key, callback);
  } }));
  assert.equal(broken.listeners.size, 0);
});
