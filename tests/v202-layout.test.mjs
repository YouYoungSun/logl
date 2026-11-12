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
  return {doc,storage,drawn,click,resize:(width,height)=>{appWidth=Math.min(width,1220);globalThis.innerWidth=width;globalThis.innerHeight=height;windowEvents.get('resize')();},frame:ms=>{assert.ok(nextFrame);const fn=nextFrame;nextFrame=null;fn(ms);},
    restore:()=>{for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}};
}

test('portrait enlarges a square 10x20 board and resizing never changes a live run',async()=>{
  const h=harness();
  try{
    const {getViewLayout,startRun,getGame}=await import('../src/main.mjs?layout-202');
    const mobile=getViewLayout(390,844,372);
    assert.equal(mobile.portrait,true);assert.ok(mobile.board.cell*10>=260);
    assert.equal(mobile.board.cols,10);assert.equal(mobile.board.rows,20);
    assert.ok(mobile.board.y+mobile.board.cell*20<mobile.height);
    for(const width of [302,342,372,412]){
      const view=getViewLayout(width+18,844,width);
      assert.ok(view.board.x>0);assert.ok(view.board.x+view.board.cell*10<view.width);
      assert.ok(view.board.cell>=19);assert.equal(view.cssWidth,view.width);
    }
    startRun('resize-state');const g=getGame();h.frame(0);
    const before=JSON.stringify(g.state);
    h.resize(1280,720);assert.equal(JSON.stringify(g.state),before);
    assert.equal(h.doc.getElementById('gameCanvas').attributes['data-layout'],'desktop');
    h.frame(16);assert.ok(h.drawn.includes('HOLD')&&h.drawn.includes('NEXT'));
    const desktop=getViewLayout(1280,720,1158);
    assert.ok(desktop.board.cell*desktop.cssWidth/desktop.width>=22);
    assert.ok(Math.abs(desktop.cssWidth/desktop.width-desktop.cssHeight/desktop.height)<1e-9);
    const again=JSON.stringify(g.state);h.resize(390,844);assert.equal(JSON.stringify(g.state),again);
    h.frame(32);assert.equal(h.doc.getElementById('gameCanvas').attributes['data-layout'],'portrait');
    assert.equal(g.state.board.length,20);assert.ok(g.state.board.every(row=>row.length===10));
  }finally{h.restore();}
});

test('portrait keeps the final-boss forecast, HOLD and concealed NEXT available',async()=>{
  const h=harness();
  try{
    const {startRun,getGame}=await import('../src/main.mjs?portrait-final-202');
    startRun('portrait-final');const g=getGame();g.state.stage=10;g._beginStage();
    g.state.boss.phase=3;g.state.boss.obscureRemaining=3;g.state.boss.obscureCooldown=12;
    g.state.upgrades.guard=1;g.state.guardLeft=1;g.state.boss.remaining=1;g._refreshBoss();
    h.frame(0);assert.ok(h.drawn.includes('HOLD'));assert.ok(h.drawn.includes('NEXT'));
    assert.equal(h.drawn.filter(t=>t==='?').length,5);
    assert.ok(h.drawn.some(t=>t.includes('공격 1회째')));
    assert.ok(h.drawn.some(t=>t.includes('차단 준비')));
  }finally{h.restore();}
});


