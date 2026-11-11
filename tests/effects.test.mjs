import test from 'node:test';
import assert from 'node:assert/strict';
import { Effects } from '../src/fx.mjs';

const layout = { board: { x: 150, y: 60, cell: 27 } };
const target = { x: 715, y: 335 };

function clear(overrides = {}) {
  return {
    type: 'clear', bossId: 3, seq: 2,
    rows: [{ row: 19, colors: Array(10).fill('I') }],
    lines: 1, combo: 1, chargeUsed: 0, damage: 12,
    hpBefore: 30, hpAfter: 18, killed: false, ...overrides,
  };
}

function setup() {
  const sounds = [];
  const effects = new Effects({ play: (...args) => sounds.push(args) });
  effects.reset(3);
  return { effects, sounds };
}

// Records Canvas operations and rejects invalid drawing coordinates immediately.
function canvas() {
  const calls = [];
  let depth = 0;
  const ctx = new Proxy({
    save() { depth++; },
    restore() { assert.ok(depth > 0, 'restore must have a matching save'); depth--; },
  }, {
    get(object, name) {
      if (name in object) return object[name];
      return (...args) => {
        for (const value of args) {
          if (typeof value === 'number') assert.ok(Number.isFinite(value), `${String(name)} has a finite coordinate`);
        }
        calls.push({ name, args });
      };
    },
  });
  return { ctx, calls, assertBalanced: () => assert.equal(depth, 0) };
}

function render(effects, options) {
  const recording = canvas();
  effects.draw(recording.ctx, layout, target, options);
  recording.assertBalanced();
  return recording.calls;
}

test('deleted cells gather for 60ms, then one projectile accelerates toward the boss before 180ms impact', () => {
  const { effects, sounds } = setup();
  effects.consume([clear()]);
  const initial = render(effects).filter(c => c.name === 'fillRect');
  assert.equal(initial.length, 10);
  assert.equal(initial[0].args[0] + initial[0].args[2] / 2, 163.5);
  effects.update(.03);
  const gathering = render(effects).filter(c => c.name === 'fillRect');
  assert.equal(gathering.length, 10);
  assert.ok(gathering[0].args[0] > initial[0].args[0]);
  effects.update(.03);
  const launch = render(effects).filter(c => c.name === 'fillRect');
  assert.equal(launch.length, 1);
  assert.equal(launch[0].args[0] + launch[0].args[2] / 2, 430);
  effects.update(.119);
  const arriving = render(effects).filter(c => c.name === 'fillRect');
  assert.ok(arriving[0].args[0] > launch[0].args[0]);
  assert.deepEqual(sounds.map(s => s[0]), ['clear']);
  assert.equal(effects.recoil.x, 0);
  effects.update(.002);
  render(effects);
  assert.deepEqual(sounds.map(s => s[0]), ['clear', 'hit']);
  assert.ok(effects.recoil.x > 0);
  assert.ok(effects.flash > 0);
  assert.ok(effects.pool.some(p => p.active && p.age === 0));
  effects.update(.01);
  assert.equal(sounds.filter(s => s[0] === 'hit').length, 1);
});

test('fatal clear exposes a 400ms presentation gate and completes death only after impact', () => {
  const { effects } = setup();
  effects.consume([clear({ killed: true, hpAfter: 0 })]);
  assert.equal(effects.victoryAt, 0);
  assert.equal(effects.readyAt, .4);
  effects.update(.18);
  assert.equal(effects.death, 0);
  effects.update(.11);
  assert.ok(Math.abs(effects.death - .5) < 1e-10);
  effects.update(.111);
  assert.equal(effects.death, 1);
  assert.ok(effects.time >= effects.readyAt);
});

test('duplicate and stale boss events cannot replay audio or attacks', () => {
  const { effects, sounds } = setup();
  const event = clear();
  effects.consume([undefined, clear({ bossId: 2, seq: 99 }), event, event]);
  assert.equal(effects.attacks.length, 1);
  assert.equal(sounds.length, 1);
  effects.consume([{ type: 'bossAttack', bossId: 3, seq: 3 }, { type: 'bossAttack', bossId: 3, seq: 3 }]);
  assert.equal(sounds.filter(s => s[0] === 'boss').length, 1);
  effects.consume([clear({ seq: 1 })]);
  assert.equal(effects.attacks.length, 1);
});

test('reset discards all presentation state and allows the next boss sequence', () => {
  const { effects } = setup();
  effects.consume([clear({ killed: true })]);
  render(effects);
  effects.update(.2);
  assert.ok(effects.pool.some(p => p.active));
  effects.reset(4);
  assert.equal(effects.time, 0);
  assert.deepEqual(effects.recoil, { x: 0, y: 0 });
  assert.equal(effects.flash, 0);
  assert.equal(effects.death, 0);
  assert.equal(effects.victoryAt, null);
  assert.equal(effects.readyAt, null);
  assert.equal(effects.attacks.length + effects.repairs.length + effects.numbers.length, 0);
  assert.ok(effects.pool.every(p => !p.active));
  effects.consume([clear(), clear({ bossId: 4, seq: 1 })]);
  assert.equal(effects.attacks.length, 1);
});

test('FX copy clear rows, preserve immutable gameplay events, and keep repair non-offensive', () => {
  const { effects, sounds } = setup();
  const event = clear();
  Object.freeze(event.rows[0].colors);
  Object.freeze(event.rows[0]);
  Object.freeze(event.rows);
  Object.freeze(event);
  const before = JSON.stringify(event);
  effects.consume([event, { type: 'repair', bossId: 3, seq: 3, row: 18 }]);
  assert.notEqual(effects.attacks[0].event.rows, event.rows);
  assert.notEqual(effects.attacks[0].event.rows[0].colors, event.rows[0].colors);
  render(effects);
  effects.update(.2);
  render(effects);
  assert.equal(JSON.stringify(event), before);
  assert.equal(effects.attacks.length, 1);
  assert.deepEqual(sounds.map(s => s[0]), ['clear', 'hit']);
});

test('draw stays balanced and finite through simultaneous rows, reduced motion and effect expiry', () => {
  const { effects } = setup();
  effects.consume([clear({ lines: 4, combo: 6, chargeUsed: 2,
    rows: [16, 17, 18, 19].map(row => ({ row, colors: Array(10).fill('T') })) })]);
  for (const dt of [0, .025, .04, .06, .06, .04, .1, .5]) {
    effects.update(dt);
    render(effects, { reducedMotion: true });
  }
  assert.equal(effects.attacks.length, 0);
  assert.equal(effects.numbers.length, 0);
  assert.ok(effects.pool.every(p => !p.active));
});
