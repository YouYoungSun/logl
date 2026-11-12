import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,UPGRADES} from '../src/core.mjs';

function fixture(g,lines=1,high=false){
  const s=g.state;s.board=Array.from({length:20},()=>Array(10).fill(null));s.tags=Array(20).fill(null);
  if(lines===1){s.board[19].fill('G');for(let x=3;x<7;x++)s.board[19][x]=null;s.active={type:'I',rotation:0,x:3,y:18};}
  else if(lines>1){for(let y=20-lines;y<20;y++){s.board[y].fill('G');s.board[y][4]=null;}s.active={type:'I',rotation:1,x:2,y:16};}
  else s.active={type:'O',rotation:0,x:3,y:18};
  if(high)s.board[8][9]='J';g._fall=0;g._lockTime=0;
}
function setup(upgrades={}){
  const g=new Game('momentum');Object.assign(g.state.upgrades,upgrades);g._beginStage();
  g.state.boss.hp=g.state.boss.maxHp=100000;g.state.boss.remaining=999;g.drainEvents();return g;
}

test('momentum counts clears, survives nonclears/time/combo breaks and advances through four tiers',()=>{
  const g=setup();
  for(let n=1;n<=15;n++){
    fixture(g,n%4+1);g.act('drop');
    assert.equal(g.state.momentum,n);assert.equal(g.state.momentumTier,n>=12?4:n>=8?3:n>=4?2:1);
    const events=g.drainEvents();assert.equal(events.filter(e=>e.type==='momentumUp').length,1);
    assert.equal(events.find(e=>e.type==='clear').momentum,n);
    fixture(g,0);g.act('drop');assert.equal(g.state.combo,0);assert.equal(g.state.momentum,n);
    const before=g.state.momentum;g.step(.1);assert.equal(g.state.momentum,before);
  }
  assert.equal(g.state.stats.maxMomentum,15);
});

test('momentum belongs to the whole attempt; stage transitions retain it and retries start at zero',()=>{
  const g=setup();fixture(g);g.act('drop');const points=g.state.momentum;
  g.state.boss.hp=1;fixture(g);g.act('drop');assert.equal(g.state.status,'reward');
  assert.equal(g.state.momentum,points+1);g.choose(0);assert.equal(g.state.momentum,points+1);
  g._die('test');assert.equal(g.state.momentum,0);assert.equal(g.state.momentumTier,0);
  assert.equal(g.state.stats.maxMomentum,points+1);
  const retry=new Game('retry',{startStage:8,mode:'assisted'});
  while(retry.state.status==='rebuild')retry.choose(0);
  assert.equal(retry.state.momentum,0);retry.beginPreparedRun();assert.equal(retry.state.momentum,0);
  assert.equal(new Game('fresh').state.momentum,0);
});

test('build success changes its identity without stacking momentum or increasing damage',()=>{
  for(const [upgrades,lines,high,expected]of [
    [{single:1},1,false,'1줄 집중'],[{middle:1},2,false,'다중 공격'],
    [{compress:1},4,false,'4줄 압축'],[{high:1},1,true,'고층 돌파'],
    [{low:1},1,false,'저층 안정'],[{landing:1},1,false,'착지 보조 빌드']]){
    const g=setup(upgrades);fixture(g,lines,high);g.act('drop');
    assert.equal(g.state.momentum,1);const event=g.drainEvents().find(e=>e.type==='clear');
    assert.ok(event.momentumReasons.includes(expected));
    if(upgrades.landing)assert.equal(event.style,'landing');
  }
  const a=setup({single:1,combo:1,low:1,opening:1}),b=setup({single:1,combo:1,low:1,opening:1});
  b.state.momentum=100;b.state.momentumTier=4;
  fixture(a);fixture(b);a.act('drop');b.act('drop');
  assert.equal(a.state.momentum,1);assert.equal(b.state.momentum,101);
  assert.equal(a.drainEvents().find(e=>e.type==='clear').damage,b.drainEvents().find(e=>e.type==='clear').damage);
  assert.deepEqual(a.state.board,b.state.board);assert.deepEqual(a.state.queue,b.state.queue);
});

test('charge release and real guard/repair successes are represented without duplicate awards',()=>{
  const charged=setup({charge:1});fixture(charged,0);charged.act('drop');assert.equal(charged.state.momentum,0);
  fixture(charged);charged.act('drop');assert.equal(charged.state.momentum,1);
  assert.equal(charged.drainEvents().find(e=>e.type==='clear').style,'charge');
  const defended=setup({guard:2,repair:1});defended.state.boss.remaining=1;
  fixture(defended,2);defended.state.tags[19]=1;defended.state.tags[18]=2;
  // A separate tagged row survives the two removed rows and is really repaired.
  defended.state.board[17][0]='G';defended.state.tags[17]=3;
  defended.act('drop');const events=defended.drainEvents();
  assert.ok(events.some(e=>e.type==='repair'));assert.ok(events.some(e=>e.type==='guard'));
  assert.equal(defended.state.momentum,1);assert.equal(events.filter(e=>e.type==='momentumUp').length,1);
  assert.equal(events.find(e=>e.type==='clear').style,'repair');
  assert.equal(events.find(e=>e.type==='momentumStyle').style,'guard');
  assert.equal(defended.state.momentumReason,'방해 행 차단');
});

test('waiting, landing and selecting preparation cards cannot farm momentum',()=>{
  const g=setup({landing:2,charge:3});
  for(let n=0;n<8;n++){fixture(g,0);g.act('drop');}
  assert.equal(g.state.momentum,0);assert.equal(g.state.charge,4);
  const prepared=new Game('cards',{startStage:9,mode:'assisted'});
  while(prepared.state.status==='rebuild'){prepared.rerollOffers();prepared.choose(0);}
  assert.equal(prepared.state.momentum,0);
  assert.equal(Object.keys(UPGRADES).length,12);
});
