import {Game,STAGES,UPGRADES,BURDENS,cells,SHAPES,RULES_VERSION} from './core.mjs';
import {drawBoss,bossAnchor} from './boss-art.mjs';
import {Effects} from './fx.mjs';
import {AudioDirector} from './audio.mjs';
import {DeathReview} from './death-review.mjs';
import {drawPcStage,drawPcAttack,getPcImpact} from './pc-stage.mjs';

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'),ctx=canvas.getContext('2d');
let W=1060,H=800;
let LAYOUT={width:W,height:H,portrait:false,board:{x:100,y:48,cell:34,cols:10,rows:20},boss:{x:550,y:160,w:330,h:350}};
export function getViewLayout(viewportWidth=1100,viewportHeight=900,availableWidth=viewportWidth-62){
  const portrait=viewportWidth<=680;
  if(portrait){
    const width=Math.max(250,Math.min(440,availableWidth)),cell=Math.min(28,(width-110)/10);
    const board={x:(width-cell*10)/2,y:132,cell,cols:10,rows:20};
    const height=board.y+cell*20+62;
    return {width,height,cssWidth:width,cssHeight:height,portrait,board,boss:{x:8,y:3,w:64,h:64}};
  }
  const width=1060,height=800,fitHeight=Math.max(518,viewportHeight-188);
  const cssWidth=Math.min(availableWidth,fitHeight*width/height);
  return {width,height,cssWidth,cssHeight:cssWidth*height/width,portrait,board:{x:100,y:48,cell:34,cols:10,rows:20},boss:{x:550,y:160,w:330,h:350}};
}
const COLORS={I:'#65d8d0',J:'#739fc9',L:'#d7a56e',O:'#ddca91',S:'#88b6a4',T:'#aa97c5',Z:'#c77f82',G:'#566575'};
const KEY='faultline.records.v2';
const PHASE_NAMES=['','관측','붕괴','일식'];
const MOMENTUM_NAMES=['READY','FOCUS','SURGE','BURST','OVERDRIVE'];
const MOMENTUM_COLORS=['#8ba4b2','#65ddd0','#71d6ff','#b9abff','#f2bbff'];
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
let sound=readStore('faultline.sound',true),reduced=readStore('faultline.motion',matchMedia('(prefers-reduced-motion: reduce)').matches);
const audio=new AudioDirector(sound),fx=new Effects(audio);
const review=new DeathReview(),physicalKeys=new Set(),physicalPointers=new Set();
let game=null,paused=false,modalKind='',saved=false,lastTime,acc=0,previousStatus='',uiTimer=0,toastUntil=0;
let hpTrail=0,displayedHp=0,pendingHp=[],recordedActions=[],direction=0,dirAge=0,dirRepeats=0;
let choiceLocked=false,guideSection='buffs',recordsMode='standard';
const pressed=new Set();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fmtTime=n=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const count=o=>Object.values(o).reduce((a,b)=>a+b,0);
const ROLE_LABELS={attack:'공격',defense:'방어',control:'조작'};
function roleTag(def){return `<span class="ability-role role-${def.category||'attack'}">${ROLE_LABELS[def.category]||'공격'}</span>`;}
export const getGame=()=>game;

function toast(text){
  // Combat already has dedicated HUD feedback; floating notices obscure it.
  if(game?.state.status==='playing')return;
  $('toast').textContent=text;$('toast').classList.add('show');toastUntil=performance.now()+2200;
}
function clearInput(){pressed.clear();direction=0;dirAge=0;dirRepeats=0;acc=0;}
function modal(html,kind,narrow=false){
  modalKind=kind;const panel=$('modalContent');panel.className='modal-content'+(narrow?' narrow':'');panel.innerHTML=html;$('modal').hidden=false;clearInput();
  const heading=panel.querySelector('h2');if(heading){heading.id='menuTitle';heading.tabIndex=-1;panel.setAttribute('aria-labelledby','menuTitle');heading.focus({preventScroll:true});}
  panel.scrollTop=0;
}
function closeModal(){modalKind='';$('modal').hidden=true;clearInput();lastTime=undefined;(game?canvas:$('startBtn')).focus({preventScroll:true});}
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
export function startRun(seed,options={}){
  const value=(seed??$('seedInput').value).trim()||randomSeed();
  resetReview();game=new Game(value,options);fx.reset(game.state.stage);saved=false;paused=false;previousStatus=game.state.status;recordedActions=[];choiceLocked=false;
  $('toast').classList.remove('show');toastUntil=0;
  $('liveStatus').textContent=game.state.status==='rebuild'?`${game.state.stage}구역 재도전 준비`: `${game.state.stage}구역 전투 시작`;
  pendingHp=[];hpTrail=displayedHp=game.state.boss?.hp||0;clearInput();closeModal();$('startScreen').hidden=true;resize();
  audio.unlock();updateUi();
  if(game.state.status==='rebuild'){paused=true;showReward();}else canvas.focus({preventScroll:true});
}
function retryPrevious(){const target=Math.max(1,game.state.stage-1);startRun(game.seed,{startStage:target,mode:'assisted'});}
function beginPrepared(){
  if(!game?.beginPreparedRun())return;
  fx.reset(game.state.stage);pendingHp=[];hpTrail=displayedHp=game.state.boss.hp;paused=false;previousStatus='playing';closeModal();
  onEvents(game.drainEvents());audio.unlock();updateUi();toast(`${game.state.stage}구역 재도전 시작`);
}
function goHome(){resetReview();game=null;paused=false;previousStatus='';fx.reset(0);closeModal();$('startScreen').hidden=false;updateUi();}
function act(action){
  if(!game||paused||modalKind||game.state.status!=='playing')return false;
  const ok=game.act(action);if(ok){recordedActions.push({tick:game.tick,action});if(action==='hold')audio.play('hold');}
  onEvents(game.drainEvents());return ok;
}
function onEvents(events){
  if(!events.length)return;fx.setPresentationMode?.(LAYOUT.portrait);fx.consume(events);
  for(const e of events){
    if(e.type==='momentumUp'&&[1,4,8,12].includes(e.value)){
      const message=`기세 ${e.value} · ${MOMENTUM_NAMES[e.tier]} · ${e.reason}`;
      toast(message);$('liveStatus').textContent=message;
    }
    if(e.type==='clear')pendingHp.push({at:fx.time+.18,hp:e.hpAfter});
    if(e.type==='lock'&&!e.lines)audio.play('lock');
    if(e.type==='bossAttack'&&e.regen){
      hpTrail=Math.max(hpTrail,game.state.boss.hp);
      // Keep the hidden balance above max until queued impacts land; clamping here loses same-lock healing.
      displayedHp+=e.regen;
    }
    if(e.type==='death'){$('liveStatus').textContent=e.reason;beginDeathReview();}
    if(e.type==='stageClear')$('liveStatus').textContent=`${e.stage}구역 돌파`;
    if(e.type==='guard'){const message=`방해 1행 차단 · 재충전 ${game.state.guardCooldown}블록`;toast(message);$('liveStatus').textContent=message;}
    if(e.type==='comboProtected')$('liveStatus').textContent='연쇄 보호를 사용했습니다. 연쇄는 유지됩니다.';
    if(e.type==='phaseChange'){
      const message=`최종 보스 ${e.phase}페이즈 · ${PHASE_NAMES[e.phase]}${e.phase===2?' — 간헐적 진동':e.phase===3?' — 다음 블록이 잠시 가려집니다':''}`;
      toast(message);$('liveStatus').textContent=message;
    }
  }
}
function turnChoicePage(render){
  choiceLocked=true;const panel=$('modalContent');if(!reduced)panel.classList.add('page-leaving');
  setTimeout(()=>{if(game){render();if(!reduced)$('modalContent').classList.add('page-entering');}choiceLocked=false;},reduced?0:160);
}
function choose(index){
  if(!game||!['reward','rebuild'].includes(modalKind)||choiceLocked)return;
  const rebuilding=game.state.status==='rebuild';if(!game.choose(index))return;
  if(rebuilding){turnChoicePage(()=>game.state.status==='ready'?showPrepared():showReward());return;}
  closeModal();paused=false;fx.reset(game.state.stage);hpTrail=displayedHp=game.state.boss.hp;pendingHp=[];
  onEvents(game.drainEvents());previousStatus='playing';updateUi();
  toast(`${pad(game.state.stage)}구역 · ${STAGES[game.state.stage-1].name}`);
}
function reroll(){
  if(choiceLocked||!['reward','rebuild'].includes(modalKind)||!game?.rerollOffers())return;
  turnChoicePage(showReward);
}
function pause(){
  if(!game||game.state.status!=='playing')return;
  paused=true;audio.stop();
  modal(`<p class="modal-eyebrow">RUN SUSPENDED</p><h2>잠시 멈춤</h2><p class="modal-copy">${pad(game.state.stage)}구역 · ${STAGES[game.state.stage-1].name}<br>보드와 모든 전투 시간은 멈춰 있습니다.</p><div class="modal-actions"><button class="primary" data-ui="resume">계속하기</button><button data-ui="build">현재 빌드</button><button class="danger" data-ui="abandon">런 포기</button></div>`,'pause',true);
}
function resume(){paused=false;closeModal();audio.unlock();}
function tags(state){return Object.entries(state.upgrades).filter(([,r])=>r).map(([k,r])=>`<span class="tag">${UPGRADES[k].label} ${r}</span>`).join('')+Object.entries(state.burdens).filter(([,r])=>r).map(([k,r])=>`<span class="tag bad">${BURDENS[k].label} ${r}</span>`).join('');}
function example(def,rank){return def.example?`<details class="ability-example"><summary>예시 보기</summary><p>${esc(def.example(rank))}</p></details>`:'';}
function glossary(){return '<details class="ability-glossary"><summary>기본 용어 보기</summary><p><b>고정:</b> 떨어지던 블록을 놓아 위치가 확정되는 것.<br><b>연쇄:</b> 블록을 놓을 때마다 계속 줄을 지우는 것. 기본적으로 한 번 못 지우면 끝납니다.<br><b>기세:</b> 줄 제거 한 번에 +1. 못 지우거나 구역을 넘어도 유지되는 연출 지표이며 피해량은 바뀌지 않습니다.<br><b>전하:</b> 다음 줄 제거에 모두 사용하는 추가 공격 자원. 최대 4개.<br><b>높이:</b> 바닥부터 가장 높은 블록까지의 칸 수. 이번에 놓을 블록도 포함해 판정합니다.</p></details>';}
function choiceCards(s,next){
  return s.offers.map((o,i)=>{
    const ur=s.upgrades[o.upgrade]+1,br=s.burdens[o.burden]+1;
    const burdens={...s.burdens,[o.burden]:br},hp=Math.floor(next.hp*(1+.08*burdens.vitality)+.5),K=Math.max(4,next.K-burdens.haste);
    const u=UPGRADES[o.upgrade],risk=BURDENS[o.burden];
    return `<article class="reward-card" aria-labelledby="reward-title-${i}"><div class="card-index">CHOICE 0${i+1}</div><div class="effect-heading buff-heading">＋ 버프 · 유리한 효과 <span>Lv.${s.upgrades[o.upgrade]} → ${ur}</span></div><div class="ability-title">${roleTag(u)}<h3 id="reward-title-${i}">${esc(u.label)}</h3></div><span class="condition-tag">${esc(u.trigger)}</span><p class="card-description">${esc(u.description(ur))}</p><details class="effect-comparison"><summary>현재 효과와 비교</summary><p>현재: ${s.upgrades[o.upgrade]?esc(u.description(s.upgrades[o.upgrade])):'미보유'}</p><p>선택 후: ${esc(u.description(ur))}</p></details>${example(u,ur)}<div class="burden-block"><div class="effect-heading debuff-heading">− 디버프 · 함께 받는 불이익 <span>Lv.${s.burdens[o.burden]} → ${br}</span></div><h4>${esc(risk.label)}</h4><p>${esc(risk.description(br))}</p><details class="effect-comparison"><summary>현재 불이익과 비교</summary><p>현재: ${s.burdens[o.burden]?esc(risk.description(s.burdens[o.burden])):'미보유'}</p><p>선택 후: ${esc(risk.description(br))}</p></details>${example(risk,br)}</div><div class="card-preview">${s.status==='rebuild'?'시작':'다음'} 보스 HP ${hp.toLocaleString()} · 공격 간격 ${K}블록<br>초반 방해 ${burdens.erosion}행 · 내 피해 ×${(1-.04*burdens.dampen).toFixed(2)}<br>착지 조작 여유 ${(500+75*((s.upgrades.landing||0)+(o.upgrade==='landing'?1:0))-35*burdens.rigidity)/1000}초${burdens.reinforcement?'<br>매 3번째 공격에 방해 +1행':''}</div><button class="pick-label" type="button" data-choice="${i}">버프와 디버프 함께 획득 <span>↗</span></button></article>`;
  }).join('');
}
function showReward(){
  const s=game.state,rebuilding=s.status==='rebuild',target=rebuilding?s.rebuildTarget:s.stage+1,next=STAGES[target-1];
  const progress=rebuilding?`<div class="rebuild-progress" aria-label="능력 선택 ${s.rebuildStep}/${s.rebuildTotal}">${Array.from({length:s.rebuildTotal},(_,i)=>`<span class="${i<s.rebuildStep-1?'done':i===s.rebuildStep-1?'current':''}">${i+1}</span>`).join('')}</div>`:'';
  modal(`<div class="choice-page"><div class="reward-top"><div><p class="modal-eyebrow">${rebuilding?`REBUILD / 능력 선택 ${s.rebuildStep} OF ${s.rebuildTotal}`:`SECTOR ${pad(s.stage)} CLEARED / 선택 ${count(s.upgrades)+1} OF 9`}</p><h2>${rebuilding?`${target}구역 재도전 준비`:'다음 전투를 위한 선택'}</h2><p class="modal-copy">${rebuilding?`이전 능력은 초기화되었습니다. ${s.rebuildTotal}번의 보상을 하나씩 다시 선택하세요.`:'버프 하나와 디버프 하나를 함께 받습니다. 이전 선택은 계속 유지됩니다.'}</p></div><div class="reward-next">${rebuilding?'START':'NEXT'} ${pad(target)} / ${next.name}<br>${target===10?'최종 보스 · 관측 / 붕괴 / 일식':'전투는 빈 보드에서 시작합니다'}</div></div>${progress}<div class="choice-toolbar"><button type="button" data-ui="reroll" ${s.rerollsLeft?'':'disabled'}>${s.rerollsLeft?'선택지 새로고침 · 무료 1/1':'새로고침 사용 완료 · 0/1'}</button><span>세 카드의 버프·디버프 조합을 함께 다시 추첨합니다.</span></div>${glossary()}<div class="reward-grid">${choiceCards(s,next)}</div><p class="section-caption">현재까지 선택한 능력</p><div class="loadout-summary">${tags(s)||'<span class="note">아직 선택한 능력이 없습니다.</span>'}</div><p class="note">① ② ③ 키로 선택 · 매 선택 화면에서 새로고침 1회 · SEED ${esc(game.seed)}</p>${rebuilding?'<div class="modal-actions"><button data-ui="home">준비를 그만두고 처음으로</button></div>':''}</div>`,rebuilding?'rebuild':'reward');
}
function buildItems(s){
  return [[UPGRADES,s.upgrades,false],[BURDENS,s.burdens,true]].map(([defs,levels,bad])=>Object.entries(levels).filter(([,r])=>r).map(([k,r])=>`<div class="build-item${bad?' bad':''}"><span class="effect-heading ${bad?'debuff-heading':'buff-heading'}">${bad?'− 디버프':'＋ 버프'} · Lv.${r}</span>${bad?'':roleTag(defs[k])}<strong>${esc(defs[k].label)}</strong><p>${esc(defs[k].description(r))}</p>${example(defs[k],r)}</div>`).join('')).join('');
}
function showPrepared(){
  const s=game.state;
  modal(`<p class="modal-eyebrow">REBUILD COMPLETE / ${s.rebuildTotal} OF ${s.rebuildTotal}</p><h2>${s.stage}구역으로 돌아갈 준비가 됐습니다.</h2><p class="modal-copy">아래 버프·디버프를 가지고 빈 보드에서 시작합니다. 전투는 시작 버튼을 누르면 진행됩니다.</p><div class="build-list">${buildItems(s)}</div><div class="modal-actions"><button class="primary" data-ui="prepared">${s.stage}구역 전투 시작 →</button><button data-ui="home">처음 화면으로</button></div>`,'prepared');
}
function saveRecord(){
  if(saved)return;saved=true;const s=game.state;
  const row={seed:game.seed,mode:s.mode||'standard',startStage:s.startStage||1,stage:s.stage,cleared:s.stats.cleared,progress:s.status==='won'?1:1-s.boss.hp/s.boss.maxHp,locks:s.stats.locks,seconds:s.stats.seconds,lines:s.stats.lines,maxMomentum:s.stats.maxMomentum,version:RULES_VERSION,at:Date.now()};
  const old=readStore(KEY,[]);const list=(Array.isArray(old)?old:[]).filter(x=>x&&typeof x==='object');list.push(row);
  list.sort((a,b)=>b.cleared-a.cleared||b.progress-a.progress||a.locks-b.locks||a.seconds-b.seconds);
  const versions=[...new Set(list.map(r=>r.version))];
  writeStore(KEY,versions.flatMap(version=>['standard','assisted'].flatMap(mode=>list.filter(r=>r.version===version&&(r.mode||'standard')===mode).slice(0,20))));
}
function showResult(){
  const s=game.state,won=s.status==='won',target=Math.max(1,s.stage-1),assisted=s.mode==='assisted';saveRecord();
  modal(`<p class="modal-eyebrow">${won?'ALL SECTORS CLEARED':'RUN TERMINATED'} / ${assisted?'중간 구역 재도전':'1구역부터 도전'}</p><h2>${won?'단층을 돌파했다.':'다시 도전할 수 있습니다.'}</h2><p class="modal-copy">${won?'최종 구조체를 무너뜨렸습니다.':esc(s.reason)}<br>${assisted?`${s.startStage}구역에서 시작한 도전입니다. 생략한 구역의 처치 수는 기록에 포함하지 않습니다.`:'1구역부터 진행한 도전입니다.'}</p><div class="stat-grid"><div><b>${s.stats.cleared}개</b><small>이번에 처치한 보스</small></div><div><b>${s.stage}구역</b><small>${won?'최종 돌파':'도달 구역'}</small></div><div><b>${fmtTime(s.stats.seconds)}</b><small>활성 전투 시간</small></div></div><div class="loadout-summary">${tags(s)}</div><p class="note">최고 기세 ${s.stats.maxMomentum||0} · 최대 연쇄 ${s.stats.maxCombo} · 제거 ${s.stats.lines}줄 · 실제 피해 ${s.stats.damage.toLocaleString()}<br>SEED ${esc(game.seed)} · 기록은 도전 방식별로 이 기기에 저장됩니다.</p><div class="retry-options"><button class="primary" data-ui="retry"><b>1구역부터 새로 도전</b><small>능력을 초기화하고 같은 시드로 다시 시작</small></button>${!won&&target>1?`<button class="retry-assisted" data-ui="previous"><b>${target}구역부터 재도전</b><small>능력을 새로 ${target-1}번 선택한 뒤 시작</small></button>`:''}</div>${!won?`<p class="note">${target>1?'한 구역 전부터 다시 도전하며 다른 능력 조합을 만들 수 있습니다.':'1·2구역에서 사망하면 1구역부터 다시 시작합니다.'}</p>`:''}<div class="modal-actions"><button data-ui="new">새 시드로 1구역부터</button><button data-ui="records">기록 보기</button><button data-ui="home">처음 화면으로</button></div>`,'result',true);
}
function showBuild(){
  if(!game)return;paused=true;const s=game.state;
  modal(`<p class="modal-eyebrow">CURRENT BUILD / ${count(s.upgrades)} OF 9</p><h2>누적된 버프와 디버프</h2><p class="modal-copy">전투는 일시정지되어 있습니다. 새 선택이 이전 효과를 지우지 않습니다.</p>${glossary()}<div class="build-list">${buildItems(s)||'<p class="note">아직 선택한 능력이 없습니다.</p>'}</div><div class="modal-actions"><button class="primary" data-ui="resume">전투로 돌아가기</button><button data-ui="guide">능력 도감</button></div>`,'build');
}
const GUIDE_NOTES={
  single:'두 번에 걸쳐 1줄씩 지워도 각각 적용됩니다. 한 번에 2줄을 지우면 적용되지 않습니다.',
  middle:'2줄과 3줄을 한 번에 지우는 정리형 플레이에 적합합니다. 1줄·4줄 공격은 강화하지 않습니다.',
  compress:'한 번에 4줄을 지워야 합니다. 1줄을 네 번 지우는 것으로는 발동하지 않습니다.',
  combo:'연쇄는 블록 하나를 놓을 때마다 이어서 줄을 지우는 것입니다. 1줄 → 1줄 → 2줄 제거도 3연쇄입니다. 6연쇄 이후에도 연쇄는 이어지지만 피해 배율은 더 오르지 않습니다.',
  grace:'제거 → 실패 → 제거 → 실패라면 마지막 실패에서 끝납니다. 중간에 줄을 지워도 보호 횟수는 회복되지 않습니다.',
  charge:'전하 3개를 모아 공격하면 3개를 모두 소비합니다. 전하는 구역을 넘길 때 초기화되고, 추가 피해도 보스 방어와 내 공격력 감소의 영향을 받습니다.',
  high:'이번에 놓은 블록까지 포함해 바닥부터 최고 높이를 셉니다. 줄이 사라진 뒤 낮아져도 이번 공격에는 적용됩니다.',
  low:'배치 후 높이 8칸에서 4줄을 지워 4칸이 되어도 이번 공격에는 적용되지 않습니다. 지우기 전부터 6칸 이하여야 합니다.',
  opening:'첫 두 블록이 아니라 첫 두 번의 줄 제거입니다. 기본 체력은 보스 체력 증가 디버프를 적용하기 전 수치이며, 추가 피해에도 방어와 내 공격력 감소가 적용됩니다.',
  repair:'2줄 이상 제거할 때 남아 있는 회색 방해 행을 없앱니다. 4줄에도 발동합니다. 실제 제거에 성공한 뒤 블록 12/10/8개를 고정하면 레벨별로 재충전됩니다. 최대 1회 보유하며 추가 제거는 피해·연쇄·제거 줄 수를 늘리지 않습니다.',
  guard:'오른쪽 공격 예고가 02 이상이거나, 이번 블록으로 1줄만 지웠다면 발동하지 않습니다. 이미 올라온 회색 행을 지우는 능력이 아닙니다. 보스 공격 직전에 줄을 지워 예정 방해를 2행에서 1행으로 줄였다면, 이 능력이 그 1행도 막아 0행으로 만듭니다. 0행까지 막아도 공격 번호·보스 회복·페이즈 진행은 유지됩니다.',
  landing:'착지한 뒤 움직이거나 회전할 시간을 늘립니다. 자연 낙하 속도는 바뀌지 않고, 즉시 낙하를 누르면 여전히 바로 고정됩니다. 착지 조작 시간 감소와 함께 선택하면 두 효과를 합친 최종 시간을 표시합니다.',
  reinforcement:'이 전투의 세 번째·여섯 번째·아홉 번째처럼 세 번마다 적용됩니다. 첫 번째·두 번째 공격과 초반 방해 행 추가에는 적용되지 않습니다. 다음 구역에서는 번호가 1부터 다시 시작합니다. 추가 행도 방어 능력으로 막을 수 있습니다.',
  vitality:'현재 공격 간격은 바뀌지 않습니다. 보스가 더 많은 피해를 받아야 쓰러지므로 전투가 길어질 수 있습니다.',
  dampen:'줄 제거 피해뿐 아니라 전하와 선제 타격의 추가 피해에도 적용됩니다.',
  haste:'예를 들어 원래 9블록마다 공격했다면 1레벨은 8블록마다 공격합니다. 블록 낙하 속도는 바뀌지 않습니다.',
  erosion:'2레벨이면 첫 블록 뒤 1행, 두 번째 블록 뒤 1행으로 총 2행입니다. 일반 보스 공격과 별개이며 보스 체력 회복을 발동시키지 않습니다.',
  regen:'회복하는 쪽은 플레이어가 아니라 보스입니다. 최대 체력 1000이면 1레벨에서 공격할 때마다 약 5를 회복합니다.',
  rigidity:'착지한 뒤 옆으로 움직이거나 회전할 여유가 줄어듭니다. 즉시 낙하는 원래 바로 고정되므로 동작이 달라지지 않습니다.'
};
function showGuide(section=guideSection){
  guideSection=section;if(game?.state.status==='playing')paused=true;
  const defs=section==='debuffs'?BURDENS:UPGRADES,bad=section==='debuffs';
  const cards=Object.entries(defs).map(([key,def])=>`<article class="guide-card ${bad?'bad':''}"><span class="effect-heading ${bad?'debuff-heading':'buff-heading'}">${bad?'− 디버프 · 불이익':'＋ 버프 · 유리한 효과'}</span>${bad?'':roleTag(def)}<h3>${esc(def.label)}</h3>${def.trigger?`<p class="guide-trigger">발동 조건 · ${esc(def.trigger)}</p>`:''}<div class="guide-levels">${Array.from({length:def.max},(_,i)=>`<p><b>Lv.${i+1}</b> ${esc(def.description(i+1))}</p>`).join('')}</div><div class="guide-example"><b>구체적인 예시 · 1레벨 기준</b><p>${esc(def.example?.(1)||'')}</p></div><p class="guide-note"><b>알아두기</b><br>${esc(GUIDE_NOTES[key]||'')}</p></article>`).join('');
  const rules=`<div class="guide-rules"><article><h3>PC · 기세가 전장을 바꿉니다</h3><p>기세와 콤보 수치는 하단 HUD에서 항상 확인할 수 있습니다. 성공 시 오른쪽 외곽에 큰 카드가 잠깐 나타난 뒤 사라집니다. 승급과 일제 방출 때의 큰 단층 구조·후광도 페이드아웃하며, 연속 성공이 표시 시간을 계속 연장하지 않습니다. 4줄을 지울 수 있는 착지 위치에서는 압축 장치가 준비되고, 성공 시 공격 형태에 맞춰 보스 판재가 벌어집니다. OVERDRIVE에서는 기세 16·20·24처럼 네 번 더 지울 때마다 일제 방출 연출이 반복됩니다. 기세는 줄지 않으며 추가 피해나 조작 대기는 없습니다.</p></article><article><h3>콤보가 끊겨도 기세는 계속됩니다</h3><p>줄을 한 번 지울 때 기세 +1입니다. 1줄과 4줄 모두 한 번이며, 여러 능력이 함께 발동해도 중복으로 올리지 않습니다. 블록을 쌓는 동안, 연쇄 종료, 구역 이동에도 유지됩니다. 새 도전·사망·중간 구역 재도전은 0부터 시작하고 준비 카드 선택으로는 오르지 않습니다. 기세는 연출 지표이며 피해량은 바뀌지 않습니다.</p></article><article><h3>기세 1 / 4 / 8 / 12</h3><p>FOCUS → SURGE → BURST → OVERDRIVE로 외곽 왕관·궤도·탄의 실루엣과 폭발이 커집니다. 최고 단계에서도 숫자는 계속 쌓이지만 광량과 입자 수에는 상한이 있습니다. 예: 1줄 제거 → 못 지움 → 2줄 제거는 콤보는 새로 시작하지만 기세는 1 → 2로 이어집니다.</p></article><article><h3>내 빌드의 성공은 어떻게 보이나요?</h3><p>1줄 강화는 1줄 집중, 2·3줄 강화는 다중 공격, 4줄 강화는 압축 공격으로 표시됩니다. 전하를 소비하면 충전 방출, 높이 조건을 맞추면 고층 돌파·저층 안정, 실제 방해를 막거나 지우면 차단·복구로 강조합니다. 착지 보조 빌드도 줄 제거로 동일하게 +1을 얻습니다. 기다리기·착지·홀드만으로는 기세가 오르지 않습니다.</p></article><article><h3>한 번의 선택 = 버프 하나 + 디버프 하나</h3><p>세 카드 중 하나를 선택하면 좋은 효과와 불이익을 함께 받습니다. 다음 구역부터 적용되고 이후에도 누적됩니다. 같은 능력을 다시 고르면 레벨이 오릅니다.</p></article><article><h3>공격 · 방어 · 조작</h3><p>공격은 보스에게 주는 피해를, 방어는 회색 행을 막거나 지우는 능력을, 조작은 착지 후 움직일 여유를 늘립니다. 선택 가능한 후보가 있으면 공격 1장과 방어·조작 중 1장을 포함합니다. 세 번째는 자유롭게 추첨합니다.</p></article><article><h3>2줄 제거와 2 COMBO는 다릅니다</h3><p>한 블록으로 한 번에 2줄을 지우면 ‘2줄 제거’입니다. 블록을 두 번 연속 놓으며 매번 줄을 지우면 ‘2 COMBO’, 즉 2연쇄입니다. 첫 제거는 연쇄 시작이며, 다음 제거부터 큰 COMBO 숫자가 표시됩니다.</p></article><article><h3>연쇄는 시간으로 끊기지 않습니다</h3><p>줄을 지운 다음 블록으로도 줄을 지우면 연쇄가 이어집니다. 줄을 못 지우면 끝나지만, 연쇄 보호가 있으면 한 연쇄에서 딱 한 번 유지합니다. 기다린 시간이나 팝업이 사라진 것은 종료 조건이 아닙니다. 6연쇄부터 피해 보너스는 최대지만 숫자는 계속 올라갑니다.</p></article><article><h3>피해 · 전하 · 높이</h3><p>1·2·3·4줄 기본 피해는 10 / 24 / 42 / 64입니다. 줄 제거 피해 보너스는 합산하고 연쇄 배율을 곱합니다. 전하는 다음 줄 제거에 전부 쓰며 최대 4개입니다. 전하와 선제 타격의 추가 피해에는 연쇄 배율을 곱하지 않습니다. 높이는 이번 블록을 놓은 뒤 줄이 사라지기 전에 셉니다.</p></article><article><h3>방어 차단과 방해 행 제거</h3><p>방어 차단은 공격 예고가 01일 때 이번 블록으로 2줄 이상을 지우면 아직 올라오지 않은 방해를 1행 막습니다. 방해 행 제거는 2줄 이상 지울 때 이미 올라온 회색 행을 1행 없앱니다. 두 능력 모두 전투 시작 시 1회 충전되며 실제 사용 후 블록을 고정하면 다시 충전됩니다. 차단은 레벨별 12/10블록, 제거는 12/10/8블록이며 최대 1회 보유합니다. 기다리거나 페이즈를 넘긴 것만으로는 충전되지 않습니다.</p></article><article><h3>회색 행과 세 번째 공격</h3><p>한 번에 올라오는 회색 행들의 빈칸은 같은 열입니다. 다음 공격은 독립적인 랜덤이므로 같은 열이 연속될 수도 있습니다. 주기적 증원을 선택했다면 매 3번째 공격에 1행이 더해집니다. 예를 들어 3·6·9·12번째 공격입니다. 추가 행을 포함한 실제 모양과 공격 번호를 오른쪽 예고에서 확인하세요.</p></article><article><h3>죽어도 다른 조합으로 재도전</h3><p>사망한 구역보다 하나 낮은 구역부터 시작할 수 있습니다. 9구역 사망 → 8구역 재도전이라면, 능력을 초기화하고 1~7구역 보상에 해당하는 일곱 번의 선택을 합니다. 각 선택 화면에서 무료 새로고침이 한 번 있습니다.</p></article><article><h3>최종 보스 · 세 페이즈</h3><p>10구역은 관측 → 붕괴 → 일식으로 진행됩니다. 체력 70%·35% 이하에서 다음 공격 주기에 페이즈가 바뀝니다. 붕괴부터 간헐적인 진동이 생기고, 일식에서는 진입 시와 이후 12초마다 3초간 NEXT가 가려집니다. 현재 블록·홀드·공격 예고는 계속 보입니다. 효과 감소 설정은 진동을 끄고 암전을 약하게 합니다.</p></article></div>`;
  modal(`<div class="guide-header"><div><p class="modal-eyebrow">FIELD GUIDE / VER ${RULES_VERSION}</p><h2>버프 · 디버프 도감</h2><p class="modal-copy">조건부터 예외까지 읽고, 원하는 조합을 찾아보세요.</p></div><button data-ui="guideClose" type="button">${game?.state.status==='playing'?'전투로 돌아가기':'닫기'}</button></div><nav class="guide-tabs" aria-label="도감 분류"><button data-guide="buffs" aria-pressed="${section==='buffs'}">버프 ${Object.keys(UPGRADES).length}개</button><button data-guide="debuffs" aria-pressed="${section==='debuffs'}">디버프 ${Object.keys(BURDENS).length}개</button><button data-guide="rules" aria-pressed="${section==='rules'}">기본 규칙과 재도전</button></nav>${section==='rules'?rules:`<div class="guide-grid">${cards}</div>`}<div class="modal-actions"><button class="primary" data-ui="guideClose">${game?.state.status==='playing'?'전투로 돌아가기':'처음 화면으로'}</button></div>`,'guide');
}
function showHelp(){
  const during=!!game&&game.state.status==='playing';if(during)paused=true;
  modal(`<p class="modal-eyebrow">FIELD MANUAL</p><h2>줄을 지워 공격한다.</h2><p class="modal-copy">10구역을 돌파하세요. 상단이 막히면 런이 끝납니다.<br>1~9구역 승리 뒤 강화와 지속 부담을 함께 고릅니다.<br>다음 구역은 빈 보드와 빈 홀드에서 시작합니다.<br>보스의 공격 카운트는 블록을 고정할 때마다 줄어듭니다.</p>${glossary()}<div class="help-list"><span>좌우 이동 <b>← / →</b></span><span>빠른 낙하 <b>↓</b></span><span>시계 회전 <b>X / ↑</b></span><span>반시계 회전 <b>Z</b></span><span>즉시 낙하 <b>SPACE</b></span><span>홀드 <b>C / SHIFT</b></span><span>일시정지 <b>P / ESC</b></span><span>보상 선택 <b>1 / 2 / 3</b></span></div><p class="modal-copy">1·2·3·4줄 기본 피해: 10 / 24 / 42 / 64<br>연속 고정에서 줄을 지우면 연쇄가 쌓입니다.<br>대응 창: 마지막 3고정에 총 2줄을 지우면 예정 공격 1행 감소.<br>노출 창: 방어 ×0.65 → 노출 ×1.35. 공격할 순간을 고르세요.<br>전투가 길어지면 방해 공격이 강해집니다.</p><div class="modal-actions"><button class="primary" data-ui="${during?'resume':'close'}">${during?'전투로 돌아가기':'알겠어요'}</button></div>`,'help',true);
}
function showRecords(mode=recordsMode){
  recordsMode=mode;if(game&&game.state.status==='playing')paused=true;
  const raw=readStore(KEY,[]),list=(Array.isArray(raw)?raw:[]).filter(r=>r.version===RULES_VERSION&&(r.mode||'standard')===mode);
  modal(`<p class="modal-eyebrow">LOCAL RECORDS / VER ${RULES_VERSION}</p><h2>이 기기의 기록</h2><nav class="guide-tabs" aria-label="도전 방식"><button data-records="standard" aria-pressed="${mode==='standard'}">1구역부터 도전</button><button data-records="assisted" aria-pressed="${mode==='assisted'}">중간 구역 재도전</button></nav><p class="modal-copy">현재 규칙 ${RULES_VERSION}의 기록만 보여줍니다. 이전 버전 기록도 보관됩니다. 두 도전 방식은 각각 구분하며, 실제로 처치한 보스만 셉니다.</p>${list.length?`<div class="records-scroll"><table class="records-table"><thead><tr><th>#</th><th>시작 → 도달</th><th>처치</th><th>시간</th><th>시드</th></tr></thead><tbody>${list.slice(0,10).map((r,i)=>`<tr><td>${pad(i+1)}</td><td>${r.startStage||1} → ${r.stage||r.cleared+1}</td><td>${r.cleared}개</td><td>${fmtTime(r.seconds)}</td><td>${esc(r.seed)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="note">아직 끝낸 도전이 없습니다.</p>'}<div class="modal-actions"><button class="primary" data-ui="${game?.state.status==='playing'?'resume':game?'result':'close'}">돌아가기</button></div>`,'records',true);
}
function updateUi(){
  const s=game?.state;
  $('runStatus').textContent=s?`SECTOR ${pad(s.stage)} / 10 · ${STAGES[s.stage-1].name}`:'RUN / 대기 중';
  $('buildCount').textContent=s?pad(count(s.upgrades)):'00';
  $('soundBtn').textContent=`소리 ${sound?'ON':'OFF'}`;$('soundBtn').setAttribute('aria-pressed',String(sound));
  $('motionBtn').textContent=reduced?'효과 감소':'효과 기본';$('motionBtn').setAttribute('aria-pressed',String(reduced));
  $('footerHint').textContent=s?`${s.mode==='assisted'?'재도전':'정규'} · SEED ${game.seed} · ${s.stats.locks} BLOCKS · ${fmtTime(s.stats.seconds)}`:'사망 후 1구역부터 또는 한 구역 전부터 재도전';
}

function text(str,x,y,size=12,color='#879ca9',align='left',mono=false){const scale=LAYOUT.cssWidth/W||1,fontSize=LAYOUT.portrait?size:Math.max(size,10/scale);ctx.font=`${fontSize}px ${mono?'GameMono,Consolas,monospace':'"Segoe UI","Malgun Gothic",sans-serif'}`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(str,x,y);}
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
function paintBoard(s,board){
  const {x,y,cell}=board;
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
}
function draw(state){
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  if(LAYOUT.portrait){drawPortrait(state);return;}
  drawDesktop(state);
}
/** Count the rows the current ghost would really complete, without changing the board. */
export function previewClearLines(s,landingY){
  if(!s?.active||s.status!=='playing'||!Number.isFinite(landingY))return 0;
  const projected=cells({...s.active,y:landingY});
  let low=20,high=-1,total=0;
  for(const [,row]of projected){low=Math.min(low,row);high=Math.max(high,row);}
  for(let row=Math.max(0,low);row<=Math.min(19,high);row++){
    let full=true;
    for(let col=0;col<10;col++)if(!s.board[row][col]&&!projected.some(([x,y])=>x===col&&y===row)){full=false;break;}
    if(full)total++;
  }
  return total;
}
function drawMomentum(s,compact=false){
  const value=s.momentum||0,tier=s.momentumTier||0,color=MOMENTUM_COLORS[tier],name=MOMENTUM_NAMES[tier];
  if(compact){
    const {x,y,cell}=LAYOUT.board,bottom=y+cell*20;
    text('기세 · 연출',x,bottom+12,9,'#b2c7d3');text(String(value),x,bottom+38,27,color,'left',true);
    text(name,x+64,bottom+20,15,color,'left',true);
    text('피해량 변화 없음',x+64,bottom+35,9,'#97afbe');
    const step=Math.max(80,Math.min(168,cell*10-64))/4;
    for(let i=0;i<4;i++){ctx.fillStyle=i<tier?color:'#243240';ctx.fillRect(x+64+i*step,bottom+41,step-5,3);}
    const c=fx.comboFeedback,age=fx.time-c.noticeAt;
    text(s.combo?`${s.combo} COMBO · ${s.combo}연쇄`:'콤보 대기',x,bottom+57,11,s.combo?'#65ddd0':'#8ca4b2');
    const notice=c.kind==='protected'&&age<1.1?'연쇄 보호 사용':c.kind==='ended'&&age<1.1?'연쇄 종료':s.momentumReason||'줄 제거마다 +1';
    text(notice,W-x,bottom+57,10,'#b9c9d1','right');return;
  }
  const cue=fx.pcFeedback,age=fx.time-(cue?.cardAt??-Infinity),hold=cue?.cardStrong ? .2 : .15,fade=cue?.cardStrong ? .8 : .5;
  const alpha=age>=0&&age<=hold?1:age>hold?clamp(1-(age-hold)/fade,0,1):0;
  if(alpha>0){
    const center=960,top=500;
    ctx.save();ctx.globalAlpha=alpha*(cue.cardStrong?1:.85);
    ctx.fillStyle='#09131df5';ctx.strokeStyle=color;ctx.lineWidth=1.5;
    ctx.fillRect(912,top,96,170);ctx.strokeRect(912.5,top+.5,95,169);
    text('MOMENTUM',center,top+20,10,'#cfdfdf','center',true);
    const digits=String(value).length,size=digits<=2?52:digits===3?40:digits===4?30:22;
    text(String(value),center,top+76,size,color,'center',true);
    text(name,center,top+99,name.length>6?13:15,color,'center',true);
    text(String(s.combo||0),center,top+134,23,'#f0e6d4','center',true);
    text('COMBO / 연쇄',center,top+153,9,'#b9cbd5','center',true);
    ctx.restore();
  }
  text('MOMENTUM / 기세 · 연출',550,699,10,'#a9c4d0','left',true);
  text(name,790,699,12,color,'right',true);text(String(value),895,699,String(value).length>5?13:20,color,'right',true);
  text(s.momentumReason||'줄을 지워 기세를 쌓으세요',550,722,13,color);
  const comboNotice=fx.comboFeedback.kind==='protected'&&fx.time-fx.comboFeedback.noticeAt<1.1?' · 보호 사용':'';
  text(`${s.combo||0} COMBO${comboNotice}`,895,722,11,'#b9cbd5','right',true);
  text('구역을 넘어 유지 · 피해량 변화 없음',550,744,10,'#9bb4c2');
  if(tier===4){
    const cycle=(value-12)%4;
    text(`OVERDRIVE · 다음 일제 방출 ${4-cycle}회`,550,771,12,'#e9c389','left',true);
    for(let i=0;i<4;i++){ctx.fillStyle=i<cycle?'#efc873':'#34423e';ctx.fillRect(812+i*22,763,15,6);}
  }else text(`다음 기세 단계 ${[1,4,8,12][tier]} · 줄 제거마다 +1`,550,771,11,'#8eabb7');
}
function drawPortrait(s){
  ctx.fillStyle='#0a1018';ctx.fillRect(0,0,W,H);
  if(!s||!s.boss||s.status==='rebuild'||s.status==='ready')return;
  const b=s.boss,cfg=STAGES[s.stage-1],board=LAYOUT.board,{x,y,cell}=board;
  const danger=s.board.slice(0,5).some(row=>row.some(Boolean));
  const tremor=s.stage===10&&b.phase>=2&&!paused&&!reduced&&b.phaseElapsed%5<.55;
  const opts={...LAYOUT.boss,time:fx.time,phase:b.phase,final:s.stage===10,exposed:b.exposed,
    attackProgress:1-b.remaining/b.K,recoilX:fx.recoil.x*.3+(tremor?Math.sin(b.phaseElapsed*53):0),
    recoilY:fx.recoil.y*.3,flash:fx.flash,death:fx.death,reducedMotion:reduced};
  drawBoss(ctx,opts);
  if(s.stage===10&&b.phase===3&&b.obscureRemaining>0){ctx.fillStyle=reduced?'#03081022':'#03081066';ctx.fillRect(4,2,72,66);}
  fx.drawAura(ctx,LAYOUT,{momentum:s.momentum,momentumTier:s.momentumTier,combo:s.combo,danger,reducedMotion:reduced,compact:true,auraTopSpace:24});
  paintBoard(s,board);
  fx.draw(ctx,LAYOUT,bossAnchor(opts),{reducedMotion:reduced,compact:true});
  // Forecasts are always painted above attack particles and remain readable.
  text(`${pad(s.stage)} / 10 · ${cfg.name}`,80,18,13,'#e0ece9');
  text(`${Math.ceil(b.hp)} / ${b.maxHp}`,W-8,36,11,'#b8d3d2','right',true);
  ctx.fillStyle='#23313a';ctx.fillRect(80,24,W-90,4);
  ctx.fillStyle='#efae6366';ctx.fillRect(80,24,(W-90)*clamp(hpTrail/b.maxHp,0,1),4);
  ctx.fillStyle=b.exposed?'#efae63':'#65ddd0';ctx.fillRect(80,24,(W-90)*clamp(b.hp/b.maxHp,0,1),4);
  const phase=s.stage===10?`${PHASE_NAMES[b.phase]} · ${b.phase}/3`:b.armor?(b.exposed?'노출 ×1.35':'방어 ×0.65'):'직접 타격';
  text(phase,80,53,11,b.exposed?'#efae63':'#91b1bd');
  text(`공격 ${b.attackIndex+1}회째 · ${pad(b.remaining)}블록 뒤`,8,82,13,b.remaining<=3?'#efae63':'#c2d7dd');
  const gx=W-92,gy=65;
  b.holes.forEach((hole,i)=>{for(let col=0;col<10;col++){ctx.fillStyle=col===hole?'#0a1018':'#b0926e';ctx.fillRect(gx+col*8,gy+i*5,7,4);}});
  text(`${b.holes.length}행${b.reinforcement?' · 증원 +1':''}`,W-9,104,10,b.reinforcement?'#efae63':'#9eb7c2','right');
  let notice=b.response?`대응 ${Math.min(2,b.responseLines)}/2줄`:s.upgrades.guard?(s.guardLeft?'차단 충전 완료':`차단 재충전 ${s.guardCooldown}블록`):'';
  if(b.guardReady)notice=`차단 준비 · 2줄 이상`;
  if(b.erosionRemaining)notice=`초반 방해 ${b.erosionRemaining}행`;
  text(notice,8,102,10,b.guardReady?'#65ddd0':'#9ab6c1');
  const left=x/2,right=W-x/2;
  text('HOLD',left,y+15,9,'#9cb5bf','center',true);
  ctx.strokeStyle='#304650';ctx.strokeRect(4,y+22,x-9,46);mini(s.held,left,y+34,8,s.canHold?1:.35);
  if(!s.canHold)text('LOCK',left,y+83,8,'#718a95','center',true);
  text('NEXT',right,y+15,9,'#9cb5bf','center',true);
  const obscured=s.stage===10&&b.phase===3&&b.obscureRemaining>0;
  s.queue.slice(0,5).forEach((type,i)=>{
    if(obscured)text('?',right,y+46+i*44,21,'#c3b0e0','center',true);
    else mini(type,right,y+34+i*44,8,i? .75:1);
  });
  if(obscured)text(`${b.obscureRemaining.toFixed(1)}초`,right,y+268,9,'#c3b0e0','center');
  text('CHARGE',left,y+133,8,'#9db6c1','center',true);
  for(let i=0;i<4;i++){ctx.fillStyle=i<s.charge?'#efae63':'#25343e';ctx.fillRect(left-14,y+146+i*13,28,7);}
  if(s.upgrades.landing||s.burdens.rigidity)text(`${(s.lockDelayMs/1000).toFixed(3)}초`,left,y+213,8,'#98b6c6','center');
  if(s.upgrades.guard){text('차단',left,y+235,9,'#91bbaa','center');text(s.guardLeft?'준비':`${s.guardCooldown}블록`,left,y+252,10,'#91bbaa','center');}
  if(s.upgrades.repair){text('행 제거',left,y+277,9,'#91bbaa','center');text(s.repairLeft?'준비':`${s.repairCooldown}블록`,left,y+294,10,'#91bbaa','center');}
  const top=s.board.findIndex(row=>row.some(Boolean)),height=top<0?0:20-top;
  if(s.upgrades.high||s.upgrades.low){
    text(`높이 ${height}`,left,y+310,9,'#a8c2cb','center');
    for(const [limit,label,on]of [[12,'고층',s.upgrades.high],[6,'저층',s.upgrades.low]])if(on){
      const yy=y+(20-limit)*cell;colorMarker(yy,label,limit);
    }
  }
  function colorMarker(yy,label,limit){line(x-6,yy,x,yy,label==='고층'?'#efae63':'#65ddd0');text(`${label}${limit}`,x-7,yy-4,8,'#9db7c1','right');}
  text('장기전',left,y+cell*20-45,8,'#9db5c3','center');
  text(b.overload?`+${b.overload}행`:`${Math.max(0,cfg.T-b.stageLocks)}`,left,y+cell*20-29,10,'#b3c6d1','center');
  drawMomentum(s,true);
}
function drawDesktop(state){
  background(fx.time);
  if(!state){
    text('PROTOCOL / 10',1040,44,10,'#516876','right',true);return;
  }
  const s=state,b=s.boss,cfg=STAGES[s.stage-1],{x,y,cell}=LAYOUT.board;
  if(!b||s.status==='rebuild'||s.status==='ready')return;
  const danger=s.board.slice(0,5).some(r=>r.some(Boolean));
  const previewLines=previewClearLines(s,s.active&&s.status==='playing'?game.ghostY():NaN);
  const impact=getPcImpact(fx);
  // Only the canvas scene moves; modal buttons and pointer targets stay stationary.
  const tremor=s.stage===10&&b.phase>=2&&s.status==='playing'&&!paused&&!reduced&&b.phaseElapsed%5<.55;
  const opts={...LAYOUT.boss,time:fx.time,phase:b.phase,final:s.stage===10,exposed:b.exposed,attackProgress:1-b.remaining/b.K,recoilX:fx.recoil.x+(tremor?Math.sin(b.phaseElapsed*53)*1.8:0),recoilY:fx.recoil.y+(tremor?Math.cos(b.phaseElapsed*47)*1.3:0),flash:fx.flash,death:fx.death,reducedMotion:reduced,
    impactSplit:impact.split,impactCompression:impact.compression,scar:impact.scar,hitStyle:impact.style,direction:impact.direction};
  const target=bossAnchor(opts);
  drawPcStage(ctx,LAYOUT,s,fx,{reducedMotion:reduced,danger,previewLines,target});
  drawBoss(ctx,opts);
  if(s.stage===10&&b.phase===3&&b.obscureRemaining>0){
    const veil=ctx.createRadialGradient(720,335,25,720,335,260);veil.addColorStop(0,reduced?'#02040b55':'#02040bbb');veil.addColorStop(1,'#02040b00');ctx.fillStyle=veil;ctx.fillRect(480,145,410,420);
  }
  paintBoard(s,LAYOUT.board);
  drawPcAttack(ctx,LAYOUT,s,fx,{reducedMotion:reduced,target});
  fx.draw(ctx,LAYOUT,target,{reducedMotion:reduced});
  // HUD is drawn above FX, keeping forecasts and the next queue legible.
  text(`SECTOR ${pad(s.stage)} / 10`,10,y-21,11,'#d2e3e4','left',true);text(cfg.name,x+cell*10,y-21,11,'#65ddd0','right');
  text('HOLD',48,80,9,'#708c9b','center',true);ctx.strokeStyle='#293a48';ctx.strokeRect(10,90,76,68);mini(s.held,48,113,14,s.canHold?1:.35);
  if(!s.canHold&&s.held)text('LOCKED',48,174,8,'#6c7e89','center',true);
  text('NEXT',48,226,9,'#708c9b','center',true);
  const obscured=s.stage===10&&b.phase===3&&b.obscureRemaining>0;
  if(obscured){
    for(let i=0;i<5;i++){ctx.fillStyle='#18202e';ctx.fillRect(15,240+i*53,66,39);text('?',48,267+i*53,23,'#b2a6c9','center',true);}
    text(`복귀 ${b.obscureRemaining.toFixed(1)}초`,48,532,9,'#c3b0e0','center',true);
  }else s.queue.slice(0,5).forEach((t,i)=>mini(t,48,244+i*53,13,i? .65:1));
  text(previewLines===4?'QUAD READY / 4줄 준비':'BOARD / 10 × 20',x,y+cell*20+29,10,previewLines===4?'#efc873':'#688393','left',true);
  if(s.combo)text(`연쇄 배율 ×${(1+(.15+.04*s.upgrades.combo)*Math.min(s.combo-1,5)).toFixed(2)}`,x,y+cell*20+52,10,'#a3c9c5');
  text('CHARGE',x+cell*10-104,y+cell*20+29,9,'#688393','left',true);for(let i=0;i<4;i++){ctx.fillStyle=i<s.charge?'#efae63':'#25343e';ctx.fillRect(x+cell*10-104+i*25,y+cell*20+41,19,6);}
  text(`${s.stage===10?'FINAL STRUCTURE':'HOSTILE STRUCTURE'} / ${pad(s.stage)}`,550,55,9,'#718d9b','left',true);
  text(s.stage===10?'특이점':`구조체 — ${cfg.name}`,550,88,25,'#e5eae5');
  const visibleHp=clamp(displayedHp,0,b.maxHp);
  text(`${Math.ceil(visibleHp).toLocaleString()} / ${b.maxHp.toLocaleString()}`,895,85,11,'#b9cbc9','right',true);
  ctx.fillStyle='#23313a';ctx.fillRect(550,104,345,5);ctx.fillStyle='#efae6366';ctx.fillRect(550,104,345*clamp(hpTrail/b.maxHp,0,1),5);ctx.fillStyle=b.exposed?'#efae63':'#65ddd0';ctx.fillRect(550,104,345*clamp(visibleHp/b.maxHp,0,1),5);
  text(s.stage===10?`PHASE ${b.phase} / 3 · ${PHASE_NAMES[b.phase]}`:b.armor?(b.exposed?'노출 ×1.35':'방어 ×0.65'):'직접 타격 ×1.00',550,133,10,b.exposed?'#efae63':'#839ca7','left',s.stage===10);
  if(b.pendingPhase>b.phase)text(`다음 주기 → ${PHASE_NAMES[b.pendingPhase]}`,895,133,9,'#efae63','right');
  else if(s.stage===10&&b.phase===3)text(obscured?`일식 · NEXT 복귀 ${b.obscureRemaining.toFixed(1)}초`:`다음 일식 ${Math.ceil(b.obscureCooldown||0)}초`,895,133,10,'#c3b0e0','right');
  const tx=960;text(`공격 ${b.attackIndex+1}회째`,tx,160,10,'#a4bac5','center');text('NEXT ATTACK',tx,183,9,'#8099a6','center',true);text(String(b.remaining).padStart(2,'0'),tx,227,42,b.remaining<=3?'#efae63':'#c6d6d9','center',true);text('블록 고정 후',tx,247,10,'#79919d','center');
  if(b.reinforcementBonus)text('3회마다 증원 +1행',tx,268,10,'#efae63','center');
  text(`${b.holes.length}행 투입`,tx,286,12,'#c9d5d6','center');
  b.holes.forEach((hole,i)=>{for(let col=0;col<10;col++){ctx.fillStyle=col===hole?'#0a1018':'#9c7756';ctx.fillRect(901+col*12,298+i*12,10,9);}ctx.strokeStyle='#71604b';ctx.strokeRect(900,297+i*12,121,11);});
  if(b.response){text(b.windowActive?'대응 창 활성':'마지막 3고정에 대응',tx,365,10,b.windowActive?'#65ddd0':'#667e8c','center');text(`${Math.min(2,b.responseLines)} / 2줄`,tx,387,15,b.responseLines>=2?'#65ddd0':'#d1d9d6','center',true);text('성공 시 방해 1행 감소',tx,407,9,'#647e8e','center');}
  if(b.erosionRemaining){text(`초기 침식 ${b.erosionRemaining}행 남음`,tx,445,10,'#efae63','center');text(`다음 고정 뒤 구멍 ${(s.erosionHoles[b.stageLocks]??0)+1}열`,tx,463,9,'#a68a70','center');}
  const until=cfg.T-b.stageLocks;
  text(until>0?`장기전까지 ${until}고정`:`과부하 +${b.overload}행`,550,575,11,until<=10?'#efae63':'#718d9d');
  text(`전투 고정 ${b.stageLocks}  /  주기 ${b.K}`,550,595,9,'#4f6c7c','left',true);
  if(s.upgrades.repair)text(s.repairLeft?'행 제거 준비 · 2줄 이상':`행 제거 재충전까지 ${s.repairCooldown}블록`,895,595,10,'#73968f','right');
  if(s.upgrades.guard)text(s.guardLeft?`차단 충전 완료 · ${b.guardReady?'2줄 이상 지우면 1행 차단':'공격 예고 01에서 준비'}`:`차단 재충전까지 ${s.guardCooldown}블록`,550,615,10,b.guardReady?'#65ddd0':'#83a49d');
  if(s.upgrades.landing||s.burdens.rigidity)text(`착지 여유 ${((s.lockDelayMs??(500+75*(s.upgrades.landing||0)-35*s.burdens.rigidity))/1000).toFixed(3)}초`,895,636,10,'#a7bed2','right');
  text('BUILD',550,636,9,'#4f6c7c','left',true);text(`${count(s.upgrades)} 강화  /  ${count(s.burdens)} 부담`,550,656,12,'#9eafb6');
  if((s.status==='reward'||s.status==='won')&&visibleHp===0)text('구조체 붕괴',895,656,11,'#65ddd0','right');
  if(s.upgrades.high||s.upgrades.low){
    const top=s.board.findIndex(row=>row.some(Boolean));const height=top<0?0:s.board.length-top;
    const planned=s.active&&s.status==='playing'?Math.max(height,...cells({...s.active,y:game.ghostY()}).map(([,row])=>s.board.length-row)):height;
    for(const [limit,label,enabled]of [[12,'고층',s.upgrades.high],[6,'저층',s.upgrades.low]])if(enabled){
      const yy=y+(s.board.length-limit)*cell,color=label==='고층'?'#efae63':'#65ddd0';
      line(x+cell*10+2,yy,x+cell*10+7,yy,color);
    }
    text([s.upgrades.high?'고층 ≥12':'',s.upgrades.low?'저층 ≤6':''].filter(Boolean).join(' · '),x+cell*10+18,y+cell*20-60,10,'#a9bfc7');
    text(`현재 높이 ${height}`,x+cell*10+18,y+cell*20-42,10,'#94a9b3');
    text(`배치 후 ${planned}`,x+cell*10+18,y+cell*20-24,10,'#c6d8d4');
  }
  drawMomentum(s);
}
function resize(){
  const viewportWidth=globalThis.innerWidth||1100,viewportHeight=globalThis.innerHeight||900;
  const appWidth=Math.min(document.querySelector?.('.app')?.clientWidth||Math.min(viewportWidth,1220),document.documentElement?.clientWidth||viewportWidth);
  const available=Math.max(250,appWidth-(viewportWidth<=680?18:62));
  LAYOUT=getViewLayout(viewportWidth,viewportHeight,available);W=LAYOUT.width;H=LAYOUT.height;
  const dpr=Math.min(2,globalThis.devicePixelRatio||1);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
  if(canvas.style){canvas.style.width=`${LAYOUT.cssWidth}px`;canvas.style.height=`${LAYOUT.cssHeight}px`;canvas.style.aspectRatio=`${W}/${H}`;}
  if(canvas.parentElement?.style)canvas.parentElement.style.width=`${LAYOUT.cssWidth+2}px`;
  canvas.setAttribute('data-layout',LAYOUT.portrait?'portrait':'desktop');
  fx.setPresentationMode?.(LAYOUT.portrait);
}
window.addEventListener('resize',resize);resize();
function movement(dt){if(direction){dirAge+=dt;while(dirAge>=.14+dirRepeats*.045){act(direction<0?'left':'right');dirRepeats++;}}}
function frame(ms){
  const dt=lastTime===undefined?0:(ms-lastTime)/1000;lastTime=ms;
  if(dt>.25&&game?.state.status==='playing'&&!paused&&!modalKind)pause();
  const advance=!paused&&dt<=.25;
  if(advance){
    fx.update(dt);
    for(const hit of fx.drainImpacts?.()||[]){
      if(hit.bossId!==game?.state.stage)continue;
      displayedHp=Math.max(0,displayedHp-Math.max(0,hit.hpBefore-hit.hpAfter));
    }
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
  if(modalKind&&e.code==='Tab'){
    const focusables=Array.from($('modalContent').querySelectorAll('button:not([disabled]),input,summary,[tabindex="0"]'));
    if(focusables.length){const first=focusables[0],last=focusables.at(-1),active=document.activeElement;
      if(e.shiftKey&&(active===first||!focusables.includes(active))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(active===last||!focusables.includes(active))){e.preventDefault();first.focus();}
    }return;
  }
  if(review.active){
    if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.code!=='Tab')e.preventDefault();
    if(review.keyDown(e.code,e))finishDeathReview();return;
  }
  if(e.target instanceof HTMLInputElement){if(e.code==='Enter'){e.preventDefault();startRun();}return;}
  if(['reward','rebuild'].includes(modalKind)&&['Digit1','Digit2','Digit3'].includes(e.code)){e.preventDefault();if(!e.repeat)choose(Number(e.code.slice(-1))-1);return;}
  if(e.code==='Escape'||e.code==='KeyP'){
    e.preventDefault();if(e.repeat)return;
    if(modalKind==='pause'||modalKind==='build'||(modalKind==='help'&&game?.state.status==='playing'))resume();
    else if(modalKind==='records'&&game?.state.status==='playing')resume();
    else if(modalKind==='guide'){game?.state.status==='playing'?resume():closeModal();}
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
$('startBtn').onclick=()=>startRun();$('helpBtn').onclick=showHelp;$('recordsBtn').onclick=()=>showRecords();$('guideBtn').onclick=()=>showGuide('buffs');
$('deathContinue').onclick=()=>{if(review.active&&!review.keys.size&&!review.pointers.size)finishDeathReview();};
$('buildBtn').onclick=()=>{if(game?.state.status==='playing')showBuild();else toast('전투 중 현재 빌드를 확인할 수 있습니다.');};
$('pauseBtn').onclick=()=>{if(game?.state.status!=='playing')return;if(paused)resume();else pause();};
$('soundBtn').onclick=()=>{sound=!sound;audio.setEnabled(sound);writeStore('faultline.sound',sound);updateUi();};
$('motionBtn').onclick=()=>{reduced=!reduced;writeStore('faultline.motion',reduced);updateUi();};
$('modal').addEventListener('click',e=>{
  const guide=e.target.closest('[data-guide]');if(guide){showGuide(guide.dataset.guide);return;}
  const record=e.target.closest('[data-records]');if(record){showRecords(record.dataset.records);return;}
  const card=e.target.closest('[data-choice]');if(card){choose(Number(card.dataset.choice));return;}
  const button=e.target.closest('[data-ui]');if(!button)return;
  const actions={resume,close:closeModal,build:showBuild,guide:()=>showGuide(),guideClose:()=>game?.state.status==='playing'?resume():closeModal(),records:()=>showRecords(),result:showResult,reroll,prepared:beginPrepared,previous:retryPrevious,retry:()=>startRun(game.seed),new:()=>startRun(''),home:goHome,abandon:()=>{modal('<p class="modal-eyebrow">ABANDON RUN</p><h2>이 런을 끝낼까요?</h2><p class="modal-copy">현재 보드와 모든 누적 선택이 사라집니다.</p><div class="modal-actions"><button class="danger" data-ui="home">런 끝내기</button><button class="primary" data-ui="resume">계속하기</button></div>','abandon',true);}};
  actions[button.dataset.ui]?.();
});
for(const button of document.querySelectorAll('[data-act]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);audio.unlock();const a=button.dataset.act;if(a==='left'||a==='right'){direction=a==='left'?-1:1;dirAge=0;dirRepeats=0;}act(a);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{direction=0;dirAge=0;dirRepeats=0;});
}
updateUi();requestAnimationFrame(frame);
