// Language: en-GB. One queue menu; commands stay bound to native renderers.
export function installQueueHeaderActions({ document, window, preferences = {}, MutationObserver = window.MutationObserver }) {
  if (preferences.queueHeaderActions === false) return () => {};
  const panels = 'ytd-playlist-panel-renderer', slots = ':is(#playlist-action-menu,#overflow-menu,#overflow-menu-top-row).ytd-playlist-panel-renderer';
  const marker = 'data-ytms-queue-header-menu', sourceMarker = 'data-ytms-queue-header-source';
  const groups = new Map(), waiting = new Set(), failed = new WeakMap();
  let frame = 0, generation = 0, serial = 0, pendingKey = null, disposed = false, navigating = false, pageHidden = false;
  const owner = node => node?.polymerController || node?.getPolymerController?.() || node;
  const paused = () => disposed || navigating || pageHidden || document.hidden;
  function model(node) {
    try {
      const modern = typeof node?.componentProps?.data === 'function' ? node.componentProps.data() : null, legacy = owner(node)?.data;
      return modern && legacy && modern !== legacy ? null : modern || legacy;
    } catch { return null; }
  }
  function labelOf(item) {
    if (typeof item?.text?.simpleText === 'string') return item.text.simpleText.length <= 128 ? item.text.simpleText.trim() : '';
    const runs = item?.text?.runs;
    return Array.isArray(runs) && runs.length <= 16 && runs.every(run => typeof run?.text === 'string' && run.text.length <= 128) ? runs.map(run => run.text).join('').trim() : '';
  }
  function stamp(value) {
    try {
      let fields = 0;
      const json = JSON.stringify(value, (_key, entry) => { if (++fields > 1000 || typeof entry === 'string' && entry.length > 16384) throw Error('Bounded menu'); return entry; });
      return typeof json === 'string' && json.length < 65536 ? json : null;
    } catch { return null; }
  }
  function nativeItem(source) {
    if (!source || source.topLevelButtons?.length || source.items != null && !Array.isArray(source.items) || source.flexibleItems != null && !Array.isArray(source.flexibleItems)) return null;
    const direct = source.items || [], flexible = source.flexibleItems || [];
    const wrapper = direct.length === 1 && !flexible.length ? direct[0] : !direct.length && flexible.length === 1 ? flexible[0]?.menuFlexibleItemRenderer?.menuItem : null;
    const types = ['menuServiceItemRenderer','menuNavigationItemRenderer'].filter(key => wrapper?.[key]);
    return types.length === 1 ? { item:wrapper[types[0]], tag:types[0] === 'menuServiceItemRenderer' ? 'ytd-menu-service-item-renderer' : 'ytd-menu-navigation-item-renderer' } : null;
  }
  function proof(menu) {
    try {
      const panel = menu.closest(panels), header = menu.closest('.header.ytd-playlist-panel-renderer'), data = model(panel), source = model(menu), native = nativeItem(source);
      if (!menu.isConnected || !header || header.closest(panels) !== panel || !menu.parentElement?.matches(slots) || menu.closest('ytd-playlist-panel-video-renderer,yt-playlist-panel-video-renderer') ||
          typeof data?.playlistId !== 'string' || !/^TLPQ[\w-]{1,1020}$/.test(data.playlistId) || !Array.isArray(data.contents) || !data.contents.length || data.contents.length > 1000 || !native) return null;
      const label = labelOf(native.item), icon = native.item.icon?.iconType;
      const action = label === 'Save' && ['PLAYLIST_ADD','BOOKMARK','BOOKMARK_BORDER','ADD_TO_PLAYLIST'].includes(icon) ? 'save' : ['Clear','Clear queue'].includes(label) && menu.parentElement.id !== 'playlist-action-menu' ? 'clear' : null;
      const endpoint = native.item.serviceEndpoint || native.item.navigationEndpoint;
      const triggers = [...menu.querySelectorAll(':scope > yt-icon-button#button,:scope > yt-button-shape#button-shape')];
      if (!action || !endpoint || typeof endpoint !== 'object' || !triggers.length || triggers.length > 2 || new Set(triggers.map(trigger => trigger.localName)).size !== triggers.length) return null;
      const signature = stamp(native.item);
      return signature ? { menu, panel, header, source, ...native, action, signature, playlistId:data.playlistId } : null;
    } catch { return null; }
  }
  function same(left, right) { return right && left.menu === right.menu && left.panel === right.panel && left.header === right.header && left.source === right.source && left.item === right.item && left.signature === right.signature && left.playlistId === right.playlistId; }
  function findActions(panel) {
    const choices = { save:[], clear:[] }, selected = {};
    for (const menu of panel.querySelectorAll(`${slots} > ytd-menu-renderer`)) { const value = proof(menu); if (value?.panel === panel) choices[value.action].push(value); }
    for (const action of ['save','clear']) {
      const list = choices[action];
      if (!list.length || list.some(value => value.signature !== list[0].signature || value.header !== list[0].header)) return null;
      const previous = groups.get(panel)?.[action];
      const visible = list.filter(value => value.menu.parentElement.getClientRects().length);
      selected[action] = visible.find(value => value.menu === previous?.menu) || visible[0] || list.find(value => value.menu === previous?.menu) || list[0];
    }
    return selected.save.header === selected.clear.header && selected.save.playlistId === selected.clear.playlistId ? { ...selected, sources:[...choices.save,...choices.clear] } : null;
  }
  function close(group, restore = false) {
    group.open = false; group.button.setAttribute('aria-expanded','false');
    try { if (group.popup.matches(':popover-open')) group.popup.hidePopover(); } catch { /* Older browser fallback. */ }
    group.popup.hidden = true;
    if (restore && group.button.isConnected && !paused()) group.button.focus({preventScroll:true});
  }
  function release(panel) {
    const group = groups.get(panel); if (!group) return;
    groups.delete(panel); close(group); restoreLayout(group); group.popup.remove(); group.wrap.remove();
    for (const source of group.sources) source.menu.removeAttribute(sourceMarker);
    panel.removeAttribute(marker);
  }
  function painted(node) {
    if (!node?.isConnected || !node.getClientRects().length) return false;
    for (let parent=node;parent;parent=parent.parentElement) {
      if(parent.hidden||parent.hasAttribute('inert')||parent.getAttribute('aria-hidden')==='true')return false;
      const css=window.getComputedStyle(parent);
      if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)===0)return false;
    }
    return true;
  }
  function valid(group, visible = false) {
    if (paused() || groups.get(group.panel) !== group || !group.wrap.isConnected || group.wrap.parentElement !== group.clear.menu.parentElement || group.panel.closest('ytd-app') !== group.app || visible && !painted(group.button)) return false;
    return group.actions.length === 2 && group.actions.every(action => model(action.row) === action.item && group.popup.contains(action.row) && same(action,proof(action.menu))) && !paused() && groups.get(group.panel) === group;
  }
  function canActivate(group) {
    try { return valid(group,true) && group.open && !group.popup.hidden && (!group.popup.hasAttribute('popover') || group.popup.matches(':popover-open')); }
    catch { return false; }
  }
  function position(group) {
    const box = group.button.getBoundingClientRect(), width = group.popup.offsetWidth, height = group.popup.offsetHeight;
    group.popup.style.left = `${Math.max(8,Math.min(box.right-width,window.innerWidth-width-8))}px`;
    group.popup.style.top = `${box.bottom+height+4 <= window.innerHeight-8 ? box.bottom+4 : Math.max(8,box.top-height-4)}px`;
  }
  function open(group, last = false) {
    if (!valid(group,true)) { release(group.panel); schedule(); return; }
    for (const other of groups.values()) if (other !== group) close(other);
    group.popup.hidden = false;
    try { group.popup.showPopover?.(); } catch { group.popup.removeAttribute('popover'); (group.panel.closest('ytd-app') || document.body).append(group.popup); }
    group.open = true; group.button.setAttribute('aria-expanded','true'); position(group); group.actions[last ? 1 : 0].row.focus({preventScroll:true});
  }
  function icon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.setAttribute('focusable','false');
    const shape = document.createElementNS('http://www.w3.org/2000/svg','path'); shape.setAttribute('d',path); svg.append(shape); return svg;
  }
  function restoreLayout(group) {
    for (const [property, value] of group.layout || []) {
      const style = group.clear.header.style;
      if (style.getPropertyValue(property) === value.applied && style.getPropertyPriority(property) === 'important') {
        if (value.original) style.setProperty(property,value.original,value.priority);
        else style.removeProperty(property);
      }
    }
    group.layout = new Map();
  }
  function layout(group) {
    const header = group.clear.header;
    if (group.layoutDirty) restoreLayout(group);
    // Read native text rather than inheriting the browser's default button colour.
    const walker = document.createTreeWalker(header,4); let node, title, count, left = 256;
    while (left-- && (node = walker.nextNode())) {
      if (group.wrap.contains(node) || node.parentElement.closest(`[${sourceMarker}]`)) continue;
      const text = node.data.trim();
      if (text !== 'Queue' && !/^\d+\s*\/\s*\d+$/.test(text)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      if (box.width && box.height) { if (text === 'Queue') title = node.parentElement; else count = box; }
    }
    if (title) group.button.style.setProperty('color',window.getComputedStyle(title).color,'important');
    if (!group.layoutDirty) return;
    // Measure native spacing after restoring our previous changes.
    if (count) {
      const box = header.getBoundingClientRect(), css = window.getComputedStyle(header);
      const extra = Math.max(0,16 - (box.bottom - (parseFloat(css.borderBottomWidth)||0) - count.bottom));
      const set = (property,value) => { group.layout.set(property,{original:header.style.getPropertyValue(property),priority:header.style.getPropertyPriority(property),applied:value}); header.style.setProperty(property,value,'important'); };
      if (extra > .5) {
        set('padding-bottom',`${(parseFloat(css.paddingBottom)||0)+extra}px`);
        if (css.boxSizing === 'border-box') set('min-height',`${Math.max(parseFloat(css.minHeight)||0,box.height+extra)}px`);
      }
    }
    group.layoutDirty = !count;
  }
  function prepare(action) {
    const walker = document.createTreeWalker(action.row,4); let text = '', node, left = 256;
    while (left-- && (node = walker.nextNode())) if (!action.visual?.contains(node)) text += node.data;
    if (text.replace(/\s+/g,' ').trim() !== labelOf(action.item)) return false;
    if (!action.visual) {
      const visual = document.createElement('span'); visual.setAttribute('data-ytms-queue-menu-content',''); visual.setAttribute('aria-hidden','true');
      visual.append(icon(action.action === 'save' ? 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15-5-2.18L7 18V5h10v13z' : 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2-10h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4z'));
      const label = document.createElement('span'); label.textContent = action.action === 'save' ? 'Save queue' : 'Clear queue'; visual.append(label); action.visual = visual;
    }
    const holder = action.row.querySelector('tp-yt-paper-item,button,[role="menuitem"]') || action.row;
    if (holder !== action.row && holder.getAttribute('role') === 'menuitem') { holder.setAttribute('role','presentation'); holder.tabIndex = -1; }
    for (let parent = holder; parent && parent !== action.row; parent = parent.parentElement) if (!parent.hasAttribute('data-ytms-queue-menu-path')) parent.setAttribute('data-ytms-queue-menu-path','');
    if (action.visual.parentElement !== holder) holder.append(action.visual);
    action.holder = holder; return true;
  }
  function install(panel, current) {
    const request = generation, active = () => request === generation && !paused(); let group = groups.get(panel);
    if (group && group.actions.every(action => same(action,current[action.action])) && current.sources.length === group.sources.length && current.sources.every((source,index) => same(source,group.sources[index])) && valid(group)) {
    } else {
      release(panel); if (!active()) return;
      const rejected = failed.get(panel);
      if (rejected && same(rejected.save,current.save) && same(rejected.clear,current.clear)) return;
      for (const tag of new Set([current.save.tag,current.clear.tag])) if (!window.customElements?.get(tag)) {
        if (!waiting.has(tag) && window.customElements?.whenDefined) { waiting.add(tag); window.customElements.whenDefined(tag).then(schedule,()=>{}); }
        return;
      }
      const wrap = document.createElement('span'); wrap.setAttribute('data-ytms-queue-menu-wrap','');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'ytms-queue-more'; button.hidden = true;
      button.setAttribute('aria-label','Queue actions'); button.setAttribute('aria-haspopup','menu'); button.setAttribute('aria-expanded','false');
      button.append(icon('M12 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'));
      const popup = document.createElement('div'); popup.setAttribute('data-ytms-queue-menu-popup',''); popup.setAttribute('role','menu'); popup.setAttribute('aria-label','Queue actions'); popup.hidden = true;
      popup.id = `ytms-queue-header-popup-${++serial}`; button.setAttribute('aria-controls',popup.id);
      if (typeof popup.showPopover === 'function') popup.setAttribute('popover','auto');
      wrap.append(button,popup); group = { panel,...current,app:panel.closest('ytd-app'),wrap,button,popup,actions:[],open:false,layoutDirty:true,layout:new Map() }; groups.set(panel,group);
      current.clear.menu.parentElement.append(wrap);
      if (!popup.hasAttribute('popover')) (panel.closest('ytd-app') || document.body).append(popup);
      if (!active() || groups.get(panel) !== group) { release(panel); return; }
      for (const action of ['save','clear']) {
        const row = document.createElement(current[action].tag); row.setAttribute('data-ytms-queue-menu-action',action); row.setAttribute('role','menuitem'); row.tabIndex = -1; row.setAttribute('aria-label',action === 'save' ? 'Save queue' : 'Clear queue');
        const record = {...current[action],row}; group.actions.push(record);
        row.addEventListener('click',event => { if (!canActivate(group)) { event.preventDefault(); event.stopImmediatePropagation(); close(group); schedule(); } },true);
        row.addEventListener('click',event => { event.stopPropagation(); window.queueMicrotask(()=>close(group)); });
        popup.append(row); if (!active() || groups.get(panel) !== group) { release(panel); return; }
        try { const controller = owner(row); if (!active()) { release(panel); return; } if (typeof controller.set === 'function') controller.set('data',record.item); else controller.data = record.item; }
        catch { if(active())failed.set(panel,current); release(panel); return; }
        if (!active() || model(row) !== record.item || !same(record,proof(record.menu))) { if(active())failed.set(panel,current); release(panel); return; }
      }
      button.addEventListener('click',event => { event.stopPropagation(); group.open ? close(group) : open(group); });
      popup.addEventListener('toggle',()=>{try{if(popup.hasAttribute('popover')&&!popup.matches(':popover-open')){group.open=false;button.setAttribute('aria-expanded','false');}}catch{/* No popover API. */}});
    }
    const ready = group.actions.map(prepare).every(Boolean);
    if (!active() || !valid(group)) { release(panel); return; }
    group.button.hidden = !ready;
    if (ready) { for (const source of group.sources) if (!source.menu.hasAttribute(sourceMarker)) source.menu.setAttribute(sourceMarker,''); if(!panel.hasAttribute(marker))panel.setAttribute(marker,''); layout(group); }
    else { if(group.open)close(group); for (const source of group.sources) source.menu.removeAttribute(sourceMarker); panel.removeAttribute(marker); }
  }
  function refresh() {
    frame=0; if(paused())return; const request=generation; observer.disconnect();
    for(const root of [document.documentElement,document.body,...document.querySelectorAll('ytd-app,ytd-page-manager,#page-manager,ytd-watch-flexy,ytd-miniplayer,#secondary,#secondary-inner,#panels,.ytdMiniplayerComponentContent')])if(root)observer.observe(root,{childList:true});
    const seen=new Set();
    for(const panel of document.querySelectorAll(panels)){
      if(paused()||request!==generation)return; observer.observe(panel,{childList:true});
      for(const root of panel.querySelectorAll(':scope > #container'))observer.observe(root,{childList:true});
      for(const header of panel.querySelectorAll('.header.ytd-playlist-panel-renderer'))if(header.closest(panels)===panel)observer.observe(header,{childList:true,subtree:true,characterData:true});
      const current=findActions(panel); if(paused()||request!==generation)return; if(current){seen.add(panel);install(panel,current);const group=groups.get(panel);if(group)observer.observe(group.popup,{childList:true,subtree:true,characterData:true});}
    }
    for(const panel of [...groups.keys()])if(!seen.has(panel))release(panel);
  }
  function schedule(){if(!paused()&&!frame)frame=window.requestAnimationFrame(refresh);}
  function suspend(){generation++;pendingKey=null;if(frame)window.cancelAnimationFrame(frame);frame=0;observer.disconnect();for(const panel of [...groups.keys()])release(panel);}
  function resume(){for(const group of groups.values()){close(group);group.layoutDirty=true;}schedule();}
  function keyboard(event){
    if(!event.isTrusted)return;
    if(event.type==='keyup'){if(pendingKey===event.key){pendingKey=null;event.stopImmediatePropagation();}return;}
    pendingKey=null;
    if(!['Enter',' ','ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(event.key))return;
    for(const group of groups.values()){
      const trigger=group.button.contains(event.target),inside=group.open&&group.popup.contains(event.target);
      if(!trigger&&!inside)continue;
      if(trigger&&!['Enter',' ','ArrowDown','ArrowUp'].includes(event.key))return;
      // Capture before document/player shortcut handlers. The original native
      // tap still receives activation; ordinary page keys remain untouched.
      event.stopImmediatePropagation();pendingKey=event.key;
      if(event.key==='Tab'){close(group);return;}
      event.preventDefault();
      if(trigger){if(['ArrowDown','ArrowUp'].includes(event.key))open(group,event.key==='ArrowUp');else group.open?close(group):open(group);return;}
      if(event.key==='Escape'){close(group,true);return;}
      if(['Enter',' '].includes(event.key)){
        const action=group.actions.find(action=>action.row===event.target||action.row.contains(event.target));
        if(action&&canActivate(group))(action.holder||action.row).click();return;
      }
      const index=group.actions.findIndex(action=>action.row===document.activeElement||action.row.contains(document.activeElement));
      const next=event.key==='Home'?0:event.key==='End'?1:(index+(event.key==='ArrowUp'?-1:1)+2)%2;group.actions[next].row.focus();return;
    }
  }
  const themeObserver=new MutationObserver(schedule);
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['dark']});
  const observer=new MutationObserver(records=>{
    for(const group of groups.values())if(records.some(record=>group.clear.header.contains(record.target)&&!group.wrap.contains(record.target)))group.layoutDirty=true;
    schedule();
  }), style=document.createElement('style');
  style.textContent=`
    ytd-menu-renderer[${sourceMarker}] { display:none !important; }
    [data-ytms-queue-menu-wrap] { display:inline-flex;align-items:center;vertical-align:middle;color:var(--yt-spec-text-primary,inherit); }
    .ytms-queue-more { display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:32px;height:32px;padding:4px;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer; }
    .ytms-queue-more[hidden] { display:none !important; }
    .ytms-queue-more svg { width:24px;height:24px;pointer-events:none; }
    .ytms-queue-more svg, .ytms-queue-more svg path { fill:currentColor !important; }
    .ytms-queue-more:hover { background:var(--yt-spec-badge-chip-background,rgba(127,127,127,.2)); }
    .ytms-queue-more:focus-visible { outline:2px solid currentColor;outline-offset:2px; }
    [data-ytms-queue-menu-popup] { --ytms-queue-menu-background:var(--yt-spec-menu-background,#fff);--ytms-queue-menu-text:var(--yt-spec-text-primary,#0f0f0f);--ytms-queue-menu-hover:var(--yt-spec-10-percent-layer,rgba(0,0,0,.1));color-scheme:light;position:fixed;inset:auto;margin:0;padding:8px 0;border:0;border-radius:12px;width:min(212px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;z-index:2202;background:var(--ytms-queue-menu-background) !important;color:var(--ytms-queue-menu-text) !important;box-shadow:0 4px 24px #0005;font-family:inherit;font-size:14px;line-height:20px;font-weight:400; }
    html[dark] [data-ytms-queue-menu-popup] { --ytms-queue-menu-background:var(--yt-spec-menu-background,#282828);--ytms-queue-menu-text:var(--yt-spec-text-primary,#f1f1f1);--ytms-queue-menu-hover:var(--yt-spec-10-percent-layer,rgba(255,255,255,.1));color-scheme:dark; }
    [data-ytms-queue-menu-popup][hidden] { display:none !important; }
    [data-ytms-queue-menu-action], [data-ytms-queue-menu-action] [data-ytms-queue-menu-path] { display:flex !important;flex-flow:row nowrap !important;align-items:center !important;box-sizing:border-box !important;width:100% !important;height:36px !important;min-height:0 !important;min-width:0 !important;margin:0 !important;padding:0 !important;gap:0 !important;background:transparent !important;font-size:0 !important;line-height:0 !important;cursor:pointer; }
    [data-ytms-queue-menu-action], [data-ytms-queue-menu-action] [data-ytms-queue-menu-path], [data-ytms-queue-menu-content] { color:var(--ytms-queue-menu-text) !important;border:0 !important;box-shadow:none !important;outline:0 !important; }
    [data-ytms-queue-menu-action] > :not([data-ytms-queue-menu-path]):not([data-ytms-queue-menu-content]), [data-ytms-queue-menu-path] > :not([data-ytms-queue-menu-path]):not([data-ytms-queue-menu-content]) { display:none !important; }
    [data-ytms-queue-menu-action]::before, [data-ytms-queue-menu-action]::after { content:none !important;display:none !important; }
    [data-ytms-queue-menu-content] { display:flex !important;flex-flow:row nowrap !important;align-items:center !important;gap:16px !important;box-sizing:border-box !important;width:100% !important;height:36px !important;padding:0 16px !important;margin:0 !important;white-space:nowrap !important;font-family:inherit !important;font-size:14px !important;line-height:20px !important;font-weight:400 !important; }
    [data-ytms-queue-menu-content] svg { display:block !important;flex:0 0 24px !important;width:24px !important;height:24px !important;margin:0 !important;fill:currentColor !important;pointer-events:none; }
    [data-ytms-queue-menu-content] svg path { fill:currentColor !important; }
    [data-ytms-queue-menu-content] span { color:inherit !important;font:inherit !important;margin:0 !important;padding:0 !important; }
    [data-ytms-queue-menu-action]:is(:hover,:focus) { background:var(--ytms-queue-menu-hover) !important;outline:0; }
    ytd-playlist-panel-renderer[${marker}] .header.ytd-playlist-panel-renderer :is(yt-icon-button#close-button,yt-button-shape#close-button,button#close-button) { translate:0 -4px; }
  `; (document.head||document.documentElement).append(style);
  const events=[['yt-navigate-start',()=>{navigating=true;suspend();}],['yt-navigate-finish',()=>{navigating=false;resume();}],['pagehide',()=>{pageHidden=true;suspend();}],['pageshow',()=>{pageHidden=false;navigating=false;resume();}],['yt-playlist-data-updated',resume],['yt-page-data-updated',resume],['resize',()=>{for(const group of groups.values()){group.layoutDirty=true;if(group.open)position(group);}schedule();}],['keydown',keyboard],['keyup',keyboard],['blur',event=>{if(event.target===event.currentTarget)pendingKey=null;}]];
  events.forEach(([type,handler])=>window.addEventListener(type,handler,true));
  const visibility=()=>document.hidden?suspend():resume();document.addEventListener('visibilitychange',visibility);
  const outside=event=>{for(const group of groups.values())if(group.open&&!group.wrap.contains(event.target)&&!group.popup.contains(event.target))close(group);};document.addEventListener('pointerdown',outside,true);schedule();
  return()=>{disposed=true;suspend();themeObserver.disconnect();style.remove();events.forEach(([type,handler])=>window.removeEventListener(type,handler,true));document.removeEventListener('visibilitychange',visibility);document.removeEventListener('pointerdown',outside,true);};
}
