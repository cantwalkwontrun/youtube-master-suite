// Language: en-GB. Shared runtime event registration follows native ownership.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../youtube-master-suite.user.js', import.meta.url), 'utf8');
const start = source.indexOf('  function getCapture(options)');
const end = source.indexOf('  function mutationMatches(observer, mutation)', start);
assert.ok(start >= 0 && end > start);
function fixture(diagnostics) {
  const target = new EventTarget();
  const context = {
    DIAGNOSTICS: { enabled: diagnostics }, activeModuleId: 'synthetic',
    SHARED_WINDOW_EVENTS: new Set(['pageshow']), sharedWindowListeners: new Map(),
    diagnosticWindowListeners: new WeakMap(),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    runWithDiagnostics: (_owner, _operation, _count, callback) => callback(),
    reportModuleError: (_owner, _operation, error) => { throw error; },
    beginBatch() {}, endBatch() {},
  };
  const api = runInNewContext(source.slice(start, end) + '\n({ addWindowListener, removeWindowListener: typeof removeWindowListener === "function" ? removeWindowListener : globalThis.removeEventListener })', context);
  return { ...api, dispatch: type => target.dispatchEvent(new Event(type)) };
}
for (const diagnostics of [false, true]) test(`non-shared listeners retain native duplicate suppression (diagnostics=${diagnostics})`, () => {
  const events = fixture(diagnostics); let calls = 0;
  const listener = () => { calls++; };
  events.addWindowListener('resize', listener);
  events.addWindowListener('resize', listener);
  events.dispatch('resize');
  assert.equal(calls, 1);
});
test('diagnostic wrapping allows the original resize callback to be removed', () => {
  const events = fixture(true); let calls = 0;
  const listener = () => { calls++; };
  events.addWindowListener('resize', listener);
  events.dispatch('resize');
  events.removeWindowListener('resize', listener);
  events.dispatch('resize');
  assert.equal(calls, 1);
});
test('diagnostic listeners preserve once, abort, object listeners and re-registration', () => {
  const events = fixture(true); let calls = 0;
  const listener = { handleEvent() { calls++; assert.equal(this, listener); } };
  events.addWindowListener('resize', listener, { once: true });
  events.dispatch('resize'); events.dispatch('resize');
  assert.equal(calls, 1);
  const controller = new AbortController();
  events.addWindowListener('resize', listener, { signal: controller.signal });
  controller.abort(); events.dispatch('resize');
  assert.equal(calls, 1);
  events.addWindowListener('resize', listener);
  events.dispatch('resize');
  events.removeWindowListener('resize', listener);
  events.dispatch('resize');
  assert.equal(calls, 2);
});
test('shared listeners suppress duplicates and respect removal during dispatch', () => {
  const events = fixture(true); let firstCalls = 0, secondCalls = 0;
  const second = () => { secondCalls++; };
  const first = () => { firstCalls++; events.removeWindowListener('pageshow', second); };
  events.addWindowListener('pageshow', first);
  events.addWindowListener('pageshow', first);
  events.addWindowListener('pageshow', second);
  events.dispatch('pageshow');
  assert.deepEqual([firstCalls, secondCalls], [1, 0]);
  events.removeWindowListener('pageshow', first);
  events.dispatch('pageshow');
  assert.deepEqual([firstCalls, secondCalls], [1, 0]);
});
test('generated cleanup uses the Suite listener identity mapping', () => {
  assert.match(source, /suite\.removeWindowListener\("resize", scheduleLiveChatGeometry, true\)/);
  assert.match(source, /suite\.removeWindowListener\('resize', schedule\)/);
});
