// The particle simulation (src/formats/morrowind/mw-particle-sim.ts) was rewritten from the NIF format records,
// without the third-party source it had been ported from. These tests run the current code over the inputs of
// mw-particle-sweep.mjs and compare with a recording of the implementation it replaced
// (test/fixtures/mw/mw-particle-parity.json): a spread of the retail particle systems, seeded random systems that
// reach the colliders, both gravity fields and the reference frames, and argument grids for the pure rules. The
// systems are run with seeded dice under seven clocks and frames and compared by a digest of the quads.
//
// The recording came from src/formats/morrowind/mwParticles.js at commit ff68dceaef: run readRetailSystems,
// recordSystems and recordRules from mw-particle-sweep.mjs over the retail files and that module. No third-party
// engine source was read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as particles from '../../../src/formats/morrowind/mwParticles.js';
import * as sim from '../../../src/formats/morrowind/mw-particle-sim.ts';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { VERTEX_COLOR_MODE } from '../../../src/formats/morrowind/mwNifMesh.js';
import {
  exactJson,
  readRetailSystems,
  recordRules,
  recordSystems,
  syntheticSystems,
  unpackDescriptor,
} from './mw-particle-sweep.mjs';

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mw-particle-parity.json', import.meta.url), 'utf8'),
);
const modules = { ...particles, VERTEX_COLOR_MODE };

/** The keys whose answer differs from the recording, so that a failure names the systems. */
function differences(answers: Record<string, string>, expected: Record<string, string>): string[] {
  return Object.keys(expected).filter((key) => answers[key] !== expected[key]);
}

test('particle systems: the kept spread of retail systems answers as recorded', () => {
  const systems = inputs.spread.map((one: { key: string; descriptor: unknown }) => ({
    key: one.key,
    descriptor: unpackDescriptor(one.descriptor),
  }));
  const answers = recordSystems(modules, systems);
  assert.ok(inputs.spread.length > 100);
  assert.deepEqual(
    differences(
      answers,
      Object.fromEntries(systems.map((one: { key: string }) => [one.key, recorded.retail[one.key]])),
    ),
    [],
  );
});

test('particle systems: the seeded random systems answer as recorded', () => {
  const answers = recordSystems(modules, syntheticSystems());
  assert.deepEqual(differences(answers, recorded.synthetic), []);
  assert.equal(Object.keys(answers).length, Object.keys(recorded.synthetic).length);
});

test('particle systems: the pure rules answer as recorded', () => {
  const now = JSON.parse(exactJson(recordRules(modules)));
  assert.deepEqual(now, recorded.rules);
});

test('the two colliders and the two gravity fields are reached by the recorded inputs', () => {
  assert.ok(recorded.rules.planesHit > 50);
  assert.ok(recorded.rules.spheresHit > 50);
  const kinds = new Set<string>();
  for (const { descriptor } of syntheticSystems()) {
    for (const collider of descriptor.colliders) kinds.add(collider.type);
    for (const modifier of descriptor.modifiers) {
      if (modifier.type === 'gravity') kinds.add(`gravity${modifier.fieldType}`);
    }
  }
  assert.deepEqual([...kinds].sort(), ['gravity0', 'gravity1', 'planar', 'spherical']);
});

test('the controller clock: a window repeats, runs back and forth, or holds the nearest end', () => {
  const terms = { frequency: 1, phase: 0, startTime: 1, stopTime: 3 };
  assert.equal(sim.controllerTime({ ...terms, extrapolation: sim.EXTRAPOLATION.Cycle }, 4.5), 2.5);
  assert.equal(sim.controllerTime({ ...terms, extrapolation: sim.EXTRAPOLATION.Reverse }, 4.5), 1.5);
  assert.equal(sim.controllerTime({ ...terms, extrapolation: sim.EXTRAPOLATION.Reverse }, 6.5), 2.5);
  assert.equal(sim.controllerTime({ ...terms, extrapolation: sim.EXTRAPOLATION.Constant }, 9), 3);
  assert.equal(sim.controllerTime({ ...terms, extrapolation: sim.EXTRAPOLATION.Constant }, -9), 1);
  assert.equal(sim.controllerTime({ ...terms, extrapolation: sim.EXTRAPOLATION.Cycle }, 2), 2);
  assert.equal(sim.controllerTime({ ...terms, stopTime: 1, extrapolation: sim.EXTRAPOLATION.Cycle }, 5), 1);
});

test('a ball moving into a plane bounces back scaled by the bounce, and one moving away is left alone', () => {
  const plane = {
    type: 'planar' as const,
    bounce: 0.5,
    width: 4,
    height: 4,
    position: [0, 0, 0],
    xVector: [1, 0, 0],
    yVector: [0, 1, 0],
    normal: [0, 0, 1],
    constant: 0,
  };
  const down = sim.planarCollide(plane, [0, 0, 0.05], [0, 0, -2], 0.1);
  assert.ok(down);
  assert.equal(down[2], 1);
  assert.equal(sim.planarCollide(plane, [0, 0, 0.05], [0, 0, 2], 0.1), null);
  assert.equal(sim.planarCollide(plane, [9, 0, 0.05], [0, 0, -2], 0.1), null, 'outside the rectangle');
  assert.equal(sim.planarCollide(plane, [0, 0, 0], [0, 0, -2], 0.1), null, 'already on the plane');
  assert.equal(sim.planarCollide(plane, [0, 0, 0.05], [1, 0, 0], 0.1), null, 'moving along it');
});

test('a particle that reaches a sphere within the step is reflected about the surface normal', () => {
  const sphere = { type: 'spherical' as const, bounce: 1, radius: 1, position: [0, 0, 0] };
  const hit = sim.sphericalCollide(sphere, [5, 0, 0], [-10, 0, 0], 1);
  assert.ok(hit);
  assert.equal(hit[0], 10);
  assert.equal(sim.sphericalCollide(sphere, [5, 0, 0], [-10, 0, 0], 0.1), null, 'not within this step');
  assert.equal(sim.sphericalCollide(sphere, [5, 0, 0], [0, 0, 0], 1), null, 'at rest');
});

const dataPath = process.env.MW_DATA_PATH;
const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.bsa`);
const present = !!dataPath && archives.every((name) => existsSync(join(dataPath, name)));

test('every particle system of the retail files answers as recorded', { skip: !present }, () => {
  const live = readRetailSystems({
    dataPath,
    fs: { readFileSync },
    path: { join },
    modules: { MwBsaFile, parseNif, particleSystemsOf: particles.particleSystemsOf },
  });
  assert.deepEqual(live.extraction, recorded.extraction);
  const answers = recordSystems(modules, live.systems);
  assert.deepEqual(differences(answers, recorded.retail), []);
  assert.equal(Object.keys(answers).length, Object.keys(recorded.retail).length);
});
