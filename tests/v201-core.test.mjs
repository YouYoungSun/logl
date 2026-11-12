import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,UPGRADES,BURDENS,RULES_VERSION} from '../src/core.mjs';

function fixture(g,lines=0){
  const s=g.state;
  s.board=Array.from({length:20},()=>Array(10).fill(null));s.tags=Array(20).fill(null);
  if(lines===1){
    s.board[19].fill('G');for(let x=3;x<7;x++)s.board[19][x]=null;
    s.active={type:'I',rotation:0,x:3,y:18};
  }else if(lines>1){
    for(let y=20-lines;y<20;y++){s.board[y].fill('G');s.board[y][4]=null;}
    s.active={type:'I',rotation:1,x:2,y:16};
  }else s.active={type:'O',rotation:0,x:3,y:18};
  g._fall=0;g._lockTime=0;
}
function prepared(stage=1,upgrades={},burdens={}){
  const g=new Game('v201');g.state.stage=stage;
  Object.assign(g.state.upgrades,upgrades);Object.assign(g.state.burdens,burdens);
  g._beginStage();g.drainEvents();return g;
}

test('v2.0.1 replaces two attack variants with defense/control and honors per-definition burden limits',()=>{
  assert.equal(RULES_VERSION,'2.0.2');assert.equal(Object.keys(UPGRADES).length,12);
  assert.equal('repeat' in UPGRADES,false);assert.equal('convert' in UPGRADES,false);
  assert.equal(UPGRADES.guard.category,'defense');assert.equal(UPGRADES.landing.category,'control');
  assert.equal(BURDENS.reinforcement.max,1);
  const g=prepared();g._victory();g.state.offers=[{upgrade:'single',burden:'reinforcement'}];
  assert.equal(g.choose(0),true);assert.equal(g.state.burdens.reinforcement,1);
  g._victory();assert.ok(g.state.offers.every(o=>o.burden!=='reinforcement'));
  g.state.offers=[{upgrade:'single',burden:'reinforcement'}];assert.equal(g.choose(0),false);
});

test('every offer set has attack and non-attack choices when available without altering piece/garbage streams',()=>{
  const g=prepared(),other=prepared();
  for(let n=0;n<60;n++){
    const offers=g._makeOffers(),categories=offers.map(o=>UPGRADES[o.upgrade].category);
    assert.ok(categories.includes('attack'));assert.ok(categories.some(c=>c!=='attack'));
    assert.equal(new Set(offers.map(o=>o.upgrade)).size,3);
    assert.equal(new Set(offers.map(o=>o.burden)).size,3);
  }
  assert.equal(g._take(),other._take());assert.equal(g._newHole(),other._newHole());
  for(const [id,def]of Object.entries(UPGRADES))if(def.category!=='attack')g.state.upgrades[id]=def.max;
  assert.ok(g._makeOffers().every(o=>UPGRADES[o.upgrade].category==='attack'));
  for(const [id,def]of Object.entries(UPGRADES))g.state.upgrades[id]=def.category==='attack'?def.max:0;
  assert.ok(g._makeOffers().every(o=>UPGRADES[o.upgrade].category!=='attack'));
});

test('guard blocks the last announced row after response, spends one charge and preserves regeneration/phase progression',()=>{
  const g=prepared(10,{guard:2},{regen:1}),s=g.state,b=s.boss;
  b.phase=2;b.pendingPhase=3;b.hp=500;g._planCycle();b.remaining=1;g._refreshBoss();
  assert.equal(b.guardReady,true);assert.equal(b.holes.length,2);
  fixture(g,2);g.act('drop');const events=g.drainEvents();
  assert.equal(events.find(e=>e.type==='guard').rows,1);
  const attack=events.find(e=>e.type==='bossAttack');
  assert.deepEqual(attack.holes,[]);assert.equal(attack.regen,8);
  assert.equal(s.guardLeft,1);assert.equal(b.attackIndex,1);assert.equal(b.phase,3);
  assert.ok(events.some(e=>e.type==='phaseChange'&&e.phase===3));
  assert.equal(s.board.flat().filter(c=>c==='G').length,0);
});

test('guard only triggers for two-plus clears on the attacking lock and never cancels erosion',()=>{
  for(const [remaining,lines]of [[2,2],[1,1],[1,0]]){
    const g=prepared(3,{guard:1});g.state.boss.remaining=remaining;
    fixture(g,lines);g.act('drop');assert.equal(g.state.guardLeft,1);
    assert.equal(g.drainEvents().some(e=>e.type==='guard'),false);
  }
  const g=prepared(1,{guard:1},{erosion:1});g.state.boss.remaining=1;
  fixture(g,2);g.act('drop');const events=g.drainEvents();
  assert.ok(events.some(e=>e.type==='erosion'));assert.ok(events.some(e=>e.type==='guard'));
  assert.deepEqual(events.find(e=>e.type==='bossAttack').holes,[]);
  assert.equal(g.state.board.flat().filter(c=>c==='G').length,9);
});

test('lethal clears skip guard costs and the pending attack, while a new stage replenishes guard uses',()=>{
  const g=prepared(1,{guard:2},{erosion:1,reinforcement:1});
  g.state.boss.remaining=1;g.state.boss.hp=1;fixture(g,2);g.act('drop');
  const events=g.drainEvents();assert.equal(g.state.status,'reward');assert.equal(g.state.guardLeft,2);
  assert.equal(events.some(e=>['guard','bossAttack','erosion'].includes(e.type)),false);
  g.state.guardLeft=0;g.choose(0);assert.equal(g.state.guardLeft,g.state.upgrades.guard);
});

test('reinforcement forecasts every third attack as an aligned extra row and combines with overload/response/guard',()=>{
  const g=prepared(3,{guard:1},{reinforcement:1}),b=g.state.boss;
  for(let number=1;number<=9;number++){
    b.attackIndex=number-1;b.stageLocks=0;g._planCycle();
    assert.equal(b.reinforcement,number%3===0);assert.equal(b.reinforcementEvery,3);
    assert.equal(b.holes.length,number%3===0?3:2);assert.equal(new Set(b.holes).size,1);
  }
  b.attackIndex=2;b.stageLocks=100;g._planCycle();b.remaining=1;g._refreshBoss();
  assert.equal(b.holes.length,5);fixture(g,2);g.act('drop');
  const attack=g.drainEvents().find(e=>e.type==='bossAttack');
  assert.equal(attack.holes.length,3);assert.equal(new Set(attack.holes).size,1);
  assert.equal(attack.reinforcement,true);assert.equal(b.attackIndex,3);
  g.state.stage=4;g._beginStage();assert.equal(g.state.boss.attackIndex,0);
  assert.equal(g.state.boss.reinforcement,false);
});

test('landing assistance and rigidity combine only in lock delay, preserving gravity and instant drop',()=>{
  const g=prepared(1,{landing:2},{rigidity:3});fixture(g);
  assert.equal(g.state.lockDelayMs,545);g.step(.544);assert.equal(g.state.stats.locks,0);
  g.step(.001);assert.equal(g.state.stats.locks,1);
  const a=prepared(1,{landing:2}),b=prepared(1);
  a.step(.25);b.step(.25);assert.equal(a.state.active.y,b.state.active.y);
  assert.equal(a._fall,b._fall);a.act('drop');assert.equal(a.state.stats.locks,1);
  assert.equal(a.state.lockDelayMs,650);
});

test('combo protection and actual termination have distinct one-shot events without stage/reset/death failures',()=>{
  const g=prepared(1,{grace:1}),s=g.state;
  fixture(g,1);g.act('drop');g.drainEvents();
  fixture(g);g.act('drop');let events=g.drainEvents();
  assert.equal(events.filter(e=>e.type==='comboProtected').length,1);
  assert.equal(events.find(e=>e.type==='comboProtected').combo,1);assert.equal(s.combo,1);
  assert.equal(events.some(e=>e.type==='comboEnded'),false);
  fixture(g,1);g.act('drop');g.drainEvents();assert.equal(s.combo,2);
  fixture(g);g.act('drop');events=g.drainEvents();
  assert.deepEqual(events.filter(e=>e.type==='comboEnded').map(e=>e.combo),[2]);assert.equal(s.combo,0);
  fixture(g);g.act('drop');assert.equal(g.drainEvents().some(e=>e.type==='comboEnded'),false);
  s.combo=5;g._die('test death');assert.equal(g.drainEvents().some(e=>e.type==='comboEnded'),false);
  s.status='playing';g._beginStage();assert.equal(g.drainEvents().some(e=>e.type==='comboEnded'),false);
  g.state.boss.hp=1;fixture(g,1);g.act('drop');
  assert.equal(g.drainEvents().some(e=>e.type==='comboEnded'),false);
});
