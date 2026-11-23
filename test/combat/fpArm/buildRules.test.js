// The arm builds' shared rules (src/combat/fpArm/buildRules.js) are compared with a recording of the code that was
// moved out of fpArm.js unchanged (test/fixtures/mw/buildRulesParity.json):
//   - raceScaleOf for every race and sex of the retail masters, in load order, and for each master alone;
//   - stickyAccumRoot over source lists made from the accumulation roots of the retail skeletons and clip files, and
//     over lists with missing, null and zero roots.
// The edge cases run without data; the retail part needs MW_DATA_PATH.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { raceScaleOf, stickyAccumRoot } from '../../../src/combat/fpArm/buildRules.js';
import { raceRecords } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, accumRootRef } from '../../../src/formats/morrowind/mwSkin.js';
import { extractTracks } from '../../../src/formats/morrowind/mwAnim.js';

const FIXTURE = new URL('../../fixtures/mw/buildRulesParity.json', import.meta.url);
const dataPath = process.env.MW_DATA_PATH;
const recording = process.env.RECORD_PARITY === '1';

/** Runs stickyAccumRoot on a copy of each list and answers the root and what each source was given. */
function accumAnswers(lists) {
  return lists.map((roots) => {
    const sources = roots.map((r) => (r === 'missing' ? {} : { wouldAccumRoot: r }));
    const root = stickyAccumRoot(sources);
    return { root, given: sources.map((so) => so.accumRoot) };
  });
}

const EDGE_LISTS = [
  [],
  ['missing'],
  [null],
  [0],
  [null, 0],
  ['missing', null, 7],
  [7, 3],
  [null, null, 12, 0],
  [0, 5],
  ['missing', 'missing'],
];

function retailRecord() {
  const names = ['Morrowind', 'Tribunal', 'Bloodmoon'];
  const esms = names.map((n) => new Uint8Array(fs.readFileSync(`${dataPath}/${n}.esm`)));
  const archives = names.map((n) => new MwBsaFile(new Uint8Array(fs.readFileSync(`${dataPath}/${n}.bsa`))));
  const get = (p) => archives.find((a) => a.has(p))?.get(p) ?? null;
  const races = esms.map((bytes) => raceRecords(bytes));
  const keys = [...new Set(races.flatMap((m) => [...m.keys()]))].sort();
  const scales = {};
  for (const key of keys) {
    for (const female of [false, true]) {
      const inOrder = races.map((m) => m.get(key) ?? null);
      scales[`${key}:${female ? 'f' : 'm'}`] = {
        all: raceScaleOf(inOrder, female),
        each: inOrder.map((rec) => raceScaleOf([rec], female)),
        reversed: raceScaleOf([...inOrder].reverse(), female),
      };
    }
  }
  const skeletons = [
    'meshes/xbase_anim.1st.nif',
    'meshes/base_anim_female.1st.nif',
    'meshes/base_animkna.1st.nif',
    'meshes/wolf/skin.1st.nif',
    'meshes/base_anim.nif',
    'meshes/base_anim_female.nif',
    'meshes/base_animkna.nif',
    'meshes/wolf/skin.nif',
  ];
  const clips = [
    'meshes/xbase_anim.1st.kf',
    'meshes/xbase_anim_female.1st.kf',
    'meshes/xbase_animkna.1st.kf',
    'meshes/xbase_anim.kf',
    'meshes/xbase_anim_female.kf',
    'meshes/xbase_animkna.kf',
    'meshes/wolf/xskin.1st.kf',
    'meshes/wolf/xskin.kf',
  ].filter((p) => get(p));
  const trackMaps = clips.map((p) => extractTracks(parseNif(get(p))));
  const accum = {};
  for (const path of skeletons) {
    const skeleton = buildSkeleton(parseNif(get(path)));
    const roots = trackMaps.map((tracks) => accumRootRef(skeleton, tracks) ?? null);
    const lists = [roots, [...roots].reverse(), [null, ...roots], roots.slice(1), roots.slice(0, 1)];
    accum[path] = { roots, answers: accumAnswers(lists) };
  }
  return { clips, scales, accum };
}

test('build rules: the shared accum root over missing, null and zero roots, as recorded', () => {
  const now = accumAnswers(EDGE_LISTS);
  if (recording) return;
  const before = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  assert.deepEqual(now, before.edges);
});

test('build rules, on the retail files: the race scales and the accum roots as recorded', { skip: !dataPath }, () => {
  const now = JSON.parse(JSON.stringify(retailRecord()));
  if (recording) {
    fs.writeFileSync(FIXTURE, JSON.stringify({ edges: accumAnswers(EDGE_LISTS), ...now }));
    return;
  }
  const before = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  assert.deepEqual(now.clips, before.clips);
  assert.deepEqual(now.scales, before.scales);
  assert.deepEqual(now.accum, before.accum);
});
