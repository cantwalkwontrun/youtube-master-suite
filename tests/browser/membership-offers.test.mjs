// Language: en-GB. Synthetic native membership dialogs; no personal profile or requests.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { installMembershipOffers } from '../../sources/membership-offers.mjs';
import { createFeatureCatalogue } from '../../sources/feature-catalogue.mjs';
import { launchFixtureBrowser } from './fixture-browser.mjs';

const URL = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
let browser;
before(async () => { browser = await launchFixtureBrowser(); }, { timeout: 30000 });
after(async () => { await browser?.close(); });

async function open(t, enabled = true, install = true) {
  const context = await browser.newContext({ serviceWorkers:'block' });
  await context.route('**/*', route => route.request().url() === URL ? route.fulfill({contentType:'text/html',body:
    '<!doctype html><html lang="en-GB"><style>ytd-app,ytd-popup-container,tp-yt-paper-dialog,[data-renderer]{display:block}tp-yt-paper-dialog{width:400px;padding:16px}button{width:90px;height:36px}[hidden]{display:none!important}</style><body><video></video><ytd-app><ytd-popup-container></ytd-popup-container></ytd-app></body></html>'}) : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(4000);
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>fixture.effects),{purchase:0,media:0,storage:0,network:0});}finally{await context.close();}});
  await page.goto(URL);
  await page.evaluate(() => {
    window.fixture={calls:[],effects:{purchase:0,media:0,storage:0,network:0}, observers:0, activeObservers:0, deliveries:0, measurements:0};
    const Native=MutationObserver;
    window.MutationObserver=class extends Native {
      constructor(callback){super((...args)=>{if(this.tracked)fixture.deliveries++;callback(...args);});this.tracked=Boolean(window.fixtureInstalling);if(this.tracked)fixture.observers++;}
      observe(...args){if(this.tracked&&!this.active){this.active=true;fixture.activeObservers++;}super.observe(...args);}
      disconnect(){if(this.tracked&&this.active){this.active=false;fixture.activeObservers--;}super.disconnect();}
    };
    const video=document.querySelector('video');for(const name of ['play','pause','load'])video[name]=()=>fixture.effects.media++;
    const storage=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){fixture.effects.storage++;return storage.apply(this,args);};
    window.fetch=()=>{fixture.effects.network++;throw new Error('No network expected');};
    fixture.show=(dialog,event=true)=>{
      dialog.hidden=false;dialog.opened=true;dialog.setAttribute('opened','');
      document.body.style.overflow='hidden';
      dialog.backdrop=document.createElement('div');dialog.backdrop.dataset.fixtureBackdrop='';document.body.append(dialog.backdrop);
      if(event)dialog.dispatchEvent(new CustomEvent('iron-overlay-opened',{bubbles:true}));
    };
    fixture.make=(options={})=>{
      const dialog=document.createElement('tp-yt-paper-dialog');dialog.hidden=true;
      const bounds=dialog.getBoundingClientRect.bind(dialog);dialog.getBoundingClientRect=()=>{fixture.measurements++;return bounds();};
      const offer=document.createElement(options.kind||'ytd-sponsorships-offer-renderer');offer.dataset.renderer='';offer.setAttribute('dialog','');
      const join=document.createElement('button');join.textContent='Join';join.id='purchase-button';join.addEventListener('click',()=>fixture.effects.purchase++);offer.append(join);
      if(options.nested){const wrapper=document.createElement('ytd-purchase-flow-renderer');wrapper.dataset.renderer='';wrapper.append(offer);dialog.append(wrapper);}else dialog.append(offer);
      if(options.payment){const frame=document.createElement('iframe');frame.src='about:blank';offer.append(frame);}
      const close=()=>{
        fixture.calls.push(options.name||options.api||'close');
        if(options.throw)throw new Error('Native close refused');
        if(options.noop)return;
        dialog.hidden=true;dialog.opened=false;dialog.removeAttribute('opened');dialog.backdrop?.remove();document.body.style.overflow='';
        dialog.dispatchEvent(new CustomEvent('iron-overlay-closed',{bubbles:true}));
      };
      if(options.api==='controller')dialog.polymerController={close};
      else if(options.api==='cancel')dialog.cancel=close;
      else if(options.api==='button'){
        const button=document.createElement('button');button.id='close-button';button.textContent='Close';button.addEventListener('click',close);offer.prepend(button);
      }else if(options.api!=='none')dialog.close=close;
      dialog.fixtureClose=close;dialog.fixtureOffer=offer;
      document.querySelector('ytd-popup-container').append(dialog);return dialog;
    };
  });
  if(install)await page.addScriptTag({content:`window.fixtureInstalling=true;try {window.fixtureDispose = (${installMembershipOffers.toString()})({document,window,preferences:{dismissMembershipOffers:${enabled}}});}finally{window.fixtureInstalling=false;}`});
  return page;
}
async function settle(page){await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});}

test('membership dismissal is a default-off Interface setting beside Premium promotions',()=>{
  const definitions=createFeatureCatalogue().definitions;
  const index=definitions.findIndex(item=>item.key==='dismissMembershipOffers');
  assert.ok(index>0);assert.equal(definitions[index-1].key,'hidePremiumUpsells');
  assert.deepEqual([definitions[index].default,definitions[index].tab,definitions[index].section],[false,'interface','Page appearance']);
  assert.match(definitions[index].description,/including offers opened by Join/);
});

test('disabled setting adds no observer or dismissal behaviour',async t=>{
  const page=await open(t,false);
  await page.evaluate(()=>{fixture.dialog=fixture.make();fixture.show(fixture.dialog);});await settle(page);
  assert.equal(await page.evaluate(()=>fixture.observers),0);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[]);
  assert.equal(await page.evaluate(()=>fixture.dialog.hidden),false);
});

for(const kind of ['ytd-sponsorships-offer-renderer','ytd-sponsorships-offer-with-video-renderer'])
for(const api of ['close','controller','cancel','button'])
test(`recognised ${kind} uses native ${api} teardown without a purchase`,async t=>{
  const page=await open(t);
  await page.evaluate(({kind,api})=>{fixture.dialog=fixture.make({kind,api});fixture.show(fixture.dialog);},{kind,api});
  await page.waitForFunction(()=>fixture.calls.length===1);
  assert.equal(await page.evaluate(()=>fixture.dialog.hidden),true);
  assert.equal(await page.locator('[data-fixture-backdrop]').count(),0);
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  assert.equal(await page.evaluate(()=>fixture.dialog.isConnected),true,'Native teardown retains its own reusable renderer');
});

test('native open events discover a late nested popup container and already-open offer',async t=>{
  const page=await open(t,true,false);
  await page.evaluate(()=>{fixture.dialog=fixture.make();fixture.show(fixture.dialog,false);});
  await page.addScriptTag({content:`window.fixtureInstalling=true;try{window.fixtureDispose = (${installMembershipOffers.toString()})({document,window,preferences:{dismissMembershipOffers:true}});}finally{window.fixtureInstalling=false;}`});
  await page.waitForFunction(()=>fixture.calls.length===1);
  await page.evaluate(()=>{
    document.querySelector('ytd-popup-container').remove();
    const holder=document.createElement('div');document.querySelector('ytd-app').append(holder);
    const popup=document.createElement('ytd-popup-container');holder.append(popup);
    fixture.dialog=fixture.make();fixture.show(fixture.dialog);
  });
  await page.waitForFunction(()=>fixture.calls.length===2);
});

test('delayed renderer and late native close control are observed without polling',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    fixture.dialog=fixture.make({api:'none',kind:'ytd-unrecognised-offer-renderer'});fixture.show(fixture.dialog);
  });await settle(page);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[]);
  await page.evaluate(()=>{
    const offer=document.createElement('ytd-sponsorships-offer-renderer');offer.dataset.renderer='';offer.append(document.createElement('p'));
    fixture.dialog.fixtureOffer.replaceWith(offer);fixture.dialog.fixtureOffer=offer;
  });await settle(page);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[]);
  await page.evaluate(()=>{
    const close=document.createElement('button');close.id='close-button';close.textContent='Close';close.onclick=fixture.dialog.fixtureClose;
    fixture.dialog.fixtureOffer.append(close);
  });
  await page.waitForFunction(()=>fixture.calls.length===1);
});

test('other dialogs, nested stale offers and payment frames remain usable',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    fixture.dialogs=['ytd-add-to-playlist-renderer','ytd-unified-share-panel-renderer','ytd-report-form-modal-renderer','yt-confirm-dialog-renderer','ytd-purchase-flow-renderer','ytd-settings-dialog-renderer']
      .map(kind=>fixture.make({kind}));
    fixture.dialogs.push(fixture.make({nested:true}),fixture.make({payment:true}));
    const nestedPurchase=fixture.make();const purchase=document.createElement('ytd-purchase-flow-renderer');
    purchase.dataset.renderer='';purchase.textContent='Payment';nestedPurchase.fixtureOffer.append(purchase);fixture.dialogs.push(nestedPurchase);
    for(const dialog of fixture.dialogs)fixture.show(dialog);
    const settings=document.createElement('dialog');settings.id='ytms-settings-dialog';settings.textContent='Settings';document.body.append(settings);settings.showModal();
  });await settle(page);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[]);
  assert.equal(await page.evaluate(()=>fixture.dialogs.every(dialog=>!dialog.hidden)),true);
  assert.equal(await page.locator('#ytms-settings-dialog').evaluate(dialog=>dialog.open),true);
});

test('a stale membership renderer hidden beside a report is never a dismissal signal',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    fixture.dialog=fixture.make();fixture.dialog.fixtureOffer.hidden=true;
    const report=document.createElement('ytd-report-form-modal-renderer');report.dataset.renderer='';report.textContent='Report';fixture.dialog.append(report);fixture.show(fixture.dialog);
  });await settle(page);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[]);
});

test('an unavailable native dialog property leaves that dialog usable without blocking another recognised offer',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    fixture.unavailable=fixture.make({name:'unavailable'});fixture.show(fixture.unavailable);
    Object.defineProperty(fixture.unavailable,'opened',{get(){throw new Error('Native state unavailable');}});
    fixture.dialog=fixture.make({name:'current'});fixture.show(fixture.dialog);
  });await page.waitForFunction(()=>fixture.calls.length===1);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),['current']);
  assert.equal(await page.evaluate(()=>fixture.unavailable.hidden),false);
});

for(const api of ['close','button'])test(`unavailable Polymer controller does not block the available native ${api} dismissal`,async t=>{
  const page=await open(t);
  await page.evaluate(api=>{
    fixture.dialog=fixture.make({api});
    Object.defineProperty(fixture.dialog,'polymerController',{get(){throw new Error('Controller not exposed');}});
    fixture.show(fixture.dialog);
  },api);await settle(page);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[api]);
  assert.equal(await page.evaluate(()=>fixture.dialog.hidden),true);
});

for(const event of ['iron-overlay-closed','yt-popup-closed'])test(`nested ${event} cannot reset the outer offer dismissal attempt`,async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    fixture.dialog=fixture.make({noop:true});
    fixture.nested=document.createElement('tp-yt-iron-dropdown');
    fixture.dialog.fixtureOffer.append(fixture.nested);
    fixture.show(fixture.dialog);
  });await page.waitForFunction(()=>fixture.calls.length===1);
  await page.evaluate(event=>{
    fixture.nested.dispatchEvent(new CustomEvent(event,{bubbles:true}));
    fixture.dialog.fixtureOffer.classList.add('menu-closed');
  },event);await settle(page);
  assert.equal(await page.evaluate(()=>fixture.calls.length),1);
  assert.equal(await page.evaluate(()=>fixture.dialog.hidden),false);
});

for(const fault of ['noop','throw'])test(`native ${fault} close is attempted once despite mutation and duplicate-open events`,async t=>{
  const page=await open(t);
  await page.evaluate(fault=>{fixture.dialog=fixture.make({[fault]:true});fixture.show(fixture.dialog);},fault);
  await page.waitForFunction(()=>fixture.calls.length===1);
  await page.evaluate(async()=>{
    for(let i=0;i<25;i++){
      const replacement=fixture.dialog.fixtureOffer.cloneNode(true);
      fixture.dialog.fixtureOffer.replaceWith(replacement);fixture.dialog.fixtureOffer=replacement;
      fixture.dialog.dispatchEvent(new CustomEvent('yt-popup-opened',{bubbles:true}));await Promise.resolve();
    }
  });await settle(page);
  assert.equal(await page.evaluate(()=>fixture.calls.length),1);
  assert.equal(await page.evaluate(()=>fixture.dialog.hidden),false);
});

test('native close and reopen reset only that dialog opening',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{fixture.dialog=fixture.make();fixture.show(fixture.dialog);});await page.waitForFunction(()=>fixture.calls.length===1);
  await page.evaluate(()=>fixture.show(fixture.dialog));await page.waitForFunction(()=>fixture.calls.length===2);
  await page.evaluate(()=>{
    const report=document.createElement('ytd-report-form-modal-renderer');report.dataset.renderer='';report.textContent='Report';fixture.dialog.replaceChildren(report);fixture.show(fixture.dialog);
  });await settle(page);
  assert.equal(await page.evaluate(()=>fixture.calls.length),2);
  assert.equal(await page.evaluate(()=>fixture.dialog.hidden),false);
});

for(const lifecycle of ['navigation','bfcache'])test(`${lifecycle} suspends observation and resumes native dismissal`,async t=>{
  const page=await open(t);
  await page.evaluate(type=>window.dispatchEvent(new Event(type)),lifecycle==='navigation'?'yt-navigate-start':'pagehide');
  assert.equal(await page.evaluate(()=>fixture.activeObservers),0);
  await page.evaluate(()=>{fixture.dialog=fixture.make();fixture.show(fixture.dialog);});await settle(page);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[]);
  await page.evaluate(type=>window.dispatchEvent(new Event(type)),lifecycle==='navigation'?'yt-navigate-finish':'pageshow');
  await page.waitForFunction(()=>fixture.calls.length===1);
  await page.evaluate(()=>fixtureDispose());
  assert.equal(await page.evaluate(()=>fixture.activeObservers),0);
  await page.evaluate(()=>{fixture.show(fixture.dialog);window.dispatchEvent(new Event('pageshow'));});await settle(page);
  assert.equal(await page.evaluate(()=>fixture.calls.length),1);
});

test('unsupported native offers stay usable and feed mutations do not observe a broad subtree',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    fixture.dialog=fixture.make({api:'none'});fixture.show(fixture.dialog);
    const comments=document.createElement('ytd-comments');document.querySelector('ytd-app').append(comments);fixture.comments=comments;
  });await settle(page);
  const count=await page.evaluate(()=>({observers:fixture.observers,deliveries:fixture.deliveries,measurements:fixture.measurements}));
  await page.evaluate(async()=>{for(let i=0;i<300;i++){fixture.comments.append(document.createElement('div'));await Promise.resolve();}});
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[]);
  assert.deepEqual(await page.evaluate(()=>({observers:fixture.observers,deliveries:fixture.deliveries,measurements:fixture.measurements})),count);
  assert.equal(await page.evaluate(()=>fixture.dialog.hidden),false);
});

test('a refused offer does not remeasure its dialog during internal video or text updates',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    fixture.dialog=fixture.make({noop:true});
    fixture.caption=document.createElement('div');fixture.dialog.fixtureOffer.append(fixture.caption);
    fixture.show(fixture.dialog);
  });await page.waitForFunction(()=>fixture.calls.length===1);await settle(page);
  const measurements=await page.evaluate(()=>fixture.measurements);
  await page.evaluate(async()=>{
    for(let i=0;i<200;i++){
      fixture.caption.textContent=String(i);
      fixture.caption.style.opacity=i%2?'0.9':'1';
      await Promise.resolve();
    }
  });await settle(page);
  assert.equal(await page.evaluate(()=>fixture.measurements),measurements);
  assert.equal(await page.evaluate(()=>fixture.calls.length),1);
  await page.evaluate(()=>{
    fixture.dialog.hidden=true;fixture.dialog.opened=false;
    fixture.dialog.removeAttribute('opened');
  });await settle(page);
  await page.evaluate(()=>fixture.show(fixture.dialog));
  await page.waitForFunction(()=>fixture.calls.length===2);
});

for(const reason of ['navigation','bfcache'])test(`unrelated resume signals cannot clear pending ${reason} suspension`,async t=>{
  const page=await open(t);
  await page.evaluate(reason=>{
    window.dispatchEvent(new Event(reason==='navigation'?'yt-navigate-start':'pagehide'));
    window.dispatchEvent(new Event(reason==='navigation'?'pageshow':'yt-navigate-finish'));
    fixture.dialog=fixture.make();fixture.show(fixture.dialog);
  },reason);await settle(page);
  assert.equal(await page.evaluate(()=>fixture.activeObservers),0);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[]);
  await page.evaluate(reason=>window.dispatchEvent(new Event(reason==='navigation'?'yt-navigate-finish':'pageshow')),reason);
  await page.waitForFunction(()=>fixture.calls.length===1);
});

test('BFCache restoration clears a navigation interrupted by the original pagehide',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('yt-navigate-start'));
    window.dispatchEvent(new Event('pagehide'));
    fixture.dialog=fixture.make();fixture.show(fixture.dialog);
    window.dispatchEvent(new Event('pageshow'));
  });await page.waitForFunction(()=>fixture.calls.length===1);
  assert.equal(await page.evaluate(()=>fixture.dialog.hidden),true);
});
