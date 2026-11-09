// Language: en-GB. Native catalogue evidence only; no title or duration guesses.
export function classifyCatalogueFilm(card) {
  const selector = 'ytd-badge-supported-renderer,ytd-badge-supported-renderer .badge,ytd-badge-supported-renderer .badge-label,.ytBadgeShapeBadgeText,.yt-badge-shape__text,.ytThumbnailOverlayBadgeViewModelHost';
  const labels = [...card.querySelectorAll(selector)].map(node => (node.textContent || '').trim());
  let catalogue = card.matches('ytd-movie-renderer') || Boolean(card.querySelector('ytd-movie-renderer,ytd-badge-supported-renderer .badge-style-type-ypc,ytd-badge-supported-renderer .badge-style-type-ypc-green,ytd-badge-supported-renderer .badge-style-type-ypc-transparent'));
  const nativeData = node => {
    try { return typeof node?.componentProps?.data === 'function' ? node.componentProps.data() : (node?.inst || node?.polymerController || node)?.data; }
    catch { return null; }
  };
  const inspectBadge = badge => {
    badge = badge?.metadataBadgeRenderer || badge;
    if (!/^BADGE_STYLE_TYPE_YPC(?:_GREEN|_TRANSPARENT)?$/.test(badge?.style || '')) return;
    catalogue = true;
    if (typeof badge.label === 'string') labels.push(badge.label.trim());
  };
  for (const node of [card, card.querySelector('ytd-rich-grid-media'), card.querySelector('yt-lockup-view-model')].filter(Boolean)) {
    const model = nativeData(node);
    if (model?.movieRenderer || model?.content?.movieRenderer) catalogue = true;
    for (const candidate of [model, model?.videoRenderer, model?.content?.videoRenderer, model?.movieRenderer, model?.content?.movieRenderer])
      if (Array.isArray(candidate?.badges)) candidate.badges.slice(0, 8).forEach(inspectBadge);
  }
  for (const node of [...card.querySelectorAll('ytd-badge-supported-renderer')].slice(0, 8)) {
    const data = nativeData(node);
    (Array.isArray(data) ? data.slice(0, 8) : [data]).forEach(inspectBadge);
  }
  const free = labels.some(label => /^(?:Free(?: with ads)?|Gratis|Gratuit|Kostenlos|Gratuito|Grátis)$/iu.test(label));
  const paid = labels.some(label => /^(?:Buy or rent|Pay to watch|(?:Buy|Rent)(?: from)?(?:\s+.*)?|[£$€]\s*\d[\d.,]*)$/i.test(label));
  const rating = labels.some(label => /^(?:U|PG|12A?|15|18|G|PG-13|R|NC-17|TV-(?:Y7?|G|PG|14|MA)|Not rated|Unrated)$/i.test(label));
  catalogue ||= labels.some(label => /^(?:Movies?\s*(?:&|and)\s*TV|Buy or rent)$/i.test(label)) || (free || paid) && rating;
  if (!catalogue) return null;
  // Conflicting or absent price evidence is intentionally left visible.
  return free === paid ? 'unknown' : free ? 'free' : 'paid';
}
