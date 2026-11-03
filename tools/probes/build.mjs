// Builds the game once for the probes and the in-game checks (docs/testing/game-probes.md, "Speed").
//
//   node tools/probes/build.mjs [outDir]     default outDir: scratch/probe-dist
//
// A Vite dev server transforms every module on its first request, in every run, and a probe's page asks for
// thousands of them: each start of the game world cost minutes on CI. A built game is a few chunks. The probes serve
// it with `vite preview` when PROBE_DIST names the folder (lib/harness.mjs).
//
// It runs `vite build` without the `prebuild` hook: buildTag.mjs rewrites a tracked file, and the probes do not read
// the build tag. Run `sh tools/fetch-vendor.sh` first, as the deploy does.
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const outDir = resolve(process.argv[2] || join(ROOT, 'scratch', 'probe-dist'));

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
await build({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), build: { outDir, emptyOutDir: true }, logLevel: 'warn' });
console.log(`built the game into ${outDir} in ${Math.round((Date.now() - t0) / 1000)}s`);
