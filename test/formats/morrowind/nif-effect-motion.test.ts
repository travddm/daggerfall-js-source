// The motion rules of an effect mesh (src/formats/morrowind/nif-effect-motion.ts) were rewritten from nif.xml and the
// usual camera-facing constructions, without the third-party source they had been ported from. These tests run the
// current code over the inputs of vfx-sweep.mjs and compare with a recording of the implementation it replaced
// (test/fixtures/mw/vfx-parity.json): the billboard rotation over 1,185 frames, the texture-coordinate transform, the
// flipbook slot and the visibility lookup over grids, and, with the game files, every NIF of the three archives read as
// an effect and run for four steps.
//
// The recording came from mwVfx.js at commit b3790dfc28: run recordMotion and recordEffects from vfx-sweep.mjs over
// that file. No third-party engine source was read for the new code. A billboard answer comes out of float arithmetic
// whose order differs from the old code's, so it is compared with a tolerance; every other answer is compared exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as motion from '../../../src/formats/morrowind/nif-effect-motion.ts';
import { exactJson } from './nif-material-sweep.mjs';
import { billboardCases, columnsOf, recordEffects, recordMotion } from './vfx-sweep.mjs';

// What the recording keeps: Infinity, NaN and undefined survive the round trip through JSON.
const kept = (value: unknown) => JSON.parse(exactJson(value));

// Loaded by a computed path: these modules reach src/net, whose crypto types the Node type pass does not have.
const load = (path: string) => import(new URL(`../../../src/${path}`, import.meta.url).href);
const vfx = await load('formats/morrowind/mwVfx.js');
const { MwBsaFile } = await load('formats/morrowind/mwBsaFile.js');
const { parseNif } = await load('formats/morrowind/mwNifFile.js');
const { affineOfTransform } = await load('formats/morrowind/mwAffine.js');
const { PARTICLE_FLOATS } = await load('formats/morrowind/mwParticles.js');

const { recorded } = JSON.parse(readFileSync(new URL('../../fixtures/mw/vfx-parity.json', import.meta.url), 'utf8'));
const modules = { ...vfx, MwBsaFile, parseNif, affineOfTransform, PARTICLE_FLOATS };

/** The recorded numbers within a float tolerance, relative to their size. */
const closeTo = (actual: number, expected: number, tolerance: number) =>
  Math.abs(actual - expected) <= tolerance * (1 + Math.abs(expected));

test('billboard: every recorded frame turns as recorded, to within float noise', () => {
  const frames = billboardCases();
  assert.equal(frames.length, recorded.motion.billboard.length);
  frames.forEach((frame, index) => {
    const rotation = motion.billboardRotation(
      frame.mode,
      frame.base,
      frame.translation,
      frame.eye,
      frame.look,
      frame.up,
    );
    const expected: number[] = recorded.motion.billboard[index];
    expected.forEach((value, at) => {
      assert.ok(
        closeTo(rotation[at], value, 1e-5),
        `frame ${index} mode ${frame.mode} entry ${at}: ${rotation[at]} against ${value}`,
      );
    });
  });
});

test('uv, flipbook and visibility answer as recorded', () => {
  const now = recordMotion({ modules: motion });
  assert.deepEqual(kept(now.uv), recorded.motion.uv);
  assert.deepEqual(kept(now.flip), recorded.motion.flip);
  assert.deepEqual(kept(now.visible), recorded.motion.visible);
});

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// Rounded to whole numbers, with a negative zero made a plain zero.
const rounded = (value: number) => Math.round(value) + 0;

test('a cylindrical billboard turns about its up axis until its +Z axis faces the eye', () => {
  const turned = motion.billboardRotation(
    motion.BILLBOARD_MODE.RotateAboutUp,
    IDENTITY,
    [0, 0, 0],
    [10, 50, 0],
    [0, 1, 0],
    [0, 0, 1],
  );
  assert.deepEqual([turned[2], turned[5], turned[8]].map(rounded), [1, 0, 0]);
  assert.deepEqual([turned[1], turned[4], turned[7]], [0, 1, 0]);
  const above = motion.billboardRotation(
    motion.BILLBOARD_MODE.RotateAboutUp,
    IDENTITY,
    [0, 0, 0],
    [0, 50, 0],
    [0, 1, 0],
    [0, 0, 1],
  );
  assert.deepEqual([...above], IDENTITY);
});

test('a screen-aligned billboard faces back along the view and never rolls', () => {
  const turned = motion.billboardRotation(
    motion.BILLBOARD_MODE.AlwaysFaceCamera,
    IDENTITY,
    [0, 0, 0],
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  );
  assert.deepEqual([turned[2], turned[5], turned[8]].map(rounded), [-1, 0, 0]);
  assert.deepEqual([turned[1], turned[4], turned[7]].map(rounded), [0, 1, 0]);
  const slanted = motion.billboardRotation(
    motion.BILLBOARD_MODE.AlwaysFaceCamera,
    IDENTITY,
    [0, 0, 0],
    [0, 0, 0],
    [1, 0.5, 0],
    [0.3, 1, 0.1],
  );
  const upAxis = [slanted[1], slanted[4], slanted[7]];
  const backAxis = [slanted[2], slanted[5], slanted[8]];
  assert.ok(
    Math.abs(upAxis[0] * backAxis[0] + upAxis[1] * backAxis[1] + upAxis[2] * backAxis[2]) < 1e-6,
    'up is square to back',
  );
  assert.ok(upAxis[1] > 0.8, 'the up axis stays the vertical one');
  const along = motion.billboardRotation(
    motion.BILLBOARD_MODE.AlwaysFaceCamera,
    IDENTITY,
    [0, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  );
  assert.deepEqual([...along], IDENTITY);
});

test('the rigid modes lay the node on the camera frame, and the two centre modes take the rigid one', () => {
  const rigid = motion.billboardRotation(
    motion.BILLBOARD_MODE.RigidFaceCamera,
    IDENTITY,
    [0, 0, 0],
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  );
  assert.deepEqual([...rigid].map(rounded), [0, 0, 1, 0, 1, 0, -1, 0, 0]);
  const centre = motion.billboardRotation(
    motion.BILLBOARD_MODE.AlwaysFaceCenter,
    IDENTITY,
    [0, 0, 0],
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  );
  assert.deepEqual([...centre], [...rigid]);
});

test('the texture coordinate scales about the middle of the picture, then moves: U back, V forward', () => {
  assert.deepEqual(motion.uvAt(1, 1, { uScale: 2, vScale: 2 }), [1.5, 1.5]);
  assert.deepEqual(motion.uvAt(0.5, 0.5, { uTrans: 0.25, vTrans: 0.25 }), [0.25, 0.75]);
  assert.deepEqual(motion.uvAt(0.2, 0.9, {}), [0.2, 0.9]);
});

test('the flipbook shows one picture per step, wraps, holds the first at step zero and has none without pictures', () => {
  assert.equal(motion.flipIndex(0.6, 0.25, 3), 2);
  assert.equal(motion.flipIndex(0.8, 0.25, 3), 0);
  assert.equal(motion.flipIndex(5, 0, 3), 0);
  assert.equal(motion.flipIndex(1, 0.25, 0), -1);
  assert.equal(motion.flipIndex(-0.3, 0.25, 3), 2, 'before zero, counted back from the last');
});

test('a visibility controller shows the value of the last key at or before the time', () => {
  const keys = [
    { time: 0, value: 1 },
    { time: 1, value: 0 },
  ];
  assert.equal(motion.visAt(keys, -1), true, 'before the first key, the first key');
  assert.equal(motion.visAt(keys, 0.99), true);
  assert.equal(motion.visAt(keys, 1), false, 'at a key, that key');
  assert.equal(motion.visAt([], 5), true, 'no keys is visible');
  assert.equal(motion.visAt(null, 5), true);
});

test('columnsOf sums, and finds the least and the greatest of, each column', () => {
  assert.deepEqual(columnsOf([1, 10, 3, 20, -1, 30], 2), { sums: [3, 60], least: [-1, 10], greatest: [3, 30] });
});

const dataPath = process.env.MW_DATA_PATH;
const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.bsa`);
const present = !!dataPath && archives.every((name) => existsSync(join(dataPath, name)));

test('every NIF of the retail archives reads and runs as an effect as recorded', { skip: !present }, () => {
  const { perArchive, names } = recordEffects({ dataPath, fs: { readFileSync }, path: { join }, modules });
  for (const archive of Object.keys(recorded.effects)) {
    const then = recorded.effects[archive];
    const now = perArchive[archive];
    assert.equal(now.names, then.names, `${archive}: file count`);
    const firstDescriptor = now.descriptors.findIndex((digest: string, at: number) => digest !== then.descriptors[at]);
    assert.equal(
      firstDescriptor,
      -1,
      firstDescriptor < 0 ? '' : `${archive}: descriptor of ${names[archive][firstDescriptor]}`,
    );
    const firstStream = now.streams.findIndex((digest: string, at: number) => digest !== then.streams[at]);
    assert.equal(firstStream, -1, firstStream < 0 ? '' : `${archive}: streams of ${names[archive][firstStream]}`);
    assert.deepEqual(Object.keys(now.billboards), Object.keys(then.billboards), `${archive}: billboard files`);
    for (const file of Object.keys(then.billboards)) {
      then.billboards[file].forEach((frame: Frame, step: number) => {
        const live: Frame = now.billboards[file][step];
        assert.equal(live.time, frame.time, `${file} step ${step}: time`);
        assert.equal(live.streams.length, frame.streams.length, `${file} step ${step}: stream count`);
        frame.streams.forEach((stream, at) => {
          const liveStream = live.streams[at];
          assert.deepEqual(
            {
              key: liveStream.key,
              count: liveStream.count,
              drawState: kept(liveStream.drawState),
              texture: liveStream.texture,
            },
            { key: stream.key, count: stream.count, drawState: stream.drawState, texture: stream.texture },
            `${file} step ${step} stream ${at}`,
          );
          for (const part of ['sums', 'least', 'greatest'] as const) {
            stream.packed[part].forEach((value: number, column: number) => {
              assert.ok(
                closeTo(liveStream.packed[part][column], value, 1e-4),
                `${file} step ${step} stream ${at} ${part} column ${column}: ${liveStream.packed[part][column]} against ${value}`,
              );
            });
          }
        });
      });
    }
  }
});

interface Frame {
  time: number;
  streams: {
    key: string;
    count: number;
    drawState: unknown;
    texture: string | null;
    packed: { sums: number[]; least: number[]; greatest: number[] };
  }[];
}
