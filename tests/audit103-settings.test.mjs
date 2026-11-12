// Language: en-GB. Independent boundary audit using local synthetic records only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSuiteSettings } from '../sources/suite-settings.mjs';
import { createSuiteBackup } from '../sources/suite-backup.mjs';
import { createChannelAgeService } from '../sources/channel-age.mjs';
import { createMenuLayout } from '../sources/menu-layout.mjs';
import { createSettingsWriteGuard } from '../sources/settings-write-guard.mjs';

function fixture() {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const settings = createSuiteSettings(() => storage, () => true);
  const channels = createChannelAgeService(() => storage);
  return { data, storage, settings, channels, backup: createSuiteBackup(() => storage, settings, channels) };
}

test('all opposing presentation combinations survive save and export preview without semantic drift', () => {
  const f = fixture();
  const names = ['hideRelated', 'relatedBelowPlayer', 'disableVideoPreviews', 'keepHoverPreviews', 'hideAllComments', 'fullscreenComments'];
  for (let mask = 0; mask < 64; mask++) {
    const input = Object.fromEntries(names.map((name, index) => [name, Boolean(mask & (1 << index))]));
    const saved = f.settings.save(input);
    assert.equal(saved.ok, true);
    const exported = f.backup.exportData(); assert.equal(exported.ok, true, exported.error);
    const preview = f.backup.preview(exported.text); assert.equal(preview.ok, true, preview.error);
    assert.deepEqual(preview.summary.settingChanges, []);
    assert.deepEqual(f.settings.read(), saved.values);
    assert.equal(saved.values.relatedBelowPlayer && saved.values.hideRelated, false);
    assert.equal(saved.values.disableVideoPreviews && saved.values.keepHoverPreviews, false);
    assert.equal(saved.values.hideAllComments && saved.values.fullscreenComments, false);
  }
  const before = [...f.data];
  assert.equal(f.settings.save({ headerSettingsIcon: 'off', playerSettingsIcon: 'off' }).ok, false);
  assert.deepEqual([...f.data], before);
});

test('maximum Unicode channel names and menu names pass private backup preview validation', () => {
  const f = fixture(), menus = createMenuLayout();
  const layout = menus.fromPreferences({});
  for (let index = 1; index <= 7; index++) layout.nodes.push({ id: `submenu-${index}`, name: '界'.repeat(40), parent: 'root' });
  assert.equal(f.settings.save({ menuLayout: layout }).ok, true);
  const rules = Array.from({ length: 100 }, (_, index) => ({ channelId: 'UC' + String(index).padStart(22, '0'),
    name: '界'.repeat(100), maxAge: 1000, unit: 'years', enabled: true, blocked: true }));
  assert.equal(f.channels.save(rules).ok, true);
  for (const [exported, preview] of [[f.backup.exportData(), text => f.backup.preview(text)],
    [f.backup.exportChannels(), text => f.backup.previewChannels(text, 'replace')]]) {
    assert.equal(exported.ok, true, exported.error);
    assert.ok(Buffer.byteLength(exported.text, 'utf8') <= 131072);
    const checked = preview(exported.text); assert.equal(checked.ok, true, checked.error);
  }
});

test('untrusted import extensions cannot smuggle executable code or prototype keys into settings', () => {
  const f = fixture(), clean = JSON.parse(f.backup.exportData().text);
  for (const key of ['customJavascript', '__proto__', 'constructor', 'toString']) {
    const candidate = structuredClone(clean);
    Object.defineProperty(candidate.settings, key, { value: 'synthetic-untrusted-value', enumerable: true });
    assert.equal(f.backup.preview(JSON.stringify(candidate)).ok, false, key);
    assert.equal(f.data.size, 0);
  }
  assert.equal({}.polluted, undefined);
});

test('full restore tokens cannot be reused or crossed into channel restore', () => {
  const f = fixture(), candidate = JSON.parse(f.backup.exportData().text);
  candidate.settings.hideShorts = false;
  const staged = f.backup.preview(JSON.stringify(candidate)); assert.equal(staged.ok, true);
  assert.equal(f.backup.restoreChannels(staged.preview).ok, false);
  assert.equal(f.backup.restore(staged.preview).ok, true);
  const after = [...f.data];
  assert.equal(f.backup.restore(staged.preview).ok, false);
  assert.deepEqual([...f.data], after);
});

test('a changed protected record with a lost receipt stays blocked instead of accepting a later overwrite', async () => {
  const f = fixture(); let record = 'synthetic-before', revisions = 0, attempts = 0;
  const guard = createSettingsWriteGuard({ key: 'synthetic-lock',
    locks: { request: async (_key, _options, callback) => callback() },
    getCoordinationStorage: () => f.storage, getValue: (_key, fallback) => fallback,
    setValue: () => { throw Error('synthetic receipt failure'); },
    getMainRecord: () => record, newRevision: () => 'revision-' + ++revisions });
  const first = await guard(() => { attempts++; record = 'synthetic-after'; return { ok: true }; });
  assert.equal(first.ok, false);
  const second = await guard(() => { attempts++; record = 'synthetic-overwrite'; return { ok: true }; });
  assert.equal(second.conflict, true);
  assert.equal(attempts, 1); assert.equal(record, 'synthetic-after');
  assert.deepEqual([...f.data.values()], ['revision-1']);
});
