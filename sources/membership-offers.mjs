// Language: en-GB. Dismiss only recognised native membership offers, using native teardown.
export function installMembershipOffers({ document, window, preferences = {}, MutationObserver = window.MutationObserver }) {
  if (preferences.dismissMembershipOffers !== true) return () => {};

  const containerSelector = 'ytd-popup-container';
  const dialogSelector = 'tp-yt-paper-dialog';
  const offerSelector = 'ytd-sponsorships-offer-renderer, ytd-sponsorships-offer-with-video-renderer';
  let containers = [], states = new WeakMap(), disposed = false, suspended = false, scheduled = false, generation = 0;
  let pageSuspended = false, navigating = false;
  const topology = new MutationObserver(refreshRoots);
  const popups = new MutationObserver(popupMutated);

  function visible(element) {
    if (!element?.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const box = element.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  }

  function nativeDismiss(dialog, offer) {
    // Polymer's native close/cancel path owns the backdrop and scroll lock.
    // Never call a purchase endpoint, remove the dialog, or click arbitrary text.
    let owner;
    try { owner = dialog.polymerController || dialog.getPolymerController?.(); } catch {
      // A private controller can be inaccessible while a native method or
      // explicit dismissal control on the dialog remains available.
    }
    for (const target of [dialog, owner]) {
      if (!target) continue;
      for (const method of ['close', 'cancel']) {
        try {
          const action = target[method];
          if (typeof action === 'function') return () => action.call(target);
        } catch { /* An unavailable native method is not permission to guess. */ }
      }
    }
    const candidates = [...offer.querySelectorAll('#close-button, [dialog-dismiss]')].flatMap(node =>
      node.matches('button, tp-yt-paper-icon-button, yt-icon-button') ? [node] :
        [...node.querySelectorAll('button, tp-yt-paper-icon-button, yt-icon-button')]);
    const controls = [...new Set(candidates)].filter(button =>
      button.closest(dialogSelector) === dialog && !button.hasAttribute('dialog-confirm') &&
      !button.closest('[dialog-confirm]') && !button.disabled && !button.hasAttribute('disabled') &&
      button.getAttribute('aria-disabled') !== 'true' && visible(button));
    return controls.length === 1 ? () => controls[0].click() : null;
  }

  function inspect(dialog) {
    if (!dialog.closest(containerSelector) || !visible(dialog) || dialog.opened === false) {
      states.delete(dialog); return;
    }
    // Native offer content is the dialog's own renderer. A nested/retained offer
    // inside another flow is insufficient; payment frames remain untouched.
    const offers = [...dialog.children].filter(node => node.matches(offerSelector) && visible(node));
    if (offers.length !== 1 || dialog.querySelector('iframe, ytd-purchase-flow-renderer, yt-confirm-dialog-renderer, ytd-confirm-dialog-renderer, ytd-report-form-modal-renderer') || [...dialog.children].some(node =>
      node !== offers[0] && /(?:^|-)renderer$/.test(node.localName) && visible(node))) {
      return;
    }
    const offer = offers[0];
    let state = states.get(dialog);
    if (!state) { state = { attempted: false }; states.set(dialog, state); }
    if (state.attempted) return;
    const dismiss = nativeDismiss(dialog, offer);
    if (!dismiss) return; // A later stamped native close control can be discovered.
    state.attempted = true;
    try { dismiss(); } catch { /* Leave an unsupported/refused native dialog usable; never retry in a loop. */ }
  }

  function scan() {
    for (const container of containers) {
      if (!container.isConnected) continue;
      for (const dialog of container.querySelectorAll(dialogSelector)) {
        try { inspect(dialog); } catch { /* A partially initialised native dialog cannot block other popups. */ }
      }
    }
  }

  function schedule() {
    if (disposed || suspended || scheduled) return;
    scheduled = true;
    const request = generation;
    window.queueMicrotask(() => {
      if (request !== generation) return;
      scheduled = false;
      if (!disposed && !suspended) scan();
    });
  }

  function popupMutated(mutations) {
    // A refused dismissal is never retried during the same opening. Its
    // internal video/text churn therefore needs no repeated layout checks.
    // Keep observing the dialog itself and ancestors so a real close/reopen
    // or another native popup still updates the bounded dismissal state.
    if (mutations.some(mutation => {
      const dialog = mutation.target?.closest?.(dialogSelector);
      return !dialog || mutation.target === dialog || !states.get(dialog)?.attempted;
    })) schedule();
  }

  function refreshRoots() {
    if (disposed || suspended) return;
    // Observe document/app topology only at their immediate children. Native
    // popup events discover unusual nested containers without watching feeds.
    topology.disconnect();
    for (const root of new Set([document.documentElement, document.body, ...document.querySelectorAll('ytd-app')])) {
      if (root) topology.observe(root, { childList: true });
    }
    const next = [...document.querySelectorAll(containerSelector)];
    if (next.length !== containers.length || next.some((root, index) => root !== containers[index])) {
      popups.disconnect(); containers = next;
      for (const root of containers) popups.observe(root, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['opened', 'hidden', 'aria-hidden', 'inert', 'style', 'class', 'disabled'] });
    }
    schedule();
  }

  function opened() { refreshRoots(); }
  function closed(event) {
    // A dropdown inside the offer can emit the same bubbling event without
    // closing its parent dialog. Only that dialog's own close resets its guard.
    const dialog = event.target;
    if (dialog?.matches?.(dialogSelector)) states.delete(dialog);
  }
  function suspend() {
    suspended = true; generation++; scheduled = false;
    topology.disconnect(); popups.disconnect(); containers = []; states = new WeakMap();
  }
  function resume() {
    if (disposed || pageSuspended || navigating) return;
    suspended = false; refreshRoots();
  }
  function navigationStarted() { navigating = true; suspend(); }
  function navigationFinished() { navigating = false; resume(); }
  function pageHidden() { pageSuspended = true; suspend(); }
  function pageShown() {
    const restoring = pageSuspended;
    pageSuspended = false;
    // A restored page no longer owns the navigation interrupted by pagehide.
    if (restoring) navigating = false;
    resume();
  }
  const listeners = [
    ['yt-popup-opened', opened], ['iron-overlay-opened', opened],
    ['iron-overlay-closed', closed], ['yt-popup-closed', closed],
    ['yt-navigate-start', navigationStarted], ['yt-navigate-finish', navigationFinished], ['yt-page-data-updated', opened],
    ['pagehide', pageHidden], ['pageshow', pageShown], ['DOMContentLoaded', opened],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  refreshRoots();
  return function disposeMembershipOffers() {
    if (disposed) return;
    suspend(); disposed = true;
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
  };
}
