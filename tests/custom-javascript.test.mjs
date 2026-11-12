// Language: en-GB. Synthetic code only, executed in an isolated VM context.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createCustomJavascript } from '../sources/custom-javascript.mjs';

function fixture(record = null, { loading = false, skip = false, query = '' } = {}) {
  let raw = record === null ? null : JSON.stringify(record), writes = 0, compiles = 0;
  const document = new EventTarget(); document.readyState = loading ? 'loading' : 'complete';
  const context = vm.createContext({});
  const NativeFunction = vm.runInContext('Function', context);
  const timers = new Map(); let sequence = 0;
  const window = new EventTarget();
  Object.assign(window, { URL, location: { href: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' + (skip ? '&ytms-custom-js=off' : '') + query },
    Function: function (...args) { compiles++; return NativeFunction(...args); },
    setTimeout(callback) { const id = ++sequence; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  context.window = window;
  const service = createCustomJavascript({ document, window,
    getValue: () => raw, setValue: (key, value) => { writes++; raw = value; } });
  return { service, document, window, get raw() { return raw; }, get writes() { return writes; }, get compiles() { return compiles; },
    set raw(value) { raw = value; }, flush() { for (const [id, callback] of timers) { timers.delete(id); callback(); } }, get timers() { return timers.size; } };
}

test('default and disabled configurations create no compile or timer work', () => {
  for (const record of [null, { version: 1, enabled: false, code: 'invalid (' }]) {
    const f = fixture(record); f.service.start(); f.service.start(); f.flush();
    assert.equal(f.service.status, 'disabled'); assert.equal(f.compiles, 0); assert.equal(f.timers, 0); assert.equal(f.writes, 0);
  }
});

test('disabling saved code before DOM ready cancels its pending execution', async () => {
  const f = fixture({ version: 1, enabled: true, code: 'window.runs = 1;' }, { loading: true });
  const baseline = f.service.read(); f.service.start();
  assert.equal((await f.service.save({ ...baseline.value, enabled: false }, baseline.raw, false)).ok, true);
  f.document.readyState = 'interactive'; f.document.dispatchEvent(new Event('DOMContentLoaded')); f.flush();
  assert.equal(f.window.runs, undefined); assert.equal(f.service.status, 'skipped');
});

test('replaced or disabled storage prevents a stale startup snapshot from running', () => {
  const f = fixture({ version: 1, enabled: true, code: 'window.runs = 1;' }, { loading: true });
  f.service.start(); f.raw = JSON.stringify({ version: 1, enabled: false, code: 'newer code' });
  f.document.readyState = 'interactive'; f.document.dispatchEvent(new Event('DOMContentLoaded')); f.flush();
  assert.equal(f.window.runs, undefined); assert.equal(f.service.status, 'skipped');
});

test('any explicit recovery flag skips execution even with an earlier conflicting value', () => {
  const f = fixture({ version: 1, enabled: true, code: 'window.runs = 1;' }, { query: '&ytms-custom-js=on&ytms-custom-js=off' });
  f.service.start(); f.flush(); assert.equal(f.window.runs, undefined); assert.equal(f.service.status, 'skipped');
});

test('a later replacement of the page Function constructor cannot hijack compilation', () => {
  const f = fixture({ version: 1, enabled: true, code: 'window.runs = 1;' });
  f.window.Function = function () { throw new Error('synthetic replacement'); };
  f.service.start(); f.flush(); assert.equal(f.window.runs, 1);
});

test('enabled code waits for the DOM and runs once through navigation and repeated starts', () => {
  const f = fixture({ version: 1, enabled: true, code: 'window.runs = (window.runs || 0) + 1; window.scope = [typeof getValue, typeof setValue, typeof service];' }, { loading: true });
  f.service.start(); f.flush(); assert.equal(f.compiles, 0);
  f.document.dispatchEvent(new Event('DOMContentLoaded')); f.flush(); assert.equal(f.compiles, 0);
  f.document.readyState = 'interactive';
  f.document.dispatchEvent(new Event('DOMContentLoaded')); f.flush();
  f.window.dispatchEvent(new Event('yt-navigate-finish')); f.window.dispatchEvent(new Event('pageshow'));
  f.service.start(); f.flush();
  assert.equal(f.window.runs, 1); assert.equal(f.compiles, 1); assert.equal(f.service.status, 'ran');
  assert.deepEqual([...f.window.scope], ['undefined', 'undefined', 'undefined']);
});

test('rescue URL and pagehide skip pending code without changing its saved record', () => {
  const record = { version: 1, enabled: true, code: 'window.runs = 1;' };
  for (const skip of [false, true]) {
    const f = fixture(record, { loading: true, skip }); f.service.start();
    f.window.dispatchEvent(new Event('pagehide')); f.document.dispatchEvent(new Event('DOMContentLoaded')); f.flush();
    assert.equal(f.window.runs, undefined); assert.equal(f.service.status, 'skipped'); assert.equal(f.writes, 0);
  }
});

test('saving requires acknowledgement, validates syntax without executing, and applies on a later load', async () => {
  const f = fixture(); f.service.start();
  const draft = { enabled: true, code: 'window.runs = 1;' };
  assert.equal((await f.service.save(draft, null, false)).ok, false);
  assert.equal((await f.service.save({ ...draft, code: 'invalid (' }, null, true)).ok, false);
  assert.equal(f.writes, 0);
  assert.equal((await f.service.save(draft, null, true)).ok, true);
  assert.equal(f.window.runs, undefined); f.service.start(); f.flush(); assert.equal(f.window.runs, undefined);
  assert.deepEqual(JSON.parse(f.raw), { version: 1, ...draft });
});

test('a stale save preserves newer code and malformed records remain recoverable', async () => {
  const f = fixture();
  f.raw = JSON.stringify({ version: 1, enabled: false, code: 'newer code' });
  assert.equal((await f.service.save({ enabled: false, code: 'old code' }, null, false)).conflict, true);
  assert.equal(JSON.parse(f.raw).code, 'newer code');
  f.raw = '{broken'; f.service.start();
  assert.equal((await f.service.save({ enabled: false, code: '' }, '{broken', false)).ok, false);
  assert.equal(f.raw, '{broken');
});

test('runtime errors and returned promise rejections keep code out of diagnostics', async () => {
  for (const code of ['throw new Error("synthetic-secret");', 'return Promise.reject(new Error("synthetic-secret"));']) {
    const f = fixture({ version: 1, enabled: true, code }); f.service.start(); f.flush();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(f.service.status, 'failed');
    assert.doesNotMatch(JSON.stringify({ status: f.service.status }), /synthetic-secret/);
  }
});
