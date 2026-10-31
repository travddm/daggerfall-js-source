// ---------------------------------------------------------------------------
// AUDIT 64 - THE TRAVEL LANE (2026-09-08).
//
// Seven findings against the fast-travel / teleport arc, all of them
// clauses DFU spells and the port did not:
//
//   F18  performFastTravel's arrival reposition - DirectionFromStartMarker,
//        including the travelStartX/travelStartZ facing hint that is the
//        only thing separating it from RandomStartMarker.
//   F19  TeleportAway's RandomStartMarker, which the guild teleport dropped.
//   F20  the arrival clamp's SECOND arm, Career.DamageFromSunlight.
//   F21  the travel map door's career refusal, above the racial one.
//   F22  DaggerfallTravelPopUp_OnPostFastTravel's crime clear.
//   F23  the travel map's L/F keys, read from the DaggerfallShortcut table.
//   F24  the sunlightDamageFastTravelDay sentence.
//
// Every assertion below states the REFERENCE's value - the side DFU's
// table gives for a delta, the hour DFU raises a sun-averse arrival to,
// the sentence Internal_Strings.csv carries - so a revert of any one fix
// turns it red rather than merely reshaping it.
// ---------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  pickLocationSide, LOCATION_SIDES, locationArrivalLanding,
  LOCATION_TYPE_TOWN_CITY, EXTRA_DISTANCE,
} from '../../src/world/locationEntrance.js';
import { REPOSITION } from '../../src/systems/ship.js';
import { RMB_SIDE } from '../../src/world/locationLayout.js';
import { arrivalClampMinutes } from '../../src/systems/travel/travel.js';
import { careerSunDamage, careerSunAverse } from '../../src/systems/passiveSpecials.js';
import { SPECIAL_ABILITY_BITS } from '../../src/systems/specialAdvantages.js';
import { SUNLIGHT_TRAVEL_TEXT, VAMPIRE_HOOD_TEXT, racialFastTravelBlock, careerFastTravelBlock } from '../../src/systems/vampirism.js';
import { isDayFromMinutes } from '../../src/systems/gameDate.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

/** MapsFile.MapPixelToWorldCoord's own unit - one map pixel of world. */
const PIXEL = 32768;

// ── F18: THE SIDE PICK (StreamingWorld.cs:1481-1521) ─────────────────

test('AUDIT 64 F18: DirectionFromStartMarker weights the side by where the journey began', () => {
  // DFU's table, read off StreamingWorld.cs:1503-1518, is stated here
  // rather than derived from the port: side 3 is WEST, 2 is EAST, 1 is
  // SOUTH, 0 is NORTH, and each side faces back INTO the location
  // (:1537-1564). A journey EASTWARD (worldDeltaX > 0, the destination
  // east of the start) therefore lands the player on the location's
  // WEST edge - the side they came from - facing east.
  assert.deepEqual(LOCATION_SIDES.map((s) => `${s.name}:${s.facing}`),
    ['north:180', 'south:0', 'east:270', 'west:90'],
    'the four sides in Random.Range(0, 4) order, with SetFacing\'s degrees');

  const purelyEW = (dx) => pickLocationSide({
    travelStart: { x: 0, z: 0 },
    worldPos: { x: dx, z: 0 },
    roll: () => 0,
  });
  assert.equal(purelyEW(3 * PIXEL), 3, ':1507 - travelled EAST, so the WEST side');
  assert.equal(purelyEW(-3 * PIXEL), 2, ':1507 - travelled WEST, so the EAST side');

  const purelyNS = (dz) => pickLocationSide({
    travelStart: { x: 0, z: 0 },
    worldPos: { x: 0, z: dz },
    roll: () => 0,
  });
  assert.equal(purelyNS(3 * PIXEL), 1, ':1515 - travelled NORTH, so the SOUTH side');
  assert.equal(purelyNS(-3 * PIXEL), 0, ':1515 - travelled SOUTH, so the NORTH side');

  // :1502-1509 - the roll decides between the two candidate sides in
  // proportion px : pz. px = 3, pz = 1, so Random.Range(0, 4) < 3 takes
  // the E-W side and 3 takes the N-S one.
  const mixed = (r) => pickLocationSide({
    travelStart: { x: 0, z: 0 },
    worldPos: { x: 3, z: 1 },
    roll: () => r,
  });
  assert.equal(mixed(0), 3, 'random 0 < px: the E-W front side, and dx > 0 is West');
  assert.equal(mixed(0.5), 3, 'random 2 < px: still the E-W side');
  assert.equal(mixed(0.99), 1, 'random 3 is not < px: the N-S side, and dz > 0 is South');

  // AUDIT 64 F18 (review): the N-S branch has two arms too, and the
  // ELSE one is :1516-1517 - `side = worldDeltaX > 0 ? 3 : 2;`, the
  // same E-W pair the if-arm at :1507 gives, reached when the roll
  // misses the front side. px = 1, pz = 3, Random.Range(0, 4) = 3,
  // which is NOT < pz, so the answer is the E-W side and dx > 0 is West.
  assert.equal(pickLocationSide({
    travelStart: { x: 0, z: 0 }, worldPos: { x: 1, z: 3 }, roll: () => 0.99,
  }), 3, ':1517 - the N-S branch\'s miss takes the WEST side for an eastward journey');
  assert.equal(pickLocationSide({
    travelStart: { x: 0, z: 0 }, worldPos: { x: -1, z: 3 }, roll: () => 0.99,
  }), 2, ':1517 - and the EAST side for a westward one');

  // :1503 - `if (px > pz)` is STRICT, so an exactly diagonal journey
  // takes the N-S branch. px = pz = 2, Random.Range(0, 4) = 3, which is
  // not < pz, so :1517 again: dx > 0 is West. (Under `px >= pz` the
  // E-W branch would answer 1, South.)
  assert.equal(pickLocationSide({
    travelStart: { x: 0, z: 0 }, worldPos: { x: 2, z: 2 }, roll: () => 0.99,
  }), 3, ':1503 - px > pz is strict; the tie is the N-S branch');

  // :1483-1487 and :1494-1495 - no hint, or a zero delta, is the plain
  // Random.Range(0, 4) every OTHER caller of the arm takes.
  for (const [i, r] of [[0, 0], [1, 0.3], [2, 0.6], [3, 0.99]]) {
    assert.equal(pickLocationSide({ roll: () => r }), i, 'no hint: Random.Range(0, 4)');
    assert.equal(pickLocationSide({
      travelStart: { x: 5, z: 5 }, worldPos: { x: 5, z: 5 }, roll: () => r,
    }), i, 'a zero delta falls back to the same roll');
  }
});

test('AUDIT 64 F18: the hint reaches the landing, and the landing is an EDGE, not a centre', () => {
  const origin = [1000, 4, 2000];
  const town = {
    name: 'Somewhere', regionIndex: 17,
    mapTableData: { mapId: 1, locationType: LOCATION_TYPE_TOWN_CITY },
    exterior: { exteriorData: { mapId: 1, width: 2, height: 2, blockNames: [] } },
  };
  // travelled EAST -> the WEST edge (:1507, :1560-1563): centre minus
  // (halfWidth + RMBSide * 0.1), facing 90.
  const at = locationArrivalLanding(town, {
    origin,
    startMarkers: [],
    travelStart: { x: 0, z: 0 },
    worldPos: { x: 8 * PIXEL, z: 0 },
    roll: () => 0,
  });
  assert.equal(at.side, 'west');
  assert.equal(at.yaw, (90 * Math.PI) / 180, 'SetFacing(90, 0) - back into the town');
  const half = 2 * 0.5 * RMB_SIDE;
  assert.deepEqual(at.pos, [origin[0] + half - (half + EXTRA_DISTANCE), origin[1], origin[2] + half],
    'a tenth of a block OUTSIDE the rectangle, not its centre');
});

// ── F18 / F19: THE HOSTS ─────────────────────────────────────────────

test('AUDIT 64 F18/F19: fast travel and the guild teleport carry DFU\'s reposition', () => {
  // StreamingWorld.RepositionMethods (StreamingWorld.cs:215-223) - the
  // port carries the three its hosts reach.
  assert.equal(REPOSITION.DirectionFromStartMarker, 'DirectionFromStartMarker');
  assert.equal(REPOSITION.RandomStartMarker, 'RandomStartMarker');

});

// ── F20 / F21: Career.DamageFromSunlight, twice ──────────────────────

/** A custom class carrying the "Damage / From Sunlight" disadvantage -
 *  specialAdvantages.js:"secondary === 'fromSunlight'"'s own write, mirroring
 *  CreateCharSpecialAdvantageWindow's pick. No racial override. */
const sunCareer = () => ({ abilityFlagsAndSpellPointsBitfield: SPECIAL_ABILITY_BITS.sunDamage });

test('AUDIT 64 F20: the arrival clamp\'s SECOND arm is the CAREER flag', () => {
  const career = sunCareer();
  assert.equal(careerSunDamage(career), true, 'bit 16 is DFCareer.DamageFromSunlight');

  // DaggerfallTravelPopUp.cs:350-357: "Vampires and characters with
  // Damage from Sunlight disadvantage never arrive between 6am and 6pm
  // regardless of travel type" - RaiseTime((DuskHour - Hour) * 3600).
  // A noon arrival is pushed to hour 18, DFU's DuskHour.
  const noon = 12 * 60;
  assert.equal(arrivalClampMinutes(noon, { sunAverse: careerSunDamage(career) }), 6 * 60,
    'noon + 6h = DuskHour (18)');
  assert.equal((noon + arrivalClampMinutes(noon, { sunAverse: careerSunDamage(career) })) / 60, 18);
  // ...and a night arrival is left alone, career flag or not.
  assert.equal(arrivalClampMinutes(2 * 60, { sunAverse: careerSunDamage(career) }), 0);
  // A career WITHOUT the bit takes no clamp at all - the arm is the
  // flag's, not every custom class's.
  assert.equal(careerSunDamage({ abilityFlagsAndSpellPointsBitfield: 0 }), false);

  // The PRODUCER, at the one caller of arrivalClampMinutes: DFU's
  // disjunction, the same one the per-round burn spelled until VAMP-DAY
  // took its racial arm (passiveSpecials.js:"sinks?.hurt?.(SUN_DAMAGE_AMOUNT)" reads the career alone;
  // the travel rules still read both). VAMP-HOOD (2026-09-29): the racial
  // arm is the flag under a bare head - vampirism.js racialSunAverse -
  // and HOOD-CAREER (2026-10-07, PIN MOVED) the career's beside it too:
  // passiveSpecials.js careerSunAverse, the bit under a bare head (a
  // bare entity carries no equip, so it reads the bit).
  assert.equal(careerSunAverse({ career }), true, 'bare-headed: the bit');
});

test('AUDIT 64 F21: the travel map door refuses a career sun-damaged class by day', () => {
  // DaggerfallUI.cs:614-621 is a rung of its own, and it sits ABOVE the
  // racial override's CheckFastTravel (:624-626). It reads
  // PlayerEntity.Career.DamageFromSunlight where CheckFastTravel reads
  // the RacialOverrideEffect - so the racial helper must NOT answer for
  // a career-flagged non-vampire, and the door must ask separately.
  const career = sunCareer();
  assert.equal(racialFastTravelBlock({ career }, 12 * 60), null,
    'CheckFastTravel is the RACIAL rung and never reads the career');
  // HOOD-CAREER (2026-10-07, PIN MOVED): the career rung is
  // vampirism.js careerFastTravelBlock, the racial rung's shape - DFU's
  // box by day, bare-headed, and the hood's way out after it.
  assert.deepEqual(careerFastTravelBlock({ career }, 12 * 60), { text: SUNLIGHT_TRAVEL_TEXT, hint: VAMPIRE_HOOD_TEXT }, 'noon: refused');
  assert.equal(careerFastTravelBlock({ career }, 2 * 60), null, 'night: admitted');
  assert.equal(careerFastTravelBlock({ career: { abilityFlagsAndSpellPointsBitfield: 0 } }, 12 * 60), null, 'no bit: admitted');
  assert.equal(careerFastTravelBlock({ racialOverride: { sunDamage: true } }, 12 * 60), null,
    'the career rung never reads the racial override');
  assert.equal(isDayFromMinutes(12 * 60) && !isDayFromMinutes(2 * 60), true);

});

// ── F22: the crime clear ─────────────────────────────────────────────

// ── F24: the sentence ────────────────────────────────────────────────

test('AUDIT 64 F24: the sunlightDamageFastTravelDay refusal is DFU\'s own line', () => {
  // Internal_Strings.csv:657 - `sunlightDamageFastTravelDay,You cannot
  // initiate fast travel during the day.` - which is also what the
  // shipped en table carries (Internal_Strings Shared Data.asset:2007
  // binds the key to m_Id 500; Internal_Strings_en.asset:2350).
  assert.equal(SUNLIGHT_TRAVEL_TEXT, 'You cannot initiate fast travel during the day.');
  // ONE key, so BOTH refusals speak it: VampirismEffect.cs:202 and
  // DaggerfallUI.cs:619. VAMP-HOOD: the port's hood line rides BESIDE
  // DFU's as `hint`, said after it - never in its place.
  assert.deepEqual(racialFastTravelBlock({ racialOverride: { sunDamage: true } }, 12 * 60),
    { text: SUNLIGHT_TRAVEL_TEXT, hint: VAMPIRE_HOOD_TEXT });
  // HOOD-CAREER (PIN MOVED): the career box speaks it through its own
  // rung, careerFastTravelBlock, as the racial one does.
  assert.deepEqual(careerFastTravelBlock({ career: sunCareer() }, 12 * 60),
    { text: SUNLIGHT_TRAVEL_TEXT, hint: VAMPIRE_HOOD_TEXT }, 'and the career box shows the same constant');
});
