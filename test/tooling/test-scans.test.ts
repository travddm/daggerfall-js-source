// test:changed scans: none
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { isUnder, listsFolderOf, scansOf, walksRecursively } from '../../tools/lib/test-scans.ts';
import { selectTests, testsFor } from '../../tools/testChanged.mjs';

test('a recursive listing, git ls-files and a self-calling walker each read as a walk', () => {
  assert.ok(walksRecursively("readdirSync(join(ROOT, 'src'), { recursive: true })"));
  assert.ok(walksRecursively("execFileSync('git', ['ls-files', dir])"));
  assert.ok(walksRecursively('function walk(dir) {\n  for (const name of readdirSync(dir)) walk(join(dir, name));\n}'));
  assert.ok(walksRecursively('const walk = (d) => readdirSync(d).flatMap((f) => walk(join(d, f)));'));
});

test('a single listing and a recursive function that lists nothing are not walks', () => {
  assert.ok(!walksRecursively("const tables = readdirSync(join(VENDOR, 'Tables'));"));
  assert.ok(!walksRecursively('function depth(node) {\n  return node.children.map((c) => depth(c));\n}'));
  assert.ok(!walksRecursively('rmSync(dir, { recursive: true, force: true });'));
});

test('a declaration names the scanned folders and overrides the walk', () => {
  assert.deepEqual(scansOf('// test:changed scans: src/ server/src/\nconst a = 1;'), ['src', 'server/src']);
  assert.deepEqual(scansOf('// test:changed scans: none\nreaddirSync(tmp, { recursive: true });'), []);
  assert.deepEqual(scansOf(' * test:changed scans: .'), ['.']);
  assert.deepEqual(
    scansOf('readdirSync(root, { recursive: true });'),
    ['.'],
    'an undeclared walk scans the whole tree',
  );
  assert.deepEqual(scansOf('const a = 1;'), []);
});

test('a path is under its folders and the whole tree only', () => {
  assert.ok(isUnder('src/a/b.js', 'src'));
  assert.ok(isUnder('src/a/b.js', 'src/a'));
  assert.ok(isUnder('docs/x.md', '.'));
  assert.ok(!isUnder('srcx/b.js', 'src'));
  assert.ok(!isUnder('test/a.js', 'src'));
});

test('a file that lists something and names a nested folder lists that folder', () => {
  const helper = "const M = readdirSync(new URL('../server-account/migrations', import.meta.url));";
  assert.ok(listsFolderOf(helper, 'server-account/migrations/0010_new.sql'));
  assert.ok(!listsFolderOf(helper, 'server-account/src/index.js'), 'another folder');
  assert.ok(
    !listsFolderOf("const s = 'server-account/migrations';", 'server-account/migrations/0010_new.sql'),
    'names it, lists nothing',
  );
  assert.ok(!listsFolderOf("readdirSync('src')", 'src/main.js'), 'a top-level folder is named everywhere');
});

function scratch(t: TestContext): (path: string, text: string) => string {
  const root = mkdtempSync(join(tmpdir(), 'test-scans-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    return root;
  };
}

test('the selector runs a sweep for any change, a folder lister for a new file there, and splits near from far', (t) => {
  const put = scratch(t);
  put('src/hub.js', "import './leaf.js';\nexport const hub = 1;\n");
  put('src/leaf.js', 'export const leaf = 1;\n');
  put('test/sweep.test.js', "for (const f of readdirSync('src', { recursive: true })) check(f);\n");
  put('test/migrations.mjs', "export const M = readdirSync(new URL('../server/migrations', import.meta.url));\n");
  put('test/db.test.js', "import { M } from './migrations.mjs';\n");
  put('test/direct.test.js', "import { leaf } from '../src/leaf.js';\n");
  const root = put('test/deep.test.js', "import { hub } from '../src/hub.js';\n");
  const tests = ['test/db.test.js', 'test/deep.test.js', 'test/direct.test.js', 'test/sweep.test.js'];

  assert.deepEqual(testsFor(['docs/page.md'], tests, root), ['test/sweep.test.js'], 'a sweep runs for every change');
  assert.deepEqual(
    testsFor(['server/migrations/0002.sql'], tests, root),
    ['test/db.test.js', 'test/sweep.test.js'],
    'a lister in a helper',
  );

  const tiers = selectTests(['src/leaf.js'], tests, root);
  assert.deepEqual(tiers.near, ['test/direct.test.js', 'test/sweep.test.js']);
  assert.deepEqual(tiers.far, ['test/deep.test.js'], 'reached only through src/hub.js');
  assert.equal(tiers.everything, false);
});
