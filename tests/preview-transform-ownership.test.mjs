// Language: en-GB. Exercise the actual preview ownership guard at crossing offsets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source=readFileSync(new URL('../sources/modules/youtube-player-preferences-lite.user.js',import.meta.url),'utf8');
const start=source.indexOf('let sponsorOffsetY = 0;');
const end=source.indexOf('const box = player.getBoundingClientRect()',start);
assert.ok(start>=0&&end>start);
const inspect=new Function('node','nativeStyle','DOMMatrixReadOnly','performance',
  'let sponsorMotion=null,sponsorTransitionActive=false;'+source.slice(start,end)+'return true;');
class Matrix {
  constructor(value){
    this.is2D=true;this.a=this.d=1;this.b=this.c=this.e=0;
    this.f=Number(String(value??'none').match(/^translateY\((-?[\d.]+)px\)$/)?.[1]??0);
  }
}
function accepts(offset,destination){
  const node={classList:{contains:name=>name==='sponsorCategoryTooltipVisible'},closest:()=>null,
    style:{getPropertyValue:()=>''},getAnimations:()=>[{transitionProperty:'transform',playState:'running',
      effect:{target:node,getComputedTiming:()=>({endTime:250}),getKeyframes:()=>[{transform:'none'},{transform:`translateY(${destination}px)`}]}}]};
  return inspect(node,{scale:'none',translate:'none',rotate:'none',fontSize:'14px',transform:`translateY(${offset}px)`},Matrix,{now:()=>100})===true;
}

test('foreign transitions cannot claim ownership by crossing the documented SponsorBlock offset',()=>{
  for(const offset of [-13.96,-14,-14.04])assert.equal(accepts(offset,-250),false,`${offset}px crossing`);
});
test('documented SponsorBlock transitions retain ownership at intermediate and final offsets',()=>{
  for(const offset of [-7,-14])assert.equal(accepts(offset,-14),true,`${offset}px documented motion`);
});
