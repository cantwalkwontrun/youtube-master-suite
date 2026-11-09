// Language: en-GB. Serialise first migration without publishing saved values.
export async function initialiseIsolatedStorage({ createAdapter, adapterOptions = {}, locks,
  getLegacyStorage = adapterOptions.getLegacyStorage, timeoutMs = 10000,
  setTimeout: scheduleTimeout = globalThis.setTimeout,
  clearTimeout: cancelTimeout = globalThis.clearTimeout }) {
  const migrationKey = 'yt-master-suite.storage-migration.v1';
  const guardKey = 'yt-master-suite.storage-migration-started.v1';
  const fail = () => { throw new Error('Tampermonkey storage migration could not complete. Existing site settings were left unchanged.'); };
  const { getValue, setValue, addValueChangeListener, removeValueChangeListener } = adapterOptions;
  if ([createAdapter, getValue, setValue, addValueChangeListener, removeValueChangeListener,
    getLegacyStorage].some(value => typeof value !== 'function')) fail();
  function synchronous(value) {
    if (value && typeof value.then === 'function') {
      value.catch?.(() => {});
      fail();
    }
    return value;
  }
  const readSnapshot = () => synchronous(getValue(migrationKey, undefined));
  const openAdapter = () => synchronous(createAdapter({ ...adapterOptions, getLegacyStorage }));
  // A committed private baseline needs neither page storage nor a new lock.
  if (readSnapshot() !== undefined) return openAdapter();
  if (!locks || typeof locks.request !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) fail();

  const controller = new AbortController();
  const timer = scheduleTimeout(() => controller.abort(), timeoutMs);
  function waitForSnapshot() {
    return new Promise((resolve, reject) => {
      let listenerId, settled = false;
      const cleanup = () => {
        controller.signal.removeEventListener('abort', abort);
        if (listenerId !== undefined) {
          const id = listenerId; listenerId = undefined;
          try { removeValueChangeListener(id); } catch { /* Preserve the startup result. */ }
        }
      };
      const finish = error => {
        if (settled) return;
        settled = true; cleanup();
        if (error) reject(error); else resolve();
      };
      const abort = () => {
        try { fail(); } catch (error) { finish(error); }
      };
      const check = () => {
        if (settled) return;
        try { if (readSnapshot() !== undefined) finish(); } catch (error) { finish(error); }
      };
      controller.signal.addEventListener('abort', abort, { once: true });
      try {
        // Register first, then read: a delivery during registration must not be lost.
        listenerId = synchronous(addValueChangeListener(migrationKey, check));
        if (typeof listenerId !== 'number' && typeof listenerId !== 'string') fail();
        if (settled) cleanup();
        else if (controller.signal.aborted) abort();
        else check();
      } catch (error) { finish(error); }
    });
  }
  try {
    const outcome = await locks.request(migrationKey, { mode: 'exclusive', signal: controller.signal }, async () => {
      try {
        if (controller.signal.aborted) fail();
        if (readSnapshot() !== undefined) return { ok: true, value: openAdapter() };
        const legacy = getLegacyStorage();
        if (!legacy || typeof legacy.getItem !== 'function' || typeof legacy.setItem !== 'function') fail();
        if (legacy.getItem(guardKey) === null) {
          // The fixed flag contains no saved data. Never clear it after an ambiguous
          // write: GM readback sees this instance's cache, not a durable write ACK.
          legacy.setItem(guardKey, '1');
          if (legacy.getItem(guardKey) !== '1') fail();
          return { ok: true, value: openAdapter() };
        }
        // A previous writer may have committed while our GM cache was still stale.
        // The lock alone cannot make that cache fresh; wait without migrating again.
        await waitForSnapshot();
        return { ok: true, value: openAdapter() };
      } catch (error) {
        // Firefox can report a rejected lock callback as an uncaught page error
        // even when the request is caught. Propagate only after releasing the lock.
        return { ok: false, error };
      }
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  } finally { cancelTimeout(timer); }
}
