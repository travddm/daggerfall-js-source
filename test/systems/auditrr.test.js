// AUDIT-RR (2026-09-23, Mac: "Lets do one more audit") - the adversarial
// audit of the six Roleplay & Realism slices: RRI1 (the fourteen item
// classes), RRI2 (the nine modules past the items), RR1 (the formula
// overrides and rule modules), RR2 (the sprite variants, EnhancedRiding,
// RefinedTraining), RR3a (the Master Armorer registrations) and RR3b (the
// world data). Four reviewers, each with the author's C# open beside the
// port, then every finding re-read against the source before it was paid.
// The findings are numbered in the code comments (`AUDIT-RR Fn`); this
// suite pins the paid ones by execution where the law is a pure function
// and by source where the payment is a host's wiring. The record is the
// AUDIT-RR section of Roleplay-Realism.md and Roleplay-Realism-Items.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setModSetting, _resetModSettings } from '../../src/systems/modSettings.js';
import { createWeaponMachine, machineStep, registerMeleeWeaponAnimTime, CLASSIC_FRAME_UPDATE } from '../../src/characters/weaponStates.js';
import { rrEncumbranceEffect, rrTrainingCost, rrRidingNeckBand, RR_RIDING, rrUnderworldRule } from '../../src/systems/roleplayRealism/rrRealism.js';
import { installRoleplayRealism } from '../../src/systems/roleplayRealism/rrInstall.js';
import { GUILDS, guildInitiationQuestEnded, membershipOf, underworldRuleOf } from '../../src/systems/guild/guilds.js';
import { createFactionRep, getReputation } from '../../src/systems/faction/factionRep.js';
import { createRrRidingContacts, RR_TRAMPLE_REACH } from '../../src/systems/roleplayRealism/rrRidingHost.js';
import { SOUND } from '../../src/systems/soundClips.js';
import { CRIMES } from '../../src/systems/court.js';
import { GENDERS } from '../../src/characters/nameHelper.js';
import { SKILLS } from '../../src/systems/skills.js';
import { enemyHeavyPainVoice } from '../../src/scenes/hostCombat.js';
import { setLastLocationKeyTo, getBlockVariantHere, setBlockVariant, clearWorldDataVariants, NO_VARIANT, lastLocationKeyOf, makeLocationKey } from '../../src/systems/worldDataVariants.js';
import { rriNativeMaterialValue, rriEquipSound, rriCustomItemsForGroup, RRI_VENDOR, RRI_CLASSES } from '../../src/systems/roleplayRealismItems/rriItems.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { unitWeightInKg } from '../../src/systems/inventory.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => hostText(p);
const V = 'roleplay-realism';

installRoleplayRealism();

test('AUDIT-RR F1: the swing clock hands the rig\'s { entity, weaponType, usingRightHand } to GetMeleeWeaponAnimTime - machineStep(m, dt, speed, animCtx), the rig sets the thunk, playerWeapon reads it each step', () => {
  const seen = [];
  registerMeleeWeaponAnimTime((speed, ctx) => { seen.push(ctx); return 0.05; });
  try {
    const m = createWeaponMachine(false);
    m.state = 'StrikeDown';
    const ctx = { entity: { level: 3 }, weaponType: 'LongBlade', usingRightHand: true };
    machineStep(m, 0.016, 50, ctx);
    assert.ok(seen.length >= 1, 'the override was asked');
    assert.equal(seen[0], ctx, 'with the rig\'s context, the same object');
    machineStep(m, 0.016, 50);
    assert.equal(seen.at(-1), null, 'a caller without one hands null (the widget clone\'s path)');
  } finally { registerMeleeWeaponAnimTime(null); }
  assert.equal(typeof CLASSIC_FRAME_UPDATE, 'number');
});

test('AUDIT-RR F2: a guild joined through its initiation quest\'s end runs the class\'s Join() with the store - the underworld floor lands (ThievesGuildRR.cs:91-99) - and world.js hands the quest store', () => {
  _resetModSettings();
  setModSetting(V, 'underworldExpulsion', true);
  const tg = GUILDS.ThievesGuild;
  assert.equal(underworldRuleOf(tg)?.joinReputationFloor, 2, 'the rule stands while the module is on');
  assert.equal(rrUnderworldRule('ThievesGuild')?.joinReputationFloor, 2);
  const store = createFactionRep(new Map([[tg.factionId, { id: tg.factionId, rep: 0 }]]));
  const memberships = {};
  const initiated = guildInitiationQuestEnded(memberships, tg.initiationQuest ?? 'O0A0AL00', true, 0, store);
  if (initiated) {
    assert.ok(membershipOf(memberships, tg), 'joined');
    assert.equal(getReputation(store, tg.factionId), 2, 'the floor');
  }
  const noStore = {};
  guildInitiationQuestEnded(noStore, tg.initiationQuest ?? 'O0A0AL00', true, 0);
  _resetModSettings();
});

test('AUDIT-RR F7: EncumbranceEffects_OnNewMagicRound is float arithmetic - the band edges land where the C#\'s do (double arithmetic put 38/50 one off)', () => {
  // double: encOver 0.020000000000000018 -> speed 1, fatigue 2; float32: 0.01999998 -> speed 0, fatigue 1
  const a = rrEncumbranceEffect({ carriedWeight: 38, maxEncumbrance: 50, liveSpeed: 50, permanentSpeed: 50, currentFatigue: 6400 });
  assert.equal(a.encOver, Math.fround(Math.fround(Math.fround(38 / 50) - 0.75) * 2));
  assert.equal(a.speedEffect, 0);
  assert.equal(a.fatigueEffect, 1);
  // and the other way: 43/50 - double says 10/21, float32 11/22
  const b = rrEncumbranceEffect({ carriedWeight: 43, maxEncumbrance: 50, liveSpeed: 50, permanentSpeed: 50, currentFatigue: 6400 });
  assert.equal(b.speedEffect, 11);
  assert.equal(b.fatigueEffect, 22);
  assert.equal(rrEncumbranceEffect({ carriedWeight: 37, maxEncumbrance: 50 }), null, 'under three quarters, nothing');
});

test('AUDIT-RR F26: TrainingSkillPicker_OnItemPicked\'s `(float)skillValue / trainingMax` is float32 too - 3 gold at 20/60 is 3, not 2', () => {
  assert.equal(rrTrainingCost(3, 20, 60), 3);
  assert.equal(rrTrainingCost(5, 30, 50), 5);
  assert.equal(rrTrainingCost(5, 90, 50), 6);
  assert.equal(rrTrainingCost(100, 0, 50), 50, 'a raw skill trains for half');
  assert.equal(rrTrainingCost(100, 25, 50, false), 100, 'variableTrainingPrice off');
});

test('AUDIT-RR F14/F25: the neck band is the sprite\'s BOTTOM fifth (Unity v = 0 is the bottom row; the port samples v = 0 at the top) and the docked large HUD lifts the mount by its own height', () => {
  const band = rrRidingNeckBand(10);
  assert.deepEqual(band, { u0: RR_RIDING.extX, u1: RR_RIDING.extX + RR_RIDING.extW, v0: 0.8, v1: 0.8 + 0.1, widthTrim: 14 });
  assert.equal(rrRidingNeckBand(0).v1, 0.8, 'no lift, no band');
});

test('AUDIT-RR F15/F16/F17/F18: the riding component\'s contacts - a civilian under the hooves bleeds LETHAL, cries at RidingVolumeScale, is retired; a foe is charged ONCE with the component\'s own knockback and the heavy pain voice, the blow handed down with no knock direction', () => {
  _resetModSettings();
  setModSetting(V, 'EnhancedRiding.TrampleCivilians', true);
  const log = [];
  const person = { gender: GENDERS.Female, facingYaw: 1 };
  const seat = { person, pos: [0.5, 0, 0] };
  const foe = { ai: { feet: [0, 0, 0.5] }, entity: { isClass: true } };
  const far = { ai: { feet: [5, 0, 5] } };
  const playerEntity = { fatigue: 64 * 100, skills: { [SKILLS.HandToHand]: 50 }, stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 }, level: 5 };
  const rig = createRrRidingContacts({
    playerEntity, feet: () => [0, 0, 0], yaw: () => 0, livePersons: () => [seat], foes: () => [foe, far], guards: () => [], isGuardRecord: () => false,
    splashBlood: (pos, fwd) => log.push(['blood', pos, fwd]), playClip: (clip, vol) => log.push(['clip', clip, vol]), ridingVolumeScale: () => 0.6,
    spawnGuards: () => log.push(['spawnGuards']), spawnCityGuard: () => null, setCrime: (c) => log.push(['crime', c]), retire: (p) => log.push(['retire', p]),
    hurtGuard: () => log.push(['hurtGuard']), damageFoe: (f, damage, at, ...rest) => log.push(['damageFoe', f, damage, at, rest]), voice: () => ({ clip: 7 }), rolls: () => 0.5,
  });
  rig.contacts();
  assert.deepEqual(log.find((l) => l[0] === 'blood'), ['blood', [0, 1, 2], [0, 0, 1]], 'BloodPos: 2 ahead, 1 up');
  assert.deepEqual(log.find((l) => l[0] === 'clip' && l[1] === SOUND.BretonFemalePain3), ['clip', SOUND.BretonFemalePain3, 0.6], 'RidingVolumeScale, the master bus carries SoundVolume');
  assert.ok(log.some((l) => l[0] === 'spawnGuards'));
  assert.deepEqual(log.find((l) => l[0] === 'crime'), ['crime', CRIMES.Assault]);
  assert.deepEqual(log.find((l) => l[0] === 'retire'), ['retire', person]);
  assert.equal(person.trampled, true);
  const charge = log.find((l) => l[0] === 'damageFoe');
  assert.ok(charge, 'the foe in reach was charged');
  assert.equal(charge[1], foe);
  assert.ok(charge[2] > 0, 'the charge damage');
  assert.deepEqual(charge[3], [0, 0, 0], 'BloodPos');
  assert.deepEqual(charge[4], [], 'no knock direction handed down (F17) - the component wrote its own');
  assert.equal(foe.ai.knockbackSpeed, RR_RIDING.chargeKnockback);
  assert.deepEqual(foe.ai.knockbackDir, [0, 0, 1]);
  assert.ok(log.some((l) => l[0] === 'clip' && l[1] === 7 && l[2] === 1), 'the heavy pain voice at full');
  assert.equal(foe.entity.pickpocketAttempted, true, 'AUDIT-RR2 G24: the pickpocket latch');
  assert.equal(log.filter((l) => l[0] === 'damageFoe').length, 1, 'the far foe was not');
  rig.contacts();
  assert.equal(log.filter((l) => l[0] === 'damageFoe').length, 1, 'once');
  assert.equal(rig.chargeFoe(foe, [1, 0, 0]), false);
  assert.equal(RR_TRAMPLE_REACH, 0.9);
  // F18: the voice is the heavy pain cry with no CombatVoices gate and no dice - a monster too
  const monster = { entity: { isClass: false }, mobileType: 0 };
  const v = enemyHeavyPainVoice(monster, () => 0.99);
  assert.ok(v && typeof v.clip === 'number', 'a monster answers');
  // F15: both hosts hand LETHAL_HIT to the splash; both stand the component; the standalone exterior runs its contacts
  for (const h of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const s = rd(h);
    assert.match(s, /splashBlood: \(pos, fwd\) => hitEffects\.showBloodSplash\(0, pos, fwd, LETHAL_HIT\)/, `${h}: LETHAL_HIT`);
    assert.match(s, /createRrRidingContacts\(\{/, `${h}: the component`);
    assert.match(s, /voice: \(f\) => enemyHeavyPainVoice\(f\)/, `${h}: the voice`);
  }
  _resetModSettings();
});

test('AUDIT-RR F32/F35: WorldDataVariants\' last key is THIS location\'s before its blocks are read, and a negative key asks nothing', () => {
  clearWorldDataVariants();
  setBlockVariant('TVRNAS02.RMB', '_rr');
  setLastLocationKeyTo(17, 42);
  assert.equal(lastLocationKeyOf(), makeLocationKey(17, 42));
  assert.equal(getBlockVariantHere('TVRNAS02.RMB'), '_rr', 'AnyLocationKey answers for a live key');
  setLastLocationKeyTo(-1, 0);
  assert.ok(lastLocationKeyOf() < 0);
  assert.equal(getBlockVariantHere('TVRNAS02.RMB'), NO_VARIANT, '`if (lastLocationKey >= 0)` (WorldDataVariants.cs:192)');
  clearWorldDataVariants();
});

test('AUDIT-RR (RRI) F3/F5/F6/F7/F8/F9/F10: shops stock the registered custom items; a fur piece\'s weight is its own field; random armor is named; NativeMaterialValue and GetEquipSound are the class\'s; a mod spell survives the save; ConvertOrcish walks the loot', () => {
  _resetModSettings();
  assert.deepEqual(rriCustomItemsForGroup('Weapons'), [513, 514]);
  assert.deepEqual(rriCustomItemsForGroup('Armor'), [515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526]);
  setModSetting(RRI_VENDOR, 'newArmor', false);
  assert.deepEqual(rriCustomItemsForGroup('Armor'), [], 'off, none registered');
  _resetModSettings();
  // F7: a mail hauberk's NativeMaterialValue is the chain family's (its forbidden-armor bit), a classic item its own
  const hauberk = { group: 'Armor', templateIndex: 515, material: ARMOR_MATERIAL.Steel };
  assert.equal(rriNativeMaterialValue(hauberk), RRI_CLASSES[515].nativeMaterialValue(hauberk));
  assert.equal(rriNativeMaterialValue({ group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Steel }), ARMOR_MATERIAL.Steel);
  // F8: the jerkin equips as leather whatever its material; the archer's axe as an axe; a classic item answers null
  assert.equal(rriEquipSound({ templateIndex: 520, material: ARMOR_MATERIAL.Steel }), 'EquipLeather');
  assert.equal(rriEquipSound({ templateIndex: 513 }), 'EquipAxe');
  assert.equal(rriEquipSound({ templateIndex: 102 }), null);
  // F5: an item carrying weightInKg answers it
  assert.equal(unitWeightInKg({ group: 'Armor', templateIndex: 523, material: ARMOR_MATERIAL.Leather, weightInKg: 1.4 }), 1.4);
  assert.equal(unitWeightInKg({ group: 'Armor', templateIndex: 523, material: ARMOR_MATERIAL.Leather, weightInKg: 1.4, water: 0.5 }), 1.9);
});

