import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,STAGES,RULES_VERSION} from '../src/core.mjs';

const blank=()=>Array.from({length:20},()=>Array(10).fill(null));
function fixture(g,clear=false){
  g.state.board=blank();g.state.tags=Array(20).fill(null);
  if(clear){
    g.state.board[19].fill('G');
    for(let x=3;x<7;x++)g.state.board[19][x]=null;
    g.state.active={type:'I',rotation:0,x:3,y:18};
  }else g.state.active={type:'O',rotation:0,x:3,y:18};
  g._lockTime=0;g._fall=0;
}
function assisted(seed,stage){
  const g=new Game(seed,{mode:'assisted',startStage:stage});
  while(g.state.status==='rebuild')assert.equal(g.choose(0),true);
  assert.equal(g.beginPreparedRun(),true);return g;
}

test('v2 attack bundles align every hole and independently permit repeated columns',()=>{
  assert.equal(RULES_VERSION,'2.0.3');
  for(let stage=1;stage<=10;stage++){
    const g=new Game('aligned');g.state.stage=stage;g._beginStage();
    const samples=[.21,.21,.91];g._garbage=()=>samples.shift();
    for(const expected of [2,2,9]){
      g.state.boss.stageLocks=200;g._planCycle();
      assert.ok(g._plannedHoles.length>=3);
      assert.ok(g._plannedHoles.every(hole=>hole===expected));
      assert.equal(g.state.boss.stagger,false);
    }
  }
});

test('one reroll per reward changes the offer set without changing pieces or garbage',()=>{
  const a=new Game('reroll'),b=new Game('reroll');
  a._victory();b._victory();const before=structuredClone(a.state.offers);
  const identity=offers=>offers.map(o=>o.upgrade+o.burden).sort();
  assert.equal(a.rerollOffers(),true);
  assert.notDeepEqual(identity(a.state.offers),identity(before));
  assert.equal(a.rerollOffers(),false);
  assert.equal(a.state.rerollsLeft,0);
  assert.equal(a.choose(0),true);assert.equal(b.choose(0),true);
  assert.deepEqual(a.state.queue,b.state.queue);
  assert.deepEqual(a.state.boss.holes,b.state.boss.holes);
  a._victory();assert.equal(a.state.rerollsLeft,1);
  assert.equal(a.rerollOffers(),true);
});

test('assisted preparation makes exactly target minus one choices and never fabricates clears',()=>{
  const g=new Game('rebuild',{mode:'assisted',startStage:10}),s=g.state;
  assert.equal(s.status,'rebuild');assert.equal(s.rebuildStep,1);
  assert.equal(g.act('drop'),false);g.step(10);assert.equal(s.stats.seconds,0);
  for(let i=1;i<=9;i++){
    assert.equal(s.rebuildStep,i);assert.equal(s.rerollsLeft,1);
    assert.equal(g.rerollOffers(),true);assert.equal(g.choose(0),true);
  }
  assert.equal(s.status,'ready');assert.equal(s.stats.cleared,0);
  assert.equal(Object.values(s.upgrades).reduce((a,b)=>a+b,0),9);
  assert.equal(Object.values(s.burdens).reduce((a,b)=>a+b,0),9);
  assert.equal(g.act('drop'),false);assert.equal(g.beginPreparedRun(),true);
  assert.equal(s.stage,10);assert.equal(s.status,'playing');
  assert.equal(g.beginPreparedRun(),false);
  g._victory();assert.equal(s.stats.cleared,1);assert.equal(s.status,'won');
});

test('start stage validates and standard runs remain ordinary one-stage starts',()=>{
  for(const startStage of [0,11,2.5,'4'])assert.throws(()=>new Game('bad',{startStage}),RangeError);
  assert.throws(()=>new Game('bad',{startStage:3,mode:'standard'}),RangeError);
  const g=new Game('standard');assert.equal(g.state.mode,'standard');
  assert.equal(g.state.status,'playing');assert.equal(g.state.startStage,1);
  assert.equal(g.rerollOffers(),false);
  for(const mode of ['practice','',0,false])assert.throws(()=>new Game('bad',{mode}),RangeError);
  const assistedFirst=new Game('first',{mode:'assisted',startStage:1});
  assert.equal(assistedFirst.state.mode,'assisted');assert.equal(assistedFirst.state.status,'playing');
});

test('rerolls reproduce for the same seed and an identical redraw is repaired deterministically',()=>{
  const a=new Game('repro',{startStage:4}),b=new Game('repro',{startStage:4});
  for(let step=0;step<3;step++){
    assert.deepEqual(a.state.offers,b.state.offers);
    assert.equal(a.rerollOffers(),true);assert.equal(b.rerollOffers(),true);
    assert.deepEqual(a.state.offers,b.state.offers);
    assert.equal(a.choose(1),true);assert.equal(b.choose(1),true);
  }
  assert.equal(a.state.status,'ready');assert.equal(a.rerollOffers(),false);
  assert.equal(a.choose(0),false);a.step(20);assert.equal(a.state.stats.seconds,0);
  const g=new Game('fallback');g._victory();const old=structuredClone(g.state.offers);
  g._makeOffers=()=>structuredClone(old);
  assert.equal(g.rerollOffers(),true);
  const identity=offers=>offers.map(o=>o.upgrade+':'+o.burden).sort();
  assert.notDeepEqual(identity(g.state.offers),identity(old));
});

test('opening adds flat plus base-stage-HP damage twice and scales before defense and dampening',()=>{
  const g=assisted('opening',10),s=g.state;
  Object.keys(s.upgrades).forEach(k=>s.upgrades[k]=0);
  Object.keys(s.burdens).forEach(k=>s.burdens[k]=0);
  s.upgrades.opening=2;s.burdens.vitality=3;s.burdens.dampen=1;
  s.boss.remaining=99;
  for(let i=0;i<3;i++){
    s.combo=0;fixture(g,true);g.act('drop');
    const e=g.drainEvents().find(e=>e.type==='clear');
    assert.equal(e.damage,Math.floor((10+(i<2?(6+STAGES[9].hp*.01)*2:0))*.96+.5));
  }
});

test('phase changes remain attack-gated and NEXT concealment uses simulation time',()=>{
  const g=assisted('phases',10),s=g.state,b=s.boss;
  b.hp=500;g._reservePhase();assert.equal(b.pendingPhase,3);assert.equal(b.phase,1);
  fixture(g);b.remaining=1;g.act('drop');
  assert.equal(b.phase,3);assert.equal(b.obscureRemaining,3);
  assert.ok(g.drainEvents().some(e=>e.type==='phaseChange'&&e.phase===3));
  // Keep the active block aloft so timing checks do not introduce combat turns.
  const advance=seconds=>{for(let t=0;t<seconds;t++){s.active={type:'O',rotation:0,x:3,y:-1};g.step(1);}};
  advance(3);assert.equal(b.obscureRemaining,0);
  advance(8);assert.equal(b.obscureRemaining,0);
  advance(1);assert.equal(b.obscureRemaining,3);
  const remaining=b.obscureRemaining;s.status='reward';g.step(20);
  assert.equal(b.obscureRemaining,remaining);s.status='playing';
  advance(3);assert.equal(b.obscureRemaining,0);
});

test('phase two and three activate once each without making the boss immune before its attack',()=>{
  const g=assisted('phase-boundaries',10),s=g.state,b=s.boss;
  Object.keys(s.upgrades).forEach(k=>s.upgrades[k]=0);
  Object.keys(s.burdens).forEach(k=>s.burdens[k]=0);
  b.hp=b.maxHp*.70+5;b.remaining=3;
  fixture(g,true);g.act('drop');
  assert.equal(b.phase,1);assert.equal(b.pendingPhase,2);
  const firstHp=b.hp;
  fixture(g,true);g.act('drop');assert.ok(b.hp<firstHp,'damage continues during the reservation');
  assert.equal(b.phase,1);
  fixture(g);g.act('drop');assert.equal(b.phase,2);assert.equal(b.obscureRemaining,0);
  assert.deepEqual(g.drainEvents().filter(e=>e.type==='phaseChange').map(e=>e.phase),[2]);
  b.hp=b.maxHp*.35;b.remaining=1;g._reservePhase();
  fixture(g);g.act('drop');assert.equal(b.phase,3);
  assert.deepEqual(g.drainEvents().filter(e=>e.type==='phaseChange').map(e=>e.phase),[3]);
  fixture(g);b.remaining=1;g.act('drop');
  assert.equal(g.drainEvents().some(e=>e.type==='phaseChange'),false);
});
