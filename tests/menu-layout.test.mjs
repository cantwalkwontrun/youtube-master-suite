// Language: en-GB. Synthetic menu data only; no browser or saved user settings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { createMenuLayout } from '../sources/menu-layout.mjs';

const layouts = createMenuLayout();
const copy = value => JSON.parse(JSON.stringify(value));
function custom() {
  const value = layouts.fromPreferences({});
  value.nodes.push({ id: 'submenu-sharing', name: 'Sharing', parent: 'root' });
  value.nodes.find(node => node.id === 'share').parent = 'submenu-sharing';
  return value;
}

test('menu layout rules embed without external runtime state', () => {
  const embedded = vm.runInNewContext(`(${createMenuLayout.toString()})()`);
  const value = embedded.fromPreferences({});
  assert.deepEqual(copy(embedded.validate(value)), layouts.fromPreferences({}));
  assert.equal(embedded.actionIds.length, 10);
});

test('legacy order, grouping and visibility become an equivalent detached layout', () => {
  assert.deepEqual(layouts.fromPreferences(null), layouts.fromPreferences({}));
  const value = layouts.fromPreferences({ menuItemOrder: ['share', 'channelTools', 'report'],
    menuShowDownload: true, menuShowAgeLimit: false, menuShowReport: false });
  assert.deepEqual(value.nodes.slice(0, 3).map(node => node.id), ['share', 'channelTools', 'report']);
  assert.equal(value.nodes.find(node => node.id === 'report').parent, 'channelTools');
  assert.equal(value.nodes.find(node => node.id === 'report').visible, false);
  assert.equal(value.nodes.find(node => node.id === 'channelAge').visible, false);
  assert.equal(value.nodes.find(node => node.id === 'download').visible, true);
  assert.deepEqual(layouts.validate(value), value);
  const flat = layouts.fromPreferences({ menuGroupChannelTools: false });
  assert.equal(flat.nodes.length, 10);
  assert.ok(flat.nodes.every(node => node.parent === 'root'));
});

test('validated custom menus preserve sibling order and labels without retaining draft references', () => {
  const value = custom();
  const validated = layouts.validate(value);
  assert.deepEqual(validated, value);
  const initial = layouts.fromPreferences({ menuLayout: value, menuShowReport: false });
  value.nodes.find(node => node.id === 'submenu-sharing').name = 'Changed draft';
  value.nodes.reverse();
  assert.equal(validated.nodes.at(-1).name, 'Sharing');
  assert.deepEqual(initial, validated);
  const clone = layouts.clone(validated); clone.nodes[0].visible = false;
  assert.equal(validated.nodes[0].visible, true);
  assert.equal(layouts.clone(null), null);
});

test('three submenu levels and the full eight-menu limit are supported', () => {
  const value = custom();
  value.nodes.push({ id: 'submenu-inner', name: 'Inner', parent: 'submenu-sharing' },
    { id: 'submenu-deep', name: 'Deep', parent: 'submenu-inner' });
  value.nodes.find(node => node.id === 'share').parent = 'submenu-deep';
  for (let index = 0; index < 4; index += 1) value.nodes.push({ id: `submenu-extra-${index}`, name: '界'.repeat(40), parent: 'root' });
  assert.ok(layouts.validate(value));
  value.nodes.push({ id: 'submenu-overflow', name: 'Overflow', parent: 'root' });
  assert.equal(layouts.validate(value), null);
});

test('unknown, duplicate, missing and command-bearing nodes are rejected', () => {
  const mutations = [
    value => value.nodes.push({ id: 'run-script', parent: 'root', visible: true }),
    value => value.nodes.push({ ...value.nodes[0] }),
    value => value.nodes.splice(0, 1),
    value => { value.nodes[0].command = 'javascript:alert(1)'; },
    value => { value.nodes[0].visible = 'false'; },
    value => { value.nodes[0].id = 'future-action'; },
    value => { value.version = 2; },
  ];
  for (const mutate of mutations) { const value = custom(); mutate(value); assert.equal(layouts.validate(value), null); }
});

test('cycles, action parents, orphan groups and excessive submenu depth are rejected', () => {
  const mutations = [
    value => { value.nodes.find(node => node.id === 'submenu-sharing').parent = 'submenu-sharing'; },
    value => { value.nodes.find(node => node.id === 'submenu-sharing').parent = 'report'; },
    value => { value.nodes[0].parent = 'submenu-missing'; },
    value => value.nodes.push({ id: 'submenu-a', name: 'A', parent: 'submenu-b' }, { id: 'submenu-b', name: 'B', parent: 'submenu-a' }),
    value => {
      for (let index = 1; index <= 3; index += 1) value.nodes.push({ id: `submenu-depth-${index}`, name: 'Nested', parent: index === 1 ? 'submenu-sharing' : `submenu-depth-${index - 1}` });
    },
  ];
  for (const mutate of mutations) { const value = custom(); mutate(value); assert.equal(layouts.validate(value), null); }
});

test('submenu names are bounded plain text while supporting non-Latin names and emoji', () => {
  for (const name of ['日本語のメニュー', 'Sharing & saving', 'Videos 🎞️', 'x'.repeat(40)]) {
    const value = custom(); value.nodes.at(-1).name = name; assert.equal(layouts.validate(value).nodes.at(-1).name, name);
  }
  for (const name of ['', ' ', ' padded ', 'x'.repeat(41), '<b>Menu</b>', 'One\nTwo', '\u0000Menu', 'One\u2028Two']) {
    const value = custom(); value.nodes.at(-1).name = name; assert.equal(layouts.validate(value), null);
  }
});

test('non-data objects, sparse arrays and accessor fields cannot run while validating layouts', () => {
  let reads = 0;
  const value = custom();
  Object.defineProperty(value.nodes[0], 'id', { enumerable: true, get() { reads += 1; return 'playNext'; } });
  assert.equal(layouts.validate(value), null);
  assert.equal(reads, 0);
  for (const mutate of [
    next => Object.setPrototypeOf(next.nodes[0], { inherited: true }),
    next => { next.nodes[0] = Object.assign(Object.create(null), next.nodes[0]); },
    next => { delete next.nodes[0]; next.nodes.extra = true; },
    next => { next.nodes[Symbol('extra')] = true; },
    next => { next.nodes[0].constructor = {}; },
  ]) { const next = custom(); mutate(next); assert.equal(layouts.validate(next), null); }
});
