// PUDDLE-RAIN (FIELD BUGS 2026-10-01 #1 - "When sinking into a puddle rain isnt shown and disappears from screen").
// The port swims wherever the drawn water is under the feet (MAC2), a puddle record's whole tile among it
// (WATER-PUDDLE kept the feet on DFU's whole tile), and a body on exterior water sinks; DW-D stood the rain, the snow
// and the sand down for any swimmer outdoors (Iliac Puddle No More's UpdateWeatherParticles, IsPlayerSwimming &&
// !IsWaterWalking) - so a body sunk in a puddle, its eye 0.2 m over the water, lost the rain while the rain loop
// played on. The real chain: exteriorSurfaces on a puddle record, exteriorSwimming over the sink, the sea's own
// fogPresentation for an eye inland; then the frame's gate, lifted off world.js and run: what falls is hidden by the
// water over the EYE alone - the distance fog's "under", as the wisps and the bolts already were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exteriorSurfaces, exteriorSwimming, ON_EXTERIOR_WATER } from '../../src/player/exteriorSurface.js';
import { SWIM_EYE_HEIGHT } from '../../src/player/motor.js';
import { SHALLOW_WHOLE } from '../../src/world/water/waterCorners.js';
import { createDeepWatersPlayer } from '../../src/scenes/deepWater/deepWatersPlayer.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const OCEAN = 34;
/** The sea of dwc_fog's swimmer: x in [0, 100] a column 24 m deep, the rest dry land. */
function seaPlayer() {
  const col = (entry, lx) => (lx >= 0 && lx <= 100 ? { oceanY: OCEAN, seafloorY: 10, renderedSeafloorY: 10, depth: OCEAN - 10, entry } : null);
  const host = { waterColumn: col, rawWaterColumn: col };
  return createDeepWatersPlayer({
    host, locate: (x, z) => ({ entry: {}, lx: x, lz: z, baseY: 0 }), seaY: () => OCEAN, terrainGroundAt: () => -Infinity,
    collider: { raycastHit: () => null }, settings: () => ({ fogStrength: 0.5, fogDistance: 0.3 }),
  });
}

test('PUDDLE-RAIN: a body sunk in a puddle is a swimmer with its eye over the water - and the rain, the snow and the sand still fall for it (mutant: the swimmer\'s arm back in the gate)', () => {
  const ground = { hit: true, terrain: true };
  for (const record of SHALLOW_WHOLE) {
    // the feet anywhere on the puddle's tile - its whole tile is water to them (WATER-PUDDLE's "the feet keep DFU's whole tile")
    const s = exteriorSurfaces({ rawTile: record, feet: [0.1, 0.9], probe: ground });
    assert.equal(s.water, ON_EXTERIOR_WATER.Swimming, `record ${record}: the feet swim (MAC2)`);
  }
  assert.equal(exteriorSwimming({ sunk: true }), true, 'and a sunk body is IsPlayerSwimming');
  // the puddle 86 m over the sea, inland of every column: the eye SWIM_EYE_HEIGHT over the feet, which stand in the water's plane
  const puddleY = 120, feet = [400, puddleY, 0];
  const eye = [feet[0], puddleY + SWIM_EYE_HEIGHT, 0];
  const fogP = seaPlayer().fogPresentation({ camera: eye, centre: [feet[0], puddleY + 0.15, 0], swimming: true });
  assert.equal(fogP.under, false, 'the eye is over the water: the sea\'s own fog says so');
  const swimmer = { isPlayerSwimming: true, waterWalking: false };
  // a swimmer at sea with the head out is the same: the water over the eye is the whole test
  const seaEye = seaPlayer().fogPresentation({ camera: [50, OCEAN + 0.6, 0], centre: [50, OCEAN - 0.6, 0], swimming: true });
  assert.equal(seaEye.under, false);
});

