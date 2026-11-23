// EV5 - MOONLIGHT, pinned with no GL and no game data: the phase-lit
// fraction, the term derived from skyState's own moon output (masser
// keys, secunda lifts the ambient), the day/cloud/phase gates, the
// in-place ambient fold, and the wiring shape - three lit shaders take
// the second N.L term, the flats take its Lambert-average half INSIDE
// the _clockLit latch, the studio zeroes it, and only the two exterior
// hosts ever turn it on (classic, interiors and dungeons keep DFU's
// hard-off night by never calling setMoonlight at all).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  skyState, moonlightTerm, withMoonAmbient, phaseLitFraction, MOONLIGHT,
} from '../../src/render/enhancedSky.js';
import { dynamicMoonState, dynamicMoonlight } from '../../src/render/dynamicSkiesBridge.js';   // AUDIT 65 MC-3: the mod's arm of moonlight(), and the state its own producer mints
import { MATERIAL_DEFAULTS } from '../../src/systems/dynamicSkies/dynamicSkies.js';
import { LUNAR_PHASES } from '../../src/systems/gameDate.js';

const midnight = (phases, weather = 'sunny') =>
  skyState({ minuteOfDay: 0, weather, phases });

test('EV5: phaseLitFraction - the phase ring folded at Full', () => {
  const expect = { 0: 0, 1: 0.25, 2: 0.5, 3: 0.75, 4: 1, 5: 0.75, 6: 0.5, 7: 0.25 };
  for (const [p, f] of Object.entries(expect)) assert.equal(phaseLitFraction(Number(p)), f);
  assert.equal(phaseLitFraction(LUNAR_PHASES.None), 0, 'the year<0 sentinel reads as unlit');
});

test('EV5: a full masser at midnight keys the night; the formula is the state\'s own numbers', () => {
  const s = midnight({ masser: LUNAR_PHASES.Full, secunda: LUNAR_PHASES.Full });
  const term = moonlightTerm(s);
  assert.ok(term, 'a clear full-moon night lights');
  assert.equal(term.scale, MOONLIGHT.masser * phaseLitFraction(s.masser.phase) * s.masser.vis);
  assert.ok(term.scale > 0.2, 'a full clear masser is a real key light');
  assert.equal(term.dir, s.masser.dir, 'the light points at the disc the dome draws');
  assert.deepEqual(term.color, s.masser.color, 'and wears its colour');
  // full moon opposite the sun: high in the midnight sky
  assert.ok(term.dir[1] > 0.9, 'the full moon rides the zenith at midnight');
  // secunda's lift is her colour scaled by her own phase and visibility
  const lift = MOONLIGHT.secunda * phaseLitFraction(s.secunda.phase) * s.secunda.vis;
  assert.ok(Math.abs(term.ambient[0] - s.secunda.color[0] * lift) < 1e-12);
  assert.ok(term.ambient[0] > 0.03, 'a full secunda is a felt floor');
});

test('EV5: by day the sun owns the sky - the term is null even with both moons full', () => {
  // CLK3 review: the term rides the rig's daylight curve now, which is 0 at
  // the dawn minute itself and climbs from there - so "by day" is sampled a
  // quarter hour in (375), where the moon has faded out, not at 06:00 exactly
  for (const m of [375, 720, 1000]) {
    const s = skyState({ minuteOfDay: m, weather: 'sunny', phases: { masser: 4, secunda: 4 } });
    assert.equal(moonlightTerm(s), null, `no moon term at minute ${m}`);
  }
});

test('EV5: new moons light nothing; a lone secunda lifts the floor without a key', () => {
  assert.equal(moonlightTerm(midnight({ masser: 0, secunda: 0 })), null, 'two new moons are a dark night');
  const t = moonlightTerm(midnight({ masser: 0, secunda: LUNAR_PHASES.Full }));
  assert.ok(t, 'secunda alone still answers');
  assert.equal(t.scale, 0, 'no directional key from her');
  assert.ok(t.ambient[0] > 0, 'only the ambient lift');
});

test('EV5: the clouds dim the moon - the same eased cover the dome is drawn with', () => {
  const clear = moonlightTerm(midnight({ masser: 4, secunda: 4 }, 'sunny'));
  const storm = moonlightTerm(midnight({ masser: 4, secunda: 4 }, 'thunder'));
  assert.ok(storm.scale < clear.scale, 'a stormy sky mutes the key');
  assert.ok(storm.ambient[0] < clear.ambient[0], 'and the lift');
  assert.ok(storm.scale > 0, 'but the vis law is a dimmer, not a switch');
});

test('EV5: withMoonAmbient folds in place; null is a no-op', () => {
  const amb = new Float32Array([0.25, 0.25, 0.25]);
  assert.equal(withMoonAmbient(amb, null), amb);
  assert.deepEqual([...amb], [0.25, 0.25, 0.25], 'null touches nothing');
  const out = withMoonAmbient(amb, { ambient: [0.05, 0.04, 0.03] });
  assert.equal(out, amb, 'the same array back - no second allocation');
  assert.ok(Math.abs(amb[0] - 0.3) < 1e-6 && Math.abs(amb[2] - 0.28) < 1e-6);
});

test('EV5: the wiring - three lit shaders, the latched flat tint, the studio, the hosts', () => {
  // and the export itself answers, rather than merely being named: the
  // null arm, and byte-for-byte moonlightTerm for a state the mod's own
  // producer mints (dynamicMoonState, the shape shared.js hands it).
  assert.equal(dynamicMoonlight(null), null, 'no mod moons, no term - the classic night');
  const dyn = {
    mat: { ...MATERIAL_DEFAULTS }, _sunDir: [0, -0.5, 0],
    phases: { masser: { phase: LUNAR_PHASES.Full }, secunda: { phase: LUNAR_PHASES.Full } },
    moonDirection: (w) => (w === 'Moon' ? [0, 0.7, 0.7] : [0, 0.5, 0.5]),
  };
  const modMoons = dynamicMoonState(dyn, 23 * 60, 0);
  assert.ok(moonlightTerm(modMoons), 'the fixture is a LIT mod night - a null-vs-null identity would pin nothing');
  assert.deepEqual(dynamicMoonlight(modMoons), moonlightTerm(modMoons), 'the bridge hands the world the dome\'s own term');
  // both exterior hosts drive it; no interior host ever does
  for (const host of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const src = readFileSync(host, 'utf8');
    assert.ok(src.includes(host === 'src/scenes/world.js' ? 'renderer.setMoonlight(canopyMoon(moonNow && etherAirW ? { scale: moonNow.scale, dir: moonNow.dir, color: etherLight(moonNow.color, etherAirW, ETHER_KEY_TINT) } : moonNow, jungle?.canopy))' : 'renderer.setMoonlight(moonNow)'), `${host} sets the key`);
    assert.ok(src.includes('withMoonAmbient(exteriorAmbient('), `${host} folds secunda into the ambient`);
  }
  for (const host of ['src/scenes/interior.js', 'src/scenes/dungeon.js']) {
    assert.ok(!readFileSync(host, 'utf8').includes('setMoonlight'),
      `${host} never calls setMoonlight - a fresh renderer's scale is already 0`);
  }
});
