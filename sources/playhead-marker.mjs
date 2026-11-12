// Language: en-GB. Self-contained factory embedded in the userscript.
// User images remain in local browser storage and are never fetched from a URL.
export function createPlayheadMarker({ document, window, getStorage, subscribeStorage }) {
  const key = 'yt-master-suite.playhead-image.v1';
  const defaultSize = 24, maxFileBytes = 2 * 1024 * 1024, maxDataLength = 40000;
  const markerAttribute = 'data-ytms-playhead-marker';
  const markerClass = 'ytms-playhead-marker';
  const styleId = 'ytms-playhead-marker-style';
  const selector = '[id="movie_player"], video, .ytp-scrubber-container, .ytp-scrubber-button';
  let started = false, disposed = false, navigationPending = false, pageSuspended = false, frame = 0;
  let current = null, record = null, style = null, unrenderableData = null;
  let discoveryTimer = 0, discoveryExpired = false;
  const playbackPage = () => window.location.pathname === '/watch' || /^\/live\/[^/]+\/?$/.test(window.location.pathname);
  const failure = error => ({ ok: false, error });
  function validSize(value) { return Number.isInteger(value) && value >= 16 && value <= 40; }
  function pngDimensions(bytes) {
    if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) ||
        String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13) return null;
    return { width: view.getUint32(16), height: view.getUint32(20), type: 'image/png' };
  }
  function fileDimensions(bytes) {
    const png = pngDimensions(bytes);
    if (png) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset), end = offset + 12 + length;
        if (end > bytes.length) return null;
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        if (type === 'acTL') return null;
        if (type === 'IEND') return end === bytes.length ? png : null;
        offset = end;
      }
      return null;
    }
    if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 3 < bytes.length) {
        if (bytes[offset++] !== 0xff) return null;
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0xd9 || marker === 0xda) return null;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
        if (offset + 2 > bytes.length) return null;
        const length = bytes[offset] * 256 + bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length) return null;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          if (length < 8) return null;
          return { width: bytes[offset + 5] * 256 + bytes[offset + 6],
            height: bytes[offset + 3] * 256 + bytes[offset + 4], type: 'image/jpeg' };
        }
        offset += length;
      }
    }
    const text = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
    if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(4, true) + 8 > bytes.length) return null;
      const u24 = offset => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
      let offset = 12;
      while (offset + 8 <= bytes.length) {
        const type = text(offset, 4), length = view.getUint32(offset + 4, true), data = offset + 8;
        if (data + length > bytes.length) return null;
        if (type === 'VP8X' && length >= 10) {
          if (bytes[data] & 2) return null; // Keep the marker static.
          return { width: u24(data + 4) + 1, height: u24(data + 7) + 1, type: 'image/webp' };
        }
        if (type === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
          const bits = view.getUint32(data + 1, true);
          return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, type: 'image/webp' };
        }
        if (type === 'VP8 ' && length >= 10 && text(data + 3, 3) === '\u009d\u0001*') {
          return { width: view.getUint16(data + 6, true) & 0x3fff,
            height: view.getUint16(data + 8, true) & 0x3fff, type: 'image/webp' };
        }
        offset = data + length + (length % 2);
      }
    }
    return null;
  }
  function normalisePngDataUrl(value) {
    if (typeof value !== 'string' || value.length > maxDataLength ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    try {
      const binary = window.atob(value.slice(22));
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const dimensions = pngDimensions(bytes);
      if (!dimensions || !dimensions.width || !dimensions.height || dimensions.width > 64 || dimensions.height > 64) return null;
      const view = new DataView(bytes.buffer), parts = [bytes.subarray(0, 8)];
      let offset = 8, ended = false, hasImage = false;
      while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset), end = offset + length + 12;
        if (end > bytes.length) return null;
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        if (['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(type)) parts.push(bytes.subarray(offset, end));
        else if (type[0] === type[0].toUpperCase()) return null;
        if (type === 'IDAT') hasImage = true;
        offset = end;
        if (type === 'IEND') { ended = true; break; }
      }
      if (!ended || !hasImage || offset !== bytes.length) return null;
      // Canvas PNG writers can add ancillary debug/resolution chunks. Retain
      // encoded pixels and transparency only, never original image metadata.
      const encoded = parts.map(part => String.fromCharCode(...part)).join('');
      return `data:image/png;base64,${window.btoa(encoded)}`;
    } catch { return null; }
  }
  function validDataUrl(value) { return typeof value === 'string' && normalisePngDataUrl(value) === value; }
  function checkedValue(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(name => name !== 'dataUrl' && name !== 'size') ||
        !validDataUrl(value.dataUrl) || !validSize(value.size)) return null;
    return { dataUrl: value.dataUrl, size: value.size };
  }
  function parse(raw) {
    if (raw === null) return { ok: true, value: null };
    if (typeof raw !== 'string' || raw.length > maxDataLength + 100) return failure('Saved marker data is incompatible or damaged. Nothing was overwritten.');
    try {
      const stored = JSON.parse(raw);
      if (!stored || typeof stored !== 'object' || Array.isArray(stored) || stored.version !== 1 ||
          Object.keys(stored).some(name => !['version', 'dataUrl', 'size'].includes(name))) throw new Error();
      const value = checkedValue({ dataUrl: stored.dataUrl, size: stored.size });
      if (!value) throw new Error();
      return { ok: true, value };
    } catch { return failure('Saved marker data is incompatible or damaged. Nothing was overwritten.'); }
  }
  function read() {
    try { return parse(getStorage().getItem(key)); }
    catch { return failure('The marker could not be read. Browser storage is unavailable.'); }
  }
  async function prepareFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function' || !Number.isInteger(file.size) || file.size <= 0 || file.size > maxFileBytes) {
      return failure('Choose a PNG, JPEG or WebP image no larger than 2 MB.');
    }
    let bitmap;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length || bytes.length !== file.size || bytes.length > maxFileBytes) return failure('The image could not be read.');
      const dimensions = fileDimensions(bytes);
      if (!dimensions || !dimensions.width || !dimensions.height || dimensions.width > 4096 || dimensions.height > 4096 ||
          (file.type && file.type !== dimensions.type)) return failure('Choose a static PNG, JPEG or WebP image no larger than 4096 × 4096 pixels.');
      if (typeof window.createImageBitmap !== 'function') return failure('This browser cannot prepare marker images.');
      bitmap = await window.createImageBitmap(new window.Blob([bytes], { type: dimensions.type }));
      if (!bitmap.width || !bitmap.height || bitmap.width > 4096 || bitmap.height > 4096) return failure('The image dimensions are unsupported.');
      const factor = Math.min(1, 64 / bitmap.width, 64 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * factor));
      canvas.height = Math.max(1, Math.round(bitmap.height * factor));
      const context = canvas.getContext('2d');
      if (!context) return failure('This browser cannot prepare marker images.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = normalisePngDataUrl(canvas.toDataURL('image/png'));
      if (!dataUrl) return failure('The prepared image is too large or unsupported.');
      return { ok: true, value: { dataUrl, size: defaultSize } };
    } catch { return failure('The image could not be decoded. Choose a different PNG, JPEG or WebP file.'); }
    finally { bitmap?.close?.(); }
  }
  function save(value) {
    const checked = checkedValue(value);
    if (!checked) return failure('Choose a valid image and a marker size from 16 to 40 pixels.');
    try {
      const storage = getStorage(), existing = parse(storage.getItem(key));
      if (!existing.ok) return existing;
      storage.setItem(key, JSON.stringify({ version: 1, ...checked }));
      current = checked; unrenderableData = null; reconcileRuntime();
      return { ok: true, value: { ...checked } };
    } catch { return failure('The marker could not be saved. Browser storage is unavailable or full.'); }
  }
  function remove() {
    try {
      const storage = getStorage(), existing = parse(storage.getItem(key));
      if (!existing.ok) return existing;
      storage.removeItem(key); current = null; unrenderableData = null; reconcileRuntime();
      return { ok: true, value: null };
    } catch { return failure('The marker could not be removed. Browser storage is unavailable.'); }
  }
  function visible(node) {
    if (!node?.isConnected || node.closest('[hidden], [inert], [aria-hidden="true"]') || !node.getClientRects().length) return false;
    for (let current = node; current; current = current.parentElement) {
      const computed = window.getComputedStyle(current);
      if (computed.display === 'none' || (current === node && ['hidden','collapse'].includes(computed.visibility)) || Number(computed.opacity) === 0) return false;
    }
    return true;
  }
  function clearMarker() {
    if (!record) return;
    if (record.container.getAttribute(markerAttribute) === '1') record.container.removeAttribute(markerAttribute);
    record.image.remove(); record = null;
  }
  function ensureStyle() {
    if (style?.isConnected) return;
    style = document.createElement('style'); style.id = styleId;
    style.textContent = `[${markerAttribute}="1"] > .ytp-scrubber-button { opacity:0 !important; }
      .${markerClass} { position:absolute !important; left:50% !important; top:50% !important;
        transform:translate(-50%,-50%) !important; pointer-events:none !important;
        object-fit:contain !important; max-width:none !important; max-height:none !important;
        padding:0 !important; margin:0 !important; border:0 !important; user-select:none !important; }`;
    (document.head || document.documentElement).append(style);
  }
  const treeObserver = new window.MutationObserver(records => {
    if (records.some(change => [...change.addedNodes, ...change.removedNodes].some(node =>
      (record?.image === node && node.parentElement !== record.container) ||
      (node.nodeType === 1 && !node.classList.contains(markerClass) &&
      (node.matches(selector) || node.querySelector(selector)))))) schedule();
  });
  const structureObserver = new window.MutationObserver(() => schedule());
  const discoveryObserver = new window.MutationObserver(records => {
    if (records.some(change => [...change.addedNodes].some(node => node.nodeType === 1 &&
        (node.matches('[id="movie_player"]') || node.querySelector('[id="movie_player"]'))))) schedule();
  });
  const attributeObserver = new window.MutationObserver(() => schedule());
  function stopDiscovery() {
    discoveryObserver.disconnect();
    if (discoveryTimer) window.clearTimeout(discoveryTimer);
    discoveryTimer = 0;
  }
  function disconnectObservers() {
    treeObserver.disconnect(); structureObserver.disconnect(); attributeObserver.disconnect(); stopDiscovery();
  }
  function observePlayers(candidates, containers) {
    treeObserver.disconnect(); structureObserver.disconnect(); attributeObserver.disconnect();
    const observed = new Set();
    const attributes = { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'inert'] };
    for (const candidate of candidates.slice(0, 8)) {
      treeObserver.observe(candidate, { childList: true, subtree: true });
      for (let ancestor = candidate; ancestor; ancestor = ancestor.parentElement) {
        if (observed.has(ancestor)) continue;
        structureObserver.observe(ancestor, { childList: true });
        attributeObserver.observe(ancestor, attributes);
        observed.add(ancestor);
      }
    }
    for (const container of containers) {
      for (let ancestor = container; ancestor && !observed.has(ancestor); ancestor = ancestor.parentElement) {
        // The scrubber's own inline styles move on every playback tick.
        attributeObserver.observe(ancestor, ancestor === container
          ? { ...attributes, attributeFilter: ['class', 'hidden', 'aria-hidden', 'inert'] } : attributes);
        observed.add(ancestor);
      }
    }
    if (candidates.length) { stopDiscovery(); discoveryExpired = false; return; }
    // While YouTube is building a watch page, follow its structural containers
    // directly. Comment and feed descendants are never observed in steady state.
    for (const root of document.querySelectorAll('html, body, ytd-app, ytd-page-manager, ytd-watch-flexy, #columns, #primary, #primary-inner, #player, #single-column-container')) {
      structureObserver.observe(root, { childList: true });
    }
    if (!discoveryExpired && !discoveryTimer && document.documentElement) {
      discoveryObserver.observe(document.documentElement, { childList: true, subtree: true });
      discoveryTimer = window.setTimeout(() => {
        discoveryObserver.disconnect(); discoveryTimer = 0; discoveryExpired = true;
      }, 10000);
    }
  }
  function sync() {
    frame = 0;
    if (!started || disposed || pageSuspended || navigationPending || document.hidden || !playbackPage() ||
        !current || unrenderableData === current.dataUrl) { disconnectObservers(); clearMarker(); return; }
    const candidates = [...document.querySelectorAll('[id="movie_player"]')];
    const players = candidates.filter(player => visible(player) && !player.closest('ytd-miniplayer, ytd-video-preview, ytd-reel-video-renderer'));
    const scrubbers = players.length === 1 ? [...players[0].querySelectorAll('.ytp-scrubber-container')] : [];
    observePlayers(candidates, scrubbers);
    if (players.length !== 1) { clearMarker(); return; }
    const player = players[0];
    const containers = scrubbers.filter(visible);
    if (player.matches('.ad-showing, .ad-interrupting') || !player.querySelector('video') || containers.length !== 1) { clearMarker(); return; }
    const container = containers[0], buttons = container.querySelectorAll(':scope > .ytp-scrubber-button');
    if (buttons.length !== 1 || !container.offsetWidth || !container.offsetHeight ||
        !container.closest('.ytp-progress-bar, .ytp-progress-bar-container')) { clearMarker(); return; }
    if (record?.container === container && record.dataUrl === current.dataUrl && record.image.parentElement === container) {
      if (record.image.width !== current.size) {
        record.image.width = record.image.height = current.size;
        record.image.style.setProperty('width', `${current.size}px`, 'important');
        record.image.style.setProperty('height', `${current.size}px`, 'important');
      }
      return;
    }
    clearMarker(); ensureStyle();
    const image = document.createElement('img'); image.className = markerClass;
    image.alt = ''; image.setAttribute('aria-hidden', 'true'); image.draggable = false;
    image.width = image.height = current.size;
    image.style.setProperty('width', `${current.size}px`, 'important');
    image.style.setProperty('height', `${current.size}px`, 'important');
    record = { player, container, image, dataUrl: current.dataUrl };
    const thisRecord = record;
    image.addEventListener('load', () => {
      if (record === thisRecord && image.isConnected && current?.dataUrl === thisRecord.dataUrl) {
        container.setAttribute(markerAttribute, '1');
      }
    }, { once: true });
    image.addEventListener('error', () => {
      if (record !== thisRecord) return;
      unrenderableData = thisRecord.dataUrl; clearMarker();
    }, { once: true });
    image.src = current.dataUrl; container.append(image);
  }
  function schedule() { if (started && !disposed && !pageSuspended && !navigationPending && !document.hidden && !frame) frame = window.requestAnimationFrame(sync); }
  function reconcileRuntime() {
    if (!started || disposed) return;
    const shouldObserve = !!current && !!document.documentElement && playbackPage() && !navigationPending && !pageSuspended && !document.hidden;
    if (!shouldObserve) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      disconnectObservers();
      clearMarker(); style?.remove(); style = null;
    }
    schedule();
  }
  function reload() { const saved = read(); current = saved.ok ? saved.value : null; unrenderableData = null; discoveryExpired = false; reconcileRuntime(); }
  function storage(event) { if (event.key === key || event.key === null) reload(); }
  function navigateStart() { navigationPending = true; reconcileRuntime(); }
  function navigateFinish() { navigationPending = false; reload(); }
  function pageHide() { pageSuspended = true; reconcileRuntime(); }
  function pageShow() {
    const restoring = pageSuspended; pageSuspended = false;
    if (restoring) navigationPending = false;
    reload();
  }
  function visibility() {
    if (document.hidden) { disconnectObservers(); clearMarker(); }
    else { discoveryExpired = false; schedule(); }
  }
  function pageData() { discoveryExpired = false; schedule(); }
  const listeners = [];
  let unsubscribeStorage = null;
  function listen(target, type, handler) { target.addEventListener(type, handler, true); listeners.push([target, type, handler]); }
  function start() {
    if (started || disposed) return;
    started = true;
    if (subscribeStorage) unsubscribeStorage = subscribeStorage(storage);
    else listen(window, 'storage', storage);
    listen(window, 'yt-navigate-start', navigateStart); listen(window, 'pagehide', pageHide);
    listen(window, 'yt-navigate-finish', navigateFinish); listen(window, 'pageshow', pageShow);
    listen(window, 'yt-page-data-updated', pageData);
    listen(document, 'DOMContentLoaded', reload);
    listen(document, 'visibilitychange', visibility);
    reload();
  }
  function dispose() {
    disposed = true; started = false;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; disconnectObservers(); clearMarker(); style?.remove(); style = null;
    unsubscribeStorage?.(); unsubscribeStorage = null;
    for (const [target, event, handler] of listeners) target.removeEventListener(event, handler, true);
    listeners.length = 0;
  }
  return Object.freeze({ key, defaultSize, read, prepareFile, save, remove, start, dispose });
}
