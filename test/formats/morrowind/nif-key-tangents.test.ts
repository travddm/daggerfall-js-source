// The tangent rule of a TCB key group (src/formats/morrowind/nif-key-tangents.ts) was rewritten from the Kochanek and
// Bartels paper and nif.xml, without the third-party source it had been ported from. These tests run the key-group
// sampler (mwKeys.js, which calls the rule) over the inputs of key-sweep.mjs and compare with a recording of the
// implementation it replaced (test/fixtures/mw/key-parity.json): seeded key groups of every interpolation type, the
// segment lookup, and, with the game files, every key group of every NIF and KF file of the three archives.
//
// The recording came from mwKeys.js at commit a68509ea05: run recordSynthetic, recordSegments and recordRetail from
// key-sweep.mjs over that file. No third-party engine source was read for the new code. Every answer is compared
// exactly: the new rule does its float arithmetic in the same order, and the particle colour ramps (mw-particle-sim.test.ts)
// are digests that a one-bit difference changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tcbTangents, type TcbKey } from '../../../src/formats/morrowind/nif-key-tangents.ts';
import { exactJson } from './nif-material-sweep.mjs';
import { columnsOf, recordRetail, recordSegments, syntheticGroups, timesFor } from './key-sweep.mjs';

// What the recording keeps: Infinity, NaN and undefined survive the round trip through JSON.
const kept = (value: unknown) => JSON.parse(exactJson(value));

// Loaded by a computed path: these modules reach src/net, whose crypto types the Node type pass does not have.
const load = (path: string) => import(new URL(`../../../src/${path}`, import.meta.url).href);
const keys = await load('formats/morrowind/mwKeys.js');
const { MwBsaFile } = await load('formats/morrowind/mwBsaFile.js');
const { parseNif } = await load('formats/morrowind/mwNifFile.js');

const { recorded } = JSON.parse(readFileSync(new URL('../../fixtures/mw/key-parity.json', import.meta.url), 'utf8'));
const modules = { ...keys, MwBsaFile, parseNif };

/** The recorded numbers within a float tolerance, relative to their size. */
const closeTo = (actual: number, expected: number, tolerance: number) =>
  Math.abs(actual - expected) <= tolerance * (1 + Math.abs(expected));

const numbersOf = (answer: unknown): number[] =>
  typeof answer === 'number' ? [answer] : Array.from(answer as ArrayLike<number>);

test('synthetic groups: every sample answers as recorded', () => {
  const groups = syntheticGroups();
  assert.equal(groups.length, recorded.synthetic.length);
  groups.forEach((entry, index) => {
    const then: [number, number | number[] | null][] = recorded.synthetic[index];
    const times = timesFor(entry.group.keys);
    assert.equal(times.length, then.length, `group ${index}: sample count`);
    times.forEach((time, at) => {
      const now = keys.sampleKeyGroup(entry.group, entry.dim, time);
      const expected = then[at][1];
      if (expected === null) {
        assert.equal(now, null, `group ${index} time ${time}`);
        return;
      }
      const wanted = numbersOf(expected);
      const got = numbersOf(now);
      assert.equal(got.length, wanted.length, `group ${index} time ${time}: width`);
      wanted.forEach((value, column) => {
        const where = `group ${index} (type ${entry.group.type}, ${entry.dim} wide) time ${time} column ${column}`;
        assert.equal(got[column], value, where);
      });
    });
  });
});

test('segment lookup answers as recorded', () => {
  assert.deepEqual(kept(recordSegments({ modules })), recorded.segments);
});

test('the recording reaches every type, width and key count the rules turn on', () => {
  const seen = new Set(syntheticGroups().map(({ dim, group }) => `${group.type}/${dim}/${group.keys.length}`));
  for (const type of [1, 2, 3, 5]) {
    for (const dim of [1, 3, 4]) {
      for (const count of [1, 2, 3, 9]) assert.ok(seen.has(`${type}/${dim}/${count}`), `${type}/${dim}/${count}`);
    }
  }
  assert.ok(
    syntheticGroups().some(({ group }) =>
      group.keys.some((key: TcbKey, at: number) => at > 0 && key.time === group.keys[at - 1].time),
    ),
    'a repeated key time',
  );
});

const tcb = (time: number, value: number | number[], tbc?: [number, number, number]): TcbKey => ({ time, value, tbc });
const flat: [number, number, number] = [0, 0, 0];

test('with no tension, continuity or bias and even spacing the tangent at an inner key is the mean slope', () => {
  const run = [tcb(0, 0, flat), tcb(1, 4, flat), tcb(2, 6, flat)];
  assert.deepEqual(tcbTangents(run, 1, 0), [3, 3]);
});

test('the first key and the last key use their one step for both tangents', () => {
  const run = [tcb(0, 1, flat), tcb(1, 5, flat), tcb(3, 6, flat)];
  assert.deepEqual(tcbTangents(run, 0, 0), [4, 4]);
  assert.deepEqual(tcbTangents(run, 2, 0), [1, 1]);
});

test('full tension takes the tangents to zero', () => {
  const run = [tcb(0, 0, [1, 0, 0]), tcb(1, 4, [1, 0, 0]), tcb(2, 6, [1, 0, 0])];
  for (let at = 0; at < 3; at++) assert.deepEqual(tcbTangents(run, at, 0), [0, 0]);
});

test('continuity splits the two tangents: +1 follows the step before on the way out and the step after on the way in', () => {
  const run = [tcb(0, 0, flat), tcb(1, 4, [0, 1, 0]), tcb(2, 6, flat)];
  const [into, out] = tcbTangents(run, 1, 0);
  assert.equal(into, 2, 'the step after (2), halved twice over');
  assert.equal(out, 4, 'the step before (4)');
});

test('bias leans both tangents toward the step before (+1) or the step after (-1)', () => {
  const lean = (bias: number) => tcbTangents([tcb(0, 0, flat), tcb(1, 4, [0, 0, bias]), tcb(2, 6, flat)], 1, 0);
  assert.deepEqual(lean(1), [4, 4]);
  assert.deepEqual(lean(-1), [2, 2]);
});

test('uneven spacing scales the tangent into a key by the gap before it and the one out of it by the gap after it', () => {
  const run = [tcb(0, 0, flat), tcb(1, 2, flat), tcb(4, 8, flat)];
  const [into, out] = tcbTangents(run, 1, 0);
  assert.ok(closeTo(into, (2 + 6) * 0.5 * (2 / 4), 1e-12), `into ${into}`);
  assert.ok(closeTo(out, (2 + 6) * 0.5 * (6 / 4), 1e-12), `out ${out}`);
});

test('neighbours that share one time, and a lone key, give zero tangents', () => {
  const run = [tcb(1, 0, flat), tcb(1, 2, flat), tcb(1, 8, flat)];
  assert.deepEqual(tcbTangents(run, 1, 0), [0, 0]);
  assert.deepEqual(tcbTangents([tcb(0, 3, flat)], 0, 0), [0, 0]);
});

test('a key without its three numbers takes zero for each, and a vector value is read one component at a time', () => {
  const bare: TcbKey[] = [
    { time: 0, value: [0, 10] },
    { time: 1, value: [4, 10] },
    { time: 2, value: [6, 10] },
  ];
  assert.deepEqual(tcbTangents(bare, 1, 0), [3, 3]);
  assert.deepEqual(tcbTangents(bare, 1, 1), [0, 0]);
});

test('columnsOf sums, and finds the least and the greatest of, each column', () => {
  assert.deepEqual(columnsOf([1, 10, 3, 20, -1, 30], 2), { sums: [3, 60], least: [-1, 10], greatest: [3, 30] });
});

const dataPath = process.env.MW_DATA_PATH;
const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.bsa`);
const present = !!dataPath && archives.every((name) => existsSync(join(dataPath, name)));

test('every key group of the retail archives samples as recorded', { skip: !present }, () => {
  const { perArchive, names } = recordRetail({ dataPath, fs: { readFileSync }, path: { join }, modules });
  for (const archive of Object.keys(recorded.retail)) {
    const then = recorded.retail[archive];
    const now = perArchive[archive];
    assert.equal(now.names, then.names, `${archive}: file count`);
    assert.equal(now.groups, then.groups, `${archive}: group count`);
    const first = now.digests.findIndex((digest: string, at: number) => digest !== then.digests[at]);
    assert.equal(first, -1, first < 0 ? '' : `${archive}: ${names[archive][first]}`);
    assert.deepEqual(Object.keys(now.tcb), Object.keys(then.tcb), `${archive}: files with TCB groups`);
    for (const file of Object.keys(then.tcb)) {
      then.tcb[file].forEach((group: Summary, at: number) => {
        const live: Summary = now.tcb[file][at];
        assert.deepEqual(live, group, `${file} group ${at}`);
      });
    }
  }
});

interface Summary {
  dim: number;
  count: number;
  sums: number[];
  least: number[];
  greatest: number[];
}
