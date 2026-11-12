// Language: en-GB. Test-only GM storage: context-owned memory, never origin storage.
const keys = [
  'yt-master-suite.settings.v1', 'yt-master-suite.channel-age.v1',
  'yt-master-suite.scroll-miniplayer.corner.v1', 'yt-master-suite.playhead-image.v1',
  'yt-master-suite.update-source.v1',
];
const migrationKey = 'yt-master-suite.storage-migration.v1';

function bootstrap({ keys, migrationKey }) {
  window.GM_info = { isIncognito: false, sandboxMode: 'raw', scriptHandler: 'Tampermonkey' };
  let values = new Map();
  const listeners = new Map(), pending = new Set(), failedWrites = new Set();
  let sequence = 0, audit = null;
  const notify = (key, oldValue, newValue, remote) => {
    if (oldValue === newValue) return;
    for (const listener of listeners.values()) if (listener.key === key) listener.callback(key, oldValue, newValue, remote);
  };
  window.__ytmsFixtureReceiveGM = ({ key, value }) => {
    const oldValue = values.get(key); values.set(key, value);
    notify(key, oldValue, value, true);
  };
  window.GM_getValue = (key, fallback) => { if (audit?.key === key) audit.reads++; return values.has(key) ? values.get(key) : fallback; };
  window.GM_setValue = (key, value) => {
    if (audit?.key === key) audit.writes++;
    if (failedWrites.has(key)) throw new DOMException('Synthetic protected-storage failure', 'QuotaExceededError');
    const oldValue = values.get(key); values.set(key, value);
    const write = window.__ytmsFixtureGM({ kind: 'write', key, value });
    pending.add(write); write.then(() => pending.delete(write), () => {});
    notify(key, oldValue, value, false);
  };
  window.GM_addValueChangeListener = (key, callback) => { const id = ++sequence; listeners.set(id, { key, callback }); return id; };
  window.GM_removeValueChangeListener = id => listeners.delete(id);
  const getItem = key => {
    if (values.has(key)) return values.get(key);
    try { return JSON.parse(values.get(migrationKey) || 'null')?.values?.[key] ?? null; }
    catch { return null; }
  };
  window.fixtureGMStorage = Object.freeze({
    getItem,
    setItem: (key, value) => window.GM_setValue(key, String(value)),
    removeItem: key => window.GM_setValue(key, null),
    clear: () => keys.forEach(key => window.GM_setValue(key, null)),
    snapshot: () => Object.fromEntries(keys.map(key => [key, getItem(key)]).filter(([, value]) => value !== null)),
    failWrites: (key, enabled = true) => enabled ? failedWrites.add(key) : failedWrites.delete(key),
    startAudit: key => { audit = { key, reads: 0, writes: 0 }; },
    finishAudit: () => { const result = { reads: audit?.reads || 0, writes: audit?.writes || 0 }; audit = null; return result; },
    flush: async () => { await window.__ytmsFixtureGMReady; while (pending.size) await Promise.all([...pending]); },
  });
  Object.defineProperty(window, 'fixtureStorage', { get: () => window.__ytmsFixtureUsesGM ? window.fixtureGMStorage : window.localStorage });
  window.fixtureStorageSnapshot = () => window.__ytmsFixtureUsesGM ? window.fixtureGMStorage.snapshot() : { ...window.localStorage };
  window.__ytmsFixtureGMReady = window.__ytmsFixtureGM({ kind: 'snapshot' }).then(entries => { values = new Map(entries); });
}

const isSuite = source => typeof source === 'string' && source.includes('// @name         YouTube Master Suite');
export const wrapFixtureUserscript = source => isSuite(source) && !source.includes('window.__ytmsFixtureGMReady.then(() => {')
  ? `if (window.top === window) window.__ytmsFixtureGMReady.then(() => {\nwindow.__ytmsFixtureUsesGM = true;\n${source}\n});`
  : source;
const wrapScript = script => typeof script === 'string' ? wrapFixtureUserscript(script)
  : script?.content ? { ...script, content: wrapFixtureUserscript(script.content) } : script;

export function installFixtureGMStorage(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await newContext(options), values = new Map(), nativeEvaluate = new WeakMap();
    let serial = Promise.resolve(), hasSuite = false;
    await context.exposeBinding('__ytmsFixtureGM', ({ page }, request) => {
      const operation = serial.then(async () => {
        if (request.kind === 'snapshot') return [...values];
        if (request.kind !== 'write' || ![...keys, migrationKey, 'yt-master-suite.settings-write.v1', 'yt-master-suite.corner-write.v1', 'yt-master-suite.channel-filters-write.v1', 'yt-master-suite.marker-write.v1', 'yt-master-suite.update-source-write.v1', 'yt-master-suite.custom-javascript.v1', 'yt-master-suite.custom-javascript-write.v1'].includes(request.key) ||
            !(request.value === null || typeof request.value === 'string')) throw new Error('Invalid synthetic GM operation');
        values.set(request.key, request.value);
        await Promise.all(context.pages().filter(other => other !== page && !other.isClosed()).map(async other => {
          try { await nativeEvaluate.get(other)(change => window.__ytmsFixtureReceiveGM?.(change), { key: request.key, value: request.value }); }
          catch (error) { if (!other.isClosed() && !/Execution context was destroyed/.test(error.message)) throw error; }
        }));
      });
      serial = operation.catch(() => {});
      return operation;
    });
    const addInitScript = context.addInitScript.bind(context);
    await addInitScript(bootstrap, { keys, migrationKey });
    context.addInitScript = (script, argument) => {
      if (isSuite(typeof script === 'string' ? script : script?.content)) hasSuite = true;
      return addInitScript(wrapScript(script), argument);
    };
    context.on('page', page => {
      const addScriptTag = page.addScriptTag.bind(page), evaluate = page.evaluate.bind(page);
      nativeEvaluate.set(page, evaluate);
      page.addScriptTag = script => {
        if (isSuite(script?.content)) hasSuite = true;
        return addScriptTag(wrapScript(script));
      };
      page.evaluate = async (callback, argument) => {
        const result = await evaluate(callback, argument);
        if (hasSuite && !page.isClosed()) await evaluate(() => window.fixtureGMStorage?.flush());
        return result;
      };
    });
    return context;
  };
  return browser;
}
