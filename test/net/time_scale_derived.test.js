// The figures that were written for TimeScale 12 follow the server profile's time.worldScale: the Hunters' Mark days in a
// UTC day, the sea season's day and rise, the court's round, and the camp encounter window. At 12 each is the figure it
// was; at another scale it moves with the clock.
import { playByRules } from '../profileRules.mjs'; // a server profile's rule keys, for one test
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gameDaysPerUtcDay, huntClearLateDays, huntClearOf, huntGameDayAt } from '../../src/net/huntLaw.js';
import {
  seaLegendRiseS,
  seaWorldDayS,
  seaLegendsPossible,
  seaSeasonStartS,
  SEA_LEGENDS,
} from '../../src/net/sea/seaSeasonLaw.js';
import { courtRoundMs } from '../../src/scenes/gate/gateCourt.js';
import { campWindowMinutes, campWindowOpen, CAMP_WINDOW_REAL_MINUTES } from '../../src/systems/campEncounters.js';
import { setSharedClock, CLASSIC_MINUTES_PER_SECOND } from '../../src/systems/worldTick.js';
import { sharedClassicMinutes, wallMsForClassicMinutes, ONLINE_EPOCH_MS } from '../../src/net/wire.js';
import { bountyId } from '../../src/systems/bounty/bountyBoard.js';

afterEach(() => setSharedClock(null));

const FIGURES = (scale) => ({
  huntDays: scale,
  riseS: Math.round((30 * 1440 * 60) / scale),
  dayS: Math.round((1440 * 60) / scale),
  roundMs: Math.round(60_000 / scale),
});

test("TIMESCALE-DERIVED at DFU's 12 every figure is the one it was", () => {
  assert.equal(gameDaysPerUtcDay(), 12, 'a game day every two real hours');
  assert.equal(huntClearLateDays(), 12);
  assert.equal(seaWorldDayS(), 7200);
  assert.equal(seaLegendRiseS(), 60 * 3600, 'thirty world days are sixty hours of wall time');
  assert.equal(courtRoundMs(), 5000, 'a game minute is five real seconds');
  assert.equal(campWindowMinutes(), 180);
  assert.equal(CAMP_WINDOW_REAL_MINUTES, 15);
});

test('TIMESCALE-DERIVED at other scales each figure moves with the clock: a day, a rise, a round and a window are the scale over twelve of what they were (mutants: a figure left at 12; a figure that moves the wrong way)', (t) => {
  for (const scale of [1, 6, 24, 60, 100]) {
    playByRules(t, { 'time.worldScale': scale });
    const f = FIGURES(scale);
    assert.equal(gameDaysPerUtcDay(), f.huntDays, `hunt days at ${scale}`);
    assert.equal(huntClearLateDays(), f.huntDays);
    assert.equal(seaWorldDayS(), f.dayS, `sea day at ${scale}`);
    assert.equal(seaLegendRiseS(), f.riseS, `sea rise at ${scale}`);
    assert.equal(courtRoundMs(), f.roundMs, `court round at ${scale}`);
  }
});

test("TIMESCALE-DERIVED the Hunters' Mark late bound is a real day's of game days at the profile's scale", (t) => {
  for (const scale of [12, 24, 6]) {
    playByRules(t, { 'time.worldScale': scale });
    const now = ONLINE_EPOCH_MS + 40 * 86_400_000;
    const today = huntGameDayAt(now);
    const late = huntClearLateDays();
    assert.equal(late, scale);
    assert.equal(
      huntClearOf(bountyId(today - late, 300, 200, 1, 7), now).kind,
      'board',
      `scale ${scale}: a real day late is still taken`,
    );
    assert.deepEqual(
      huntClearOf(bountyId(today - late - 1, 300, 200, 1, 7), now),
      { why: 'late' },
      `scale ${scale}: a game day more is late`,
    );
  }
});

test("TIMESCALE-DERIVED the sea season's legends rise at the world's pace: how many a captain can have ended grows with the scale", (t) => {
  const start = seaSeasonStartS(5);
  const after = (s) => start + s;
  playByRules(t, { 'time.worldScale': 12 });
  assert.equal(seaLegendsPossible(after(60 * 3600 - 1)), SEA_LEGENDS);
  assert.equal(
    seaLegendsPossible(after(60 * 3600)),
    2 * SEA_LEGENDS,
    'sixty hours on, the aether has raised them once',
  );
  playByRules(t, { 'time.worldScale': 24 });
  assert.equal(seaLegendsPossible(after(30 * 3600 - 1)), SEA_LEGENDS);
  assert.equal(seaLegendsPossible(after(30 * 3600)), 2 * SEA_LEGENDS, 'at 24 thirty hours are thirty world days');
  assert.equal(seaLegendsPossible(after(90 * 3600)), 4 * SEA_LEGENDS);
});

test('TIMESCALE-DERIVED the camp window offline is 180 game minutes whatever the profile says; online it is fifteen game minutes for each unit of the scale', (t) => {
  playByRules(t, { 'time.worldScale': 24 });
  assert.equal(campWindowMinutes(), 15 * 60 * CLASSIC_MINUTES_PER_SECOND, 'single player runs the classic clock');
  assert.equal(campWindowMinutes(), 180);
  for (const scale of [12, 24, 6, 100]) {
    playByRules(t, { 'time.worldScale': scale });
    setSharedClock(() => sharedClassicMinutes(ONLINE_EPOCH_MS + 3_600_000));
    assert.equal(campWindowMinutes(), 15 * scale, `online at ${scale}`);
    assert.equal(campWindowOpen(0), true);
    assert.equal(campWindowOpen(15 * scale - 1), false);
    assert.equal(campWindowOpen(15 * scale), true);
    assert.equal(campWindowOpen(15 * scale * 7 + 0.9), true, 'floored, as the loop hands whole minutes');
    // fifteen real minutes of the shared clock are one window
    const t0 = ONLINE_EPOCH_MS + 7 * 3_600_000;
    assert.ok(
      Math.abs(sharedClassicMinutes(t0 + 15 * 60_000) - sharedClassicMinutes(t0) - campWindowMinutes()) < 1e-6,
      `${scale}: fifteen real minutes`,
    );
    assert.ok(
      Math.abs(wallMsForClassicMinutes(sharedClassicMinutes(t0) + campWindowMinutes()) - (t0 + 15 * 60_000)) < 1e-3,
    );
    setSharedClock(null);
  }
});
