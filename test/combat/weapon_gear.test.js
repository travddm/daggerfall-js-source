// WEAPON-GEAR: online, each point of gear on a weapon
// skill adds 0.1% to its blow (to 5%) from the first point, added to MARTIAL2's climb (GEAR-ADDS,, "need to be the same end result but also help the begingin"); the fists are their own, and nothing
// of it reaches a player, a refereed fight, a mentor or the beast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { pcaaoWeaponAttackDamage, pcaaoModules } from '../../src/combat/pcaao.js';
import {
  weaponPastPct, weaponGearPct, weaponMasteryBlow, WEAPON_GEAR_PER_POINT, WEAPON_GEAR_PCT_MOST, _resetWeaponMasteryForTests,
} from '../../src/systems/weaponMastery.js';
import { BLOW_TOPS } from '../../src/systems/powerCeiling.js';
import { masteryBlowTop } from '../../tools/powerCeiling.mjs';
import { SKILLS, skillValue } from '../../src/systems/skills.js';

const ALL_ON = { Enabled: true, equipmentDamageEnhanced: false, fadingEnchantedItems: false, fixedStrengthDamageModifier: true, armorHitFormulaRedone: true, criticalStrikesIncreaseDamage: true, conditionBasedEffectiveness: false, softMaterialRequirements: true };
const M = pcaaoModules((k) => ALL_ON[k], () => undefined);
const skillsOf = (v) => Object.fromEntries(Array.from({ length: 35 }, (_, i) => [i, v]));
const foe = { isPlayer: false, careerIndex: 0, level: 5, health: 100, maxHealth: 100 };
const low = { ...foe, health: 10 };
/** A player trained to `trained` in every skill (Long Blade, Axe and Archery mastered), `gear` more on each weapon skill. */
const player = (trained, gear = 0) => ({
  isPlayer: true, _online: true, level: 45, raceId: 1, skills: skillsOf(trained),
  stats: { strength: 100, intelligence: 50, willpower: 50, agility: 100, endurance: 100, personality: 50, speed: 100, luck: 50 },
  masteredSkills: [SKILLS.Archery, SKILLS.LongBlade, SKILLS.Axe], career: { weaponArmorShieldsBitfield: 0 },
  _mods: { skills: { [SKILLS.LongBlade]: gear, [SKILLS.Archery]: gear, [SKILLS.Axe]: gear, [SKILLS.ShortBlade]: gear, [SKILLS.HandToHand]: gear } },
});
const daedric = (templateIndex) => ({ group: 'Weapons', templateIndex, material: WEAPON_MATERIALS.Daedric, flags: 0, maxCondition: 100, currentCondition: 100 });
const ON = { online: true };
const online = (fn) => {
  const loc = globalThis.location;
  globalThis.location = { search: '?online' };
  _resetWeaponMasteryForTests();
  try { return fn(); } finally { globalThis.location = loc; _resetWeaponMasteryForTests(); }
};

const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} against ${b}`);

test('WEAPON-GEAR: 0.1% a point of gear from the first point - the sheet of 872 (trained 200, 672 on it) x1.13, counted to 5', () => {
  assert.equal(WEAPON_GEAR_PER_POINT, 0.1);
  assert.equal(skillValue(player(200, 672), SKILLS.LongBlade), 140 + 672, 'the gear on the skill counts');
  near(weaponGearPct(player(200, 672), SKILLS.LongBlade, ON), 5, 'the top kit, held at the most');
  near(weaponGearPct(player(50, 20), SKILLS.LongBlade, ON), 2, 'a low weapon player gains from the first point');
  near(weaponGearPct(player(100, 30), SKILLS.LongBlade, ON), 3, 'below 200 live');
  assert.equal(weaponGearPct(player(200), SKILLS.LongBlade, ON), 0, 'no gear: none');
  assert.equal(weaponGearPct(player(100, 5000), SKILLS.LongBlade, ON), WEAPON_GEAR_PCT_MOST, 'counted to the most');
  assert.equal(BLOW_TOPS.mastery, masteryBlowTop(), 'the ceiling\'s mastery top is the climb\'s most and the gear\'s');
  assert.equal(BLOW_TOPS.mastery, 21);
});

test('WEAPON-GEAR: every weapon family adds its climb and its gear - the sword, the axe, the bow, the dagger; never the fists', () => {
  const sword = daedric(WEAPONS.Longsword), axe = daedric(WEAPONS.War_Axe), bow = daedric(WEAPONS.Long_Bow), dagger = daedric(WEAPONS.Dagger);
  const geared = player(200, 672), trained = player(200), both = player(200, 100);
  for (const w of [sword, bow]) near(weaponPastPct(w, geared, foe, ON), 13, `${w.templateIndex}: the climb's 8 and the gear's 5`);
  near(weaponPastPct(dagger, geared, foe, ON), 5, 'the dagger\'s climb is its pace, its gear its blow');
  near(weaponPastPct(axe, geared, foe, ON), 5, 'the axe at full health: its climb pays nothing there, its gear does');
  near(weaponPastPct(axe, geared, low, ON), 21, 'the axe\'s finish and its gear');
  assert.equal(weaponPastPct(sword, trained, foe, ON), 8, 'no gear: MARTIAL2\'s climb, as it was');
  assert.equal(weaponPastPct(axe, trained, low, ON), 16, 'the axe\'s finish, as it was');
  near(weaponPastPct(sword, both, foe, ON), 13, '100 of gear (held at 5) on a trained 200 adds, never the greater');
  assert.equal(weaponPastPct(null, geared, foe, ON), 0, 'the fists read their skill in their roll already');
});

test('WEAPON-GEAR: only my blow online at a foe - offline, a mentor, the beast, a peer and a player target take nothing', () => {
  const sword = daedric(WEAPONS.Longsword);
  assert.equal(weaponGearPct(player(100, 672), SKILLS.LongBlade, { online: false }), 0, 'offline is Daggerfall\'s');
  assert.equal(weaponGearPct({ ...player(100, 672), _mentor: {} }, SKILLS.LongBlade, ON), 0);
  assert.equal(weaponGearPct({ ...player(100, 672), isInBeastForm: true }, SKILLS.LongBlade, ON), 0);
  assert.equal(weaponGearPct({ ...player(100, 672), peer: true }, SKILLS.LongBlade, ON), 0);
  online(() => {
    assert.equal(weaponMasteryBlow(sword, 100, player(200, 672), foe), 113, 'x1.13, the fraction carried');
    assert.equal(weaponMasteryBlow(sword, 100, player(200, 672), { isPlayer: true }), 100, 'a player takes the blow as struck');
    assert.equal(weaponMasteryBlow(sword, 100, player(100), foe), 100, 'skill 100, no gear: as struck');
  });
});

test('WEAPON-GEAR: through the real core - a Daedric Longsword at the same roll strikes x1.05 for 672 gear against none', () => online(() => {
  const sword = daedric(WEAPONS.Longsword);
  const at = (p) => pcaaoWeaponAttackDamage(p, foe, 0, 0, sword, () => 0.5, M);
  const bare = at(player(100)), geared = at(player(100, 672));
  assert.ok(bare > 0);
  assert.ok(Math.abs(geared - bare * 1.05) <= 1, `${geared} against ${bare}`);
}));
