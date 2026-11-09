// Language: en-GB. Self-contained update metadata reader; embedded by the builder.
// The configured source stays in this browser profile. No script is downloaded
// or executed here; installation is a separate, explicit browser action.
export function createSuiteUpdates({
  getStorage,
  fetch: fetchRequest = globalThis.fetch?.bind(globalThis),
  installedVersion,
  defaultSourceUrl = '',
  setTimeout: startTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: stopTimer = timer => globalThis.clearTimeout(timer),
  AbortController: AbortControllerType = globalThis.AbortController,
  now = () => Date.now(),
  timeoutMs = 10000,
} = {}) {
  const key = 'yt-master-suite.update-source.v1';
  const scriptName = 'youtube-master-suite.user.js';
  const manifestName = 'release-manifest.json';
  const sourceLimit = 2048;
  const scriptLimit = 8 * 1024 * 1024;
  const checkLifetime = 10 * 60 * 1000;
  const deadlineMs = Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000 ? timeoutMs : 10000;
  let active = null;
  let results = new WeakMap();

  function failure(error, extra = {}) { return { ok: false, error, ...extra }; }
  function fail(message) { throw new Error(message); }
  function versionParts(value) {
    if (typeof value !== 'string' || value.length > 64 || !/^\d+(?:\.\d+){1,7}$/.test(value)) return null;
    const parts = value.split('.').map(Number);
    return parts.every(part => Number.isSafeInteger(part) && part >= 0) ? parts : null;
  }
  function compareVersions(left, right) {
    const a = versionParts(left), b = versionParts(right);
    if (!a || !b) fail('The update source contains an unsupported version.');
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
    }
    return 0;
  }
  function cleanUrl(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > sourceLimit) return null;
    try {
      const input = value.trim();
      if (/[\u0000-\u0020\u007f?#]/.test(input) || /^https:\/\/[^/]*@/i.test(input)) return null;
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
      return url;
    } catch { return null; }
  }
  function sourceDetails(value) {
    const url = cleanUrl(value);
    if (!url) return null;
    if (url.hostname === 'github.com' && !url.port) {
      const path = url.pathname.match(/^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})\/releases(?:\/latest)?\/?$/);
      if (!path || path[2] === '.' || path[2] === '..') return null;
      const [, owner, repository] = path;
      return { type: 'github', url: `https://github.com/${owner}/${repository}/releases/latest`, owner, repository,
        requestUrl: `https://api.github.com/repos/${owner}/${repository}/releases/latest` };
    }
    if (!url.pathname.endsWith(`/${manifestName}`)) return null;
    return { type: 'manifest', url: url.href, requestUrl: url.href };
  }
  const defaultSource = sourceDetails(defaultSourceUrl);
  function readRecord() {
    const raw = getStorage().getItem(key);
    if (raw === null) return { raw, url: defaultSource?.url || '', details: defaultSource };
    if (typeof raw !== 'string' || raw.length > sourceLimit + 100) fail('The saved update source is incompatible or damaged. It was left unchanged.');
    let record;
    try { record = JSON.parse(raw); } catch { fail('The saved update source is incompatible or damaged. It was left unchanged.'); }
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.keys(record).length !== 2 || !Object.hasOwn(record, 'version') || !Object.hasOwn(record, 'url') || record.version !== 1) {
      fail('The saved update source is incompatible or damaged. It was left unchanged.');
    }
    const details = sourceDetails(record.url);
    if (!details || details.url !== record.url) fail('The saved update source is incompatible or damaged. It was left unchanged.');
    return { raw, url: details.url, details };
  }
  function readSource() {
    try { const record = readRecord(); return { ok: true, url: record.url }; }
    catch { return failure('The saved update source is unavailable, incompatible or damaged. It was left unchanged.', { url: '' }); }
  }
  function cancel() {
    results = new WeakMap();
    const previous = active;
    active = null;
    if (previous) {
      previous.cancelled = true;
      previous.controller?.abort();
      previous.rejectCancel?.(new Error('cancelled'));
    }
  }
  function saveSource(value) {
    cancel();
    const empty = typeof value === 'string' && !value.trim();
    const details = empty ? null : sourceDetails(value);
    if (!empty && !details) return failure('Use a public GitHub Releases URL or an HTTPS release-manifest.json URL without credentials, query parameters or a fragment.');
    let storage, previous, desired;
    let attempted = false;
    try {
      storage = getStorage();
      previous = readRecord().raw;
      desired = details ? JSON.stringify({ version: 1, url: details.url }) : null;
      if (storage.getItem(key) !== previous) return failure('The saved update source changed. Review it and try again.', { conflict: true });
      if (desired !== previous) {
        attempted = true;
        if (desired === null) storage.removeItem(key);
        else storage.setItem(key, desired);
      }
      if (storage.getItem(key) !== desired) fail('Update source was not retained');
      return { ok: true, url: details?.url || defaultSource?.url || '' };
    } catch {
      // Only recover this operation's own partial value; a newer source wins.
      if (attempted) try {
        if (storage.getItem(key) === desired) {
          if (previous === null) storage.removeItem(key);
          else storage.setItem(key, previous);
        }
      } catch { /* The error remains explicit when browser storage is unavailable. */ }
      return failure('The update source could not be saved. Existing incompatible data was not replaced; browser storage may be unavailable.');
    }
  }
  async function readJson(response, limit) {
    const length = response.headers?.get?.('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > limit)) fail('The update response is too large.');
    if (!response.body?.getReader) fail('The update source returned no readable metadata.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, text = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) fail('The update source returned unreadable metadata.');
        bytes += chunk.value.byteLength;
        if (bytes > limit) fail('The update response is too large.');
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      try { return JSON.parse(text); }
      catch { fail('The update source returned invalid JSON metadata.'); }
    } catch (error) {
      try { await reader.cancel(); } catch { /* The request may already be closed. */ }
      throw error;
    } finally { try { reader.releaseLock(); } catch { /* Already released by a failed response. */ } }
  }
  function scriptSize(value) { return Number.isSafeInteger(value) && value > 0 && value <= scriptLimit; }
  function checkedManifest(record, source) {
    const fields = ['schemaVersion', 'name', 'version', 'source', 'sha256', 'bytes', 'characters', 'registeredModules'];
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.keys(record).length !== fields.length || fields.some(field => !Object.hasOwn(record, field)) ||
        record.schemaVersion !== 1 || record.name !== 'YouTube Master Suite' || !versionParts(record.version) ||
        record.source !== scriptName || !/^[0-9a-f]{64}$/.test(record.sha256) || !scriptSize(record.bytes) ||
        !Number.isSafeInteger(record.characters) || record.characters <= 0 || record.characters > record.bytes ||
        !Number.isInteger(record.registeredModules) || record.registeredModules < 1 || record.registeredModules > 64) {
      fail('The update source returned an incompatible release manifest.');
    }
    const install = new URL(record.source, source.url);
    if (install.origin !== new URL(source.url).origin) fail('The update source changed the installation origin.');
    return { version: record.version, sha256: record.sha256, bytes: record.bytes, installUrl: install.href };
  }
  function checkedGithub(record, source) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || record.draft !== false ||
        record.prerelease !== false || typeof record.published_at !== 'string' || record.published_at.length > 40 ||
        !Number.isFinite(Date.parse(record.published_at)) || typeof record.tag_name !== 'string' ||
        !record.tag_name.startsWith('v') || !versionParts(record.tag_name.slice(1)) ||
        !Array.isArray(record.assets) || record.assets.length > 100) {
      fail('The update source returned an incompatible stable release.');
    }
    const matches = record.assets.filter(asset => asset?.name === scriptName);
    if (matches.length !== 1) fail('The release must contain exactly one uploaded Suite userscript.');
    const asset = matches[0];
    if (asset.state !== 'uploaded' || !scriptSize(asset.size) || typeof asset.digest !== 'string' ||
        !/^sha256:[0-9a-f]{64}$/.test(asset.digest)) fail('The release userscript has no valid size and SHA-256 metadata.');
    const install = cleanUrl(asset.browser_download_url);
    const parts = install?.pathname.split('/').slice(1);
    if (!install || install.origin !== 'https://github.com' || parts.length !== 6 ||
        parts[0].toLowerCase() !== source.owner.toLowerCase() || parts[1].toLowerCase() !== source.repository.toLowerCase() ||
        parts[2] !== 'releases' || parts[3] !== 'download' || parts[4] !== record.tag_name || parts[5] !== scriptName) {
      fail('The release userscript changed the approved repository or download path.');
    }
    return { version: record.tag_name.slice(1), sha256: asset.digest.slice(7), bytes: asset.size, installUrl: install.href };
  }
  async function fetchRelease(source, controller) {
    const response = await fetchRequest(source.requestUrl, { method: 'GET', credentials: 'omit', cache: 'no-store',
      referrerPolicy: 'no-referrer', redirect: 'follow', signal: controller.signal,
      headers: { Accept: source.type === 'github' ? 'application/vnd.github+json' : 'application/json' } });
    if (!response?.ok) {
      if (response?.status === 403 || response?.status === 429) fail('The update service is rate-limited. Try again later.');
      if (response?.status === 404) fail('No public stable release was found at this update source.');
      fail('The update source did not return release metadata.');
    }
    // Never store or use a CDN redirect URL as the installation target.
    if (response.url && new URL(response.url).protocol !== 'https:') fail('The update source redirected to an insecure location.');
    const record = await readJson(response, source.type === 'github' ? 128 * 1024 : 16 * 1024);
    return source.type === 'github' ? checkedGithub(record, source) : checkedManifest(record, source);
  }
  async function check() {
    cancel();
    if (!versionParts(installedVersion)) return failure('The installed Suite version is unsupported.');
    if (typeof fetchRequest !== 'function' || typeof AbortControllerType !== 'function') return failure('This browser cannot check the update source.');
    let source;
    try { source = readRecord(); }
    catch { return failure('The saved update source is unavailable, incompatible or damaged. It was left unchanged.'); }
    if (!source.details) return failure('Save a release source URL before checking for updates.');
    const request = { controller: new AbortControllerType(), cancelled: false, timedOut: false };
    active = request;
    let timer;
    try {
      const stopped = new Promise((resolve, reject) => { request.rejectCancel = reject; });
      timer = startTimer(() => {
        request.timedOut = true;
        request.controller.abort();
        request.rejectCancel?.(new Error('timeout'));
      }, deadlineMs);
      const release = await Promise.race([fetchRelease(source.details, request.controller), stopped]);
      if (active !== request || request.cancelled) return failure('The update check was cancelled.', { cancelled: true });
      if (getStorage().getItem(key) !== source.raw) return failure('The update source changed during the check. Check again.', { conflict: true });
      const compared = compareVersions(release.version, installedVersion);
      const result = Object.freeze({ ok: true, status: compared > 0 ? 'newer' : compared < 0 ? 'older' : 'current',
        installedVersion, latestVersion: release.version, sha256: release.sha256, bytes: release.bytes });
      results.set(result, { raw: source.raw, url: release.installUrl, expires: now() + checkLifetime });
      return result;
    } catch (error) {
      if (request.cancelled || active !== request) return failure('The update check was cancelled.', { cancelled: true });
      if (request.timedOut) return failure('The update check timed out. Try again.');
      // Response and validation errors are fixed local messages. Network errors
      // can contain private URLs, so never reproduce their browser-provided text.
      const approved = ['The update response is too large.', 'The update source returned no readable metadata.',
        'The update source returned unreadable metadata.', 'The update source returned invalid JSON metadata.',
        'The update source returned an incompatible release manifest.',
        'The update source returned an incompatible stable release.', 'The release must contain exactly one uploaded Suite userscript.',
        'The release userscript has no valid size and SHA-256 metadata.', 'The release userscript changed the approved repository or download path.',
        'The update source changed the installation origin.', 'The update service is rate-limited. Try again later.',
        'No public stable release was found at this update source.', 'The update source did not return release metadata.',
        'The update source redirected to an insecure location.', 'The update source contains an unsupported version.'];
      return failure(approved.includes(error?.message) ? error.message :
        'The update source could not be read. Check the connection and that its host allows browser requests (CORS).');
    } finally {
      if (timer !== undefined) stopTimer(timer);
      if (active === request) active = null;
    }
  }
  function installationUrl(result) {
    const checked = result && typeof result === 'object' ? results.get(result) : null;
    if (!checked || result.status !== 'newer') return null;
    try {
      if (now() > checked.expires || getStorage().getItem(key) !== checked.raw) { results.delete(result); return null; }
      return checked.url;
    } catch { return null; }
  }
  return Object.freeze({ key, readSource, saveSource, check, installationUrl, cancel });
}
