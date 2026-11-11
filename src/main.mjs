import {Game,STAGES,UPGRADES,BURDENS,cells,SHAPES,RULES_VERSION} from './core.mjs';
import {drawBoss,bossAnchor} from './boss-art.mjs';
import {Effects} from './fx.mjs';
import {AudioDirector} from './audio.mjs';
import {DeathReview} from './death-review.mjs';

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'),ctx=canvas.getContext('2d');
const W=1100,H=680;
const LAYOUT={board:{x:150,y:60,cell:27},boss:{x:550,y:160,w:330,h:350}};
const COLORS={I:'#65d8d0',J:'#739fc9',L:'#d7a56e',O:'#ddca91',S:'#88b6a4',T:'#aa97c5',Z:'#c77f82',G:'#566575'};
const KEY='faultline.records.v1';
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
let sound=readStore('faultline.sound',true),reduced=readStore('faultline.motion',matchMedia('(prefers-reduced-motion: reduce)').matches);
const audio=new AudioDirector(sound),fx=new Effects(audio);
const review=new DeathReview(),physicalKeys=new Set(),physicalPointers=new Set();
let game=null,paused=false,modalKind='',saved=false,lastTime,acc=0,previousStatus='',uiTimer=0,toastUntil=0;
let hpTrail=0,pendingHp=[],recordedActions=[],direction=0,dirAge=0,dirRepeats=0;
const pressed=new Set();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fmtTime=n=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const count=o=>Object.values(o).reduce((a,b)=>a+b,0);
export const getGame=()=>game;

function toast(text){$('toast').textContent=text;$('toast').classList.add('show');toastUntil=performance.now()+2200;}
function clearInput(){pressed.clear();direction=0;dirAge=0;dirRepeats=0;acc=0;}
function modal(html,kind,narrow=false){modalKind=kind;$('modalContent').className='modal-content'+(narrow?' narrow':'');$('modalContent').innerHTML=html;$('modal').hidden=false;clearInput();}
function closeModal(){modalKind='';$('modal').hidden=true;clearInput();lastTime=undefined;canvas.focus({preventScroll:true});}
function resetReview(){review.close();$('deathNotice').hidden=true;}
function beginDeathReview(){
  if(review.active||!game||game.state.status!=='dead')return;
  previousStatus='dead';paused=true;review.open(physicalKeys,physicalPointers);
  clearInput();audio.stop();closeModal();saveRecord();
  $('deathReason').textContent=game.state.reason;
  const kind=game.state.death?.kind;
  $('deathHint').textContent=kind==='garbage'?'회색 행이 올라오며 상단의 블록이 밀려났습니다. 위쪽 붉은 표시를 확인하세요.':kind==='spawn'?'새 블록과 쌓인 블록이 겹친 위치를 붉게 표시했습니다.':kind==='lockout'?'줄을 정리한 뒤에도 남은 블록이 천장을 넘었습니다. 붉은 상단 표시를 확인하세요.':'보드는 사망한 상태로 멈춰 있습니다.';
  $('deathNotice').hidden=false;$('deathContinue').focus({preventScroll:true});
}
function finishDeathReview(){resetReview();showResult();}
function randomSeed(){try{const n=new Uint32Array(1);crypto.getRandomValues(n);return n[0].toString(36).toUpperCase();}catch{return Date.now().toString(36).toUpperCase();}}
export function startRun(seed){
  const value=(seed??$('seedInput').value).trim()||randomSeed();
  resetReview();game=new Game(value);fx.reset(1);saved=false;paused=false;previousStatus='playing';recordedActions=[];
  pendingHp=[];hpTrail=game.state.boss.maxHp;clearInput();closeModal();$('startScreen').hidden=true;
  audio.unlock();updateUi();canvas.focus({preventScroll:true});
}
function goHome(){resetReview();game=null;paused=false;previousStatus='';fx.reset(0);closeModal();$('startScreen').hidden=false;updateUi();}
function act(action){
  if(!game||paused||modalKind||game.state.status!=='playing')return false;
  const ok=game.act(action);if(ok){recordedActions.push({tick:game.tick,action});if(action==='hold')audio.play('hold');}
  onEvents(game.drainEvents());return ok;
}
function onEvents(events){
  if(!events.length)return;fx.consume(events);
  for(const e of events){
    if(e.type==='clear')pendingHp.push({at:fx.time+.18,hp:e.hpAfter});
    if(e.type==='lock'&&!e.lines)audio.play('lock');
    if(e.type==='bossAttack'&&e.regen)hpTrail=Math.max(hpTrail,game.state.boss.hp);
    if(e.type==='death'){$('liveStatus').textContent=e.reason;beginDeathReview();}
    if(e.type==='stageClear')$('liveStatus').textContent=`${e.stage}구역 돌파`;
  }
}
function choose(index){
  if(!game||modalKind!=='reward')return;
  if(!game.choose(index))return;
  closeModal();paused=false;fx.reset(game.state.stage);hpTrail=game.state.boss.maxHp;pendingHp=[];
  onEvents(game.drainEvents());previousStatus='playing';updateUi();
  toast(`${pad(game.state.stage)}구역 · ${STAGES[game.state.stage-1].name}`);
}
function pause(){
  if(!game||game.state.status!=='playing')return;
  paused=true;audio.stop();
  modal(`<p class="modal-eyebrow">RUN SUSPENDED</p><h2>잠시 멈춤</h2><p class="modal-copy">${pad(game.state.stage)}구역 · ${STAGES[game.state.stage-1].name}<br>보드와 모든 전투 시간은 멈춰 있습니다.</p><div class="modal-actions"><button class="primary" data-ui="resume">계속하기</button><button data-ui="build">현재 빌드</button><button class="danger" data-ui="abandon">런 포기</button></div>`,'pause',true);
}
function resume(){paused=false;closeModal();audio.unlock();}
function tags(state){return Object.entries(state.upgrades).filter(([,r])=>r).map(([k,r])=>`<span class="tag">${UPGRADES[k].label} ${r}</span>`).join('')+Object.entries(state.burdens).filter(([,r])=>r).map(([k,r])=>`<span class="tag bad">${BURDENS[k].label} ${r}</span>`).join('');}
function example(def,rank){return def.example?`<details class="ability-example"><summary>예시 보기</summary><p>${esc(def.example(rank))}</p></details>`:'';}
function glossary(){return '<details class="ability-glossary"><summary>기본 용어 보기</summary><p><b>고정:</b> 떨어지던 블록을 놓아 위치가 확정되는 것.<br><b>연쇄:</b> 블록을 놓을 때마다 계속 줄을 지우는 것. 기본적으로 한 번 못 지우면 끝납니다.<br><b>전하:</b> 다음 줄 제거에 모두 사용하는 추가 공격 자원. 최대 4개.<br><b>높이:</b> 바닥부터 가장 높은 블록까지의 칸 수. 이번에 놓을 블록도 포함해 판정합니다.</p></details>';}
function showReward(){
  const s=game.state,next=STAGES[s.stage];
  const cards=s.offers.map((o,i)=>{
    const ur=s.upgrades[o.upgrade]+1,br=s.burdens[o.burden]+1;
    const b={...s.burdens,[o.burden]:br},hp=Math.floor(next.hp*(1+.08*b.vitality)+.5),K=Math.max(4,next.K-b.haste);
    const u=UPGRADES[o.upgrade],risk=BURDENS[o.burden];
    return `<article class="reward-card" aria-labelledby="reward-title-${i}"><div class="card-index">CHOICE 0${i+1}<span class="card-level">LV ${s.upgrades[o.upgrade]} → ${ur}</span></div><h3 id="reward-title-${i}">${u.label}</h3><span class="condition-tag">${u.trigger}</span><p class="card-description">${u.description(ur)}</p>${example(u,ur)}<div class="burden-block"><b>＋ ${risk.label} ${s.burdens[o.burden]} → ${br}</b><p>${risk.description(br)}</p>${example(risk,br)}</div><div class="card-preview">다음 보스 HP ${hp.toLocaleString()} / 블록 ${K}개마다 공격<br>전투 시작 후 침식 ${b.erosion}행 · 내 피해 ×${(1-.04*b.dampen).toFixed(2)}</div><button class="pick-label" type="button" data-choice="${i}">이 개조와 위험 선택 <span>↗</span></button></article>`;
  }).join('');
  modal(`<div class="reward-top"><div><p class="modal-eyebrow">SECTOR ${pad(s.stage)} CLEARED / ${count(s.upgrades)+1} OF 9</p><h2>무엇을 감당할 것인가.</h2><p class="modal-copy">강화와 부담을 함께 선택하세요. 이전 선택은 모두 남습니다.</p></div><div class="reward-next">NEXT ${pad(s.stage+1)} / ${next.name}<br>${s.stage===9?'최종 보스 · 3페이즈':'다음 전투는 빈 보드에서 시작합니다'}</div></div>${glossary()}<div class="reward-grid">${cards}</div><div class="loadout-summary">${tags(s)||'<span class="note">첫 번째 누적 선택입니다.</span>'}</div><p class="note">① ② ③ 키로 선택 가능 · 스테이지마다 보드·홀드 초기화 · 시작 시드 ${esc(game.seed)}</p>`,'reward');
}
function saveRecord(){
  if(saved)return;saved=true;const s=game.state;
  const row={seed:game.seed,cleared:s.stats.cleared,progress:s.status==='won'?1:1-s.boss.hp/s.boss.maxHp,locks:s.stats.locks,seconds:s.stats.seconds,lines:s.stats.lines,version:RULES_VERSION,at:Date.now()};
  const old=readStore(KEY,[]);const list=(Array.isArray(old)?old:[]).filter(x=>x.version===RULES_VERSION);list.push(row);
  list.sort((a,b)=>b.cleared-a.cleared||b.progress-a.progress||a.locks-b.locks||a.seconds-b.seconds);
  writeStore(KEY,list.slice(0,20));
}
function showResult(){
  const s=game.state,won=s.status==='won';saveRecord();
  modal(`<p class="modal-eyebrow">${won?'ALL SECTORS CLEARED':'RUN TERMINATED'} / SEED ${esc(game.seed)}</p><h2>${won?'단층을 돌파했다.':'이번 런은 여기까지.'}</h2><p class="modal-copy">${won?'아홉 번의 선택으로 최종 구조체를 무너뜨렸습니다.':esc(s.reason)}<br>${won?'새로운 선택으로 다시 도전할 수 있습니다.':'다음 런은 빈 보드, 무강화 상태로 다시 시작합니다.'}</p><div class="stat-grid"><div><b>${pad(s.stats.cleared)} / 10</b><small>돌파한 구역</small></div><div><b>${s.stats.locks}</b><small>고정한 블록</small></div><div><b>${fmtTime(s.stats.seconds)}</b><small>활성 전투 시간</small></div></div><div class="loadout-summary">${tags(s)}</div><p class="note">최대 연쇄 ${s.stats.maxCombo} · 제거 ${s.stats.lines}줄 · 실제 피해 ${s.stats.damage.toLocaleString()}<br>기록은 이 기기에 저장됩니다.</p><div class="modal-actions"><button class="primary" data-ui="retry">같은 시드 재도전</button><button data-ui="new">새 런 시작</button><button data-ui="records">기록 보기</button><button data-ui="home">처음으로</button></div>`,'result',true);
}
function showBuild(){
  if(!game)return;paused=true;
  const s=game.state,items=(defs,counts,bad)=>Object.entries(counts).filter(([,r])=>r).map(([k,r])=>`<div class="build-item${bad?' bad':''}"><strong>${defs[k].label} · ${r}</strong><p>${defs[k].description(r)}</p>${example(defs[k],r)}</div>`).join('');
  modal(`<p class="modal-eyebrow">CURRENT BUILD / ${count(s.upgrades)} OF 9</p><h2>누적된 선택</h2><p class="modal-copy">전투는 일시정지되어 있습니다. 새 선택이 이전 효과를 지우지 않습니다.</p>${glossary()}<div class="build-list">${items(UPGRADES,s.upgrades,false)}${items(BURDENS,s.burdens,true)||'<p class="note">아직 부담이 없습니다.</p>'}</div><div class="modal-actions"><button class="primary" data-ui="resume">전투로 돌아가기</button></div>`,'build');
}
function showHelp(){
  const during=!!game&&game.state.status==='playing';if(during)paused=true;
  modal(`<p class="modal-eyebrow">FIELD MANUAL</p><h2>줄을 지워 공격한다.</h2><p class="modal-copy">10구역을 돌파하세요. 상단이 막히면 런이 끝납니다.<br>1~9구역 승리 뒤 강화와 지속 부담을 함께 고릅니다.<br>다음 구역은 빈 보드와 빈 홀드에서 시작합니다.<br>보스의 공격 카운트는 블록을 고정할 때마다 줄어듭니다.</p>${glossary()}<div class="help-list"><span>좌우 이동 <b>← / →</b></span><span>빠른 낙하 <b>↓</b></span><span>시계 회전 <b>X / ↑</b></span><span>반시계 회전 <b>Z</b></span><span>즉시 낙하 <b>SPACE</b></span><span>홀드 <b>C / SHIFT</b></span><span>일시정지 <b>P / ESC</b></span><span>보상 선택 <b>1 / 2 / 3</b></span></div><p class="modal-copy">1·2·3·4줄 기본 피해: 10 / 24 / 42 / 64<br>연속 고정에서 줄을 지우면 연쇄가 쌓입니다.<br>대응 창: 마지막 3고정에 총 2줄을 지우면 예정 공격 1행 감소.<br>노출 창: 방어 ×0.65 → 노출 ×1.35. 공격할 순간을 고르세요.<br>전투가 길어지면 방해 공격이 강해집니다.</p><div class="modal-actions"><button class="primary" data-ui="${during?'resume':'close'}">${during?'전투로 돌아가기':'알겠어요'}</button></div>`,'help',true);
}
function showRecords(){
  if(game&&game.state.status==='playing')paused=true;
  const raw=readStore(KEY,[]),list=(Array.isArray(raw)?raw:[]).filter(r=>r.version===RULES_VERSION);
  modal(`<p class="modal-eyebrow">LOCAL RECORDS</p><h2>이 기기의 기록</h2><p class="modal-copy">돌파 구역 → 보스 진행률 → 고정 수 → 전투 시간 순입니다.</p>${list.length?`<table class="records-table"><thead><tr><th>#</th><th>구역</th><th>블록</th><th>시간</th><th>시드</th></tr></thead><tbody>${list.slice(0,10).map((r,i)=>`<tr><td>${pad(i+1)}</td><td>${r.cleared}/10</td><td>${r.locks}</td><td>${fmtTime(r.seconds)}</td><td>${esc(r.seed)}</td></tr>`).join('')}</tbody></table>`:'<p class="note">아직 끝낸 런이 없습니다. 첫 기록을 남겨보세요.</p>'}<div class="modal-actions"><button class="primary" data-ui="${game?.state.status==='playing'?'resume':game?'result':'close'}">돌아가기</button></div>`,'records',true);
}
function updateUi(){
  const s=game?.state;
  $('runStatus').textContent=s?`SECTOR ${pad(s.stage)} / 10 · ${STAGES[s.stage-1].name}`:'RUN / 대기 중';
  $('buildCount').textContent=s?pad(count(s.upgrades)):'00';
  $('soundBtn').textContent=`소리 ${sound?'ON':'OFF'}`;$('soundBtn').setAttribute('aria-pressed',String(sound));
  $('motionBtn').textContent=reduced?'효과 감소':'효과 기본';$('motionBtn').setAttribute('aria-pressed',String(reduced));
  $('footerHint').textContent=s?`SEED ${game.seed} · ${s.stats.locks} BLOCKS · ${fmtTime(s.stats.seconds)}`:'정규 런 · 사망 시 전부 초기화';
}

function text(str,x,y,size=12,color='#879ca9',align='left',mono=false){ctx.font=`${size}px ${mono?'GameMono,Consolas,monospace':'"Segoe UI","Malgun Gothic",sans-serif'}`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(str,x,y);}
function line(x,y,x2,y2,color='#263541'){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
function block(x,y,size,type,alpha=1,ghost=false){
  const c=COLORS[type]||'#65ddd0';ctx.save();ctx.globalAlpha=alpha;
  if(ghost){ctx.strokeStyle=c;ctx.lineWidth=1.2;ctx.strokeRect(x+3,y+3,size-6,size-6);ctx.fillStyle=c+'0c';ctx.fillRect(x+3,y+3,size-6,size-6);}
  else{ctx.fillStyle=c;ctx.fillRect(x+1,y+1,size-2,size-2);ctx.fillStyle='#ffffff26';ctx.fillRect(x+2,y+2,size-4,2);ctx.fillStyle='#00000026';ctx.fillRect(x+2,y+size-5,size-4,3);if(type==='G'){line(x+5,y+5,x+size-5,y+size-5,'#7d8c9b55');}}
  ctx.restore();
}
function mini(type,x,y,size=12,alpha=1){if(!type)return;const ps=SHAPES[type][0],xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);const minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX+1;for(const [a,b]of ps)block(x+(a-minX)*size-w*size/2,y+(b-minY)*size,size,type,alpha);}
function background(time){
  ctx.fillStyle='#0a1018';ctx.fillRect(0,0,W,H);
  const g=ctx.createRadialGradient(730,320,25,730,320,420);g.addColorStop(0,'#17313a66');g.addColorStop(1,'#0a101800');ctx.fillStyle=g;ctx.fillRect(430,0,670,H);
  ctx.strokeStyle='#21344025';ctx.lineWidth=1;
  for(let x=460;x<W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=30){ctx.beginPath();ctx.moveTo(460,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.save();ctx.translate(715,335);ctx.strokeStyle='#3c5a6340';for(const r of [155,205]){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}ctx.rotate(time*.015);for(let i=0;i<16;i++){ctx.rotate(Math.PI/8);line(195,0,202,0,'#48636b55');}ctx.restore();
}
function draw(state){
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);background(fx.time);
  if(!state){
    drawBoss(ctx,{x:650,y:120,w:350,h:390,time:fx.time,attackProgress:.1,reducedMotion:reduced});
    text('PROTOCOL / 10',1040,44,10,'#516876','right',true);return;
  }
  const s=state,b=s.boss,cfg=STAGES[s.stage-1],{x,y,cell}=LAYOUT.board;
  const opts={...LAYOUT.boss,time:fx.time,phase:b.phase,final:s.stage===10,exposed:b.exposed,attackProgress:1-b.remaining/b.K,recoilX:fx.recoil.x,recoilY:fx.recoil.y,flash:fx.flash,death:fx.death,reducedMotion:reduced};
  drawBoss(ctx,opts);
  ctx.fillStyle='#0b131e';ctx.fillRect(x,y,cell*10,cell*20);
  for(let row=0;row<20;row++)for(let col=0;col<10;col++){
    ctx.strokeStyle='#26374640';ctx.strokeRect(x+col*cell+.5,y+row*cell+.5,cell,cell);
    if(s.board[row][col])block(x+col*cell,y+row*cell,cell,s.board[row][col]);
  }
  if(s.active&&(s.status==='playing'||s.status==='dead')){
    if(s.status==='playing'){
      const gy=game.ghostY();for(const [a,c]of cells({...s.active,y:gy}))if(c>=0)block(x+a*cell,y+c*cell,cell,s.active.type,.65,true);
    }
    for(const [a,c]of cells(s.active))if(c>=0)block(x+a*cell,y+c*cell,cell,s.active.type,s.status==='dead'?.35:1);
  }
  if(s.status==='dead'){
    ctx.strokeStyle='#ef8777';ctx.lineWidth=3;ctx.strokeRect(x-1,y-1,cell*10+2,5);
    for(const [col,row]of s.death?.cells||[]){
      ctx.fillStyle='#ef877744';ctx.strokeStyle='#f7a495';ctx.lineWidth=2;
      if(row<0){ctx.fillRect(x+col*cell+4,y-9,cell-8,6);}
      else if(row<20){ctx.fillRect(x+col*cell+2,y+row*cell+2,cell-4,cell-4);ctx.strokeRect(x+col*cell+2,y+row*cell+2,cell-4,cell-4);}
    }
  }
  ctx.strokeStyle=s.board.slice(0,5).some(r=>r.some(Boolean))?'#b07458':'#4a636b';ctx.lineWidth=1;ctx.strokeRect(x-.5,y-.5,cell*10+1,cell*20+1);
  line(x,y-4,x+32,y-4,'#65ddd0');line(x+cell*10-32,y-4,x+cell*10,y-4,'#65ddd0');
  fx.draw(ctx,LAYOUT,bossAnchor(opts),{reducedMotion:reduced});
  // HUD is drawn above FX, keeping forecasts and the next queue legible.
  text(`SECTOR ${pad(s.stage)} / 10`,x,y-21,11,'#d2e3e4','left',true);text(cfg.name,x+270,y-21,11,'#65ddd0','right');
  text('HOLD',83,80,9,'#708c9b','center',true);ctx.strokeStyle='#293a48';ctx.strokeRect(46,90,76,68);mini(s.held,84,113,14,s.canHold?1:.35);
  if(!s.canHold&&s.held)text('LOCKED',84,174,8,'#6c7e89','center',true);
  text('NEXT',84,226,9,'#708c9b','center',true);s.queue.slice(0,5).forEach((t,i)=>mini(t,84,244+i*53,13,i? .65:1));
  text('COMBO',x,631,9,'#688393','left',true);text(s.combo?`${s.combo} CHAIN`:'—',x,654,17,s.combo?'#65ddd0':'#435966','left',true);
  text('CHARGE',x+166,631,9,'#688393','left',true);for(let i=0;i<4;i++){ctx.fillStyle=i<s.charge?'#efae63':'#25343e';ctx.fillRect(x+166+i*25,643,19,6);}
  text(`${s.stage===10?'FINAL STRUCTURE':'HOSTILE STRUCTURE'} / ${pad(s.stage)}`,550,55,9,'#718d9b','left',true);
  text(s.stage===10?'특이점':`구조체 — ${cfg.name}`,550,88,25,'#e5eae5');
  text(`${Math.ceil(b.hp).toLocaleString()} / ${b.maxHp.toLocaleString()}`,895,85,11,'#b9cbc9','right',true);
  ctx.fillStyle='#23313a';ctx.fillRect(550,104,345,5);ctx.fillStyle='#efae6366';ctx.fillRect(550,104,345*clamp(hpTrail/b.maxHp,0,1),5);ctx.fillStyle=b.exposed?'#efae63':'#65ddd0';ctx.fillRect(550,104,345*clamp(b.hp/b.maxHp,0,1),5);
  text(s.stage===10?`PHASE ${b.phase} / 3`:b.armor?(b.exposed?'노출 ×1.35':'방어 ×0.65'):'직접 타격 ×1.00',550,133,10,b.exposed?'#efae63':'#839ca7','left',s.stage===10);
  if(b.pendingPhase>b.phase)text(`다음 주기 → PHASE ${b.pendingPhase}`,895,133,9,'#efae63','right');
  const tx=960;text('NEXT ATTACK',tx,183,9,'#8099a6','center',true);text(String(b.remaining).padStart(2,'0'),tx,227,42,b.remaining<=3?'#efae63':'#c6d6d9','center',true);text('블록 고정 후',tx,247,10,'#79919d','center');
  text(`${b.holes.length}행 투입`,tx,286,12,'#c9d5d6','center');
  b.holes.forEach((hole,i)=>{for(let col=0;col<10;col++){ctx.fillStyle=col===hole?'#0a1018':'#9c7756';ctx.fillRect(901+col*12,298+i*12,10,9);}ctx.strokeStyle='#71604b';ctx.strokeRect(900,297+i*12,121,11);});
  if(b.response){text(b.windowActive?'대응 창 활성':'마지막 3고정에 대응',tx,365,10,b.windowActive?'#65ddd0':'#667e8c','center');text(`${Math.min(2,b.responseLines)} / 2줄`,tx,387,15,b.responseLines>=2?'#65ddd0':'#d1d9d6','center',true);text('성공 시 방해 1행 감소',tx,407,9,'#647e8e','center');}
  if(b.erosionRemaining){text(`초기 침식 ${b.erosionRemaining}행 남음`,tx,445,10,'#efae63','center');text(`다음 고정 뒤 구멍 ${(s.erosionHoles[b.stageLocks]??0)+1}열`,tx,463,9,'#a68a70','center');}
  const until=cfg.T-b.stageLocks;
  text(until>0?`장기전까지 ${until}고정`:`과부하 +${b.overload}행`,550,575,11,until<=10?'#efae63':'#718d9d');
  text(`전투 고정 ${b.stageLocks}  /  주기 ${b.K}`,550,595,9,'#4f6c7c','left',true);
  if(s.upgrades.repair)text(`수복 ${s.repairLeft}회 · ${s.repairCooldown?`${s.repairCooldown}고정 대기`:'준비됨'}`,895,595,10,'#73968f','right');
  text('BUILD',550,636,9,'#4f6c7c','left',true);text(`${count(s.upgrades)} 강화  /  ${count(s.burdens)} 부담`,550,656,12,'#9eafb6');
  if(s.status==='reward'||s.status==='won')text('구조체 붕괴',895,656,11,'#65ddd0','right');
  if(s.upgrades.high||s.upgrades.low){
    const top=s.board.findIndex(row=>row.some(Boolean));const height=top<0?0:s.board.length-top;
    const planned=s.active&&s.status==='playing'?Math.max(height,...cells({...s.active,y:game.ghostY()}).map(([,row])=>s.board.length-row)):height;
    for(const [limit,label,enabled]of [[12,'고도',s.upgrades.high],[6,'저상',s.upgrades.low]])if(enabled){
      const yy=y+(s.board.length-limit)*cell,color=label==='고도'?'#efae63':'#65ddd0';
      line(x+cell*10+3,yy,x+cell*10+12,yy,color);text(`${label} ${limit}`,x+cell*10+18,yy+4,10,color);
    }
    text(`현재 높이 ${height}`,x+cell*10+18,531,10,'#94a9b3');
    text(`배치 후 ${planned}`,x+cell*10+18,549,10,'#c6d8d4');
  }
}
function resize(){const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
window.addEventListener('resize',resize);resize();
function movement(dt){if(direction){dirAge+=dt;while(dirAge>=.14+dirRepeats*.045){act(direction<0?'left':'right');dirRepeats++;}}}
function frame(ms){
  const dt=lastTime===undefined?0:(ms-lastTime)/1000;lastTime=ms;
  if(dt>.25&&game?.state.status==='playing'&&!paused&&!modalKind)pause();
  const advance=!paused&&dt<=.25;
  if(advance){
    fx.update(dt);
    if(game?.state.status==='playing'&&!modalKind){
      acc+=dt;let steps=0;
      while(acc>=1/120&&steps++<32&&game.state.status==='playing'){
        movement(1/120);game.step(1/120,pressed.has('ArrowDown')||pressed.has('KeyS'));
        onEvents(game.drainEvents());acc-=1/120;
      }
    }else acc=0;
    while(pendingHp.length&&pendingHp[0].at<=fx.time)hpTrail=Math.max(game?.state.boss.hp||0,Math.min(hpTrail,pendingHp.shift().hp));
  }
  if(game){
    const s=game.state;
    if(s.status==='dead'&&previousStatus!=='dead')beginDeathReview();
    if((s.status==='reward'||s.status==='won')&&!modalKind&&fx.readyAt!==null&&fx.time>=fx.readyAt){previousStatus=s.status;clearInput();s.status==='reward'?showReward():showResult();}
  }
  draw(game?.state);uiTimer+=dt;if(uiTimer>.12){updateUi();uiTimer=0;}
  if(toastUntil&&ms>toastUntil){$('toast').classList.remove('show');toastUntil=0;}
  requestAnimationFrame(frame);
}
document.addEventListener('keydown',e=>{
  physicalKeys.add(e.code);
  if(review.active){
    if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.code!=='Tab')e.preventDefault();
    if(review.keyDown(e.code,e))finishDeathReview();return;
  }
  if(e.target instanceof HTMLInputElement){if(e.code==='Enter'){e.preventDefault();startRun();}return;}
  if(modalKind==='reward'&&['Digit1','Digit2','Digit3'].includes(e.code)){e.preventDefault();choose(Number(e.code.slice(-1))-1);return;}
  if(e.code==='Escape'||e.code==='KeyP'){
    e.preventDefault();if(e.repeat)return;
    if(modalKind==='pause'||modalKind==='build'||(modalKind==='help'&&game?.state.status==='playing'))resume();
    else if(modalKind==='records'&&game?.state.status==='playing')resume();
    else if(modalKind==='help'||modalKind==='records')closeModal();else if(!modalKind)pause();return;
  }
  if(!game||paused||modalKind||game.state.status!=='playing')return;
  const map={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',KeyZ:'ccw',KeyX:'cw',ArrowUp:'cw',Space:'drop',KeyC:'hold',ShiftLeft:'hold',ShiftRight:'hold'};
  if(map[e.code]||['ArrowDown','KeyS'].includes(e.code))e.preventDefault();else return;
  if(e.repeat)return;pressed.add(e.code);audio.unlock();
  const a=map[e.code];if(a==='left'||a==='right'){direction=a==='left'?-1:1;dirAge=0;dirRepeats=0;}
  if(a)act(a);
});
document.addEventListener('keyup',e=>{physicalKeys.delete(e.code);review.releaseKey(e.code);pressed.delete(e.code);if(['ArrowLeft','KeyA','ArrowRight','KeyD'].includes(e.code)){direction=pressed.has('ArrowLeft')||pressed.has('KeyA')?-1:pressed.has('ArrowRight')||pressed.has('KeyD')?1:0;dirAge=0;dirRepeats=0;}});
document.addEventListener('pointerdown',e=>{
  physicalPointers.add(e.pointerId);
  if(review.active&&review.pointerDown(e.pointerId)){e.preventDefault();e.stopImmediatePropagation();finishDeathReview();}
},true);
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>{physicalPointers.delete(e.pointerId);review.releasePointer(e.pointerId);},true);
window.addEventListener('blur',()=>{clearInput();physicalKeys.clear();physicalPointers.clear();review.keys.clear();review.pointers.clear();if(game?.state.status==='playing'&&!paused&&!modalKind)pause();audio.stop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(game?.state.status==='playing'&&!paused&&!modalKind)pause();audio.stop();}lastTime=undefined;});
$('startBtn').onclick=()=>startRun();$('helpBtn').onclick=showHelp;$('recordsBtn').onclick=showRecords;
$('deathContinue').onclick=()=>{if(review.active&&!review.keys.size&&!review.pointers.size)finishDeathReview();};
$('buildBtn').onclick=()=>{if(game?.state.status==='playing')showBuild();else toast('전투 중 현재 빌드를 확인할 수 있습니다.');};
$('pauseBtn').onclick=()=>{if(game?.state.status!=='playing')return;if(paused)resume();else pause();};
$('soundBtn').onclick=()=>{sound=!sound;audio.setEnabled(sound);writeStore('faultline.sound',sound);updateUi();};
$('motionBtn').onclick=()=>{reduced=!reduced;writeStore('faultline.motion',reduced);updateUi();};
$('modal').addEventListener('click',e=>{
  const card=e.target.closest('[data-choice]');if(card){choose(Number(card.dataset.choice));return;}
  const button=e.target.closest('[data-ui]');if(!button)return;
  const actions={resume,close:closeModal,build:showBuild,records:showRecords,result:showResult,retry:()=>startRun(game.seed),new:()=>startRun(''),home:goHome,abandon:()=>{modal('<p class="modal-eyebrow">ABANDON RUN</p><h2>이 런을 끝낼까요?</h2><p class="modal-copy">현재 보드와 모든 누적 선택이 사라집니다.</p><div class="modal-actions"><button class="danger" data-ui="home">런 끝내기</button><button class="primary" data-ui="resume">계속하기</button></div>','abandon',true);}};
  actions[button.dataset.ui]?.();
});
for(const button of document.querySelectorAll('[data-act]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);audio.unlock();const a=button.dataset.act;if(a==='left'||a==='right'){direction=a==='left'?-1:1;dirAge=0;dirRepeats=0;}act(a);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{direction=0;dirAge=0;dirRepeats=0;});
}
updateUi();requestAnimationFrame(frame);
