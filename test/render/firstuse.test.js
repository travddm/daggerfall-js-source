// FIRST-USE (#1144): THE PASSES STILL BUILT AT FIRST USE, THROUGH SHADER-STALL'S
// DOOR. Each was built behind a try-once latch the first frame it was wanted, and its LINK_STATUS read held that frame for
// the whole compile: Starfall's sky (at its idle warm), the rite's smoke, the Steps' ghosts and the halos. Each now lists
// its programs beside its constructor and is built once they are done (render/glProgram.js compiledPass); the ones the
// game is played by (the ghosts) are asked as needed and started at their owner's load, the rest stand a few frames late.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startPrograms } from '../../src/render/glProgram.js';
import { StarfallPassRenderer, STARFALL_PROGRAMS } from '../../src/render/starfall/starfallPass.js';
import { RiteSmokeRenderer, RITE_SMOKE_PROGRAMS } from '../../src/render/riteSmoke.js';
import { SdStepsPass, sdStepsPrograms } from '../../src/render/superDungeon/sdStepsPass.js';
import { SdHaloRenderer, SD_HALO_PROGRAMS } from '../../src/render/superDungeon/sdHalo.js';
import { GATE_PASS_PROGRAMS } from '../../src/render/gate/gatePass.js';
import { createSdSteps } from '../../src/scenes/superDungeon/sdSteps.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** A context whose driver finishes its compiles when the test says (`finish`), with or without the extension that can say
 *  so; `count(name)` the calls made - `link?` the LINK_STATUS read (the one that waits). */
function fakeGl({ parallel = true } = {}) {
  let next = 0;
  const log = [], progs = [], done = new Set();
  const ext = parallel ? { COMPLETION_STATUS_KHR: 0x91B1 } : null;
  const base = { VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82 };
  const gl = new Proxy(base, {
    get(t, k) {
      if (typeof k !== 'string') return undefined;
      if (k in t) return t[k];
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      switch (k) {
        case 'getExtension': return (n) => (n === 'KHR_parallel_shader_compile' ? ext : null);
        case 'isContextLost': return () => false;
        case 'createProgram': return () => { const p = { id: next++ }; progs.push(p); log.push(['createProgram']); return p; };
        case 'getProgramParameter': return (p, pn) => {
          if (pn === base.LINK_STATUS) { log.push(['link?']); return true; }
          if (ext && pn === ext.COMPLETION_STATUS_KHR) return done.has(p);
          return null;
        };
        case 'getShaderParameter': return () => true;
        case 'getUniformLocation': return (p, n) => n;
        case 'getParameter': return () => 16;
        default: return (...a) => { log.push([k, ...a]); return { id: next++ }; };
      }
    },
  });
  return { gl, finish: () => { for (const p of progs) done.add(p); }, count: (name) => log.filter((x) => x[0] === name).length };
}

test('FIRST-USE every pass compiles nothing its list did not start: each constructor reads its programs from the list its owner starts and its door waits on - the Steps\' ghosts\' by their options (mutants: a constructor off its list; the ghosts\' options not the list\'s)', () => {
  for (const [name, programs, make] of [
    ['Starfall\'s sky', STARFALL_PROGRAMS, (gl) => new StarfallPassRenderer(gl)],
    ['the rite\'s smoke', RITE_SMOKE_PROGRAMS, (gl) => new RiteSmokeRenderer(gl)],
    ['the Steps\' ghosts', sdStepsPrograms(), (gl) => new SdStepsPass(gl)],
    ['the halos', SD_HALO_PROGRAMS, (gl) => new SdHaloRenderer(gl)],
  ]) {
    const f = fakeGl();
    startPrograms(f.gl, programs);
    f.finish();
    const started = f.count('createProgram');
    assert.equal(started, programs.length, `${name}: its programs started`);
    make(f.gl);
    assert.equal(f.count('createProgram'), started, `${name}: compiled nothing its list did not start`);
    assert.equal(f.count('link?'), programs.length, `${name}: one read a program`);
  }
  assert.deepEqual(STARFALL_PROGRAMS[0], GATE_PASS_PROGRAMS[1], 'Starfall\'s beacon is the gate\'s own, started with the passes play meets');
});

test('FIRST-USE the ghosts: the Steps\' program started as the realm loads, where the driver compiles beside the frames; each drawn pass asked as needed through its door, made again after a clear; the rite\'s smoke through a door never asked as needed; Starfall\'s idle warm a step that names its programs (mutants: no start at the load; the ghosts not needed; the smoke needed; the warm a bare step)', () => {
  const f = fakeGl();
  createSdSteps({ renderer: { gl: f.gl } });
  assert.equal(f.count('createProgram'), sdStepsPrograms().length, 'the Steps\' ghosts started with the realm');
  assert.equal(f.count('link?'), 0, 'nothing waited on');
  const off = fakeGl({ parallel: false });
  createSdSteps({ renderer: { gl: off.gl } });
  assert.equal(off.count('createProgram'), 0, 'nothing started where the driver cannot say');
});
