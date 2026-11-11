import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {UPGRADES,BURDENS,RULES_VERSION} from '../src/core.mjs';

// A small DOM adapter exercises the real delegated handlers and frame loop.
// Its DOMTokenList deliberately rejects empty tokens, as browsers do.
function harness(){
  let nextFrame;const storage=new Map(),elements=new Map(),listeners=new Map();
  const noop=()=>{};
  const ctx=new Proxy({measureText:text=>({width:String(text).length*7}),
    createRadialGradient:()=>({addColorStop:noop}),createLinearGradient:()=>({addColorStop:noop})},
    {get:(target,key)=>key in target?target[key]:noop});
  const doc={activeElement:null,hidden:false,
    getElementById:id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);},
    querySelectorAll:()=>[],addEventListener:(type,fn)=>{listeners.set(type,fn);}};
  class Element{
    constructor(id=''){
      this.id=id;this.innerHTML='';this.textContent='';this.value='';this.dataset={};this.hidden=false;
      this.attributes={};this.events=new Map();const tokens=new Set();
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
  const globals={document:doc,window:{addEventListener:noop},devicePixelRatio:1,
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
  return {doc,storage,click,frame:ms=>{assert.ok(nextFrame);const fn=nextFrame;nextFrame=null;fn(ms);},
    restore:()=>{for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}};
}

test('UI guide, previous-sector rebuild, reroll and mode-specific saved records use actual game flow',async()=>{
  const h=harness();
  try{
    const {startRun,getGame}=await import('../src/main.mjs?ui-integration');
    const el=id=>h.doc.getElementById(id),sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
    h.frame(0);assert.equal(getGame(),null);
    el('guideBtn').onclick();
    for(const def of Object.values(UPGRADES)){
      assert.ok(el('modalContent').innerHTML.includes(def.label));
      for(let rank=1;rank<=def.max;rank++)assert.ok(el('modalContent').innerHTML.includes(def.description(rank)));
    }
    h.click('guide','debuffs');
    for(const def of Object.values(BURDENS))assert.ok(el('modalContent').innerHTML.includes(def.description(1)));
    h.click('ui','guideClose');assert.equal(el('modal').hidden,true);

    startRun('ui-retry');const old=getGame();
    old.state.stage=5;old._beginStage();old.state.upgrades.single=3;old.state.burdens.dampen=3;
    old._die('integration death');h.frame(16);
    assert.equal(el('deathNotice').hidden,false);el('deathContinue').onclick();
    assert.equal(el('deathNotice').hidden,true);
    h.click('ui','previous');const rebuilt=getGame();
    assert.notEqual(rebuilt,old);assert.equal(rebuilt.state.stage,4);
    assert.equal(rebuilt.state.status,'rebuild');assert.equal(sum(rebuilt.state.upgrades),0);
    assert.equal(sum(rebuilt.state.burdens),0);assert.equal(rebuilt.state.stats.cleared,0);
    assert.ok(el('modalContent').innerHTML.includes('버프 · 유리한 효과'));
    assert.ok(el('modalContent').innerHTML.includes('디버프 · 함께 받는 불이익'));

    const offers=structuredClone(rebuilt.state.offers);
    h.click('ui','reroll');await delay(10);
    assert.equal(rebuilt.state.rerollsLeft,0);assert.notDeepEqual(rebuilt.state.offers,offers);
    h.click('ui','reroll');await delay(10);assert.equal(rebuilt.state.rerollsLeft,0);
    for(let i=0;i<3;i++){
      assert.equal(rebuilt.state.rebuildStep,i+1);
      if(i===1){
        // Exercise the animated path as well as reduced motion. Empty class
        // tokens throw in this harness just as they do in DOMTokenList.
        el('motionBtn').onclick();
        h.click('ui','reroll');await delay(180);
        assert.equal(rebuilt.state.rerollsLeft,0);
        assert.equal(el('modalContent').classList.contains('page-entering'),true);
        el('motionBtn').onclick();
      }
      h.click('choice','0');await delay(10);
      assert.equal(sum(rebuilt.state.upgrades),i+1);assert.equal(sum(rebuilt.state.burdens),i+1);
    }
    assert.equal(rebuilt.state.status,'ready');assert.equal(rebuilt.state.active,null);
    h.click('ui','prepared');assert.equal(rebuilt.state.status,'playing');
    assert.equal(rebuilt.state.stage,4);assert.ok(rebuilt.state.active);
    h.frame(32);h.frame(48);

    // A real fourth-sector victory counts one actual kill, then death records
    // the assisted route separately from the original first-sector run.
    rebuilt._victory();assert.equal(rebuilt.state.stats.cleared,1);
    assert.equal(rebuilt.choose(0),true);assert.equal(rebuilt.state.stage,5);
    rebuilt._die('second integration death');h.frame(64);el('deathContinue').onclick();
    const saved=JSON.parse(h.storage.get('faultline.records.v2'));
    assert.equal(saved.length,2);
    assert.ok(saved.some(row=>row.mode==='standard'&&row.cleared===0&&row.version===RULES_VERSION));
    assert.ok(saved.some(row=>row.mode==='assisted'&&row.startStage===4&&row.cleared===1&&row.stage===5));
  }finally{h.restore();}
});
