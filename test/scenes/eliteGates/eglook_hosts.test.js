// EG-G2 (2026-10-12, Mac: "I said I want everything"; bible/11-Multiplayer/Elite-Gates.md sections 25, 26 and 28 - THE
// FOUR HOSTS): THE LOOK AND THE SOUND WIRED. The look's screen half (scenes/eliteGates/egLookDraw.js): a circle's edges, gusts and
// mists made once a circle, nothing drawn and nothing thrown with no GL, every pass released. The breach client
// (scenes/eliteGates/egClient.js): the mist under the fight's pass and the lines over it, the sky in the host's sky slot, THE SCORE's
// view of the breach, THE QUIET COMPANY's auras, the look freed on every way out. The world host (scenes/world.js): the
// Spire's sky beside the fight's pass, the auras quiet in a trial, the music handed to the fight for THE SPIRE MIX. The
// dungeon arm (scenes/worldModes.js): the Spire's sky where the Hour's stood, the waystones' mesh among the draws. The lab
// (spire.html, src/tools/spireLab.js) registered with Vite and probed frame-synced (tools/spireLabProbe.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEgLookDraw } from '../../../src/scenes/eliteGates/egLookDraw.js';
import { egCircleEdges, egGustSections, egMistSheets } from '../../../src/world/eliteGates/egLook.js';
import { egCircleSpecs, egBandOfCircle } from '../../../src/net/eliteGates/egLaw.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('EG-G2 THE LOOK\'S SCREEN HALF (scenes/eliteGates/egLookDraw.js): a circle told once - its edges, its tracks, its Gust sections and its mists counted as the law makes them, its band - again only for another circle; with no GL nothing is drawn and nothing thrown; released, every pass and the circle let go (mutants: the circle re-made every frame; a draw with no circle)', () => {
  const L = createEgLookDraw({ gl: null });
  assert.equal(L.drawSky(null, null, 0), false, 'no circle: nothing');
  assert.equal(L.setCircle(12345, 6, 0), true);
  assert.equal(L.setCircle(12345, 6, 0), false, 'the same circle: nothing re-made');
  const e = egCircleEdges(12345, 6, 0), specs = egCircleSpecs(12345, 6, 0), st = L.state();
  assert.deepEqual({ ...st, passes: undefined }, { key: '12345:6:0', band: egBandOfCircle(6), edges: e.edge.length / 6, tracks: e.track.length / 6, gusts: egGustSections(specs).length, mists: egMistSheets(specs).length, passes: undefined });
  assert.deepEqual(st.passes, { lines: false, mist: false, sky: false }, 'no GL, no pass');
  assert.equal(L.drawSky([], [], 1), false); assert.equal(L.drawUnder([], [], [0, 0, 0], 1), false); assert.equal(L.drawOver([], [], [0, 0, 0], 1), false);
  assert.equal(L.setCircle(12345, 7, 0), true, 'another circle');
  L.release();
  assert.equal(L.state().key, '');
});

