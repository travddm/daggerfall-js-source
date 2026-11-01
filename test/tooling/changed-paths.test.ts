import assert from 'node:assert/strict';
import { test } from 'node:test';
import { batchPaths, pathsFor } from '../../tools/lib/changed-paths.ts';

test('each checker reads only its own file types', () => {
  const changed = ['src/a.js', 'docs/x.md', 'notes.txt', 'tools/b.ts', '.prettierrc', 'src/p.png', 'ci.yml'];
  assert.deepEqual(pathsFor('prettier', changed), ['src/a.js', 'docs/x.md', 'tools/b.ts', 'ci.yml']);
  assert.deepEqual(pathsFor('markdownlint', changed), ['docs/x.md']);
  assert.deepEqual(pathsFor('cspell', changed), ['docs/x.md', 'notes.txt', 'ci.yml']);
});

test('an extension is matched without case and a dotfile has none', () => {
  assert.deepEqual(pathsFor('markdownlint', ['README.MD', '.md', 'dir.md/file']), ['README.MD']);
});

test('batches keep every path once, in order, under the budget', () => {
  const paths = Array.from({ length: 10 }, (_, i) => `docs/page-${i}.md`);
  const batches = batchPaths(paths, 60);
  assert.deepEqual(batches.flat(), paths);
  for (const batch of batches) assert.ok(batch.reduce((n, p) => n + p.length + 3, 0) <= 60);
  assert.ok(batches.length > 1);
});

test('one path longer than the budget still gets a batch of its own', () => {
  assert.deepEqual(batchPaths(['a'.repeat(100), 'b'], 10), [['a'.repeat(100)], ['b']]);
  assert.deepEqual(batchPaths([], 10), []);
});
