// AUDIT 59 - ENHANCED AI, BEFORE THE MERGE (2026-09-04, Mac: "Lets do a
// comprehensive audit on enhanced AI before we merge"). The arc came
// back by reverting its revert; this audit reads it against today's
// tree and the production BUILD, which no node test had looked at. Four
// findings, all fixed here and pinned below; the sweeps that came back
// clean are recorded in bible/01-Overview/audits/Audit-59.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EnhancedEnemyAI, makeNavWorld } from '../../src/ai/enhancedMotor.js';

const read = (p) => readFileSync(p, 'utf8');

// ROAD-H H7a (2026-09-07): THE WALK THAT READS A WHOLE FUNCTION.
//
// F2's pin below used to read `destroy()` as `src.slice(at, at + 3000)`.
// The function is ~3770 characters, so the window stopped four fifths
// of the way through the body it claims to read, and every line the
// teardown gains moves more of the tail out of view - a pin that reads
// less of its subject each time the subject grows. The three ordering
// assertions all happen to sit in the first 1800 characters TODAY;
// nothing kept them there, and `indexOf` on a truncated body answers
// -1, which reads as "the code moved" whether it moved or not.
//
// Read the body by BALANCED BRACES instead. This is audit24_wave37's
// `statementAt` walk (the same idiom audit24_wave46 and g3_heldorder
// use), copied with its `decomment`: only comments are stripped, since
// this port's prose carries brackets constantly and a gate that trips
// on a sentence is noise, not a gate. Offsets into the returned body
// are the same offsets `slice(at, ...)` gave, so the "outside the
// 500-char window" assertion keeps its meaning exactly.
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function statementAt(src, needle) {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l.includes(needle));
  assert.ok(start >= 0, `no line matching ${needle}`);
  let depth = 0;
  const out = [];
  for (let i = start; i < lines.length; i++) {
    out.push(lines[i]);
    for (const ch of decomment(lines[i])) {
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
    }
    if (depth <= 0) return out.join('\n');
  }
  assert.fail(`unbalanced statement at ${needle}`);
  return '';
}

test('AUDIT 59 F1: a worker double is constructed through WorkerCtor and the bake goes to it', async () => {
  const { NavClient } = await import('../../src/ai/nav/navClient.js');
  const made = [];
  class FakeWorker {
    constructor(url, opts) { made.push([url, opts]); this.onmessage = null; this.onerror = null; }
    postMessage(m) { this.posted = m; setTimeout(() => this.onmessage?.({ data: { t: 'error', id: m.id, message: 'double' } }), 0); }
    terminate() { this.terminated = true; }
  }
  const client = new NavClient({ store: null, WorkerCtor: FakeWorker });
  assert.deepEqual(made, [['./navWorker.js', { type: 'module' }]], 'the double is built, with the module option');
  assert.ok(client._worker instanceof FakeWorker);
  client.dispose();
  assert.equal(client._worker, null, 'dispose drops it');
  assert.ok(made.length === 1);
});

test('AUDIT 59 F4: the route\'s vertical is never steered at, whatever y findPath answers', () => {
  // the premise the adaptation was written on (a colliderless chf ->
  // y = 0) was wrong; the law it produced still holds and is what
  // matters: a corner takes the foe’s y, the goal takes the goal’s
  const collider = { move() {}, raycast() { return Infinity; }, penetrationAt() { return 0; }, heightAt() { return 0; } };
  const mk = (shape) => {
    const foe = new EnhancedEnemyAI(collider, [0, 7, 0], 0, { nav: () => ({}), navWorld: makeNavWorld(), ...shape });
    foe.path = [[0, -3, 0], [5, -3, 0], [10, 42, 0]];   // a route whose y is the phantom floor, then nonsense
    foe.pathI = 1;
    foe.avoidObstaclesTimer = 0;
    foe.stopDistance = 2.25;
    foe.predictedTargetPos = [10, 7.5, 0];
    return foe;
  };
  // AUDIT 62 F1: the GOAL's y is not the predicted position's raw feet -
  // it is what GetDestination's clear-path arm builds from it
  // (EnemyMotor.cs:541 destination = PredictedTargetPos, :543-544 the
  // flyer/levitator/slaughterfish face bump of targetController.height *
  // 0.5f, :559-564 the grounded foe's (targetController.height -
  // originalHeight) / 2), converted back to feet once. Against the
  // PLAYER, targetController.height is 1.8 and its transform sits 0.9
  // over its feet, so from predicted feet 7.5 the source's own numbers
  // are: a flyer 7.5 + 0.9 + 0.9 - its 0.9 centre = 8.4; a rat-shaped
  // walker (1.0 sprite -> 1.6 capsule) 7.5 + 0.9 - 0.1 - 0.5 = 7.8; and
  // a foe whose capsule IS its sprite 7.5 + 0.9 - 0 - 0.9 = 7.5, the one
  // shape for which the raw feet happen to be right.
  for (const [what, shape, goalY] of [
    ['a bat (Flying, 1.8 sprite -> 1.6 capsule)', { behaviour: 'Flying', height: 1.6, centreOffset: 0.9 }, 8.4],
    ['a rat (1.0 sprite -> 1.6 capsule)', { behaviour: 'General', height: 1.6, centreOffset: 0.5 }, 7.8],
    ['an orc (capsule == sprite)', { behaviour: 'General', height: 1.8, centreOffset: 0.9 }, 7.5],
  ]) {
    const foe = mk(shape);
    foe._getDestination([10, 7.5, 0]);
    assert.equal(foe.destination[1], 7, `${what} - a corner: the foe's own y, not the route's`);
    foe.feet = [9, 7, 0]; foe.lastX = 9;
    foe.pathI = 2;
    foe._getDestination([10, 7.5, 0]);
    assert.ok(Math.abs(foe.destination[1] - goalY) < 1e-9,
      `${what} - the goal took y ${foe.destination[1]}; EnemyMotor.cs:541-564 says ${goalY}`);
  }
});
