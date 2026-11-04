// The content layer of the balance harness: endgame content measured against the finished power budget (B6).
//   - foe tiers (tiers.mjs): a foe of each tier, solo: seconds to kill it, damage taken a second, seconds to die, the
//     biggest blow as a share of the body;
//   - the relay's bosses (gate, Abyss Remnant): the health they bring against the character's real damage a second, so a
//     fight's length for a group of any size, and the damage-bucket cap.
// docs/systems/balance-harness.md says what a number means.
import { BUILDS, BUILD_NAMES } from './builds.mjs';
import { applyLayers, LAYER_NAMES, DEFAULT_LAYERS, MC_DEFAULT_SWINGS } from './ours.mjs';
import { representativeFoes } from './foes.mjs';
import { oursCell } from './measure.mjs';
import { DEFAULT_GEAR_PERCENTILE } from './gear.mjs';
import { CONTENT_TIERS, CONTENT_TIER_NAMES } from './tiers.mjs';
import { dpsRef, BOSS_TTK_S, BUCKET_RATE_X, BUCKET_DEPTH_X } from '../../src/net/gate/gateBrain.js';
import { SD_TTK_S, SD_SHARE_X } from '../../src/net/superDungeon/sdRemnant.js';

export const CONTENT_LEVELS = Object.freeze([30, 45]);
/** The dungeon table the tiers' foes are picked from: a Desecrated Temple holds the tables' top band (Daedra, liches). */
export const CONTENT_DUNGEON = 4;
/** Typical gear, and the maxed character (every source at its top, the online health at its most). */
export const GEARS = Object.freeze({
  typical: new Set(DEFAULT_LAYERS),
  maxed: new Set([...DEFAULT_LAYERS, 'ceiling', 'skyHealth'].filter((name) => name !== 'hero')),
});

const gearLayers = (name) => new Set([...GEARS[name]].filter((layer) => LAYER_NAMES.includes(layer)));

/**
 * One tier against one character: the foe is the table's strong pick at the tier's level.
 * @returns {{tier: string, build: string, gear: string, level: number, foe: string, foeHealth: number, kill: number, taken: number, dies: number, most: number, mostShare: number, body: number}}
 */
export function tierCell({
  tier,
  build,
  gear,
  level,
  swings = MC_DEFAULT_SWINGS,
  gearPercentile = DEFAULT_GEAR_PERCENTILE,
  careerOf = () => null,
  dungeon = CONTENT_DUNGEON,
}) {
  const layers = gearLayers(gear);
  const foeLevel = Math.max(level, CONTENT_TIERS[tier].foeLevel ?? 0);
  const id = representativeFoes(foeLevel, dungeon).strong;
  applyLayers(layers);
  const cell = oursCell(BUILDS[build], build, level, id, layers, {
    career: careerOf(id) ?? undefined,
    swings,
    gearPercentile,
    dungeonType: dungeon,
    kind: tier,
  });
  return {
    tier,
    build,
    gear,
    level,
    foe: cell.foeName,
    foeHealth: cell.foeHealth,
    kill: cell.ttk,
    taken: cell.foeDps,
    dies: cell.ttkPlayer,
    most: cell.perAttackMost,
    mostShare: cell.perAttackMost / cell.playerHealth,
    body: cell.playerHealth,
  };
}

/** The character's damage a second on the table's average foe at a level (what the relay's bosses are measured by). */
export function characterDps({
  build,
  gear,
  level,
  swings = MC_DEFAULT_SWINGS,
  gearPercentile = DEFAULT_GEAR_PERCENTILE,
  careerOf = () => null,
  dungeon = 1,
}) {
  const layers = gearLayers(gear);
  const id = representativeFoes(level, dungeon).average;
  applyLayers(layers);
  return oursCell(BUILDS[build], build, level, id, layers, {
    career: careerOf(id) ?? undefined,
    swings,
    gearPercentile,
    dungeonType: dungeon,
  }).dps;
}

/**
 * A relay boss: the health a level-`level` claim brings is `ttkSeconds` of the reference damage; the character deals `dps`
 * (never past the bucket's rate). Answers the seconds a group of `size` such characters takes, and the share of the
 * reference the character really deals.
 */
export function bossFight({ ttkSeconds, level, dps, size = 1 }) {
  const ref = dpsRef(level);
  const rate = Math.min(dps, BUCKET_RATE_X * ref);
  return {
    ref,
    dps,
    rate,
    share: dps / ref,
    seconds: (ttkSeconds * ref) / rate,
    groupSeconds: (ttkSeconds * ref * size) / (rate * size),
  };
}

export const RELAY_BOSSES = Object.freeze({
  gate: { ttkSeconds: BOSS_TTK_S, note: 'the Oblivion gate (BOSS_TTK_S x dpsRef a claim)' },
  remnant: { ttkSeconds: SD_TTK_S * SD_SHARE_X, note: 'the Abyss Remnant (SD_TTK_S x SD_SHARE_X x dpsRef a claim)' },
});

/** Everything the content report holds, for the given builds and gears. */
export function contentReport({
  builds = BUILD_NAMES,
  levels = CONTENT_LEVELS,
  gears = Object.keys(GEARS),
  swings = 1500,
  careerOf = () => null,
} = {}) {
  const tiers = [];
  const bosses = [];
  for (const build of builds) {
    for (const gear of gears) {
      for (const level of levels) {
        for (const tier of CONTENT_TIER_NAMES) tiers.push(tierCell({ tier, build, gear, level, swings, careerOf }));
        const dps = characterDps({ build, gear, level, swings, careerOf });
        for (const [name, spec] of Object.entries(RELAY_BOSSES))
          bosses.push({ boss: name, build, gear, level, ...bossFight({ ttkSeconds: spec.ttkSeconds, level, dps }) });
      }
    }
  }
  return { tiers, bosses, depthSeconds: BUCKET_DEPTH_X / BUCKET_RATE_X };
}

const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : 'never');

export function contentMarkdown(report) {
  const lines = ['# Balance harness: content', ''];
  lines.push(
    '## Foe tiers, solo',
    '',
    "The strong foe of the table at the tier's level (`kill` the seconds to kill it, `taken` the damage a second it deals, `dies` the seconds to die, `K` = dies / kill: above 1 the character wins alone, `top blow` the biggest blow it landed over a body).",
    '',
  );
  lines.push(
    '| Tier | Gear | Build | Lvl | Foe | Foe hp | kill s | taken /s | dies s | K | top blow |',
    '| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const c of report.tiers)
    lines.push(
      `| ${c.tier} | ${c.gear} | ${c.build} | ${c.level} | ${c.foe} | ${f(c.foeHealth, 0)} | ${f(c.kill)} | ${f(c.taken)} | ${f(c.dies)} | ${f(c.dies / c.kill, 2)} | ${f(100 * c.mostShare, 0)}% |`,
    );
  lines.push(
    '',
    '## Relay bosses',
    '',
    "The seconds a group takes at the character's real damage a second (`share` of the reference `dpsRef`; the bucket stops a rate over 3x it). The fight's length does not depend on the group size: each claim brings its own health.",
    '',
  );
  lines.push(
    '| Boss | Gear | Build | Lvl | dpsRef | dps | share | fight s |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const b of report.bosses)
    lines.push(
      `| ${b.boss} | ${b.gear} | ${b.build} | ${b.level} | ${f(b.ref, 0)} | ${f(b.dps, 0)} | ${f(b.share, 2)} | ${f(b.seconds, 0)} |`,
    );
  return `${lines.join('\n')}\n`;
}
