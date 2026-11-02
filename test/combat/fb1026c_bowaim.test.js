// BOW-AIM (FIELD BUGS 2026-10-26c, feature-feedback via;
// ) - THE THIRD-PERSON BODY AIMS A RANGED WEAPON WHERE ITS OWNER LOOKS
// (combat/spineAim.js): two spine bones turned by half the pitch each, and the pitch weight. On the
// vendored retail biped (test/fixtures/mw/retailRig.mjs).
//
// What is pinned: the pitch weight's law; the turn in the ACTOR ROOT's frame, laid on
// spine1 and spine2 so the chest and everything above it carry the whole pitch about the root's X, + down; the
// conjugation in this port's column convention (mwFirstPerson.js rootSpaceTurn - the letters' copy of OSG's row-vector
// line tipped the chest the other way, about a skewed axis); the slot in poseAssembly, after the neck and before the body
// motion, which keeps the clip's pitched chest while the clip has a bow's arms; and the wiring in combat/fpArm.js - the
// third-person body's pose alone, the look's pitch negated into Morrowind's.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, injectSkeletonNodes, poseSkeleton, GRAPH_ROOT } from '../../src/formats/morrowind/mwSkin.js';
import { MW_WEAPON_TYPE, rotNegX, applyRotateController, poseAssembly } from '../../src/formats/morrowind/mwFirstPerson.js';
import { sampleTrack } from '../../src/formats/morrowind/mwAnim.js';
import { offWeaponBoneAddon } from '../../src/combat/twoHands/mirrorRig.js';
import { spinePitchFactor, applySpineAim, spineAimSlot, SPINE_AIM_BONES, RANDOM_ATTACK_GROUPS, AIMING_STATES } from '../../src/combat/spineAim.js';
import { createBodyMotion, sceneInput } from '../../src/characters/bodyMotion/bodyMotion.js';
import { bodyOf } from '../../src/characters/bodyMotion/bodyKit.js';
import { bodyFrames } from '../../src/characters/bodyMotion/bodySolve.js';
import { retailSkeleton } from '../fixtures/mw/retailRig.mjs';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const sm = (s, p, r) => skeletonSpaceMatrices(s, p, r);
const file = parseNif(retailSkeleton());
const sk = buildSkeleton(file);
injectSkeletonNodes(sk, offWeaponBoneAddon(sk, GRAPH_ROOT, sm, file));
const W = MW_WEAPON_TYPE;
const near = (a, b, eps = 1e-5) => Math.abs(a - b) < eps;
const unit = (a) => { const s = Math.hypot(a[0], a[3], a[6]); return Array.from(a, (v) => v / s); };
const T = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const mul = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]); return o; };
const at = (m, n) => m.get(sk.byName.get(n));
/** The turn a bone's world rotation took in the root's frame: world' * world^T. */
const turnOf = (m0, m1, n) => mul(unit(at(m1, n).a), T(unit(at(m0, n).a)));

test('BOW-AIM THE PITCH FACTOR: none unless a Ranged or Thrown weapon is in its wind-up, release or follow (or a cast); eased in over "start" to "min attack" (unless the group is a random attack); 1 through the release; eased out over the follow - a crossbow\'s in its first tenth (mutants: BOW-AIM-melee-pitches, BOW-AIM-idle-pitches, BOW-AIM-no-ramp-in, BOW-AIM-crossbow-slow, BOW-AIM-follow-held)', () => {
  assert.deepEqual([...SPINE_AIM_BONES], ['bip01 spine1', 'bip01 spine2']);
  assert.deepEqual([...RANDOM_ATTACK_GROUPS], ['attack1', 'attack2', 'attack3', 'swimattack1', 'swimattack2', 'swimattack3']);
  assert.deepEqual([...AIMING_STATES], ['AttackWindUp', 'AttackRelease', 'AttackEnd', 'Casting']);
  const bow = { weaponType: W.MarksmanBow, group: 'bowandarrow' };
  for (const upper of ['None', 'Equipping', 'Unequipping', 'WeaponEquipped']) assert.equal(spinePitchFactor({ ...bow, upper }), 0, `${upper}: no aim`);
  for (const t of [W.LongBladeOneHand, W.SpearTwoWide, W.HandToHand, W.Spell, W.None]) assert.equal(spinePitchFactor({ upper: 'AttackRelease', weaponType: t }), 0, `melee and spells never pitch (${t})`);
  assert.equal(spinePitchFactor({ upper: 'AttackRelease', weaponType: W.MarksmanThrown }), 1, 'a thrown weapon does');
  assert.equal(spinePitchFactor({ ...bow, upper: 'AttackRelease' }), 1);
  assert.equal(spinePitchFactor({ ...bow, upper: 'Casting' }), 1, 'a cast with a bow in the stance keeps the aim');
  // the ramp in: (t - start) / (min - start) while start <= t < min; 1 past it, and 1 where the keys are missing
  const wind = { ...bow, upper: 'AttackWindUp', startTime: 5.8, minAttackTime: 6.0 };
  assert.ok(near(spinePitchFactor({ ...wind, time: 5.85 }), 0.25));
  assert.equal(spinePitchFactor({ ...wind, time: 6.0 }), 1);
  assert.equal(spinePitchFactor({ ...wind, time: 5.7 }), 1, 'before the start: the guard fails, the factor stays whole');
  assert.equal(spinePitchFactor({ ...wind, time: 5.85, minAttackTime: -1 }), 1, 'no min attack key');
  assert.equal(spinePitchFactor({ ...wind, time: 5.85, group: 'attack2' }), 1, 'a random attack has no pre-wind-up');
  // the ramp out over the follow
  assert.ok(near(spinePitchFactor({ ...bow, upper: 'AttackEnd', completion: 0.3 }), 0.7));
  assert.ok(near(spinePitchFactor({ upper: 'AttackEnd', weaponType: W.MarksmanCrossbow, completion: 0.05 }), 0.5));
  assert.equal(spinePitchFactor({ upper: 'AttackEnd', weaponType: W.MarksmanCrossbow, completion: 0.3 }), 0, 'a crossbow\'s reload plays unpitched past its first tenth');
});

test('BOW-AIM THE SPINE TAKES THE LOOK, IN THE ROOT\'S FRAME: on retail\'s biped a pitch of 0.3 (+ down) turns spine1 by half and spine2 - the chest, the arms, the head - by the whole of it, exactly about the root\'s X, tipping the chest forward and the head down; the hips stand; no pitch, no change (mutants: BOW-AIM-whole-pitch-each, BOW-AIM-local-frame, BOW-AIM-old-conjugation, BOW-AIM-pitch-up)', () => {
  const m0 = sm(sk, new Map(), GRAPH_ROOT);
  const p = new Map();
  assert.equal(applySpineAim(sk, p, GRAPH_ROOT, sm, 0.3), 2);
  const m1 = sm(sk, p, GRAPH_ROOT);
  const half = rotNegX(0.15), whole = rotNegX(0.3);
  const s1 = turnOf(m0, m1, 'bip01 spine1');
  for (let i = 0; i < 9; i++) assert.ok(near(s1[i], half[i]), `spine1 turned half the pitch about the root's X (element ${i}: ${s1[i]} vs ${half[i]})`);
  for (const n of ['bip01 spine2', 'bip01 neck', 'bip01 head', 'bip01 r hand']) {
    const d = turnOf(m0, m1, n);
    for (let i = 0; i < 9; i++) assert.ok(near(d[i], whole[i]), `${n} turned the whole pitch (element ${i}: ${d[i]} vs ${whole[i]})`);
  }
  for (const n of ['bip01 pelvis', 'bip01 spine', 'bip01 l thigh']) assert.deepEqual(Array.from(at(m1, n).a), Array.from(at(m0, n).a), `${n} stands`);
  const head = [at(m1, 'bip01 head').t[1] - at(m0, 'bip01 head').t[1], at(m1, 'bip01 head').t[2] - at(m0, 'bip01 head').t[2]];
  assert.ok(head[0] > 5 && head[1] < 0, `looking down, the head goes forward and down (${head})`);
  assert.ok(near(at(m1, 'bip01 head').t[0], at(m0, 'bip01 head').t[0], 1e-4), 'and never sideways');
  const q = new Map();
  assert.equal(applySpineAim(sk, q, GRAPH_ROOT, sm, 0), 0);
  assert.equal(q.size, 0, 'no pitch: the clip\'s pose untouched');
  assert.equal(spineAimSlot(0), null, 'and no slot');
});

test('BOW-AIM THE CONJUGATION (mwFirstPerson.js rootSpaceTurn): RotateController\'s turn in this port\'s column convention is local * W^T * R * W - the world becomes R * world, R in the root\'s frame, for any bone however its frame is turned; the letters\' copy (W * R * W^T * local) turned retail\'s spine about a skewed axis the other way (mutants: BOW-AIM-old-conjugation)', () => {
  const m0 = sm(sk, new Map(), GRAPH_ROOT);
  for (const n of ['bip01 spine1', 'bip01 neck', 'bip01 r forearm', 'bip01 l thigh']) {
    const p = new Map();
    assert.equal(applyRotateController(sk, p, GRAPH_ROOT, sm, sk.byName.get(n), rotNegX(0.4)), true);
    const d = turnOf(m0, sm(sk, p, GRAPH_ROOT), n), r = rotNegX(0.4);
    for (let i = 0; i < 9; i++) assert.ok(near(d[i], r[i]), `${n}: element ${i}, ${d[i]} vs ${r[i]}`);
  }
  assert.equal(applyRotateController(sk, new Map(), GRAPH_ROOT, sm, undefined, rotNegX(0.4)), false, 'no bone, no turn');
});

