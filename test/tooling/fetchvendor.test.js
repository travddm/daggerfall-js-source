// tools/fetch-vendor.sh fetches four vendored mods' published files at pinned commits. These tests run the parts that
// need no network: the list of folders and their pins, and the refusal of a name the script does not know.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'tools', 'fetch-vendor.sh');

const run = (...args) => spawnSync('sh', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });

const FOLDERS = ['better-ambience', 'immersive-footsteps', 'unleveledLoot'];

test('fetch-vendor --list prints each folder with its repository and a full commit hash', () => {
  const result = run('--list');
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split('\n').map((line) => line.split(' '));
  assert.deepEqual(rows.map((row) => row[0]), FOLDERS);
  for (const [folder, repo, commit] of rows) {
    assert.match(repo, /^[\w.-]+\/[\w.-]+$/, `${folder}: owner/repo`);
    // A branch name would let the fetched bytes change; only a full commit hash pins them.
    assert.match(commit, /^[0-9a-f]{40}$/, `${folder}: a pinned commit`);
  }
});

test('fetch-vendor --list with names prints only those folders', () => {
  const result = run('--list', 'unleveledLoot');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.match(result.stdout, /^unleveledLoot Ralzar81\/Unleveled-Loot [0-9a-f]{40}\n$/);
});

test('fetch-vendor refuses an unknown folder before it downloads anything', () => {
  const result = run('--list', 'better-ambience', 'no-such-mod');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '', 'nothing is listed when one name is wrong');
  assert.match(result.stderr, /unknown vendor folder: no-such-mod/);
});

test('fetch-vendor refuses an unknown option and a --dest without a directory', () => {
  assert.equal(run('--nope').status, 2);
  assert.equal(run('--dest').status, 2);
});
