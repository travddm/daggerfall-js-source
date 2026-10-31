// PVPDUNGEONS (2026-10-08, the owner: "THOSE HAVE TO WORK!"): the zone's halls as the relay keeps them - the day by the
// relay's clock, an account's hour lock (lifted while its own remains lie in the hall), the empty hall's reset (its world
// room wiped), the crows told to everyone online, and no party member taking a fallen friend's remains.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  SOCIAL_ROOM, PIXEL_UNITS, worldRoom, parseClient, validWdunIn, validWdunOut, wdunHall, wdunRoomKey, isWorldRoom,
  WDUN_LOCK_MS, WDUN_RESET_MS, WDUN_STALE_MS, WDUN_DAY_MS, relaySupportsWdun, RELAY_VERSION, WILD_REMAINS_MS,
} from '../../src/net/wire.js';
import * as L from '../../src/net/wild/wildLaw.js';
import { mintRemainsOrder, remainsDigest } from '../../src/net/identityToken.js';
import { fakeRooms } from '../fakeRoom.mjs';

test('PVPDUNGEONS wire: a hall is a pixel, its room a world room of its own lane; the words in and out are bounded', () => {
  assert.equal(wdunHall('512,88'), '512,88');
  // PIN MOVED (WW-C2, bible/03-World/World-Wide.md WW-C): a hall is a WORLD map pixel's - Cyrodiil's past the Bay; past the
  // world's grid none
  assert.equal(wdunHall('1000,1'), '1000,1');
  assert.equal(wdunHall('2400,900'), '2400,900');
  assert.equal(wdunHall('-5,500'), '-5,500');
  assert.equal(wdunHall('8192,1'), null);
  assert.equal(wdunHall('1,-8192'), null);
  assert.equal(wdunHall('a,b'), null);
  assert.ok(isWorldRoom(wdunRoomKey('512,88')), 'the hall\'s room is a world room the relay admits');
  assert.ok(isWorldRoom(wdunRoomKey('2400,900')), 'and Cyrodiil\'s');
  assert.notEqual(wdunRoomKey('512,88'), wdunRoomKey('513,88'));
  assert.notEqual(wdunRoomKey('2400,900'), wdunRoomKey('2400,901'));
  assert.deepEqual(validWdunIn({ k: 'in', h: '3,4' }), { k: 'in', h: '3,4' });
  assert.equal(validWdunIn({ k: 'in' }), null);
  assert.equal(validWdunIn({ k: 'boom', h: '3,4' }), null);
  assert.deepEqual(parseClient(JSON.stringify({ t: 'wdun', k: 'hi' }), { hasHello: true }), { t: 'wdun', k: 'hi' });
  assert.equal(parseClient(JSON.stringify({ t: 'wdun', k: 'hi' })).error, 'wdun before hello');
  assert.equal(validWdunOut({ t: 'wdun', k: 'st', day: -1 }), null);
  assert.deepEqual(validWdunOut({ t: 'wdun', k: 'cr', crows: [['1,2', 5], ['bad', 3]] }), { k: 'cr', crows: [['1,2', 5]] });
  assert.ok(relaySupportsWdun(RELAY_VERSION));
  assert.ok(!relaySupportsWdun('world175'));
});

test('PVPDUNGEONS law: a lock an hour, the way back while my remains lie there, the reset after twenty empty minutes, the crows', () => {
  const st = L.wdunEmpty(), t = 1e12;
  assert.equal(L.wdunEnter(st, 'A', '5,5', t).ok, true);
  L.wdunLeave(st, 'A', '5,5', t + 1000);
  const no = L.wdunEnter(st, 'A', '5,5', t + 2000);
  assert.equal(no.ok, false);
  assert.equal(no.left, WDUN_LOCK_MS - 1000);
  assert.equal(L.wdunEnter(st, 'A', '5,5', t + 1000 + WDUN_LOCK_MS).ok, true, 'an hour on, open again');
  L.wdunDie(st, 'B', '6,6', t, t + WILD_REMAINS_MS);
  assert.deepEqual(L.wdunCrows(st, t + 1), [['6,6', WILD_REMAINS_MS - 1]]);
  assert.equal(L.wdunEnter(st, 'B', '6,6', t + 60_000).ok, true, 'my remains there: my way back');
  L.wdunLeave(st, 'B', '6,6', t + 120_000);
  L.wdunGone(st, 'B', t + 130_000);
  assert.equal(L.wdunEnter(st, 'B', '6,6', t + 140_000).ok, false, 'remains gone: locked out');
  assert.deepEqual(L.wdunCrows(st, t + 140_000), [], 'and the crows go with them');
  const r = L.wdunEnter(st, 'C', '6,6', t + 120_000 + WDUN_RESET_MS);
  assert.deepEqual([r.ok, r.reset], [true, true], 'empty twenty minutes: reset');
  L.wdunEnter(st, 'D', '6,6', t + 120_000 + WDUN_RESET_MS + 5);
  assert.equal(L.wdunEnter(st, 'E', '6,6', t + 120_000 + WDUN_RESET_MS + 9).reset, false, 'never while someone is in it');
  const s2 = L.wdunEmpty();
  L.wdunEnter(s2, 'Z', '1,1', t);
  L.wdunPrune(s2, t + WDUN_STALE_MS + 1);
  assert.equal(s2.inside['1,1'], undefined, 'a silent occupant lapses');
  assert.equal(s2.empty['1,1'], t, 'and the hall counts empty from their last word');
});

const PX = 400, PY = 120, CELL = worldRoom(PX, PY);
const ON = { x: PX * PIXEL_UNITS + 16384, y: 0, z: (499 - PY) * PIXEL_UNITS + 16384, yaw: 0, pitch: 0 };
const item = (n) => ({ templateIndex: 100 + n, group: 'Armor', stackCount: 1 });

