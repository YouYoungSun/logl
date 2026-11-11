/** Deterministic, renderer-independent rules for FAULTLINE. */
export const WIDTH = 10;
export const HEIGHT = 20;
export const RULES_VERSION = '0.1.1';

const round = n => Math.floor(n + 0.5);
const emptyRow = () => Array(WIDTH).fill(null);
const rankMap = defs => Object.fromEntries(Object.keys(defs).map(k => [k, 0]));

export const UPGRADES = {
  single: { label: '단일 집중', max: 3, trigger:'1줄 제거', description:r=>`한 번에 1줄을 지울 때 줄 제거 피해 +${40*r}%.`, example:r=>`다른 효과가 없다면 1줄 피해 10이 ${Math.floor(10*(1+.4*r)+.5)}으로 증가합니다.` },
  middle: { label: '중간 정리', max: 3, trigger:'2~3줄 동시 제거', description:r=>`한 번에 2줄 또는 3줄을 지울 때 줄 제거 피해 +${20*r}%.`, example:r=>`다른 효과가 없다면 2줄 피해 24가 ${Math.floor(24*(1+.2*r)+.5)}으로 증가합니다. 1줄과 4줄에는 적용되지 않습니다.` },
  compress: { label: '압축 타격', max: 3, trigger:'4줄 동시 제거', description:r=>`한 번에 4줄을 지울 때 줄 제거 피해 +${35*r}%.`, example:r=>`다른 효과가 없다면 4줄 피해 64가 ${Math.floor(64*(1+.35*r)+.5)}로 증가합니다.` },
  repeat: { label: '연속 압축', max: 3, trigger:'지난 제거도 4줄', description:r=>`마지막으로 지운 줄이 4줄이었다면, 이번 4줄 제거 피해 +${25*r}%.`, example:()=>`4줄 제거 → 줄을 못 지움 → 4줄 제거: 적용됩니다. 4줄 제거 → 1줄 제거 → 4줄 제거: 적용되지 않습니다.` },
  combo: { label: '연쇄 증폭', max: 3, trigger:'블록을 놓을 때마다 연속 제거', description:r=>`연쇄 피해 보너스가 단계당 15%에서 ${15+4*r}%로 증가합니다. 6연쇄부터는 더 늘지 않습니다.`, example:r=>`다른 효과가 없다면 1/2/3연쇄의 줄 제거 피해 배율은 100/${115+4*r}/${130+8*r}%입니다. 줄을 못 지우면 연쇄가 끝납니다.` },
  grace: { label: '연쇄 유예', max: 1, trigger:'한 연쇄에 실수 1회 허용', description:()=>`한 연쇄에서 줄을 못 지우는 블록을 딱 한 번 허용합니다.`, example:()=>`제거 → 실패 → 제거 → 실패: 마지막 실패에서 연쇄가 끝납니다. 중간에 줄을 지워도 허용 횟수는 회복되지 않습니다.` },
  charge: { label: '비제거 충전', max: 3, trigger:'못 지우면 저장, 지우면 사용', description:r=>`줄을 못 지우면 전하 1개 저장. 다음 줄 제거에 모두 써서 전하당 피해 +${3+r}. 최대 4개 저장.`, example:r=>`전하 3개를 모은 뒤 줄을 지우면 피해 +${3*(3+r)}를 더하고 전하는 0개가 됩니다. 추가 피해에도 보스 방어와 감쇠가 적용됩니다.` },
  convert: { label: '전환', max: 3, trigger:'3연쇄 이상이 끊겼을 때', description:r=>`3연쇄 이상에서 줄을 못 지워 연쇄가 끝나면 전하를 얻습니다. 3연쇄 종료 시 ${r}개, 4연쇄 종료 시 ${Math.min(4,r+1)}개.`, example:r=>`획득량은 연쇄 수를 2로 나눈 몫 + ${r-1}이며 최대 4개입니다. 연쇄 유예로 이어진 경우에는 아직 발동하지 않습니다. 다른 충전 효과와 함께 적용될 수 있습니다.` },
  high: { label: '고도', max: 3, trigger:'지우기 전 높이 12칸 이상', description:r=>`줄이 지워지기 직전, 쌓인 최고 높이가 12칸 이상이면 줄 제거 피해 +${35*r}%.`, example:()=>`높이는 바닥부터 가장 높은 블록까지 셉니다. 이번에 놓은 블록도 포함합니다. 지운 뒤 높이가 낮아져도 이번 공격에는 적용됩니다.` },
  low: { label: '저상', max: 3, trigger:'지우기 전 높이 6칸 이하', description:r=>`줄이 지워지기 직전, 쌓인 최고 높이가 6칸 이하면 줄 제거 피해 +${15*r}%.`, example:()=>`이번 블록을 놓은 뒤 최고 높이가 6칸이면 적용, 7칸이면 미적용입니다. 줄을 지운 뒤의 높이를 기준으로 삼지 않습니다.` },
  opening: { label: '개시', max: 3, trigger:'전투 첫 두 번의 줄 제거', description:r=>`각 전투의 첫 두 번 줄 제거에 추가 피해 +${6*r}. 보스 방어와 감쇠가 적용됩니다.`, example:r=>`블록을 여러 개 놓았어도 아직 줄을 못 지웠다면 횟수는 남습니다. 첫 제거와 두 번째 제거에 각각 +${6*r}, 세 번째부터는 추가하지 않습니다.` },
  repair: { label: '수복', max: 3, trigger:'2~3줄 동시 제거 + 회색 행 존재', description:r=>`2줄 또는 3줄을 동시에 지우면, 가장 아래의 회색 방해 행을 1개 더 없앱니다. 전투당 ${r}회, 재사용까지 블록 6개.`, example:()=>`추가로 없앤 회색 행에는 공격 피해나 연쇄가 붙지 않습니다. 지울 방해 행이 없으면 사용 횟수를 소비하지 않습니다.` }
};

export const BURDENS = {
  vitality: { label:'증식',max:3,description:r=>`이후 보스의 최대 체력이 기본보다 ${8*r}% 증가합니다.`,example:r=>`기본 체력 1000인 보스가 ${1000+80*r}으로 시작합니다.` },
  dampen: { label:'감쇠',max:3,description:r=>`내가 보스에게 주는 모든 피해가 ${4*r}% 감소합니다.`,example:r=>`다른 계산을 마친 피해가 100이라면 최종 피해는 ${100-4*r}입니다.` },
  haste: { label:'조급',max:3,description:r=>`보스가 공격하기까지 놓을 수 있는 블록이 ${r}개 줄어듭니다. 낙하 속도는 그대로입니다.`,example:r=>`원래 블록 9개마다 공격했다면 ${9-r}개마다 공격합니다. 방어 보스의 노출 기회도 달라집니다.` },
  erosion: { label:'침식',max:3,description:r=>`각 전투에서 처음 놓는 블록 ${r}개에 각각 회색 방해 행 1개가 추가됩니다.`,example:r=>`전투 시작 후 처음 ${r}개를 놓는 동안 총 ${r}행이 올라옵니다. 일반 보스 공격과 별도로 적용됩니다.` },
  regen: { label:'재생',max:3,description:r=>`보스가 공격할 때마다 자신의 최대 체력의 ${.5*r}%를 회복합니다.`,example:r=>`최대 체력 1000인 보스는 한 번 공격할 때 ${5*r}을 회복합니다. 침식으로 행이 올라올 때에는 회복하지 않습니다.` },
  rigidity: { label:'경직',max:3,description:r=>`착지한 블록이 자동으로 굳기까지의 시간이 500ms에서 ${500-35*r}ms로 줄어듭니다.`,example:()=>`바닥에서 옆으로 밀거나 회전시킬 시간이 줄어듭니다. 즉시 낙하의 동작은 그대로입니다.` }
};

export const STAGES = [
  { name: '접촉', hp:150, gravity:1, K:9, rows:1, response:false, armor:false, stagger:false, T:60 },
  { name: '변위', hp:210, gravity:1.25, K:9, rows:1, response:false, armor:false, stagger:false, T:60 },
  { name: '간섭', hp:280, gravity:1.5, K:9, rows:2, response:true, armor:false, stagger:false, T:60 },
  { name: '차폐', hp:360, gravity:2, K:8, rows:1, response:false, armor:true, stagger:false, T:64 },
  { name: '단층', hp:460, gravity:2.5, K:9, rows:2, response:false, armor:false, stagger:true, T:64 },
  { name: '압력', hp:580, gravity:3, K:8, rows:2, response:true, armor:false, stagger:false, T:64 },
  { name: '위상', hp:720, gravity:4, K:8, rows:2, response:false, armor:true, stagger:false, T:72 },
  { name: '균열', hp:880, gravity:5, K:8, rows:2, response:true, armor:false, stagger:true, T:72 },
  { name: '임계', hp:1080, gravity:6, K:8, rows:2, response:true, armor:true, stagger:true, T:72 },
  { name: '특이점', hp:1600, gravity:8, K:8, rows:2, response:false, armor:false, stagger:false, T:96 }
];

const BASE = {
  J: [[0,0],[0,1],[1,1],[2,1]],
  L: [[2,0],[0,1],[1,1],[2,1]],
  S: [[1,0],[2,0],[0,1],[1,1]],
  Z: [[0,0],[1,0],[1,1],[2,1]],
  T: [[1,0],[0,1],[1,1],[2,1]]
};
const rotateShape = points => points.map(([x,y]) => [2-y,x]);
export const SHAPES = {
  I: [
    [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]
  ],
  O: Array.from({length:4},()=>[[1,0],[2,0],[1,1],[2,1]])
};
for (const [type, points] of Object.entries(BASE)) {
  SHAPES[type] = [points];
  for (let i=1;i<4;i++) SHAPES[type].push(rotateShape(SHAPES[type][i-1]));
}
export function cells(piece) {
  if (!piece) return [];
  return SHAPES[piece.type][piece.rotation].map(([x,y])=>[x+piece.x,y+piece.y]);
}

// Standard SRS kick tables; Y below is positive upward and is inverted at use.
const KICKS = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};
const I_KICKS = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};

function hash(text) {
  let h=2166136261;
  for (let i=0;i<text.length;i++) { h^=text.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function rng(seed) {
  let a=hash(String(seed));
  return () => {
    a=(a+0x6D2B79F5)|0;
    let t=Math.imul(a^(a>>>15),1|a);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
function shuffle(values, random) {
  const a=values.slice();
  for (let i=a.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

export class Game {
  constructor(seed='LOG-LIKE') {
    this.seed=String(seed);
    this._pieces=rng(this.seed+':pieces');
    this._rewards=rng(this.seed+':rewards');
    this._garbage=rng(this.seed+':garbage');
    this._events=[]; this._seq=0; this._rowId=0;
    this.state={
      status:'playing', stage:1, board:Array.from({length:HEIGHT},emptyRow),
      tags:Array(HEIGHT).fill(null), active:null, queue:[], held:null, canHold:true,
      upgrades:rankMap(UPGRADES), burdens:rankMap(BURDENS), offers:[],
      stats:{locks:0,lines:0,damage:0,seconds:0,cleared:0,maxCombo:0},
      combo:0,charge:0,repairLeft:0,reason:'',death:null,tick:0,history:[]
    };
    this._beginStage();
  }
  get tick() { return this.state.tick; }
  _emit(type, data={}) {
    this._events.push({type,bossId:this.state.stage,seq:++this._seq,...data});
  }
  drainEvents() { return this._events.splice(0); }
  _fillQueue() {
    while (this.state.queue.length<7) this.state.queue.push(...shuffle(['I','J','L','O','S','T','Z'],this._pieces));
  }
  _take() { this._fillQueue(); const t=this.state.queue.shift();this._fillQueue();return t; }
  _collides(piece) {
    return cells(piece).some(([x,y])=>x<0||x>=WIDTH||y>=HEIGHT||y<-4||(y>=0&&this.state.board[y][x]!==null));
  }
  _spawn(type=this._take()) {
    this.state.active={type,rotation:0,x:3,y:-1};
    this._fall=0; this._lockTime=0; this._lockResets=0;
    if (this._collides(this.state.active)) this._die('새 블록이 들어올 공간이 없습니다.',{kind:'spawn',cells:cells(this.state.active)});
  }
  _die(reason,detail={}) {
    if (this.state.status==='dead'||this.state.status==='won') return;
    this.state.status='dead';this.state.reason=reason;
    this.state.death={kind:detail.kind||'other',cells:(detail.cells||[]).map(p=>p.slice())};
    this._emit('death',{reason});
  }
  _config() {
    const cfg=STAGES[this.state.stage-1];
    if (this.state.stage!==10) return {...cfg,E:3};
    const phase=this.state.boss?.phase||1;
    if (phase===3) return {...cfg,K:7,response:true,armor:true,stagger:false,E:4};
    if (phase===2) return {...cfg,response:true,stagger:true,E:3};
    return {...cfg,E:3};
  }
  _beginStage() {
    const s=this.state, cfg=STAGES[s.stage-1];
    // Each sector is a fresh battle. Only the run's build and record persist.
    s.board=Array.from({length:HEIGHT},emptyRow);s.tags=Array(HEIGHT).fill(null);
    s.active=null;s.held=null;s.queue=[];s.death=null;s.reason='';
    this._pieces=rng(this.seed+':pieces:'+s.stage);
    this._fillQueue();
    const hp=round(cfg.hp*(1+0.08*s.burdens.vitality));
    s.boss={hp,maxHp:hp,phase:1,pendingPhase:1,K:0,remaining:0,stageLocks:0,
      attackIndex:0,holes:[],exposed:false,armor:false,windowActive:false,
      responseLines:0,overload:0};
    s.combo=0;s.charge=0;s.repairLeft=s.upgrades.repair;s.offers=[];s.canHold=true;
    this._graceUsed=false;this._lastClear=0;this._clears=0;this._repairAt=-Infinity;
    this._previousHole=null;
    const er=rng(this.seed+':erosion:'+s.stage);
    this._erosionHoles=shuffle(Array.from({length:10},(_,i)=>i),er).slice(0,3);
    s.erosionHoles=this._erosionHoles.slice(0,s.burdens.erosion);
    this._planCycle();this._spawn();
  }
  _overload(at) {
    const T=STAGES[this.state.stage-1].T;
    return at>=T+24?2:at>=T?1:0;
  }
  _newHole(exclude=null) {
    const n=Math.floor(this._garbage()* (exclude===null?10:9));
    return exclude===null?n:n>=exclude?n+1:n;
  }
  _planCycle() {
    const s=this.state,b=s.boss,cfg=this._config();
    b.K=Math.max(4,cfg.K-s.burdens.haste);b.remaining=b.K;b.responseLines=0;
    const preserve=s.stage===1||(s.stage===2&&b.attackIndex%2===1);
    if (!preserve||this._previousHole===null) this._previousHole=this._newHole(this._previousHole);
    const a=this._previousHole, alt=this._newHole(a);
    const rows=cfg.rows+this._overload(b.stageLocks+b.K);
    this._plannedHoles=Array.from({length:rows},(_,i)=>cfg.stagger&&i%2?alt:a);
    this._refreshBoss();
  }
  _refreshBoss() {
    const b=this.state.boss,cfg=this._config();
    const E=Math.min(cfg.E,b.K-1), W=Math.min(3,b.K-1);
    b.armor=cfg.armor;
    b.exposed=cfg.armor&&b.remaining<=E;
    b.windowActive=cfg.response&&b.remaining<=W;
    b.response=cfg.response;b.stagger=cfg.stagger;
    b.overload=this._overload(b.stageLocks);
    b.nextAttackAt=b.stageLocks+b.remaining;
    const reduction=cfg.response&&b.responseLines>=2?1:0;
    b.holes=this._plannedHoles.slice(0,Math.max(1,this._plannedHoles.length-reduction));
    b.erosionRemaining=Math.max(0,this.state.burdens.erosion-b.stageLocks);
    this.state.repairCooldown=Math.max(0,6-(b.stageLocks-this._repairAt));
  }
  ghostY() {
    const p=this.state.active;
    if (!p) return -1;
    let y=p.y;
    while (!this._collides({...p,y:y+1})) y++;
    return y;
  }
  _moved(p, wasGrounded) {
    this.state.active=p;
    if (wasGrounded&&this._lockResets<15) {this._lockTime=0;this._lockResets++;}
  }
  act(action) {
    const s=this.state,p=s.active;
    if (s.status!=='playing'||!p) return false;
    if (action==='drop') {s.active={...p,y:this.ghostY()};this._lock();return true;}
    if (action==='hold') {
      if (!s.canHold) return false;
      const old=s.held;s.held=p.type;
      if (old===null)this._spawn();else this._spawn(old);
      s.canHold=false;this._emit('hold');return true;
    }
    const grounded=this._collides({...p,y:p.y+1});
    if (action==='left'||action==='right') {
      const next={...p,x:p.x+(action==='left'?-1:1)};
      if (this._collides(next))return false;
      this._moved(next,grounded);return true;
    }
    if (action==='cw'||action==='ccw') {
      const r=(p.rotation+(action==='cw'?1:3))%4;
      const table=p.type==='I'?I_KICKS:KICKS;
      const kicks=p.type==='O'?[[0,0]]:table[`${p.rotation}>${r}`];
      for (const [dx,dy] of kicks) {
        const next={...p,rotation:r,x:p.x+dx,y:p.y-dy};
        if (!this._collides(next)) {this._moved(next,grounded);return true;}
      }
    }
    return false;
  }
  step(dt,softDrop=false) {
    const s=this.state;
    if (s.status!=='playing'||!s.active||!Number.isFinite(dt)||dt<=0)return;
    s.tick++;s.stats.seconds+=dt;
    this._fall+=dt*(softDrop?Math.max(20,STAGES[s.stage-1].gravity):STAGES[s.stage-1].gravity);
    while (this._fall>=1) {
      this._fall--;
      const down={...s.active,y:s.active.y+1};
      if (this._collides(down)) {this._fall=0;break;}
      s.active=down;
    }
    if (this._collides({...s.active,y:s.active.y+1})) {
      this._lockTime+=dt;
      if (this._lockTime+1e-10 >= (500-35*s.burdens.rigidity)/1000) this._lock();
    } else if (this._lockResets<15) this._lockTime=0;
  }
  _deleteRepair(board,tags,offset=0) {
    let i=tags.length-1;
    while (i>=0&&tags[i]===null)i--;
    if (i<0)return false;
    board.splice(i,1);board.unshift(emptyRow());
    tags.splice(i,1);tags.unshift(null);
    this._emit('repair',{row:i-offset});return true;
  }
  _lock() {
    const s=this.state,p=s.active,b=s.boss,u=s.upgrades;
    s.stats.locks++;b.stageLocks++;
    const ext=[...Array.from({length:4},emptyRow),...s.board.map(r=>r.slice())];
    const tags=[null,null,null,null,...s.tags];
    for(const [x,y] of cells(p))ext[y+4][x]=p.type;
    const highest=ext.findIndex(row=>row.some(c=>c!==null));
    const height=highest<0?0:24-highest;
    const indices=[];
    for(let y=4;y<24;y++)if(ext[y].every(c=>c!==null))indices.push(y);
    const rows=indices.map(i=>({row:i-4,colors:ext[i].slice()}));
    const L=indices.length;
    for(const i of indices.slice().reverse()){ext.splice(i,1);tags.splice(i,1);}
    while(ext.length<24){ext.unshift(emptyRow());tags.unshift(null);}
    s.stats.lines+=L;
    if((L===2||L===3)&&s.repairLeft>0&&b.stageLocks-this._repairAt>=6) {
      if(this._deleteRepair(ext,tags,4)){s.repairLeft--;this._repairAt=b.stageLocks;}
    }
    s.board=ext.slice(4);s.tags=tags.slice(4);s.active=null;
    if(ext.slice(0,4).some(r=>r.some(c=>c!==null))) {
      const outside=ext.slice(0,4).flatMap((row,y)=>row.flatMap((c,x)=>c===null?[]:[[x,y-4]]));
      this._die('정리 후에도 블록이 상단을 넘었습니다.',{kind:'lockout',cells:outside});return;
    }
    this._emit('lock',{lines:L});
    if(L>0) {
      if(s.combo===0){s.combo=1;this._graceUsed=false;}else s.combo++;
      s.stats.maxCombo=Math.max(s.stats.maxCombo,s.combo);
      const Q=s.charge;s.charge=0;
      const A=(L===1?.40*u.single:0)+((L===2||L===3)?.20*u.middle:0)
        +(L===4?.35*u.compress:0)+(L===4&&this._lastClear===4?.25*u.repeat:0)
        +(height>=12?.35*u.high:0)+(height<=6?.15*u.low:0);
      const M=1+(.15+.04*u.combo)*Math.min(s.combo-1,5);
      const O=this._clears<2?6*u.opening:0;
      const cfg=this._config();
      const armor=cfg.armor?(b.remaining<=Math.min(cfg.E,b.K-1)?1.35:.65):1;
      const damage=round((([0,10,24,42,64][L]*(1+A)*M)+Q*(u.charge?3+u.charge:3)+O)*armor*(1-.04*s.burdens.dampen));
      this._clears++;this._lastClear=L;
      if(cfg.response&&b.remaining<=Math.min(3,b.K-1))b.responseLines+=L;
      const hpBefore=b.hp;b.hp=Math.max(0,b.hp-damage);
      s.stats.damage+=hpBefore-b.hp;
      this._reservePhase();
      this._emit('clear',{tick:s.tick,rows,lines:L,combo:s.combo,chargeUsed:Q,
        damage,hpBefore,hpAfter:b.hp,killed:b.hp===0});
      if(b.hp===0){this._victory();return;}
    } else {
      if(u.charge)s.charge=Math.min(4,s.charge+1);
      if(s.combo>0) {
        if(u.grace&&!this._graceUsed)this._graceUsed=true;
        else {
          if(u.convert&&s.combo>=3)s.charge=Math.min(4,s.charge+Math.floor(s.combo/2)+u.convert-1);
          s.combo=0;this._graceUsed=false;
        }
      }
    }
    // Erosion is not a boss attack, and never triggers regeneration.
    if(b.stageLocks<=s.burdens.erosion) {
      const hole=this._erosionHoles[b.stageLocks-1];
      this._emit('erosion',{holes:[hole]});
      if(!this._insertRows([hole]))return;
    }
    b.remaining--;
    if(b.remaining===0) {
      this._refreshBoss();
      const holes=b.holes.slice();
      const alive=this._insertRows(holes);
      let regen=0;
      if(s.burdens.regen&&b.hp>0) {
        const cap=s.stage===10?round((b.pendingPhase>=3?.35:b.pendingPhase>=2?.70:1)*b.maxHp):b.maxHp;
        const next=Math.min(cap,b.hp+round(b.maxHp*.005*s.burdens.regen));
        regen=Math.max(0,next-b.hp);b.hp+=regen;
      }
      this._emit('bossAttack',{holes,regen});
      if(!alive)return;
      b.attackIndex++;b.phase=Math.max(b.phase,b.pendingPhase);
      this._planCycle();
    }
    s.canHold=true;this._spawn();this._refreshBoss();
  }
  _insertRows(holes) {
    const s=this.state;
    for(const hole of holes) {
      const pushed=s.board[0].flatMap((c,x)=>c===null?[]:[[x,0]]);
      const overflow=pushed.length>0;
      s.board.shift();s.tags.shift();
      const row=Array(WIDTH).fill('G');row[hole]=null;
      s.board.push(row);s.tags.push(++this._rowId);
      if(overflow){this._die('방해 행이 쌓여 보드가 넘쳤습니다.',{kind:'garbage',cells:pushed});return false;}
    }
    return true;
  }
  _reservePhase() {
    const s=this.state,b=s.boss;
    if(s.stage===10) {
      const p=b.hp<=b.maxHp*.35?3:b.hp<=b.maxHp*.7?2:1;
      b.pendingPhase=Math.max(b.pendingPhase,p);
    }
  }
  _victory() {
    const s=this.state;s.stats.cleared=s.stage;s.active=null;
    s.status=s.stage===10?'won':'reward';
    s.offers=s.status==='reward'?this._makeOffers():[];
    this._emit('stageClear',{stage:s.stage});
  }
  _makeOffers() {
    const s=this.state;
    const upgrades=Object.keys(UPGRADES).filter(k=>s.upgrades[k]<UPGRADES[k].max&&!(s.stage>=7&&k==='opening'&&s.upgrades.opening===0));
    const burdens=Object.keys(BURDENS).filter(k=>s.burdens[k]<3);
    const us=shuffle(upgrades,this._rewards).slice(0,3), bs=shuffle(burdens,this._rewards);
    return us.map((upgrade,i)=>({upgrade,burden:bs[i%bs.length]}));
  }
  choose(index) {
    const s=this.state;
    if(s.status!=='reward'||!Number.isInteger(index)||!s.offers[index])return false;
    const offer=s.offers[index];
    if(s.upgrades[offer.upgrade]>=UPGRADES[offer.upgrade].max||s.burdens[offer.burden]>=3)return false;
    s.upgrades[offer.upgrade]++;s.burdens[offer.burden]++;
    s.history.push({stage:s.stage,...offer});
    s.stage++;s.status='playing';this._beginStage();
    return true;
  }
}
