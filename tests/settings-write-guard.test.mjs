import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettingsWriteGuard } from '../sources/settings-write-guard.mjs';

for (const key of ['yt-master-suite.settings-write.v1', 'yt-master-suite.channel-filters-write.v1']) test(`the ${key} guard rejects a stale tab even when a receipt arrives ahead of its record`, async () => {
  const coordination = new Map(), backend = new Map([['settings', 'before']]);
  const storage = {
    getItem: name => coordination.get(name) ?? null,
    setItem: (name, value) => coordination.set(name, value),
    removeItem: name => coordination.delete(name),
  };
  let revision = 0;
  const locks = { request: async (name, options, callback) => callback() };
  function tab() {
    const cache = new Map(backend);
    const guard = createSettingsWriteGuard({ key, locks, getCoordinationStorage: () => storage,
      getValue: (name, fallback) => cache.get(name) ?? fallback,
      setValue: (name, value) => { cache.set(name, value); backend.set(name, value); },
      getMainRecord: () => cache.get('settings'), newRevision: () => 'revision-' + ++revision,
    });
    const write = value => guard(() => {
      cache.set('settings', value); backend.set('settings', value);
      return { ok: true };
    });
    return { cache, write };
  }
  const first = tab(), second = tab();
  assert.equal((await first.write('first edit')).ok, true);
  assert.equal((await second.write('stale second edit')).conflict, true);
  second.cache.set(key, backend.get(key));
  assert.equal((await second.write('stale second edit')).conflict, true);
  assert.equal(backend.get('settings'), 'first edit');
  assert.equal(coordination.get(key), 'revision-1');
  second.cache.set('settings', backend.get('settings'));
  assert.equal((await second.write('merged second edit')).ok, true);
  assert.equal(backend.get('settings'), 'merged second edit');
  coordination.clear();
  assert.equal((await first.write('stale after clearing site data')).conflict, true);
  const reopened = tab();
  assert.equal((await reopened.write('edit after reopening')).ok, true);
  assert.equal(backend.get('settings'), 'edit after reopening');
});

test('a full restore holds the settings lock while waiting for the channel lock before either record is inspected', async () => {
  const publicValues = new Map(), privateValues = new Map(), held = new Set(), read = [];
  let releaseChannels, revision = 0, main = 'main before', channels = 'channels before';
  const blocked = new Promise(resolve => { releaseChannels = resolve; });
  const locks = { request: async (key, options, callback) => {
    if (key === 'channels') await blocked;
    held.add(key);
    try { return await callback(); } finally { held.delete(key); }
  } };
  const coordination = { getItem: key => publicValues.get(key) ?? null,
    setItem: (key, value) => publicValues.set(key, value), removeItem: key => publicValues.delete(key) };
  const guard = (key, getMainRecord) => createSettingsWriteGuard({ key, locks, getMainRecord,
    getCoordinationStorage: () => coordination,
    getValue: (key, fallback) => privateValues.get(key) ?? fallback,
    setValue: (key, value) => privateValues.set(key, value), newRevision: () => `revision-${++revision}` });
  const writeMain = guard('main', () => { read.push('main'); return main; });
  const writeChannels = guard('channels', () => { read.push('channels'); return channels; });
  const pending = writeMain(() => {
    assert.deepEqual([...held].sort(), ['channels', 'main']);
    main = 'main after'; channels = 'channels after'; return { ok: true };
  }, writeChannels);
  await Promise.resolve();
  assert.deepEqual([...held], ['main']);
  assert.deepEqual(read, []);
  assert.equal(publicValues.size, 0);
  releaseChannels();
  assert.equal((await pending).ok, true);
  assert.equal(held.size, 0);
  assert.equal(JSON.parse(privateValues.get('main')).value, 'main after');
  assert.equal(JSON.parse(privateValues.get('channels')).value, 'channels after');
});

test('a rejected secondary coordinator cannot reserve or write the outer record', async () => {
  let reads = 0, writes = 0;
  const guard = createSettingsWriteGuard({ locks: { request: async (key, options, callback) => callback() },
    getCoordinationStorage: () => ({ getItem: () => null, setItem: () => { writes++; }, removeItem: () => {} }),
    getValue: () => null, setValue: () => { writes++; }, getMainRecord: () => { reads++; return 'before'; },
    newRevision: () => 'unused' });
  const result = await guard(() => { writes++; return { ok: true }; }, () => ({ ok: false, conflict: true }));
  assert.equal(result.conflict, true);
  assert.equal(reads, 0); assert.equal(writes, 0);
});

test('a writer that throws before changing its record does not poison later saves', async () => {
  let record = 'before', privateReceipt = null, publicRevision = null, sequence = 0;
  const guard = createSettingsWriteGuard({ locks: { request: async (key, options, callback) => callback() },
    getCoordinationStorage: () => ({ getItem: () => publicRevision, setItem: (key, value) => { publicRevision = value; }, removeItem: () => { publicRevision = null; } }),
    getValue: (key, fallback) => privateReceipt ?? fallback,
    setValue: (key, value) => { privateReceipt = value; },
    getMainRecord: () => record, newRevision: () => 'revision-' + ++sequence,
  });
  assert.equal((await guard(() => { throw new Error('synthetic failure'); })).ok, false);
  assert.equal(publicRevision, null);
  assert.equal((await guard(() => { record = 'after'; return { ok: true }; })).ok, true);
});

for (const changed of ['record', 'revision']) test(`failed writes preserve an intervening ${changed} change`, async () => {
  let record = 'before', receipt = null, revision = null;
  const guard = createSettingsWriteGuard({ locks: { request: async (key, options, callback) => callback() },
    getCoordinationStorage: () => ({ getItem: () => revision, setItem: (key, value) => { revision = value; }, removeItem: () => { revision = null; } }),
    getValue: (key, fallback) => receipt ?? fallback, setValue: (key, value) => { receipt = value; },
    getMainRecord: () => record, newRevision: () => 'own reservation',
  });
  const result = await guard(() => {
    if (changed === 'record') record = 'partial write'; else revision = 'newer reservation';
    throw new Error('synthetic interruption');
  });
  assert.equal(result.ok, false);
  assert.equal(record, changed === 'record' ? 'partial write' : 'before');
  assert.equal(revision, changed === 'revision' ? 'newer reservation' : 'own reservation');
});
