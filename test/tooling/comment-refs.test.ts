import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkAgainst, commentLines, findHits, parseDiff, tagsIn } from '../../tools/comment-refs.ts';

const kinds = (text: string) => tagsIn(text).map((t) => `${t.kind}:${t.tag}`);

test('tagsIn finds decision, pull request, audit and item tags', () => {
  assert.deepEqual(kinds('the room (decision 122 (7)) spawns'), ['decision:decision 122']);
  assert.deepEqual(kinds('see PR 130 and #64'), ['pull-request:PR 130', 'pull-request:#64']);
  assert.deepEqual(kinds('AUDIT SLAM: the door'), ['audit:AUDIT']);
  assert.deepEqual(kinds('SAFE8: a guard'), ['item:SAFE8']);
  assert.deepEqual(kinds('(LOOT-GATE) rare gear'), ['item:LOOT-GATE']);
  assert.deepEqual(kinds('P2.2b: the wallet'), ['item:P2.2b']);
});

test('tagsIn leaves plain prose and technical names alone', () => {
  for (const text of [
    'the door opens when the player is near',
    'a UTF-8 string, hashed with SHA-256, drawn as RGBA8',
    'ARENA2 holds the maps; ES2022 syntax',
    'a color like #ff8800 or &#35; in HTML',
    'the 3D model of a wagon, 2D map',
    'https://example.com/page#12abc',
  ]) {
    assert.deepEqual(tagsIn(text), [], text);
  }
});

test('commentLines reads line, block and JSDoc comments by line and skips strings', () => {
  const source = [
    "const a = '// not a comment SAFE8'; // real one",
    '/* block',
    '   second line */',
    '/** doc */ const b = 1;',
    'const c = `// nor this`;',
  ].join('\n');
  const lines = commentLines('x.js', source);
  assert.deepEqual([...lines.keys()], [1, 2, 3, 4]);
  assert.equal(lines.get(1), 'real one');
  assert.equal(lines.get(3), 'second line');
});

test('commentLines reads TypeScript and a hashbang', () => {
  const lines = commentLines('x.ts', '#!/usr/bin/env node\nconst x: number = 1; // why\n');
  assert.deepEqual([...lines], [[2, 'why']]);
});

test('parseDiff reports added lines by new line number and the tags of removed lines', () => {
  const diff = [
    'diff --git a/a.js b/a.js',
    '--- a/a.js',
    '+++ b/a.js',
    '@@ -3,1 +3,2 @@',
    '-// SAFE8: old',
    '+// SAFE8: new',
    '+const x = 1;',
    '@@ -20,0 +22,1 @@',
    '+// added',
  ].join('\n');
  const { added, removed } = parseDiff(diff);
  assert.deepEqual(added.get('a.js'), [3, 4, 22]);
  assert.deepEqual([...(removed.get('a.js') ?? [])], [['SAFE8', 1]]);
});

test('findHits lets a tag pass as often as the change removes it, and no more', () => {
  const text = ['// SAFE8: one', '// SAFE8: two', 'const x = 1;'].join('\n');
  const oneRemovedTwoAdded = [
    '--- a/a.js',
    '+++ b/a.js',
    '@@ -1,1 +1,2 @@',
    '-// SAFE8: old',
    '+// SAFE8: one',
    '+// SAFE8: two',
  ].join('\n');
  assert.deepEqual(
    findHits(oneRemovedTwoAdded, () => text).map((h) => [h.line, h.tag]),
    [[2, 'SAFE8']],
  );
});

test('findHits counts a tag removed in another file or a deleted file, once each', () => {
  const diff = [
    '--- a/old.js',
    '+++ /dev/null',
    '@@ -1,1 +0,0 @@',
    '-// SAFE8: moved',
    '--- /dev/null',
    '+++ b/new.js',
    '@@ -0,0 +1,2 @@',
    '+// SAFE8: moved',
    '+// SAFE8: copied',
  ].join('\n');
  const hits = findHits(diff, () => '// SAFE8: moved\n// SAFE8: copied\n');
  assert.deepEqual(
    hits.map((h) => [h.file, h.line]),
    [['new.js', 2]],
  );
});

test('findHits fails a new tagged comment and passes an old tag on a modified line', () => {
  const text = ['// SAFE8: kept from before', 'const x = 1;', '// HARD3 - brand new', 'const y = 2;', ''].join('\n');
  const diff = [
    '--- a/a.js',
    '+++ b/a.js',
    '@@ -1,1 +1,1 @@',
    '-// SAFE8: the guard',
    '+// SAFE8: kept from before',
    '@@ -5,0 +3,2 @@',
    '+// HARD3 - brand new',
    '+const y = 2;',
  ].join('\n');
  const hits = findHits(diff, () => text);
  assert.deepEqual(
    hits.map((h) => [h.file, h.line, h.kind, h.tag]),
    [['a.js', 3, 'item', 'HARD3']],
  );
});

test('findHits ignores a tag in a string, in code or in a vendored or unparsable file', () => {
  const diff = ['--- a/a.js', '+++ b/a.js', '@@ -0,0 +1,2 @@', "+const t = 'SAFE8';", '+test("SAFE8 x", f);'].join(
    '\n',
  );
  assert.deepEqual(
    findHits(diff, () => 'const t = \'SAFE8\';\ntest("SAFE8 x", f);\n'),
    [],
  );
  const vendored = ['--- a/vendor/m/a.js', '+++ b/vendor/m/a.js', '@@ -0,0 +1 @@', '+// SAFE8'].join('\n');
  assert.deepEqual(
    findHits(vendored, () => '// SAFE8\n'),
    [],
  );
  const broken = ['--- a/b.js', '+++ b/b.js', '@@ -0,0 +1 @@', '+// SAFE8 {'].join('\n');
  assert.deepEqual(
    findHits(broken, () => '// SAFE8 {\nconst = ;\n'),
    [],
  );
});

test('checkAgainst runs against a real branch of a git repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'comment-refs-'));
  try {
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
    git('init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'a.js'), '// SAFE8: old tag\nexport const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('switch', '-q', '-c', 'topic');
    writeFileSync(
      join(dir, 'a.js'),
      '// SAFE8: old tag, reworded\nexport const a = 1;\n// the reason, plainly\n// P7: new\n',
    );
    writeFileSync(join(dir, 'b.js'), '// decision 5 says so\nexport const b = 2;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'topic');
    const hits = checkAgainst('main', dir).map((h) => `${h.file}:${h.line}:${h.tag}`);
    assert.deepEqual(hits, ['a.js:4:P7', 'b.js:1:decision 5']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
