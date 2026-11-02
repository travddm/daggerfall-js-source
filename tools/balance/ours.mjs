// This game's rules, measured by calling the game's own modules.
//
// A fight is a seeded Monte Carlo through the real `calculateAttackDamage` (src/combat/formulas.js), in both directions,
// so every registered core, modifier and fold the game would apply is in the number. Each rule layer is a switch the game
// itself reads (a mod setting, a pref, an entity flag) or a call the game makes (the enemy scaling seams); `LAYERS` lists
// them. Same seed, same layers, same number.
import '../../src/combat/swingLaw.js';   // registers the swing reader the swing law asks for (SWING-LAW)
import { installPcaao, uninstallPcaao } from '../../src/combat/pcaao.js';
import { calculateAttackDamage } from '../../src/combat/formulas.js';
import { MOD_SETTINGS, setModSetting, _resetModSettings } from '../../src/systems/modSettings.js';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { makeEnemyEntity, applyProgressionScaling } from '../../src/characters/enemy/enemyEntity.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { heroThreat } from '../../src/systems/heroThreat.js';
import { progressionScaling, combatStanding, dungeonShare, foeShare, placeVeteran } from '../../src/systems/skillSoftcap.js';
import { DUNGEON_RARITY_TIER, AFFIX_RANGES } from '../../src/systems/loot/lootRarity.js';
import { promoteEliteFoe } from '../../src/systems/eliteFoes.js';
import { getMeleeWeaponAnimTime, getBowCooldownTime, CLASSIC_UPDATE_INTERVAL } from '../../src/characters/weaponStates.js';
import { WEAPON_TYPES } from '../../src/combat/fpsWeapon.js';
import { weaponMasteryBlow, weaponMasteryPace, WEAPON_MASTERY } from '../../src/systems/weaponMastery.js';
import { registerWeaponBlowMod } from '../../src/systems/entityMods.js';
import { blowRoom, guardRoom } from '../../src/systems/powerCeiling.js';
import { registerSpellPowerMod } from '../../src/systems/spell/spellPower.js';
import { SPELL_POWER_MOST as LOOT_SPELL_POWER_MOST } from '../../src/systems/loot/lootPowers.js';
import { registerSwingPaceMod } from '../../src/characters/weaponStates.js';
import { evenHpFloor } from '../../src/systems/levelEven.js';
import { playerDamageMods, registerPlayerDamageMod } from '../../src/characters/playerEntity.js';
import { liveStat } from '../../src/systems/statMods.js';
import { mintKit, wearKit } from './gear.mjs';
import { WEAPON_TEMPLATES } from './builds.mjs';
import { progressionOf, VIRTUE_POINTS_PER_LEVEL } from './progression.mjs';

/** The rule layers, each with the game switch it flips. `default` is the game as an online room runs it. */
export const LAYERS = Object.freeze({
  pcaao: 'Physical Combat And Armor Overhaul: armour reduces damage, skill counts x1.5 to hit, crits multiply (mod setting pcaao Enabled)',
  meaner: 'Meaner Monsters rows (mod setting meanerMonsters Enabled)',
  master: 'Master Skills: mastered skills climb to 200 and read up to 140 (entity.masterSkills)',
  online: 'Online-only rules: the level law (systems/levelClimb.js), the blow and pace of a weapon skill past 100 (systems/weaponMastery.js), school potency and spell cost past 100',
  onlineHealth: 'Online health floor: Endurance repays every earlier level (systems/levelEven.js evenHpFloor)',
  scaling: 'Place and mastery scaling of foes (systems/skillSoftcap.js progressionScaling)',
  hero: "Hero's threat: foes grow with player level past 10 (systems/heroThreat.js)",
  power: 'Loot-ladder gear: a damage line on the weapon, an armour line on each piece (systems/loot/lootRarity.js)',
  techniques: 'Weapon techniques: a burst of 1.2 to 1.8 times a blow every cooldown, on a gear tier that rolls one (combat/technique/techniqueRoster.js)',
  swing: 'Swing law: the port\'s own swing speed curve (characters/weaponStates.js swingFrameSeconds)',
  ceiling: 'Every stacking source at its cap: the blow takes the room up to the net (BLOW_MOST) and the hurt down to GUARD_LEAST (systems/powerCeiling.js). The maxed character; not in the default set',
  virtue: 'Oblivion-style levelling: 12 attribute points a level instead of 5 (mod oblivion-remaster-leveling)',
});
export const LAYER_NAMES = Object.freeze(Object.keys(LAYERS));
/** `virtue` is a per-character choice offline and is off in the room; `ceiling` is the maxed character, a scenario and not the
 *  room as played. The default set leaves both out. */
const OUT_OF_DEFAULT = new Set(['virtue', 'ceiling']);
export const DEFAULT_LAYERS = Object.freeze(LAYER_NAMES.filter((name) => !OUT_OF_DEFAULT.has(name)));

const DEFAULT_CAREER = Object.freeze({
  strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50,
  attackModifierFlags: 0, hitPointsPerLevel: 8,
});
const CEILING_MOD = 'harness-ceiling';
/** The most per cent a spell's modifiers add together: the loot's lines under their cap, an arcane path's best (the Firmament tree is left to B5). */
const SPELL_LINES_TOP = LOOT_SPELL_POWER_MOST + 5;
export const MC_DEFAULT_SWINGS = 4000;
const NEUTRAL_BLOW_REFLEXES = 2;
const UNBREAKABLE = 1e9;

/** Loot tier a level wears: the ladder's Magic, Rare and Legendary bands, and their midpoints. */
export function lootTierAt(level) {
  if (level < 6) return null;
  if (level < 15) return 'magic';
  if (level < 30) return 'rare';
  return 'legendary';
}
const midpoint = ([low, high]) => Math.round((low + high) / 2);

/** The online page's own flag is the page query. In a room it also forces the mods on, which would defeat the pcaao and
 *  meaner layers, so the harness raises it only around the two calls that read it alone (the weapon skill's blow and pace). */
function whileOnlinePage(call) {
  const was = globalThis.location;
  globalThis.location = { search: '?online=1', href: 'http://harness.test/?online=1' };
  try { return call(); } finally { globalThis.location = was; }
}

/** Switch the game's rules to a layer set. Everything outside `layers` is the DFU default the game falls back to. */
export function applyLayers(layers) {
  _resetModSettings();
  for (const [vendor, definition] of Object.entries(MOD_SETTINGS)) {
    if (definition.keys.Enabled) setModSetting(vendor, 'Enabled', false);
  }
  _resetForTests();
  setPref('survival', false);
  if (layers.has('pcaao')) {
    setModSetting('pcaao', 'Enabled', true);
    installPcaao();
  } else {
    uninstallPcaao();
  }
  setModSetting('meanerMonsters', 'Enabled', layers.has('meaner'));
  setPref('lootRarity', layers.has('power'));
  setPref('weaponTechniques', layers.has('techniques'));
  const online = layers.has('online');
  registerWeaponBlowMod(WEAPON_MASTERY, online ? (...args) => whileOnlinePage(() => weaponMasteryBlow(...args)) : weaponMasteryBlow);
  // Registered after every game registry, so it takes only the room they left: what a character with every source at its top gets.
  registerWeaponBlowMod(CEILING_MOD, layers.has('ceiling') ? (_weapon, damage) => damage + Math.floor((damage * blowRoom(1e9)) / 100) : null);
  registerSpellPowerMod(CEILING_MOD, layers.has('ceiling') ? () => SPELL_LINES_TOP : null);
  registerPlayerDamageMod(CEILING_MOD, layers.has('ceiling') ? (_entity, damage) => damage * (1 - guardRoom(100) / 100) : null);
  registerSwingPaceMod(WEAPON_MASTERY, online ? (...args) => whileOnlinePage(() => weaponMasteryPace(...args)) : weaponMasteryPace);
}

/** A small seeded generator (mulberry32): the harness's only source of chance. */
export function seededRolls(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from words and numbers. */
export function seedOf(...parts) {
  let hash = 2166136261;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** The reference character: progression, kit and the entity that wears it, under a layer set. */
export function oursCharacter(build, level, layers, { gearPercentile, override = {} } = {}) {
  const progression = progressionOf(build, level, {
    masterSkills: layers.has('master'), onlineLevel: layers.has('online'),
    pointsPerLevel: layers.has('virtue') ? VIRTUE_POINTS_PER_LEVEL : undefined,
  });
  if (override.stats) progression.stats = { ...progression.stats, ...override.stats };
  for (const [id, value] of Object.entries(override.skills ?? {})) progression.skills[id] = value;
  if (override.maxHealth) progression.maxHealth = override.maxHealth;
  const tier = layers.has('power') ? lootTierAt(progression.level) : null;
  const kit = mintKit(build, progression.level, {
    gearPercentile, material: override.material, armourMaterial: override.armourMaterial,
    affixes: tier ? {
      tier,
      weaponAffix: { id: 'damage', value: midpoint(AFFIX_RANGES.damage[tier]) },
      armourAffix: { id: 'armor', value: midpoint(AFFIX_RANGES.armor[tier]) },
    } : {},
  });
  const entity = {
    isPlayer: true, level: progression.level, raceId: 1, stats: { ...progression.stats }, skills: progression.skills.slice(),
    career: { weaponArmorShieldsBitfield: 0, abilityFlagsAndSpellPointsBitfield: 0, hitPointsPerLevel: build.hpPerLevel },
    health: progression.maxHealth, maxHealth: progression.maxHealth, items: [], armorValues: new Array(7).fill(100),
    reflexes: 2, biographyAvoidHitMod: 0,
    masterSkills: layers.has('master'), masteredSkills: progression.mastered.slice(),
  };
  wearKit(entity, kit);
  for (const item of [kit.weapon, ...kit.armour]) item.maxCondition = item.currentCondition = UNBREAKABLE;
  if (layers.has('onlineHealth')) {
    entity.maxHealth = Math.max(entity.maxHealth, evenHpFloor(entity, entity.stats.endurance));
    entity.health = entity.maxHealth;
  }
  return { entity, kit, progression, build };
}

/** Build a foe the way the game does, then apply the scaling layers. Health is the row's mean, not a roll. */
export function oursFoe(id, character, layers, { career = DEFAULT_CAREER, dungeonType = 1, kind = 'plain' } = {}) {
  const playerLevel = character.entity.level;
  const foe = makeEnemyEntity(id, ENEMY_BASICS[id], career, playerLevel, () => 0.5);
  foe.maxHealth = (foe.basics.minHealth + foe.basics.maxHealth) / 2;
  foe.health = foe.maxHealth;
  if (kind !== 'plain') promoteEliteFoe(foe, { eliteDungeon: kind === 'boss' });
  if (layers.has('scaling') || layers.has('hero')) {
    const hero = layers.has('hero') ? heroThreat(playerLevel, null) : null;
    const standing = layers.has('scaling') ? combatStanding(character.entity) : { veteran: 0, edge: 0 };
    const place = layers.has('scaling') ? placeVeteran(DUNGEON_RARITY_TIER[dungeonType]) : 0;
    const share = layers.has('scaling') ? dungeonShare(dungeonType) : 0;
    const scaling = progressionScaling(standing, share, foeShare(foe.basics.level, false), place, hero);
    applyProgressionScaling(foe, scaling);
  }
  return foe;
}

/** Seconds a swing or shot takes for this character under the layers. */
export function oursSwingSeconds(character, layers) {
  const { entity, kit } = character;
  const speed = liveStat(entity, 'speed');
  if (kit.weapon.templateIndex === WEAPON_TEMPLATES.LongBow) return 4 * CLASSIC_UPDATE_INTERVAL + getBowCooldownTime(speed);
  const weaponType = kit.weapon.templateIndex === WEAPON_TEMPLATES.Dagger ? WEAPON_TYPES.Dagger
    : kit.weapon.templateIndex === WEAPON_TEMPLATES.Staff ? WEAPON_TYPES.Staff : WEAPON_TYPES.LongBlade;
  const frame = layers.has('swing')
    ? getMeleeWeaponAnimTime(speed, { entity, weaponType, usingRightHand: true })
    : getMeleeWeaponAnimTime(speed);
  return 5 * frame;
}

const dfRandFrom = (rolls) => () => Math.floor(rolls() * 32768);

/** Mean damage and hit rate over `swings` blows of `attacker` at `target`, through the real core. */
function blows(attacker, target, options, swings, seed, afterBlow = (damage) => damage) {
  const rolls = seededRolls(seed);
  const dfRand = dfRandFrom(rolls);
  let total = 0;
  let hits = 0;
  for (let i = 0; i < swings; i++) {
    const damage = afterBlow(calculateAttackDamage(attacker, target, { ...options, rolls, dfRand }));
    total += damage;
    if (damage > 0) hits++;
  }
  return { perBlow: total / swings, hitRate: hits / swings };
}

/** One fight cell: what the character deals and takes against a foe. */
export function oursFight(character, foe, layers, { swings = MC_DEFAULT_SWINGS, label = '' } = {}) {
  const { entity, kit } = character;
  const seed = seedOf(label, entity.level, foe.mobileType, foe.maxHealth);
  const dealt = blows(entity, foe, { weapon: kit.weapon, playerReflexes: NEUTRAL_BLOW_REFLEXES }, swings, seed);
  const taken = blows(foe, entity, { playerReflexes: NEUTRAL_BLOW_REFLEXES }, swings, seed + 1,
    (damage) => (damage > 0 ? playerDamageMods(entity, damage) : 0));
  return {
    hitChance: dealt.hitRate, perSwing: dealt.perBlow, swingSeconds: oursSwingSeconds(character, layers),
    foeHealth: foe.maxHealth, foeLevel: foe.level,
    perAttack: taken.perBlow, foeHitRate: taken.hitRate,
  };
}
