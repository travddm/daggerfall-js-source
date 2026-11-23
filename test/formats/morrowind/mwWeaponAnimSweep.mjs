// A fixed set of inputs for the weapon animation rules, and the way their answers are recorded.
//
// mwWeaponAnimParity.test.js runs the current module over these inputs and compares with the recording in
// test/fixtures/mw/mwWeaponAnimParity.json, which was made from the implementation this module replaced. The group
// sets are the animation groups of the retail skeleton files, then seeded random subsets of the group names that the
// rules can ask for, so that every step of a fallback ladder is the only choice left in some case.
import { createHash } from 'node:crypto';
import { getTextKeyTime } from '../../../src/formats/morrowind/mwAnim.js';

const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

export const WEAPON_TYPES = [
  -6,
  -5,
  -4,
  -3,
  -2,
  -1,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  undefined,
];

const STANCE_BASES = [
  'idle',
  'idle1h',
  'idlesneak',
  'idleswim',
  'idlespell',
  'idlestorm',
  'idlehh',
  'idlecrossbow',
  'jump',
  'hit1',
  'knockdown',
  'inventory',
];
const MOVEMENT_BASES = [];
for (const gait of ['walk', 'run', 'sneak', 'swimwalk', 'swimrun'])
  for (const way of ['forward', 'back', 'left', 'right']) MOVEMENT_BASES.push(gait + way);
MOVEMENT_BASES.push('turnleft', 'turnright', 'spellturnleft', 'spellturnright', 'swimturnleft', 'swimturnright');

const SUFFIXES = [
  '',
  '1h',
  '2c',
  '2w',
  'hh',
  'h2h',
  '1s',
  '1b',
  '2b',
  '1t',
  'crossbow',
  'bow',
  'spell',
  'thrown',
  'shield',
  'torch',
];
const WEAPON_GROUPS = [
  'weapononehand',
  'shortbladeonehand',
  'bluntonehand',
  'blunttwohand',
  'weapontwohand',
  'weapontwowide',
  'handtohand',
  'bowandarrow',
  'crossbow',
  'throwweapon',
  'spellcast',
  'pickprobe',
  'weapon',
  'shield',
  'torch',
];

/** Every group name that a rule can ask a clip for. */
export const askableGroups = () => {
  const names = new Set(WEAPON_GROUPS);
  for (const base of [...STANCE_BASES, ...MOVEMENT_BASES]) for (const suffix of SUFFIXES) names.add(base + suffix);
  return [...names].sort();
};

/** The retail groups (lowercase name lists, by file) plus seeded random subsets of the askable names. */
export function buildGroupSets(retailSets) {
  const sets = retailSets.map((names) => new Set(names));
  const union = new Set(retailSets.flat());
  sets.push(union);
  const universe = askableGroups();
  const random = makeRandom(20260211);
  for (let i = 0; i < 160; i += 1) {
    const keep = [0.15, 0.3, 0.5, 0.7, 0.9][i % 5];
    sets.push(new Set(universe.filter(() => random() < keep)));
  }
  return sets;
}

const sha = (value) =>
  createHash('sha256')
    .update(JSON.stringify(value) ?? 'undefined')
    .digest('hex');
let keepRows = false;
/** Development aid: keep the rows themselves, so a failing digest can be narrowed to the input that differs. */
export const keepSweepRows = (keep) => {
  keepRows = keep;
};
const digest = (rows) => (keepRows ? rows : { count: rows.length, sha256: sha(rows) });

const ATTACK_GROUPS = [
  'weapononehand',
  'weapontwohand',
  'weapontwowide',
  'handtohand',
  'bowandarrow',
  'crossbow',
  'throwweapon',
];
const FRACTIONS = [0, 0.125, 0.25, 0.33, 0.5, 0.66, 0.75, 1];
const KEY_TIMES = [-1, 0, 0.4, 1, 1.25, 2, 2.7, 2.9];

/** Plain values the current module exports; frozen tables and numbers. */
const TABLE_NAMES = [
  'MW_WEAPON_TYPE',
  'WEAPON_ATTACH_BONE',
  'DF_STRIKE_TO_MW_ATTACK',
  'REVERSED_STRIKES',
  'MW_SHOOT_ATTACK',
  'EQUIP_KEYS',
  'UNEQUIP_KEYS',
  'WEAPON_SHORT_GROUP',
  'WEAPON_LONG_GROUP',
  'MW_WEAPON_CLASS',
  'MW_TWO_HANDED',
  'MW_HAS_HEALTH',
  'WEAPON_CLASS',
  'WEAPON_FLAGS',
  'MOVEMENT_FALLBACK_SPEED',
  'MOVEMENT_SPEED_CAP',
  'WEAPON_AMMO_TYPE',
  'ARROW_FALLBACK_NODE',
  'DEFAULT_WEAPON_BONE',
];

const BY_TYPE = [
  'weaponShortGroup',
  'weaponLongGroup',
  'weaponClass',
  'weaponFlags',
  'isRealWeapon',
  'isTwoHandedMelee',
  'ammoTypeFor',
  'arrowAttachBone',
  'reloadsItself',
  'shootsRatherThanSwings',
  'weaponAttachBone',
];

/** Every answer the module gives over the sweep, as small digests keyed by what was asked. */
export function recordWeaponAnim(mod, groupSets, attackClips = {}) {
  const out = { tables: {}, byType: {}, stance: {}, movement: {}, weapon: {} };
  for (const name of TABLE_NAMES) out.tables[name] = mod[name] ?? null;
  for (const fn of BY_TYPE) out.byType[fn] = WEAPON_TYPES.map((type) => [type ?? 'undefined', mod[fn](type)]);
  out.allShortGroups = mod.allWeaponShortGroups();
  for (const type of WEAPON_TYPES) {
    const label = String(type);
    out.stance[label] = digest(
      groupSets.flatMap((set, i) =>
        STANCE_BASES.map((base) => [i, base, mod.composeStanceGroup(base, type, (n) => set.has(n))]),
      ),
    );
    out.movement[label] = digest(
      groupSets.flatMap((set, i) =>
        MOVEMENT_BASES.map((base) => [i, base, mod.composeMovementGroup(base, type, (n) => set.has(n))]),
      ),
    );
    out.weapon[label] = digest(groupSets.map((set, i) => [i, mod.composeWeaponGroup(type, (n) => set.has(n))]));
  }

  const attack = [];
  for (const strike of [...Object.keys(mod.DF_STRIKE_TO_MW_ATTACK), 'StrikeNone', 'Unknown', undefined])
    for (const bow of [false, true]) attack.push([strike, bow, mod.mwAttackType(strike, { bow })]);
  attack.push(['StrikeDown', undefined, mod.mwAttackType('StrikeDown')]);
  out.attackType = attack;

  const keys = [];
  for (const type of ['chop', 'slash', 'thrust', 'shoot', 'bogus', undefined])
    for (const strength of [undefined, 0, 0.2, 0.33, 0.5, 0.66, 0.7, 1])
      for (const reversed of [false, true])
        keys.push([type, strength, reversed, mod.attackKeys(type, strength, { reversed })]);
  out.attackKeys = keys;
  out.attackKeysDefault = ['chop', 'slash', 'thrust', 'shoot'].map((type) => mod.attackKeys(type));

  const windUp = [];
  for (const min of KEY_TIMES)
    for (const max of KEY_TIMES)
      for (let now = -0.5; now <= 3.5; now += 0.25) windUp.push([now, min, max, mod.calculateWindUp(now, min, max)]);
  out.windUp = digest(windUp);
  out.windUpSample = windUp.filter((_, i) => i % 97 === 0);

  const release = [];
  for (const strength of FRACTIONS)
    for (const minAttackTime of KEY_TIMES)
      for (const maxAttackTime of KEY_TIMES)
        for (const minHitTime of KEY_TIMES)
          for (const hitTime of KEY_TIMES)
            release.push([
              strength,
              minAttackTime,
              maxAttackTime,
              minHitTime,
              hitTime,
              mod.releaseStartPoint(strength, { minAttackTime, maxAttackTime, minHitTime, hitTime }),
            ]);
  out.release = digest(release);
  out.releaseSample = release.filter((_, i) => i % 1031 === 0);

  const state = [];
  for (const forward of [undefined, -1, -0.5, -0.4, 0, 0.4, 0.5, 0.51, 1])
    for (const strafe of [undefined, -1, -0.5, 0, 0.4, 0.5, 1])
      for (const running of [false, true])
        for (const sneaking of [false, true])
          for (const turning of [undefined, -1, 0, 1])
            for (const thirdPerson of [false, true])
              for (const swimming of [false, true])
                state.push([
                  forward,
                  strafe,
                  running,
                  sneaking,
                  turning,
                  thirdPerson,
                  swimming,
                  mod.movementAnimState({ forward, strafe, running, sneaking, turning, thirdPerson, swimming }),
                ]);
  out.movementState = digest(state);
  out.movementStateSample = state.filter((_, i) => i % 53 === 0);
  out.movementStateEmpty = mod.movementAnimState({});

  const jump = [];
  for (let bits = 0; bits < 64; bits += 1) {
    const flags = {
      grounded: !!(bits & 1),
      swimming: !!(bits & 2),
      levitating: !!(bits & 4),
      jumpQueued: !!(bits & 8),
      priorInAir: !!(bits & 16),
      jumpPlaying: !!(bits & 32),
    };
    jump.push([bits, mod.jumpAnimState(flags)]);
  }
  out.jump = jump;
  out.jumpDefault = mod.jumpAnimState({});

  // The swing timing at the real key times of each retail attack group: the wind-up ratio across the window and the
  // release start for every strength, per attack kind.
  const timing = [];
  for (const [file, keys] of Object.entries(attackClips))
    for (const group of ATTACK_GROUPS)
      for (const kind of ['chop', 'slash', 'thrust', 'shoot']) {
        const k = mod.attackKeys(kind, 1);
        const at = (name) => getTextKeyTime(keys, `${group}: ${name}`);
        const [minAttack, maxAttack, minHit, hit] = [k.minAttack, k.maxAttack, k.minHit, k.hitKey].map(at);
        if (minAttack < 0 && maxAttack < 0) continue;
        const windUps = [];
        for (let i = 0; i <= 8; i += 1) {
          const now = minAttack + ((maxAttack - minAttack) * (i - 1)) / 6;
          windUps.push(mod.calculateWindUp(now, minAttack, maxAttack));
        }
        const releases = FRACTIONS.map((strength) =>
          mod.releaseStartPoint(strength, {
            minAttackTime: minAttack,
            maxAttackTime: maxAttack,
            minHitTime: minHit,
            hitTime: hit,
          }),
        );
        timing.push([file, group, kind, [minAttack, maxAttack, minHit, hit], windUps, releases]);
      }
  out.clipTiming = timing;

  const turn = [];
  for (let rate = -20; rate <= 20; rate += 0.25) turn.push([rate, mod.turnAnimSpeed(rate)]);
  turn.push(
    [Math.PI, mod.turnAnimSpeed(Math.PI)],
    [undefined, mod.turnAnimSpeed(undefined)],
    [NaN, mod.turnAnimSpeed(NaN)],
  );
  out.turnSpeed = turn;
  return JSON.parse(JSON.stringify(out));
}
