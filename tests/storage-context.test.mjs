// Language: en-GB. Synthetic browsing contexts; no profile or container names.
import assert from 'node:assert/strict';
import test from 'node:test';
import { scopeStorageApis } from '../sources/storage-context.mjs';

const key = 'yt-master-suite.settings.v1', migrationKey = 'yt-master-suite.storage-migration.v1';
function fixture() {
  const values = new Map(), listeners = new Map(), calls = [];
  let serial = 0;
  const apis = {
    getValue(name, fallback) { calls.push(['get', name]); return values.has(name) ? values.get(name) : fallback; },
    setValue(name, value) {
      calls.push(['set', name]); const previous = values.get(name); values.set(name, value);
      for (const listener of listeners.values()) if (listener.key === name) listener.callback(name, previous, value, true);
    },
    addValueChangeListener(name, callback) { const id = ++serial; listeners.set(id, { key: name, callback }); return id; },
    removeValueChangeListener(id) { return listeners.delete(id); },
  };
  return { values, listeners, calls, apis, scope: info => scopeStorageApis({ info, ...apis }) };
}

test('normal and Firefox default contexts retain the existing unprefixed keys', () => {
  const f = fixture(); f.values.set(key, 'existing normal settings');
  for (const info of [{ isIncognito: false }, { isIncognito: false, container: { id: 'firefox-default' } }]) {
    const scoped = f.scope(info);
    assert.equal(scoped.getValue(key, null), 'existing normal settings');
    scoped.setValue(migrationKey, 'normal baseline');
  }
  assert.deepEqual([...f.values.keys()], [key, migrationKey]);
});

test('containers, private windows and private containers cannot read or overwrite another context', () => {
  const f = fixture(), infos = [
    { isIncognito: false },
    { isIncognito: false, container: { id: 'firefox-container-1' } },
    { isIncognito: false, container: { id: 'firefox-container-2' } },
    { isIncognito: true },
    { isIncognito: true, container: { id: 'firefox-container-1' } },
    { isIncognito: true, container: { id: 'default' } },
  ];
  const contexts = infos.map(info => f.scope(info));
  contexts.forEach((context, index) => {
    assert.equal(context.getValue(key, null), null);
    context.setValue(key, `synthetic settings ${index}`);
    context.setValue(migrationKey, `synthetic baseline ${index}`);
  });
  contexts.forEach((context, index) => {
    assert.equal(context.getValue(key, null), `synthetic settings ${index}`);
    assert.equal(context.getValue(migrationKey, null), `synthetic baseline ${index}`);
  });
  assert.equal(f.values.size, infos.length * 2);
});

test('private Firefox default identifiers share the private bucket without touching normal values', () => {
  const f = fixture(); f.scope({ isIncognito: false }).setValue(key, 'normal');
  f.scope({ isIncognito: true }).setValue(key, 'private');
  for (const id of ['firefox-default', 'firefox-private']) {
    assert.equal(f.scope({ isIncognito: true, container: { id } }).getValue(key), 'private');
  }
  assert.equal(f.scope({ isIncognito: false }).getValue(key), 'normal');
  assert.equal(f.values.size, 2);
});

test('container identity is captured once and names are never read or used as keys', () => {
  const f = fixture(), info = { isIncognito: false, container: { id: 'stable-id', get name() { throw new Error('Name must not be accessed'); } } };
  const first = f.scope(info); first.setValue(key, 'original');
  info.container.id = 'different-id'; info.isIncognito = true;
  assert.equal(first.getValue(key), 'original');
  const renamed = f.scope({ isIncognito: false, container: { id: 'stable-id', name: 'Synthetic renamed container' } });
  assert.equal(renamed.getValue(key), 'original');
  assert.ok(f.calls.every(([, name]) => !name.includes('Synthetic renamed container')));
});

test('opaque container IDs are encoded without delimiter collisions', () => {
  const f = fixture(), ids = ['synthetic/id', 'synthetic%2Fid', 'synthetic:id', 'default'];
  ids.forEach((id, index) => f.scope({ isIncognito: false, container: { id } }).setValue(key, String(index)));
  ids.forEach((id, index) => assert.equal(f.scope({ isIncognito: false, container: { id } }).getValue(key), String(index)));
  assert.equal(f.values.size, ids.length);
});

test('scoped notifications retain logical keys and do not cross containers', () => {
  const f = fixture(), first = f.scope({ isIncognito: false, container: { id: 'one' } });
  const second = f.scope({ isIncognito: false, container: { id: 'two' } }), events = [];
  const id = first.addValueChangeListener(key, (...event) => events.push(event));
  second.setValue(key, 'other'); assert.deepEqual(events, []);
  first.setValue(key, 'first'); first.setValue(key, null);
  assert.deepEqual(events, [[key, undefined, 'first', true], [key, 'first', null, true]]);
  f.listeners.get(id).callback('wrong backend key', 'before', 'after', true);
  assert.equal(events.length, 2);
  assert.equal(first.removeValueChangeListener(id), true);
  first.setValue(key, 'later'); assert.equal(events.length, 2);
});

test('missing or malformed context metadata stops before any storage access', () => {
  const invalid = [undefined, null, [], {}, { isIncognito: 'false' },
    { isIncognito: false, container: null }, { isIncognito: false, container: {} },
    ...['', ' ', 'bad\nvalue', 'x'.repeat(129), 7, '\ud800'].map(id => ({ isIncognito: false, container: { id } })),
    { isIncognito: false, container: { id: 'firefox-private' } },
    { get isIncognito() { throw new Error('Synthetic inaccessible metadata'); } }];
  for (const info of invalid) {
    const f = fixture(); assert.throws(() => f.scope(info), /browsing context is unavailable/);
    assert.deepEqual(f.calls, []); assert.equal(f.values.size, 0);
  }
});

test('missing APIs and prefixed logical keys cannot silently access a different bucket', () => {
  const f = fixture();
  for (const name of Object.keys(f.apis)) {
    assert.throws(() => scopeStorageApis({ info: { isIncognito: false }, ...f.apis, [name]: undefined }));
  }
  const scoped = f.scope({ isIncognito: false });
  for (const invalid of [null, '', 1, 'yt-master-suite.context.v1:private:default:' + key]) {
    assert.throws(() => scoped.getValue(invalid));
    assert.throws(() => scoped.setValue(invalid, 'synthetic'));
  }
  assert.deepEqual(f.calls, []);
});
