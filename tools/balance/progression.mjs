// How a reference build grows with level: skills, attributes and hit points.
//
// The rule is the same for both rule sets except where the rule set itself differs:
//   - Level L needs a counted-skill sum gain of 15 L - 28 (DFU FormulaHelper.CalculatePlayerLevel, inverted). The gain
//     is spread evenly over the build's six counted skills, each held at its cap. Skills the level sum does not count
//     rise at half that pace.
//   - DFU caps every skill at 100, so its sum tops out at 600 and its level at about 31 (`ceilingLevel`). Above that
//     the DFU character is the level-31 character; callers mark such a cell.
//   - With Master Skills a mastered skill climbs to 200 (it reads 140; skillSoftcap.js effectiveSkill). The level sum
//     then counts effective points, tops out at 800 and, with the online level law, reaches level 45 exactly at the top
//     (levelClimb.js onlineLevelFor).
//   - Attributes: 5 points a level (DFU bonus pool Range(4,6), mean 5; online fixed 5), split by the build's weights, each
//     stat held at 100. `pointsPerLevel` 12 is the Oblivion-style levelling mod (audit A23).
//   - Hit points: 25 + h at level 1 (rollMaxHealthLevel1), then each level adds the class's mean roll plus the
//     Endurance modifier at that level (CalculateHitPointsPerLevelUp), never under 1.
import { ONLINE_LEVEL_CAP, onlineLevelFor } from '../../src/systems/levelClimb.js';
import { SKILL_SOFT_CAP, effectiveSkill, rawSkillForEffective, EFFECTIVE_SKILL_MAX } from '../../src/systems/skillSoftcap.js';
import { SKILL_START, MISC_SKILL_START, LEVEL_PER_SUM, LEVEL_HEAD_START, STAT_KEYS, startSumOf } from './builds.mjs';

export const DFU_SKILL_CAP = 100;
export const SKILL_COUNT = 35;
export const DFU_POINTS_PER_LEVEL = 5;
export const VIRTUE_POINTS_PER_LEVEL = 12;
export const ATTRIBUTE_CAP = 100;

/** Counted-sum gain a DFU level needs: the smallest gain G with floor((G + 28) / 15) = level. */
export const dfuGainForLevel = (level) => Math.max(0, LEVEL_PER_SUM * level - LEVEL_HEAD_START);

/** The highest level DFU's cap on skills lets a build reach. */
export function dfuCeilingLevel(build) {
  const room = build.counted.reduce((s, c) => s + (DFU_SKILL_CAP - SKILL_START[c.group]), 0);
  return Math.floor((room + LEVEL_HEAD_START) / LEVEL_PER_SUM);
}

/** The effective counted-sum gain the online level law needs for `level`: the smallest climb that reads `level`. */
export function onlineGainForLevel(build, level) {
  const start = startSumOf(build);
  for (let gain = 0; gain <= 800; gain++) {
    if (onlineLevelFor(start, start + gain) >= level) return gain;
  }
  return 800 - start;
}

/** Spread `gain` evenly over `caps` (each skill's room above its start), holding each at its cap and sharing the overflow. */
export function spreadEvenly(gain, rooms) {
  const out = rooms.map(() => 0);
  let left = gain;
  let open = rooms.map((_, i) => i);
  while (left > 1e-9 && open.length > 0) {
    const share = left / open.length;
    let spent = 0;
    for (const i of open) {
      const take = Math.min(share, rooms[i] - out[i]);
      out[i] += take;
      spent += take;
    }
    left -= spent;
    open = open.filter((i) => out[i] < rooms[i] - 1e-9);
  }
  return out;
}

/** Attribute points `total`, split by `weights` (stat -> share), each stat held at the cap; overflow goes to the others. */
export function spreadAttributes(base, weights, total) {
  const stats = { ...base };
  let left = total;
  let open = Object.keys(weights);
  while (left > 1e-9 && open.length > 0) {
    const weightSum = open.reduce((s, k) => s + weights[k], 0);
    const stillOpen = [];
    let spent = 0;
    for (const k of open) {
      const want = (left * weights[k]) / weightSum;
      const take = Math.min(want, ATTRIBUTE_CAP - stats[k]);
      stats[k] += take;
      spent += take;
      if (stats[k] < ATTRIBUTE_CAP - 1e-9) stillOpen.push(k);
    }
    left -= spent;
    if (spent < 1e-9) break;
    open = stillOpen;
  }
  for (const k of STAT_KEYS) stats[k] = Math.floor(stats[k] + 1e-9);
  return stats;
}

const hitPointsModifier = (endurance) => Math.floor(endurance / 10) - 5;   // FormulaHelper.HitPointsModifier
const meanLevelRoll = (h) => (Math.trunc(h / 2) + h) / 2;

/** Mean maximum health at `level`, reading Endurance as it stands at each level of the climb. */
export function expectedMaxHealth(build, level, enduranceAt) {
  const h = build.hpPerLevel;
  let hp = 25 + h;
  for (let lv = 2; lv <= level; lv++) hp += Math.max(1, meanLevelRoll(h) + hitPointsModifier(enduranceAt(lv)));
  return Math.floor(hp);
}

/**
 * @param {object} build one of BUILDS
 * @param {number} level the level asked for
 * @param {{masterSkills?: boolean, onlineLevel?: boolean, pointsPerLevel?: number}} rules
 * @returns the character at the level it reaches: { level, asked, ceiling, stats, skills (raw array), mastered, effective, maxHealth }
 */
export function progressionOf(build, level, { masterSkills = false, onlineLevel = false, pointsPerLevel = DFU_POINTS_PER_LEVEL } = {}) {
  const ceilingLevel = masterSkills ? ONLINE_LEVEL_CAP : dfuCeilingLevel(build);
  const reached = Math.min(level, ceilingLevel);
  const counted = build.counted;
  const starts = counted.map((c) => SKILL_START[c.group]);
  const caps = counted.map((c, i) => {
    if (!masterSkills) return DFU_SKILL_CAP;
    const isLastMinor = c.group === 'minor' && i === counted.length - 1;
    return isLastMinor ? DFU_SKILL_CAP : EFFECTIVE_SKILL_MAX;
  });
  const gain = masterSkills && onlineLevel ? onlineGainForLevel(build, reached) : dfuGainForLevel(reached);
  const rooms = caps.map((cap, i) => cap - starts[i]);
  const gains = spreadEvenly(Math.min(gain, rooms.reduce((a, b) => a + b, 0)), rooms);
  const skills = new Array(SKILL_COUNT).fill(MISC_SKILL_START);
  const effective = {};
  const mastered = [];
  counted.forEach((c, i) => {
    const eff = Math.round(starts[i] + gains[i]);
    const raw = masterSkills && eff > SKILL_SOFT_CAP ? rawSkillForEffective(eff) : Math.min(eff, DFU_SKILL_CAP);
    skills[c.skill] = raw;
    effective[c.skill] = effectiveSkill(raw);
    if (raw > SKILL_SOFT_CAP) mastered.push(c.skill);
  });
  const perSkill = gains.reduce((a, b) => a + b, 0) / gains.length;
  for (const id of build.support) {
    skills[id] = Math.min(DFU_SKILL_CAP, Math.round(SKILL_START.minor + perSkill / 2));
    effective[id] = skills[id];
  }
  const pointsAt = (lv) => Math.max(0, lv - 1) * pointsPerLevel;
  const statsAt = (lv) => spreadAttributes(build.baseStats, build.statWeights, pointsAt(lv));
  const stats = statsAt(reached);
  const maxHealth = expectedMaxHealth(build, reached, (lv) => statsAt(lv).endurance);
  return {
    level: reached, asked: level, ceiling: reached < level, stats, skills, mastered, effective, maxHealth,
  };
}
