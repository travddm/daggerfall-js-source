// INTERIOR-DIM. On the Enhanced Lighting lane a building's own lamps burn
// at half their intensity (the white ones in the flame) and the room's grade holds the eye down. Pinned with no GL and
// no game data: the law against every record AddLight's second switch knows, the grade through the air pass's own
// setGrade, and both interior hosts' wiring. tools/interiorDimProbe.mjs draws it on SwiftShader.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EL_INTERIOR_LIGHT_SCALE, EL_INTERIOR_GRADE, EL_FLAME_COLOR, interiorLightColor, interiorGrade, lanternColor, elDecode,
} from '../../src/render/enhancedLighting.js';
import { AirPass, AIR_BLOOM_STRENGTH, AIR_VIGNETTE, AIR_CONTRAST, AIR_ADAPT_MAX } from '../../src/render/airPass.js';
import { interiorLightProperties, INTERIOR_LIGHT_COLOR } from '../../src/world/interior/interiorLights.js';

const rd = (p) => readFileSync(p, 'utf8');
const r4 = (a) => [...a].map((v) => +v.toFixed(4));
// the linear luminance a colour the hosts hand the renderer becomes on the lane (it decodes every colour it uploads)
const linLum = (c) => 0.2126 * elDecode(c[0]) + 0.7152 * elDecode(c[1]) + 0.0722 * elDecode(c[2]);
// every record of TEXTURE.210 the switch can see (0-29), and one past it (the prefab's light, no arm)
const RECORDS = Array.from({ length: 31 }, (_, i) => i);

test('INTERIOR-DIM THE LAMPS: off the lane a room light is DFU\'s colour x intensity to the bit, every record; on it half that, the white ones in the flame - a lantern, a candle, the turquoise lamp and the prefab\'s white each to its numbers (mutants: the scale gone, every lamp white, the flame never taken, the intensity dropped off the lane)', () => {
  assert.equal(EL_INTERIOR_LIGHT_SCALE, 0.5);
  for (const rec of RECORDS) {
    const L = interiorLightProperties(rec);
    assert.deepEqual(interiorLightColor(false, L.color, L.intensity), [L.color[0] * L.intensity, L.color[1] * L.intensity, L.color[2] * L.intensity], `record ${rec}: the classic set keeps DFU's numbers`);
  }
  const on = (rec) => { const L = interiorLightProperties(rec); return r4(interiorLightColor(true, L.color, L.intensity)); };
  assert.deepEqual(on(25), [0.7, 0.686, 0.448], 'a lantern with a medium chain: its own warm colour at half 1.4');
  assert.deepEqual(on(3), [0.5, 0.36, 0.21], 'a candle (the prefab\'s white): the flame at half 1');
  assert.deepEqual(on(8), [0.34, 0.5, 0.47], 'the turquoise lamp keeps its colour - a 1 in one channel is not white');
  assert.deepEqual(on(29), r4(EL_FLAME_COLOR.map((c) => c * 0.5)), 'a "todo" record: the prefab\'s white, in the flame');
  assert.deepEqual(on(30), on(29), 'past the switch, the prefab\'s light likewise');
  assert.equal(interiorLightProperties(3).color, INTERIOR_LIGHT_COLOR, 'the white the flame replaces is the prefab\'s own');
});

test('INTERIOR-DIM THE LAW: on the lane no room lamp outshines the street\'s lantern (the city\'s white in the flame) in linear luminance, where off it a lantern did by three and a half times; every lamp still lights (mutants: the scale at 0.6)', () => {
  const street = linLum(lanternColor(true, new Float32Array([1, 1, 1])));
  const was = (rec) => { const L = interiorLightProperties(rec); return linLum(interiorLightColor(false, L.color, L.intensity)); };
  const now = (rec) => { const L = interiorLightProperties(rec); return linLum(interiorLightColor(true, L.color, L.intensity)); };
  assert.ok(was(25) > 3.5 * street, `before: a lantern ${was(25).toFixed(3)} against the street's ${street.toFixed(3)}`);
  for (const rec of RECORDS) {
    assert.ok(now(rec) <= street, `record ${rec}: ${now(rec).toFixed(3)} <= the street's ${street.toFixed(3)}`);
    assert.ok(now(rec) > 0, `record ${rec}: still lit`);
    assert.ok(now(rec) < was(rec), `record ${rec}: dimmer than it was`);
  }
});

test('INTERIOR-DIM THE GRADE: the room\'s eye aimed at 0.12 and held at 1.2, bloom, vignette and contrast the lane\'s own, through the air pass\'s own setGrade (its field names); none off the lane (mutants: the ceiling at 1.8, the key at 0.18, a field misnamed, the grade on the classic set)', () => {
  assert.deepEqual({ ...EL_INTERIOR_GRADE }, { adaptKey: 0.12, adaptMax: 1.2 });
  assert.ok(Object.isFrozen(EL_INTERIOR_GRADE));
  assert.equal(interiorGrade(true), EL_INTERIOR_GRADE);
  assert.equal(interiorGrade(false), null);
  assert.ok(EL_INTERIOR_GRADE.adaptMax < AIR_ADAPT_MAX, 'the eye opens less indoors than the lane lets it elsewhere');
  const air = Object.create(AirPass.prototype);
  air.grade = new Float32Array([0, 1, 0, 0]); air.adaptParams = new Float32Array([0, 0, 0.7, 0]);
  air.setGrade(interiorGrade(true));
  assert.deepEqual(r4(air.adaptParams), [0, 0.12, 0.7, 1.2], 'the resolve\'s eye takes the key and the ceiling');
  assert.deepEqual(r4(air.grade), r4([AIR_BLOOM_STRENGTH, 1, AIR_VIGNETTE, AIR_CONTRAST]), 'the rest the lane\'s defaults');
});

