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
  chooseTestNode,
  nodeVersionStep,
  TEST_NODE_CONFIG,
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

test("the version step passes on CI's major, warns on another, and fails when the binary does not run", () => {
  const fromCiNode = { path: '/n22/node', source: 'CI_NODE', notices: [] };
  const running = { path: '/n24/node', source: null, notices: [] };
  assert.deepEqual(nodeVersionStep(22, 'v22.23.5', fromCiNode), {
    outcome: 'passed',
    note: 'tests run on Node v22.23.5 (CI_NODE)',
  });
  assert.deepEqual(nodeVersionStep(22, 'v24.21.0', running), {
    outcome: 'warned',
    note: `tests run on Node v24.21.0, CI runs Node 22; name a Node 22 binary in CI_NODE or git config ${TEST_NODE_CONFIG} to match it`,
  });
  assert.equal(nodeVersionStep(22, 'v24.21.0', fromCiNode).outcome, 'warned');
  assert.equal(nodeVersionStep(null, 'v24.21.0', running).outcome, 'passed');
  assert.equal(nodeVersionStep(22, null, fromCiNode).outcome, 'failed');
});

test('the tests take CI_NODE first, then the git config, then the running Node', () => {
  const present = new Set(['/env/node', '/config/node']);
  const exists = (path: string) => present.has(path);
  assert.deepEqual(chooseTestNode('/env/node', '/config/node', '/running', exists), {
    path: '/env/node',
    source: 'CI_NODE',
    notices: [],
  });
  assert.deepEqual(chooseTestNode(undefined, '/config/node', '/running', exists), {
    path: '/config/node',
    source: `git config ${TEST_NODE_CONFIG}`,
    notices: [],
  });
  assert.deepEqual(chooseTestNode(undefined, undefined, '/running', exists), {
    path: '/running',
    source: null,
    notices: [],
  });
});

test('a named Node that does not exist falls back with a notice', () => {
  const none = () => false;
  const fallback = chooseTestNode(undefined, '/gone/node', '/running', none);
  assert.deepEqual(fallback, {
    path: '/running',
    source: null,
    notices: [`git config ${TEST_NODE_CONFIG} names /gone/node, which does not exist`],
  });
  const step = nodeVersionStep(22, 'v24.21.0', fallback);
  assert.equal(step.outcome, 'warned');
  assert.match(step.note ?? '', /names \/gone\/node, which does not exist/);
  const config = chooseTestNode('/gone/env', '/config/node', '/running', (path) => path === '/config/node');
  assert.equal(config.path, '/config/node');
  assert.deepEqual(config.notices, ['CI_NODE names /gone/env, which does not exist']);
});
