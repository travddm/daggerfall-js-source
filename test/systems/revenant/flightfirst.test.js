// FLIGHT-FIRST. A foe's walk (4.5-6 m/s) never outran a running player (8.1 m/s at Speed and Running 50), so every
// flight was run down and knelt; and a foe that broke while circling kept the brain's ring step and ran on round the
// ring in reach. Now every special foe's run is twice its walk, a run spent past 12 m is an escape, and the flee drops
// the brain's step. Pinned: the roll and the line, the run's pace through a real motor, the step dropped, and the
// cornered line.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const N = await import('../../../src/systems/revenant/revenant.js');
const { EnemyAI } = await import('../../../src/characters/enemy/enemyMotor.js');
const { Collider } = await import('../../../src/player/collider.js');
const { runSpeed } = await import('../../../src/player/motor.js');
const { setPref } = await import('../../../src/systems/uiPrefs.js');
const { MOBILE_TYPES: M } = await import('../../../src/characters/mobile/mobileTypes.js');

setPref('lootRarity', true);
const orc = (over = {}) => ({ mobileType: M.Orc, level: 10, health: 60, maxHealth: 60, team: 'Monster', champion: 'mighty', ...over });
const rev = (rank, over = {}) => orc({ champion: undefined, revenant: { id: `ff-${rank}`, rank }, ...over });

test('FLIGHT-FIRST THE ROLL AND THE LINE: a special foe runs at a fifth of its health on a small chance, a revenant already on a larger one (mutants: a number moved)', () => {
  assert.equal(N.REVENANT_FLEE_HEALTH, 0.2);
  assert.deepEqual([N.REVENANT_FLEE_CHANCE, N.REVENANT_FLEE_CHANCE_REVENANT], [0.05, 0.15]);
  const runs = (e, roll) => N.rollRevenantFlee(e, () => roll);
  assert.deepEqual([runs(orc(), 0.049), runs(orc(), 0.051)], [true, false], 'a champion: one in twenty');
  for (const rank of [1, 3, 5]) assert.deepEqual([runs(rev(rank), 0.149), runs(rev(rank), 0.151)], [true, false], `rank ${rank}: a revenant already`);
  const under = (e, share) => N.revenantFleeHealth({ ...e, health: e.maxHealth * share });
  for (const e of [orc(), rev(1), rev(5)]) assert.deepEqual([under(e, 0.19), under(e, 0.21)], [true, false], 'a fifth');
  assert.equal(under(rev(1), 0), false, 'a dead one never');
});

test('FLIGHT-FIRST THE RUN: the flee law starts the motor\'s run at REVENANT_FLEE_PACE - twice its walk, through a real motor; every other run (the watch, a scattered band) at its walk (mutants: the pace unpassed; the motor\'s walk unpaced; the pace kept past a later run)', () => {
  assert.equal(N.REVENANT_FLEE_PACE, 2);
  const asked = [];
  const f = { entity: rev(1, { health: 10 }), ai: { feet: [0, 0, 0], isHostile: true, fleeLeft: 0, flee(...a) { asked.push(a); this.fleeLeft = a[1]; } } };
  assert.equal(N.revenantFleeStep(f, [0, 0, 0], { rolls: () => 0 }), 'start');
  assert.deepEqual(asked, [[[0, 0, 0], N.REVENANT_FLEE_SECONDS, N.REVENANT_FLEE_PACE]]);
  const ran = (pace) => {
    const ai = new EnemyAI(new Collider(() => 0), [0, 0, 4], 0, { vitals: () => orc(), liveSpeed: () => 50 });
    if (pace == null) ai.flee([0, 0, 0], 4); else ai.flee([0, 0, 0], 4, pace);
    for (let i = 0; i < 120; i++) ai.update(1 / 60, [0, 0, 0]);
    return { z: ai.feet[2] - 4, speed: ai.speed, pace: ai.fleePace };
  };
  const walk = ran(), run = ran(N.REVENANT_FLEE_PACE);
  assert.equal(walk.pace, 1);
  assert.ok(walk.z > walk.speed * 1.9 && walk.z <= walk.speed * 2, `its walk: ${walk.z.toFixed(2)} m in 2 s (its first classic tick still)`);
  assert.ok(Math.abs(run.z / walk.z - 2) < 0.01, `running for its life: ${run.z.toFixed(2)} m, twice its walk`);
  assert.ok(run.speed * N.REVENANT_FLEE_PACE > runSpeed(50, 50), 'faster than a player running at Speed and Running 50');
  const again = new EnemyAI(new Collider(() => 0), [0, 0, 4], 0, { vitals: () => orc(), liveSpeed: () => 50 });
  again.flee([0, 0, 0], 1, 2); again.flee([0, 0, 0], 1);
  assert.equal(again.fleePace, 1, 'a later run at its walk again');
});

test('FLIGHT-FIRST THE FAULT: a foe that breaks while the brain steps it (round the ring, backing off) runs straight away - the flee drops the brain\'s step (mutants: the step kept)', () => {
  const ai = new EnemyAI(new Collider(() => 0), [0, 0, 4], 0, { vitals: () => orc(), liveSpeed: () => 50 });
  ai._tacDir = [1, 0]; ai._tacSpeed = 0.5;   // TACT2's ring: sideways, at half its walk
  ai.flee([0, 0, 0], 4, N.REVENANT_FLEE_PACE);
  assert.equal(ai._tacDir, null);
  assert.equal(ai._tacSpeed, 1);
  for (let i = 0; i < 60; i++) ai.update(1 / 60, [0, 0, 0]);
  assert.ok(Math.abs(ai.feet[0]) < 0.01, `no sideways step (${ai.feet[0].toFixed(3)})`);
  assert.ok(ai.feet[2] - 4 > ai.speed * N.REVENANT_FLEE_PACE * 0.9, `away at its run (${(ai.feet[2] - 4).toFixed(2)} m in 1 s)`);
});

test('FLIGHT-FIRST THE CORNER: its run spent within 12 m it is cornered, past it escaped (mutants: the line moved back to 20)', () => {
  assert.equal(N.REVENANT_ESCAPE_NEAR, 12);
  const spent = (d) => {
    const f = { entity: rev(1, { health: 10 }), ai: { feet: [0, 0, 0], isHostile: true, fleeLeft: 0, flee(_, s) { this.fleeLeft = s; } } };
    N.revenantFleeStep(f, [0, 0, 0], { rolls: () => 0 });
    f.ai.fleeLeft = 0;
    return N.revenantFleeStep(f, [d, 0, 0]);
  };
  assert.deepEqual([spent(11.9), spent(12.1), spent(19)], ['cornered', 'escape', 'escape']);
});
