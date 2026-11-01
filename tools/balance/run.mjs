#!/usr/bin/env node
// Balance harness: combat balance by level under Daggerfall Unity's rules and this game's.
//
//   node tools/balance/run.mjs [--build warrior,mage] [--levels 1,10,45] [--layers default|all|none|a,b|-x|+y]
//                              [--dungeon orcstronghold] [--swings 4000] [--gear-percentile 0.9]
//                              [--arena2 PATH] [--json out.json] [--md out.md] [--ablate]
//
// docs/systems/balance-harness.md says what a number means.
import { writeFileSync } from 'node:fs';
import { isMain } from '../lib/isMain.mjs';
import { BUILD_NAMES } from './builds.mjs';
import { DUNGEON_NAMES, DEFAULT_DUNGEON } from './foes.mjs';
import { LAYER_NAMES, DEFAULT_LAYERS, MC_DEFAULT_SWINGS } from './ours.mjs';
import { DEFAULT_GEAR_PERCENTILE } from './gear.mjs';
import { careerLoader } from './careers.mjs';
import { buildReport, toMarkdown, DEFAULT_LEVELS } from './report.mjs';

const list = (text) => text.split(',').map((part) => part.trim()).filter(Boolean);

/** `--layers` words: default, all, none, a comma list, or +x / -x edits of the default set. */
export function parseLayers(text = 'default') {
  const words = list(text);
  const edits = words.every((word) => /^[+-]/.test(word));
  let set = new Set(edits ? DEFAULT_LAYERS : []);
  for (const word of words) {
    const name = word.replace(/^[+-]/, '');
    if (name === 'default') set = new Set(DEFAULT_LAYERS);
    else if (name === 'all') set = new Set(LAYER_NAMES);
    else if (name === 'none') set = new Set();
    else if (!LAYER_NAMES.includes(name)) throw new Error(`unknown layer "${name}"; layers: ${LAYER_NAMES.join(', ')}`);
    else if (word.startsWith('-')) set.delete(name);
    else set.add(name);
  }
  return set;
}

export function parseArgs(argv) {
  const options = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument "${argv[i]}"`);
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) options.set(key, true);
    else { options.set(key, next); i++; }
  }
  return options;
}

export async function main(argv) {
  const options = parseArgs(argv);
  const builds = options.has('build') ? list(options.get('build')) : BUILD_NAMES;
  for (const name of builds) if (!BUILD_NAMES.includes(name)) throw new Error(`unknown build "${name}"; builds: ${BUILD_NAMES.join(', ')}`);
  const dungeonWord = options.get('dungeon');
  const dungeon = dungeonWord === undefined ? DEFAULT_DUNGEON : (DUNGEON_NAMES[String(dungeonWord).toLowerCase().replace(/[^a-z]/g, '')] ?? Number(dungeonWord));
  if (!Number.isInteger(dungeon) || dungeon < 0 || dungeon > 18) throw new Error(`unknown dungeon "${dungeonWord}"`);
  const arena2 = options.get('arena2') ?? process.env.ARENA2_PATH;
  const careerOf = await careerLoader(typeof arena2 === 'string' ? arena2 : null);
  const common = {
    builds, dungeon, swings: Number(options.get('swings') ?? MC_DEFAULT_SWINGS),
    gearPercentile: Number(options.get('gear-percentile') ?? DEFAULT_GEAR_PERCENTILE), careerOf,
    levels: options.has('levels') ? list(options.get('levels')).map(Number) : DEFAULT_LEVELS,
  };
  const layers = parseLayers(typeof options.get('layers') === 'string' ? options.get('layers') : 'default');
  const report = buildReport({ ...common, layers });
  if (options.has('json')) writeFileSync(options.get('json'), `${JSON.stringify(report, null, 2)}\n`);
  const markdown = toMarkdown(report);
  if (options.has('md')) writeFileSync(options.get('md'), markdown);
  if (options.has('ablate')) {
    const { ablationMarkdown } = await import('./ablate.mjs');
    process.stdout.write(ablationMarkdown(common, layers));
  } else process.stdout.write(markdown);
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });
}
