import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, cells, STAGES, UPGRADES } from '../src/core.mjs';

const blank = () => Array.from({length:20},()=>Array(10).fill(null));
function clearFixture(game, n=1) {
  game.state.board=blank();game.state.tags=Array(20).fill(null);
  if(n===1) {
    game.state.board[19].fill('G');
    for(let x=3;x<7;x++)game.state.board[19][x]=null;
    game.state.active={type:'I',rotation:0,x:3,y:18};
  } else {
    for(let y=20-n;y<20;y++) {
      game.state.board[y].fill('G');game.state.board[y][4]=null;
    }
    game.state.active={type:'I',rotation:1,x:2,y:16};
  }
  game._fall=0;game._lockTime=0;
}
function nonclearFixture(game) {
  game.state.board=blank();game.state.tags=Array(20).fill(null);
  game.state.active={type:'O',rotation:0,x:3,y:18};
}

test('piece stream is reproducible, complete seven-bags and independent of rewards/garbage',()=>{
  for(const seed of ['a','b','0123456789']) {
    const a=new Game(seed),b=new Game(seed);
    const bag=[a.state.active.type,...a.state.queue.slice(0,6)];
    assert.equal(new Set(bag).size,7);
    a._makeOffers();a._newHole();a._newHole();
    const nextA=Array.from({length:35},()=>a._take());
    const nextB=Array.from({length:35},()=>b._take());
    assert.deepEqual(nextA,nextB);
    for(let k=6;k+7<=nextA.length;k+=7)assert.equal(new Set(nextA.slice(k,k+7)).size,7);
    assert.ok(a.state.queue.length>=5);
  }
});

test('hold never advances a combat turn and is unavailable twice before locking',()=>{
  const g=new Game('hold'),s=g.state,first=s.active.type;
  assert.equal(g.act('hold'),true);
  assert.equal(s.held,first);assert.equal(s.stats.locks,0);assert.equal(s.boss.remaining,9);
  assert.equal(g.act('hold'),false);
  assert.equal(g.act('drop'),true);
  assert.equal(s.stats.locks,1);assert.equal(s.canHold,true);
  assert.equal(g.act('hold'),true);assert.equal(s.active.type,first);
});

test('I-piece SRS can rotate out of its left wall overhang',()=>{
  const g=new Game('srs');
  g.state.active={type:'I',rotation:1,x:-2,y:5};
  assert.equal(g._collides(g.state.active),false);
  assert.equal(g.act('ccw'),true);
  assert.equal(g.state.active.rotation,0);assert.equal(g.state.active.x,0);
  assert.ok(cells(g.state.active).every(([x])=>x>=0&&x<10));
});

test('ghost and hard drop agree, and lock delay has a finite reset budget',()=>{
  const g=new Game('ghost');
  const expected=cells({...g.state.active,y:g.ghostY()});
  g.act('drop');
  for(const [x,y] of expected)assert.notEqual(g.state.board[y][x],null);
  nonclearFixture(g);
  g.step(.2);
  for(let i=0;i<16;i++)assert.equal(g.act(i%2?'right':'left'),true);
  assert.equal(g._lockResets,15);
  g.step(.3);assert.equal(g.state.stats.locks,1);
  g.act('right'); // Budget exhausted: the next successful move must not reset elapsed time.
  g.step(.21);assert.equal(g.state.stats.locks,2);
});

test('real four-line removal preserves original row snapshots and applies damage immediately',()=>{
  const g=new Game('quad');g.state.boss.hp=1000;g.state.boss.maxHp=1000;
  clearFixture(g,4);g.act('drop');
  const e=g.drainEvents().find(e=>e.type==='clear');
  assert.equal(e.lines,4);assert.deepEqual(e.rows.map(r=>r.row),[16,17,18,19]);
  assert.ok(e.rows.every(r=>r.colors.length===10&&r.colors[4]==='I'));
  assert.equal(e.damage,64);assert.equal(g.state.boss.hp,936);
  assert.equal(g.state.stats.lines,4);assert.ok(g.state.board.every(r=>r.every(v=>v===null)));
});

test('repair deletes only the lowest tagged row after compression and does not inflate damage/lines',()=>{
  const g=new Game('repair');g.state.upgrades.repair=2;g.state.repairLeft=1;
  clearFixture(g,2);
  g.state.board[17][0]='G';g.state.tags[17]=91;
  g.state.board[15][0]='G';g.state.tags[15]=90;
  g.act('drop');
  const events=g.drainEvents(),repair=events.find(e=>e.type==='repair'),clear=events.find(e=>e.type==='clear');
  assert.equal(repair.row,19);assert.equal(g.state.repairLeft,0);
  assert.equal(g.state.tags.includes(91),false);assert.equal(g.state.tags.includes(90),true);
  assert.equal(clear.lines,2);assert.equal(clear.damage,24);assert.equal(g.state.stats.lines,2);
  assert.deepEqual(clear.rows.map(r=>r.row),[18,19]);
  clearFixture(g,2);g.state.tags[10]=92;g.state.board[10][0]='G';g.act('drop');
  assert.equal(g.state.repairLeft,0,'recharging prevents a second proc');
});

test('above-top blocks may be rescued by a clear, but lockout is resolved before lethal damage',()=>{
  const rescued=new Game('rescue');
  rescued.state.active={type:'I',rotation:1,x:-2,y:-1};
  rescued.state.board[2].fill('G');rescued.state.board[2][0]=null;
  rescued._lock();
  assert.equal(rescued.state.status,'playing');assert.equal(rescued.state.stats.lines,1);
  const dead=new Game('lockout');dead.state.boss.hp=1;
  dead.state.active={type:'I',rotation:1,x:2,y:-2};
  dead.state.board[1].fill('G');dead.state.board[1][4]=null;
  dead._lock();
  assert.equal(dead.state.status,'dead');assert.equal(dead.state.boss.hp,1);
  assert.equal(dead.drainEvents().some(e=>e.type==='clear'),false);
});

test('grace is spent once per entire chain while non-clear charge remains independent',()=>{
  const g=new Game('chain');g.state.boss.hp=9999;
  Object.assign(g.state.upgrades,{grace:1,charge:1});
  for(let i=0;i<2;i++){clearFixture(g);g.act('drop');}
  assert.equal(g.state.combo,2);
  nonclearFixture(g);g.act('drop');assert.equal(g.state.combo,2);assert.equal(g.state.charge,1);
  clearFixture(g);g.act('drop');assert.equal(g.state.combo,3);assert.equal(g.state.charge,0);
  nonclearFixture(g);g.act('drop');assert.equal(g.state.combo,0);assert.equal(g.state.charge,1);
  nonclearFixture(g);g.act('drop');assert.equal(g.state.charge,2);
});

test('response uses the pre-lock remaining count and cancels the final telegraphed row',()=>{
  const g=new Game('response');g.state.stage=3;g._beginStage();
  g.state.boss.remaining=3;g._refreshBoss();
  const announced=g.state.boss.holes.slice();assert.equal(announced.length,2);
  clearFixture(g,2);g.act('drop');
  assert.equal(g.state.boss.responseLines,2);assert.equal(g.state.boss.remaining,2);
  assert.deepEqual(g.state.boss.holes,announced.slice(0,1));
});

test('armor uses the same pre-lock count as response, and damage rounds only once',()=>{
  const g=new Game('armor');g.state.stage=9;g._beginStage();
  Object.assign(g.state.upgrades,{single:1,opening:1});
  g.state.burdens.dampen=1;g.state.boss.remaining=3;
  clearFixture(g);g.act('drop');
  const e=g.drainEvents().find(e=>e.type==='clear');
  assert.equal(e.damage,Math.floor((10*1.4+6+STAGES[8].hp*.01)*1.35*.96+.5));
  assert.equal(g.state.boss.responseLines,1);
});

test('erosion is not an attack; regeneration only occurs on the real attack and respects reserved phase',()=>{
  const g=new Game('regen');g.state.burdens.regen=3;g.state.burdens.erosion=1;g._beginStage();
  g.state.boss.hp=50;nonclearFixture(g);g.act('drop');
  let es=g.drainEvents();assert.equal(g.state.boss.hp,50);
  assert.equal(es.filter(e=>e.type==='erosion').length,1);assert.equal(es.some(e=>e.type==='bossAttack'),false);
  g.state.boss.remaining=1;nonclearFixture(g);g.act('drop');
  assert.equal(g.state.boss.hp,52);assert.equal(g.drainEvents().find(e=>e.type==='bossAttack').regen,2);
  g.state.stage=10;g._beginStage();g.state.boss.hp=1118;g.state.boss.pendingPhase=2;g.state.boss.remaining=1;
  nonclearFixture(g);g.act('drop');assert.equal(g.state.boss.hp,1120);assert.equal(g.state.boss.phase,2);
});

test('final phases are reserved immediately but activate only after the announced attack',()=>{
  const g=new Game('phase');g.state.stage=10;g._beginStage();
  g.state.boss.hp=1150;g.state.upgrades.charge=1;g.state.repairLeft=2;
  clearFixture(g,4);g.act('drop');
  assert.equal(g.state.boss.pendingPhase,2);assert.equal(g.state.boss.phase,1);
  assert.equal(g.state.boss.remaining,7);assert.equal(g.state.repairLeft,2);
  g.state.boss.remaining=1;nonclearFixture(g);g.act('drop');
  assert.equal(g.state.boss.phase,2);assert.equal(g.state.boss.K,8);assert.equal(g.state.charge,1);
  assert.equal(g.state.boss.stageLocks,2);assert.equal(g.state.boss.stagger,false);
  g.state.boss.hp=570;clearFixture(g,4);g.act('drop');
  assert.equal(g.state.boss.pendingPhase,3);assert.equal(g.state.boss.phase,2);
  g.state.boss.remaining=1;nonclearFixture(g);g.act('drop');
  assert.equal(g.state.boss.phase,3);assert.equal(g.state.boss.K,7);assert.equal(g.state.boss.armor,true);
});

test('nine reward decisions accumulate both ranks; stage ten has no reward and death cannot resume',()=>{
  const g=new Game('progress');g.state.held='T';
  assert.equal(Object.values(g.state.upgrades).reduce((a,b)=>a+b,0),0);
  for(let stage=1;stage<=9;stage++) {
    assert.equal(g.state.stage,stage);g._victory();
    assert.equal(g.state.status,'reward');assert.equal(g.state.stage,stage);
    assert.equal(g.state.offers.length,3);
    assert.equal(new Set(g.state.offers.map(o=>o.upgrade)).size,3);
    assert.equal(new Set(g.state.offers.map(o=>o.burden)).size,3);
    assert.equal(g.choose(0),true);assert.equal(g.state.held,null);
  }
  assert.equal(g.state.stage,10);assert.equal(g.state.history.length,9);
  assert.equal(Object.values(g.state.upgrades).reduce((a,b)=>a+b,0),9);
  assert.equal(Object.values(g.state.burdens).reduce((a,b)=>a+b,0),9);
  for(const [key,n]of Object.entries(g.state.upgrades))assert.ok(n<=UPGRADES[key].max);
  g.state.boss.hp=1;clearFixture(g);g.act('drop');
  assert.equal(g.state.status,'won');assert.deepEqual(g.state.offers,[]);assert.equal(g.choose(0),false);
  const dead=new Game('dead');dead._die('test');const before=JSON.stringify(dead.state);
  assert.equal(dead.act('drop'),false);dead.step(10);assert.equal(JSON.stringify(dead.state),before);
});

test('next sector starts with an empty board, fresh hold and independent seven-bag while preserving the run build',()=>{
  const g=new Game('fresh-sector'),s=g.state;
  s.board[19][0]='G';s.tags[19]=777;s.held='I';s.combo=5;s.charge=4;
  s.stats.locks=28;s.stats.lines=9;s.stats.seconds=60;s.stats.damage=150;
  s.upgrades.repair=1;s.burdens.erosion=1;
  g._victory();const offered=s.offers[0];g.choose(0);
  assert.equal(s.stage,2);assert.equal(s.status,'playing');
  assert.ok(s.board.every(row=>row.every(c=>c===null)));
  assert.ok(s.tags.every(t=>t===null));assert.equal(s.held,null);assert.equal(s.canHold,true);
  assert.equal(s.combo,0);assert.equal(s.charge,0);assert.equal(s.repairLeft,s.upgrades.repair?1:0);
  assert.equal(s.boss.stageLocks,0);assert.equal(s.boss.attackIndex,0);
  assert.equal(s.boss.erosionRemaining,s.burdens.erosion);
  assert.equal(s.stats.locks,28);assert.equal(s.stats.lines,9);assert.equal(s.stats.seconds,60);assert.equal(s.stats.damage,150);
  assert.equal(s.upgrades[offered.upgrade],offered.upgrade==='repair'?2:1);
  assert.equal(s.burdens[offered.burden],offered.burden==='erosion'?2:1);
  assert.equal(s.history.length,1);
  assert.equal(new Set([s.active.type,...s.queue.slice(0,6)]).size,7);
  const other=new Game('fresh-sector');for(let i=0;i<31;i++)other._take();
  other.state.stage=2;other._beginStage();
  assert.deepEqual([s.active.type,...s.queue],[other.state.active.type,...other.state.queue]);
});

test('kill skips pending erosion/attack and event sequence is monotonic',()=>{
  const g=new Game('kill');g.state.burdens.erosion=3;g.state.boss.hp=1;g.state.boss.remaining=1;
  clearFixture(g);g.act('drop');const es=g.drainEvents();
  assert.equal(g.state.status,'reward');assert.ok(es.every((e,i)=>e.seq===i+1&&e.bossId===1));
  assert.equal(es.some(e=>e.type==='erosion'||e.type==='bossAttack'),false);
  assert.equal(g.state.stats.damage,1);assert.equal(es.find(e=>e.type==='clear').damage,10);
});

test('long-combat escalation is included in the upcoming attack preview',()=>{
  const g=new Game('overload');g.state.boss.stageLocks=STAGES[0].T-9;g._planCycle();
  assert.equal(g.state.boss.holes.length,2);
  g.state.boss.stageLocks=STAGES[0].T+24-9;g._planCycle();
  assert.equal(g.state.boss.holes.length,3);
});

test('effects consumption cannot affect deterministic game state or event contents',()=>{
  const a=new Game('replay'),b=new Game('replay'),all=[];
  for(let i=0;i<80;i++) {
    const action=['left','cw','right','drop'][i%4];
    assert.equal(a.act(action),b.act(action));
    a.step(1/120,i%3===0);b.step(1/120,i%3===0);
    all.push(...a.drainEvents());
  }
  assert.deepEqual(a.state,b.state);assert.deepEqual(all,b.drainEvents());
});

test('death context retains the failed spawn, above-ceiling blocks and cells pushed off the top',()=>{
  const spawn=new Game('death-spawn');spawn.state.board[0][4]='G';spawn._spawn('O');
  assert.equal(spawn.state.status,'dead');assert.equal(spawn.state.death.kind,'spawn');
  assert.ok(spawn.state.death.cells.some(([x,y])=>x===4&&y===0));
  const pushed=new Game('death-push');pushed.state.board[0][2]='T';pushed._insertRows([4]);
  assert.equal(pushed.state.death.kind,'garbage');assert.deepEqual(pushed.state.death.cells,[[2,0]]);
  assert.equal(pushed.state.board[19][4],null);assert.equal(pushed.state.board[19][0],'G');
  const locked=new Game('death-lock');locked.state.active={type:'I',rotation:1,x:2,y:-2};
  locked.state.board[1].fill('G');locked.state.board[1][4]=null;locked._lock();
  assert.equal(locked.state.death.kind,'lockout');assert.ok(locked.state.death.cells.every(([,y])=>y<0));
});
