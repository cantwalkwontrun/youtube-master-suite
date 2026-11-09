// Language: en-GB. Synthetic public-channel responses; no network requests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { createChannelLookup } from '../sources/channel-lookup.mjs';

const ID = 'UCaaaaaaaaaaaaaaaaaaaaaa', OTHER = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const candidate = { handle:'@fixture',url:'https://www.youtube.com/@fixture',name:'Fixture creator' };
const html = (id = ID, extra = '') => `<!doctype html><html lang="en-GB"><head>
<link rel="canonical" href="https://www.youtube.com/channel/${id}">
<meta itemprop="identifier" content="${id}"><meta property="og:title" content="Fixture creator">
</head><body><script>var ytInitialData = ${JSON.stringify({ metadata:{ channelMetadataRenderer:{ externalId:id,title:'Fixture creator',channelUrl:`https://www.youtube.com/channel/${id}`,vanityChannelUrl:candidate.url } } })};</script>${extra}</body></html>`;
function response(body = html(), { url = candidate.url,status = 200,type = 'text/html; charset=utf-8',declared } = {}) {
  const result = new Response(body,{ status,headers:{ 'content-type':type,...(declared ? { 'content-length':declared } : {}) } });
  Object.defineProperty(result,'url',{ value:url });
  return result;
}

test('lookup factory can be embedded without module-scope dependencies', () => {
  const create = vm.runInNewContext(`(${createChannelLookup.toString()})`);
  assert.equal(typeof create().lookup,'function');
});
test('only an explicit lookup fetches public HTML with credentials and referrer omitted', async () => {
  const calls = [];
  const service = createChannelLookup({ fetch:async (...args) => { calls.push(args); return response(); } });
  assert.equal(calls.length,0);
  const result = await service.lookup(candidate);
  assert.equal(result.ok,true); assert.equal(result.channel.channelId,ID);
  assert.equal(calls.length,1); assert.equal(calls[0][0],candidate.url + '?cbrd=1&ucbcb=1');
  assert.equal(calls[0][1].credentials,'omit'); assert.equal(calls[0][1].referrerPolicy,'no-referrer');
  assert.equal(calls[0][1].redirect,'error');
  assert.equal(service.isVerified(candidate,result.channel),true);
  assert.equal(service.isVerified(candidate,{ ...result.channel }),false);
});
test('lookup parses current page metadata and ignores unrelated IDs or renderer names', async () => {
  const body = html(ID,`<div>${OTHER}</div><script>var config = {"channelMetadataRenderer":"unrelated renderer name"};</script>`);
  const service = createChannelLookup({ fetch:async () => response(body) });
  assert.equal((await service.lookup(candidate)).channel.channelId,ID);
});
test('legacy HTTP vanity metadata is compared locally while requests remain HTTPS', async () => {
  const body = html().replace(`"vanityChannelUrl":"${candidate.url}"`,`"vanityChannelUrl":"http://www.youtube.com/@fixture"`);
  let requested;
  const service = createChannelLookup({ fetch:async url => { requested = url; return response(body); } });
  assert.equal((await service.lookup(candidate)).channel.channelId,ID);
  assert.ok(requested.startsWith('https://www.youtube.com/'));
});
test('a canonical and identifier pair is sufficient without executable page data', async () => {
  const body = `<!doctype html><head><meta content='${ID}' itemprop='identifier'><link href='/channel/${ID}' rel='canonical'></head>`;
  const service = createChannelLookup({ fetch:async () => response(body) });
  assert.equal((await service.lookup(candidate)).channel.channelId,ID);
});
test('tag-looking script strings and comments cannot create authoritative channel metadata', async () => {
  const body = `<!doctype html><head><!-- <meta itemprop="identifier" content="${OTHER}"> -->
  <script>var fake='<meta itemprop="identifier" content="${OTHER}">';</script>
  <meta itemprop="identifier" content="${ID}"><link rel="canonical" href="/channel/${ID}"></head>`;
  const service = createChannelLookup({ fetch:async () => response(body) });
  assert.equal((await service.lookup(candidate)).channel.channelId,ID);
});
test('conflicting canonical, identifier or initial-data identities are rejected', async () => {
  for (const body of [html().replace(`itemprop="identifier" content="${ID}"`,`itemprop="identifier" content="${OTHER}"`),
    html().replace(`"externalId":"${ID}"`,`"externalId":"${OTHER}"`),html().replace(candidate.url,'https://www.youtube.com/@different')]) {
    const service = createChannelLookup({ fetch:async () => response(body) });
    assert.equal((await service.lookup(candidate)).code,'conflict');
  }
});
test('handles are parsed as one safe creator path and never as arbitrary request URLs', async () => {
  let calls = 0;
  const service = createChannelLookup({ fetch:async () => { calls++; return response(); } });
  for (const url of ['https://evil.test/@fixture','http://www.youtube.com/@fixture','https://www.youtube.com.evil/@fixture',
    'https://user@www.youtube.com/@fixture','https://www.youtube.com/@fixture?x=1','https://www.youtube.com/@fixture#x',
    'https://www.youtube.com/@fixture/videos','https://www.youtube.com/@%2Ffixture','https://www.youtube.com/@%5Cfixture','https://www.youtube.com/watch?v=aaaaaaaaaaa']) {
    assert.equal((await service.lookup({ ...candidate,url })).code,'invalid',url);
  }
  assert.equal(calls,0);
});
test('Unicode creator handles are encoded without changing their displayed identity', async () => {
  const input = { handle:'@猫ちゃん',url:'https://www.youtube.com/@%E7%8C%AB%E3%81%A1%E3%82%83%E3%82%93',name:'Creator' };
  const body = html().replaceAll(candidate.url,input.url);
  const service = createChannelLookup({ fetch:async url => response(body,{ url }) });
  const result = await service.lookup(input);
  assert.equal(result.ok,true); assert.equal(result.channel.handle,input.handle); assert.equal(result.channel.url,input.url);
});
test('response identity stays bound to the requested handle or canonical channel redirect', async () => {
  for (const url of ['https://consent.youtube.com/m','https://accounts.google.com/ServiceLogin','https://www.youtube.com/watch?v=aaaaaaaaaaa',
    'https://www.youtube.com/@other','https://www.youtube.com/@fixture?unsupported=1','https://www.youtube.com/@fixture?cbrd=2']) {
    const service = createChannelLookup({ fetch:async () => response(html(),{ url }) });
    assert.equal((await service.lookup(candidate)).code,'unavailable',url);
  }
  for (const url of [candidate.url+'?cbrd=1&ucbcb=1',`https://www.youtube.com/channel/${ID}`]) {
    const service = createChannelLookup({ fetch:async () => response(html(),{ url }) });
    assert.equal((await service.lookup(candidate)).ok,true,url);
  }
});
test('unavailable, non-HTML and identity-free pages cannot verify a channel', async () => {
  for (const value of [response(html(),{ status:404 }),response(html(),{ type:'application/json' }),response('<html><head></head><body>Sign in</body></html>')]) {
    const service = createChannelLookup({ fetch:async () => value });
    assert.equal((await service.lookup(candidate)).ok,false);
  }
});
test('declared and streamed response byte limits are enforced', async () => {
  for (const value of [response(html(),{ declared:'5000' }),response(' '.repeat(1100))]) {
    const service = createChannelLookup({ maximumBytes:1024,fetch:async () => value });
    assert.equal((await service.lookup(candidate)).code,'too-large');
  }
});
test('malformed UTF-8 and unsupported body readers fail without returning a channel', async () => {
  const malformed = new Response(new Uint8Array([0xc3,0x28]),{ headers:{ 'content-type':'text/html' } });
  Object.defineProperty(malformed,'url',{ value:candidate.url });
  for (const value of [malformed,{ ok:true,url:candidate.url,headers:new Headers({ 'content-type':'text/html' }),body:null }]) {
    const service = createChannelLookup({ fetch:async () => value });
    assert.equal((await service.lookup(candidate)).ok,false);
  }
});
test('streamed bytes from another browser realm retain the same bounded parsing contract', async () => {
  const bytes = vm.runInNewContext(`new Uint8Array(${JSON.stringify([...new TextEncoder().encode(html())])})`);
  let sent = false;
  const service = createChannelLookup({ fetch:async () => ({ ok:true,url:candidate.url,
    headers:new Headers({ 'content-type':'text/html' }),body:{ getReader:() => ({
      read:async () => sent ? { done:true } : (sent = true,{ done:false,value:bytes }),cancel:async () => {},releaseLock() {},
    }) } }) });
  assert.equal((await service.lookup(candidate)).channel.channelId,ID);
});
test('pre-aborted requests do not fetch and aborted pending requests cannot populate cache', async () => {
  let calls = 0, release;
  const controller = new AbortController(); controller.abort();
  const service = createChannelLookup({ fetch:async () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  assert.equal((await service.lookup(candidate,{ signal:controller.signal })).code,'cancelled'); assert.equal(calls,0);
  const pendingController = new AbortController(), pending = service.lookup(candidate,{ signal:pendingController.signal });
  pendingController.abort();
  assert.equal((await pending).code,'cancelled');
  release(response());
});
test('timeouts also bound a fetch or reader that ignores its AbortSignal', async () => {
  const fetchService = createChannelLookup({ timeoutMs:10,fetch:() => new Promise(() => {}) });
  assert.equal((await fetchService.lookup(candidate)).code,'timeout');
  const streamService = createChannelLookup({ timeoutMs:10,fetch:async () => ({ ok:true,url:candidate.url,
    headers:new Headers({ 'content-type':'text/html' }),body:{ getReader:() => ({ read:() => new Promise(() => {}),cancel:() => new Promise(() => {}),releaseLock() {} }) } }) });
  assert.equal((await streamService.lookup(candidate)).code,'timeout');
});
test('successful cache entries expire and clear invalidates outstanding capabilities', async () => {
  let clock = 1000, calls = 0;
  const service = createChannelLookup({ now:() => clock,fetch:async () => { calls++; return response(); } });
  const first = await service.lookup(candidate); await service.lookup(candidate); assert.equal(calls,1);
  clock += 600000;
  assert.equal(service.isVerified(candidate,first.channel),false);
  await service.lookup(candidate); assert.equal(calls,2);
  service.clear(); assert.equal(service.isVerified(candidate,first.channel),false);
  await service.lookup(candidate); assert.equal(calls,3);
});
test('clearing a pending lookup cancels it and cannot revive its old result', async () => {
  let release;
  const service = createChannelLookup({ fetch:() => new Promise(resolve => { release = resolve; }) });
  const pending = service.lookup(candidate); service.clear();
  assert.equal((await pending).code,'cancelled');
  release(response());
});
