// SPELL-HAND on THE MORROWIND ARM (bible/05-Combat/Two-Hands.md "The spell hand"; combat/twoHands/spellHandArm.js, wired
// by combat/fpArm.js). The fixture arm (mwcast1's: the longsword arm whose clips carry the spellcast group and IdleSpell):
//   - the spell hand keeps the WEAPON's stance - the weapon in its hand, its left arm the Spell idle's; the cast plays the
//     spellcast group with the weapon still in hand, its right arm the weapon's idle; the stance it latched lets go after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFpArm, fpSkeletonPath, FP_CLIP_PATH, UPPER_BODY } from '../../src/combat/fpArm.js';
import { MW_WEAPON_TYPE } from '../../src/formats/morrowind/mwFirstPerson.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { writeNif } from '../../tools/nifWrite.mjs';
import { CAST_KEYS } from '../fixtures/mw/castClip.mjs';
import { createHeldClips, spellHandLimbs, SPELL_HAND_ARM, spellHandStanceStep, drawsIntoSpellHand } from '../../src/combat/twoHands/spellHandArm.js';
import { blowWeaponOf } from '../../src/combat/twoHands/handsLaw.js';

const f = (n) => new Uint8Array(readFileSync(new URL(`../fixtures/mw/${n}`, import.meta.url)));
// A second weapon for the mid-cast swap: a dagger, whose key differs from the arm's longsword (template 120).
const DAGGER = Object.freeze({ templateIndex: 113, group: 'Weapons', material: 0 });

function armClip() {
  const nif = parseNif(f('armfpweapon.kf'));
  const records = nif.records.map((r) => ({ ...r }));
  const tk = records.find((r) => r.type === 'NiTextKeyExtraData');
  tk.keys = [...tk.keys, ...CAST_KEYS.map(([time, text]) => ({ time, text }))];
  return writeNif(records, nif.roots);
}
const wpdtRec = (id, model, type, speed = 1) => {
  const A = (x) => [...x].map((c) => c.charCodeAt(0));
  const Z = (x) => [...A(x), 0];
  const U = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const sub = (n, d) => [...A(n), ...U(d.length), ...d];
  const w = new Uint8Array(32);
  const dv = new DataView(w.buffer);
  dv.setInt16(8, type, true);
  dv.setFloat32(12, speed, true);
  const d = [...sub('NAME', Z(id)), ...sub('MODL', Z(model)), ...sub('FNAM', Z('W')), ...sub('WPDT', [...w])];
  return Uint8Array.from([...A('WEAP'), ...U(d.length), ...U(0), ...U(0), ...d]);
};
const fakeRenderer = () => ({ gl: null, createCharacterMesh: () => ({ vao: 1, buffers: [], ranges: [] }), updateCharacterMesh: () => {}, createCharacterTexture: () => 1 });

/** The longsword arm, its clips carrying the spellcast group; drawn. */
async function arm() {
  const files = new Map([
    [fpSkeletonPath({}), f('armfp.nif')],
    [FP_CLIP_PATH, new Uint8Array(armClip())],
    ['meshes/fixture/armfphand.nif', f('armfphand.nif')],
    ['meshes/fixture/armfparm.nif', f('armfparm.nif')],
    ['meshes/w/blade.nif', f('weapon.nif')],
    ['textures/tx_fixture.dds', f('fixture.dds')],
  ]);
  const weap = wpdtRec('iron longsword', 'w/blade.nif', MW_WEAPON_TYPE.LongBladeOneHand);
  const a = createFpArm();
  a.attach(fakeRenderer(), () => ({ pitch: 0 }));
  const deps = {
    loadMorrowindArchives: async () => [{ has: (p) => files.has(p), get: (p) => files.get(p) }],
    storedMorrowindNames: async () => ['armfp.esm', 'weap.esm'],
    loadMorrowindFile: async (n) => (n === 'weap.esm' ? weap : f('armfp.esm')),
  };
  const res = await a.build({ race: 'fprace', weapon: { templateIndex: 120 }, deps });
  assert.ok(res.ok, `build: ${res.stage} ${res.error}`);
  a.setSheathed(false);
  for (let i = 0; i < 400 && a.status().upper !== UPPER_BODY.WeaponEquipped; i++) a.update(0.05);
  assert.equal(a.status().upper, UPPER_BODY.WeaponEquipped);
  return { a, deps };
}
const run = (a, s, each = null) => { for (let t = 0; t < s; t += 0.05) { each?.(); a.update(0.05); } };

test('SPELL-HAND THE ARM\'S LIMBS (spellHandArm.js): the cast lends the RIGHT arm the weapon\'s idle, a readied spell the LEFT arm the Spell idle - each its own side, copied; nothing to compose without its clip; the held clip loops on its own clock (mutants: the arms swapped; an arm mirrored; the clock frozen)', () => {
  const w = { tracks: 'w' }, sp = { tracks: 's' };
  assert.deepEqual(SPELL_HAND_ARM, { spell: 'L', weapon: 'R' });
  assert.deepEqual(spellHandLimbs({ casting: true, ready: true, weaponIdle: w, spellIdle: sp }), { limbs: { R: { clip: w, side: 'R', mirror: false } }, key: 'spellhand:cast' });
  assert.deepEqual(spellHandLimbs({ ready: true, weaponIdle: w, spellIdle: sp }), { limbs: { L: { clip: sp, side: 'L', mirror: false } }, key: 'spellhand:ready' });
  assert.equal(spellHandLimbs({ casting: true, weaponIdle: null }), null);
  assert.equal(spellHandLimbs({ ready: true, spellIdle: null }), null);
  assert.equal(spellHandLimbs({}), null);
  const stepped = [];
  const held = createHeldClips({ pick: (r, g) => (g === 'none' ? null : { state: { time: 1 }, source: { keys: [], trackMap: `${g}-tracks` } }), step: (s, k, dt) => { s.time += dt; stepped.push(dt); }, sampleTrack: 'S' });
  const r = { sources: [] };
  assert.deepEqual(held.clip(r, 'idlespell', 0), { tracks: 'idlespell-tracks', sampleTrack: 'S', time: 1 });
  assert.equal(held.clip(r, 'idlespell', 0.25).time, 1.25, 'advanced on its own clock');
  assert.equal(held.clip(r, 'none', 0.1), null, 'a rig without the group: nothing');
  assert.equal(held.clip({ sources: [] }, 'idlespell', 0).time, 1, 'a new rig its own clock');
});

test('SPELL-HAND THE LIVE ARM: with the spell in the free hand the arm keeps the WEAPON\'s stance - the weapon in hand, its group the weapon\'s, its left arm the Spell idle - and still swings; the cast plays the spellcast group with the weapon in hand, its right arm the weapon\'s idle; the stance the cast latched lets go when it ends; without the spell hand Morrowind\'s own Spell stance (mutants: readySpell\'s spell-hand door; weaponInHand\'s; the cast\'s latch kept; the compositions\' keys; the body never told)', async () => {
  const { a } = await arm();
  a.setSpellHand(true);
  a.readySpell(true);
  run(a, 0.3);
  let s = a.status();
  assert.equal(s.spellReady, false, 'the weapon\'s stance stands');
  assert.equal(s.weaponInHand, true, 'the weapon in its hand');
  assert.equal(s.weaponGroup, 'weapononehand');
  assert.equal(a.handsState().composed, 'spellhand:ready', 'the left arm the Spell idle\'s');
  // AUDIT SPELL-HAND L3-5: and the arm tells the body so - its layer leaves the left arm to the clip, the right its own
  const carried = a.status().motion.arms;
  assert.ok(carried.L < 0.1 && carried.R > 0.5, `the body's left arm the clip's, its right the layer's (${carried.L.toFixed(3)}, ${carried.R.toFixed(3)})`);
  assert.ok(a.attack('StrikeDown'), 'the weapon still swings with the spell readied');
  run(a, 2);
  assert.equal(a.status().upper, UPPER_BODY.WeaponEquipped);
  assert.equal(a.castSpell(2), true, 'the cast');
  run(a, 0.1, () => { a.setSpellHand(true); a.readySpell(true); });
  s = a.status();
  assert.equal(s.casting, true);
  assert.equal(s.weaponInHand, true, 'the weapon stays in hand through the cast');
  assert.equal(a.handsState().composed, 'spellhand:cast', 'the right arm the weapon\'s idle');
  // the spell goes at its release (Daggerfall clears the ready) - the cast plays out, and the stance it latched lets go IN
  // THE STEP the cast ends (never a frame of the Spell stance between)
  let ended = null;
  for (let t = 0; t < 3 && !ended; t += 0.05) { a.setSpellHand(true); a.readySpell(false); a.update(0.05); if (!a.status().casting) ended = a.status(); }
  assert.ok(ended, 'the cast ended');
  assert.equal(ended.spellReady, false, 'the cast\'s latch let go as it ended');
  assert.equal(ended.weaponGroup, 'weapononehand');
  // without the spell hand: Morrowind's own Spell stance, the weapon out of the hand
  a.setSpellHand(false);
  a.readySpell(true);
  run(a, 0.3);
  s = a.status();
  assert.equal(s.spellReady, true);
  assert.equal(s.weaponInHand, false, 'MW-CAST1: the casting hands are empty');
  // ...and the spell hand coming up over that stance (the weapon drawn with a spell readied) takes the weapon's back
  a.setSpellHand(true);
  a.readySpell(true);
  s = a.status();
  assert.equal(s.spellReady, false, 'the Spell stance let go for the spell hand');
  assert.equal(s.weaponGroup, 'weapononehand');
  assert.equal(s.weaponInHand, true);
  a.unload();
});

// ---- AUDIT SPELL-HAND on the arm (bible/01-Overview/audits/Audit-Mixed-Pair-Spell-Hand.md) ----------------------------

test('AUDIT L3-11 THE ARM\'S LAWS IN THEIR MODULES (HOST-SPLIT): the spell hand\'s stance step (wait under an equip or an unequip, finish a cast, let a Spell stance go, keep), the draw into the spell hand, the striking weapon (mutants: each answer of each law)', () => {
  const U = UPPER_BODY;
  assert.equal(spellHandStanceStep({ upper: U.Equipping, spellReady: true }, U), 'wait');
  assert.equal(spellHandStanceStep({ upper: U.Unequipping, spellReady: true }, U), 'wait');
  assert.equal(spellHandStanceStep({ upper: U.Casting, spellReady: true }, U), 'afterCast');
  assert.equal(spellHandStanceStep({ upper: U.WeaponEquipped, spellReady: true }, U), 'drop');
  assert.equal(spellHandStanceStep({ upper: U.WeaponEquipped, spellReady: false }, U), 'keep', 'L5-7: a repeat asks nothing of the stance');
  assert.equal(drawsIntoSpellHand({ spellHand: true, spellReady: true }), true);
  assert.equal(drawsIntoSpellHand({ spellHand: true, spellReady: true, casting: true }), false);
  assert.equal(drawsIntoSpellHand({ spellHand: false, spellReady: true }), false);
  const blade = { type: MW_WEAPON_TYPE.LongBladeOneHand }, offBlade = { type: MW_WEAPON_TYPE.ShortBladeOneHand };
  assert.equal(blowWeaponOf({ hand: 'L', weapon: blade, offWeapon: offBlade }), offBlade);
  assert.equal(blowWeaponOf({ hand: 'R', weapon: blade, offWeapon: offBlade }), blade);
});

test('AUDIT L3-2 / L3-9 THE ARM\'S CLOCK: a cast pressed in a blow\'s follow-through plays (the follow is cut, as the next blow cuts it); a weapon swapped into the hand mid-cast waits for the cast to end (mutants: the follow refusing the cast; the swap cutting the cast)', async () => {
  const { a } = await arm();
  run(a, 0.3);
  assert.ok(a.attack('StrikeDown'));
  for (let i = 0; i < 400 && a.status().upper !== UPPER_BODY.AttackEnd; i++) a.update(1 / 120);
  assert.equal(a.status().upper, UPPER_BODY.AttackEnd, 'the blow\'s follow-through');
  assert.equal(a.castSpell(2), true, 'a cast pressed now plays');
  assert.equal(a.castInFlight(), true);
  a.unload();
  // a swap mid-cast waits for the cast's end
  const c = (await arm()).a;
  c.readySpell(true);
  run(c, 0.5);
  assert.equal(c.castSpell(2), true);
  assert.equal(c.setWeapon(DAGGER), false, 'mid-cast: the hand is not changed');
  assert.equal(c.castInFlight(), true, 'the cast plays on');
  for (let i = 0; i < 400 && c.castInFlight(); i++) c.update(0.02);
  assert.notEqual(c.setWeapon(DAGGER), false, 'the cast over: the swap goes');
  c.unload();
});

test('AUDIT L3-3 Z KEEPS THE SPELL ON THE ARM: the weapon put away with the spell kept unequips in its OWN group and leaves the hand (the stance waits for the unequip); drawn again with the spell hand up it comes up in its own stance - never the spellcast group\'s equip (mutants: the stance flipped mid-unequip; the draw blind to the spell hand)', async () => {
  const { a } = await arm();
  a.setSpellHand(true); a.readySpell(true);
  run(a, 0.3);
  assert.equal(a.status().weaponGroup, 'weapononehand', 'the spell in the free hand: the weapon\'s stance');
  // Z: the rig tells the arm the hand first (sheathed: no spell hand), then the sheathe, then the spell
  a.setSpellHand(false); a.setSheathed(true); a.readySpell(true);
  assert.equal(a.status().weaponGroup, 'weapononehand', 'the unequip in the weapon\'s own group');
  for (let i = 0; i < 400 && a.status().upper === UPPER_BODY.Unequipping; i++) { a.update(0.02); a.setSpellHand(false); a.readySpell(true); }
  assert.equal(a.status().upper, UPPER_BODY.None);
  assert.equal(a.status().weaponShown, false, 'the blade left the hand');
  run(a, 0.2, () => { a.setSpellHand(false); a.readySpell(true); });
  assert.equal(a.status().spellReady, true, 'sheathed: DFU\'s two-handed stance');
  // Z again: drawn with the spell hand up
  a.setSpellHand(true); a.setSheathed(false); a.readySpell(true);
  assert.equal(a.status().weaponGroup, 'weapononehand', 'the draw in the weapon\'s group, the Spell stance let go first');
  assert.equal(a.status().spellReady, false);
  a.unload();
});

test('AUDIT L5-8 THE SHEET TAKES THE SPELL HAND\'S ARM: a map held open (MAP3\'s sheet) takes both hands from the spell hand\'s composition - the hands something else has are taken, as a pair\'s are (mutant: the spell arm composed over the sheet and the climb)', async () => {
  const { a } = await arm();
  a.setSpellHand(true); a.readySpell(true);
  run(a, 0.3);
  assert.equal(a.handsState().composed, 'spellhand:ready');
  let held = false;
  for (let i = 0; i < 5 && !held; i++) { held = a.holdPaper(); a.update(0.05); }
  assert.equal(held, true, 'the sheet in the hands');
  run(a, 0.3, () => { a.setSpellHand(true); a.readySpell(true); });
  assert.equal(a.handsState().composed, 'taken', 'the sheet\'s hands, never the spell\'s');
  a.unload();
});
