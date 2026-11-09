// Language: en-GB. Explicit, bounded public-channel lookups; no page execution or persisted cache.
export function createChannelLookup({ fetch, origin = 'https://www.youtube.com', now = () => Date.now(), timeoutMs = 12000, maximumBytes = 4 * 1024 * 1024 } = {}) {
  const canonicalOrigin = 'https://www.youtube.com';
  const idPattern = /^UC[A-Za-z0-9_-]{22}$/;
  const cache = new Map(), active = new Set();
  let verified = new WeakMap(), generation = 0;
  const timeout = Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30000 ? timeoutMs : 12000;
  const byteLimit = Number.isInteger(maximumBytes) && maximumBytes >= 1024 && maximumBytes <= 4 * 1024 * 1024 ? maximumBytes : 4 * 1024 * 1024;
  const label = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  const failed = (code, error) => ({ ok:false,code,error });

  function candidateUrl(value) {
    if (typeof value !== 'string' || value.length > 1024) return null;
    try {
      const url = new URL(value, canonicalOrigin);
      if (origin !== canonicalOrigin || url.origin !== canonicalOrigin || url.username || url.password || url.search || url.hash) return null;
      const match = /^\/@([^/]+)\/?$/.exec(url.pathname);
      if (!match) return null;
      const handle = decodeURIComponent(match[1]);
      if (!handle || handle.length > 100 || /[\s\u0000-\u001f\u007f<>?&#%/\\@]/u.test(handle)) return null;
      return { handle:`@${handle}`,url:`${canonicalOrigin}/@${encodeURIComponent(handle)}` };
    } catch { return null; }
  }

  function sameHandle(left, right) {
    return left.normalize('NFC').toLowerCase() === right.normalize('NFC').toLowerCase();
  }

  function finalUrl(value, candidate) {
    try {
      const url = new URL(value);
      if (url.origin !== canonicalOrigin || url.username || url.password || url.hash ||
          [...url.searchParams].some(([key,value]) => !['cbrd','ucbcb'].includes(key) || value !== '1')) return null;
      const channel = /^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/.exec(url.pathname);
      if (channel) return { channelId:channel[1] };
      url.search = '';
      const handle = candidateUrl(url.href);
      return handle && sameHandle(handle.handle, candidate.handle) ? {} : null;
    } catch { return null; }
  }

  function decodeAttribute(value) {
    return value.replace(/&(?:amp|quot|apos|lt|gt|#\d{1,7}|#x[0-9a-f]{1,6});/gi, entity => {
      const named = { '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>' }[entity.toLowerCase()];
      if (named !== undefined) return named;
      const number = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3,-1),16) : Number(entity.slice(2,-1));
      return Number.isInteger(number) && number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number) : '';
    });
  }

  function attributes(tag) {
    const result = new Map();
    const pattern = /([^\s=<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match;
    while ((match = pattern.exec(tag))) {
      const name = match[1].toLowerCase();
      if (result.has(name)) return null;
      result.set(name,decodeAttribute(match[2] ?? match[3] ?? match[4]));
    }
    return result;
  }

  function headIdentity(html, add) {
    const start = html.search(/<head(?:\s|>)/i);
    if (start < 0) return { name:'' };
    const close = html.indexOf('</head', start);
    const head = html.slice(start, Math.min(close < 0 ? html.length : close, start + 768 * 1024));
    let cursor = 0, name = '';
    while (cursor < head.length) {
      const at = head.indexOf('<', cursor);
      if (at < 0) break;
      if (head.startsWith('<!--', at)) { const end = head.indexOf('-->',at + 4); cursor = end < 0 ? head.length : end + 3; continue; }
      const opening = /^<\s*(script|style)\b/i.exec(head.slice(at, at + 16));
      if (opening) {
        const pattern = new RegExp('</' + opening[1] + '\\s*>','ig'); pattern.lastIndex = at;
        const end = pattern.exec(head); cursor = end ? pattern.lastIndex : head.length; continue;
      }
      let end = at + 1, quote = '';
      for (; end < head.length && end - at <= 8192; end++) {
        const character = head[end];
        if (quote) { if (character === quote) quote = ''; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '>') break;
      }
      cursor = end + 1;
      if (end >= head.length || end - at > 8192) continue;
      const tag = head.slice(at,end + 1), type = /^<\s*(meta|link)\b/i.exec(tag)?.[1].toLowerCase();
      if (!type) continue;
      const attrs = attributes(tag);
      if (!attrs) continue;
      if (type === 'link' && attrs.get('rel')?.toLowerCase() === 'canonical') add(attrs.get('href'), 'canonical');
      if (type === 'meta') {
        const property = attrs.get('itemprop')?.toLowerCase();
        if (property === 'identifier' || property === 'channelid') add(attrs.get('content'),'identifier');
        if (attrs.get('property')?.toLowerCase() === 'og:url') add(attrs.get('content'),'canonical');
        if (attrs.get('property')?.toLowerCase() === 'og:title') name = label(attrs.get('content'));
      }
    }
    return { name };
  }

  function initialData(html) {
    const pattern = /(?:\bvar\s+)?\bytInitialData\s*=\s*|window\s*\[\s*["']ytInitialData["']\s*\]\s*=\s*/g;
    const values = [];
    let match, attempts = 0;
    while ((match = pattern.exec(html)) && attempts++ < 8) {
      let start = pattern.lastIndex;
      while (/\s/.test(html[start] || '') && start < html.length) start++;
      if (html[start] !== '{') continue;
      let depth = 0, quoted = false, escaped = false;
      for (let index = start; index < html.length; index++) {
        const character = html[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (character === '\\') escaped = true;
          else if (character === '"') quoted = false;
        } else if (character === '"') quoted = true;
        else if (character === '{' || character === '[') { if (++depth > 128) break; }
        else if (character === '}' || character === ']') {
          if (--depth === 0) {
            try { const value = JSON.parse(html.slice(start,index + 1)); if (value && typeof value === 'object') values.push(value); } catch { /* Unsupported native data stays unavailable. */ }
            pattern.lastIndex = index + 1; break;
          }
        }
      }
    }
    return values;
  }

  function parseIdentity(html, candidate, final) {
    const ids = new Set();
    let conflict = false, name = '';
    function add(value, kind) {
      if (typeof value !== 'string') return;
      if (idPattern.test(value)) { ids.add(value); return; }
      try {
        const url = new URL(value, canonicalOrigin);
        // YouTube's own channelMetadataRenderer still emits an http vanity
        // URL. It is identity text only: upgrade it locally and never request it.
        if (kind === 'canonical' && url.protocol === 'http:' && url.hostname === 'www.youtube.com' && !url.port && !url.username && !url.password) url.protocol = 'https:';
        const id = url.origin === canonicalOrigin && !url.username && !url.password && !url.search && !url.hash
          ? /^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/.exec(url.pathname)?.[1] : null;
        if (id) { ids.add(id); return; }
        const handle = candidateUrl(url.href);
        if (kind === 'canonical' && (!handle || !sameHandle(handle.handle,candidate.handle))) conflict = true;
      } catch { if (kind === 'canonical') conflict = true; }
    }
    if (final.channelId) ids.add(final.channelId);
    const head = headIdentity(html,add); name = head.name;
    for (const value of initialData(html)) {
      const metadata = value.metadata?.channelMetadataRenderer;
      if (!metadata || typeof metadata !== 'object') continue;
      add(metadata.externalId,'identifier');
      if (metadata.channelUrl) add(metadata.channelUrl,'canonical');
      if (metadata.vanityChannelUrl) add(metadata.vanityChannelUrl,'canonical');
      name = label(metadata.title) || name;
    }
    if (conflict || ids.size > 1) return failed('conflict','YouTube returned conflicting channel identities. Open the channel directly and try again.');
    if (ids.size !== 1) return failed('not-found','The public channel page did not expose a verified channel ID. You can add its permanent channel URL manually.');
    return { ok:true,channel:{ channelId:[...ids][0],name:name || candidate.name || candidate.handle,handle:candidate.handle,url:candidate.url } };
  }

  function abortable(promise, signal) {
    if (signal.aborted) return Promise.reject(new Error('aborted'));
    return new Promise((resolve,reject) => {
      const abort = () => { cleanup(); reject(new Error('aborted')); };
      const cleanup = () => signal.removeEventListener('abort',abort);
      signal.addEventListener('abort',abort,{ once:true });
      Promise.resolve(promise).then(value => { cleanup(); resolve(value); },error => { cleanup(); reject(error); });
    });
  }

  async function bodyText(response, signal) {
    const declared = response.headers?.get?.('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > byteLimit)) throw new Error('size');
    if (!response.body?.getReader) throw new Error('stream');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8',{ fatal:true });
    let bytes = 0, text = '';
    try {
      for (;;) {
        const chunk = await abortable(reader.read(),signal);
        if (chunk.done) break;
        if (!ArrayBuffer.isView(chunk.value) || chunk.value.BYTES_PER_ELEMENT !== 1) throw new Error('stream');
        if ((bytes += chunk.value.byteLength) > byteLimit) throw new Error('size');
        text += decoder.decode(chunk.value,{ stream:true });
      }
      return text + decoder.decode();
    } finally {
      try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* An aborted body is already closed. */ }
      try { reader.releaseLock(); } catch { /* A test or aborted reader may be unavailable. */ }
    }
  }

  function resultFor(channel, candidate, expires) {
    const result = Object.freeze({ ...channel,name:label(channel.name) || candidate.name || candidate.handle,handle:candidate.handle,url:candidate.url });
    verified.set(result,{ url:candidate.url,expires,generation });
    return { ok:true,channel:result };
  }

  async function lookup(input, { signal } = {}) {
    const candidate = candidateUrl(input?.url);
    if (!candidate || (input.handle !== undefined && input.handle !== candidate.handle) || typeof fetch !== 'function') return failed('invalid','Choose a creator handle from this video before looking up its channel.');
    candidate.name = label(input.name);
    if (signal?.aborted) return failed('cancelled','Channel lookup cancelled.');
    const timestamp = Number(now()), cached = cache.get(candidate.url);
    if (cached && Number.isFinite(timestamp) && cached.expires > timestamp) return resultFor(cached.channel,candidate,cached.expires);
    cache.delete(candidate.url);
    if (active.size >= 4) return failed('busy','Another channel lookup is still finishing. Please try again.');
    const controller = new AbortController(), requestGeneration = generation;
    const externalAbort = () => controller.abort();
    signal?.addEventListener('abort',externalAbort,{ once:true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); },timeout);
    active.add(controller);
    try {
      // These public-page flags avoid YouTube's cookie-consent redirect. Never
      // follow a redirect: a renamed or unavailable handle can be opened manually.
      const response = await abortable(fetch(candidate.url + '?cbrd=1&ucbcb=1',{ method:'GET',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal }),controller.signal);
      const bound = response && finalUrl(response.url,candidate);
      const type = response?.headers?.get?.('content-type') || '';
      if (!response?.ok || !bound || !/^text\/html(?:\s*;|\s*$)/i.test(type)) return failed('unavailable','The public channel page is unavailable or redirected to an unsupported page.');
      const html = await bodyText(response,controller.signal);
      if (controller.signal.aborted || generation !== requestGeneration) return failed('cancelled','Channel lookup cancelled.');
      const parsed = parseIdentity(html,candidate,bound);
      if (!parsed.ok) return parsed;
      const expires = Number(now()) + 600000;
      cache.set(candidate.url,{ channel:parsed.channel,expires });
      while (cache.size > 32) cache.delete(cache.keys().next().value);
      return resultFor(parsed.channel,candidate,expires);
    } catch (error) {
      if (controller.signal.aborted || generation !== requestGeneration) return failed(timedOut ? 'timeout' : 'cancelled',timedOut ? 'Channel lookup timed out. Please try again.' : 'Channel lookup cancelled.');
      return failed(error?.message === 'size' ? 'too-large' : 'unavailable',error?.message === 'size'
        ? 'The channel page exceeded the lookup size limit. Open the channel directly instead.' : 'The public channel page could not be read. Please try again.');
    } finally { clearTimeout(timer); active.delete(controller); signal?.removeEventListener('abort',externalAbort); }
  }

  function isVerified(candidate, channel) {
    const url = candidateUrl(candidate?.url), proof = channel && verified.get(channel);
    return Boolean(url && proof && proof.generation === generation && proof.url === url.url && proof.expires > Number(now()) && idPattern.test(channel.channelId));
  }

  function clear() {
    generation++; cache.clear(); verified = new WeakMap();
    for (const controller of active) controller.abort();
  }

  return Object.freeze({ lookup,isVerified,clear });
}
