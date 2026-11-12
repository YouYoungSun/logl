import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioDirector} from '../src/audio.mjs';

function setup(){
  const calls=[],oscillators=[],noise=[];
  const noop=()=>{},parameter=label=>({value:0,setValueAtTime:(v,t)=>calls.push([label,v,t]),linearRampToValueAtTime:noop,exponentialRampToValueAtTime:noop});
  const audio=new AudioDirector();audio.master={};audio.noise={};
  audio.ctx={state:'running',currentTime:1,
    createOscillator:()=>{const o={frequency:parameter('pitch'),connect:noop,disconnect:noop,start:noop,stops:0,stop(){this.stops++;}};oscillators.push(o);return o;},
    createGain:()=>({gain:parameter('gain'),connect:noop,disconnect:noop}),
    createBiquadFilter:()=>({frequency:parameter('filter'),connect:noop,disconnect:noop}),
    createBufferSource:()=>{const n={connect:noop,disconnect:noop,start:noop,stops:0,stop(){this.stops++;}};noise.push(n);return n;}};
  return {audio,calls,oscillators,noise};
}

test('line counts have distinct weighted hit sounds while voice count and pitch stay bounded',()=>{
  const {audio,calls,noise}=setup();
  for(const lines of [1,2,3,4])audio.play('hit',1,{lines,combo:3});
  const pitches=calls.filter(c=>c[0]==='pitch').map(c=>c[1]);
  assert.equal(new Set(pitches).size,4);assert.ok(pitches.every((p,i)=>i===0||p<pitches[i-1]));
  assert.equal(noise.length,3,'single-line hits remain clean; multi-line hits have a short texture');
  for(let i=0;i<30;i++)audio.play('hit',4,{lines:4,combo:100});
  assert.ok(audio.voices.length<=4);
  assert.ok(calls.filter(c=>c[0]==='gain').every(c=>c[1]<=.18));
  audio.play('hit',4,{lines:4,combo:6});const capped=calls.filter(c=>c[0]==='pitch').at(-1)[1];
  audio.play('hit',4,{lines:4,combo:100});assert.equal(calls.filter(c=>c[0]==='pitch').at(-1)[1],capped);
});

test('pause/sound-off also stops the noise layer and muted audio creates no new voices',()=>{
  const {audio,noise,oscillators}=setup();audio.play('hit',1,{lines:4});
  const before=noise[0].stops;audio.setEnabled(false);
  assert.ok(noise[0].stops>before);assert.ok(oscillators[0].stops>=2);
  assert.equal(audio.voices.length,0);audio.play('hit',1,{lines:4});assert.equal(noise.length,1);
});
