// Language: en-GB. Synthetic miniplayer dimensions and live sizing controls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../sources/modules/youtube-scroll-miniplayer.user.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing ${name}`);
  const body = source.indexOf('{', start);
  let depth = 0;
  for (let index = body; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] !== '}') continue;
    if (--depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unterminated ${name}`);
}

function harness({ width = 1920, height = 1080, active = true, config = {}, column = null } = {}) {
  const values = new Map();
  let writes = 0, resizes = 0;
  const context = {
    innerWidth: width, innerHeight: height, currentCorner: 'top-right',
    document: { body: { style: { setProperty(name, value) { values.set(name, value); writes++; } } } },
    getRemainingColumnBox: () => column,
    getMastheadHeight: () => 56,
    isBodyActive: () => active,
    dispatchResize: () => { resizes++; },
  };
  const block = source.match(/  const CONFIG = \{[\s\S]*?\n  \};/);
  assert.ok(block, 'Missing default configuration');
  vm.runInNewContext(block[0].replace('const CONFIG', 'var CONFIG'), context);
  Object.assign(context.CONFIG, config);
  for (const name of ['clamp', 'getRequestedCustomWidth', 'getAppliedScrollMiniplayerSize', 'setScrollMiniplayerSize', 'setBodyBoxVars']) {
    vm.runInNewContext(extractFunction(name), context);
  }
  return {
    context,
    pixels: name => Number.parseFloat(values.get(`--ytsmp-${name}`)),
    counts: () => ({ writes, resizes }),
    setActive: value => { active = value; },
  };
}

test('automatic sizing retains the existing desktop and portrait dimensions', () => {
  for (const [width, height, expectedWidth, expectedHeight] of [
    [1920, 1080, 720, 405],
    [1280, 720, 486, 273],
    [800, 1200, 304, 171],
    [200, 180, 160, 90],
  ]) {
    const h = harness({ width, height });
    h.context.setBodyBoxVars();
    assert.equal(h.pixels('width'), expectedWidth, `${width} × ${height}`);
    assert.equal(h.pixels('height'), expectedHeight, `${width} × ${height}`);
  }
});

test('a custom request applies immediately and keeps proportional height', () => {
  const h = harness();
  assert.equal(h.context.setScrollMiniplayerSize({ mode: 'custom', width: 1000 }), true);
  assert.equal(h.pixels('width'), 1000);
  assert.equal(h.pixels('height'), 563);
  assert.deepEqual(h.counts(), { writes: 6, resizes: 1 });
  assert.equal(h.context.CONFIG.width, 720, 'automatic preferred width is retained');
  assert.equal(h.context.getAppliedScrollMiniplayerSize().width, 1000);
});

test('viewport clamping preserves the requested width for a larger window', () => {
  const h = harness({ width: 800, height: 500 });
  h.context.setScrollMiniplayerSize({ mode: 'custom', width: 1000 });
  assert.equal(h.pixels('width'), 740);
  assert.equal(h.pixels('height'), 416);
  assert.equal(h.context.getAppliedScrollMiniplayerSize().width, 1000);
  h.context.innerWidth = 1920; h.context.innerHeight = 1080;
  h.context.setBodyBoxVars();
  assert.equal(h.pixels('width'), 1000);
  assert.equal(h.pixels('height'), 563);
});

test('custom sizing fits an inset right column and a window smaller than its configured minimum', () => {
  const inset = harness({ width: 1280, config: { sizeMode: 'fixed', customWidth: 1200 }, column: { right: 400, width: 800 } });
  inset.context.setBodyBoxVars();
  assert.equal(inset.pixels('width'), 864);
  assert.equal(inset.pixels('width') + 400 + 16, 1280);

  const narrow = harness({ width: 200, height: 100 });
  narrow.context.setScrollMiniplayerSize({ mode: 'custom', width: 320 });
  assert.equal(narrow.pixels('height'), 16);
  assert.equal(narrow.pixels('width'), 28);
  assert.equal(narrow.context.getAppliedScrollMiniplayerSize().width, 320);
});

test('switching back to automatic restores its old geometry and remembers custom width', () => {
  const h = harness();
  h.context.setScrollMiniplayerSize({ mode: 'custom', width: 1000 });
  h.context.setScrollMiniplayerSize({ mode: 'auto', width: 1000 });
  assert.equal(h.pixels('width'), 720);
  assert.equal(h.pixels('height'), 405);
  const state = h.context.getAppliedScrollMiniplayerSize();
  assert.equal(state.mode, 'auto'); assert.equal(state.width, 1000);
  state.width = 600;
  assert.equal(h.context.getAppliedScrollMiniplayerSize().width, 1000, 'callers cannot mutate the applied value');
});

test('inactive sizing changes do no presentation work and apply on the next float', () => {
  const h = harness({ active: false });
  h.context.setScrollMiniplayerSize({ mode: 'custom', width: 960 });
  assert.deepEqual(h.counts(), { writes: 0, resizes: 0 });
  h.setActive(true); h.context.setBodyBoxVars();
  assert.equal(h.pixels('width'), 960);
  h.setActive(false);
  const counts = h.counts();
  h.context.setScrollMiniplayerSize({ mode: 'auto', width: 960 });
  assert.deepEqual(h.counts(), counts, 'returning to normal playback does not recreate floating styles');
});

test('repeating the same size does not dispatch another resize', () => {
  const h = harness();
  h.context.setScrollMiniplayerSize({ mode: 'custom', width: 640 });
  const counts = h.counts();
  assert.equal(h.context.setScrollMiniplayerSize({ mode: 'custom', width: 640 }), true);
  assert.deepEqual(h.counts(), counts);
});

test('invalid requests leave the current size and presentation untouched', () => {
  const h = harness();
  h.context.setScrollMiniplayerSize({ mode: 'custom', width: 800 });
  const counts = h.counts();
  for (const value of [null, [], 'custom', {}, { mode: 'fixed', width: 800 },
    ...[319, 1201, 640.5, NaN, Infinity, '800'].map(width => ({ mode: 'custom', width }))]) {
    assert.equal(h.context.setScrollMiniplayerSize(value), false);
  }
  assert.equal(h.context.getAppliedScrollMiniplayerSize().mode, 'custom');
  assert.equal(h.context.getAppliedScrollMiniplayerSize().width, 800);
  assert.deepEqual(h.counts(), counts);
});

test('standalone fixed sizing still uses its configured width when no custom setting exists', () => {
  const h = harness({ config: { sizeMode: 'fixed', width: 960 } });
  h.context.setBodyBoxVars();
  assert.equal(h.pixels('width'), 960);
  assert.equal(h.pixels('height'), 540);
});
