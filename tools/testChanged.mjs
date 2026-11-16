#!/usr/bin/env node
// The tests a change can move, and no others: the loop while working, and the test step of tools/pre-push.ts. A test
// file is chosen when
//   - it changed itself,
//   - a file it imports - through every module those import, `import`/`export ... from`/`import()` of a relative path -
//     changed, or
//   - its own text names a changed file, by its path or its name (the source pins read files by path: a comment's
//     cite, a regex over world.js, a workflow's YAML) - by name it chooses too many sometimes, never too few.
// A change to a file every test leans on (package.json, the lockfile, the test runner's own configuration) runs the
// whole suite. A test is also chosen when a file it reaches lists a folder a changed file lies in
// (tools/lib/test-scans.ts): a tree-wide sweep for every change, a helper that lists the migrations for a new one.
// Changed is: the commits since the merge base with the pull request's base (tools/lib/base-ref.ts), plus what is
// staged, unstaged and untracked. CI still runs every file on every pull request and before every deploy
// (.github/workflows/verify.yml); this decides what runs here.
//
//   npm run test:changed                       # run them
//   node tools/testChanged.mjs --list          # print them, one a line
//   node tools/testChanged.mjs --base HEAD~3   # changed since another point
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, normalize, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isMain } from './lib/isMain.mjs';
import { baseRef } from './lib/base-ref.ts';
import { isUnder, listsFolderOf, scansOf } from './lib/test-scans.ts';
import { testFiles, runTests, runnerFlags } from './testShards.mjs';   // FAST-SUITE: run as every list of tests is run - longest first, every core

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Files whose change can move every test: the whole suite runs. */
export const EVERYTHING = new Set(['package.json', 'package-lock.json', 'tsconfig.json']);

const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

/** The relative specifiers a module's text imports, resolved against its own path (repo-relative), existing files
 *  only. Pure but for the existence check. */
export function importsOf(file, text, root = ROOT) {
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    // A query (`./x.frag?raw`) is Vite's, not part of the file name: the shader file is the edge.
    const spec = (m[1] ?? m[2] ?? m[3])?.replace(/\?.*$/, '');
    if (!spec || !spec.startsWith('.')) continue;
    const base = normalize(join(dirname(file), spec));
    for (const cand of [base, `${base}.js`, `${base}.mjs`, `${base}.ts`, join(base, 'index.js'), join(base, 'index.ts')]) {
      const abs = join(root, cand);
      if (existsSync(abs) && statSync(abs).isFile()) { out.push(relative(root, abs).split('\\').join('/')); break; }
    }
  }
  return out;
}

/** A file's text, or '' for a file that is gone. */
const readText = (file, root) => {
  try { return readFileSync(join(root, file), 'utf8'); } catch { return ''; }
};

/** Every file a test file reaches through its imports, itself included. `read` lets a caller share one read of each file. */
export function closureOf(test, root = ROOT, cache = new Map(), read = (file) => readText(file, root)) {
  const seen = new Set([test]);
  const stack = [test];
  while (stack.length) {
    const f = stack.pop();
    let deps = cache.get(f);
    if (!deps) {
      deps = importsOf(f, read(f), root);
      cache.set(f, deps);
    }
    for (const d of deps) if (!seen.has(d)) { seen.add(d); stack.push(d); }
  }
  return seen;
}

/**
 * The test files among `tests` a change to `changed` (repo-relative paths) can move - or 'all'. Pure but for reading
 * the files.
 * @param {string[]} changed @param {string[]} tests @returns {string[] | 'all'}
 */
export function testsFor(changed, tests, root = ROOT) {
  const { everything, near, far } = selectTests(changed, tests, root);
  if (everything) return 'all';
  const chosen = new Set([...near, ...far]);
  return tests.filter((t) => chosen.has(t));
}

/**
 * The chosen tests in two tiers. `near`: the test changed, imports a changed file itself, names one, or it or a helper
 * outside src/ lists a changed file's folder. `far`: it reaches a changed file, or a listing of its folder, only
 * through other modules. A hub module such as
 * systems/features.js sits in nearly every test's imports, so one edit there puts most of the suite in `far`.
 * `everything`: a file every test leans on changed, and `far` holds the rest of the suite.
 * @param {string[]} changed @param {string[]} tests
 * @returns {{ everything: boolean, near: string[], far: string[] }}
 */
export function selectTests(changed, tests, root = ROOT) {
  const everything = changed.some((f) => EVERYTHING.has(f));
  const set = new Set(changed);
  const names = [...new Set(changed.map((f) => basename(f)))];
  const cache = new Map();
  const listings = listingsReader(changed, root);
  const near = [];
  const far = [];
  for (const t of tests) {
    if (set.has(t)) { near.push(t); continue; }
    const reach = closureOf(t, root, cache, listings.textOf);
    const direct = cache.get(t) ?? [];
    const text = listings.textOf(t);
    const namesAChange = changed.some((f) => text.includes(f)) || names.some((n) => text.includes(n));
    // A listing in the test or a test-side helper is the test's own check; one in a game module (src/scenes/localeData.js
    // lists the locale folders) reaches the test only through that module, as an import would.
    if (namesAChange || direct.some((f) => set.has(f))) { near.push(t); continue; }
    let listsNear = false;
    let listsFar = false;
    for (const file of reach) {
      if (!listings.listsAChange(file)) continue;
      if (file.startsWith('src/')) listsFar = true;
      else { listsNear = true; break; }
    }
    if (listsNear) near.push(t);
    else if (everything || listsFar || changed.some((f) => reach.has(f))) far.push(t);
  }
  return { everything, near, far };
}

/**
 * Whether a file lists a folder that a change lies in: a folder it declares or walks (`scansOf`), or a nested folder
 * it lists and names (`listsFolderOf`). Each file is read and judged once, because one helper sits in hundreds of tests'
 * imports.
 */
function listingsReader(changed, root) {
  const texts = new Map();
  const verdicts = new Map();
  const textOf = (file) => {
    if (!texts.has(file)) texts.set(file, readText(file, root));
    return texts.get(file);
  };
  const listsAChange = (file) => {
    if (!verdicts.has(file)) {
      const text = textOf(file);
      const folders = scansOf(text);
      const lists = changed.some((path) => folders.some((folder) => isUnder(path, folder)) || listsFolderOf(text, path));
      verdicts.set(file, lists);
    }
    return verdicts.get(file);
  };
  return { textOf, listsAChange };
}

/**
 * What changed: the commits since the merge base with `base`, and every staged, unstaged and untracked file. Renames
 * count twice, as the old path and the new one, because a test may name either. Throws when git cannot diff against
 * `base` (a ref never fetched): a quiet fallback would select too few tests.
 */
export function changedFiles(base, root = ROOT) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
  let committed;
  try {
    committed = git('diff', '--name-only', '--no-renames', `${base}...HEAD`);
  } catch (error) {
    throw new Error(`cannot diff against ${base}: fetch it, or pass --base <ref> (${String(error.stderr ?? error.message).trim()})`);
  }
  const lines = [
    committed, git('diff', '--name-only', '--no-renames'), git('diff', '--name-only', '--no-renames', '--cached'),
    git('ls-files', '--others', '--exclude-standard'),
  ].join('\n');
  return [...new Set(lines.split('\n').map((l) => l.trim()).filter(Boolean))].sort();
}

/** The arguments this tool does not know. One would otherwise run the whole selection when the caller meant to ask. */
export function unknownArguments(argv) {
  const unknown = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') { i++; continue; }
    if (argv[i] === '--list' || runnerFlags([argv[i]]).length) continue;
    unknown.push(argv[i]);
  }
  return unknown;
}

function main(argv) {
  const unknown = unknownArguments(argv);
  if (unknown.length) {
    console.error(`unknown argument ${unknown.join(' ')}\nusage: node tools/testChanged.mjs [--list] [--base <ref>] [--test-* runner flags]`);
    return 2;
  }
  const base = baseRef(argv, ROOT);
  const changed = changedFiles(base);
  const tests = testFiles();
  const { everything, near, far } = selectTests(changed, tests);
  const chosen = new Set([...near, ...far]);
  const files = tests.filter((t) => chosen.has(t));
  if (argv.includes('--list')) { for (const f of files) console.log(f); return 0; }
  const scope = everything ? 'the whole suite (a file every test leans on changed)' : `${files.length} of ${tests.length} test files`;
  console.log(`${changed.length} changed files against ${base} -> ${scope}: ${near.length} near, ${far.length} only through other modules`);
  return runTests(files, { extra: runnerFlags(argv) });
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
