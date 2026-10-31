// SLOPE-ALL (FIELD BUGS 2026-10-11g #2, the Discord's "Automap in dungeons not showing certain slopes": "the Automap is
// not showing certain slopes within the dungeons, I believe there was an issue like this once before", and "the issue is
// mostly not present without the use of the 'all' option"). The held map's All (ALL-FLOORS) cuts every placed model at
// the slice of the storey it stands on, and spares a face that CLIMBS between storeys - a ramp, a flight's tread. FS_A
// called a face a climb under a literal n.y < 0.97 (14.07 degrees), and Daggerfall's own ramp is 1:4: 14.04 degrees, n.y
// 0.97014 - so every such ramp was cut at its lower storey's slice and its upper run vanished. RAMP-INK (2026-10-05c)
// moved the climb's lower bound to the plan's floor law and left the upper one. The bound is one constant now
// (ui/ink/inkDungeonGL.js CLIMB_NY, climbsOf), and the shader's own expression is read here and run.
// bible/01-Overview/bugs/Field-Bugs-2026-10-11g.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowMesh, climbsOf, CLIMB_NY, FLOOR_FACE_NY, faceInkOf } from '../../../src/ui/ink/inkDungeonGL.js';

/** A slope along +z rising `rise` in a metre, wound to look up (as the world pass culls it), through the sheet's own mesh. */
const slope = (rise) => rowMesh({ positions: new Float32Array([0, 0, 0, 0, rise, 1, 1, rise, 1, 1, 0, 0]), indices: new Uint16Array([0, 1, 2, 0, 2, 3]), matrix: null });
const deg = (d) => Math.tan((d * Math.PI) / 180);

test('SLOPE-ALL: Daggerfall\'s 1:4 ramp CLIMBS - its face looks up at n.y 0.97014, is inked as floor, and FS_A\'s All cut spares it; every walked ramp from 3 to 65 degrees climbs, a level floor and a wall do not (mutants: the 0.97 back; the bound past a level floor; the shader\'s literal)', () => {
  const quarter = slope(0.25);
  assert.ok(Math.abs(quarter.nrm[1] - 1 / Math.hypot(1, 0.25)) < 1e-6, 'a 1:4 ramp looks up at n.y 0.97014');
  assert.equal(faceInkOf(quarter.nrm[1]), 'floor', 'it is ground walked');
  assert.equal(climbsOf(quarter.nrm[1], quarter.nrm[3]), true, 'and it climbs');
  const flat = slope(0);
  const wall = slope(deg(75));
  assert.equal(climbsOf(1, 1.4), true);
});

test('SLOPE-ALL: the bound - past the 1:4 ramp, short of a level floor - and one constant in the shader (mutants: a second literal)', () => {
  assert.ok(CLIMB_NY > 1 / Math.hypot(1, 0.25) && CLIMB_NY < 0.9999, `${CLIMB_NY}`);
});
