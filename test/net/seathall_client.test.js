// SEAT-HALL: THE CHARTER ROOM IN THE CLIENT -
// the law's words and numbers (src/net/townSeatLaw.js), the decorator's rule in the palace (src/scenes/decor/decorTool.js
// charterWhyNot: the largest room, two metres from the court; a room's own cap), the account door's `seat`
// (src/net/accountClient.js accountDecor) and the hosts' seams (src/scenes/worldModes.js interiorSeatHall, world.js
// seatHall). 7.2; `06-Systems/Online-Arc.md` SEAT-HALL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Collider } from '../../src/player/collider.js';
import { toolRig, settle, all } from '../decorFakes.mjs';
import { SEAT_HALL_DECOR_CAP, SEAT_HALL_CLEAR_M, SEAT_HALL_TEXT, seatHallOf } from '../../src/net/townSeatLaw.js';
import { accountDecor, SESSION_KEY } from '../../src/net/accountClient.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const addQuad = (c, key, a, b, cc, d) => c.addMesh(key, new Float32Array([...a, ...b, ...cc, ...d]), new Uint32Array([0, 1, 2, 0, 2, 3]), IDENTITY);
/** The rig's building (origin 10, 0, 10; the eye at 10, 1.6, 10): a palace x 4 to 24, z 5 to 15, 3 high, a shut door in
 *  the wall at x = 18 - the eye in its west room, the larger (14 m across to the east room's 6). */
function palace() {
  const c = new Collider();
  addQuad(c, 'floor', [4, 0, 5], [24, 0, 5], [24, 0, 15], [4, 0, 15]);
  addQuad(c, 'ceiling', [4, 3, 5], [24, 3, 5], [24, 3, 15], [4, 3, 15]);
  addQuad(c, 'w1', [4, 0, 5], [4, 3, 5], [4, 3, 15], [4, 0, 15]);
  addQuad(c, 'w2', [24, 0, 5], [24, 3, 5], [24, 3, 15], [24, 0, 15]);
  addQuad(c, 'w3', [4, 0, 5], [24, 0, 5], [24, 3, 5], [4, 3, 5]);
  addQuad(c, 'w4', [4, 0, 15], [24, 0, 15], [24, 3, 15], [4, 3, 15]);
  addQuad(c, 'inner1', [18, 0, 5], [18, 3, 5], [18, 3, 9], [18, 0, 9]);
  addQuad(c, 'inner2', [18, 0, 11], [18, 3, 11], [18, 3, 15], [18, 0, 15]);
  addQuad(c, 'lintel', [18, 2.2, 9], [18, 3, 9], [18, 3, 11], [18, 2.2, 11]);
  addQuad(c, 'door', [18, 0, 9], [18, 2.2, 9], [18, 2.2, 11], [18, 0, 11]);
  return c;
}
const CHARTER = { kind: 'home', hall: true, seat: true, charter: true, cap: SEAT_HALL_DECOR_CAP, where: SEAT_HALL_TEXT.where, mapId: 3021, buildingKey: 512 };
const panelOf = (rig) => rig.doc.body.children.find((c) => c.className === 'dfdecor');
const fakeDecorDoor = (writes) => ({
  place: async (a) => { writes.push(['place', a]); return { ok: true, piece: a.piece }; },
  move: async (a) => { writes.push(['move', a]); return { ok: true }; },
  remove: async (a) => { writes.push(['remove', a]); return { ok: true }; },
});

test('SEAT-HALL the law: a hundred pieces, two metres, the Charter Room\'s words; a palace is the hall of the guild holding it and of no other (mutants: the cap; the clearance; the holder unasked)', () => {
  assert.equal(SEAT_HALL_DECOR_CAP, 100, '7.2: "at most 100 pieces"');
  assert.equal(SEAT_HALL_CLEAR_M, 2, '7.2: "within 2 m of any NPC or quest marker"');
  assert.equal(SEAT_HALL_TEXT.where, 'The Charter Room');
  const seat = { tier: 'palace', holder: { guild: { id: 'g1', name: 'The Silver Hand' } } };
  assert.equal(seatHallOf(seat, 'g1'), true);
  assert.equal(seatHallOf(seat, 'g2'), false, 'another guild\'s');
  assert.equal(seatHallOf(seat, null), false, 'no guild');
  assert.equal(seatHallOf({ tier: 'palace', holder: null }, 'g1'), false, 'unheld');
  assert.equal(seatHallOf(null, 'g1'), false);
});

test('SEAT-HALL the decorator in the Charter Room (7.2): a piece in a smaller room is refused in the room\'s words; in the largest, the court\'s two metres are the host\'s to say; clear, it is placed through the door (mutants: the largest room unasked; the court unasked; the commit past the rule)', async () => {
  const writes = [];
  let court = null;
  const rig = toolRig({ collider: palace(), gold: 50_000, room: CHARTER, homeDecor: fakeDecorDoor(writes), charterClear: () => court });
  rig.frame();
  assert.equal(rig.tool.openPanel(), true);
  for (let i = 0; i < 12; i++) { rig.frame({ overlayUp: true }); await settle(); }
  const tabs = all(panelOf(rig), 'dfdecor-room');
  assert.equal(tabs.length, 2, 'two rooms found');
  const pressed = () => all(panelOf(rig), 'dfdecor-room').find((t) => t.attrs['aria-pressed'] === 'true');
  const west = pressed();
  const east = tabs.find((t) => t !== west);
  const placeIn = async (tab) => {
    tab.fire('click');
    rig.frame({ overlayUp: true });
    all(panelOf(rig), 'dfdecor-row').find((r) => r.dataset.key === 'm41000').fire('click');
    all(panelOf(rig), 'dfdecor-btn').find((b) => b.textContent === 'Place').fire('click');
    rig.frame(); await settle(); rig.frame();
  };
  await placeIn(east);
  assert.ok(rig.tool.ghost(), 'the ghost stands');
  assert.equal(rig.tool.why(), SEAT_HALL_TEXT.room, 'the smaller room refused');
  assert.equal(await rig.tool.commit(), false);
  assert.equal(writes.length, 0, 'nothing sent');
  rig.tool.back();
  for (let i = 0; i < 2; i++) { rig.frame({ overlayUp: true }); await settle(); }
  await placeIn(west);
  court = SEAT_HALL_TEXT.clear;
  assert.equal(rig.tool.why(), SEAT_HALL_TEXT.clear, 'too near the court');
  assert.equal(await rig.tool.commit(), false);
  court = null;
  assert.equal(rig.tool.why(), null, 'the largest room, clear of the court');
  assert.equal(await rig.tool.commit(), true);
  assert.equal(writes.length, 1);
  assert.deepEqual([writes[0][1].mapId, writes[0][1].buildingKey], [3021, 512]);
});

test('SEAT-HALL the account door: `seat` rides a list, a placement, a move and a removal named for the Charter Room, and no other (mutants: each dropped)', async () => {
  const posts = [];
  const session = new Map([[SESSION_KEY, JSON.stringify({ secret: 'sek', id: 'p' })]]);
  const door = accountDecor({ fetch: async (u, i) => { posts.push([new URL(u).pathname, JSON.parse(i.body)]); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }, storage: { getItem: (k) => session.get(k) ?? null }, listWaitMs: 50 });
  const at = { mapId: 3021, buildingKey: 512, character: 'c1' };
  await door.list(3021, 512, true);
  await door.place({ ...at, piece: { id: 'a' }, seat: true });
  await door.move({ ...at, id: 'a', place: {}, seat: true });
  await door.remove({ ...at, id: 'a', seat: true });
  assert.deepEqual(posts.map(([p, b]) => [p, b.seat]), [['/v1/homes/decor', true], ['/v1/homes/decor/place', true], ['/v1/homes/decor/move', true], ['/v1/homes/decor/remove', true]]);
  posts.length = 0;
  await door.list(7, 300);
  await door.place({ ...at, piece: { id: 'a' } });
  assert.ok(posts.every(([, b]) => !('seat' in b)), 'a home\'s writes as ever');
});

