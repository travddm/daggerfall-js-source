import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  MANIFEST_PATH,
  compare,
  lowered,
  measure,
  readManifest,
  readTree,
  rebased,
  serialize,
  type Manifest,
  type Mod,
  type TrackedFile,
} from '../../tools/vendored-mods.ts';

function mod(folder: string, fields: Partial<Mod> = {}): Mod {
  return {
    folder,
    title: folder,
    authors: [],
    links: { nexus: [], github: [] },
    paths: [`vendor/${folder}/`],
    terms: [folder],
    patterns: [],
    counts: { paths: 0, lines: 0 },
    ...fields,
  };
}

function manifestOf(mods: Mod[], shared: Partial<Manifest['shared']> = {}): Manifest {
  return { shared: { terms: [], patterns: [], counts: { paths: 0, lines: 0 }, ...shared }, mods };
}

test('a mod counts its own paths, and the lines that name it everywhere else', () => {
  const manifest = manifestOf([
    mod('heat-haze', { paths: ['vendor/heat-haze/', 'src/systems/heatHaze.js'], terms: ['heat-haze', 'heatHaze'] }),
  ]);
  const files: TrackedFile[] = [
    { path: 'vendor/heat-haze/README.md', text: 'heat-haze\nheat-haze' },
    { path: 'vendor/heat-haze/HeatHaze.dll', text: null },
    { path: 'src/systems/heatHaze.js', text: 'export const heatHaze = 1;' },
    { path: 'src/scenes/exterior.js', text: "import { x } from '../systems/heatHaze.js';\nconst y = 2;\nHEAT-HAZE" },
  ];
  assert.deepEqual(measure(manifest, files)['heat-haze'], { paths: 3, lines: 2 });
});

test('patterns keep their case, terms do not, and the ratchet never reads its own files', () => {
  const manifest = manifestOf([mod('rri', { terms: [], patterns: ['\\brri[A-Z]\\w*'] })], { terms: ['Hazelnut'] });
  const files: TrackedFile[] = [
    { path: 'src/a.js', text: 'rriItems()\nRRIITEMS()\nworried(x)\nby hazelnut' },
    { path: 'tools/vendored-mods.json', text: 'rriItems Hazelnut' },
  ];
  const measured = measure(manifest, files);
  assert.equal(measured.rri.lines, 1);
  assert.equal(measured.shared.lines, 1);
});

test('a count that grows fails; one that falls is only reported', () => {
  const manifest = manifestOf([
    mod('a', { counts: { paths: 4, lines: 10 } }),
    mod('b', { counts: { paths: 0, lines: 3 } }),
  ]);
  const { grown, fallen } = compare(
    { a: { paths: 4, lines: 11 }, b: { paths: 0, lines: 1 }, shared: { paths: 0, lines: 0 } },
    manifest,
  );
  assert.deepEqual(grown, [{ key: 'a', kind: 'lines', was: 10, now: 11 }]);
  assert.deepEqual(fallen, [{ key: 'b', kind: 'lines', was: 3, now: 1 }]);
});

test('--update lowers counts and never raises one; --allow-growth takes the measurement', () => {
  const manifest = manifestOf([mod('a', { counts: { paths: 4, lines: 10 } })]);
  const measured = { a: { paths: 2, lines: 12 }, shared: { paths: 0, lines: 5 } };
  assert.deepEqual(lowered(manifest, measured).mods[0].counts, { paths: 2, lines: 10 });
  assert.deepEqual(lowered(manifest, measured).shared.counts, { paths: 0, lines: 0 });
  assert.deepEqual(rebased(manifest, measured).mods[0].counts, { paths: 2, lines: 12 });
});

test('tools/vendored-mods.json is in the form --update writes, one entry per folder', () => {
  const manifest = readManifest();
  assert.equal(readFileSync(MANIFEST_PATH, 'utf8'), serialize(manifest));
  const folders = manifest.mods.map((m) => m.folder);
  assert.equal(new Set(folders).size, folders.length);
  // A single backslash in the JSON text ("\b") decodes to a backspace, and that pattern never matches.
  for (const pattern of [manifest.shared, ...manifest.mods].flatMap((b) => b.patterns)) {
    assert.ok(!/[\u0000-\u001f]/.test(pattern), `a control character in the pattern ${JSON.stringify(pattern)}`);
    assert.doesNotThrow(() => new RegExp(pattern), `the pattern ${JSON.stringify(pattern)} does not compile`);
  }
});

test('no vendored mod grows back: every count in tools/vendored-mods.json holds, and in CI none has fallen unrecorded', () => {
  const manifest = readManifest();
  const { grown, fallen } = compare(measure(manifest, readTree()), manifest);
  assert.deepEqual(grown, [], 'a change added files or lines that name a vendored mod; see tools/vendored-mods.ts');
  // An unrecorded fall leaves room for the same number of new lines, so CI holds the record to the tree, as the lint
  // ratchet's --strict does.
  if (process.env.CI) {
    assert.deepEqual(
      fallen,
      [],
      'a count fell: run node tools/vendored-mods.ts --update and commit tools/vendored-mods.json',
    );
  }
});
