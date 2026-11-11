import test from 'node:test';
import assert from 'node:assert/strict';
import {DeathReview} from '../src/death-review.mjs';

test('fatal key and OS repeats cannot consume the death screen; a released fresh press can',()=>{
  const r=new DeathReview();r.open(['Space','ArrowRight']);
  assert.equal(r.keyDown('Space'),false);assert.equal(r.keyDown('ArrowRight',{repeat:true}),false);
  r.releaseKey('Space');assert.equal(r.keyDown('Space',{repeat:true}),false);
  assert.equal(r.keyDown('Space'),true);assert.equal(r.active,false);assert.equal(r.keyDown('Enter'),false);
});
test('new deliberate key works without waiting for unrelated held keys, but browser chords and focus navigation stay available',()=>{
  const r=new DeathReview();r.open(['ArrowDown']);
  for(const [code,options] of [['ShiftLeft',{}],['Tab',{}],['KeyW',{ctrlKey:true}],['KeyR',{metaKey:true}]])assert.equal(r.keyDown(code,options),false);
  assert.equal(r.keyDown('Enter'),true);
});
test('fatal touch cannot advance on release; only a subsequent pointer-down advances',()=>{
  const r=new DeathReview();r.open([], [7]);
  assert.equal(r.pointerDown(7),false);r.releasePointer(7);assert.equal(r.active,true);
  assert.equal(r.pointerDown(7),true);assert.equal(r.active,false);
  r.open();r.close();assert.equal(r.pointerDown(1),false);
});
