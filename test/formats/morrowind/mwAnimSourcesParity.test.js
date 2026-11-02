// The animation sources (which .kf files an actor plays from, and the searches over them) are checked against a
// recording of the implementation they replaced (test/fixtures/mw/mwAnimSourcesParity.json): the source list of every
// race, sex and view, of the werewolf and of every creature of the three retail .esm files; then, for every distinct
// list, the clip picked, the velocity and the text-key time for every group that a retail .kf names.
//
// The recording came from src/formats/morrowind/mwAnimSources.js at commit 8d0737319c (the code moved out of
// mwFirstPerson.js unchanged): run readInputs and recordAnimSources from mwAnimSourcesSweep.mjs over the retail files and
// that module. No third-party engine source was read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as animSources from '../../../src/formats/morrowind/mwAnimSources.js';
import * as firstPerson from '../../../src/formats/morrowind/mwFirstPerson.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices } from '../../../src/formats/morrowind/mwSkin.js';
import { clipGroups, resetClip } from '../../../src/formats/morrowind/mwAnim.js';
import { recordAnimSources } from './mwAnimSourcesSweep.mjs';

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mwAnimSourcesParity.json', import.meta.url), 'utf8'),
);
const now = JSON.parse(JSON.stringify(recordAnimSources(animSources, { clipGroups, resetClip }, inputs)));

test('animation sources: the source list of every race, sex, view and creature matches the recording', () => {
  assert.equal(Object.keys(now.lists).length, Object.keys(recorded.lists).length);
  assert.deepEqual(now.lists, recorded.lists);
});

test('animation sources: pick, velocity and text-key time of every group over every list match the recording', () => {
  assert.deepEqual(now.searches.groups, recorded.searches.groups);
  assert.deepEqual(now.searches.bySourceList, recorded.searches.bySourceList);
});

test('animation sources: the edge cases match the recording', () => {
  assert.deepEqual(now.edges, recorded.edges);
});

test('animation sources: the first-person host still exports them', () => {
  for (const name of Object.keys(animSources)) assert.equal(firstPerson[name], animSources[name], name);
});

const dataPath = process.env.MW_DATA_PATH;
const archivePaths = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) =>
  dataPath ? join(dataPath, `${name}.bsa`) : '',
);

test(
  'animation sources: the recorded archive probe is the retail .kf list',
  { skip: !archivePaths.every(existsSync) },
  () => {
    const live = archivePaths
      .flatMap((path) => new MwBsaFile(new Uint8Array(readFileSync(path))).list())
      .filter((name) => name.endsWith('.kf'))
      .sort();
    assert.deepEqual(live, inputs.kfNames);
  },
);

test('animation sources: the units-per-metre constant is the recorded value', () => {
  assert.equal(animSources.MW_UNITS_PER_METER, recorded.unitsPerMeter);
});

// The measurement behind MW_UNITS_PER_METER: the standard figure stands about 127 units tall (head bone 119.2 plus a
// head 7.7 above it), taken as 128 units for a person of about 6 feet.
test(
  'animation sources: the third-person skeleton puts the head bone where the units-per-metre derivation says',
  { skip: !archivePaths.every(existsSync) },
  () => {
    const archive = new MwBsaFile(new Uint8Array(readFileSync(archivePaths[0])));
    const skeleton = buildSkeleton(parseNif(archive.get('meshes/base_anim.nif').slice()));
    const spaces = skeletonSpaceMatrices(skeleton, poseSkeleton(skeleton, null, null, 0), skeleton.root ?? -1);
    const head = [...skeleton.nodes].find(([, node]) => node.name === 'Bip01 Head')[0];
    assert.ok(Math.abs(spaces.get(head).t[2] - 119.2) < 0.5);
    assert.ok(Math.abs(animSources.MW_UNITS_PER_METER * 6 * 0.3048 - 128) < 1e-6);
  },
);
