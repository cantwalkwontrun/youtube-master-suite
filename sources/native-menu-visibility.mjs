// Language: en-GB. Visibility preferences do not require permission to execute menu actions.
export function installNativeMenuVisibility({ document, window, preferences = {}, menuLayout, MutationObserver = window.MutationObserver }) {
  const shown = { download:preferences.menuShowDownload === true, hype:preferences.menuShowHype !== false };
  try { for (const node of menuLayout?.fromPreferences(preferences)?.nodes || []) if (Object.hasOwn(shown,node.id)) shown[node.id]=node.visible; } catch { /* Retain validated scalar defaults. */ }
  if (shown.download && shown.hype) return () => {};
  const popupSelector='ytd-menu-popup-renderer, yt-sheet-view-model';
  const rowSelector='ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, ytd-menu-service-item-download-renderer, yt-list-item-view-model, yt-download-list-item-view-model';
  const marker='data-ytms-native-menu-hidden';
  const owned=new Map(); let roots=[], ancestors=new Set(), disposed=false, navigating=false, pageHidden=false, scheduled=false, generation=0;
  const controller=node=>node?.polymerController || node?.getPolymerController?.() || node;
  const model=node=>typeof node?.componentProps?.data==='function' ? node.componentProps.data() : controller(node)?.data;
  function sheetBindingMatches(row,item) {
    const bound=model(row), expected=item?.downloadListItemViewModel || item?.listItemViewModel;
    // Current native sheets can expose no per-row model. Preserve that contract,
    // but never override an explicit object binding that disagrees with its slot.
    if(!bound || typeof bound!=='object' || bound===item || bound===expected)return true;
    const candidate=bound.downloadListItemViewModel || bound.listItemViewModel || bound;
    function signature(value) {
      let fields=0;
      const json=JSON.stringify(value,(_key,entry)=>{
        if(++fields>4000 || typeof entry==='string'&&entry.length>16384)throw Error('Unsupported row model');
        return entry;
      });
      return typeof json==='string'&&json.length<=131072?json:null;
    }
    const expectedSignature=signature(expected);
    return expectedSignature!==null&&expectedSignature===signature(candidate);
  }
  const topology=new MutationObserver(refreshRoots), observer=new MutationObserver(menuMutated);
  const style=document.createElement('style');style.textContent=`[${marker}] { display:none !important; }`;
  (document.head || document.documentElement).append(style);
  function visible(popup) {
    if (!popup.isConnected || !popup.getClientRects().length) return false;
    const box=popup.getBoundingClientRect();if (!(box.width>0) || (!(box.height>0) && popup.offsetHeight>0)) return false;
    for(let node=popup;node;node=node.parentElement) {
      if(node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden')==='true')return false;
      const css=window.getComputedStyle(node);if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)===0)return false;
    }
    return true;
  }
  function action(item) {
    if(item?.downloadListItemViewModel || item?.menuServiceItemDownloadRenderer)return 'download';
    const value=item?.listItemViewModel || item?.menuServiceItemRenderer || item?.menuNavigationItemRenderer;
    if(!value)return null;
    const icon=String(value.icon?.iconType || value.leadingImage?.sources?.[0]?.clientResource?.imageName || '').toUpperCase();
    if(['DOWNLOAD','OFFLINE_DOWNLOAD','FILE_DOWNLOAD'].includes(icon))return 'download';
    const title=value.title?.content || value.text?.simpleText || value.text?.runs?.map(part=>part.text || '').join('');
    return ['HYPE','HYPE_OUTLINE'].includes(icon)||title==='Hype' ? 'hype' : null;
  }
  function release(row) {
    const value=owned.get(row);if(row.getAttribute(marker)===value)row.removeAttribute(marker);owned.delete(row);
  }
  function scan() {
    const keep=new Set(), request=generation;
    const current=()=>request===generation&&!disposed&&!navigating&&!pageHidden;
    for(const popup of document.querySelectorAll(popupSelector)) {
      if(!current())return;
      try {
        // The full editor owns recognised card menus. This filter covers the
        // native overflow variants that lack a video/card binding and never
        // moves rows, creates actions or calls an endpoint.
        if(popup.hasAttribute('data-ytms-video-menu') || !visible(popup))continue;
        const sheet=popup.matches('yt-sheet-view-model'), data=model(popup);
        const items=sheet ? data?.content?.listViewModel?.listItems : data?.items;
        if(!Array.isArray(items)||!items.length||items.length>60)continue;
        const rows=[...popup.querySelectorAll(rowSelector)].filter(row=>row.closest(popupSelector)===popup &&
          (!row.closest('yt-download-list-item-view-model')||row.matches('yt-download-list-item-view-model')));
        if(rows.length!==items.length || rows.some((row,i)=>sheet ?
          !sheetBindingMatches(row,items[i]) || (items[i]?.downloadListItemViewModel ? !row.matches('yt-download-list-item-view-model') : !items[i]?.listItemViewModel||!row.matches('yt-list-item-view-model')) :
          model(row)!==(items[i]?.menuServiceItemRenderer||items[i]?.menuNavigationItemRenderer||items[i]?.menuServiceItemDownloadRenderer)))continue;
        let changed=false;
        for(let i=0;i<rows.length;i++) {
          if(!current())return;
          const id=action(items[i]);if(!id||shown[id])continue;
          if(!current())return;
          keep.add(rows[i]);owned.set(rows[i],id);
          if(rows[i].getAttribute(marker)!==id){rows[i].setAttribute(marker,id);changed=true;}
        }
        if(!current())return;
        if(changed)popup.closest('tp-yt-iron-dropdown')?.refit?.();
      } catch { /* Leave unsupported native layouts usable. */ }
    }
    if(!current())return;
    for(const row of [...owned.keys()])if(!keep.has(row))release(row);
    // Native popup caches may clone or recycle marked rows. A copied marker
    // is not authority to hide a newly bound, different action.
    for(const row of document.querySelectorAll(`[${marker}]`))if(row.closest(popupSelector)&&!keep.has(row))row.removeAttribute(marker);
  }
  function schedule() {
    if(disposed||navigating||pageHidden||scheduled)return;scheduled=true;const request=generation;
    window.queueMicrotask(()=>{if(request!==generation)return;scheduled=false;if(!disposed&&!navigating&&!pageHidden)scan();});
  }
  function menuMutated(records) {
    let changedTopology=false, relevant=false;
    for(const record of records) {
      if(ancestors.has(record.target)||record.target.closest?.(popupSelector))relevant=true;
      if([...record.addedNodes,...record.removedNodes].some(node=>node.matches?.(popupSelector)||node.querySelector?.(popupSelector)))changedTopology=true;
    }
    if(changedTopology)refreshRoots();else if(relevant)schedule();
  }
  function refreshRoots() {
    if(disposed||navigating||pageHidden)return;
    topology.disconnect();
    const discoveryRoots=new Set([document.documentElement,document.body,...document.querySelectorAll('ytd-app')].filter(Boolean));
    const next=[...document.querySelectorAll('ytd-popup-container')];ancestors=new Set();
    for(const popup of document.querySelectorAll(popupSelector)){
      for(let node=popup;node;node=node.parentElement)ancestors.add(node);
      if(!next.some(root=>root.contains(popup)))next.push(popup.closest('tp-yt-iron-dropdown')||popup);
    }
    // Observe only the exact outside ancestors whose visibility controls a menu.
    // A body-wide subtree observer would include unrelated video/comment churn.
    for(const node of new Set([...discoveryRoots,...ancestors])) {
      const external=ancestors.has(node)&&!next.some(root=>root===node||root.contains(node));
      if(discoveryRoots.has(node)||external)topology.observe(node,{childList:discoveryRoots.has(node),attributes:external,
        ...(external?{attributeFilter:['hidden','aria-hidden','inert','class','style']}: {})});
    }
    if(next.length!==roots.length||next.some((node,i)=>node!==roots[i])){
      observer.disconnect();roots=next;for(const node of roots)observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','inert','class','style','data-ytms-video-menu']});
    }
    schedule();
  }
  function clear(){generation++;scheduled=false;topology.disconnect();observer.disconnect();roots=[];ancestors.clear();for(const row of [...owned.keys()])release(row);}
  const start=()=>{navigating=true;clear();},finish=()=>{navigating=false;refreshRoots();};
  const hide=()=>{pageHidden=true;clear();},show=()=>{if(pageHidden)navigating=false;pageHidden=false;refreshRoots();};
  const listeners=[['yt-popup-opened',refreshRoots],['iron-overlay-opened',refreshRoots],['yt-popup-closed',schedule],['iron-overlay-closed',schedule],['yt-navigate-start',start],['yt-navigate-finish',finish],['yt-page-data-updated',refreshRoots],['pagehide',hide],['pageshow',show],['DOMContentLoaded',refreshRoots]];
  for(const [type,listener]of listeners)window.addEventListener(type,listener,true);
  refreshRoots();
  return()=>{disposed=true;clear();style.remove();for(const[type,listener]of listeners)window.removeEventListener(type,listener,true);};
}
