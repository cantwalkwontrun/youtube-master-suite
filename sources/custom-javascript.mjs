// Language: en-GB. User-authored code stays in scoped Tampermonkey storage.
export function createCustomJavascript({ document, window, getValue, setValue, write = callback => callback() }) {
  const key = 'yt-master-suite.custom-javascript.v1';
  const maxLength = 65536;
  const empty = () => ({ enabled: false, code: '' });
  const CompileFunction = window.Function, PageURL = window.URL;
  const resolveResult = Promise.resolve.bind(Promise);
  const subscribers = new Set();
  let status = 'disabled', started = false, timer = null;
  function setStatus(next) {
    if (next === status) return;
    status = next;
    for (const callback of subscribers) {
      try { callback(status); } catch { /* A settings view cannot break execution tracking. */ }
    }
  }
  function recoveryRequested() {
    try { return new PageURL(window.location.href).searchParams.getAll('ytms-custom-js').includes('off'); }
    catch { return true; }
  }
  function read() {
    try {
      const raw = getValue(key, null);
      if (raw === null) return { ok: true, raw, value: empty() };
      if (typeof raw !== 'string' || raw.length > 524288) throw new Error();
      const value = JSON.parse(raw);
      if (!value || Array.isArray(value) || Object.keys(value).length !== 3 || value.version !== 1 ||
          typeof value.enabled !== 'boolean' || typeof value.code !== 'string' || value.code.length > maxLength) throw new Error();
      return { ok: true, raw, value: { enabled: value.enabled, code: value.code } };
    } catch { return { ok: false, error: 'Saved JavaScript is unavailable or incompatible. It has been left unchanged.' }; }
  }
  const initial = read();
  const skipped = recoveryRequested();
  function compile(code) {
    // A global function cannot capture the Suite's lexical scope. User code
    // still has page access and must be treated as fully trusted code.
    return new CompileFunction('"use strict";\n' + code);
  }
  async function save(value, expectedRaw, acknowledged) {
    if (!value || typeof value.enabled !== 'boolean' || typeof value.code !== 'string' || value.code.length > maxLength) {
      return { ok: false, error: 'Enter JavaScript no longer than 65,536 characters.' };
    }
    const checked = { enabled: value.enabled, code: value.code };
    if (checked.enabled) {
      if (!checked.code.trim()) return { ok: false, error: 'Enter JavaScript before enabling it.' };
      if (!acknowledged) return { ok: false, error: 'Acknowledge the risks before enabling this code.' };
      try { compile(checked.code); }
      catch { return { ok: false, error: 'JavaScript could not be compiled. Check its syntax and whether this page allows dynamic scripts.' }; }
    }
    return write(() => {
      let desired;
      try {
        const current = read();
        if (!current.ok) return current;
        if (current.raw !== expectedRaw) return { ok: false, conflict: true, error: 'Saved JavaScript changed in another tab. Copy any edits you want to keep, then choose Reload saved code.' };
        desired = JSON.stringify({ version: 1, ...checked });
        setValue(key, desired);
        if (getValue(key, null) !== desired) throw new Error();
        if (status === 'scheduled' && desired !== initial.raw) stop();
        return { ok: true, raw: desired, value: checked };
      } catch {
        try { if (desired !== undefined && getValue(key, null) === desired) setValue(key, expectedRaw); }
        catch { /* Retain the explicit save failure if protected storage is unavailable. */ }
        return { ok: false, error: 'JavaScript could not be saved. Keep your draft and try again.' };
      }
    });
  }
  function run() {
    timer = null;
    if (status !== 'scheduled') return;
    if (skipped || recoveryRequested()) { setStatus('skipped'); return; }
    const current = read();
    if (!current.ok) { setStatus('unavailable'); return; }
    if (current.raw !== initial.raw) { setStatus('skipped'); return; }
    setStatus('ran');
    try {
      const result = compile(initial.value.code).call(window);
      resolveResult(result).catch(() => { setStatus('failed'); });
    } catch { setStatus('failed'); }
  }
  function ready() {
    if (status !== 'scheduled' || document.readyState === 'loading' || timer !== null) return;
    document.removeEventListener('DOMContentLoaded', ready);
    timer = window.setTimeout(run, 0);
  }
  function stop() {
    document.removeEventListener('DOMContentLoaded', ready);
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (status === 'scheduled') setStatus('skipped');
  }
  function start() {
    if (started) return;
    started = true;
    if (!initial.ok) { setStatus('unavailable'); return; }
    if (skipped) { setStatus('skipped'); return; }
    if (!initial.value.enabled || !initial.value.code.trim()) return;
    setStatus('scheduled');
    window.addEventListener('pagehide', stop, { once: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();
  }
  return Object.freeze({ key, maxLength, read, save, start,
    subscribe(callback) {
      if (typeof callback !== 'function') throw new TypeError('Expected a status callback.');
      subscribers.add(callback); return () => subscribers.delete(callback);
    },
    get status() { return status; } });
}
