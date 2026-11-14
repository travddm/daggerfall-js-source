import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FULL_LABEL, parseLabels, planRun } from '../../tools/ci-plan.ts';
import { nearShard } from '../../tools/test-near.ts';

const draft = { event: 'pull_request', draft: true, labels: [] as string[] };

test('a draft that changes no platform path gets the light run', () => {
  const plan = planRun({
    ...draft,
    changed: ['src/systems/loot.js', 'docs/systems/loot.md', 'test/systems/loot.test.js'],
  });
  assert.deepEqual(plan, { full: false, reasons: [] });
});

test('a ready pull request, a manual run and a dispatched run are always full', () => {
  assert.equal(planRun({ ...draft, draft: false, changed: [] }).full, true);
  assert.equal(planRun({ ...draft, event: 'workflow_dispatch', changed: [] }).full, true);
  assert.equal(planRun({ ...draft, event: 'schedule', changed: [] }).full, true);
});

test('the full-ci label makes a draft full', () => {
  assert.deepEqual(planRun({ ...draft, labels: ['docs', FULL_LABEL], changed: ['src/a.js'] }), {
    full: true,
    reasons: ['the full-ci label'],
  });
});

test('a platform path makes a draft full and names the files', () => {
  const full = (path: string) => planRun({ ...draft, changed: [path] }).full;
  for (const path of [
    '.github/workflows/check.yml',
    'package.json',
    'server/package-lock.json',
    'app/main.cjs',
    'selfhost/README.md',
    'tools/testShards.mjs',
    'scripts/buildTag.mjs',
    'test/arena1Data.mjs',
    'vite.config.js',
    'tsconfig.node.json',
  ]) {
    assert.equal(full(path), true, path);
  }
  for (const path of ['src/tools/x.js', 'test/world/helper.mjs', 'test/a.test.js', 'docs/tools/x.md']) {
    assert.equal(full(path), false, path);
  }
  const plan = planRun({ ...draft, changed: ['tools/a.ts', 'tools/b.ts', 'tools/c.ts', 'tools/d.ts'] });
  assert.deepEqual(plan.reasons, [
    'Node tooling, which handles paths and files: tools/a.ts, tools/b.ts, tools/c.ts and 1 more',
  ]);
});

test('the labels arrive as JSON, and an event without them has none', () => {
  assert.deepEqual(parseLabels('["full-ci","docs"]'), ['full-ci', 'docs']);
  assert.deepEqual(parseLabels(''), []);
  assert.deepEqual(parseLabels(undefined), []);
  assert.deepEqual(parseLabels('null'), []);
});

test('the near tier splits into shards that hold every file once', () => {
  const near = ['test/a.test.js', 'test/b.test.js', 'test/c.test.js', 'test/d.test.js', 'test/e.test.js'];
  const times = { 'test/a.test.js': 50, 'test/b.test.js': 40, 'test/c.test.js': 30 };
  const first = nearShard(near, 1, 2, times);
  const second = nearShard(near, 2, 2, times);
  assert.deepEqual([...first, ...second].sort(), near);
  assert.equal(first.filter((file) => second.includes(file)).length, 0);
  assert.deepEqual(nearShard([], 1, 2, times), []);
});
