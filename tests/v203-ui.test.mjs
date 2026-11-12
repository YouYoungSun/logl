import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {UPGRADES,BURDENS,RULES_VERSION} from '../src/core.mjs';

// A small DOM adapter exercises the real delegated handlers and frame loop.
// Its DOMTokenList deliberately rejects empty tokens, as browsers do.
function harness(){
  const drawn=[];let nextFrame;const windowEvents=new Map();let appWidth=390;const storage=new Map(),elements=new Map(),listeners=new Map();
  const noop=()=>{};
  const ctx=new Proxy({fillText:(value)=>drawn.push(String(value)),measureText:text=>({width:String(text).length*7}),
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
    matchMedia:()=>({matches:true}),requestAnimationFrame:fn=>{nextFrame=fn;},HTMLInputElement:class{}};
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const click=(key,value)=>{
    const panel=doc.getElementById('modalContent');
    assert.ok(panel.innerHTML.includes(`data-${key}="${value}"`),`visible ${key}=${value} control exists`);
    const target=new Element();target.dataset[key]=value;
    doc.getElementById('modal').events.get('click')({target});
  };
  return {doc,storage,drawn,click,key:code=>{listeners.get('keydown')({code,target:doc.getElementById('gameCanvas'),preventDefault(){},repeat:false});listeners.get('keyup')({code});},resize:(width,height)=>{appWidth=Math.min(width,1220);globalThis.innerWidth=width;globalThis.innerHeight=height;windowEvents.get('resize')();},frame:ms=>{assert.ok(nextFrame);const fn=nextFrame;nextFrame=null;fn(ms);},
    restore:()=>{for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}};
}

test('momentum guide and live HUD distinguish persistent momentum from a broken combo',async()=>{
  const h=harness();
  try{
    const {startRun,getGame}=await import('../src/main.mjs?momentum-ui-203');
    const el=id=>h.doc.getElementById(id);
    el('guideBtn').onclick();h.click('guide','rules');
    const guide=el('modalContent').innerHTML;
    for(const wording of ['기세 +1','구역 이동에도 유지','피해량은 바뀌지 않습니다','OVERDRIVE','착지 보조 빌드'])assert.ok(guide.includes(wording));
    h.click('ui','guideClose');startRun('momentum-ui');const g=getGame();
    g.state.boss.hp=g.state.boss.maxHp=100000;g.state.boss.remaining=999;
    function fixture(clear){
      g.state.board=Array.from({length:20},()=>Array(10).fill(null));g.state.tags=Array(20).fill(null);
      if(clear){g.state.board[19].fill('G');for(let x=3;x<7;x++)g.state.board[19][x]=null;g.state.active={type:'I',rotation:0,x:3,y:18};}
      else g.state.active={type:'O',rotation:0,x:3,y:18};
      h.key('Space');
    }
    h.frame(0);fixture(true);h.frame(16);
    assert.equal(g.state.momentum,1);assert.ok(h.drawn.includes('FOCUS'));assert.ok(h.drawn.includes('피해량 변화 없음'));
    fixture(false);h.frame(32);assert.equal(g.state.combo,0);assert.equal(g.state.momentum,1);
    assert.ok(h.drawn.includes('콤보 대기'));
    for(let n=1;n<12;n++){fixture(true);h.frame(32+n*16);}
    assert.equal(g.state.momentum,12);assert.ok(h.drawn.includes('OVERDRIVE'));
    const before=JSON.stringify(g.state);h.resize(1280,900);assert.equal(JSON.stringify(g.state),before);
    h.frame(224);assert.ok(h.drawn.includes('MOMENTUM / 기세 · 연출'));
    assert.ok(h.drawn.includes('구역을 넘어 유지 · 피해량 변화 없음'));
    g._die('test');h.frame(240);assert.equal(g.state.momentum,0);assert.equal(el('deathNotice').hidden,false);
    el('deathContinue').onclick();assert.ok(el('modalContent').innerHTML.includes('최고 기세 12'));
  }finally{h.restore();}
});

