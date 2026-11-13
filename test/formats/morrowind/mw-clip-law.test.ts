// The clip law (src/formats/morrowind/mw-clip-law.ts) was rewritten from the text-key format of the retail files,
// without the third-party source it had been ported from. These tests run the current code over the inputs of
// mw-clip-law-sweep.mjs and compare with a recording of the implementation it replaced
// (test/fixtures/mw/mw-clip-law-parity.json): every distinct list of text keys in the retail NIF and KF files, seeded
// random lists, and hand-written cases. For every group of every list the recording holds the clip range under eleven
// option sets, the playback of each clip at three step sizes (the keys fired and the state after every step), the
// lookups by key text, the velocity along a seeded track and the looping answer.
//
// The recording came from src/formats/morrowind/mwAnim.js at commit 1643e7f405 (before the clip law moved to its own
// module): run readInputs and recordClipLaw from mw-clip-law-sweep.mjs over the retail files and that module. No
// third-party engine source was read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as law from '../../../src/formats/morrowind/mw-clip-law.ts';
import { allWeaponShortGroups } from '../../../src/formats/morrowind/mwWeaponAnim.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { parseNif, KEY_TYPE } from '../../../src/formats/morrowind/mwNifFile.js';
import { collectTextKeys } from '../../../src/formats/morrowind/mwAnim.js';
import { exactJson, readInputs, recordClipLaw } from './mw-clip-law-sweep.mjs';

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mw-clip-law-parity.json', import.meta.url), 'utf8'),
);
const now = JSON.parse(exactJson(recordClipLaw(law, inputs, KEY_TYPE.linear)));

/** The first list whose recorded answer differs, named by its files or its number, so that a failure says where. */
function firstDifference(answers: any[], expected: any[], nameOf: (index: number) => string) {
  const index = expected.findIndex((one, at) => JSON.stringify(one) !== JSON.stringify(answers[at]));
  if (index < 0) return 'none';
  const groups = expected[index].groups as string[];
  const group = groups.findIndex((_name, at) => expected[index].digests[at] !== answers[index].digests[at]);
  return `${nameOf(index)}, group ${group < 0 ? '(absent or listing)' : groups[group]}`;
}

test('clip law: every group of every retail list answers as recorded', () => {
  const name = (index: number) => inputs.lists[index].files[0];
  assert.equal(now.retail.length, recorded.retail.length);
  assert.equal(firstDifference(now.retail, recorded.retail, name), 'none');
});

test('clip law: every group of the seeded random lists answers as recorded', () => {
  assert.equal(now.synthetic.length, recorded.synthetic.length);
  assert.equal(
    firstDifference(now.synthetic, recorded.synthetic, (index) => `synthetic list ${index}`),
    'none',
  );
});

test('clip law: the hand-written cases answer as recorded', () => {
  for (const name of Object.keys(recorded.handWritten)) {
    assert.deepEqual(now.handWritten[name], recorded.handWritten[name], name);
  }
});

test('looping groups: every name occurs as a group of the retail files', () => {
  const stances = allWeaponShortGroups() as string[];
  const basesInFiles = new Set<string>();
  for (const list of inputs.lists) {
    const keys = list.keys.map(([time, text]: [number, string]) => ({ time, text }));
    for (const group of law.clipGroups(keys)) {
      const longest = Math.max(0, ...stances.filter((stance) => group.endsWith(stance)).map((stance) => stance.length));
      basesInFiles.add(group.slice(0, group.length - longest));
    }
  }
  assert.deepEqual(
    law.LOOPING_ANIMATIONS.filter((name) => !basesInFiles.has(name)),
    [],
  );
  assert.equal(new Set(law.LOOPING_ANIMATIONS).size, 44);
});

test('a group listed twice plays its last block, and its stop key may carry a trailing character', () => {
  const keys = law.normalizeTextKeys([
    { time: 0, text: 'Walk: Start\r\nWalk: Loop Start' },
    { time: 1, text: 'Walk: Loop Stop' },
    { time: 1, text: 'Walk: Stop' },
    { time: 5, text: 'Walk: Start' },
    { time: 6, text: 'Walk: Loop Start' },
    { time: 7, text: 'Walk: Loop Stop' },
    { time: 8, text: 'Walk: Stop.' },
  ]);
  const clip = law.resetClip(keys, 'WALK', { loopFallback: true }) as law.ClipState;
  assert.equal(clip.ok, true);
  assert.equal(clip.startTime, 5);
  assert.equal(clip.stopTime, 8);
});

test('a clip without loop keys plays once, and one with loop keys wraps and reports the loop start again', () => {
  const keys = law.normalizeTextKeys([
    { time: 0, text: 'a: start' },
    { time: 0, text: 'b: start' },
    { time: 1, text: 'a: loop start' },
    { time: 2, text: 'a: loop stop' },
    { time: 2, text: 'b: stop' },
    { time: 3, text: 'a: stop' },
  ]);
  const once = law.resetClip(keys, 'b') as law.ClipState;
  law.advanceClip(once, keys, 5);
  assert.equal(once.playing, false);

  const looping = law.resetClip(keys, 'a', { loopFallback: false }) as law.ClipState;
  const heard: string[] = [];
  law.advanceClip(looping, keys, 2.5, (text) => heard.push(text));
  assert.equal(looping.loopCount, Infinity - 1);
  assert.deepEqual(heard, ['a: start', 'b: start', 'a: loop start', 'a: loop stop', 'b: stop', 'a: loop start']);
  assert.equal(looping.time, 1.5);
});

test('the velocity is the horizontal travel between the last start and the stop, per second', () => {
  const keys = law.normalizeTextKeys([
    { time: 0, text: 'walk: start' },
    { time: 2, text: 'walk: stop' },
  ]);
  const track = {
    translations: {
      type: KEY_TYPE.linear,
      keys: [
        { time: 0, value: [0, 0, 0] },
        { time: 2, value: [3, 4, 100] },
      ],
    },
  };
  assert.equal(law.animVelocity(keys, track, 'walk'), 2.5);
  assert.equal(law.animVelocity(keys, track, 'run'), 0);
});

const dataPath = process.env.MW_DATA_PATH;
const files = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.bsa`);
const present = !!dataPath && files.every((name) => existsSync(join(dataPath, name)));

test('the recorded inputs are the retail lists of text keys', { skip: !present }, () => {
  const live = readInputs({
    dataPath,
    fs: { readFileSync },
    path: { join },
    modules: { MwBsaFile, parseNif, collectTextKeys, normalizeTextKeys: law.normalizeTextKeys },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(live)), inputs);
});
