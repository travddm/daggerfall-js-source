import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { baseRef } from '../../tools/lib/base-ref.ts';

function repoWith(t: TestContext, pkg: object): string {
  const root = mkdtempSync(join(tmpdir(), 'base-ref-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  return root;
}

test('--base wins, then BASE_REF, then package.json config.baseRef', (t) => {
  const root = repoWith(t, { config: { baseRef: 'origin/integration' } });
  assert.equal(baseRef(['--base', 'HEAD~2'], root, { BASE_REF: 'origin/ci' }), 'HEAD~2');
  assert.equal(baseRef(['--list'], root, { BASE_REF: 'origin/ci' }), 'origin/ci');
  assert.equal(baseRef([], root, {}), 'origin/integration');
});

test('a missing setting or a bare --base fails instead of guessing', (t) => {
  const root = repoWith(t, {});
  assert.throws(() => baseRef([], root, {}), /config\.baseRef/);
  assert.throws(() => baseRef(['--base'], root, {}), /--base wants a ref/);
  assert.throws(() => baseRef(['--base', '--list'], root, {}), /--base wants a ref/);
});

test('this repository names its base', () => {
  assert.match(baseRef([], join(import.meta.dirname, '..', '..'), {}), /^\S+\/\S+$/);
});
