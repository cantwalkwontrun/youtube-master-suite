// Language: en-GB. Synthetic events only; private storage must not use page events.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayheadMarker } from '../sources/playhead-marker.mjs';
import { createSettingsExtraControls } from '../sources/settings-extra-controls.mjs';

const markerKey = 'yt-master-suite.playhead-image.v1';

class BrowserEventTarget extends EventTarget {
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, typeof options === 'boolean' ? { capture: options } : options);
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, typeof options === 'boolean' ? { capture: options } : options);
  }
}

function markerHarness(privateStorage = true) {
  const window = Object.assign(new BrowserEventTarget(), {
    MutationObserver: class { observe() {} disconnect() {} },
    location: { pathname: '/watch' },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    atob, btoa,
  });
  const document = new BrowserEventTarget(), subscribers = new Set();
  let reads = 0;
  const marker = createPlayheadMarker({ document, window,
    getStorage: () => ({ getItem() { reads++; return null; } }),
    ...(privateStorage ? { subscribeStorage(handler) {
      subscribers.add(handler); return () => subscribers.delete(handler);
    } } : {}),
  });
  return { marker, window, subscribers, reads: () => reads };
}

function storageEvent(key) {
  return Object.assign(new Event('storage'), { key, newValue: null });
}

test('marker consumes private changes, ignores page storage events and unsubscribes on disposal', () => {
  const h = markerHarness();
  let publicEvents = 0;
  h.window.addEventListener('storage', () => { publicEvents++; });
  h.marker.start(); h.marker.start();
  assert.equal(h.reads(), 1);
  assert.equal(h.subscribers.size, 1, 'starting twice does not register duplicate subscriptions');
  h.window.dispatchEvent(storageEvent(markerKey));
  assert.equal(h.reads(), 1, 'page events cannot trigger the private storage path');
  const [changed] = h.subscribers;
  changed({ key: 'unrelated', newValue: null });
  assert.equal(h.reads(), 1);
  changed({ key: markerKey, newValue: null });
  changed({ key: null, newValue: null });
  assert.equal(h.reads(), 3);
  assert.equal(publicEvents, 1, 'private updates emit no page-visible storage event');
  h.marker.dispose();
  assert.equal(h.subscribers.size, 0);
  h.window.dispatchEvent(new Event('pageshow'));
  assert.equal(h.reads(), 3);
});

test('standalone marker retains native storage notifications without a private adapter', () => {
  const h = markerHarness(false);
  h.marker.start();
  assert.equal(h.reads(), 1);
  h.window.dispatchEvent(storageEvent(markerKey));
  assert.equal(h.reads(), 2);
  h.marker.dispose();
  h.window.dispatchEvent(storageEvent(markerKey));
  assert.equal(h.reads(), 2);
});

function controlsHarness(privateStorage) {
  const nodes = new Map(), subscribers = new Set(), window = new BrowserEventTarget();
  class Node extends BrowserEventTarget {
    constructor() { super(); this.classList = { add() {} }; this.value = ''; }
    set id(value) { this.name = value; nodes.set(value, this); }
    get id() { return this.name; }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    append() {}
  }
  const document = { createElement: () => new Node() };
  for (const id of ['ytms-section-player', 'ytms-section-credits']) {
    const node = new Node(); node.id = id;
  }
  let reads = 0, cancels = 0, source = 'https://first.invalid/release-manifest.json';
  const suite = {
    playheadMarker: { defaultSize: 24, read: () => ({ ok: true, value: null }) },
    updates: {
      key: 'yt-master-suite.update-source.v1',
      readSource() { reads++; return { ok: true, url: source }; },
      cancel() { cancels++; },
    },
    ...(privateStorage ? { storage: { subscribe(handler) {
      subscribers.add(handler); return () => subscribers.delete(handler);
    } } } : {}),
  };
  const controls = createSettingsExtraControls(document, window, suite, {
    querySelector: selector => nodes.get(selector.slice(1)),
  });
  return { controls, window, nodes, subscribers, key: suite.updates.key,
    reads: () => reads, cancels: () => cancels, changeSource: value => { source = value; } };
}

test('update controls privately reconcile sources and release their subscription on close', () => {
  const h = controlsHarness(true);
  h.controls.open(); h.controls.open();
  assert.equal(h.subscribers.size, 1);
  const reads = h.reads(), cancels = h.cancels();
  h.window.dispatchEvent(storageEvent(h.key));
  assert.equal(h.reads(), reads, 'page storage events cannot affect isolated update checks');
  h.changeSource('https://second.invalid/release-manifest.json');
  const [changed] = h.subscribers;
  changed({ key: h.key, newValue: null });
  assert.equal(h.nodes.get('ytms-updates-source').value, 'https://second.invalid/release-manifest.json');
  assert.equal(h.cancels(), cancels + 1);
  h.nodes.get('ytms-updates-source').value = 'https://draft.invalid/release-manifest.json';
  h.changeSource('https://third.invalid/release-manifest.json');
  changed({ key: h.key, newValue: null });
  assert.equal(h.nodes.get('ytms-updates-source').value, 'https://draft.invalid/release-manifest.json');
  h.controls.close();
  assert.equal(h.subscribers.size, 0);
});

test('update control factory retains native notifications when used without a private adapter', () => {
  const h = controlsHarness(false);
  h.controls.open();
  assert.equal(h.reads(), 1);
  h.window.dispatchEvent(storageEvent(h.key));
  assert.equal(h.reads(), 2);
  h.controls.close();
  h.window.dispatchEvent(storageEvent(h.key));
  assert.equal(h.reads(), 2);
});
