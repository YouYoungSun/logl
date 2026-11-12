import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {UPGRADES,BURDENS,RULES_VERSION} from '../src/core.mjs';

// A small DOM adapter exercises the real delegated handlers and frame loop.
// Its DOMTokenList deliberately rejects empty tokens, as browsers do.
function harness(){
  const drawn=[];let nextFrame;const storage=new Map(),elements=new Map(),listeners=new Map();
  const noop=()=>{};
  const ctx=new Proxy({fillText:(value)=>drawn.push(String(value)),measureText:text=>({width:String(text).length*7}),
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
  return {doc,storage,drawn,click,frame:ms=>{assert.ok(nextFrame);const fn=nextFrame;nextFrame=null;fn(ms);},
    restore:()=>{for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}};
}


test('2.0.1 guide, role cards and final landing time follow current definitions',async()=>{
  const h=harness();
  try{
    const {startRun,getGame}=await import('../src/main.mjs?v201-role-ui');
    const el=id=>h.doc.getElementById(id);
    h.frame(0);el('guideBtn').onclick();
    let html=el('modalContent').innerHTML;
    assert.ok(html.includes(`VER ${RULES_VERSION}`));
    assert.ok(html.includes(UPGRADES.guard.label));
    assert.ok(html.includes(UPGRADES.landing.label));
    assert.ok(html.includes('role-defense'));assert.ok(html.includes('role-control'));
    assert.ok(!html.includes('4줄 재공격'));assert.ok(!html.includes('연쇄 종료 충전'));
    h.click('guide','debuffs');html=el('modalContent').innerHTML;
    assert.ok(html.includes('디버프 7개'));
    assert.ok(html.includes(BURDENS.reinforcement.description(1)));
    assert.ok(html.includes('첫 번째·두 번째 공격과 초반 방해 행 추가에는 적용되지 않습니다.'));
    h.click('guide','rules');html=el('modalContent').innerHTML;
    assert.ok(html.includes('2줄 제거와 2 COMBO는 다릅니다'));
    assert.ok(html.includes('연쇄는 시간으로 끊기지 않습니다'));
    assert.ok(html.includes('9구역 사망 → 8구역 재도전'));
    h.click('ui','guideClose');
    startRun('role-card',{startStage:8,mode:'assisted'});const g=getGame();
    h.click('ui','reroll');
    // Render the real reward screen with known candidates after the page turn.
    g.state.upgrades.landing=1;g.state.burdens.rigidity=1;
    g.state.offers=[{upgrade:'landing',burden:'reinforcement'},{upgrade:'guard',burden:'vitality'},{upgrade:'single',burden:'dampen'}];
    await delay(10);html=el('modalContent').innerHTML;
    assert.ok(html.includes('착지 조작 여유 0.615초'));
    assert.ok(html.includes('매 3번째 공격에 방해 +1행'));
    assert.ok(html.includes('role-defense'));assert.ok(html.includes('role-control'));
    assert.ok(html.includes('버프 · 유리한 효과'));assert.ok(html.includes('디버프 · 함께 받는 불이익'));
    assert.ok(html.includes('공격 예고가 01'));
    h.click('choice','1');await delay(10);
    while(g.state.status==='rebuild'){h.click('choice','0');await delay(10);}
    h.click('ui','prepared');h.frame(16);h.frame(32);
    assert.ok(h.drawn.some(t=>t.includes('공격 1회째')));
    assert.ok(h.drawn.some(t=>t.includes('착지 여유')));
  }finally{h.restore();}
});

test('2.0.1 record writes preserve older rules while showing only the current version',async()=>{
  const h=harness();
  try{
    const legacy={version:'2.0.0',mode:'standard',seed:'LEGACY-RECORD',cleared:4,progress:.5,seconds:20,locks:40};
    h.storage.set('faultline.records.v2',JSON.stringify([legacy]));
    const {startRun,getGame}=await import('../src/main.mjs?v201-records-ui');
    const el=id=>h.doc.getElementById(id);
    h.frame(0);startRun('CURRENT-RECORD');getGame()._die('record check');h.frame(16);
    el('deathContinue').onclick();
    const records=JSON.parse(h.storage.get('faultline.records.v2'));
    assert.ok(records.some(r=>r.version==='2.0.0'&&r.seed==='LEGACY-RECORD'));
    assert.ok(records.some(r=>r.version===RULES_VERSION&&r.seed==='CURRENT-RECORD'));
    h.click('ui','records');const html=el('modalContent').innerHTML;
    assert.ok(html.includes(`현재 규칙 ${RULES_VERSION}의 기록만 보여줍니다.`));
    assert.ok(html.includes('CURRENT-RECORD'));assert.ok(!html.includes('LEGACY-RECORD'));
  }finally{h.restore();}
});
