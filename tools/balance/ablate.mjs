// "With layer X tuned": the power ratio (ours / DFU, average foe) with each layer switched off in turn.
//
// A retune pull request shows its own change as a row here: the layer's switch off, or its number changed in the game
// and the harness run again.
import { buildReport, targetRatio } from './report.mjs';
import { BUILDS } from './builds.mjs';

const times = (value) => (value == null ? 'n/a' : `x${value.toFixed(2)}`);
const VIEWS = [['characterRatios', 'Character power: ours character against the DFU foe row'], ['ratios', 'Fight power: ours character against ours foe']];

export function ablationMarkdown(common, layers) {
  const lines = ['# Balance harness: power ratio (ours / DFU, average foe) with one layer off', ''];
  const sets = [['all layers on', layers], ...[...layers].map((name) => [`- ${name}`, new Set([...layers].filter((l) => l !== name))]), ['all layers off', new Set()]];
  const results = sets.map(([label, set]) => [label, buildReport({ ...common, layers: set })]);
  for (const buildName of common.builds) {
    lines.push(`## ${BUILDS[buildName].label}`, '');
    for (const [view, title] of VIEWS) {
      lines.push(`### ${title}`, '');
      lines.push(`| Layers | ${common.levels.join(' | ')} |`, `| --- | ${common.levels.map(() => '---:').join(' | ')} |`);
      lines.push(`| target | ${common.levels.map((level) => times(targetRatio(level))).join(' | ')} |`);
      for (const [label, report] of results) {
        const cells = common.levels.map((level) => {
          const row = report.rows.find((r) => r.build === buildName && r.level === level && r.foeKind === 'average');
          return times(row?.[view]?.power);
        });
        lines.push(`| ${label} | ${cells.join(' | ')} |`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}
