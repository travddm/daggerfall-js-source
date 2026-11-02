// SOFTCAP1: SKILLS PAST 100 - the softcap, the hard cap, the
// milestones and the "real use" law. A LEAF (its one import, masterSkills.js, imports nothing), so
// skills.js (itself a leaf the whole tree reads), advancement.js, the
// combat formulas and the UI can all read it without closing a cycle.
//
// THE FOUR NUMBERS A PLAYER IS TOLD, AND WHERE EACH LIVES
//
//   1..100    exactly DFU's law (advancement.js, untouched below 100)
//   100..125  a point costs 1.5x the uses         SOFTCAP_TIERS
//   125..150  a point costs  2x the uses
//   150..200  a point costs  4x the uses          SKILL_HARD_CAP = 200
//
//   Past 100 a point is worth a QUARTER of a point below it
//   (OVERCAP_POINT_WEIGHT), plus the milestone bonuses at 125/150/175/200.
//   What a FORMULA reads is `effectiveSkill(v)` - so a 200 is not twice a
//   100 in any to-hit, damage, spell or lock roll; it is 140 (100 + 25 +
//   the 15 milestone points). What a SCREEN prints is the real number.
//
// THE REAL-USE LAW (tallies above 100)
//
//   A use of a skill that already sits at 100+ is WEIGHTED before it is
//   counted: `overcapTallyWeight`. Combat skills need a foe, and the
//   foe's tier is measured against the SKILL, not the character's level
//   (so mentor mode cannot launder it): tier(foe) = 5 * level + 30 - the
//   same line SetEnemyCareer draws every enemy's skills on
//   (enemyEntity.js skillsLevel), unclamped. r = tier / skill:
//
//     r < 0.75            nothing          (a weak foe teaches a master nothing)
//     0.75 <= r < 1       ((r - 0.75) / 0.25)^2   (a smooth ramp in)
//     r >= 1              1 + 0.5 * min(1, (r - 1) / 0.5)   (up to 1.5x)
//
//   So at 100 a foe of level 9 starts to teach and level 14 teaches in
//   full; at 150 it is level 17 / 24; at 200 level 24 / 34. Spam is
//   damped separately: each skill keeps a leaky counter of its recent
//   weighted uses (half-life SPAM_HALF_LIFE_MS) and a use past the
//   category's free burst is worth free/recent of itself.
//
//   MOVE-REAL: Running, Jumping, Swimming and Climbing take neither -
//   their motion tallies count the ground actually covered instead
//   (movementTallyWeight, below).


export const SKILL_SOFT_CAP = 100;
export const SKILL_HARD_CAP = 200;
/** A point above the soft cap is worth this much of a point below it. */
export const OVERCAP_POINT_WEIGHT = 0.25;

/** The cost ladder: the uses a raise needs, multiplied, by the value the
 *  skill is LEAVING (100 -> 101 is the first 1.5x point). LADDER-CUT ("1.5 2 4"). */
export const SOFTCAP_TIERS = Object.freeze([
  Object.freeze({ from: 100, to: 125, mult: 1.5 }),
  Object.freeze({ from: 125, to: 150, mult: 2 }),
  Object.freeze({ from: 150, to: 200, mult: 4 }),
]);

/** The milestones: effective points granted ON TOP of the quarter-weight
 *  climb, each once reached, plus the title the notice prints. */
export const SKILL_MILESTONES = Object.freeze([
  Object.freeze({ at: 125, bonus: 2, title: 'Expert' }),
  Object.freeze({ at: 150, bonus: 3, title: 'Master' }),
  Object.freeze({ at: 175, bonus: 4, title: 'Grandmaster' }),
  Object.freeze({ at: 200, bonus: 6, title: 'Legend' }),
]);

export const clampSkill = (v) => Math.max(0, Math.min(SKILL_HARD_CAP, Number.isFinite(v) ? v : 0));

/** The uses multiplier for raising a skill that currently reads `v`. */
export function softcapCostMultiplier(v) {
  if (!(v >= SKILL_SOFT_CAP)) return 1;
  for (const t of SOFTCAP_TIERS) if (v < t.to) return t.mult;
  return Infinity;   // at the hard cap: nothing more to buy
}

/** The milestone that a skill reaching exactly `v` has just passed, or null. */
export const milestoneAt = (v) => SKILL_MILESTONES.find((m) => m.at === v) ?? null;

/** The sum of every milestone bonus at or below `v`. */
export function milestoneBonus(v) {
  let b = 0;
  for (let i = 0; i < SKILL_MILESTONES.length; i++) if (v >= SKILL_MILESTONES[i].at) b += SKILL_MILESTONES[i].bonus;   // AUDIT MARTIAL L2 F3: indexed - a swing's pace reads the climb every frame of the swing
  return b;
}

/** THE ONE CONVERSION a formula sees: 1..100 verbatim; above it a
 *  quarter a point plus the milestones. Integer, because DFU's formulas
 *  are integer arithmetic and some shift. */
export function effectiveSkill(v) {
  if (!(v > SKILL_SOFT_CAP)) return v;
  const c = clampSkill(v);
  return Math.floor(SKILL_SOFT_CAP + (c - SKILL_SOFT_CAP) * OVERCAP_POINT_WEIGHT + milestoneBonus(c));
}

/** The highest effective value a skill can reach (a HUD bar's full width). */
export const EFFECTIVE_SKILL_MAX = effectiveSkill(SKILL_HARD_CAP);

/** B1 (tame player power): the points of a mastered weapon skill or Critical Strike past 100 that still count to aim (to hit
 *  and to crit). A skill-200 weapon read 140 to hit, +60 over a skill-100 one (+90 after PCAAO's x1.5), and Critical Strike
 *  140 made a crit 20% harder and likelier; together +32% a blow on a bow. Past 100 a mastered skill now pays in damage
 *  (weaponMastery.js), not in aim: +10 here. */
export const AIM_PAST_MAX = 10;

// CLIMB-PAST (FIELD BUGS 2026-10-01 #7, "Running jumping climbing dint work passed 100"). The run, the swim and the jump read the effective value in their own speed laws, so their
// points past 100 move the body. Climbing drives one thing in Daggerfall - CalculateClimbingChance, which clamps the
// skill to 5..95 and is certain at 95 (Luck 40 or more) - and GetClimbingSpeed reads no skill, so a Climbing mastered
// to 200 climbed exactly as a 95. Past 100 its points go to the climb's SPEED: each effective point over 100 climbs this
// much faster (x1.4 at 200, effective 140), from the same live value the check reads; to 100 the climb is base / 3.
export const CLIMB_OVERCAP_SPEED_PER_POINT = 0.01;
/** The climb speed's multiplier for a LIVE Climbing value (skills.js skillValue): 1 to 100, bounded at the effective cap. */
export function overcapClimbSpeed(liveClimbing) {
  const gain = Math.min(EFFECTIVE_SKILL_MAX, liveClimbing) - SKILL_SOFT_CAP;
  return gain > 0 ? 1 + gain * CLIMB_OVERCAP_SPEED_PER_POINT : 1;   // a missing value (NaN) climbs as DFU's
}

// ---- the real-use law -------------------------------------------------

/** Skill ids, kept numeric here so this leaf needs no import (skills.js SKILLS). */
const COMBAT_SKILL_IDS = new Set([19, 20, 28, 29, 30, 31, 32, 33, 34]);   // Backstabbing, Dodging, the five weapons + HandToHand, Archery, CriticalStrike
const MAGIC_SKILL_IDS = new Set([22, 23, 24, 25, 26, 27]);               // the six schools

export const SKILL_CATEGORY = Object.freeze({ combat: 'combat', magic: 'magic', utility: 'utility' });
export const skillCategory = (id) => (COMBAT_SKILL_IDS.has(id) ? SKILL_CATEGORY.combat
  : MAGIC_SKILL_IDS.has(id) ? SKILL_CATEGORY.magic : SKILL_CATEGORY.utility);

/** How long a struck/striking foe stays "the foe" for the tallies that follow the blow. */
export const CHALLENGE_TTL_MS = 6000;
/** A spell cast with no foe in the fight (a self-heal, a light) above 100 counts this much - and BAL9a (bible/05-Combat/
 *  Balance-Arc.md section 15), every spell's floor: a foe tough for the school raises it, none takes it lower. */
export const UNCHALLENGED_MAGIC_WEIGHT = 0.25;
export const SPAM_HALF_LIFE_MS = 60000;
/** Weighted uses a skill may take inside roughly one half-life before each further use is damped. */
export const SPAM_FREE_BURST = Object.freeze({ combat: 40, magic: 10, utility: 6 });

/** A foe's tier on the skill scale - SetEnemyCareer's 5L+30, unclamped. */
export function challengeTier(foe) {
  const lv = Number(foe?.level);
  return Number.isFinite(lv) && lv > 0 ? lv * 5 + 30 : 0;
}

/** r = tier / skill, mapped to a weight (see the header). */
export function challengeQuality(tier, skill) {
  if (!(tier > 0) || !(skill > 0)) return 0;
  const r = tier / skill;
  if (r < 0.75) return 0;
  if (r < 1) { const x = (r - 0.75) / 0.25; return x * x; }
  return 1 + 0.5 * Math.min(1, (r - 1) / 0.5);
}

/** Remember the foe this entity just traded a blow with (formulas.js calls it) - or a spell (BAL9: scenes/hostMagic.js, a
 *  spell of mine reaching a foe and a foe's reaching me). */
export function noteSkillChallenge(entity, foe, now = Date.now()) {
  if (!entity || !foe || entity === foe) return;
  const tier = challengeTier(foe);
  if (tier > 0) entity._skillChallenge = { tier, at: now };
}

function liveChallenge(entity, now) {
  const c = entity?._skillChallenge;
  return c && now - c.at <= CHALLENGE_TTL_MS ? c : null;
}

/** The damped weight of ONE more use given the skill's leaky counter (mutates it). */
function spamWeight(entity, skillId, category, amount, now) {
  const all = (entity._skillSpam ??= {});
  const s = all[skillId] ?? { v: 0, at: now };
  const dt = Math.max(0, now - s.at);
  s.v = s.v * Math.pow(0.5, dt / SPAM_HALF_LIFE_MS) + amount;
  s.at = now;
  all[skillId] = s;
  const free = SPAM_FREE_BURST[category] ?? 6;
  return s.v <= free ? 1 : free / s.v;
}

/**
 * THE REAL-USE WEIGHT of `amount` uses of a skill whose REAL value is
 * `skill` (>= 100). 0 means the use taught nothing. Never above 1.5x.
 */
export function overcapTallyWeight(entity, skillId, amount, skill, now = Date.now()) {
  if (!(amount > 0) || skill >= SKILL_HARD_CAP) return 0;
  const cat = skillCategory(skillId);
  const ch = liveChallenge(entity, now);
  let q;
  if (cat === SKILL_CATEGORY.combat) q = ch ? challengeQuality(ch.tier, skill) : 0;
  else if (cat === SKILL_CATEGORY.magic) q = Math.max(UNCHALLENGED_MAGIC_WEIGHT, ch ? challengeQuality(ch.tier, skill) : 0);   // BAL9a: a spell now answers its foe (scenes/hostMagic.js) - a tough one raises its weight, a weak one never takes it under a cast at a wall
  else q = 1;
  if (q <= 0) return 0;
  return amount * q * spamWeight(entity, skillId, cat, amount * q, now);
}

// ---- the movement skills (MOVE-REAL) --------------------------------------
//
// MOVE-REAL. The spam counter above would stop a runner cold - Running tallies four times
// a second against a utility burst of 6 a minute, about 2% of a run - so past 100 a MOTION tally (the run's, the
// jump's, the swim's, the climb's check; skills.js tallyMovementSkill) takes no spam weight. It takes the ground the
// body actually covered under its own power instead: the motor's odometer (player/motor.js), which counts its own
// steps only - a deck's carry, a helm pin, a teleport or a load is none of it. Each use needs `stride` metres of the
// skill's own axis since that skill's last use; one short of it counts the part it made, and what is left over rides
// to the next use, never more than MOVE_CREDIT_CAP uses of it (a walk banks no run). So the run key held standing
// still or against a wall, a hop in place, treading water and a climber pressed under a ledge teach a master nothing,
// and nothing can be trained AFK. A guild's or a quest's training is no motion and keeps the law above.
//
// The strides sit under an honest move's worst case, so real movement counts whole: a run is 5-10 m/s against the
// stride's 4, a swim at 100 about 3 m/s against 0.6, a climb about 1.5 m/s against 0.6. Running constantly (four
// whole uses a second, a career multiplier of 1, average Reflexes) then takes, from 100:
//
//   level     to 125      to 150      to 200
//     20      ~13 h       ~34 h       ~140 h      (LADDER-CUT's 1.5 / 2 / 4; 35 / 120 / 540 at 4 / 8 / 16)
//     30      ~19 h       ~50 h       ~207 h

/** Per movement skill (skills.js ids): the odometer axis its motion is read on and the metres one use needs.
 *  h = across the ground, v = up or down, hv = either (through water). */
export const MOVEMENT_SKILLS = Object.freeze({
  3: Object.freeze({ axis: 'h', stride: 1 }),     // Jumping: a jump that carried you somewhere (one in place goes nowhere)
  17: Object.freeze({ axis: 'hv', stride: 3 }),   // Swimming: a use a game minute (5 real seconds) through the water
  18: Object.freeze({ axis: 'v', stride: 0.5 }),  // Climbing: a check each ~0.8 s up or down the wall
  21: Object.freeze({ axis: 'h', stride: 1 }),    // Running: a use every quarter second (DFU's cadence)
});
/** The most a movement skill's unspent motion is worth, in uses. */
export const MOVE_CREDIT_CAP = 2;

export const isMovementSkill = (id) => Object.prototype.hasOwnProperty.call(MOVEMENT_SKILLS, id);

/**
 * THE MOVEMENT WEIGHT of `amount` motion uses of a movement skill at 100+ (0 = it went nowhere). Reads the
 * odometer the host handed the entity (`entity._odometer`, the motor's live { h, v }); none handed, nothing moved.
 * Each skill keeps its own mark on it (`entity._moveMark`), so the run and the jump never spend each other's ground.
 */
export function movementTallyWeight(entity, skillId, amount, skill) {
  const law = MOVEMENT_SKILLS[skillId];
  if (!law || !(amount > 0) || skill >= SKILL_HARD_CAP) return 0;
  const odo = entity?._odometer;
  const read = odo ? (law.axis === 'h' ? odo.h : law.axis === 'v' ? odo.v : odo.h + odo.v) : NaN;
  if (!Number.isFinite(read)) return 0;
  const marks = (entity._moveMark ??= {});
  const m = marks[skillId];
  // a first use, or another motor's odometer (a host swap), starts the mark with nothing banked
  if (!m || m.src !== odo || !(read >= m.at)) { marks[skillId] = { src: odo, at: read, credit: 0 }; return 0; }
  m.credit = Math.min(MOVE_CREDIT_CAP, m.credit + (read - m.at) / law.stride);
  m.at = read;
  const w = Math.min(amount, m.credit);
  m.credit -= w;
  return w;
}

/** The inverse of effectiveSkill: the smallest raw value that reads `target`. */
export function rawSkillForEffective(target) {
  if (!(target > SKILL_SOFT_CAP)) return Math.max(0, Math.round(target));
  for (let v = SKILL_SOFT_CAP; v <= SKILL_HARD_CAP; v++) if (effectiveSkill(v) >= target) return v;
  return SKILL_HARD_CAP;
}
