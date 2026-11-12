import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {UPGRADES,BURDENS,RULES_VERSION} from '../src/core.mjs';

// A small DOM adapter exercises the real delegated handlers and frame loop.
// Its DOMTokenList deliberately rejects empty tokens, as browsers do.
function harness(){
  const drawn=[],positions=[];let nextFrame;const windowEvents=new Map();let appWidth=390;const storage=new Map(),elements=new Map(),listeners=new Map();
  const noop=()=>{};
  const ctx=new Proxy({fillText:(value,x,y)=>{drawn.push(String(value));positions.push({value:String(value),x,y});},measureText:text=>({width:String(text).length*7}),
    createRadialGradient:()=>({addColorStop:noop}),createLinearGradient:()=>({addColorStop:noop})},
    {get:(target,key)=>key in target?target[key]:noop});
  const doc={activeElement:null,hidden:false,
    getElementById:id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);},
    querySelector:()=>({clientWidth:appWidth}),querySelectorAll:()=>[],addEventListener:(type,fn)=>{listeners.set(type,fn);}};
  class Element{
    constructor(id=''){
      this.id=id;this.innerHTML='';this.textContent='';this.value='';this.dataset={};this.hidden=false;
      this.style={};this.parentElement={style:{}};this.attributes={};this.events=new Map();const tokens=new Set();
      this.classList={add:(...names)=>{for(const name of names){if(!name||/\s/.test(name))throw new DOMException('Invalid token','SyntaxError');tokens.add(name);}},remove:(...names)=>names.forEach(n=>tokens.delete(n)),contains:n=>tokens.has(n)};
    }
    setAttribute(key,value){this.attributes[key]=value;}
    focus(){doc.activeElement=this;}
    getContext(){return ctx;}
    addEventListener(type,fn){this.events.set(type,fn);}
    querySelector(selector){return selector==='h2'&&this.innerHTML.includes('<h2>')?new Element('heading'):null;}
    querySelectorAll(){return [];}
    closest(selector){return Object.entries(this.dataset).some(([key])=>selector===`[data-${key}]`)?this:null;}
  }
  const globals={document:doc,window:{addEventListener:(type,fn)=>windowEvents.set(type,fn)},innerWidth:390,innerHeight:844,devicePixelRatio:1,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{nextFrame=fn;},HTMLInputElement:class{}};
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const click=(key,value)=>{
    const panel=doc.getElementById('modalContent');
    assert.ok(panel.innerHTML.includes(`data-${key}="${value}"`),`visible ${key}=${value} control exists`);
    const target=new Element();target.dataset[key]=value;
    doc.getElementById('modal').events.get('click')({target});
  };
  return {doc,storage,drawn,positions,click,key:code=>{listeners.get('keydown')({code,target:doc.getElementById('gameCanvas'),preventDefault(){},repeat:false});listeners.get('keyup')({code});},resize:(width,height)=>{appWidth=Math.min(width,1220);globalThis.innerWidth=width;globalThis.innerHeight=height;windowEvents.get('resize')();},frame:ms=>{assert.ok(nextFrame);const fn=nextFrame;nextFrame=null;fn(ms);},
    restore:()=>{for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}};
}


test('PC keeps HP until impact, exposes a large success badge and previews only real quad clears',async()=>{
  const h=harness();
  try{
    const {startRun,getGame,previewClearLines}=await import('../src/main.mjs?pc-ui-204');
    h.resize(1280,900);startRun('pc-impact');const g=getGame(),maximum=g.state.boss.hp;
    g.state.boss.remaining=1;g.state.burdens.regen=1;
    h.frame(0);
    g.state.board=Array.from({length:20},()=>Array(10).fill(null));g.state.tags=Array(20).fill(null);
    g.state.board[19].fill('G');for(let x=3;x<7;x++)g.state.board[19][x]=null;
    g.state.active={type:'I',rotation:0,x:3,y:18};h.key('Space');
    const remaining=g.state.boss.hp;assert.equal(remaining,maximum-10+Math.floor(maximum*.005+.5),'same-lock regeneration is preserved at impact');
    h.drawn.length=0;h.frame(16);assert.ok(h.drawn.includes(`${maximum.toLocaleString()} / ${maximum.toLocaleString()}`));
    assert.ok(!h.drawn.includes(`${remaining.toLocaleString()} / ${maximum.toLocaleString()}`));
    h.drawn.length=0;h.frame(160);assert.ok(h.drawn.includes(`${maximum.toLocaleString()} / ${maximum.toLocaleString()}`));
    h.drawn.length=0;h.frame(192);assert.ok(h.drawn.includes(`${remaining.toLocaleString()} / ${maximum.toLocaleString()}`));
    for(const label of ['MOMENTUM','FOCUS','COMBO / 연쇄','구역을 넘어 유지 · 피해량 변화 없음'])assert.ok(h.drawn.includes(label));
    g.state.board=Array.from({length:20},()=>Array(10).fill(null));g.state.tags=Array(20).fill(null);
    for(let row=16;row<20;row++){g.state.board[row].fill('G');g.state.board[row][4]=null;}
    g.state.active={type:'I',rotation:1,x:2,y:16};const before=JSON.stringify(g.state);
    assert.equal(previewClearLines(g.state,g.ghostY()),4);assert.equal(JSON.stringify(g.state),before);
    h.drawn.length=0;h.frame(208);assert.ok(h.drawn.includes('QUAD READY / 4줄 준비'));
    g.state.board[19][0]=null;assert.equal(previewClearLines(g.state,g.ghostY()),3);
    h.doc.getElementById('guideBtn').onclick();h.click('guide','rules');
    for(const phrase of ['PC · 기세가 전장을 바꿉니다','16·20·24','추가 피해나 조작 대기는 없습니다'])assert.ok(h.doc.getElementById('modalContent').innerHTML.includes(phrase));
  }finally{h.restore();}
});

test('PC finishing blow waits for its complete collapse while portrait retains the short gate',async()=>{
  const h=harness();
  try{
    const {startRun,getGame}=await import('../src/main.mjs?pc-kill-ui-204');
    const el=id=>h.doc.getElementById(id);
    function kill(){
      const g=getGame();g.state.upgrades.single=100;
      g.state.board=Array.from({length:20},()=>Array(10).fill(null));g.state.tags=Array(20).fill(null);
      g.state.board[19].fill('G');for(let x=3;x<7;x++)g.state.board[19][x]=null;
      g.state.active={type:'I',rotation:0,x:3,y:18};h.key('Space');assert.equal(g.state.status,'reward');
    }
    h.resize(1280,900);startRun('pc-kill');h.frame(0);kill();
    for(const ms of [100,200,300,400,500,600,700,800,900,1000,1100])h.frame(ms);
    assert.equal(el('modal').hidden,true,'PC collapse remains visible beyond the old 400ms gate');
    h.frame(1130);assert.equal(el('modal').hidden,false);assert.ok(el('modalContent').innerHTML.includes('data-choice'));
    h.resize(390,844);startRun('mobile-kill');h.frame(0);kill();
    h.frame(200);h.frame(410);assert.equal(el('modal').hidden,false,'portrait keeps the existing 400ms transition');
  }finally{h.restore();}
});

test('PC success card moves to the far edge and expires through rapid clears while small HUD remains',async()=>{
  const h=harness();
  try{
    const {startRun,getGame}=await import('../src/main.mjs?pc-fade-205');
    h.resize(1280,900);startRun('pc-fade');const g=getGame();g.state.boss.hp=g.state.boss.maxHp=1000000;g.state.boss.remaining=9999;
    const single=()=>{
      g.state.board=Array.from({length:20},()=>Array(10).fill(null));g.state.tags=Array(20).fill(null);
      g.state.board[19].fill('G');for(let x=3;x<7;x++)g.state.board[19][x]=null;
      g.state.active={type:'I',rotation:0,x:3,y:18};h.key('Space');
    };
    h.frame(0);single();h.frame(16);
    assert.ok(h.positions.some(p=>p.value==='MOMENTUM'&&p.x===960&&p.y===520));
    assert.ok(!h.positions.some(p=>p.value==='MOMENTUM'&&p.x<900));
    for(let i=1;i<=10;i++){single();h.frame(i*100);}
    h.drawn.length=0;h.frame(1100);
    assert.ok(!h.drawn.includes('MOMENTUM'),'rapid clears do not keep the large card visible');
    assert.ok(h.drawn.includes('MOMENTUM / 기세 · 연출'));assert.ok(h.drawn.includes('11 COMBO'));
    h.frame(1200);h.frame(1300);h.drawn.length=0;single();h.frame(1316);
    assert.ok(h.drawn.includes('MOMENTUM'),'a new success can appear after the quiet gap');
  }finally{h.restore();}
});
