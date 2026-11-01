// B1: THE WEAPON TECHNIQUES SWITCH - the Features row 'weapon-techniques' (pref weaponTechniques, default on) gates the twelve
// roster techniques apart from the loot ladder. Off, a found line is not rolled and its key is free; a martial path's
// signature is no found line and still answers. Also the budget B1 states for the roster's numbers.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPref, getPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import * as LR from '../../src/systems/loot/lootRarity.js';
import * as RO from '../../src/combat/technique/techniqueRoster.js';
import * as T from '../../src/combat/techniques.js';
import { FEATURES, FEATURE_PREF_DEFAULTS } from '../../src/systems/features.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { createCharacter } from '../../src/systems/chargen.js';
import { buildCustomCareer } from '../../src/systems/customClass.js';
import { masterSkill } from '../../src/systems/masterSkills.js';
import { SKILLS } from '../../src/systems/skills.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import * as MP from '../../src/systems/martialPaths.js';
import { setSigilDueling } from '../../src/systems/sigil/sigil.js';
import { setPlayerDoor } from '../../src/systems/playerDoor.js';
import { mintCondition, setItemFields } from '../../src/systems/item/itemTemplates.js';
import { WEAPONS } from '../../src/characters/weapons.js';

const lcg = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const reset = () => {
  _resetForTests();
  T._resetTechniquesForTests();
  LR._setTechniqueForTests(null);
  setSigilDueling(false);
  setPlayerDoor(null);
};
/** Loot rarity on, Weapon techniques as given (null leaves the default). */
const prefs = (techniques = null) => {
  reset();
  setPref('lootRarity', true);
  if (techniques !== null) setPref('weaponTechniques', techniques);
};
const swordWithLine = () => {
  const it = LR.applyRarity(createWeapon(120, 1), 'rare', lcg(7));
  LR.addTechniqueLine(it, () => 0.5, { id: 'leap' });
  it.isIdentified = true;
  return it;
};
const weapon = (templateIndex, extra = {}) =>
  mintCondition(setItemFields({ group: 'Weapons', templateIndex, material: 0, ...extra }));

const { LongBlade: LB, ShortBlade: SB, Axe: AX, BluntWeapon: BL, Archery: AR, HandToHand: HH } = SKILLS;
const career = buildCustomCareer({
  name: 'Fighter',
  hp: 12,
  stats: {
    strength: 70,
    intelligence: 50,
    willpower: 50,
    agility: 60,
    endurance: 60,
    personality: 50,
    speed: 50,
    luck: 50,
  },
  skills: [
    LB,
    SB,
    AX,
    BL,
    AR,
    HH,
    SKILLS.Dodging,
    SKILLS.CriticalStrike,
    SKILLS.Running,
    SKILLS.Jumping,
    SKILLS.Climbing,
    SKILLS.Swimming,
  ],
});
/** A chargen'd online fighter; with a path id, its two skills mastered and the path chosen (as martial_paths.test.js does). */
function fighter(pathId = null) {
  const p = structuredClone(playerEntity);
  createCharacter(p, career, -1, { rolls: () => 0.5 });
  p._online = true;
  p.level = 20;
  p.activeEffects = [];
  p.health = p.maxHealth = 200;
  p.fatigue = 6400;
  if (pathId) {
    for (const s of MP.MARTIAL_BY_ID[pathId].skills) {
      p.skills[s] = 100;
      assert.equal(masterSkill(p, s).ok, true, `master ${s}`);
      p.skills[s] = 150;
    }
    assert.equal(MP.chooseMartialPath(p, pathId).ok, true);
  }
  return p;
}
const press = (p, item) => ({
  entity: p,
  pw: { weapon: item, sheathed: false, machine: { state: 'Idle', now: 0, cooldownUntil: 0 } },
  held: true,
  ready: true,
  cam: { feet: [0, 0, 0], pos: [0, 1.6, 0], yaw: 0, pitch: 0 },
  rig: 'rig',
  door: {
    drainFatigue: (n) => {
      p.fatigue -= n;
    },
  },
  startSwing: () => true,
  say: () => {},
});

test('B1 THE SWITCH: the preference defaults on, and the Features row declares it (mutants: a default off; the row on another key)', () => {
  reset();
  assert.equal(FEATURE_PREF_DEFAULTS.weaponTechniques, true);
  assert.equal(getPref('weaponTechniques'), true);
  const row = FEATURES.find((f) => f.id === 'weapon-techniques');
  assert.ok(row, 'the row exists');
  assert.equal(row.control.store, 'prefs');
  assert.equal(row.control.key, 'weaponTechniques');
  assert.equal(row.control.initial, true);
  assert.equal(LR.WEAPON_TECHNIQUES_KEY, 'weaponTechniques');
  prefs();
  assert.equal(LR.techniquesOn(), true, 'ladder on, switch at its default');
  setPref('weaponTechniques', false);
  assert.equal(LR.techniquesOn(), false, 'ladder on, switch off');
  setPref('weaponTechniques', true);
  setPref('lootRarity', false);
  assert.equal(LR.techniquesOn(), false, 'switch on, ladder off: techniques need both');
  reset();
});

test('B1 THE ROLL: with Weapon techniques off a drop rolls no line and spends no draw; on (the default), it rolls (mutants: the roll asks only the ladder; a draw taken before the switch)', () => {
  prefs(false);
  let draws = 0;
  const counting = () => {
    draws++;
    return 0;
  };
  const piece = LR.applyRarity(createWeapon(120, 1), 'rare', lcg(3));
  assert.equal(LR.rollTechniqueLine(piece, counting), null);
  assert.equal(draws, 0, 'no draw consumed');
  assert.equal(LR.techniqueLineOf(piece), null);
  prefs();
  const rare = LR.applyRarity(createWeapon(120, 1), 'rare', lcg(3));
  const line = LR.rollTechniqueLine(rare, () => 0);
  assert.ok(line && LR.isTechniqueAffix(line), 'a line rolled with the switch at its default');
  assert.equal(LR.techniqueLineOf(rare), line);
  reset();
});

test('B1 THE KEY: a weapon carrying a technique line answers the off text and shows no chip with the switch off; on, it works (mutants: the refusal asks only the ladder; the chips ask only the ladder)', () => {
  prefs(true);
  const me = fighter();
  const sword = swordWithLine();
  const hand = T.techniqueInHand(me, { weapon: sword });
  assert.equal(hand?.id, 'leap', 'the line is in hand with the switch on');
  assert.notEqual(T.refusal(hand, press(me, sword)), T.LADDER_OFF_TEXT);
  assert.ok(T.techniqueHudChips(me, { weapon: sword }, 'X').length > 0, 'a chip with the switch on');
  setPref('weaponTechniques', false);
  T._resetTechniquesForTests();
  assert.equal(T.LADDER_OFF_TEXT, 'Weapon techniques are turned off (they need Loot rarity and Weapon techniques on).');
  assert.equal(T.refusal(T.techniqueInHand(me, { weapon: sword }), press(me, sword)), T.LADDER_OFF_TEXT);
  assert.equal(T.techniqueHudChips(me, { weapon: sword }, 'X').length, 0, 'no chip with the switch off');
  reset();
});

test("B1 THE SIGNATURE: a martial path's signature is no found line, so it works with Weapon techniques off, and a found line sleeps behind it (mutants: the switch gates the signature)", () => {
  prefs(false);
  const ranger = fighter('ranger');
  const sword = weapon(WEAPONS.Longsword);
  const lined = weapon(WEAPONS.Longsword, { affixes: [{ id: 'technique', param: 'leap', value: 15 }] });
  assert.equal(T.techniqueInHand(ranger, { weapon: sword })?.id, 'huntersPounce', 'the signature in hand, switch off');
  assert.equal(
    T.techniqueInHand(ranger, { weapon: lined })?.id,
    'huntersPounce',
    'the sleeping line gives the key to the signature',
  );
  assert.equal(T.techniqueHudChips(ranger, { weapon: sword }, 'X')[0]?.name, 'Mark of the Hunt', 'its chip stands');
  const plain = fighter();
  assert.equal(
    T.refusal(T.techniqueInHand(plain, { weapon: lined }), press(plain, lined)),
    T.LADDER_OFF_TEXT,
    "no path: the line's own refusal",
  );
  reset();
});

test("B1 THE BUDGET: every technique's to-hit is 5-10, no base passes 1.5, and the top band times the top base is at most 1.95 of a blow (mutants: a to-hit moved; a base raised; a band top raised)", () => {
  let topBase = 0,
    withToHit = 0;
  for (const id of RO.TECHNIQUE_IDS) {
    const t = RO.TECHNIQUES[id];
    if (t.toHit !== undefined) {
      withToHit++;
      assert.ok(t.toHit >= 5 && t.toHit <= 10, `${id}: to-hit ${t.toHit}`);
    }
    assert.ok(t.base <= 1.5, `${id}: base ${t.base}`);
    topBase = Math.max(topBase, t.base);
  }
  assert.equal(withToHit, 10, 'the ten melee techniques carry a to-hit; the two archery ones none');
  const topBand = Math.max(...Object.values(RO.TECHNIQUE_BANDS).map((b) => b[1]));
  assert.ok(topBase * (1 + topBand / 100) <= 1.95 + 1e-9, `${topBase} x ${1 + topBand / 100}`);
});
