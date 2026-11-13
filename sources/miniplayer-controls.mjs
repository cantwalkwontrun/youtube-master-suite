// Language: en-GB. Native queue navigation; never rewrites or reorders a queue.
export function installMiniplayerControls({ document, window, preferences = {}, MutationObserver = window.MutationObserver }) {
  const navigation = preferences.miniplayerNavigation !== false;
  const style = document.createElement('style');
  style.id = 'ytms-miniplayer-controls-style';
  style.textContent = `
    ytd-miniplayer .ytp-miniplayer-ui .ytp-play-button { position:relative !important; }
    /* Native control tooltips can retain zero inline width after minimisation.
       Correct only the hovered/focused central control, never seek previews. */
    ytd-miniplayer #movie_player:has(.ytp-miniplayer-ui .ytp-play-button:is(:hover,:focus-visible)):not(:has(:is(button,[role="button"]):not(.ytp-play-button):hover)) .ytp-tooltip.ytp-bottom:not(.ytp-preview) {
      width:max-content !important;height:auto !important;max-width:calc(100% - 16px) !important;
      left:var(--ytms-mini-play-tip-x,50%) !important;right:auto !important;
      top:var(--ytms-mini-play-tip-y,calc(50% - 30px)) !important;bottom:auto !important;
      transform:translate(-50%,-100%) !important;
    }
    ytd-miniplayer #movie_player:has(.ytp-miniplayer-ui .ytp-play-button:is(:hover,:focus-visible)):not(:has(:is(button,[role="button"]):not(.ytp-play-button):hover)) .ytp-tooltip.ytp-bottom:not(.ytp-preview) .ytp-tooltip-text-wrapper {
      width:max-content !important;height:auto !important;max-width:100% !important;
    }
    ytd-miniplayer #movie_player:has(.ytp-miniplayer-ui .ytp-play-button:is(:hover,:focus-visible)):not(:has(:is(button,[role="button"]):not(.ytp-play-button):hover)) .ytp-tooltip.ytp-bottom:not(.ytp-preview) .ytp-tooltip-bottom-text {
      width:max-content !important;height:auto !important;max-width:100% !important;box-sizing:border-box;white-space:nowrap;
    }
    [data-ytms-mini-navigation] .ytp-miniplayer-controls { width:min(100%,264px); }
    [data-ytms-mini-navigation] .ytp-miniplayer-controls :is(.ytp-prev-button,.ytp-next-button) svg,
    [data-ytms-mini-navigation] [data-ytms-mini-nav-button] { opacity:0; }
    [data-ytms-mini-navigation]:is(:hover,:focus-within) .ytp-miniplayer-controls :is(.ytp-prev-button,.ytp-next-button) svg,
    [data-ytms-mini-navigation]:is(:hover,:focus-within) [data-ytms-mini-nav-button] { opacity:1; }
    [data-ytms-mini-navigation]:is(:hover,:focus-within) [data-ytms-mini-nav-button]:disabled { opacity:.35; }
    [data-ytms-mini-nav-button] { position:relative;width:32px;height:32px;flex:0 0 32px;border-radius:50%;color:white;padding:0;border:0;background:transparent;cursor:pointer; }
    [data-ytms-mini-nav-button] svg { width:100%;height:100%;fill:currentColor;pointer-events:none; }
    [data-ytms-mini-nav-button]:not(:disabled):is(:hover,:focus-visible) { background:var(--yt-sys-color-baseline--overlay-button-secondary,rgba(255,255,255,.1)); }
    [data-ytms-mini-nav-button]:focus-visible { outline:2px solid white;outline-offset:2px; }
    ytd-miniplayer #movie_player:is(.ad-showing,.ad-interrupting) [data-ytms-mini-nav-button] { display:none; }
    /* Use YouTube's tooltip elements so its current theme owns the backing,
       opacity, typography and keyboard badge, including frosted-glass themes. */
    #ytms-mini-navigation-tooltip { position:absolute;z-index:1004;pointer-events:none;box-sizing:border-box;width:max-content;max-width:calc(100% - 16px);padding:0;border:0;outline:0;background:transparent;white-space:nowrap; }
    #ytms-mini-navigation-tooltip .ytp-tooltip-bottom-text { display:flex;align-items:center;width:max-content;max-width:100%;box-sizing:border-box; }
    #ytms-mini-navigation-tooltip .ytp-tooltip-keyboard-shortcut { display:inline-flex;align-items:center;justify-content:center;border:1px solid #ffffff4d;min-width:11px;border-radius:4px;margin-left:4px;color:#fff;padding:0 2px; }
  `;
  if (preferences.hideMiniplayerQueueMenu !== false) style.textContent += `
    /* Native renderer-stamper header slots only. Keep Save's top-level
       buttons, extension widgets, video menus and watch-page queues intact. */
    ytd-miniplayer ytd-playlist-panel-renderer > #container.ytd-playlist-panel-renderer > .header.ytd-playlist-panel-renderer :is(#playlist-action-menu,#overflow-menu,#overflow-menu-top-row).ytd-playlist-panel-renderer > ytd-menu-renderer > :is(yt-icon-button#button.dropdown-trigger.ytd-menu-renderer,yt-button-shape#button-shape.ytd-menu-renderer):not(:is(ytd-playlist-panel-video-renderer,yt-playlist-panel-video-renderer) *) { display:none !important; }
  `;
  if (!navigation) style.textContent += 'ytd-miniplayer .ytp-miniplayer-controls :is(.ytp-prev-button,.ytp-next-button){display:none !important;}';
  (document.head || document.documentElement).append(style);
  const anchors = new Map();
  const playSelector = 'ytd-miniplayer .ytp-miniplayer-ui .ytp-play-button';
  let observer = null;
  function activePlayButton() {
    const candidates = [...document.querySelectorAll(`${playSelector}:is(:hover,:focus-visible)`)].filter(visible);
    const hovered = candidates.filter(button => button.matches(':hover'));
    if (hovered.length) return hovered.length === 1 ? hovered[0] : null;
    const focused = candidates.filter(button => button.matches(':focus-visible'));
    return focused.length === 1 ? focused[0] : null;
  }
  function restoreAnchors(except=null){
    for(const [player,values]of anchors)if(player!==except){
      for(const [name,old]of values)if(player.style.getPropertyValue(name)===old.written){if(old.value)player.style.setProperty(name,old.value,old.priority);else player.style.removeProperty(name);}
      anchors.delete(player);
    }
    if(!navigation && !anchors.size)observer?.disconnect();
  }
  function positionPlayTooltip(event) {
    if(disposed || suspended || navigating || document.hidden){restoreAnchors();return;}
    if(event && !event.target?.closest?.(playSelector))return;
    // An opacity-hidden retained Play control can keep keyboard focus. Give
    // the rendered pointer owner priority over focus in another generation.
    const button=activePlayButton();
    const player=button?.closest('#movie_player');
    if(!player){if(!event)restoreAnchors();return;}
    const box=player.getBoundingClientRect(),target=button.getBoundingClientRect();
    const sx=box.width/player.clientWidth,sy=box.height/player.clientHeight;if(!(sx>0&&sy>0))return;
    restoreAnchors(player);
    let saved=anchors.get(player);if(!saved){
      saved=new Map();anchors.set(player,saved);
      // With arrows disabled, only observe this hovered/focused player's
      // geometry while its native tooltip needs an anchor.
      if(!navigation)observer?.observe(player,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','inert']});
    }
    for(const [name,value] of [['--ytms-mini-play-tip-x',`${(target.left+target.width/2-box.left)/sx}px`],['--ytms-mini-play-tip-y',`${Math.max(0,(target.top-box.top)/sy-8)}px`]]){
      if(!saved.has(name))saved.set(name,{value:player.style.getPropertyValue(name),priority:player.style.getPropertyPriority(name),written:null});
      if(player.style.getPropertyValue(name)!==value)player.style.setProperty(name,value);
      saved.get(name).written=value;
    }
  }
  function releaseUnusedAnchors(event) {
    if(!event.target?.closest?.(playSelector))return;
    window.queueMicrotask(()=>{
      const active=activePlayButton();
      restoreAnchors(active?.closest('#movie_player') || null);
    });
  }
  const refreshPlayTooltip=()=>positionPlayTooltip();
  document.addEventListener('pointerover',positionPlayTooltip,true);document.addEventListener('focusin',positionPlayTooltip,true);window.addEventListener('resize',refreshPlayTooltip,true);
  document.addEventListener('pointerout',releaseUnusedAnchors,true);document.addEventListener('focusout',releaseUnusedAnchors,true);
  function clearAnchors(){
    document.removeEventListener('pointerover',positionPlayTooltip,true);document.removeEventListener('focusin',positionPlayTooltip,true);window.removeEventListener('resize',refreshPlayTooltip,true);
    document.removeEventListener('pointerout',releaseUnusedAnchors,true);document.removeEventListener('focusout',releaseUnusedAnchors,true);
    restoreAnchors();
  }
  let disposed = false, suspended = false, navigating = false, frame = 0, generation = 0;
  const records = new Map(), hosts = new Set(), visibilityPaths = new Set();
  let tooltip = null, tooltipButton = null;
  function hideTooltip() {
    if (tooltipButton) {
      const ids=(tooltipButton.getAttribute('aria-describedby') || '').split(/\s+/).filter(id=>id && id!=='ytms-mini-navigation-tooltip');
      if(ids.length)tooltipButton.setAttribute('aria-describedby',ids.join(' '));else tooltipButton.removeAttribute('aria-describedby');
    }
    tooltip?.remove();tooltip=null;tooltipButton=null;
  }
  function positionTooltip() {
    const record=records.get(tooltipButton);
    if(!tooltip || !record || !visible(tooltipButton)){hideTooltip();return;}
    const box=record.player.getBoundingClientRect(),target=tooltipButton.getBoundingClientRect();
    const sx=box.width/record.player.clientWidth,sy=box.height/record.player.clientHeight;
    if(!(sx>0&&sy>0)){hideTooltip();return;}
    const left=`${Math.max(8,Math.min((target.left+target.width/2-box.left)/sx-tooltip.offsetWidth/2,record.player.clientWidth-tooltip.offsetWidth-8))}px`;
    const top=`${Math.max(0,(target.top-box.top)/sy-tooltip.offsetHeight-8)}px`;
    if(tooltip.style.left!==left)tooltip.style.left=left;
    if(tooltip.style.top!==top)tooltip.style.top=top;
  }
  function showTooltip(button) {
    hideTooltip();const record=records.get(button);
    if(disposed || suspended || navigating || !record || !visible(record.player))return;
    tooltipButton=button;tooltip=document.createElement('div');tooltip.id='ytms-mini-navigation-tooltip';tooltip.className='ytp-tooltip';tooltip.setAttribute('role','tooltip');
    const wrapper=document.createElement('div');wrapper.className='ytp-tooltip-text-wrapper';
    const backing=document.createElement('div');backing.className='ytp-tooltip-bottom-text';
    const label=document.createElement('span');label.className='ytp-tooltip-text';label.textContent=button.getAttribute('aria-label');
    const key=document.createElement('div');key.className='ytp-tooltip-keyboard-shortcut';key.textContent=button.getAttribute('aria-keyshortcuts');
    backing.append(label,key);wrapper.append(backing);tooltip.append(wrapper);record.player.append(tooltip);
    const ids=(button.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);ids.push(tooltip.id);button.setAttribute('aria-describedby',ids.join(' '));
    positionTooltip();
  }
  const selector = 'ytd-miniplayer,#movie_player,.ytp-miniplayer-ui,.ytp-miniplayer-controls';
  const visible = node => {
    if (!node?.isConnected || !node.getClientRects().length) return false;
    const box = node.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    for (let parent = node; parent; parent = parent.parentElement) {
      if (parent.hidden || parent.hasAttribute('inert') || parent.getAttribute('aria-hidden') === 'true') return false;
      const css = window.getComputedStyle(parent);
      if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) return false;
    }
    return true;
  };
  function clear() {
    generation++;
    hideTooltip();
    restoreAnchors();
    for (const button of records.keys()) button.remove();
    records.clear(); for (const host of hosts) host.removeAttribute('data-ytms-mini-navigation'); hosts.clear();
    visibilityPaths.clear();
  }
  function eligibility(player, direction) {
    try {
      const request=generation;
      const candidates = [...document.querySelectorAll('ytd-miniplayer #movie_player')].filter(visible);
      if (disposed || suspended || navigating || document.hidden || candidates.length !== 1 || candidates[0] !== player ||
          player.matches('.ad-showing,.ad-interrupting')) return false;
      const ids = player.getPlaylist?.(), current = player.getVideoData?.()?.video_id;
      if (!Array.isArray(ids) || ids.length < 2 || ids.length > 1000 || ids.some(id => typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) ||
          typeof player.getPlaylistIndex !== 'function') return false;
      const index = player.getPlaylistIndex(), method = direction < 0 ? 'previousVideo' : 'nextVideo';
      // The native index identifies the actual occurrence in duplicate queues.
      // A first-match search would disable valid later occurrences or guess.
      if (!Number.isInteger(index) || index < 0 || index >= ids.length || ids[index] !== current) return false;
      const available=index + direction >= 0 && index + direction < ids.length && typeof player[method] === 'function';
      return available && request===generation && !disposed && !suspended && !navigating && !document.hidden;
    } catch { return false; }
  }
  function create(player, direction) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ytp-button';
    button.setAttribute('data-ytms-mini-nav-button', direction < 0 ? 'previous' : 'next');
    button.setAttribute('aria-label', direction < 0 ? 'Previous video' : 'Next video');
    button.setAttribute('aria-keyshortcuts', direction < 0 ? 'Shift+P' : 'Shift+N');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
    const path = document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d', direction < 0 ? 'M6 6h2v12H6zm3 6 9-6v12z' : 'M16 6h2v12h-2zM6 6l9 6-9 6z');
    svg.append(path); button.append(svg);
    button.addEventListener('click', event => {
      if (!event.isTrusted) return;
      event.preventDefault(); event.stopPropagation();
      const request = generation;
      if (!eligibility(player, direction) || button.disabled) return;
      // One native action per activation; never retry an ambiguous result.
      try {
        const navigate = player[direction < 0 ? 'previousVideo' : 'nextVideo'];
        // Native accessors can synchronously suspend navigation while returning
        // a callable. Recheck ownership before invoking that captured method.
        if (request !== generation || disposed || suspended || navigating || document.hidden ||
            !button.isConnected || button.disabled || typeof navigate !== 'function') return;
        navigate.call(player);
      } catch { /* Native transition unavailable. */ }
      schedule();
    });
    records.set(button, { player, direction });
    button.addEventListener('mouseenter',()=>showTooltip(button));button.addEventListener('focus',()=>showTooltip(button));
    button.addEventListener('mouseleave',()=>{
      if(tooltipButton!==button)return;
      const focused=document.activeElement;
      if(records.has(focused))showTooltip(focused);else hideTooltip();
    });
    button.addEventListener('blur',()=>{if(tooltipButton===button && !button.matches(':hover'))hideTooltip();});
    return button;
  }
  function sync() {
    frame = 0;
    const request=generation, active=()=>request===generation && !disposed && !suspended && !navigating && !document.hidden;
    if (!active()) return;
    // Native layout changes can move a focused control without pointer events.
    // Keep the existing anchor current, including when navigation is disabled.
    if(anchors.size)refreshPlayTooltip();
    const activeHosts = new Set(), activePlayers = new Set();
    const players = navigation ? [...document.querySelectorAll('ytd-miniplayer #movie_player')] : [];
    visibilityPaths.clear();
    const playControls = new Map();
    for (const player of players) {
      const plays = [...player.querySelectorAll('.ytp-miniplayer-controls .ytp-play-button')];
      playControls.set(player, plays);
      // Retained players and arbitrary native wrappers can change visibility
      // without changing the player or Play button itself. Track only their
      // ancestor paths; unrelated page attributes still do not trigger work.
      for (const leaf of [player, ...plays]) for (let node=leaf;node;node=node.parentElement) visibilityPaths.add(node);
    }
    if (navigation) for (const player of players) {
      if(!active())return;
      if (!visible(player) || player.matches('.ad-showing,.ad-interrupting')) continue;
      const host = player.closest('ytd-miniplayer');
      // Native transitions can retain the previous, hidden controls row.
      // Bind via a single visible Play button, never its hidden template. The
      // row itself need not have a box (for example, display:contents).
      const plays = playControls.get(player).filter(visible);
      const play = plays.length === 1 ? plays[0] : null;
      const controls = play?.closest('.ytp-miniplayer-controls');
      if (!controls || !play) continue;
      activePlayers.add(player);
      activeHosts.add(host); hosts.add(host); if (!host.hasAttribute('data-ytms-mini-navigation')) host.setAttribute('data-ytms-mini-navigation','');
      for (const direction of [-1, 1]) {
        if(!active())return;
        const nativeClass = direction < 0 ? '.ytp-prev-button' : '.ytp-next-button';
        let button = [...records].find(([,record]) => record.player === player && record.direction === direction)?.[0];
        const native = [...controls.querySelectorAll(nativeClass)].find(visible);
        if (native) {
          const focused=button && document.activeElement===button;
          if(tooltipButton===button)hideTooltip();
          button?.remove(); if (button) records.delete(button);
          if(focused)(!native.disabled && native.getAttribute('aria-disabled')!=='true' ? native : play).focus({preventScroll:true});
          continue;
        }
        if (!button) button = create(player, direction);
        // Native versions use different wrapper names and can nest the button.
        // insertBefore requires an immediate child of this exact controls row.
        let anchor = play;
        while (anchor.parentElement && anchor.parentElement !== controls) anchor = anchor.parentElement;
        if (anchor.parentElement !== controls) continue;
        const placed = direction < 0 ? button.nextSibling === anchor : anchor.nextSibling === button;
        if (!placed) {
          const focused=document.activeElement===button;
          if(tooltipButton===button)hideTooltip();
          controls.insertBefore(button, direction < 0 ? anchor : anchor.nextSibling);
          if(focused){button.focus({preventScroll:true});if(!active())return;showTooltip(button);}
        }
        const disabled = !eligibility(player, direction);
        if(!active())return;
        if (button.disabled !== disabled) button.disabled = disabled;
        if(!active())return;
        if (button.getAttribute('aria-disabled') !== String(disabled)) button.setAttribute('aria-disabled', String(disabled));
      }
    }
    if(!active())return;
    for (const host of hosts) if (!activeHosts.has(host)) { host.removeAttribute('data-ytms-mini-navigation'); hosts.delete(host); }
    // A host can retain its hidden previous player during native adoption.
    // Host identity alone must not retain that player's controls and handlers.
    for (const [button,record] of records) if (!activePlayers.has(record.player) || !button.isConnected) { button.remove(); records.delete(button); }
    if(tooltipButton)positionTooltip();
  }
  function schedule() { if (!disposed && !suspended && !navigating && !frame) frame = window.requestAnimationFrame(sync); }
  observer = new MutationObserver(changes => {
    if(!navigation && !anchors.size)return;
    if (changes.some(change => change.type === 'attributes' ? visibilityPaths.has(change.target) || change.target.closest?.('.ytp-miniplayer-controls') || change.target.matches?.('#movie_player,ytd-miniplayer,.ytp-miniplayer-ui,.ytp-miniplayer-controls,.ytp-miniplayer-button-container,.ytp-miniplayer-play-button-container,.ytp-play-button,.ytp-prev-button,.ytp-next-button') :
      change.target.closest?.('.ytp-miniplayer-controls') || [...change.addedNodes,...change.removedNodes].some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector))))) schedule();
  });
  if(navigation)observer.observe(document.documentElement,{ childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','inert'] });
  const listeners = [];
  const on = (target,type,callback) => { target.addEventListener(type,callback,true);listeners.push([target,type,callback]); };
  for (const type of ['yt-playlist-data-updated','yt-page-data-updated','loadedmetadata']) on(window,type,schedule);
  on(window,'visibilitychange',()=>{refreshPlayTooltip();schedule();});
  for (const type of ['mouseenter','focusin']) on(window,type,event=>{ if(event.target?.closest?.('ytd-miniplayer')) schedule(); });
  on(window,'blur',event=>{if(event.target===window)hideTooltip();});on(document,'scroll',hideTooltip);on(window,'resize',hideTooltip);
  on(document,'keydown',event=>{if(event.key==='Escape')hideTooltip();});
  on(window,'pagehide',()=>{ suspended=true;clear(); });
  on(window,'pageshow',()=>{ const restoring=suspended;suspended=false;if(restoring)navigating=false;refreshPlayTooltip();schedule(); });
  on(window,'yt-navigate-start',()=>{ navigating=true;clear(); });
  on(window,'yt-navigate-finish',()=>{ navigating=false;refreshPlayTooltip();schedule(); });
  positionPlayTooltip();schedule();
  return () => { disposed=true;if(frame)window.cancelAnimationFrame(frame);observer.disconnect();clear();clearAnchors();style.remove();for(const [target,type,callback]of listeners)target.removeEventListener(type,callback,true); };
}
