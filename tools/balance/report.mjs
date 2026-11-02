// Run the measurements and lay them out: a report object (JSON) and its markdown.
import { BUILDS, BUILD_NAMES } from './builds.mjs';
import { representativeFoes, DEFAULT_DUNGEON } from './foes.mjs';
import { dfuCell, oursCell, FIGHT_SECONDS } from './measure.mjs';
import { applyLayers, DEFAULT_LAYERS, LAYER_NAMES, MC_DEFAULT_SWINGS } from './ours.mjs';
import { DEFAULT_GEAR_PERCENTILE, MATERIAL_NAMES } from './gear.mjs';

export const DEFAULT_LEVELS = Object.freeze([1, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
export const TARGET_TOP_RATIO = 1.5;
export const TOP_LEVEL = 45;
/** The layers that act on the foe. Switched off, the character keeps its layers and meets DFU's own foe row. */
export const FOE_LAYERS = Object.freeze(['stats', 'hero']);
export const FOE_KINDS = Object.freeze(['weak', 'average', 'strong', 'elite', 'boss']);

/** The owner's target: a maxed character is about 1.5x a DFU character; the path from 1.0 at level 1 is a straight line. */
export const targetRatio = (level) => 1 + ((TARGET_TOP_RATIO - 1) * (Math.min(level, TOP_LEVEL) - 1)) / (TOP_LEVEL - 1);

const ratio = (a, b) => (b > 0 && Number.isFinite(a) && Number.isFinite(b) ? a / b : null);

/** The ratios of a row (ours over DFU). Offence: damage per second. Durability: seconds for the foe to kill the player. Power is their
 *  geometric mean, the one number compared with the target. */
export function ratiosOf(dfuCellValue, oursCellValue) {
  const offence = ratio(oursCellValue.dps, dfuCellValue.dps);
  const durability = ratio(oursCellValue.ttkPlayer, dfuCellValue.ttkPlayer);
  return {
    dps: offence, ttk: ratio(oursCellValue.ttk, dfuCellValue.ttk), foeDps: ratio(oursCellValue.foeDps, dfuCellValue.foeDps),
    ttkPlayer: durability, power: offence != null && durability != null ? Math.sqrt(offence * durability) : null,
  };
}

/**
 * @param {{builds?: string[], levels?: number[], layers?: Set<string>, dungeon?: number, swings?: number,
 *   gearPercentile?: number, careerOf?: (id: number) => object|null}} options
 */
export function buildReport({
  builds = BUILD_NAMES, levels = DEFAULT_LEVELS, layers = new Set(DEFAULT_LAYERS), dungeon = DEFAULT_DUNGEON,
  swings = MC_DEFAULT_SWINGS, gearPercentile = DEFAULT_GEAR_PERCENTILE, careerOf = () => null,
} = {}) {
  const characterLayers = new Set([...layers].filter((name) => !FOE_LAYERS.includes(name)));
  const rows = [];
  for (const buildName of builds) {
    const build = BUILDS[buildName];
    for (const level of levels) {
      const picks = representativeFoes(level, dungeon);
      for (const kind of FOE_KINDS) {
        const plain = kind === 'weak' || kind === 'average' || kind === 'strong';
        const id = plain ? picks[kind] : picks.strong;
        const career = careerOf(id);
        const cellOptions = { career: career ?? undefined, swings, gearPercentile, dungeonType: dungeon, kind: plain ? 'plain' : kind };
        applyLayers(layers);
        const oursValue = oursCell(build, buildName, level, id, layers, cellOptions);
        const dfuValue = plain ? dfuCell(build, buildName, level, id, { career, gearPercentile }) : null;
        let characterValue = null;
        if (plain) {
          applyLayers(characterLayers);
          characterValue = oursCell(build, buildName, level, id, characterLayers, cellOptions);
        }
        rows.push({
          build: buildName, level, foeKind: kind, dfu: dfuValue, ours: oursValue, oursVsDfuFoe: characterValue,
          ratios: dfuValue ? ratiosOf(dfuValue, oursValue) : null,
          characterRatios: dfuValue ? ratiosOf(dfuValue, characterValue) : null, target: targetRatio(level),
        });
      }
    }
  }
  return {
    meta: {
      layers: LAYER_NAMES.filter((name) => layers.has(name)), dungeon, swings, gearPercentile, fightSeconds: FIGHT_SECONDS,
      arena2: careerOf(7) != null, target: { topRatio: TARGET_TOP_RATIO, topLevel: TOP_LEVEL },
    },
    rows,
  };
}

const num = (value, digits = 1) => (value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits));
const times = (value) => (value == null ? 'n/a' : `x${value.toFixed(2)}`);
const seconds = (value) => (!Number.isFinite(value) ? 'never' : value.toFixed(1));

/** The markdown tables: for each build, a summary on the average foe, then every foe at each level. */
export function toMarkdown(report) {
  const lines = [];
  const { meta } = report;
  lines.push('# Balance harness');
  lines.push('');
  lines.push(`Layers on: ${meta.layers.join(', ') || 'none (this game with every layer off)'}. Dungeon table ${meta.dungeon}. ` +
    `${meta.swings} seeded swings a cell. Gear: ${meta.gearPercentile * 100}th percentile of DFU's RandomMaterial. ` +
    `Monster attributes ${meta.arena2 ? 'from ARENA2' : 'neutral (50)'}. Casters fight a ${meta.fightSeconds}-second horizon.`);
  lines.push('');
  for (const buildName of new Set(report.rows.map((r) => r.build))) {
    const rows = report.rows.filter((r) => r.build === buildName);
    lines.push(`## ${BUILDS[buildName].label}`);
    lines.push('');
    lines.push('Average foe. `*` marks a level past what DFU\'s 100-skill cap lets the build reach: the DFU column is its ceiling character.');
    lines.push('');
    lines.push('| Level | Foe | DFU dps | Ours dps | x | DFU kill s | Ours kill s | x | DFU foe dps | Ours foe dps | x | DFU dies s | Ours dies s | x | Fight power | Character power | Target | Character / target |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const row of rows.filter((r) => r.foeKind === 'average')) {
      const { dfu, ours, ratios } = row;
      lines.push(`| ${row.level}${dfu.ceiling ? '*' : ''} | ${ours.foeName} L${ours.foeLevel} | ${num(dfu.dps)} | ${num(ours.dps)} | ${times(ratios.dps)} | ` +
        `${seconds(dfu.ttk)} | ${seconds(ours.ttk)} | ${times(ratios.ttk)} | ${num(dfu.foeDps)} | ${num(ours.foeDps)} | ${times(ratios.foeDps)} | ` +
        `${seconds(dfu.ttkPlayer)} | ${seconds(ours.ttkPlayer)} | ${times(ratios.ttkPlayer)} | ${times(ratios.power)} | ${times(row.characterRatios.power)} | ${times(row.target)} | ${times(row.characterRatios.power / row.target)} |`);
    }
    lines.push('');
    lines.push('### Every foe');
    lines.push('');
    lines.push('| Level | Kind | Foe | Foe hp | DFU dps | Ours dps | DFU kill s | Ours kill s | DFU foe dps | Ours foe dps | DFU dies s | Ours dies s |');
    lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const row of rows) {
      const { dfu, ours } = row;
      lines.push(`| ${row.level}${dfu?.ceiling ? '*' : ''} | ${row.foeKind} | ${ours.foeName} | ${num(ours.foeHealth, 0)} | ${dfu ? num(dfu.dps) : 'n/a'} | ${num(ours.dps)} | ` +
        `${dfu ? seconds(dfu.ttk) : 'n/a'} | ${seconds(ours.ttk)} | ${dfu ? num(dfu.foeDps) : 'n/a'} | ${num(ours.foeDps)} | ` +
        `${dfu ? seconds(dfu.ttkPlayer) : 'n/a'} | ${seconds(ours.ttkPlayer)} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export { MATERIAL_NAMES };
