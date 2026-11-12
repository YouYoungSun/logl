import test from 'node:test';
import assert from 'node:assert/strict';
import {Effects} from '../src/fx.mjs';

const desktop={width:1060,height:800,board:{x:100,y:48,cell:34,cols:10,rows:20},boss:{x:550,y:160,w:330,h:350}};
const portrait={width:374,height:718,board:{x:55,y:132,cell:26.4,cols:10,rows:20},boss:{x:8,y:3,w:64,h:64}};
function recording(){
  const calls=[],props=[];let depth=0;
  const ctx=new Proxy({save(){depth++;},restore(){depth--;assert.ok(depth>=0);}},
    {get:(o,k)=>k in o?o[k]:(...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n));calls.push([k,...args]);},
      set:(o,k,v)=>{if(typeof v==='number')assert.ok(Number.isFinite(v));if(k==='globalAlpha')assert.ok(v>=0&&v<=1);o[k]=v;props.push([k,v]);return true;}});
  return {ctx,calls,props,balanced:()=>assert.equal(depth,0),count:name=>calls.filter(c=>c[0]===name).length};
}
const clear=(seq=2,lines=4,tier=4)=>({type:'clear',bossId:1,seq,lines,combo:2,damage:50,
  momentum:[0,1,4,8,12][tier],momentumTier:tier,style:'compress',momentumReasons:['4줄 강화'],
  rows:Array.from({length:lines},(_,i)=>({row:19-i,colors:Array(10).fill('I')}))});

test('momentum survives broken/protected combos and sector clear, yields to death, and restores from explicit state after reset',()=>{
  const fx=new Effects();
  fx.consume([{type:'momentumUp',bossId:1,seq:1,value:8,tier:3,reason:'줄 제거'},clear(2,1,3),
    {type:'comboProtected',bossId:1,seq:3,combo:2},{type:'comboEnded',bossId:1,seq:4,combo:2},
    {type:'stageClear',bossId:1,seq:5}]);
  assert.equal(fx.momentumFeedback.value,8);assert.equal(fx.comboFeedback.kind,'idle');
  const retained=recording();fx.drawAura(retained.ctx,desktop);retained.balanced();assert.ok(retained.count('fill')>0);
  fx.consume([{type:'death',bossId:1,seq:6}]);assert.equal(fx.momentumFeedback.value,0);
  const ended=recording();fx.drawAura(ended.ctx,desktop);assert.equal(ended.calls.length,0);
  fx.reset(2);const restored=recording();fx.drawAura(restored.ctx,desktop,{momentum:12,momentumTier:4});
  assert.equal(fx.displayMomentumTier,4);assert.ok(restored.count('fill')>0);restored.balanced();
  fx.consume([{...clear(1),bossId:2}]);assert.equal(fx.attacks[0].event.effectTier,4);
});

test('four momentum tiers add distinct crowns, fins and orbit silhouettes without covering cells or HUD space',()=>{
  const fx=new Effects(),fills=[],sparks=[];
  for(const [value,tier]of [[1,1],[4,2],[8,3],[12,4]]){
    const r=recording();fx.drawAura(r.ctx,portrait,{momentum:value,momentumTier:tier,compact:true,auraTopSpace:24});r.balanced();
    fills.push(r.count('fill'));sparks.push(r.count('fillRect'));
    assert.ok(r.calls.some(c=>c[0]==='rect'&&c[1]===55&&c[2]===132&&c[3]===264&&c[4]===528));
    assert.ok(r.calls.some(c=>c[0]==='clip'&&c[1]==='evenodd'));
    const outer=r.calls.find(c=>c[0]==='rect');assert.equal(outer[2],108,'crown clipping begins below the attack forecast');
  }
  assert.ok(fills[0]<fills[1]&&fills[1]<fills[2]&&fills[2]<fills[3]);
  assert.deepEqual(sparks,[8,16,24,32]);
  const capped=recording();fx.drawAura(capped.ctx,portrait,{momentum:999,compact:true});assert.equal(capped.count('fillRect'),32);
  const suppressed=recording();fx.drawAura(suppressed.ctx,portrait,{momentum:12,danger:true,compact:true});assert.equal(suppressed.calls.length,0);
  const zero=recording();fx.consume([clear(1,1,0)]);fx.drawAura(zero.ctx,desktop,{momentum:0,combo:9});assert.equal(zero.calls.length,0);
});

test('reduced effects preserve the high-tier silhouette without moving sparks or escalating brightness',()=>{
  const fx=new Effects(),high=recording();
  fx.drawAura(high.ctx,desktop,{momentum:12,reducedMotion:true});high.balanced();
  assert.ok(high.count('fill')>=17);assert.equal(high.count('fillRect'),0);
  assert.ok(high.props.filter(([k])=>k==='globalAlpha').every(([,v])=>v<=.68));
  const low=recording();fx.drawAura(low.ctx,desktop,{momentum:1,reducedMotion:true});assert.ok(low.count('fill')<high.count('fill'));
});

test('high-momentum attacks visibly add afterimages and local rings while impact remains exactly attack-gated at 180ms',()=>{
  for(const lines of [1,2,3,4]){
    const low=new Effects(),sounds=[],high=new Effects({play:(...args)=>sounds.push(args)});
    low.consume([clear(1,lines,0)]);const event=clear(1,lines,4),before=JSON.stringify(event);
    Object.freeze(event.rows[0].colors);Object.freeze(event.rows[0]);Object.freeze(event.rows);Object.freeze(event.momentumReasons);Object.freeze(event);
    high.consume([event]);low.update(.1);high.update(.1);
    const a=recording(),b=recording();low.draw(a.ctx,desktop,{x:715,y:335});high.draw(b.ctx,desktop,{x:715,y:335});a.balanced();b.balanced();
    assert.ok(b.count('fillRect')>a.count('fillRect'));assert.ok(b.count('lineTo')>a.count('lineTo'));
    high.update(.079);assert.equal(high.numbers.length,0);high.update(.002);assert.equal(high.numbers.length,1);
    assert.equal(sounds.at(-1)[0],'hit');assert.equal(sounds.at(-1)[2].momentumTier,4);
    const impact=recording();high.draw(impact.ctx,desktop,{x:715,y:335});assert.ok(impact.count('ellipse')>=3);impact.balanced();
    high.update(.14);const expanded=recording();high.draw(expanded.ctx,desktop,{x:715,y:335});
    assert.ok(expanded.count('ellipse')>=3,'shockwaves remain readable after the initial flash');
    assert.ok(expanded.count('fill')>0,'a filled explosion silhouette accompanies high momentum');expanded.balanced();
    assert.equal(JSON.stringify(event),before);
  }
});

test('style events update only the matching pending attack and leave original immutable snapshots unchanged',()=>{
  const fx=new Effects(),event=clear(1,2,2);Object.freeze(event);fx.consume([event]);
  fx.consume([{type:'momentumStyle',bossId:1,seq:2,value:4,tier:2,reason:'방해 행 차단',style:'guard'}]);
  assert.equal(event.style,'compress');assert.equal(fx.attacks[0].event.style,'guard');
  fx.update(.18);fx.consume([{type:'momentumStyle',bossId:1,seq:3,value:4,tier:2,style:'landing'}]);
  assert.equal(fx.attacks[0].event.style,'guard','a past impact is not retrospectively restyled');
});

test('particle, attack and damage-number budgets stay bounded in desktop and portrait bursts',()=>{
  const fx=new Effects();fx.consume(Array.from({length:90},(_,i)=>clear(i+1,4,4)));assert.equal(fx.attacks.length,64);
  fx.update(.18);assert.ok(fx.pool.filter(p=>p.active).length<=240);assert.equal(fx.pool.length,320);assert.equal(fx.numbers.length,4);
  const aura=recording();fx.drawAura(aura.ctx,desktop,{momentum:12});assert.equal(aura.count('fillRect'),72);
  const compact=recording();fx.draw(compact.ctx,portrait,{x:40,y:35},{compact:true});compact.balanced();assert.ok(fx.pool.filter(p=>p.active).length<=120);
  const mobileAura=recording();fx.drawAura(mobileAura.ctx,portrait,{momentum:12,compact:true});assert.equal(mobileAura.count('fillRect'),32);
  fx.reset(2);assert.equal(fx.pool.filter(p=>p.active).length,0);assert.equal(fx.momentumFeedback.value,0);
});
