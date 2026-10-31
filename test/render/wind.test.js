// WIND1 - THE WIND IS ITS OWN THING.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWindModel, frontFactor, gustEnvelope, VIOLENCE, FRONT_LEAD_MIN, FRONT_HOLD_MIN, FRONT_TAIL_MIN, seededRng } from '../../src/systems/wind/wind.js';
import { labWindSlider } from '../../src/render/labGrass.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const slider = (m) => labWindSlider(m.vector());

test('WIND1: a front builds, holds and rolls away - the time-lapse', () => {
  // Mac: "seeing a storm rolling in as the wind kicks up, and the front
  // rolling away as the wind kicks down." A sunny day; at midnight the
  // sim turns to thunder; the next midnight, back to sunny.
  const m = createWindModel({ seed: 3 });
  const at = (t) => { m.tick(t, t >= 1440 && t < 2880 ? 'thunder' : 'sunny'); return slider(m); };
  const evening = at(1440 - 60);
  const arrival = at(1440);
  const two = at(1440 + 120);
  const four = at(1440 + 240);
  const noon = at(1440 + 720);
  assert.ok(two > arrival && four >= two, `it BUILDS after the change: ${arrival} -> ${two} -> ${four}`);
  assert.ok(four >= 190, `a thunder front reaches the slider's top: ${four}`);
  assert.ok(noon < four && noon > evening, `and settles to a windy storm-day between: ${noon}`);
  // the storm leaves: the wind rolls away over hours, never snaps
  const leaving = [0, 60, 120, 180, 240, 300].map((k) => at(2880 + k));
  for (let i = 1; i < leaving.length; i++) assert.ok(leaving[i] <= leaving[i - 1] + 1, `rolling away: ${leaving.join(' -> ')}`);
  assert.ok(leaving[0] - leaving[1] < 40, 'no one-tick drop - the day\'s calm blends in over the morning');
  assert.ok(leaving[5] < leaving[0] * 0.5, 'and it is gone by mid-morning');
});

test('WIND1: the envelope, the violence, the gusts - pure laws', () => {
  assert.equal(frontFactor(-FRONT_LEAD_MIN - 1), 0, 'nothing before the lead');
  assert.equal(frontFactor(0), 1, 'full at arrival');
  assert.equal(frontFactor(FRONT_HOLD_MIN - 1), 1, 'held');
  assert.equal(frontFactor(FRONT_HOLD_MIN + FRONT_TAIL_MIN), 0, 'gone after the tail');
  const mid = frontFactor(-FRONT_LEAD_MIN / 2);
  assert.ok(mid > 0.4 && mid < 0.6, 'halfway up the lead is halfway');
  assert.ok(VIOLENCE.thunder > VIOLENCE.rain && VIOLENCE.rain > VIOLENCE.snow && VIOLENCE.snow > VIOLENCE.cloudy,
    'a storm brings more than a shower, a shower more than a flurry');
  assert.ok(VIOLENCE.fog < VIOLENCE.sunny, 'fog is the stillest of all');
  // GUSTS ARE THE WIND'S: a strong wind gusts sharper and more often.
  const spread = (s) => { let lo = 9, hi = 0; for (let t = 0; t < 60; t += 0.05) { const g = gustEnvelope(s, t); lo = Math.min(lo, g); hi = Math.max(hi, g); } return hi - lo; };
  assert.ok(spread(1) > spread(0.1) * 1.15, `a storm's gusts swing wider than a breeze's: ${spread(1).toFixed(2)} vs ${spread(0.1).toFixed(2)}`);
  // and a seed replays: the same day is the same day
  const a = seededRng(42), b = seededRng(42);
  assert.equal(a(), b());
});

test('WIND1: two days differ, and a mild change is a mild front', () => {
  const m = createWindModel({ seed: 11 });
  const days = [];
  for (let d = 0; d < 6; d++) { m.tick(d * 1440 + 900, 'sunny'); days.push(Math.round(slider(m))); }
  assert.ok(new Set(days).size >= 4, `six sunny afternoons are not one wind: ${days.join(', ')}`);
  // sunny -> cloudy is a breath, not a gale
  const n = createWindModel({ seed: 5 });
  n.tick(100, 'sunny'); const before = slider(n);
  n.tick(1440, 'cloudy'); n.tick(1440 + 240, 'cloudy'); const after = slider(n);
  assert.ok(after - before < 120, `a cloudy morning is not a thunder front: ${before} -> ${after}`);
});

test('WIND2: the clouds move by an INTEGRATED drift, and the wind leads the sky for the whole lead', () => {
  // With a fixed per-weather wind, wind * time and an integrated drift
  // were the same number. With WIND1's wind changing every frame
  // through a three-hour front, wind * time made the cloud field's
  // offset jump by (delta wind) * (seconds since the sky began): the
  // clouds STREAMED across the sky at every front. Nobody saw it,
  // because nobody has seen WIND1.
  const m = createWindModel({ seed: 3 });
  m.tick(1000, 'sunny');
  assert.equal(m.inLead(), false, 'no front, no lead');
  m.tick(1440, 'thunder');
  assert.equal(m.inLead(), true, 'from the change itself...');
  assert.equal(m.frontProgress(), 0, '...even while the factor is still 0 - the case WIND1 missed');
  m.tick(1440 + FRONT_LEAD_MIN - 1, 'thunder');
  assert.equal(m.inLead(), true);
  m.tick(1440 + FRONT_LEAD_MIN, 'thunder');
  assert.equal(m.inLead(), false, 'and not once it has arrived');
});
