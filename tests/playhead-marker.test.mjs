// Language: en-GB. Synthetic image and storage checks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { createPlayheadMarker } from '../sources/playhead-marker.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); label.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([label, data])), data.length + 8); return result;
}
function png(width = 1, height = 1) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(height * (1 + width * 4)))), chunk('IEND', Buffer.alloc(0))]);
}
const image = `data:image/png;base64,${png().toString('base64')}`;
const KEY = 'yt-master-suite.playhead-image.v1';
function harness(raw = null, extras = {}) {
  const records = new Map(raw === null ? [] : [[KEY, raw]]), writes = [];
  const storage = {
    getItem: key => records.get(key) ?? null,
    setItem(key, value) { writes.push([key, value]); records.set(key, value); },
    removeItem(key) { writes.push([key, null]); records.delete(key); },
  };
  const window = { MutationObserver: class { observe() {} disconnect() {} }, atob, btoa, Blob, ...extras.window };
  const document = extras.document || {};
  const marker = createPlayheadMarker({ document, window, getStorage: () => storage });
  return { marker, records, storage, writes };
}

test('missing marker is opt-in and saved values are bounded independent copies', () => {
  const h = harness(); assert.deepEqual(h.marker.read(), { ok:true, value:null });
  assert.deepEqual(h.marker.save({dataUrl:image,size:24}), {ok:true,value:{dataUrl:image,size:24}});
  const read = h.marker.read(); read.value.size = 40;
  assert.equal(h.marker.read().value.size, 24);
  assert.deepEqual(h.marker.remove(), {ok:true,value:null});
  assert.equal(h.records.has(KEY), false);
});
test('invalid images, arbitrary URLs and invalid marker sizes never write storage', () => {
  const h = harness();
  for (const value of [null, {}, {dataUrl:'https://example.invalid/image.png',size:24},
    {dataUrl:'data:image/svg+xml;base64,PHN2Zz4=',size:24}, {dataUrl:image,size:NaN},
    {dataUrl:image,size:'24'}, {dataUrl:image,size:15}, {dataUrl:image,size:41},
    {dataUrl:image,size:24,extra:true}, {dataUrl:`data:image/png;base64,${png(65,1).toString('base64')}`,size:24}]) {
    assert.equal(h.marker.save(value).ok, false);
  }
  assert.equal(h.writes.length, 0);
});
test('damaged and newer marker records survive both save and remove requests', () => {
  for (const raw of ['{', 'null', '[]', JSON.stringify({version:2,dataUrl:image,size:24}),
    JSON.stringify({version:1,dataUrl:image,size:24,extra:true}), 'x'.repeat(40101)]) {
    const h = harness(raw); assert.equal(h.marker.read().ok, false);
    assert.equal(h.marker.save({dataUrl:image,size:24}).ok, false);
    assert.equal(h.marker.remove().ok, false);
    assert.equal(h.records.get(KEY), raw); assert.equal(h.writes.length,0);
  }
});
test('failed storage writes leave the saved marker unchanged', () => {
  const raw = JSON.stringify({version:1,dataUrl:image,size:24}), h = harness(raw);
  h.storage.setItem = () => { throw new Error('Synthetic storage quota'); };
  assert.equal(h.marker.save({dataUrl:image,size:32}).ok,false);
  assert.equal(h.records.get(KEY),raw);
});
test('file preparation validates file size, signature and dimensions before decoding', async () => {
  let decodes = 0;
  const h = harness(null,{window:{createImageBitmap:async()=>{ decodes++; throw new Error('Unexpected decode'); }}});
  for (const file of [null, {size:0,arrayBuffer:async()=>new ArrayBuffer(0)},
    {size:2097153,arrayBuffer:async()=>new ArrayBuffer(0)},
    {size:4,type:'image/png',arrayBuffer:async()=>Uint8Array.from([1,2,3,4]).buffer},
    {size:png(1,1).length,type:'image/jpeg',arrayBuffer:async()=>png(1,1)},
    {size:png(4097,1).length,type:'image/png',arrayBuffer:async()=>png(4097,1)}]) {
    assert.equal((await h.marker.prepareFile(file)).ok,false);
  }
  assert.equal(decodes,0); assert.equal(h.writes.length,0);
});
test('file preparation rasterises a bounded PNG without retaining its original bytes or metadata', async () => {
  const original = png(128,64); let closed = 0, drawn, canvas;
  const h = harness(null,{
    document:{createElement(name){assert.equal(name,'canvas');return canvas={width:0,height:0,
      getContext:()=>({drawImage(...args){drawn=args;}}),toDataURL:type=>{assert.equal(type,'image/png');return image;}};}},
    window:{createImageBitmap:async blob=>{assert.equal(blob.type,'image/png');return {width:128,height:64,close(){closed++;}};}},
  });
  const result = await h.marker.prepareFile({size:original.length,type:'image/png',arrayBuffer:async()=>original});
  assert.deepEqual(result,{ok:true,value:{dataUrl:image,size:24}});
  assert.equal(canvas.width,64); assert.equal(canvas.height,32);
  assert.deepEqual(drawn.slice(1),[0,0,64,32]); assert.equal(closed,1); assert.equal(h.writes.length,0);
});
test('file decoding errors and unavailable canvas return errors without changing saved data', async () => {
  const bytes=png(), file={size:bytes.length,type:'image/png',arrayBuffer:async()=>bytes};
  const failure=harness(null,{window:{createImageBitmap:async()=>{throw new Error('Synthetic decode failure');}}});
  assert.equal((await failure.marker.prepareFile(file)).ok,false);
  let closed=0;
  const noCanvas=harness(null,{window:{createImageBitmap:async()=>({width:1,height:1,close(){closed++;}})},
    document:{createElement:()=>({getContext:()=>null})}});
  assert.equal((await noCanvas.marker.prepareFile(file)).ok,false); assert.equal(closed,1);
});
