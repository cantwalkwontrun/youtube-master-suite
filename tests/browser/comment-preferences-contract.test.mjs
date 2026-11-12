// Language: en-GB. Native comment geometry and control behaviour, synthetic pages only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { launchFixtureBrowser } from './fixture-browser.mjs';

const source=readFileSync(new URL('../../sources/modules/youtube-comment-cleaner.user.js',import.meta.url),'utf8');
let browser, browserLaunch;
before(async()=>{browser=await(browserLaunch=launchFixtureBrowser());});
after(async()=>{await(await browserLaunch)?.close();});

async function open(t,renderer,preferences){
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en-GB"><style>
    ytd-watch-flexy,ytd-comments,${renderer},#main,#body,#footer,ytd-comment-replies-renderer{display:block}
    ${renderer}{width:500px}#main{margin:12px}#body{padding:10px}#footer{padding:6px}
    </style><body><ytd-watch-flexy><ytd-comments><${renderer} id="comment"><div id="main"><div id="body">Comment text</div><div id="footer">Footer</div>
    <button id="like-button">Like</button><button id="dislike-button">Dislike</button><button id="reply-button-end">Reply</button>
    <div id="action-menu">Actions</div><ytd-comment-replies-renderer id="existing-replies">Existing readable reply</ytd-comment-replies-renderer></div></${renderer}>
    <div id="simple-box">Write a comment</div></ytd-comments></ytd-watch-flexy><button id="unrelated">Unrelated control</button></body></html>`}));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{try{assert.deepEqual(errors,[]);}finally{await context.close();}});
  await page.goto('https://www.youtube.com/watch?v=aaaaaaaaaaa');
  const before=(await page.locator('#comment').boundingBox()).height;
  let configured=source;
  for(const [key,value] of Object.entries(preferences))configured=configured.replace(`${key}: true,`,`${key}: ${value},`);
  await page.evaluate(()=>{window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);};});
  await page.addScriptTag({content:configured});
  return {page,before};
}

for(const renderer of ['ytd-comment-renderer','ytd-comment-view-model','yt-comment-view-model']){
  for(const enabled of [false,true])test(`compactComments ${enabled} changes actual ${renderer} spacing without hiding its text`,async t=>{
    const {page,before}=await open(t,renderer,{compactComments:enabled,hideCommentControls:false});
    const geometry=await page.locator('#comment').evaluate(node=>({height:node.getBoundingClientRect().height,
      mainMargin:getComputedStyle(node.querySelector('#main')).marginTop,
      bodyPadding:getComputedStyle(node.querySelector('#body')).paddingTop,
      footerPadding:getComputedStyle(node.querySelector('#footer')).paddingTop}));
    assert.equal(geometry.mainMargin,enabled?'0px':'12px');
    assert.equal(geometry.bodyPadding,enabled?'0px':'10px');
    assert.equal(geometry.footerPadding,enabled?'0px':'6px');
    assert.equal(enabled?geometry.height<before:geometry.height===before,true);
    for(const selector of ['#body','#existing-replies','#unrelated'])assert.equal(await page.locator(selector).isVisible(),true);
  });
  for(const enabled of [false,true])test(`hideCommentControls ${enabled} affects ${renderer} actions and composer while preserving replies`,async t=>{
    const {page}=await open(t,renderer,{compactComments:false,hideCommentControls:enabled});
    for(const selector of ['#like-button','#dislike-button','#reply-button-end','#action-menu','#simple-box'])assert.equal(await page.locator(selector).isVisible(),!enabled,selector);
    for(const selector of ['#body','#existing-replies','#unrelated'])assert.equal(await page.locator(selector).isVisible(),true,selector);
  });
}
