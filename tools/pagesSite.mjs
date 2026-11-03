#!/usr/bin/env node
// Builds the site that deploy.yml's `site` job publishes to GitHub Pages, so it can be viewed locally while the
// repository is private and the Pages deploy is skipped.
//
//   npm run pages:build              production build into scratch/pages-site (the same steps as the workflow:
//                                    tools/fetch-vendor.sh, then `npm run build`, then dist/ copied to the site root)
//   npm run pages:build -- --atlas   also builds the chatgpt/exact-face-atlas branch and mounts it at
//                                    preview/exact-face-atlas, as the workflow does (needs network and `git fetch`)
//   npm run pages:preview            serves scratch/pages-site on http://localhost:4173/
//
// Keep the steps in step with the `site` job in .github/workflows/deploy.yml.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'scratch', 'pages-site');
const ATLAS_BRANCH = 'chatgpt/exact-face-atlas';
const ATLAS_DIR = join(ROOT, 'scratch', 'pages-atlas');

function run(command, args, cwd = ROOT) {
  console.log(`\n> ${command} ${args.join(' ')}   (${cwd})`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (result.status !== 0) {
    console.error(`pages:build: "${command} ${args.join(' ')}" failed`);
    process.exit(result.status || 1);
  }
}

// Windows runs out of open files while Vite reads the vendored sprites, so there the build runs through limitReads.cjs.
function buildSite() {
  if (process.platform === 'win32') {
    run('node', [
      '--require',
      join(ROOT, 'tools', 'limitReads.cjs'),
      join('node_modules', 'vite', 'bin', 'vite.js'),
      'build',
    ]);
  } else {
    run('npm', ['run', 'build']);
  }
}

function buildAtlas() {
  rmSync(ATLAS_DIR, { recursive: true, force: true });
  run('git', ['fetch', 'origin', ATLAS_BRANCH]);
  run('git', ['worktree', 'prune']);
  run('git', ['worktree', 'add', '--detach', ATLAS_DIR, 'FETCH_HEAD']);
  run('npm', ['ci'], ATLAS_DIR);
  run('npm', ['run', 'build'], ATLAS_DIR);
  const mount = join(SITE, 'preview', 'exact-face-atlas');
  mkdirSync(mount, { recursive: true });
  cpSync(join(ATLAS_DIR, 'dist'), mount, { recursive: true });
  // npm ci inside a worktree leaves node_modules behind; the worktree goes, the built copy stays in the site.
  rmSync(join(ATLAS_DIR, 'node_modules'), { recursive: true, force: true });
  run('git', ['worktree', 'remove', '--force', ATLAS_DIR]);
}

if (process.argv.includes('--atlas') === false && process.argv.slice(2).some((arg) => arg.startsWith('-'))) {
  console.error('usage: node tools/pagesSite.mjs [--atlas]');
  process.exit(2);
}

run('sh', ['tools/fetch-vendor.sh']);
buildSite();
rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
cpSync(join(ROOT, 'dist'), SITE, { recursive: true });
if (process.argv.includes('--atlas')) buildAtlas();
console.log(`\nSite ready in ${SITE}. View it with: npm run pages:preview`);
