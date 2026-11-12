import test from 'node:test';
import assert from 'node:assert/strict';
import {drawPcStage,drawPcAttack,getPcImpact} from '../src/pc-stage.mjs';
const desktop={width:1060,height:800,board:{x:100,y:48,cell:34,cols:10,rows:20},boss:{x:550,y:160,w:330,h:350}};
function context(){
  let depth=0;const calls=[],props=[];
  const ctx=new Proxy({save(){depth++;},restore(){assert.ok(--depth>=0);},createRadialGradient(...a){calls.push(['gradient',...a]);return {addColorStop(){}};}},
    {get:(o,k)=>k in o?o[k]:(...a)=>{for(const n of a)if(typeof n==='number')assert.ok(Number.isFinite(n),`${k}: ${n}`);calls.push([k,...a]);},
      set:(o,k,v)=>{if(typeof v==='number')assert.ok(Number.isFinite(v));if(k==='globalAlpha')assert.ok(v>=0&&v<=1);props.push([k,v]);o[k]=v;return true;}});
  return {ctx,calls,props,balanced:()=>assert.equal(depth,0),count:k=>calls.filter(c=>c[0]===k).length};
}
const state=(tier=4,momentum=12)=>({boss:{},momentumTier:tier,momentum});
const attack=(lines=4,momentum=12)=>({born:0,impacted:true,event:{lines,momentum,momentumTier:4,effectTier:4,combo:3,chargeUsed:2,style:'charge',rows:[{row:19}]},impactPoint:{x:715,y:335}});

test('PC arena evolves its large milestone silhouette, protects live cells/HUD and caches gradients',()=>{
  const counts=[];
  for(let tier=1;tier<=4;tier++){
    const r=context();drawPcStage(r.ctx,desktop,state(tier),{time:2,attacks:[],pcFeedback:{stageAt:1.8}});r.balanced();counts.push(r.count('lineTo'));
    assert.ok(r.calls.some(c=>c[0]==='rect'&&c[1]===100&&c[2]===48&&c[3]===340&&c[4]===680));
    assert.ok(r.calls.some(c=>c[0]==='rect'&&c[1]===540&&c[2]===30&&c[4]===115));
    assert.ok(r.calls.some(c=>c[0]==='clip'&&c[1]==='evenodd'));
    const before=r.count('gradient');drawPcStage(r.ctx,desktop,state(tier),{time:3,attacks:[]});assert.equal(r.count('gradient'),before);
  }
  assert.ok(counts[0]<counts[1]&&counts[1]<counts[2]&&counts[2]<counts[3]);
  const none=context();drawPcStage(none.ctx,{...desktop,portrait:true},state(),{time:2});assert.equal(none.calls.length,0);
});

test('danger and reduced effects preserve the arena shape while reducing its glow',()=>{
  const a=context(),b=context();
  drawPcStage(a.ctx,desktop,state(),{time:2,attacks:[],pcFeedback:{stageAt:1.8}});
  drawPcStage(b.ctx,desktop,state(),{time:2,attacks:[],pcFeedback:{stageAt:1.8}},{danger:true,reducedMotion:true});
  assert.equal(a.count('lineTo'),b.count('lineTo'));
  assert.ok(Math.max(...b.props.filter(([k])=>k==='globalAlpha').map(([,v])=>v))<.5);b.balanced();
});

test('large milestone architecture fades fully while the four small charge slots remain',()=>{
  const first=context(),fading=context(),idle=context();
  drawPcStage(first.ctx,desktop,state(),{time:.1,attacks:[],pcFeedback:{stageAt:0}});
  drawPcStage(fading.ctx,desktop,state(),{time:.8,attacks:[],pcFeedback:{stageAt:0}});
  drawPcStage(idle.ctx,desktop,state(),{time:2,attacks:[],pcFeedback:{stageAt:0}});
  const firstAlpha=r=>r.props.find(([k])=>k==='globalAlpha')[1];
  assert.ok(firstAlpha(fading)<firstAlpha(first));
  assert.equal(idle.count('gradient'),0);assert.equal(idle.count('fillRect'),0);
  assert.equal(idle.count('fill'),4,'only small charge slots remain after fade');
  first.balanced();fading.balanced();idle.balanced();
});

test('overdrive reassembles four capacitors and discharges on subsequent groups of four successes',()=>{
  const charging=context(),pulse=context();
  drawPcStage(charging.ctx,desktop,state(4,15),{time:.4,attacks:[],pcFeedback:{stageAt:0}});
  drawPcStage(pulse.ctx,desktop,state(4,16),{time:.4,attacks:[attack(4,16)],pcFeedback:{stageAt:0}});
  assert.ok(pulse.count('lineTo')>charging.count('lineTo'));pulse.balanced();
});

test('overdrive capacitor silhouettes stay above the boss and outside the badge and combo panels',()=>{
  for(const momentum of [12,13,14,15,16]){
    const r=context();drawPcStage(r.ctx,desktop,state(4,momentum),{time:2,attacks:[],pcFeedback:{stageAt:1.8}});
    const slots=r.calls.filter(c=>c[0]==='moveTo'&&c[2]===174&&c[1]>=580&&c[1]<=820);
    assert.deepEqual(slots.map(c=>c[1]),[585,653,721,789]);
    for(const c of slots)assert.ok(c[1]>546,'all capacitor edges clear the badge and combo corridor');
    assert.equal(r.calls.filter(c=>c[0]==='lineTo'&&c[2]===164&&[608,676,744,812].includes(c[1])).length,4);
    assert.equal(r.props.filter(([k,v])=>k==='fillStyle'&&v==='#ffc76b').length,5+(momentum-12)%4,'13/14/15 progressively light one/two/three slots; 16 discharges');
    r.balanced();
  }
});

test('removed rows extract from their actual heights through a separate protected corridor',()=>{
  const a=attack();a.event.rows=[{row:16},{row:17},{row:18},{row:19}];
  const before=JSON.stringify(a),r=context();drawPcAttack(r.ctx,desktop,state(),{time:.04,attacks:[a]});
  assert.ok(r.calls.some(c=>c[0]==='rect'&&c[1]===442&&c[2]===48&&c[3]===148&&c[4]===680));
  const starts=r.calls.filter(c=>c[0]==='moveTo'&&c[1]===443);
  assert.deepEqual(starts.map(c=>c[2]),[609,643,677,711]);
  assert.equal(r.count('quadraticCurveTo'),4);
  const end=context();drawPcAttack(end.ctx,desktop,state(),{time:.10,attacks:[a]});
  const strips=end.calls.filter(c=>c[0]==='fillRect'&&c[3]===18&&c[4]===8);
  assert.equal(strips.length,4);assert.ok(strips.every(c=>c[1]===571),'all removed rows gather at the visible launcher, outside the badge');
  const expired=context();drawPcAttack(expired.ctx,desktop,state(),{time:.14,attacks:[a]});assert.equal(expired.count('quadraticCurveTo'),0);
  assert.equal(JSON.stringify(a),before);r.balanced();end.balanced();expired.balanced();
});

test('PC attacks distinguish pierce, convergence and quad mass and leave a bounded residual fracture',()=>{
  const signatures=[];
  for(const lines of [1,2,3,4]){
    const r=context(),a=attack(lines),fx={time:.1,attacks:[a]};
    drawPcAttack(r.ctx,desktop,state(),fx);r.balanced();
    signatures.push([r.count('fillRect'),r.count('lineTo')].join(':'));
    fx.time=.7;const scar=context();drawPcAttack(scar.ctx,desktop,state(),fx);scar.balanced();assert.ok(scar.count('lineTo')>3);
    assert.ok(scar.calls.some(c=>c[0]==='rect'&&c[1]===452&&c[2]===150&&c[3]===438&&c[4]===410));
  }
  assert.equal(new Set(signatures).size,4);
  const many=context();drawPcAttack(many.ctx,desktop,state(),{time:.4,attacks:Array.from({length:600},()=>attack())});
  const six=context();drawPcAttack(six.ctx,desktop,state(),{time:.4,attacks:Array.from({length:6},()=>attack())});
  assert.equal(many.calls.length,six.calls.length);many.balanced();
});

test('hit pose anticipates impact, holds briefly, then settles independently from rules',()=>{
  const a=attack(),fx={time:.15,attacks:[a]},before=JSON.stringify(a);
  assert.ok(getPcImpact(fx).compression>0);assert.equal(getPcImpact(fx).split,0);
  fx.time=.19;const hit=getPcImpact(fx);assert.ok(hit.split>.8&&hit.scar>.8);
  fx.time=.22;assert.equal(getPcImpact(fx).split,hit.split,'first 65ms holds the impact pose');
  fx.time=.7;assert.ok(getPcImpact(fx).scar>getPcImpact(fx).split);
  fx.time=1;assert.equal(getPcImpact(fx).split,0);assert.equal(getPcImpact(fx).scar,0);
  assert.equal(JSON.stringify(a),before);
});
