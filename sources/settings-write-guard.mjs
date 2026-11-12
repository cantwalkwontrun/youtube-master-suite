// Language: en-GB. Serialise saves and detect a stale Tampermonkey cache.
export function createSettingsWriteGuard({ locks, getCoordinationStorage, getValue, setValue, getMainRecord, newRevision,
  key = 'yt-master-suite.settings-write.v1' }) {
  const conflict = () => ({ ok: false, conflict: true,
    error: 'Saved settings are still synchronising or changed in another tab. Keep your draft and try again.' });
  let recoveryReceipt = null;
  try {
    // After clearing site data, a newly opened tab can re-establish the opaque
    // marker from its initial protected receipt. Existing tabs cannot do this.
    if (getCoordinationStorage().getItem(key) === null) recoveryReceipt = getValue(key, null);
  } catch { /* The settings remain readable if coordination storage is unavailable. */ }
  return async function writeSettings(write, coordinate = callback => callback()) {
    if (typeof locks?.request !== 'function') {
      return { ok: false, error: 'This browser cannot coordinate safe settings saves. Your draft is still open.' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      return await locks.request(key, { signal: controller.signal }, () => coordinate(() => {
        let coordination, revision, rawReceipt, before, next;
        const restoreRevision = () => {
          if (coordination.getItem(key) !== next) return false;
          if (revision === null) coordination.removeItem(key);
          else coordination.setItem(key, revision);
          return true;
        };
        try {
          coordination = getCoordinationStorage();
          revision = coordination.getItem(key);
          rawReceipt = getValue(key, null);
          const committed = JSON.parse(rawReceipt);
          before = getMainRecord();
          if (revision === null && committed && committed.value === before && rawReceipt === recoveryReceipt) {
            coordination.setItem(key, committed.revision);
            revision = coordination.getItem(key);
          }
          recoveryReceipt = null;
          if (revision !== (committed?.revision ?? null) || (committed && committed.value !== before)) return conflict();

          // Publish only an opaque revision before writing. A stale cache cannot
          // pass until both its private receipt and its actual record agree.
          next = newRevision();
          coordination.setItem(key, next);
          if (coordination.getItem(key) !== next) return conflict();
          const result = write();
          const after = getMainRecord();
          if (after === before) {
            if (!restoreRevision()) return conflict();
          } else {
            const receipt = JSON.stringify({ revision: next, value: after });
            setValue(key, receipt);
            if (getValue(key, null) !== receipt) return conflict();
          }
          return result;
        } catch {
          // Release only our own failed reservation when neither the protected
          // record nor its receipt changed. Ambiguous partial writes stay blocked.
          try {
            if (next !== undefined && getMainRecord() === before && getValue(key, null) === rawReceipt) restoreRevision();
          } catch { /* Preserve the failure when storage cannot be inspected safely. */ }
          return { ok: false, error: 'Settings could not be confirmed in protected storage. Keep your draft and review the saved settings before retrying.' };
        }
      }));
    } catch { return conflict(); }
    finally { clearTimeout(timer); }
  };
}
