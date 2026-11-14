import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import {
  FAR_TIER_SHARE,
  changesShaders,
  ciNodeMajor,
  installProblems,
  nodeVersionStep,
  testsToRun,
} from '../../tools/pre-push.ts';

function install(t: TestContext, installed: Record<string, string> | null): string {
  const root = mkdtempSync(join(tmpdir(), 'pre-push-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { alpha: '^1.0.0', beta: '^2.0.0' } }));
  const packages = { 'node_modules/alpha': { version: '1.2.0' }, 'node_modules/beta': { version: '2.0.1' } };
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages }));
  if (installed) {
    for (const [name, version] of Object.entries(installed)) {
      mkdirSync(join(root, 'node_modules', name), { recursive: true });
      writeFileSync(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ version }));
    }
  }
  return root;
}

test('an install that matches the lockfile has no problems', (t) => {
  assert.deepEqual(installProblems(install(t, { alpha: '1.2.0', beta: '2.0.1' })), []);
});

test('a missing package, a wrong version and a missing node_modules are named', (t) => {
  assert.deepEqual(installProblems(install(t, { alpha: '1.1.0' })), [
    'alpha is 1.1.0, the lockfile wants 1.2.0',
    'beta is not installed',
  ]);
  assert.match(installProblems(install(t, null))[0], /no node_modules here/);
});

test('the shader step runs only for a changed shader file or the checker', () => {
  assert.ok(changesShaders(['src/render/sky.frag']));
  assert.ok(changesShaders(['src/render/fog.glsl']));
  assert.ok(changesShaders(['tools/glsl-check.ts']));
  assert.ok(!changesShaders(['src/render/sky.js', 'docs/rendering/renderer.md']));
});

test('the far tier runs here when the whole selection is small, or with --full', () => {
  const suite = 100;
  const small = Math.floor(suite * FAR_TIER_SHARE);
  assert.deepEqual(testsToRun(['a'], Array(small - 1).fill('f'), suite, false).leftToCi, 0);
  const large = testsToRun(['a', 'b'], Array(small).fill('f'), suite, false);
  assert.deepEqual(large.files, ['a', 'b']);
  assert.equal(large.leftToCi, small);
  assert.equal(testsToRun(['a', 'b'], Array(small).fill('f'), suite, true).files.length, small + 2);
});

test("CI's Node major is read from the workflow", () => {
  assert.equal(ciNodeMajor('      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n'), 22);
  assert.equal(ciNodeMajor('node-version: "24"'), 24);
  assert.equal(ciNodeMajor('no setup here'), null);
});

test("the version step passes on CI's major, warns on another, and fails when CI_NODE does not run", () => {
  assert.deepEqual(nodeVersionStep(22, 'v22.23.5', true), {
    outcome: 'passed',
    note: 'tests run on Node v22.23.5 (CI_NODE)',
  });
  assert.deepEqual(nodeVersionStep(22, 'v24.21.0', false), {
    outcome: 'warned',
    note: 'tests run on Node v24.21.0, CI runs Node 22; set CI_NODE to a Node 22 binary to match it',
  });
  assert.equal(nodeVersionStep(22, 'v24.21.0', true).outcome, 'warned');
  assert.equal(nodeVersionStep(null, 'v24.21.0', false).outcome, 'passed');
  assert.equal(nodeVersionStep(22, null, true).outcome, 'failed');
});
