// The siege referee holds a work blow to the striker's harm ceiling, spends magicka on casts and heals, and keeps the
// field's ground near the first one judged; the service settles a field by three aged witnesses and never by a count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newFighter,
  refereeWorkBlow,
  refereeCast,
  SIEGE_HIT,
  SIEGE_UNITS_PER_M,
  SIEGE_HARM,
  SIEGE_CASTS,
  SIEGE_MAGICKA,
  SIEGE_GROUND_DRIFT_UNITS,
  SIEGE_HEIGHT_M,
  anchoredGround,
} from '../../../src/net/siege/siegeRef.js';
import { settleField, witnessedField, fieldInPixel, fieldShapeOk } from '../../../src/net/townSeatLaw.js';
import { ARENA_MAGICKA_DEPTH, ARENA_MAGICKA_REGEN } from '../../../src/net/arena/arenaLaw.js';
import { PIXEL_UNITS } from '../../../src/net/wire.js';

const M = SIEGE_UNITS_PER_M;
const at = (x) => ({ x: x * M, y: 0, z: 0 });

test("blows on the Ram are held to the striker's harm ceiling, as blows on a fighter are", () => {
  const by = newFighter(10, 0);
  const ram = { hp: 3000, max: 3000 };
  let now = 1000;
  let dealt = 0;
  for (let i = 0; i < 40; i++) {
    now += 250;
    dealt += refereeWorkBlow(
      by,
      ram,
      { point: [0, 0], size: 2, from: at(0), held: { w: 123, m: 9 }, d: 124, r: SIEGE_HIT.Melee, share: 1 },
      now,
    ).dealt;
  }
  assert.ok(dealt > 0, 'honest blows land');
  assert.ok(dealt <= SIEGE_HARM.max * 3, `ten seconds of blows stay under the ceiling (${dealt})`);
  assert.ok(ram.hp > 3000 - 124 * 40, 'not one blow in four at the cap');
});

test('casts and heals draw on a magicka pool', () => {
  assert.deepEqual(
    [SIEGE_MAGICKA.depth, SIEGE_MAGICKA.regenPerS],
    [ARENA_MAGICKA_DEPTH, ARENA_MAGICKA_REGEN],
    'the arena pool',
  );
  assert.equal(SIEGE_GROUND_DRIFT_UNITS, (SIEGE_HEIGHT_M / 2) * M, 'half a point sphere');
  const by = newFighter(10, 0),
    to = newFighter(10, 0);
  const near = { x: 0, y: 0, z: 0 },
    there = at(5);
  let now = 1000,
    landed = 0;
  for (let i = 0; i < 12; i++) {
    now += SIEGE_CASTS.windowMs + 1; // clear of the cast count: only magicka can refuse
    to.hp = to.max;
    landed += refereeCast(by, to, { from: near, at: there, d: SIEGE_CASTS.damageMax }, now).dealt;
  }
  assert.ok(landed >= SIEGE_CASTS.damageMax, 'a cast lands');
  by.mana = 0;
  by.manaAt = now;
  to.hp = to.max;
  assert.equal(refereeCast(by, to, { from: near, at: there, d: 40 }, now).dealt, 0, 'an empty pool casts nothing');
  to.hp = 10;
  assert.ok(!refereeCast(by, to, { from: near, at: there, d: 40, heal: true }, now).dealt, 'nor heals');
  assert.equal(to.hp, 10);
  assert.equal(
    refereeCast(by, to, { from: near, at: there, d: 40, heal: true }, now + 1000).dealt,
    -SIEGE_MAGICKA.regenPerS,
    'a second refills regenPerS points, and that much heals',
  );
});

test("the field's ground cannot be walked away by one side climbing together", () => {
  const b = {};
  assert.equal(anchoredGround(b, null), null);
  assert.equal(anchoredGround(b, 0), 0, 'the first ground judged is the anchor');
  assert.equal(anchoredGround(b, 2 * M), 2 * M, 'a little drift is honest');
  assert.equal(anchoredGround(b, 40 * M), SIEGE_GROUND_DRIFT_UNITS, 'a side that climbed together moves it no further');
  assert.equal(anchoredGround(b, -40 * M), -SIEGE_GROUND_DRIFT_UNITS);
});

test("a field is the witnessed one, else the two sides' agreement; two sides that never agree settle nothing by count", () => {
  const row = (side, field, at) => ({ side, field, at });
  const forged = [row('attack', 'F', 1), row('attack', 'F', 2), row('attack', 'F', 3), row('defend', 'H', 4)];
  assert.equal(settleField(forged, true), null, 'three forging attackers outvote one honest defender: no');
  assert.equal(
    settleField([row('attack', 'F', 1), row('attack', 'F', 2)], true),
    'F',
    'a lone side, the other absent: as before',
  );
  const aged = (field, ...accounts) => accounts.map((account) => ({ field, account, at: 1 }));
  assert.equal(witnessedField([...aged('H', 'a', 'b', 'c'), ...aged('F', 'x')]), 'H', 'three aged witnesses');
  assert.equal(witnessedField([...aged('H', 'a', 'b'), ...aged('F', 'x', 'y')]), null, 'two do not');
  assert.equal(witnessedField([...aged('H', 'a', 'b', 'c'), ...aged('F', 'x', 'y', 'z')]), null, 'a dispute');
  assert.equal(witnessedField([...aged('H', 'a', 'a', 'a')]), null, 'one account three times is one witness');
});

test("a field lies in or near the seat's pixel", () => {
  const pixel = [320, 180];
  const x0 = pixel[0] * PIXEL_UNITS,
    z0 = (499 - pixel[1]) * PIXEL_UNITS;
  const inside = [
    [x0 + 100, z0 + 100],
    [x0 + 20000, z0 + 20000],
  ];
  assert.equal(fieldInPixel(inside, pixel), true);
  assert.equal(fieldInPixel([...inside, [x0 + 5 * PIXEL_UNITS, z0]], pixel), false, 'a point five pixels away');
  assert.equal(fieldInPixel([...inside, [x0, z0 - 3 * PIXEL_UNITS]], pixel), false);
  assert.equal(fieldInPixel(null, pixel), false);
});

test("a field keeps the offsets an honest town has: camps off the banners, the defenders' camp by the Throne", () => {
  const honest = [
    [0, 100],
    [30, 50],
    [-30, 50],
    [0, 0],
    [0, 120],
    [0, 10.5],
  ].map(([x, z]) => [x * M, z * M]);
  assert.equal(fieldShapeOk(honest, 'palace'), true);
  const move = (i, p) => honest.map((q, j) => (j === i ? [p[0] * M, p[1] * M] : q));
  assert.equal(fieldShapeOk(move(4, [0, 101]), 'palace'), false, "the attackers' camp on the Gate banner");
  assert.equal(fieldShapeOk(move(5, [0, 80]), 'palace'), false, "the defenders' camp far from the Throne");
  assert.equal(fieldShapeOk(move(1, [0, 120]), 'palace'), false, "a banner in the attackers' camp");
  assert.equal(fieldShapeOk(honest, 'crown'), false, "a palace's six points are not a crown's seven");
  const crown = [...honest.slice(0, 3), [0, 18.5 * M], ...honest.slice(3)];
  assert.equal(fieldShapeOk(crown, 'crown'), true, "a crown's Palace square 18.5 m from the Throne");
});
