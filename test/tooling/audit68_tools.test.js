// AUDIT 68 (2026-09-24), the whole-tree sweep - cluster "tools": tools/ and
// scripts/, the dev tooling, the bakes, the cite and mutant tools. Each pin
// failed on the base (ad238de0) and passes on the fix. Most run the real tool
// on a scratch tree, so none of them can write the checkout; the cite
// fixtures name files no tree has (zq...), so no cite shift can move them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deployVerdict } from '../../tools/verify-deploy.mjs';
import { parseSettingsText } from '../../scripts/bakeSettingsText.mjs';
import { SETTINGS_LABELS } from '../../src/systems/settings/settingsText.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
/** A scratch directory - its name has a SPACE, the path the old guards failed on - removed after the test. */
const scratch = (t) => { const d = mkdtempSync(join(tmpdir(), 'audit68 tools ')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
/** ...holding copies of these repo paths (files or directories). */
const tree = (t, paths) => { const d = scratch(t); for (const p of paths) cpSync(join(ROOT, p), join(d, p), { recursive: true }); return d; };
// The tools run `node --test` themselves; the runner's own NODE_TEST_CONTEXT would turn those into its reporting children.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'));
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120000, env: ENV, ...opts });
/** Every script under tools/ and scripts/. */
const scripts = () => ['tools', 'scripts'].flatMap((d) => readdirSync(join(ROOT, d), { recursive: true })
  .filter((f) => /\.(m?js|cjs)$/.test(f) && !f.includes('node_modules')).map((f) => `${d}/${f}`));

// ── the bakes and the "am I the program" guard ───────────────────────────

test('AUDIT 68 S01-bake-on-import-race: importing a bake for its parser writes nothing; run as the program it bakes the committed module', (t) => {
  for (const [script, input, out] of [
    ['scripts/bakeBooks.mjs', 'vendor/dfu-books/books.txt', 'src/systems/booksData.js'],
    ['scripts/bakeSettings.mjs', 'vendor/dfu-settings/defaults.ini.txt', 'src/systems/settings/settingsDefaults.js'],
    ['scripts/bakeSettingsText.mjs', 'vendor/dfu-settings/GameSettings.txt', 'src/systems/settings/settingsText.js'],
  ]) {
    const d = tree(t, [script, 'tools/lib', input]);
    mkdirSync(join(d, dirname(out)), { recursive: true });   // TIDY2: wherever the bake's output stands
    const imp = node(['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(join(d, script)).href)});`]);
    assert.equal(imp.status, 0, imp.stderr);
    assert.equal(existsSync(join(d, out)), false,
      `importing ${script} baked ${out} - under node --test a parallel worker reads that file mid-write`);
    const run = node([join(d, script)]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(join(d, out), 'utf8'), read(out), `${script}, run, bakes the committed ${out}`);
  }
});

test('AUDIT 68 X5-main-guard-url-paths: one "am I the program" test for every tool and script, and no path read off a URL string', () => {
  const files = scripts().filter((f) => f !== 'tools/lib/isMain.mjs');
  assert.ok(files.length > 200, `the sweep read the tools (${files.length})`);
  assert.deepEqual(files.filter((f) => /process\.argv\[1\][^\n]*import\.meta\.url|import\.meta\.url[^\n]*process\.argv\[1\]/.test(read(f))), [],
    'these compare import.meta.url with argv[1] themselves - false under a space, a symlink or Windows; use tools/lib/isMain.mjs');
  assert.deepEqual(files.filter((f) => /import\.meta\.url\)\.pathname/.test(read(f))), [],
    'these read a filesystem path off a URL\'s pathname, which stays percent-encoded - use fileURLToPath');
});

test('AUDIT 68 S01-settingstext-labels-dead: the settings-text parse skips DFU\'s comment and schema lines, so no label is the schema', () => {
  assert.deepEqual(parseSettingsText('- a comment, with a comma\nschema: *key,text\nfoo, Bar'), { foo: 'Bar' });
  assert.deepEqual(Object.keys(SETTINGS_LABELS).filter((k) => /^schema:/i.test(k) || k.startsWith('-')), [],
    'the baked table carried "schema: *key" as a label');
});

// ── what the tree keeps out ──────────────────────────────────────────────

test('AUDIT 68 X2-dumpmidi-output-unignored: dumpMidi\'s default output - ARENA2 music - is ignored', () => {
  assert.doesNotThrow(() => execFileSync('git', ['check-ignore', '-q', 'midi-out/SONG_00.mid'], { cwd: ROOT }));
});

test('AUDIT 68 X2-probe-tmp-page-leak: the probes\' pages are ignored, and each is written inside the try whose finally unlinks it', () => {
  for (const p of ['tools/qs3-probe.tmp.html', 'play/foebar1-probe.tmp.html']) {
    assert.doesNotThrow(() => execFileSync('git', ['check-ignore', '-q', p], { cwd: ROOT }), `${p} is not ignored`);
  }
  const probes = scripts().filter((f) => /\.tmp\.html'/.test(read(f)));
  assert.ok(probes.length >= 7, `the probes that write a page (${probes.length})`);
  for (const f of probes) {
    const s = read(f);
    const open = s.search(/^try \{$/m), close = s.search(/^\} finally \{$/m);
    const writes = [...s.matchAll(/await writeFile\(/g)].map((m) => m.index);
    assert.ok(open > 0 && close > open && writes.length, `${f}: one top-level try/finally and a page write`);
    for (const w of writes) assert.ok(w > open && w < close, `${f}: a page written before the try stays behind when the browser fails to launch`);
  }
});

// ── the mutant runner ────────────────────────────────────────────────────

/** A scratch module package: target.js plus the given files, and a mutant list. */
function mutantBed(t, files, list) {
  const d = scratch(t);
  writeFileSync(join(d, 'package.json'), '{ "type": "module" }\n');
  writeFileSync(join(d, 'target.js'), 'export const a = 1;\n');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(d, name), text);
  writeFileSync(join(d, 'list.json'), JSON.stringify(list));
  return d;
}
const PASSES = "import { test } from 'node:test';\ntest('ok', () => {});\n";

// ── the cite tools ───────────────────────────────────────────────────────

const OLD = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`);

// ── deploy verification ──────────────────────────────────────────────────

const page = ({ bundle, tag }) => `<head><meta name="build-tag" content="${tag}"></head><body><script type="module" src="./${bundle}"></script></body>`;

test('AUDIT 68 X5-verify-deploy-tag-length-bypasses-dirty: one commit stamped at two lengths is still one commit - a dirty build fails', () => {
  let asked = 0;
  const v = deployVerdict({
    localHtml: page({ bundle: 'assets/main-AAAA1111.js', tag: '62a2048c2' }),
    liveHtml: page({ bundle: 'assets/main-CCCC3333.js', tag: '62a2048' }),
    contains: () => { asked += 1; return true; },
  });
  assert.equal(v.kind, 'dirty', 'git answers that a commit contains itself, so this read VERIFIED');
  assert.equal(asked, 0);
});

// ── the Ledger and the open flags ────────────────────────────────────────

