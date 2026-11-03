// @ts-check
// FOE-BOUNDS: THE MOST HEALTH A STREAMED FOE CAN LEGALLY HAVE. Every stage that builds a foe's maximum rounds once and
// never lowers it (`Math.max(1, Math.round(prev * mult))`), so the highest base and every highest multiplier, in the
// builders' own order and with their rounding, is the exact legal maximum, for the inputs a reader cannot see taken at
// their worst: the owner's dice, its hero level, a revenant's rank, wrath and the Dread, a Rite's Summoner. What the
// record says of itself only ever RAISES the bound (`z` an elite, `cp` a champion's trait, `nm` a revenant's name), so a
// record claiming none of them is held to the ordinary chain. A record over its bound is PROVABLY impossible: it is
// refused, never rescaled. Pure, and the relay's too.
//
// THE TWO CHAINS:
//   - a street's or a building's foe (scenes/exteriorFoes.js spawnFoe): its base, then one of an elite (`z`), a champion's
//     factor and trait (`cp`), or the hero's threat at its worst (a promoted foe takes no hero's threat), then a revenant's
//     rank, wrath and the Dread (`nm`), then a Rite's Summoner x3 (a class foe in a camp) or a fallen star's coven x2 (any
//     foe in a camp), and the City Watch's own (scenes/cityGuards.js: its class roll);
//   - a dungeon's foe (scenes/dungeonContext.js buildFoeAt): the most of a Super dungeon's x4 with the hero's threat or a
//     champion's factor and trait, and a Super dungeon's elite. The record carries no `z`, `cp` or `nm` there, so the worst
//     is taken.
// A class foe's base is DFU's roll at its worst: 10 + its level x the most hit points a level any class gives
// (CreateCharCustomClass.cs's slider, systems/customClass.js HP_MAX). A monster's is the most of its row in Daggerfall
// Unity's table and in the Enemy Expansion rows with this game's stat pass over them (FOE_BOUND_ROWS), so a game with
// the mod off is never refused.
// UNVERIFIED - no bound, never refused: a type with no row (the horse, 39; an unknown id; a mod's own kind, 256 and up,
// whose career the relay does not hold), an ally, a companion or a crewman (the frame's own lists, which the caller leaves
// out), a boss's relay-kept body (not on this stream). The constants each builder owns are copied here, as
// net/grantLaw.js copies the elite's and the champion's: the relay cannot import the modules that hold them, and
// test/net/foebounds_law.test.js holds each equal to its home.

/** The builders' multipliers, each from its home (held equal by the test). */
export const FOE_BOUND = Object.freeze({
  classBase: 10,            // characters/enemy/enemyEntity.js rollEnemyClassMaxHealth's `let maxHealth = baseHealth` (10)
  classHpPerLevel: 30,      // systems/customClass.js HP_MAX (CreateCharCustomClass.cs maxHpPerLevel)
  elite: 2,                 // systems/foe-promotion.ts PROMOTION.elite.health
  superElite: 9,            // systems/eliteFoes.js ELITE_FOE_SUPER_DUNGEON_HEALTH_MULT
  superFoe: 4,              // world/superDungeon/sdDungeon.js SUPER_HEALTH_SCALE
  champion: 1.4,            // systems/foe-promotion.ts PROMOTION.champion.health
  championTraits: Object.freeze([1, 1.2, 1, 1, 1]),   // systems/champions.js CHAMPION_TRAITS' `health` (1 where none), in the wire's order
  championMinLevel: 3,      // systems/foe-promotion.ts PROMOTION.minLevel
  revenantPerRank: 0.4,     // systems/revenant/revenant.js REVENANT_HEALTH_PER_RANK
  revenantRankMax: 5,       // systems/revenant/revenant.js REVENANT_MAX_RANK
  festerHealth: 0.1,        // systems/revenant/revenantFeud.js FESTER.HEALTH
  wrathMax: 3,              // systems/revenant/revenantFeud.js WRATH_MAX
  dread: 1.5,               // systems/revenant/revenantUnquiet.js DREAD.HEALTH
  rite: 3,                  // net/gate/gateRite.js RITE_SUMMONER_HEALTH
  star: 2,                  // net/starfall/starfallLaw.js STAR_FOE_HEALTH
  watch: 146,               // characters/mobile/mobileTypes.js KNIGHT_CITY_WATCH
  hero: Object.freeze({ from: 30, to: 45, health: 1.018 }),   // systems/heroThreat.js HERO_THREAT
});

/** The hero's worst health factor: every level that pays (systems/heroThreat.js heroThreat's top). */
export const FOE_HERO_HEALTH_MAX = FOE_BOUND.hero.health ** (FOE_BOUND.hero.to - FOE_BOUND.hero.from);

/** Each monster's row at its most, in Daggerfall Unity's table and under the Enemy Expansion rows with the stat pass
 *  (systems/enemyExpansion/classic-stat-pass.ts) - [type, max health, level] - held equal by the test. The horse (39)
 *  has none. */
export const FOE_BOUND_ROWS = Object.freeze(new Map([
  [0, [20, 1]], [1, [18, 2]], [2, [26, 3]], [3, [26, 3]], [4, [44, 4]], [5, [44, 4]], [6, [44, 4]], [7, [44, 6]], [8, [46, 5]], [9, [66, 7]], [10, [50, 6]], [11, [50, 7]], [12, [65, 9]], [13, [85, 8]], [14, [85, 8]], [15, [66, 9]], [16, [96, 10]], [17, [85, 10]], [18, [66, 11]], [19, [85, 14]], [20, [74, 12]], [21, [96, 15]], [22, [82, 14]], [23, [90, 15]], [24, [117, 19]], [25, [130, 17]], [26, [138, 17]], [27, [146, 18]], [28, [154, 19]], [29, [146, 19]], [30, [200, 20]], [31, [240, 21]], [32, [200, 20]], [33, [210, 21]], [34, [54, 18]], [35, [130, 16]], [36, [130, 16]], [37, [169, 16]], [38, [130, 20]], [40, [42, 16]], [41, [44, 16]], [42, [74, 16]]
]));

const isClass = (t) => t >= 128 && t <= 146;
/** One builder's stage: its multiplier, rounded once, never under 1. */
const stage = (v, m) => Math.max(1, Math.round(v * m));
const revenantStages = (v) => stage(stage(stage(v, 1 + FOE_BOUND.revenantPerRank * FOE_BOUND.revenantRankMax), 1 + FOE_BOUND.festerHealth * FOE_BOUND.wrathMax), FOE_BOUND.dread);

/** A record's base: a class foe's roll at its level's worst, a monster's row - or null (no row: unverified). */
function baseOf(r) {
  if (isClass(r.t)) return Number.isInteger(r.l) && r.l >= 0 ? FOE_BOUND.classBase + r.l * FOE_BOUND.classHpPerLevel : null;
  return FOE_BOUND_ROWS.get(r.t)?.[0] ?? null;
}

/** The street's chain (spawnFoe's order) for record `r`; `camp` whether it stands in a camp (a Rite's faithful do). */
function streetBound(r, base, camp) {
  let v = base;
  if (r.z === 1) v = stage(v, FOE_BOUND.elite);
  else if (Number.isInteger(r.cp)) v = stage(v, FOE_BOUND.champion * (FOE_BOUND.championTraits[r.cp] ?? 1));
  else v = stage(v, FOE_HERO_HEALTH_MAX);
  if (typeof r.nm === 'string' && r.nm) v = revenantStages(v);
  if (camp) v = stage(v, isClass(r.t) ? Math.max(FOE_BOUND.rite, FOE_BOUND.star) : FOE_BOUND.star);   // STAR-TUNE: a fallen star's coven, any kind
  return r.t === FOE_BOUND.watch ? Math.max(v, base) : v;
}

/** The dungeon's chain (buildFoeAt's order): a layout foe's worst, which a revenant's lair stand never reaches. */
function dungeonBound(r, base) {
  const superFoe = stage(base, FOE_BOUND.superFoe);
  return Math.max(
    stage(superFoe, FOE_HERO_HEALTH_MAX),
    stage(superFoe, FOE_BOUND.champion * Math.max(...FOE_BOUND.championTraits)),
    stage(base, FOE_BOUND.superElite),
  );
}

/**
 * THE MOST HEALTH record `r` can legally stand with - its lane's chain (`street`: a cell's or a building's pool;
 * `dungeon`: a dungeon's host or own lane; `any`: the larger, the relay's word for a world room's own lane), `camp` whether its frame tags it a camp's (unknown: true, each) - or null where
 * it is unverified. Pure.
 * @param {any} r a foe record (net/wire.js validFoeRecord's shape)
 * @param {{ lane?: 'street'|'dungeon'|'any', camp?: boolean }} [o]
 * @returns {number|null}
 */
export function foeHealthBound(r, { lane = 'street', camp = true } = {}) {
  if (!r || !Number.isInteger(r.t)) return null;
  const base = baseOf(r);
  if (base == null) return null;
  if (lane === 'dungeon') return dungeonBound(r, base);
  if (lane === 'any') return Math.max(streetBound(r, base, camp), dungeonBound(r, base));
  return streetBound(r, base, camp);
}

/**
 * IS RECORD `r` PROVABLY IMPOSSIBLE? Its health or its maximum past foeHealthBound, or a mark no builder gives its kind
 * (the City Watch never an elite or a champion; a champion never under CHAMPION_MIN_LEVEL - systems/eliteFoes.js
 * eliteEligible, systems/champions.js applyChampion). Null when it stands; else what it claimed against what it may
 * (`{ t, k, mx }`: its type, its claimed maximum or health, the bound) - the evidence a case keeps. Pure.
 * @param {any} r @param {{ lane?: 'street'|'dungeon'|'any', camp?: boolean }} [o]
 * @returns {{ t: number, k: number, mx: number }|null}
 */
export function foeStatsRefusal(r, o = {}) {
  if (!r || !Number.isInteger(r.t)) return null;
  const level = isClass(r.t) ? r.l : FOE_BOUND_ROWS.get(r.t)?.[1];
  if (r.t === FOE_BOUND.watch && (r.z === 1 || Number.isInteger(r.cp))) return { t: r.t, k: r.k ?? r.h ?? 0, mx: 0 };
  if (Number.isInteger(r.cp) && Number.isInteger(level) && level < FOE_BOUND.championMinLevel) return { t: r.t, k: r.k ?? r.h ?? 0, mx: 0 };
  const mx = foeHealthBound(r, o);
  if (mx == null) return null;
  const k = Math.max(Number.isFinite(r.k) ? r.k : 0, Number.isFinite(r.h) ? r.h : 0);
  return k > mx ? { t: r.t, k, mx } : null;
}
