#!/usr/bin/env node
// Runs Prettier, markdownlint or cspell on the files this branch changed against its base branch, so that new and
// touched files meet docs/coding-standards.md while the rest of the tree is left alone.
//
//   node tools/check-changed.mjs format-check   # Prettier --check
//   node tools/check-changed.mjs format-fix     # Prettier --write
//   node tools/check-changed.mjs markdown       # markdownlint-cli2
//   node tools/check-changed.mjs spell          # cspell
//   --base <ref>   # default: $BASE_REF, else origin/feat/tamriel-review
//   --added        # only the files this branch adds, not the ones it modifies (CI's formatting check)
//   --list         # print the files instead of running the check
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchPaths, pathsFor } from './lib/changed-paths.ts';
import { isMain } from './lib/isMain.mjs';
import { changedFiles } from './testChanged.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASE = 'origin/feat/tamriel-review';
const ARGV_BUDGET = 24000;

const MODES = {
  'format-check': { checker: 'prettier', bin: 'prettier/bin/prettier.cjs', args: ['--check', '--ignore-unknown'] },
  'format-fix': { checker: 'prettier', bin: 'prettier/bin/prettier.cjs', args: ['--write', '--ignore-unknown'] },
  markdown: { checker: 'markdownlint', bin: 'markdownlint-cli2/markdownlint-cli2-bin.mjs', args: [] },
  spell: { checker: 'cspell', bin: 'cspell/bin.mjs', args: ['--no-progress', '--no-must-find-files'] },
};

/** The files added against `base` (committed, staged or untracked): the new files that must meet the standards whole. */
function addedFiles(base) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  const lines = [
    git('diff', '--name-only', '--diff-filter=A', `${base}...HEAD`),
    git('diff', '--name-only', '--diff-filter=A', '--cached'),
    git('ls-files', '--others', '--exclude-standard'),
  ].join('\n');
  return [
    ...new Set(
      lines
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function main(argv) {
  const mode = MODES[argv[0]];
  if (!mode) {
    console.error(
      `usage: node tools/check-changed.mjs <${Object.keys(MODES).join('|')}> [--base <ref>] [--added] [--list]`,
    );
    return 2;
  }
  const at = argv.indexOf('--base');
  const base = at >= 0 ? argv[at + 1] : process.env.BASE_REF || DEFAULT_BASE;
  const files = pathsFor(mode.checker, argv.includes('--added') ? addedFiles(base) : changedFiles(base, ROOT)).filter(
    (f) => existsSync(join(ROOT, f)),
  );
  if (argv.includes('--list')) {
    for (const f of files) console.log(f);
    return 0;
  }
  if (files.length === 0) {
    console.log(`${argv[0]}: no changed files against ${base}`);
    return 0;
  }
  let status = 0;
  for (const batch of batchPaths(files, ARGV_BUDGET)) {
    const result = spawnSync(process.execPath, [join(ROOT, 'node_modules', mode.bin), ...mode.args, ...batch], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (result.error) console.error(`${argv[0]}: did not start: ${result.error.message}`);
    if ((result.status ?? 1) !== 0) status = result.status ?? 1;
  }
  return status;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
