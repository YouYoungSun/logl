import test from 'node:test';
import assert from 'node:assert/strict';
import {Effects} from '../src/fx.mjs';
import {AudioDirector} from '../src/audio.mjs';

const clear=(seq,combo,lines=1)=>({type:'clear',bossId:1,seq,combo,lines,damage:10,
  rows:[{row:19,colors:Array(10).fill('I')}],hpBefore:100,hpAfter:90});
function recording(){
  let depth=0;const calls=[];
  const ctx=new Proxy({save(){depth++;},restore(){depth--;assert.ok(depth>=0);}},
    {get:(o,k)=>k in o?o[k]:(...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n));calls.push([k,...args]);}});
  return {ctx,calls,balanced:()=>assert.equal(depth,0),labels:()=>calls.filter(c=>c[0]==='fillText').map(c=>c[1])};
}

test('combo success updates at clear and delayed impacts cannot rewind the latest number',()=>{
  const sounds=[],fx=new Effects({play:(...a)=>sounds.push(a)});
  fx.consume([clear(1,1,3)]);assert.equal(fx.comboFeedback.count,1);
  const first=recording();fx.drawCombo(first.ctx);first.balanced();
  assert.ok(first.labels().includes('연쇄 시작'));assert.ok(first.labels().includes('3줄 제거'));
  fx.update(.05);fx.consume([clear(2,2)]);assert.equal(fx.comboFeedback.count,2);
  fx.update(.14);assert.equal(fx.comboFeedback.count,2);
  assert.equal(sounds.filter(s=>s[0]==='hit').length,1);
  fx.consume([clear(1,1)]);assert.equal(fx.comboFeedback.count,2);
  fx.update(.1);assert.equal(fx.comboFeedback.count,2);
  assert.equal(sounds.filter(s=>s[0]==='hit').length,2);
  fx.update(5);const active=recording();fx.drawCombo(active.ctx);active.balanced();
  assert.ok(active.labels().includes('2'));assert.ok(active.labels().includes('2연쇄'));
});

test('protected chains retain their number, true breaks fade quietly, resets never report failure',()=>{
  const fx=new Effects();fx.consume([clear(1,4),{type:'comboProtected',bossId:1,seq:2,combo:4}]);
  const protectedView=recording();fx.drawCombo(protectedView.ctx);
  assert.ok(protectedView.labels().includes('연쇄 보호 사용'));assert.equal(fx.comboFeedback.count,4);
  fx.update(2);assert.equal(fx.comboFeedback.count,4);
  fx.consume([{type:'comboEnded',bossId:1,seq:3,combo:4}]);
  const ended=recording();fx.drawCombo(ended.ctx);assert.ok(ended.labels().includes('연쇄 종료'));
  fx.update(1.2);const faded=recording();fx.drawCombo(faded.ctx);assert.deepEqual(faded.labels(),[]);
  fx.consume([clear(4,3),{type:'stageClear',bossId:1,seq:5}]);assert.equal(fx.comboFeedback.kind,'idle');
  fx.consume([clear(6,2),{type:'death',bossId:1,seq:7}]);assert.equal(fx.comboFeedback.kind,'idle');
  fx.reset(2);fx.consume([clear(99,99)]);assert.equal(fx.comboFeedback.kind,'idle');
});

test('high combos remain readable with capped accents and no movement in reduced effects',()=>{
  const fx=new Effects();fx.consume([clear(1,9)]);
  const still=recording();fx.drawCombo(still.ctx,undefined,{reducedMotion:true});still.balanced();
  assert.ok(still.labels().includes('9'));assert.ok(still.labels().includes('연쇄 보너스 최대'));
  assert.ok(still.calls.filter(c=>c[0]==='scale').every(c=>c[1]===1&&c[2]===1));
  const regular=recording();fx.drawCombo(regular.ctx);regular.balanced();
  assert.equal(regular.calls.some(c=>c[0]==='strokeRect'),false,'no additional burst above the cap');
});

test('clear sound pitch rises without adding voices and is capped at six chains',()=>{
  const starts=[];const noop=()=>{};
  const audio=new AudioDirector();audio.master={};
  audio.ctx={state:'running',currentTime:0,
    createOscillator:()=>({connect:noop,disconnect:noop,start:noop,stop:noop,
      frequency:{setValueAtTime:f=>starts.push(f),exponentialRampToValueAtTime:noop}}),
    createGain:()=>({connect:noop,disconnect:noop,gain:{setValueAtTime:noop,linearRampToValueAtTime:noop,exponentialRampToValueAtTime:noop}})};
  for(const combo of [1,3,6,30])audio.play('clear',1,{combo});
  assert.equal(starts.length,4);assert.ok(starts[0]<starts[1]&&starts[1]<starts[2]);
  assert.equal(starts[2],starts[3]);assert.ok(audio.voices.length<=4);
});
