// The bone that carries an actor's locomotion in a keyframe file (mwSkin.js, accumRootRef) is one of two names. The
// choice rests on the game's own files: the .kf files of Morrowind, Tribunal and Bloodmoon key a translation on
// "Bip01" (the biped rig and many creatures) or on "Root Bone" (banners, flags and creatures such as the cliff racer),
// and no file keys both. These tests pin the rule over synthetic skeletons and track sets, and, with the game
// files, over every .kf of the three archives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Loaded by a computed path: these modules reach src/net, whose crypto types the Node type pass does not have.
const load = (path: string) => import(new URL(`../../../src/${path}`, import.meta.url).href);
const { accumRootRef, ACCUM_ROOT_NAMES } = await load('formats/morrowind/mwSkin.js');
const { MwBsaFile } = await load('formats/morrowind/mwBsaFile.js');
const { parseNif } = await load('formats/morrowind/mwNifFile.js');
const { extractTracks } = await load('formats/morrowind/mwAnim.js');

const skeletonOf = (...names: [string, number][]) => ({ byName: new Map(names) });
const driven = (...names: string[]) => new Map(names.map((name) => [name, {}]));

test('the two names, in order of preference', () => {
  assert.deepEqual([...ACCUM_ROOT_NAMES], ['bip01', 'root bone']);
});

test('a name counts only when the skeleton has the bone and the clip drives it', () => {
  const both = skeletonOf(['bip01', 4], ['root bone', 9]);
  assert.equal(accumRootRef(both, driven('bip01')), 4);
  assert.equal(accumRootRef(both, driven('root bone')), 9);
  assert.equal(accumRootRef(skeletonOf(['bip01', 4]), driven('root bone')), null, 'driven but not in the skeleton');
  assert.equal(accumRootRef(both, driven('bip01 spine')), null, 'another bone is not an accumulation root');
  assert.equal(accumRootRef(both, driven()), null, 'a clip that drives nothing');
});

test('Bip01 is preferred when both names are driven, and a name that is not driven is skipped', () => {
  const both = skeletonOf(['root bone', 9], ['bip01', 4]);
  assert.equal(accumRootRef(both, driven('root bone', 'bip01')), 4);
  assert.equal(accumRootRef(both, driven('root bone')), 9);
});

test('a missing skeleton, a skeleton with no name table and missing tracks give no root', () => {
  const tracks = driven('bip01');
  assert.equal(accumRootRef(null, tracks), null);
  assert.equal(accumRootRef(undefined, tracks), null);
  assert.equal(accumRootRef({}, tracks), null);
  assert.equal(accumRootRef(skeletonOf(['bip01', 4]), null), null);
  assert.equal(accumRootRef(skeletonOf(['bip01', 4]), undefined), null);
});

test('names are compared as written: the track and name tables hold lower-case keys', () => {
  assert.equal(accumRootRef(skeletonOf(['bip01', 4]), driven('Bip01')), null);
  assert.equal(accumRootRef(skeletonOf(['Bip01', 4]), driven('bip01')), null);
});

const dataPath = process.env.MW_DATA_PATH;
const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.bsa`);
const present = !!dataPath && archives.every((name) => existsSync(join(dataPath, name)));

// The number of .kf files that key each name, and the number that key neither, per archive.
const RETAIL = {
  Morrowind: { files: 97, bip01: 43, rootBone: 53, both: 0, neither: 1 },
  Tribunal: { files: 31, bip01: 13, rootBone: 15, both: 0, neither: 3 },
  Bloodmoon: { files: 34, bip01: 30, rootBone: 2, both: 0, neither: 2 },
};

test(
  'every .kf of the retail archives keys Bip01, keys Root Bone, or keys neither; none keys both',
  { skip: !present },
  () => {
    for (const [name, expected] of Object.entries(RETAIL)) {
      const archive = new MwBsaFile(new Uint8Array(readFileSync(join(dataPath as string, `${name}.bsa`))));
      const seen = { files: 0, bip01: 0, rootBone: 0, both: 0, neither: 0 };
      for (const file of archive.list().filter((entry: string) => entry.endsWith('.kf'))) {
        const tracks = extractTracks(parseNif(archive.get(file).slice()));
        const bip01 = tracks.has('bip01');
        const rootBone = tracks.has('root bone');
        seen.files++;
        if (bip01 && rootBone) seen.both++;
        else if (bip01) seen.bip01++;
        else if (rootBone) seen.rootBone++;
        else seen.neither++;
        // The answer over a skeleton that has both bones follows the clip.
        const both = skeletonOf(['bip01', 1], ['root bone', 2]);
        assert.equal(accumRootRef(both, tracks), bip01 ? 1 : rootBone ? 2 : null, `${name}: ${file}`);
      }
      assert.deepEqual(seen, expected, name);
    }
  },
);
