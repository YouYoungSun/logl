import test from 'node:test';
import assert from 'node:assert/strict';
import {Effects,PC_ATTACK_TIMING} from '../src/fx.mjs';
import {AudioDirector} from '../src/audio.mjs';
import {drawBoss,bossAnchor} from '../src/boss-art.mjs';

const clear=(seq=1,extra={})=>({type:'clear',bossId:1,seq,lines:4,combo:2,damage:40,hpBefore:100,hpAfter:60,
  rows:[{row:19,colors:Array(10).fill('I')}],momentumTier:4,...extra});

test('PC impact notices synchronize display at 180ms and remain one-shot across frame skips and reset',()=>{
  const fx=new Effects();fx.setPresentationMode(false);fx.consume([clear()]);
  fx.update(.179);assert.deepEqual(fx.drainImpacts(),[]);
  fx.update(.002);assert.deepEqual(fx.drainImpacts(),[{id:1,bossId:1,hpBefore:100,hpAfter:60,killed:false,at:.18}]);
  assert.deepEqual(fx.drainImpacts(),[]);fx.update(.4);assert.equal(fx.attacks.length,1);
  fx.update(.4);assert.equal(fx.attacks.length,0);
  fx.consume([clear(2)]);fx.update(2);assert.equal(fx.drainImpacts().length,1);
  fx.consume([clear(3)]);fx.update(.18);fx.reset(2);assert.deepEqual(fx.drainImpacts(),[]);
});

test('explicit PC presentation extends fatal decomposition while compact/default retain their original gate',()=>{
  const pc=new Effects();pc.setPresentationMode(false);pc.consume([clear(1,{killed:true,hpAfter:0})]);
  assert.equal(pc.readyAt,PC_ATTACK_TIMING.killComplete);pc.update(.4);assert.ok(pc.death>0&&pc.death<1);
  pc.update(.55);assert.equal(pc.death,1);pc.reset(2);assert.equal(pc.pcPresentation,true);
  for(const compact of [undefined,true]){
    const fx=new Effects();if(compact!==undefined)fx.setPresentationMode(compact);
    fx.consume([clear(1,{killed:true,hpAfter:0})]);assert.equal(fx.readyAt,.4);fx.update(.4);assert.equal(fx.death,1);
  }
});

test('PC promotion/discharge cues are bounded milestones and impact sound remains tied to landing',()=>{
  const sounds=[],fx=new Effects({play:(...args)=>sounds.push(args)});fx.setPresentationMode(false);
  fx.consume([{type:'momentumUp',bossId:1,seq:1,value:12,tier:4},clear(2),
    {type:'momentumUp',bossId:1,seq:3,value:13,tier:4},
    {type:'momentumUp',bossId:1,seq:4,value:16,tier:4}]);
  assert.deepEqual(sounds.map(s=>s[0]),['momentum','clear','discharge']);
  fx.update(.18);assert.equal(sounds.at(-1)[0],'hit');assert.equal(sounds.at(-1)[2].presentation,'pc');
  const mobile=[];const small=new Effects({play:(...args)=>mobile.push(args)});small.setPresentationMode(true);
  small.consume([{type:'momentumUp',bossId:1,seq:1,value:12,tier:4}]);assert.equal(mobile.length,0);
});

function audioFixture(){
  const oscillators=[],noop=()=>{},param=()=>({value:0,setValueAtTime:noop,linearRampToValueAtTime:noop,exponentialRampToValueAtTime:noop});
  const audio=new AudioDirector();audio.master={};audio.ctx={state:'running',currentTime:1,
    createGain:()=>({gain:param(),connect:noop,disconnect:noop}),
    createOscillator:()=>{const o={frequency:param(),connect:noop,disconnect:noop,start:noop,stops:0,stop(){this.stops++;}};oscillators.push(o);return o;}};
  return {audio,oscillators};
}

test('layered PC sound has a hard four-source budget, hit priority, and cancels scheduled tails on stop',()=>{
  const {audio,oscillators}=audioFixture();
  audio.play('hit',1,{presentation:'pc',lines:4});assert.equal(audio.voices.length,3);
  const hits=[...audio.voices];audio.play('clear',1,{presentation:'pc'});audio.play('lock');
  assert.ok(hits.every(h=>audio.voices.includes(h)),'quiet cues cannot steal hit layers');
  for(let i=0;i<60;i++)audio.play(i%2?'momentum':'hit',1,{presentation:'pc',lines:4,momentumTier:4});
  assert.ok(audio.voices.length<=4);
  const retained=[...audio.voices];audio.stop();assert.equal(audio.voices.length,0);
  assert.ok(retained.every(v=>v.stops>=2),'stop overrides previously scheduled tails');
  audio.setEnabled(false);const before=oscillators.length;audio.play('hit',1,{presentation:'pc'});assert.equal(oscillators.length,before);
});

test('boss fracture and split preserve target anchor, finite geometry and reduced-motion readability',()=>{
  const opts={x:550,y:160,w:330,h:350,time:.3};const anchor=bossAnchor(opts);
  function render(extra){
    const calls=[];let depth=0;const noop=(...args)=>{for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a));};
    const ctx=new Proxy({globalAlpha:1,save(){depth++;},restore(){assert.ok(depth>0);depth--;},createRadialGradient(){return {addColorStop:noop};}},
      {get:(o,k)=>k in o?o[k]:(...args)=>{noop(...args);calls.push([k,...args]);},set:(o,k,v)=>{o[k]=v;return true;}});
    drawBoss(ctx,{...opts,...extra});assert.equal(depth,0);return calls;
  }
  const normal=render({}),split=render({impactSplit:1,scar:1,hitStyle:'compress',direction:-1}),reduced=render({impactSplit:1,scar:1,reducedMotion:true});
  assert.ok(split.filter(c=>c[0]==='lineTo').length>normal.filter(c=>c[0]==='lineTo').length);
  assert.ok(reduced.filter(c=>c[0]==='lineTo').length>normal.filter(c=>c[0]==='lineTo').length);
  assert.deepEqual(bossAnchor({...opts,impactSplit:1,scar:1}),anchor);
});
