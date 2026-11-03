// MWNPC10b: THE
// SHIPS' CREWS IN THEIR MORROWIND BODIES. A crew keeps no entity, so a class one is dressed by its
// class (characters/foeBodies.js rosterLook: a race and face off its seed, a foe's clothes in their dyes, steel for the
// knight, the warrior, the spellsword and the watch - the watch helmed) and a creature one is its creature; the driver
// offers its shown sprites on a lane of its own (navalCrew.js) before the world's passes draw them.
// Pinned on the real drivers (their own tests' stand-ins) over recording lanes, and the world's draw points by source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { readFileSync } from 'node:fs';
import { rosterLook } from '../../src/characters/foeBodies.js';
import { MOBILE_TYPES as M } from '../../src/characters/mobile/mobileTypes.js';
import { EQUIP_SLOTS } from '../../src/systems/equip.js';
import { ARMOR_ENUM } from '../../src/combat/enemyEquipment.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 0));
function recordingLane() {
  const L = { offered: [], destroyed: 0, offsets: [], veiled: 0 };
  Object.assign(L, {
    begin() { L.offered.length = 0; },
    stand(lane, actor, conceal) { L.offered.push({ lane, id: actor.id, look: actor.look, dead: actor.dead, scale: actor.scale, swings: actor.swings, hits: actor.hits, moving: actor.moving, feet: actor.feet, conceal }); },
    end() {}, has() { return false; }, draw() {}, drawVeiled() { L.veiled++; }, destroy() { L.destroyed++; }, offsetAll(o) { L.offsets.push(o); },
  });
  return L;
}

test('MWNPC10b-1 rosterLook: a class one dressed by its class off its seed - steel for the knight, the warrior, the spellsword and the watch (helmed), a foe\'s clothes in their dyes for the rest; a creature one its creature, none where there is no match; kept while it is the same one', () => {
  const plate = (l) => l.items.filter((it) => it.group === 'Armor').map((it) => it.templateIndex).sort((a, b) => a - b);
  const steel = [ARMOR_ENUM.Cuirass, ARMOR_ENUM.Greaves, ARMOR_ENUM.Boots, ARMOR_ENUM.Left_Pauldron, ARMOR_ENUM.Right_Pauldron, ARMOR_ENUM.Gauntlets].sort((a, b) => a - b);
  for (const t of [M.Knight, M.Warrior, M.Spellsword]) assert.deepEqual(plate(rosterLook({}, { mobileType: t, seed: 4 })), steel, `${t}: in steel`);
  const watch = rosterLook({}, { mobileType: M.Knight_CityWatch, seed: 4 });
  assert.deepEqual(plate(watch), [...steel, ARMOR_ENUM.Helm].sort((a, b) => a - b), 'the watch helmed');
  assert.ok(watch.items.filter((it) => it.group === 'Armor').every((it) => it.material === ARMOR_MATERIAL.Steel));
  assert.equal(watch.items.filter((it) => it.equipSlot === EQUIP_SLOTS.Feet).length, 1, 'his boots, no shoes beside');
  const rogue = rosterLook({}, { mobileType: M.Rogue, gender: 'female', seed: 9 });
  assert.equal(plate(rogue).length, 0, 'a rogue in her clothes');
  assert.equal(rogue.gender, 'female');
  const clothes = rogue.items.filter((it) => it.group !== 'Weapons');
  assert.deepEqual(clothes.map((it) => it.equipSlot), [EQUIP_SLOTS.ChestClothes, EQUIP_SLOTS.LegsClothes, EQUIP_SLOTS.Feet]);
  assert.ok(clothes.every((it) => it.group === 'WomensClothing'));
  const races = new Set(Array.from({ length: 40 }, (_, s) => rosterLook({}, { mobileType: M.Thief, seed: s }).race));
  assert.ok(races.size >= 4, `the Bay's mix off the seed (${[...races]})`);
  assert.deepEqual(rosterLook({}, { mobileType: M.Thief, seed: 7 }), rosterLook({}, { mobileType: M.Thief, seed: 7 }), 'the same one the same look on every machine');
  assert.deepEqual(rosterLook({}, { mobileType: M.Rat }), { creature: ['rat'] }, 'a creature hand its creature');
  assert.equal(rosterLook({}, { mobileType: M.GiantBat }), null, 'none for one with no match');
  const rec = {};
  const l = rosterLook(rec, { mobileType: M.Bard, seed: 3 });
  assert.equal(rosterLook(rec, { mobileType: M.Bard, seed: 3 }), l, 'kept: one build');
  assert.notEqual(rosterLook(rec, { mobileType: M.Bard, gender: 'female', seed: 3 }), l, 'another one: another look');
});

test('MWNPC10b-3 the crews: each hand on her deck offered his class\'s look off her seed and his place, at his sprite\'s feet and his world facing, concealed with her owner; each swing at his work a blow; the hands below and the gone none; cleared, the lane let go', async () => {
  const { readyPool } = await import('../navalSea.mjs');
  const { ctxFor } = await import('../csaScene.mjs');
  const { Boat, spawnBoat } = await import('../../src/systems/comeSailAway/comeSailAwayBoat.js');
  const { createNavalCrew } = await import('../../src/scenes/naval/navalCrew.js');
  const { crewRoster } = await import('../../src/systems/naval/crewLife.js');
  const { classById } = await import('../../src/systems/naval/navalShips.js');
  const pool = await readyPool();
  const deck = pool.deckOf(2, 0);
  const boat = new Boat(2, 0); spawnBoat(boat, ctxFor({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }));
  const renderer = { createBillboardBatch: (archive) => ({ archive }), destroyBillboardBatch: () => {}, textures: new Map() };
  const tex = { getFrameCount: () => 4, getSize: () => ({ width: 40, height: 80 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 20 };
  let lane = null;
  const crew = createNavalCrew({ renderer, getTexture: async () => tex, uploadRecordFrame: () => {}, rand: () => 0.3, wantBodies: () => true, makeBodies: () => (lane = recordingLane()) });
  const pirate = classById('pirateBrig');
  crew.sync([{ key: 'ship:1', boat, deck, count: 6, rosterOf: () => crewRoster({ hull: 2, seed: 3, shipClass: pirate }), seed: 3, faction: 'pirate', battle: false }]);
  await settle();
  boat.conceal = { mode: 1, alpha: 0.4 };
  crew.frame(0.05, [0, 10, 0]);
  crew.drawBodies({}, null, null, [0, 10, 0], 1 / 60);
  const ship = crew.ships()[0];
  const standing = [...ship.sprites].filter(([m, s]) => s?.batch && s.unit && !m.below);
  const order = [...ship.sprites.keys()];
  const wm = boat.MeshObject.worldMatrix();
  assert.equal(lane.offered.length, standing.length, 'every hand on her deck');
  assert.ok(lane.offered.length >= 1);
  for (const o of lane.offered) {
    const [m, s] = standing.find(([, sp]) => sp.id === o.id);
    assert.equal(o.feet, s.origin, 'at his sprite\'s feet');
    const fw = [Math.sin(m.yaw), Math.cos(m.yaw)];
    assert.ok(Math.abs(s.yaw - Math.atan2(wm[0] * fw[0] + wm[8] * fw[1], wm[2] * fw[0] + wm[10] * fw[1])) < 1e-9, 'his facing out of her frame');
    assert.equal(o.conceal, boat.conceal, 'concealed with her owner');
    const i = order.indexOf(m) + 1;
    assert.deepEqual(o.look, rosterLook({}, { mobileType: m.mobile, gender: m.gender, seed: Math.imul(3 + i, 0x9e3779b1) >>> 0 }), 'his class\'s look off her seed and his place');
  }
  // a swing at his work - crewLife's one-step pulse (SHIP-WATCH): one blow each
  const [m0, s0] = standing[0];
  const step = ship.life.step;
  let pulses = [true, false, true];
  ship.life.step = (dt, ctx) => { step(dt, ctx); m0.swing = pulses.shift() ?? false; };
  crew.frame(0.05, [0, 10, 0]); crew.frame(0.05, [0, 10, 0]);
  crew.drawBodies({}, null, null, [0, 10, 0], 1 / 60);
  assert.equal(lane.offered.find((o) => o.id === s0.id).swings, 1, 'a pulse, one swing');
  crew.frame(0.05, [0, 10, 0]);
  crew.drawBodies({}, null, null, [0, 10, 0], 1 / 60);
  assert.equal(lane.offered.find((o) => o.id === s0.id).swings, 2, 'the next pulse, the next');
  void pulses;
  // a hand turned in below her deck: kept, not offered
  standing[1][0].below = true;
  crew.drawBodies({}, null, null, [0, 10, 0], 1 / 60);
  assert.ok(!lane.offered.some((o) => o.id === standing[1][1].id), 'below her deck: no body');
  crew.drawVeiledBodies();
  assert.equal(lane.veiled, 1);
  crew.clear();
  assert.equal(lane.destroyed, 1, 'cleared, the lane let go');
});

