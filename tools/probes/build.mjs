// Builds the game once for the probes and the in-game checks (docs/testing/game-probes.md, "Speed").
//
//   node tools/probes/build.mjs [outDir] [--online]     default outDir: scratch/probe-dist
//
// --online builds with the online probe's in-memory edits of the source (08-online.mjs plugins): that probe's page needs
// three seams the shipped game does not have. Such a build serves only that probe.
//
// A Vite dev server transforms every module on its first request, in every run, and a probe's page asks for
// thousands of them: each start of the game world cost minutes on CI. A built game is a few chunks. The probes serve
// it with `vite preview` when PROBE_DIST names the folder (lib/harness.mjs).
//
// The build is not minified: probes read window hooks that answer a class's name (`__overlayKind`: Inventory, Tavern,
// Rest), and a minifier renames the classes. Nothing a player gets changes: this build is never deployed.
//
// It runs `vite build` without the `prebuild` hook: buildTag.mjs rewrites a tracked file, and the probes do not read
// the build tag. Run `sh tools/fetch-vendor.sh` first, as the deploy does.
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const online = args.includes('--online');
const outDir = resolve(args.find((a) => !a.startsWith('--')) || join(ROOT, 'scratch', 'probe-dist'));

// Vite reads every file under vendor/ (about 7,600 PNGs) at once. Windows runs out of file handles (EMFILE);
// Linux does not. Capping the reads in flight is harmless there and lets a local build finish.
const MAX_READS = 64;
const realRead = fs.promises.readFile;
const waiting = [];
let active = 0;
fs.promises.readFile = async function cappedReadFile(...args) {
  if (active >= MAX_READS) await new Promise((go) => waiting.push(go));
  active++;
  try {
    return await realRead.apply(this, args);
  } finally {
    active--;
    waiting.shift()?.();
  }
};

const t0 = Date.now();
process.chdir(ROOT);
const { build } = await import('vite');
await build({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.js'),
  build: { outDir, emptyOutDir: true, minify: false },
  plugins: online ? (await import('./08-online.mjs')).plugins() : undefined,
  logLevel: 'warn',
});
console.log(`built the game into ${outDir} in ${Math.round((Date.now() - t0) / 1000)}s`);
