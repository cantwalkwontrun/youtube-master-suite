// Self-contained: embedded by the builder. No network access or title matching.
export function createChannelAgeService(getStorage, now = () => Date.now()) {
  const key = "yt-master-suite.channel-age.v1";
  const idPattern = /^UC[A-Za-z0-9_-]{22}$/;
  const day = 86400000;
  const units = ["days", "weeks", "months", "years"];
  let current = [];
  let enabledRules = new Map();
  const resolvedHandles = new Map();
  let resolvedCards = new WeakMap();

  function normaliseChannelId(input) {
    if (typeof input !== "string") return null;
    const value = input.trim();
    if (idPattern.test(value)) return value;
    const match = /^https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/.exec(value);
    return match ? match[1] : null;
  }

  function label(input) {
    return typeof input === "string"
      ? input.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100)
      : "";
  }

  function validateRules(input) {
    if (!Array.isArray(input)) return [];
    const result = [];
    const seen = new Set();
    // Bound work even for a malformed manually edited storage record.
    for (const value of input.slice(0, 100)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const channelId = normaliseChannelId(value.channelId);
      if (!channelId || seen.has(channelId) || !Number.isInteger(value.maxAge) || value.maxAge < 1 || value.maxAge > 1000 || !units.includes(value.unit)) continue;
      if (value.enabled !== undefined && typeof value.enabled !== "boolean") continue;
      if (value.blocked !== undefined && typeof value.blocked !== "boolean") continue;
      seen.add(channelId);
      result.push({ channelId, name: label(value.name), maxAge: value.maxAge, unit: value.unit, enabled: value.enabled !== false, blocked: value.blocked === true });
    }
    return result;
  }

  function snapshot(rules) {
    return rules.map(rule => ({ ...rule }));
  }

  function setCurrent(rules) {
    current = snapshot(rules);
    enabledRules = new Map(current.filter(rule => rule.enabled).map(rule => [rule.channelId, rule]));
  }

  function storedRules(raw) {
    const record = raw && raw.length <= 65536 ? JSON.parse(raw) : null;
    return validateRules(record?.version === 1 ? record.rules : null);
  }

  function savedRulesAreWritable(raw) {
    if (raw === null) return true;
    if (typeof raw !== "string" || raw.length > 65536) return false;
    try {
      const record = JSON.parse(raw);
      if (!record || typeof record !== "object" || Array.isArray(record) ||
          Object.keys(record).some(name => name !== "version" && name !== "rules") ||
          record.version !== 1 || !Array.isArray(record.rules) || record.rules.length > 100) return false;
      const allowed = ["channelId", "name", "maxAge", "unit", "enabled", "blocked"];
      const normalised = validateRules(record.rules);
      if (normalised.length !== record.rules.length) return false;
      return record.rules.every((rule, index) =>
        Object.keys(rule).every(name => allowed.includes(name) &&
          JSON.stringify(rule[name]) === JSON.stringify(normalised[index][name])));
    } catch { return false; }
  }

  function read() {
    try {
      setCurrent(storedRules(getStorage().getItem(key)));
    } catch {
      // Unavailable/corrupted storage must not hide any videos.
      setCurrent([]);
    }
    return snapshot(current);
  }

  function save(input, expectedRules) {
    let rules;
    try { rules = validateRules(input); } catch { rules = []; }
    if (!Array.isArray(input) || input.length > 100 || rules.length !== input.length) {
      return { ok: false, error: "Use up to 100 unique channel IDs, each with a whole-number age from 1 to 1000 and a valid unit." };
    }
    const desired = JSON.stringify({ version: 1, rules });
    let storage, previous;
    try {
      storage = getStorage();
      previous = storage.getItem(key);
      if (!savedRulesAreWritable(previous)) {
        return { ok: false, error: "Saved channel filters are incompatible or damaged. Nothing was overwritten; recover the existing data before saving." };
      }
      if (expectedRules !== undefined) {
        let latest = [];
        try { latest = storedRules(previous); } catch { /* A corrupt record follows read()'s empty-rule fallback. */ }
        if (JSON.stringify(latest) !== JSON.stringify(expectedRules)) {
          setCurrent(latest);
          return { ok: false, error: 'Channel filters changed in another window. Your draft has been kept. Cancel and reopen before saving.' };
        }
      }
      storage.setItem(key, desired);
      setCurrent(rules);
      return { ok: true, rules: snapshot(rules) };
    } catch {
      // The live snapshot changes only after a successful complete write.
      // Preserve concurrent edits/clears rather than rolling back their values.
      try {
        if (previous !== undefined && storage?.getItem(key) === desired) {
          if (previous === null) storage.removeItem(key);
          else storage.setItem(key, previous);
        }
      } catch { /* Storage is unavailable; preserve the current in-memory rules. */ }
      return { ok: false, error: "Channel filters could not be saved. Browser storage is unavailable or full." };
    }
  }

  function getRules() {
    return snapshot(current);
  }

  function hasEnabledRules() {
    return enabledRules.size > 0;
  }

  function text(value) {
    if (typeof value === "string") return value.slice(0, 500);
    if (!value || typeof value !== "object") return "";
    if (typeof value.simpleText === "string") return value.simpleText.slice(0, 500);
    if (typeof value.content === "string") return value.content.slice(0, 500);
    return Array.isArray(value.runs) ? value.runs.slice(0, 10).map(run => typeof run?.text === "string" ? run.text : "").join("").slice(0, 500) : "";
  }

  function records(card) {
    const found = [];
    const nodes = [card, ...Array.from(card?.querySelectorAll?.("ytd-rich-grid-media, yt-lockup-view-model, ytm-lockup-view-model") || []).slice(0, 4)];
    for (const node of nodes) {
      let controller, componentData;
      try {
        controller = node?.polymerController || (typeof node?.getPolymerController === "function" ? node.getPolymerController() : null);
      } catch { /* An unavailable renderer controller must not prevent DOM identity checks. */ }
      try {
        if (typeof node?.componentProps?.data === "function") componentData = node.componentProps.data();
      } catch { /* A detached current component retains the existing DOM/legacy fallback. */ }
      for (const read of [() => node?.data, () => node?.__data?.data, () => controller?.data, () => controller?.__data?.data, () => componentData]) {
        let value;
        try { value = read(); } catch { continue; }
        if (!value || typeof value !== "object") continue;
        found.push(value);
        for (const readCandidate of [() => value.videoRenderer, () => value.compactVideoRenderer, () => value.gridVideoRenderer, () => value.content?.videoRenderer, () => value.content?.richItemRenderer?.content?.videoRenderer, () => value.lockupViewModel]) {
          let candidate;
          try { candidate = readCandidate(); } catch { continue; }
          if (candidate && typeof candidate === "object") found.push(candidate);
        }
      }
    }
    return found.slice(0, 30);
  }

  function metadataParts(record) {
    const rows = record?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows
      || record?.metadata?.contentMetadataViewModel?.metadataRows;
    return Array.isArray(rows) ? rows.slice(0, 4).flatMap(row => Array.isArray(row?.metadataParts) ? row.metadataParts.slice(0, 5) : []) : [];
  }

  function metadataRows(record) {
    const rows = record?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows
      || record?.metadata?.contentMetadataViewModel?.metadataRows;
    return Array.isArray(rows) ? rows.slice(0, 4) : [];
  }

  function collaboratorItems(record) {
    const stack = record.metadata?.lockupMetadataViewModel?.image?.avatarStackViewModel;
    const items = stack?.rendererContext?.commandContext?.onTap?.innertubeCommand?.showDialogCommand
      ?.panelLoadingStrategy?.inlineContent?.dialogViewModel?.customContent?.listViewModel?.listItems;
    if (!Array.isArray(stack?.avatars) || stack.avatars.length < 2 || stack.avatars.length > 10 ||
        !Array.isArray(items) || items.length < 2 || items.length > 10) return [];
    const creators = items.map(item => item?.listItemViewModel);
    return creators.every(creator => normaliseChannelId(creator?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.browseId))
      ? creators : [];
  }

  const bylineSelector = [
    "#channel-name a[href]", "#byline a[href]", "ytd-channel-name a[href]",
    ".yt-content-metadata-view-model__metadata-text a[href]",
    ".yt-content-metadata-view-model__metadata-row a[href]",
    ".ytContentMetadataViewModelMetadataText a[href]",
  ].join(",");

  function handleFromUrl(value) {
    if (typeof value !== 'string' || value.length > 1024) return null;
    try {
      const url = new URL(value, 'https://www.youtube.com');
      if (url.origin !== 'https://www.youtube.com' || url.username || url.password || url.search || url.hash) return null;
      const match = /^\/@([^/]+)\/?$/.exec(url.pathname);
      if (!match) return null;
      const handle = decodeURIComponent(match[1]);
      if (!handle || handle.length > 100 || /[\s\u0000-\u001f\u007f<>?&#%/\\@]/u.test(handle)) return null;
      return { handle: `@${handle}`, url: `https://www.youtube.com/@${encodeURIComponent(handle)}` };
    } catch { return null; }
  }

  function channelCandidatesFromRecords(card, data) {
    const candidates = new Map();
    const groups = [], domGroups = new Map();
    const token = command => normaliseChannelId(command?.browseEndpoint?.browseId) ||
      handleFromUrl(command?.browseEndpoint?.canonicalBaseUrl || command?.commandMetadata?.webCommandMetadata?.url || command?.urlEndpoint?.url)?.url;
    function group(values) {
      const unique = [...new Set(values.filter(Boolean))];
      if (unique.length > 1) groups.push(unique);
    }
    function add(id, name, priority = 1) {
      const channelId = normaliseChannelId(id);
      if (!channelId) return;
      const named = label(name), existing = candidates.get(channelId);
      if (!existing || (named && (!existing.name || priority > existing.priority))) candidates.set(channelId, { channelId, name: named, priority });
    }
    for (const anchor of Array.from(card.querySelectorAll(bylineSelector)).slice(0, 20)) {
      const href = anchor.getAttribute("href") || "";
      add(href.startsWith("/channel/") ? `https://www.youtube.com${href}` : href, anchor.textContent, 3);
      const value = normaliseChannelId(href.startsWith('/channel/') ? `https://www.youtube.com${href}` : href) || handleFromUrl(href)?.url;
      const container = anchor.closest?.('#channel-name, #byline, ytd-channel-name, .yt-content-metadata-view-model__metadata-row, .ytContentMetadataViewModelMetadataRow') || anchor.parentElement;
      if (value && container && container !== card) {
        const values = domGroups.get(container) || [];
        values.push(value); domGroups.set(container, values);
      }
    }
    for (const record of data) {
      // Current History lockups keep the owner endpoint on the avatar, while
      // their visible byline is plain text rather than a clickable channel link.
      const avatar = record.metadata?.lockupMetadataViewModel?.image?.decoratedAvatarViewModel;
      add(avatar?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.browseId,
        text(metadataParts(record)[0]?.text));
      // Current collaboration cards put both permanent creator endpoints in
      // their avatar stack's inline channel-choice dialog, not in its images.
      const collaborators = collaboratorItems(record);
      group(collaborators.map(creator => token(creator.rendererContext.commandContext.onTap.innertubeCommand)));
      for (const creator of collaborators) add(creator.rendererContext.commandContext.onTap.innertubeCommand.browseEndpoint.browseId, text(creator.title), 5);
      for (const byline of [record.ownerText, record.shortBylineText, record.longBylineText]) {
        group((Array.isArray(byline?.runs) ? byline.runs.slice(0, 5) : []).map(run => token(run?.navigationEndpoint)));
        for (const run of Array.isArray(byline?.runs) ? byline.runs.slice(0, 5) : []) {
          add(run?.navigationEndpoint?.browseEndpoint?.browseId, run?.text, 4);
        }
      }
      for (const row of metadataRows(record)) group((Array.isArray(row?.metadataParts) ? row.metadataParts.slice(0, 5) : [])
        .flatMap(part => Array.isArray(part?.text?.commandRuns) ? part.text.commandRuns.slice(0, 5) : [])
        .map(run => token(run?.onTap?.innertubeCommand || run?.onTap)));
      for (const part of metadataParts(record)) {
        for (const run of Array.isArray(part?.text?.commandRuns) ? part.text.commandRuns.slice(0, 5) : []) {
          const command = run?.onTap?.innertubeCommand || run?.onTap;
          const content = text(part.text);
          const hasRange = Number.isInteger(run?.startIndex) && Number.isInteger(run?.length) &&
            run.startIndex >= 0 && run.length > 0 && run.startIndex + run.length <= content.length;
          add(command?.browseEndpoint?.browseId, hasRange ? content.slice(run.startIndex, run.startIndex + run.length) : content, hasRange ? 4 : 2);
        }
      }
    }
    for (const values of domGroups.values()) group(values);
    return { channels: [...candidates.values()].map(({ channelId, name }) => ({ channelId, name: name || channelId })), groups };
  }

  function channelFromRecords(card, data) {
    const identity = identityFromRecords(card, data);
    return identity.status === 'unique' ? identity.channels[0] : null;
  }

  function channelFromCard(card) {
    return card?.querySelectorAll ? channelFromRecords(card, records(card)) : null;
  }

  function channelCandidatesFromCard(card) {
    const identity = channelIdentityFromCard(card);
    return identity.status === 'conflict' ? [] : identity.channels;
  }

  function handlesFromRecords(card, data) {
    if (!card?.querySelectorAll) return [];
    const candidates = new Map(), identified = new Set();
    function add(value, name, id) {
      const candidate = handleFromUrl(value);
      if (!candidate) return;
      if (normaliseChannelId(id)) { identified.add(candidate.url); return; }
      const existing = candidates.get(candidate.url);
      if (!existing || (!existing.name && label(name))) candidates.set(candidate.url, { ...candidate, name: label(name) });
    }
    function endpoint(command, name) {
      if (!command || typeof command !== 'object') return;
      const id = command.browseEndpoint?.browseId;
      add(command.browseEndpoint?.canonicalBaseUrl, name, id);
      add(command.commandMetadata?.webCommandMetadata?.url, name, id);
      add(command.urlEndpoint?.url, name, id);
    }
    for (const anchor of Array.from(card.querySelectorAll(bylineSelector)).slice(0, 20)) add(anchor.getAttribute('href'), anchor.textContent);
    for (const record of data) {
      const avatar = record.metadata?.lockupMetadataViewModel?.image?.decoratedAvatarViewModel;
      endpoint(avatar?.rendererContext?.commandContext?.onTap?.innertubeCommand, text(metadataParts(record)[0]?.text));
      for (const creator of collaboratorItems(record)) endpoint(creator.rendererContext.commandContext.onTap.innertubeCommand,text(creator.title));
      for (const byline of [record.ownerText, record.shortBylineText, record.longBylineText]) {
        for (const run of Array.isArray(byline?.runs) ? byline.runs.slice(0, 5) : []) endpoint(run?.navigationEndpoint, run?.text);
      }
      for (const part of metadataParts(record)) {
        const content = text(part.text);
        for (const run of Array.isArray(part?.text?.commandRuns) ? part.text.commandRuns.slice(0, 5) : []) {
          const hasRange = Number.isInteger(run?.startIndex) && Number.isInteger(run?.length) &&
            run.startIndex >= 0 && run.length > 0 && run.startIndex + run.length <= content.length;
          endpoint(run?.onTap?.innertubeCommand || run?.onTap, hasRange ? content.slice(run.startIndex, run.startIndex + run.length) : content);
        }
      }
    }
    return [...candidates.values()].filter(candidate => !identified.has(candidate.url)).slice(0, 10)
      .map(candidate => ({ ...candidate, name: candidate.name || candidate.handle }));
  }

  function freshResolution(url) {
    const entry = resolvedHandles.get(url);
    if (!entry) return null;
    const timestamp = Number(now());
    if (!Number.isFinite(timestamp) || entry.expires <= timestamp) { resolvedHandles.delete(url); return null; }
    return entry.channel;
  }

  function identityFromRecords(card, data) {
    const found = channelCandidatesFromRecords(card, data), rawHandles = handlesFromRecords(card, data);
    const channels = new Map(found.channels.map(channel => [channel.channelId, channel]));
    const handles = [];
    for (const candidate of rawHandles) {
      const channel = freshResolution(candidate.url);
      if (channel) channels.set(channel.channelId, { channelId: channel.channelId, name: candidate.name || channel.name });
      else handles.push(candidate);
    }
    const values = [...channels.values()];
    let status = values.length === 0 ? 'missing' : values.length === 1 ? 'unique' : 'conflict';
    if (values.length > 0 && values.length <= 10 && found.groups.some(group => {
      const ids = new Set(group.map(value => normaliseChannelId(value) || freshResolution(value)?.channelId).filter(Boolean));
      const unresolvedCreator = handles.some(handle => group.includes(handle.url));
      return values.every(channel => ids.has(channel.channelId)) && (ids.size > 1 || unresolvedCreator);
    })) status = 'multiple';
    if (values.length > 10) return { status:'conflict', channels:[], handles:[] };
    return { status, channels:values, handles };
  }

  function channelIdentityFromCard(card) {
    return card?.querySelectorAll ? identityFromRecords(card, records(card)) : { status:'missing',channels:[],handles:[] };
  }

  function handleCandidatesFromCard(card) {
    return channelIdentityFromCard(card).handles;
  }

  function rememberResolvedChannel(card, candidate, channel, expectedVideoId) {
    const url = handleFromUrl(candidate?.url), id = normaliseChannelId(channel?.channelId);
    const videoId = videoIdFromCard(card);
    if (!url || !id || !videoId || (expectedVideoId !== undefined && expectedVideoId !== videoId) ||
        channel?.url !== url.url || channel?.handle !== url.handle) return { ok:false,error:'The selected channel or video changed. Reopen its menu and try again.' };
    const available = handlesFromRecords(card, records(card));
    if (!available.some(handle => handle.url === url.url && handle.handle === url.handle)) return { ok:false,error:'The selected creator is no longer present on this video.' };
    const timestamp = Number(now());
    if (!Number.isFinite(timestamp)) return { ok:false,error:'Channel lookup could not be retained. Please try again.' };
    const value = { channelId:id,name:label(channel.name) || available.find(handle => handle.url === url.url).name,handle:url.handle,url:url.url };
    const expires = timestamp + 600000;
    resolvedCards.set(card, { videoId,url:url.url,channel:value,expires });
    resolvedHandles.delete(url.url);
    resolvedHandles.set(url.url, { channel:value,expires });
    while (resolvedHandles.size > 32) resolvedHandles.delete(resolvedHandles.keys().next().value);
    return { ok:true,channel:{ ...value } };
  }

  function isResolvedChannel(card, url, channelId, expectedVideoId) {
    const binding = resolvedCards.get(card), candidate = handleFromUrl(url), timestamp = Number(now());
    if (!binding || !candidate || binding.url !== candidate.url || binding.channel.channelId !== channelId ||
        !Number.isFinite(timestamp) || binding.expires <= timestamp || binding.videoId !== expectedVideoId || videoIdFromCard(card) !== expectedVideoId) return false;
    return handlesFromRecords(card, records(card)).some(handle => handle.url === candidate.url);
  }

  function videoIdFromCard(card) {
    if (!card?.querySelectorAll) return null;
    const ids = new Set();
    for (const anchor of Array.from(card.querySelectorAll('a[href]')).slice(0, 40)) {
      try {
        const url = new URL(anchor.getAttribute('href'), 'https://www.youtube.com');
        if (url.origin !== 'https://www.youtube.com') continue;
        const id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/shorts\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
        if (typeof id === 'string' && /^[\w-]{11}$/.test(id)) ids.add(id);
      } catch { /* Malformed links cannot identify a confirmation target. */ }
    }
    if (ids.size !== 1) return null;
    const [id] = ids;
    for (const record of records(card)) {
      if (record.videoId && record.videoId !== id) return null;
      if (record.contentType && record.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
      if (record.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && record.contentId && record.contentId !== id) return null;
    }
    return id;
  }

  function liveOrUpcoming(card, data) {
    if (card.matches?.('[data-ytppl-upcoming-hidden="1"]') || card.querySelector('[overlay-style="LIVE"], [overlay-style="UPCOMING"], [data-ytppl-upcoming-hidden="1"]')) return true;
    for (const element of Array.from(card.querySelectorAll("ytd-badge-supported-renderer, ytd-thumbnail-overlay-time-status-renderer, .yt-badge-shape__text, .ytBadgeShapeBadgeText")).slice(0, 20)) {
      if (/^(?:live|live now|upcoming|premiere|scheduled)$/i.test(String(element.textContent || "").trim())) return true;
    }
    return data.some(record => record.isLiveNow === true || Boolean(record.upcomingEventData)
      || (Array.isArray(record.badges) && record.badges.slice(0, 5).some(badge => /LIVE_NOW|UPCOMING/.test(badge?.metadataBadgeRenderer?.style || "")))
      || (Array.isArray(record.thumbnailOverlays) && record.thumbnailOverlays.slice(0, 5).some(overlay => /^(?:LIVE|UPCOMING)$/.test(overlay?.thumbnailOverlayTimeStatusRenderer?.style || ""))));
  }

  function subtractMonths(timestamp, count) {
    const date = new Date(timestamp);
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - count);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
    return date.getTime();
  }

  function cutoff(rule, timestamp) {
    if (rule.unit === "months" || rule.unit === "years") return subtractMonths(timestamp, rule.maxAge * (rule.unit === "years" ? 12 : 1));
    return timestamp - rule.maxAge * (rule.unit === "weeks" ? 7 : 1) * day;
  }

  function compareAgeLimits(left, right, timestamp = Number(now())) {
    if (left.blocked !== right.blocked) return left.blocked ? -1 : 1;
    if (left.blocked || !Number.isFinite(timestamp)) return 0;
    // Use the filter's calendar-aware cutoffs, not approximate month/year lengths.
    return cutoff(right, timestamp) - cutoff(left, timestamp);
  }

  function latestPublication(value, timestamp) {
    const source = String(value || "").replace(/\s+/g, " ").trim();
    const relative = /^(?:(?:streamed|premiered)\s+)?(\d{1,4})\s+(second|sec|minute|min|hour|hr|day|week|wk|month|mo|year|yr)s?\.?\s+ago$/i.exec(source);
    if (relative) {
      const number = Number(relative[1]);
      if (!number || number > 1000) return null;
      // YouTube rounds relative labels. Use the youngest possible date, never
      // a midpoint. Months use 28 days so short calendar months remain safe.
      // Compact English labels use the same conservative bounds as full units.
      // Do not guess single-letter forms such as "m", which could mean minutes
      // or months, or accept a date fragment embedded in unrelated card text.
      const minimumMs = { second: 1000, sec: 1000, minute: 60000, min: 60000, hour: 3600000, hr: 3600000,
        day, week: 7 * day, wk: 7 * day, month: 28 * day, mo: 28 * day, year: 365 * day, yr: 365 * day }[relative[2].toLowerCase()];
      return timestamp - number * minimumMs;
    }
    if (/^(?:today|yesterday|just now)$/i.test(source)) return timestamp;
    if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(source)) {
      const result = Date.parse(source);
      if (!Number.isFinite(result)) return null;
      // Reject date overflow such as February 31 rather than normalising it.
      if (new Date(result).toISOString().slice(0, 10) !== source.slice(0, 10)) return null;
      return source.length === 10 ? result + day - 1 : result;
    }
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const absolute = /^(?:(?:streamed|premiered)\s+(?:on\s+)?)?([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})$/i.exec(source)
      || /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(source);
    if (!absolute) return null;
    const monthFirst = /^[A-Za-z]/.test(absolute[1]);
    const month = months[(monthFirst ? absolute[1] : absolute[2]).slice(0, 3).toLowerCase()];
    const date = Number(monthFirst ? absolute[2] : absolute[1]);
    const year = Number(absolute[3]);
    if (month === undefined || year < 2005 || year > 9999 || date < 1 || date > 31) return null;
    const result = new Date(Date.UTC(year, month, date));
    if (result.getUTCMonth() !== month || result.getUTCDate() !== date) return null;
    return result.getTime() + day - 1;
  }

  function isOlderThanRule(card, rule, data) {
    const timestamp = Number(now());
    if (!Number.isFinite(timestamp)) return false;
    if (liveOrUpcoming(card, data)) return false;
    const dates = [];
    for (const record of data) {
      dates.push(text(record.publishedTimeText));
      for (const part of metadataParts(record)) dates.push(text(part.text));
    }
    const selector = '#metadata-line > span, #metadata-line > yt-formatted-string, #metadata > span, .yt-content-metadata-view-model__metadata-text, .ytContentMetadataViewModelMetadataText, time[datetime]';
    for (const element of Array.from(card.querySelectorAll(selector)).slice(0, 20)) {
      dates.push(element.getAttribute("datetime") || element.textContent);
    }
    const publications = dates.map(value => latestPublication(value, timestamp)).filter(value => value !== null);
    // A fresh DOM date alongside stale renderer data must keep the card visible
    // while YouTube recycles it. Ambiguous dates therefore fail open.
    return publications.length > 0 && Math.max(...publications) < cutoff(rule, timestamp);
  }

  function cardFilterReason(card) {
    if (!enabledRules.size || !card?.querySelectorAll) return null;
    // Renderers can be recycled between calls; share this snapshot only here.
    const data = records(card);
    const identity = identityFromRecords(card, data);
    if (!['unique', 'multiple'].includes(identity.status)) return null;
    const rules = identity.channels.map(channel => enabledRules.get(channel.channelId)).filter(Boolean);
    if (!rules.length) return null;
    // Suite-owned blocks are not YouTube recommendation-feedback history.
    // Deliberately hide all uploads, including undated/live cards, but only
    // on the feed surfaces selected by the caller.
    if (rules.some(rule => rule.blocked)) return "Channel hidden";
    return rules.some(rule => isOlderThanRule(card, rule, data)) ? "Channel age" : null;
  }

  function isCardTooOld(card) {
    return cardFilterReason(card) === "Channel age";
  }

  read();
  return { key, normaliseChannelId, validateRules, read, save, getRules, hasEnabledRules, channelFromCard, channelCandidatesFromCard, handleCandidatesFromCard, channelIdentityFromCard, rememberResolvedChannel, rememberLookup:rememberResolvedChannel, isResolvedChannel, videoIdFromCard, compareAgeLimits, cardFilterReason, isCardTooOld };
}
