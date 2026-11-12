import test from 'node:test';
import assert from 'node:assert/strict';
import {Effects} from '../src/fx.mjs';

function recording(){
  const calls=[];let depth=0;const noop=()=>{};
  const ctx=new Proxy({save(){depth++;},restore(){depth--;assert.ok(depth>=0);},createRadialGradient:()=>({addColorStop:noop})},
    {get:(o,k)=>k in o?o[k]:(...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n));calls.push([k,...args]);}});
  return {ctx,calls,balanced:()=>assert.equal(depth,0)};
}
const layout={width:1060,height:800,board:{x:100,y:48,cell:34,cols:10,rows:20}};
const clear=(lines=1,combo=1)=>({type:'clear',bossId:1,seq:1,lines,combo,damage:30,rows:Array.from({length:lines},(_,i)=>({row:19-i,colors:Array(10).fill('I')}))});

test('single, double, triple and quad attacks have distinct shapes without moving impact timing',()=>{
  const counts=[];
  for(const lines of [1,2,3,4]){
    const audio=[],fx=new Effects({play:(...args)=>audio.push(args)}),event=clear(lines);
    Object.freeze(event);fx.consume([event]);fx.update(.09);
    const r=recording();fx.draw(r.ctx,layout,{x:715,y:335});r.balanced();
    counts.push(r.calls.filter(c=>c[0]==='fillRect').length);
    assert.deepEqual(audio.map(a=>a[0]),['clear']);
    fx.update(.089);assert.equal(fx.numbers.length,0);fx.update(.002);
    assert.equal(fx.numbers.length,1);assert.equal(audio.at(-1)[2].lines,lines);
  }
  assert.deepEqual(counts,[1,2,3,5]);
});

test('aura excludes the entire cell area, caps at six and yields to danger/reduced effects',()=>{
  const fx=new Effects();
  const normal=recording();fx.drawAura(normal.ctx,layout,{combo:6});normal.balanced();
  assert.ok(normal.calls.some(c=>c[0]==='rect'&&c[1]===100&&c[2]===48&&c[3]===340&&c[4]===680));
  assert.ok(normal.calls.some(c=>c[0]==='clip'&&c[1]==='evenodd'));
  assert.equal(normal.calls.filter(c=>c[0]==='fillRect').length,24);
  const capped=recording();fx.drawAura(capped.ctx,layout,{combo:100});assert.equal(capped.calls.length,normal.calls.length);
  const danger=recording();fx.drawAura(danger.ctx,layout,{combo:6,danger:true});assert.deepEqual(danger.calls,[]);
  const reduced=recording();fx.drawAura(reduced.ctx,layout,{combo:6,reducedMotion:true});
  assert.equal(reduced.calls.filter(c=>c[0]==='fillRect').length,0);reduced.balanced();
  fx.consume([clear(1,6),{type:'comboProtected',bossId:1,seq:2,combo:6}]);
  const protectedView=recording();fx.drawAura(protectedView.ctx,layout);assert.equal(protectedView.calls.length,normal.calls.length);
  fx.consume([{type:'comboEnded',bossId:1,seq:3,combo:6}]);const ended=recording();fx.drawAura(ended.ctx,layout);assert.equal(ended.calls.length,0);
});

test('portrait projectile routes outside the board and impact numbers stay in the boss strip',()=>{
  const fx=new Effects(),mobile={width:372,height:698,board:{x:55,y:112,cell:26.2,cols:10,rows:20}};
  fx.consume([clear(4,6)]);fx.update(.1);
  const flight=recording();fx.draw(flight.ctx,mobile,{x:40,y:35},{compact:true});flight.balanced();
  for(const point of flight.calls.filter(c=>c[0]==='lineTo'||c[0]==='moveTo'))
    assert.ok(point[1]>=55+262||point[2]<112,'outgoing projectile avoids live cells');
  fx.update(.09);const impact=recording();fx.draw(impact.ctx,mobile,{x:40,y:35},{compact:true});
  const number=impact.calls.find(c=>c[0]==='fillText'&&c[1]==='−30');
  assert.ok(number);assert.ok(number[3]>=16&&number[3]<112);impact.balanced();
});
