// A1 (ROAD TO 1:1): THE TEXTURE SEASON READS THE CALENDAR.
//
// The port had a calendar (S28) and a texture season, and nothing
// joined them: `?season` was parsed once at boot and
// DaggerfallDateTime.SeasonValue was never asked, so winter climate
// swaps, the winter ground archive, the winter nature scatter, the
// winter footstep set and the winter sun could only be reached with a
// URL. Evening Star arrived and the world stayed green.
//
// The reference writes the same one-line test at every production
// site - ClimateSwaps.cs:382-386, DaggerfallLocation.ApplyTimeAndSpace
// (:135-139), StreamingWorld.cs:812, RuntimeMaterials.cs:169,
// DaggerfallBankPurchasePopUp.cs:265 - and polls it LIVE
// (DaggerfallLocation.Update :118-130, PlayerFootsteps :107/:122-133).
//
// The law is pure, so it is tested behaviourally; the host wiring
// needs GL and ARENA2, so it is pinned on the host source the way
// audit23_hosts/audit39_terrainlayout pin theirs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SEASON, INTERIOR_SEASON, climateSeasonFromDate, climateSeasonFromMinutes,
  getGroundArchive, getNatureArchive, applyClimate,
} from '../../src/world/climateSwaps.js';
import { seasonOverride } from '../../src/scenes/shared.js';
import { weatherSunlightScale } from '../../src/world/weather.js';
import {
  SEASONS, MINUTES_PER_DAY, DAYS_PER_MONTH, CLASSIC_GAME_START_TIME,
  dateToClassicMinutes, dateFromClassicMinutes, seasonValue,
} from '../../src/systems/gameDate.js';
import { PlayerMotor, FALL_DAMAGE_THRESHOLD } from '../../src/player/motor.js';
import { Collider } from '../../src/player/collider.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => hostText(p);
const HOSTS = ['src/scenes/exterior.js', 'src/scenes/world.js'];

test('A1: the world clock answers ClimateSeason Winter or Summer, and only those two', () => {
  // ClimateSwaps.cs:382-386 is the conversion written out:
  //     ClimateSeason climateSeason = ClimateSeason.Summer;
  //     if (worldSeason == DaggerfallDateTime.Seasons.Winter)
  //         climateSeason = ClimateSeason.Winter;
  // Spring and Fall are SUMMER to the texture swaps - there is no
  // spring archive in the data - and ClimateSeason.Rain is unreachable
  // from the clock in the whole reference.
  const byMonth = [...Array(12).keys()].map((month) => climateSeasonFromDate({ month }));
  // Evening Star (11), Morning Star (0), Sun's Dawn (1) are the
  // calendar's winter (GetSeasonValue :586-591).
  assert.deepEqual(byMonth, [
    SEASON.Winter, SEASON.Winter, SEASON.Summer, SEASON.Summer,
    SEASON.Summer, SEASON.Summer, SEASON.Summer, SEASON.Summer,
    SEASON.Summer, SEASON.Summer, SEASON.Summer, SEASON.Winter,
  ]);
  assert.ok(!byMonth.includes(SEASON.Rain), 'the clock never selects ClimateSeason.Rain');
  for (let m = 0; m < 12; m++) {
    const want = seasonValue({ month: m }) === SEASONS.Winter ? SEASON.Winter : SEASON.Summer;
    assert.equal(climateSeasonFromDate({ month: m }), want);
  }
});

test('A1: the same law off the one clock - a new game is summer, Evening Star is winter', () => {
  // SetClassicGameStartTime is the 4th of Morning Star (month 0), and
  // month 0 IS winter on GetSeasonValue's clean month boundaries - the
  // quirk DFU's own comment admits and the port carries. So the very
  // first frame of a classic start is a WINTER frame, which is exactly
  // what the old ?season default (summer) got wrong.
  assert.equal(climateSeasonFromMinutes(CLASSIC_GAME_START_TIME), SEASON.Winter);
  const at = (month, day) => dateToClassicMinutes({ year: 405, month, day, hour: 12, minute: 0 });
  assert.equal(climateSeasonFromMinutes(at(4, 0)), SEASON.Summer, 'Second Seed is green');
  assert.equal(climateSeasonFromMinutes(at(11, 0)), SEASON.Winter, 'Evening Star is white');
  // ...and it moves ON A DAY BOUNDARY, which is what lets the hosts
  // poll days instead of minutes: the last minute of Frostfall 30 is
  // summer, the first minute of Evening Star 1 is winter.
  const eve = dateToClassicMinutes({ year: 405, month: 10, day: DAYS_PER_MONTH - 1, hour: 23, minute: 59 });
  assert.equal(climateSeasonFromMinutes(eve), SEASON.Summer);
  assert.equal(climateSeasonFromMinutes(eve + 1), SEASON.Winter);
  assert.equal(dateFromClassicMinutes(eve + 1).month, 11);
});

test('A1: the calendar reaches the archives - ground, nature, climate swap, sun', () => {
  // The four things the season actually moves, driven from a date
  // rather than a URL. Temperate ground 302 -> 303 (GetGroundArchive
  // +1), temperate woodland nature 504 -> 505 (GetNatureArchive's
  // wintering set), the city-A rebase 312 -> 313 (ApplyClimate's
  // supportsWinter arm), and SetSunlightScale's 0.65 winter scale.
  const winter = climateSeasonFromMinutes(dateToClassicMinutes({ year: 405, month: 11, day: 4 }));
  const summer = climateSeasonFromMinutes(dateToClassicMinutes({ year: 405, month: 5, day: 4 }));
  assert.equal(getGroundArchive(300, summer), 302);
  assert.equal(getGroundArchive(300, winter), 303);
  assert.equal(getNatureArchive(504, summer), 504);
  assert.equal(getNatureArchive(504, winter), 505);
  assert.equal(applyClimate(12, 0, 300, summer), 312);
  assert.equal(applyClimate(12, 0, 300, winter), 313);
  assert.equal(weatherSunlightScale('sunny', summer === SEASON.Winter), 1);
  assert.equal(weatherSunlightScale('sunny', winter === SEASON.Winter), 0.65);
});

test('A1: ?season is a debug OVERRIDE now - null when nothing pinned it', () => {
  // The ?cull=off shape: a probe still nails a season for a shot, and
  // an empty URL means "ask the clock", not "summer". The old parser
  // answered SEASON.Summer for a missing param, which is precisely how
  // the calendar got locked out.
  const p = (q) => new URLSearchParams(q);
  assert.equal(seasonOverride(p('')), null);
  assert.equal(seasonOverride(p('loc=Daggerfall')), null);
  assert.equal(seasonOverride(p('season=winter')), SEASON.Winter);
  assert.equal(seasonOverride(p('season=WINTER')), SEASON.Winter);
  assert.equal(seasonOverride(p('season=rain')), SEASON.Rain, 'the unreachable-from-the-clock arm stays hand-selectable');
  assert.equal(seasonOverride(p('season=summer')), SEASON.Summer);
  assert.equal(seasonOverride(p('season=nonsense')), null, 'a typo falls to the clock, not to summer');
});

test('A1: an interior is summer-skinned whatever the date outside', () => {
  // DaggerfallInterior.cs:51 declares `ClimateSeason climateSeason =
  // ClimateSeason.Summer;` and the class NEVER assigns it - :473,
  // :517 and :1270 are the only other mentions and all three are
  // reads. So the exterior season stops at the threshold: with the
  // calendar now driving winter for real, a door carrying the world's
  // season inside would have winter-skinned interiors the reference
  // never winter-skins.
  assert.equal(INTERIOR_SEASON, SEASON.Summer);
  for (const host of HOSTS) {
    const text = read(host);
    assert.match(text, /climateBase(?:: townClimateBase)?, season: INTERIOR_SEASON/,   // AUDIT WD3 G5: the world host's town climate
      `${host}: the static door hands the interior its own constant season`);
    assert.doesNotMatch(text, /climateBase, season,/,
      `${host}: the world season is crossing the threshold again`);
  }
});

test('A1: both hosts take the season from the clock, with ?season demoted to a pin', () => {
  for (const host of HOSTS) {
    const text = read(host);
    assert.match(text, /const seasonPin = seasonOverride\(params\);/,
      `${host}: ?season is still the source, not an override`);
    assert.match(text, /let season = seasonPin \?\? climateSeasonFromMinutes\(skyMinutes\(\)\);/,
      `${host}: the season must fall back to the one clock`);   // TIME1: the SKY's - offline the one clock
    // `let`, because both hosts re-read it: the old `const season`
    // could not have been re-read even if something wanted to.
    assert.doesNotMatch(text, /const season = /, `${host}: the season is frozen again`);
    // PlayerFootsteps (:107, :122-133) re-reads SeasonValue every
    // frame and re-picks the set; the snow crunch is not a boot value.
    // AUDIT PRECIP (
    assert.match(text, /winter: (?:snowCover\.winterAt\(player\.pos, )?season === SEASON\.Winter/,
      `${host}: the footstep set lost its winter arm`);
    // SetSunlightScale (WeatherManager.cs:316-319).
    assert.match(text, /weatherSun = weatherSunlightScale\(weather, season === SEASON\.Winter\)/,
      `${host}: the winter sun lost its term`);
    // The poll is on the frame, beside the weather drain, and it only
    // builds a date when the DAY turns over.
    // takes the clock to READ, because a fast travel has to straighten
    // from the arrival minute - performFastTravel raises time only
    // after TeleportToCoordinates (:333, :344) and the port keeps that
    // order. So the needle is the day-grained SHAPE rather than the
    // literal `worldMinutes()` both hosts used to inline; `atMinutes`
    // defaults to that same clock for every other caller.
    assert.match(text, /const day = Math\.floor\((?:skyMinutes\(\)|atMinutes) \/ MINUTES_PER_DAY\);[^\n]*\n\s*if \(day === _seasonDay\) return/,   // TIME1: the sky's day
      `${host}: the season poll must be day-grained, not per-minute`);
    assert.match(text, /if \(seasonPin !== null\) return/,
      `${host}: a pinned ?season must not be walked over by the clock`);
  }
});

// =====================================================================
// ROAD-Ar R0 - the re-skin must not delete the ground under a live
// player. DaggerfallLocation.Update (:118-130) -> ApplyTimeAndSpace
// (:133-148) -> ApplyClimateSettings is an IN-PLACE material swap on
// standing geometry: the reference never removes terrain for a season
// change, so it has no outage and no fall exposure at all. This host
// bakes its swaps into GL uploads and has to destroy and rebuild the
// pixel, which takes the collider bucket and the terrain floor with
// it - so the port owes the equivalent of "the player never left the
// ground", and the way to owe it is to hold the motor.
// =====================================================================

const STILL = { forward: 0, strafe: 0, run: false, jump: false, up: false, down: false };
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const QUAD = (y) => new Float32Array([-20, y, -20, 20, y, -20, 20, y, 20, -20, y, 20]);
const QUAD_IX = new Uint32Array([0, 1, 2, 0, 2, 3]);
/** The pixel the player stands on: a building roof at 110 in its own
 *  collider bucket, over terrain at 100. destroyPixel takes BOTH
 *  (removeBucket, and `built.delete` which turns heightAt into
 *  -Infinity), so this is the outage in miniature. */
function reskinRig() {
  let floor = 100;
  const col = new Collider(() => floor);
  const add = () => col.addMesh('7,7', QUAD(110), QUAD_IX, IDENTITY);
  add();
  const motor = new PlayerMotor(col);
  motor.spawn(0, 110, 0);
  motor.update(1 / 60, STILL, 0, 0);
  return {
    motor,
    tearDown() { col.removeBucket('7,7'); floor = -Infinity; },
    rebuild() { add(); floor = 100; },
  };
}

test('ROAD-Ar R0: a torn-down pixel is NO FLOOR, and a motor left running is billed the roof it was standing on', () => {
  const rig = reskinRig();
  assert.equal(rig.motor.grounded, true, 'the player starts standing on the pixel');
  const stood = rig.motor.pos[1];
  rig.tearDown();
  // heightAt answers -Infinity for a key that has left `built`, and
  // Collider's last-resort clamp is `feet[1] < floor + SKIN`, which
  // can never fire against it: nothing holds the player up at all.
  for (let i = 0; i < 60; i++) rig.motor.update(1 / 60, STILL, 0, 0);
  assert.equal(rig.motor.grounded, false, 'one second of outage, in free fall');
  assert.ok(rig.motor.pos[1] < stood - FALL_DAMAGE_THRESHOLD, 'and well past the threshold');
  // ...and the ledger is settled against fallStart the moment the
  // rebuilt pixel returns (AcrobatMotor's grounded branch): the floor
  // clamp catches him on the TERRAIN, ten metres under the roof he
  // never stepped off.
  rig.rebuild();
  rig.motor.update(1 / 60, STILL, 0, 0);   // the collider catches him...
  assert.equal(rig.motor.grounded, true, 'the rebuilt pixel is ground again');
  rig.motor.update(1 / 60, STILL, 0, 0);   // ...and FixedUpdate's next pass settles the ledger
  assert.ok(rig.motor.landedFallDistance > FALL_DAMAGE_THRESHOLD,
    'the re-skin arrives as fall damage - the defect this fix exists for');
});

test('ROAD-Ar R0: a HELD motor crosses the same outage unmoved and unbilled', () => {
  // The fix's law: not calling update() at all is this port's nearest
  // thing to ApplyClimateSettings, because the player does not move -
  // no gravity is integrated, so position, fallStart and `falling`
  // are exactly what they were when the ground went away.
  const rig = reskinRig();
  const stood = rig.motor.pos[1];
  rig.tearDown();
  for (let i = 0; i < 60; i++) { /* the host runs no update while _seasonHeld */ }
  assert.equal(rig.motor.pos[1], stood, 'a held motor does not fall');
  rig.rebuild();
  // The release re-anchors the fall the way _teleportToPixel's landing
  // does - spawn() clears `falling` and puts fallStart at the feet.
  rig.motor.spawn(rig.motor.pos[0], rig.motor.pos[1], rig.motor.pos[2]);
  assert.equal(rig.motor.fallStart, stood);
  assert.equal(rig.motor.falling, false);
  rig.motor.update(1 / 60, STILL, 0, 0);
  rig.motor.update(1 / 60, STILL, 0, 0);
  assert.equal(rig.motor.grounded, true, 'and he is standing where he stood');
  assert.equal(rig.motor.pos[1], stood);
  assert.ok(rig.motor.landedFallDistance <= FALL_DAMAGE_THRESHOLD,
    'nothing is billed for the outage');
});

// =====================================================================
// ROAD-Ar R1 - the straightening must read the ARRIVAL clock.
// =====================================================================

test('R1 CLOSEOUT: the frame cannot poll the straightened season away while the destination builds', () => {
  // R1 straightened the season off the ARRIVAL clock, and the frame
  // loop put it straight back. DaggerfallTravelPopUp runs
  // TeleportToCoordinates (:333) and RaiseTime (:344) inside ONE Unity
  // frame with nothing between them, so the state R1 creates - the
  // season cache holding the ARRIVAL month while the one clock still
  // reads the DEPARTURE minute - cannot be observed there. Here it can:
  // the destination pixel is built across an await, and the frame's
  // tickSeason has no travel gate.
  //
  // The mechanism, over the real law: refreshSeason latches its day AND
  // its season from whatever clock it is handed, with no memory that
  // the clock was a future one - so a live-clock re-read during the
  // build sees the day go BACKWARDS and reassigns both.
  const departure = dateToClassicMinutes({ year: 405, month: 5, day: 0, hour: 12, minute: 0 });   // Second Seed
  const arrival = dateToClassicMinutes({ year: 405, month: 11, day: 0, hour: 12, minute: 0 });    // Evening Star
  assert.equal(climateSeasonFromMinutes(departure), SEASON.Summer);
  assert.equal(climateSeasonFromMinutes(arrival), SEASON.Winter);
  assert.notEqual(Math.floor(arrival / MINUTES_PER_DAY), Math.floor(departure / MINUTES_PER_DAY),
    'the day moves, which is the only thing refreshSeason gates on - so a live re-read is not a no-op');

});
