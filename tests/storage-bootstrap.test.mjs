// Language: en-GB. Synthetic storage only; no browser profiles or saved settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedStorage } from '../sources/isolated-storage.mjs';
import { initialiseIsolatedStorage } from '../sources/storage-bootstrap.mjs';

const migrationKey = 'yt-master-suite.storage-migration.v1';
const guardKey = 'yt-master-suite.storage-migration-started.v1';
const settingsKey = 'yt-master-suite.settings.v1';
const keys = ['settings', 'scroll-miniplayer.corner', 'channel-age', 'playhead-image', 'update-source']
  .map(name => `yt-master-suite.${name}.v1`);
const snapshot = setting => JSON.stringify({ version: 1,
  values: Object.fromEntries(keys.map(key => [key, key === settingsKey ? setting : null])) });
const turn = () => new Promise(resolve => setImmediate(resolve));

function serialLocks() {
  let tail = Promise.resolve(), calls = 0;
  return {
    get calls() { return calls; },
    request(name, options, callback) {
      calls++; assert.equal(name, migrationKey); assert.equal(options.mode, 'exclusive');
      const run = tail.then(() => {
        if (options.signal.aborted) throw new Error('Lock request aborted');
        return callback({ name });
      });
      tail = run.catch(() => {});
      return run;
    },
  };
}
function fixture() {
  const publicStore = new Map(), publicWrites = [], privateWrites = [], pending = [], clients = [];
  const locks = serialLocks();
  function client(setting = 'synthetic setting') {
    const cache = new Map(), listeners = new Map();
    let serial = 0, legacyReads = 0;
    const legacy = {
      getItem(key) {
        if (key === guardKey) return publicStore.get(key) ?? null;
        legacyReads++;
        return key === settingsKey ? setting : null;
      },
      setItem(key, value) {
        assert.equal(key, guardKey); assert.equal(value, '1');
        publicWrites.push([key, value]); publicStore.set(key, value);
      },
    };
    const adapterOptions = {
      getValue: (key, fallback) => cache.has(key) ? cache.get(key) : fallback,
      setValue(key, value) {
        privateWrites.push([key, value]); cache.set(key, value);
        for (const other of clients) if (other.cache !== cache) pending.push(() => other.deliver(key, value));
      },
      addValueChangeListener(key, callback) { const id = ++serial; listeners.set(id, { key, callback }); return id; },
      removeValueChangeListener: id => listeners.delete(id),
      getLegacyStorage: () => legacy,
    };
    const current = { cache, listeners, legacy, adapterOptions, legacyReads: () => legacyReads,
      deliver(key, value) {
        const old = cache.get(key); cache.set(key, value);
        for (const entry of [...listeners.values()]) if (entry.key === key) entry.callback(key, old, value, true);
      },
      open: (overrides = {}) => initialiseIsolatedStorage({ createAdapter: createIsolatedStorage,
        adapterOptions, getLegacyStorage: () => legacy, locks, timeoutMs: 2000, ...overrides }),
    };
    clients.push(current); return current;
  }
  return { client, locks, publicStore, publicWrites, privateWrites, pending,
    deliver() { while (pending.length) pending.shift()(); } };
}

test('first migration writes only a fixed public guard and preserves all legacy records', async () => {
  const f = fixture(), tab = f.client(), result = await tab.open();
  assert.equal(result.getItem(settingsKey), 'synthetic setting');
  assert.deepEqual(f.publicWrites, [[guardKey, '1']]);
  assert.deepEqual(f.privateWrites, [[migrationKey, snapshot('synthetic setting')]]);
  assert.equal(tab.legacy.getItem(settingsKey), 'synthetic setting');
  result.dispose();
});

test('simultaneous stale GM caches migrate once despite different legacy snapshots', async () => {
  const f = fixture(), first = f.client('first legacy'), second = f.client('second legacy');
  const firstOpen = first.open(), secondOpen = second.open();
  const a = await firstOpen;
  await turn();
  assert.equal(second.cache.has(migrationKey), false);
  assert.equal(second.legacyReads(), 0);
  assert.deepEqual(f.privateWrites, [[migrationKey, snapshot('first legacy')]]);
  assert.equal(second.listeners.size, 1);
  f.deliver();
  const b = await secondOpen;
  assert.equal(a.getItem(settingsKey), 'first legacy');
  assert.equal(b.getItem(settingsKey), 'first legacy');
  assert.equal(second.legacyReads(), 0);
  assert.equal(second.listeners.size, 5);
  assert.equal(f.publicWrites.length, 1);
  a.dispose(); b.dispose();
});

test('an existing private baseline bypasses locks and all legacy access', async () => {
  const f = fixture(), tab = f.client(); tab.cache.set(migrationKey, snapshot('private baseline'));
  const storage = await tab.open({ locks: null, getLegacyStorage() { throw new Error('Must not read legacy'); } });
  assert.equal(storage.getItem(settingsKey), 'private baseline');
  assert.equal(f.locks.calls, 0); assert.deepEqual(f.publicWrites, []);
  assert.equal(tab.legacyReads(), 0); storage.dispose();
});

test('a baseline delivered while waiting for the lock is re-read before page storage', async () => {
  const f = fixture(), tab = f.client();
  const storage = await tab.open({ locks: { async request(name, options, callback) {
    tab.deliver(migrationKey, snapshot('arrived before lock')); return callback();
  } }, getLegacyStorage() { throw new Error('Must not read legacy'); } });
  assert.equal(storage.getItem(settingsKey), 'arrived before lock');
  assert.deepEqual(f.privateWrites, []); storage.dispose();
});

test('guard write failure stops before any private write or legacy snapshot read', async () => {
  for (const write of [() => {}, () => { throw new Error('Blocked'); }]) {
    const f = fixture(), tab = f.client(); tab.legacy.setItem = write;
    await assert.rejects(tab.open());
    assert.deepEqual(f.privateWrites, []); assert.equal(tab.legacyReads(), 0);
  }
});

test('missing locks and missing GM functions fail without touching the guard', async () => {
  const f = fixture(), tab = f.client(); await assert.rejects(tab.open({ locks: null }));
  for (const name of ['getValue', 'setValue', 'addValueChangeListener', 'removeValueChangeListener']) {
    await assert.rejects(tab.open({ adapterOptions: { ...tab.adapterOptions, [name]: null } }));
  }
  await assert.rejects(tab.open({ adapterOptions: { ...tab.adapterOptions, getValue: () => Promise.resolve(undefined) } }));
  assert.deepEqual(f.publicWrites, []); assert.deepEqual(f.privateWrites, []);
  assert.equal(tab.legacyReads(), 0);
});

test('a timed-out stale-cache wait cleans up its listener and keeps the migration guard', async () => {
  const f = fixture(), tab = f.client(); f.publicStore.set(guardKey, '1');
  await assert.rejects(tab.open({ timeoutMs: 20 }), /migration could not complete/);
  assert.equal(tab.listeners.size, 0); assert.equal(f.publicStore.get(guardKey), '1');
  assert.deepEqual(f.privateWrites, []); assert.equal(tab.legacyReads(), 0);
});

test('queued lock acquisition has a bounded abort and does not touch storage', async () => {
  const f = fixture(), tab = f.client(); let signal;
  await assert.rejects(tab.open({ timeoutMs: 20, locks: { request(name, options) {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } } }), /aborted/);
  assert.equal(signal.aborted, true); assert.deepEqual(f.publicWrites, []);
});

test('baseline delivery during listener registration is adopted and the temporary listener is removed', async () => {
  const f = fixture(), tab = f.client(); f.publicStore.set(guardKey, '1');
  const add = tab.adapterOptions.addValueChangeListener;
  tab.adapterOptions.addValueChangeListener = (key, callback) => {
    const id = add(key, callback);
    if (key === migrationKey) tab.deliver(migrationKey, snapshot('during registration'));
    return id;
  };
  const storage = await tab.open();
  assert.equal(storage.getItem(settingsKey), 'during registration');
  assert.equal(tab.listeners.size, 5); assert.deepEqual(f.privateWrites, []);
  storage.dispose();
});

test('a failed first write retains the guard and cannot silently remigrate on retry', async () => {
  const f = fixture(), tab = f.client();
  await assert.rejects(tab.open({ adapterOptions: { ...tab.adapterOptions, setValue() { throw new Error('write failed'); } } }));
  assert.equal(f.publicStore.get(guardKey), '1');
  await assert.rejects(tab.open({ timeoutMs: 20 }));
  assert.deepEqual(f.privateWrites, []); assert.equal(tab.listeners.size, 0);
  assert.equal(tab.legacy.getItem(settingsKey), 'synthetic setting');
});

test('an existing malformed private baseline is rejected without repairing or overwriting it', async () => {
  const f = fixture(), tab = f.client(); tab.cache.set(migrationKey, null);
  await assert.rejects(tab.open({ locks: null }));
  assert.equal(tab.cache.get(migrationKey), null); assert.equal(f.locks.calls, 0);
  assert.deepEqual(f.privateWrites, []); assert.deepEqual(f.publicWrites, []);
});

test('migration failures reject startup after releasing the lock without rejecting its callback', async () => {
  for (const pending of [false, true]) {
    const f = fixture(), tab = f.client(), failure = new Error('Synthetic protected-storage failure');
    let callbackRejected = false, callbackSettled = false;
    if (pending) f.publicStore.set(guardKey, '1');
    await assert.rejects(tab.open({ timeoutMs: 20,
      adapterOptions: { ...tab.adapterOptions, setValue() { throw failure; } },
      locks: { async request(name, options, callback) {
        try { return await callback(); }
        catch (error) { callbackRejected = true; throw error; }
        finally { callbackSettled = true; }
      } },
    }), error => pending ? /migration could not complete/.test(error.message) : error === failure);
    assert.equal(callbackSettled, true);
    assert.equal(callbackRejected, false);
    assert.equal(f.publicStore.get(guardKey), '1');
    assert.equal(tab.listeners.size, 0);
    assert.deepEqual(f.privateWrites, []);
    assert.equal(tab.legacy.getItem(settingsKey), 'synthetic setting');
  }
});
