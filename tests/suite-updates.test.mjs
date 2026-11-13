// Language: en-GB. Synthetic update sources and release metadata only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { createSuiteUpdates } from '../sources/suite-updates.mjs';

const KEY = 'yt-master-suite.update-source.v1';
const MANIFEST_URL = 'https://updates.example.invalid/stable/release-manifest.json';
const GITHUB_URL = 'https://github.com/fixture-owner/fixture-suite/releases/latest';
const LEGACY_SUITE_SOURCE = 'https://github.com/noswimmingplease/youtube-master-suite/releases/latest';
const CANONICAL_SUITE_SOURCE = 'https://github.com/cantwalkwontrun/youtube-master-suite/releases/latest';
const CANONICAL_SUITE_DOWNLOAD = 'https://github.com/cantwalkwontrun/youtube-master-suite/releases/download/v1.2.61/youtube-master-suite.user.js';
const HASH = 'a'.repeat(64);
const manifest = (values = {}) => ({ schemaVersion: 1, name: 'YouTube Master Suite', version: '1.2.61',
  source: 'youtube-master-suite.user.js', sha256: HASH, bytes: 900000, characters: 899900, registeredModules: 8, ...values });
const asset = (values = {}) => ({ name: 'youtube-master-suite.user.js', state: 'uploaded', size: 900000,
  digest: `sha256:${HASH}`, browser_download_url: 'https://github.com/fixture-owner/fixture-suite/releases/download/v1.2.61/youtube-master-suite.user.js', ...values });
const release = (values = {}) => ({ draft: false, prerelease: false, published_at: '2026-01-01T12:00:00Z',
  tag_name: 'v1.2.61', assets: [asset()], ...values });
const response = (value, options) => new Response(typeof value === 'string' ? value : JSON.stringify(value), options);

function fixture(options = {}) {
  const data = new Map();
  const writes = [], calls = [], hooks = {}, timers = new Map();
  let time = 1000, nextTimer = 0;
  const storage = {
    getItem(key) { const value = data.get(key) ?? null; return hooks.get ? hooks.get(key, value) : value; },
    setItem(key, value) { writes.push(['set', key, value]); if (hooks.set?.(key, value) !== false) data.set(key, value); },
    removeItem(key) { writes.push(['remove', key]); data.delete(key); },
  };
  let reply = async () => response(manifest());
  const updates = createSuiteUpdates({
    getStorage: () => storage, installedVersion: '1.2.60', now: () => time,
    fetch: async (url, init) => { calls.push({ url, init }); return reply(url, init); },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    ...options,
  });
  return { updates, data, storage, writes, calls, hooks, timers,
    reply: callback => { reply = callback; }, advance: delta => { time += delta; },
    source: (url = MANIFEST_URL) => updates.saveSource(url) };
}

test('update helper embeds without imports, configuration or network work at startup', async () => {
  const f = fixture();
  const create = vm.runInNewContext(`(${createSuiteUpdates.toString()})`, {
    URL, AbortController, TextDecoder, Uint8Array, Date, setTimeout, clearTimeout,
  });
  const service = create({ getStorage: () => f.storage, installedVersion: '1.2.60', fetch: () => { throw new Error('unexpected fetch'); } });
  assert.equal(service.key, KEY);
  assert.equal(service.readSource().ok, true);
  assert.equal(service.readSource().url, '');
  assert.equal((await service.check()).ok, false);
  assert.deepEqual(f.writes, []);
});

test('a direct manifest or public Releases URL is saved locally in canonical form', () => {
  const f = fixture();
  assert.deepEqual(f.source(`  ${MANIFEST_URL}  `), { ok: true, url: MANIFEST_URL });
  assert.deepEqual(JSON.parse(f.data.get(KEY)), { version: 1, url: MANIFEST_URL });
  assert.deepEqual(f.updates.readSource(), { ok: true, url: MANIFEST_URL });
  assert.deepEqual(f.source('https://github.com/fixture-owner/fixture-suite/releases/'), { ok: true, url: GITHUB_URL });
  assert.deepEqual(f.updates.readSource(), { ok: true, url: GITHUB_URL });
  const count = f.writes.length;
  assert.equal(f.source(GITHUB_URL).ok, true);
  assert.equal(f.writes.length, count, 'saving the same source avoids a write');
  assert.equal(f.source('').ok, true);
  assert.equal(f.data.has(KEY), false);
});

test('the default source works without entry or storage writes and custom sources take priority', async () => {
  const f = fixture({ defaultSourceUrl: 'https://github.com/fixture-owner/fixture-suite/releases/' });
  assert.deepEqual(f.updates.readSource(), { ok: true, url: GITHUB_URL });
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.calls, []);
  f.reply(async () => response(release()));
  const result = await f.updates.check();
  assert.equal(result.status, 'newer');
  assert.equal(f.calls[0].url, 'https://api.github.com/repos/fixture-owner/fixture-suite/releases/latest');
  assert.equal(f.updates.installationUrl(result), asset().browser_download_url);
  assert.deepEqual(f.writes, []);
  f.source(MANIFEST_URL);
  assert.deepEqual(f.updates.readSource(), { ok: true, url: MANIFEST_URL });
  assert.equal(f.updates.installationUrl(result), null);
  assert.deepEqual(f.source(''), { ok: true, url: GITHUB_URL });
  assert.equal(f.data.has(KEY), false);
  assert.deepEqual(f.updates.readSource(), { ok: true, url: GITHUB_URL });
});

for (const saved of [false, true]) test(`the known Suite repository rename routes the ${saved ? 'saved' : 'default'} source without rewriting it`, async () => {
  const f = fixture({ defaultSourceUrl: saved ? CANONICAL_SUITE_SOURCE : LEGACY_SUITE_SOURCE });
  const raw = '{\n  "url": "' + LEGACY_SUITE_SOURCE + '", "version": 1\n}';
  if (saved) f.data.set(KEY, raw);
  assert.deepEqual(f.updates.readSource(), { ok: true, url: LEGACY_SUITE_SOURCE });
  f.reply(async () => response(release({ assets: [asset({ browser_download_url: CANONICAL_SUITE_DOWNLOAD })] })));
  const result = await f.updates.check();
  assert.equal(result.ok, true, result.error);
  assert.equal(f.calls[0].url, 'https://api.github.com/repos/cantwalkwontrun/youtube-master-suite/releases/latest');
  assert.equal(f.updates.installationUrl(result), CANONICAL_SUITE_DOWNLOAD);
  assert.deepEqual(f.writes, []);
  assert.equal(f.data.get(KEY) ?? null, saved ? raw : null);
});

test('mixed-case known Suite aliases retain their saved URL and use the canonical repository', async () => {
  const url = 'https://github.com/NoSwimmingPlease/YouTube-Master-Suite/releases/latest';
  const f = fixture({ defaultSourceUrl: CANONICAL_SUITE_SOURCE });
  const raw = JSON.stringify({ version: 1, url }); f.data.set(KEY, raw);
  f.reply(async () => response(release({ assets: [asset({ browser_download_url: CANONICAL_SUITE_DOWNLOAD })] })));
  assert.deepEqual(f.updates.readSource(), { ok: true, url });
  const result = await f.updates.check();
  assert.equal(result.ok, true, result.error);
  assert.equal(f.calls[0].url, 'https://api.github.com/repos/cantwalkwontrun/youtube-master-suite/releases/latest');
  assert.equal(f.updates.installationUrl(result), CANONICAL_SUITE_DOWNLOAD);
  assert.equal(f.data.get(KEY), raw); assert.deepEqual(f.writes, []);
});

test('the canonical Suite source accepts its own downloads and rejects the former owner download path', async () => {
  const f = fixture({ defaultSourceUrl: CANONICAL_SUITE_SOURCE });
  f.reply(async () => response(release({ assets: [asset({ browser_download_url: CANONICAL_SUITE_DOWNLOAD })] })));
  const result = await f.updates.check();
  assert.equal(result.ok, true, result.error);
  assert.equal(f.updates.installationUrl(result), CANONICAL_SUITE_DOWNLOAD);
  f.reply(async () => response(release({ assets: [asset({ browser_download_url: CANONICAL_SUITE_DOWNLOAD.replace('/cantwalkwontrun/', '/noswimmingplease/') })] })));
  const rejected = await f.updates.check();
  assert.equal(rejected.ok, false);
  assert.equal(f.updates.installationUrl(rejected), null);
  assert.deepEqual(f.writes, []);
});

test('the Suite alias never redirects other owners or repositories or approves their mismatched downloads', async () => {
  for (const [owner, repository] of [['noswimmingplease', 'another-suite'], ['fixture-owner', 'youtube-master-suite'],
    ['noswimmingplease-extra', 'youtube-master-suite'], ['noswimmingplease', 'youtube-master-suite-fork']]) {
    const url = `https://github.com/${owner}/${repository}/releases/latest`;
    const f = fixture({ defaultSourceUrl: url });
    const download = `https://github.com/${owner}/${repository}/releases/download/v1.2.61/youtube-master-suite.user.js`;
    f.reply(async () => response(release({ assets: [asset({ browser_download_url: download })] })));
    const result = await f.updates.check();
    assert.equal(result.ok, true, result.error);
    assert.equal(f.calls[0].url, `https://api.github.com/repos/${owner}/${repository}/releases/latest`);
    assert.equal(f.updates.installationUrl(result), download);
    f.reply(async () => response(release({ assets: [asset({ browser_download_url: CANONICAL_SUITE_DOWNLOAD })] })));
    assert.equal((await f.updates.check()).ok, false);
    assert.deepEqual(f.updates.readSource(), { ok: true, url });
    assert.deepEqual(f.writes, []);
  }
});

test('the known rename does not make noncanonical saved URLs or forged download paths valid', async () => {
  for (const url of [LEGACY_SUITE_SOURCE + '/', LEGACY_SUITE_SOURCE.replace('/latest', ''),
    LEGACY_SUITE_SOURCE + '?token=synthetic', LEGACY_SUITE_SOURCE.replace('github.com', 'github.com.example.invalid')]) {
    const f = fixture({ defaultSourceUrl: CANONICAL_SUITE_SOURCE });
    const raw = JSON.stringify({ version: 1, url }); f.data.set(KEY, raw);
    assert.equal(f.updates.readSource().ok, false);
    assert.equal((await f.updates.check()).ok, false);
    assert.deepEqual(f.calls, []); assert.deepEqual(f.writes, []); assert.equal(f.data.get(KEY), raw);
  }
  for (const url of [CANONICAL_SUITE_DOWNLOAD.replace('/youtube-master-suite/', '/youtube-master-suite-fork/'),
    CANONICAL_SUITE_DOWNLOAD.replace('/cantwalkwontrun/', '/cantwalkwontrun-extra/'),
    CANONICAL_SUITE_DOWNLOAD.replace('/download/', '/latest/'), CANONICAL_SUITE_DOWNLOAD + '?token=synthetic']) {
    const f = fixture({ defaultSourceUrl: LEGACY_SUITE_SOURCE });
    f.reply(async () => response(release({ assets: [asset({ browser_download_url: url })] })));
    const result = await f.updates.check();
    assert.equal(result.ok, false); assert.equal(f.updates.installationUrl(result), null); assert.deepEqual(f.writes, []);
  }
});

test('a default source never hides damaged records and an invalid default cannot trigger a request', async () => {
  const f = fixture({ defaultSourceUrl: GITHUB_URL });
  f.data.set(KEY, '{');
  assert.equal(f.updates.readSource().ok, false);
  assert.equal((await f.updates.check()).ok, false);
  assert.equal(f.source('').ok, false);
  assert.equal(f.data.get(KEY), '{');
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.calls, []);
  const invalid = fixture({ defaultSourceUrl: `${GITHUB_URL}?token=synthetic` });
  assert.deepEqual(invalid.updates.readSource(), { ok: true, url: '' });
  assert.equal((await invalid.updates.check()).ok, false);
  assert.deepEqual(invalid.calls, []);
});

test('source URL validation rejects credentials, query data, fragments and unrelated paths without changing storage', () => {
  const f = fixture(); f.source(); const before = f.data.get(KEY), count = f.writes.length;
  for (const url of [null, {}, [], 'http://updates.example.invalid/release-manifest.json',
    'https://name:password@updates.example.invalid/release-manifest.json', `${MANIFEST_URL}?token=fixture`, `${MANIFEST_URL}#fragment`,
    `${MANIFEST_URL}?`, `${MANIFEST_URL}#`, 'https://@updates.example.invalid/release-manifest.json',
    'https://updates.example.invalid/sta\nble/release-manifest.json',
    'data:application/json,{}', 'javascript:alert(1)', 'file:///release-manifest.json',
    'https://updates.example.invalid/script.user.js', 'https://github.com/fixture-owner/fixture-suite',
    'https://github.com/fixture-owner/fixture-suite/releases/tag/v1.2.61',
    'https://github.com:8443/fixture-owner/fixture-suite/releases/latest', 'https://github.com/../fixture-suite/releases/latest',
    `https://updates.example.invalid/${'x'.repeat(2100)}/release-manifest.json`]) {
    assert.equal(f.source(url).ok, false, String(url));
    assert.equal(f.data.get(KEY), before);
  }
  assert.equal(f.writes.length, count);
});

test('unknown or damaged stored source records are never normalised or overwritten', async () => {
  for (const raw of ['{', 'null', '[]', JSON.stringify({ version: 2, url: MANIFEST_URL }),
    JSON.stringify({ version: 1, url: MANIFEST_URL, extra: true }), JSON.stringify({ url: MANIFEST_URL }),
    JSON.stringify({ version: 1, url: `${MANIFEST_URL}?token=fixture` }), ' '.repeat(2200)]) {
    const f = fixture(); f.data.set(KEY, raw);
    assert.equal(f.updates.readSource().ok, false);
    assert.equal(f.source().ok, false);
    assert.equal(f.source('').ok, false);
    assert.equal((await f.updates.check()).ok, false);
    assert.equal(f.data.get(KEY), raw);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.calls, []);
  }
});

test('source saves detect intervening storage changes and preserve newer data', () => {
  const f = fixture(); f.source(); f.writes.length = 0;
  const other = JSON.stringify({ version: 1, url: 'https://other.example.invalid/release-manifest.json' });
  let reads = 0;
  f.hooks.get = (key, value) => { if (++reads === 2) { f.data.set(key, other); return other; } return value; };
  assert.equal(f.source(GITHUB_URL).conflict, true);
  assert.equal(f.data.get(KEY), other);
  assert.deepEqual(f.writes, []);
});

test('unavailable, quota-limited and dropped source writes leave the prior source recoverable', () => {
  for (const mode of ['read', 'quota', 'drop']) {
    const f = fixture(); f.source(); const previous = f.data.get(KEY); f.writes.length = 0;
    if (mode === 'read') f.hooks.get = () => { throw new Error('denied'); };
    if (mode === 'quota') f.hooks.set = () => { throw new Error('quota'); };
    if (mode === 'drop') f.hooks.set = () => false;
    assert.equal(f.source(GITHUB_URL).ok, false);
    assert.equal(f.data.get(KEY), previous);
  }
});

test('a manifest check reads metadata once without cookies, referrer or script execution', async () => {
  const f = fixture(); f.source(); f.writes.length = 0;
  const result = await f.updates.check();
  assert.deepEqual(result, { ok: true, status: 'newer', installedVersion: '1.2.60', latestVersion: '1.2.61', sha256: HASH, bytes: 900000 });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, MANIFEST_URL);
  assert.equal(f.calls[0].init.credentials, 'omit');
  assert.equal(f.calls[0].init.referrerPolicy, 'no-referrer');
  assert.equal(f.calls[0].init.cache, 'no-store');
  assert.equal(f.calls[0].init.method, 'GET');
  assert.equal(f.updates.installationUrl(result), 'https://updates.example.invalid/stable/youtube-master-suite.user.js');
  assert.equal(f.updates.installationUrl({ ...result }), null, 'copied results cannot supply a different install URL');
  assert.deepEqual(f.writes, []);
  assert.equal(f.timers.size, 0);
});

test('numeric dotted version comparison distinguishes newer, current and older versions', async () => {
  for (const [installedVersion, latestVersion, status] of [['1.2.60', '1.2.60.0', 'current'],
    ['1.2.60', '1.2.59', 'older'], ['1.9', '1.10', 'newer'], ['1.10', '1.9.99', 'older']]) {
    const f = fixture({ installedVersion }); f.source(); f.reply(async () => response(manifest({ version: latestVersion })));
    const result = await f.updates.check();
    assert.equal(result.status, status);
    assert.equal(Boolean(f.updates.installationUrl(result)), status === 'newer');
  }
  for (const installedVersion of ['', 'v1.2.60', '1', '1.2-beta', '1.9007199254740992']) {
    const f = fixture({ installedVersion }); f.source();
    assert.equal((await f.updates.check()).ok, false);
    assert.deepEqual(f.calls, []);
  }
});

test('incompatible manifest fields and installation paths are rejected', async () => {
  for (const change of [
    value => { value.schemaVersion = 2; }, value => { value.name = 'Other script'; },
    value => { value.version = 'v1.2.61'; }, value => { value.version = '1.2.61-beta'; },
    value => { value.source = '../youtube-master-suite.user.js'; },
    value => { value.source = 'https://other.example.invalid/youtube-master-suite.user.js'; },
    value => { value.sha256 = 'b'.repeat(63); }, value => { value.bytes = 9 * 1024 * 1024; },
    value => { value.bytes = 1.5; }, value => { value.characters = value.bytes + 1; },
    value => { value.registeredModules = 0; }, value => { value.extra = true; }, value => { delete value.sha256; },
  ]) {
    const f = fixture(); f.source(); const value = manifest(); change(value); f.reply(async () => response(value));
    const result = await f.updates.check();
    assert.equal(result.ok, false);
    assert.equal(f.updates.installationUrl(result), null);
  }
});

test('manifest HTTPS redirects retain only the originally approved installation origin', async () => {
  const f = fixture(); f.source();
  f.reply(async () => { const value = response(manifest()); Object.defineProperty(value, 'url', { value: 'https://cdn.example.invalid/metadata?signature=synthetic' }); return value; });
  const result = await f.updates.check();
  assert.equal(result.ok, true);
  assert.equal(f.updates.installationUrl(result), 'https://updates.example.invalid/stable/youtube-master-suite.user.js');
  assert.doesNotMatch(JSON.stringify(result), /cdn|signature/);
  f.reply(async () => { const value = response(manifest()); Object.defineProperty(value, 'url', { value: 'http://cdn.example.invalid/metadata' }); return value; });
  assert.equal((await f.updates.check()).ok, false);
});

test('a source change during an outstanding check invalidates its result', async () => {
  const f = fixture(); f.source(); let finish;
  f.reply(() => new Promise(resolve => { finish = resolve; }));
  const checking = f.updates.check();
  f.data.set(KEY, JSON.stringify({ version: 1, url: GITHUB_URL }));
  finish(response(manifest()));
  const result = await checking;
  assert.equal(result.conflict, true);
  assert.equal(f.updates.installationUrl(result), null);
});

test('successful check capabilities expire and cannot survive cancellation, editing or another check', async () => {
  const f = fixture(); f.source();
  const first = await f.updates.check(); f.advance(600001);
  assert.equal(f.updates.installationUrl(first), null);
  const second = await f.updates.check(); f.updates.cancel();
  assert.equal(f.updates.installationUrl(second), null);
  const third = await f.updates.check(); f.source(GITHUB_URL);
  assert.equal(f.updates.installationUrl(third), null);
  f.source(); const fourth = await f.updates.check();
  f.reply(async () => { throw new Error('network'); });
  assert.equal((await f.updates.check()).ok, false);
  assert.equal(f.updates.installationUrl(fourth), null);
});

test('cross-tab source replacement invalidates install access even after a completed check', async () => {
  const f = fixture(); f.source(); const result = await f.updates.check();
  f.data.set(KEY, JSON.stringify({ version: 1, url: GITHUB_URL }));
  assert.equal(f.updates.installationUrl(result), null);
  f.data.set(KEY, JSON.stringify({ version: 1, url: MANIFEST_URL }));
  assert.equal(f.updates.installationUrl(result), null, 'a previously invalidated capability cannot revive');
});

test('timeout aborts a hanging fetch and returns even if the fetch ignores cancellation', async () => {
  const f = fixture(); f.source(); f.reply(() => new Promise(() => {}));
  const checking = f.updates.check();
  [...f.timers.values()][0]();
  const result = await checking;
  assert.equal(result.ok, false); assert.match(result.error, /timed out/);
  assert.equal(f.calls[0].init.signal.aborted, true);
  assert.equal(f.timers.size, 0);
});

test('a superseded check is cancelled promptly and cannot replace the newest result', async () => {
  const f = fixture(); f.source(); let calls = 0, finishOld;
  f.reply(() => ++calls === 1 ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve(response(manifest())));
  const oldCheck = f.updates.check();
  const latest = await f.updates.check();
  const old = await oldCheck;
  assert.equal(old.cancelled, true);
  assert.equal(f.calls[0].init.signal.aborted, true);
  finishOld(response(manifest({ version: '99.0' })));
  await Promise.resolve();
  assert.equal(latest.latestVersion, '1.2.61');
  assert.notEqual(f.updates.installationUrl(latest), null);
});

test('metadata byte limits are enforced from both Content-Length and streamed bytes', async () => {
  for (const reply of [
    () => response(manifest(), { headers: { 'content-length': '16385' } }),
    () => response(' '.repeat(16385)),
    () => response('é'.repeat(9000)),
  ]) {
    const f = fixture(); f.source(); f.reply(async () => reply());
    const result = await f.updates.check();
    assert.equal(result.ok, false); assert.match(result.error, /too large/);
    assert.equal(f.timers.size, 0);
  }
});

test('network error messages are redacted and HTTP failures have fixed useful messages', async () => {
  const f = fixture(); f.source();
  f.reply(async () => { throw new Error('Failed to fetch https://private.example.invalid/?token=synthetic'); });
  const result = await f.updates.check();
  assert.equal(result.ok, false); assert.match(result.error, /CORS/); assert.doesNotMatch(result.error, /private|token|synthetic/);
  for (const [status, expected] of [[404, /No public stable release/], [403, /rate-limited/], [429, /rate-limited/], [500, /did not return/]]) {
    f.reply(async () => response('{}', { status }));
    assert.match((await f.updates.check()).error, expected);
  }
  for (const body of ['{', 'null', '[]', '<html>Fixture error</html>']) {
    f.reply(async () => response(body)); assert.equal((await f.updates.check()).ok, false);
  }
});

test('GitHub checks use the public metadata API and validate the exact stable uploaded asset', async () => {
  const f = fixture(); f.source(GITHUB_URL); f.reply(async () => response(release())); f.writes.length = 0;
  const result = await f.updates.check();
  assert.equal(result.status, 'newer');
  assert.equal(f.calls[0].url, 'https://api.github.com/repos/fixture-owner/fixture-suite/releases/latest');
  assert.equal(f.calls[0].init.headers.Accept, 'application/vnd.github+json');
  assert.equal(f.calls.length, 1, 'the script and manifest assets are not downloaded');
  assert.equal(f.updates.installationUrl(result), asset().browser_download_url);
  assert.deepEqual(f.writes, []);
  assert.doesNotMatch(JSON.stringify(result), /github|fixture-owner|download/);
});

test('GitHub rejects draft, prerelease, unpublished, malformed and ambiguous releases', async () => {
  for (const value of [release({ draft: true }), release({ prerelease: true }), release({ published_at: null }),
    release({ tag_name: '1.2.61' }), release({ tag_name: 'v1.2.61-beta' }), release({ assets: [] }),
    release({ assets: [asset(), asset()] }), release({ assets: Array(101).fill({}) }),
    release({ assets: [asset({ state: 'new' })] }), release({ assets: [asset({ digest: null })] }),
    release({ assets: [asset({ digest: 'sha512:' + HASH })] }), release({ assets: [asset({ size: 0 })] }),
    release({ assets: [asset({ size: 9 * 1024 * 1024 })] }),
  ]) {
    const f = fixture(); f.source(GITHUB_URL); f.reply(async () => response(value));
    const result = await f.updates.check();
    assert.equal(result.ok, false); assert.equal(f.updates.installationUrl(result), null);
  }
});

test('GitHub asset URLs cannot change owner, repository, tag, filename, protocol or credentials', async () => {
  for (const url of ['https://other.example.invalid/youtube-master-suite.user.js',
    'https://github.com/other-owner/fixture-suite/releases/download/v1.2.61/youtube-master-suite.user.js',
    'https://github.com/fixture-owner/other-suite/releases/download/v1.2.61/youtube-master-suite.user.js',
    'https://github.com/fixture-owner/fixture-suite/releases/download/v1.2.60/youtube-master-suite.user.js',
    'https://github.com/fixture-owner/fixture-suite/releases/download/v1.2.61/other.user.js',
    'http://github.com/fixture-owner/fixture-suite/releases/download/v1.2.61/youtube-master-suite.user.js',
    'https://name:password@github.com/fixture-owner/fixture-suite/releases/download/v1.2.61/youtube-master-suite.user.js',
    asset().browser_download_url + '?token=synthetic', asset().browser_download_url + '#fragment']) {
    const f = fixture(); f.source(GITHUB_URL); f.reply(async () => response(release({ assets: [asset({ browser_download_url: url })] })));
    assert.equal((await f.updates.check()).ok, false, url);
  }
});

test('GitHub metadata allows bounded release notes without exposing or executing them', async () => {
  const f = fixture(); f.source(GITHUB_URL);
  f.reply(async () => response(release({ body: '<script>synthetic</script>' + 'x'.repeat(20000), author: { login: 'fixture-author' } })));
  const result = await f.updates.check();
  assert.equal(result.ok, true);
  assert.doesNotMatch(JSON.stringify(result), /script|fixture-author|body/);
  f.reply(async () => response(release({ body: 'x'.repeat(128 * 1024) })));
  assert.match((await f.updates.check()).error, /too large/);
});
