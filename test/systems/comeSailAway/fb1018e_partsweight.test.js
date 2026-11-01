// PARTS-WEIGHT (FIELD BUGS 2026-10-18e,; the report: "large galley ship is
// too damn heavy to even move outta storage into inventory after stripping all carry weight items"). A packed boat's parts
// carried her hold's weight (Come Sail Away's PackBoat sum, and the hold door's weighing as its window shut), and since
// CARGO-ANYWHERE a packed ship's hold opens from anywhere with no gate on a stow - so the parts grew past what the
// bearer could lift. Set down in a chest, nothing found them to weigh again (the door asks the pack alone), and every
// take (DFU's CanCarryAmount, systems/item/itemTransfer.js planTake) refused them for good. Now her parts weigh her
// timbers alone (comeSailAwayHulls.js packedHullWeight), her hold kept under her number as before.
// Come Sail Away's real runtime over test/csaScene.mjs, the real hold door and the real take.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scene, terrain } from '../../csaScene.mjs';
import { HULL_PRICES, PACKED_WEIGHT_MAX } from '../../../src/systems/comeSailAway/comeSailAwayBoat.js';
import { mintDeed, mintBoatItem, BOAT_PARTS_TEMPLATE } from '../../../src/systems/comeSailAway/comeSailAwayItems.js';
import { createHoldDoor } from '../../../src/scenes/holdDoor.js';
import { planTake } from '../../../src/systems/item/itemTransfer.js';
import { maxEncumbrance } from '../../../src/combat/formulas.js';

const AT = [1000, 34, 50], DIR = [0, 0, 1];
/** A bearer of strength 80: 120 kg at most (maxEncumbrance), a packed ship's timbers exactly. */
const STRENGTH = 80;
const bearer = () => ({ stats: { strength: STRENGTH }, items: [], goldPieces: 0 });

function galleyPacked() {
  const s = scene({ terrains: [terrain(10, 20), terrain(11, 20)] });
  const pack = [];
  let uid = 9000;
  s.deps.items = { create: (t) => mintBoatItem(t, ++uid), addToPlayer: (it) => pack.push(it), player: () => pack };
  s.deps.cargoWeight = (items) => items.reduce((a, it) => a + (it.weightInKg ?? 0), 0);
  s.deps.entity.maxEncumbrance = () => maxEncumbrance(STRENGTH);
  const deed = mintDeed(3, 0, 700, HULL_PRICES[3]);
  pack.push(deed);
  const b = s.rt.LaunchFromDeed(deed, () => pack, AT, DIR, s.terrains[1]);
  assert.ok(b && b.crewed && b.hull === 3, 'a Large Galley from her deed');
  b.Cargo.Items.push({ name: 'plunder', weightInKg: 330 });
  assert.equal(s.rt.PackBoat(b, true), true, 'her hold does not keep her from the pack');
  const parts = pack.find((it) => it.templateIndex === BOAT_PARTS_TEMPLATE && it.UID === 700);
  const door = createHoldDoor({
    csa: () => s.rt, aboard: () => null, cabin: () => null, ships: () => [{ uid: 700, hull: 3 }],
    partsOf: (u) => pack.find((it) => it?.templateIndex === BOAT_PARTS_TEMPLATE && it.UID === u) ?? null,
    toPack: (it) => pack.push(it), openHold: (loot) => { s.opened = loot; return true; }, nameOf: () => '', say() {},
  });
  return { s, pack, parts, door };
}

test('PARTS-WEIGHT the report: a Large Galley packed over a heavy hold weighs her timbers alone; stowed full from the hold door and set down in a chest, her parts are taken back into an emptied pack - her hold kept under her number (mutants: the hold weighed again, the gate weighs the hold)', () => {
  const { s, pack, parts, door } = galleyPacked();
  assert.equal(parts.weightInKg, PACKED_WEIGHT_MAX, 'her timbers alone');
  assert.deepEqual(s.rt.laidUpHold(700).map((it) => it.name), ['plunder'], 'her hold under her number');
  // CARGO-ANYWHERE: a ton stowed into her packed hold
  assert.equal(door.openShip(700), true);
  s.opened.items().push({ name: 'iron', weightInKg: 1000 });
  s.opened.onClose();
  assert.equal(parts.weightInKg, PACKED_WEIGHT_MAX, 'a stow weighs nothing on her parts');
  // set down in a chest, the pack emptied - the report's
  const chest = pack.splice(0, pack.length).filter((it) => it === parts);
  assert.deepEqual(chest, [parts]);
  const take = planTake(parts, { bag: pack, entity: bearer() });
  assert.equal(take.ok, true, 'the take lifts her parts out of the chest');
  assert.equal(take.amount ?? 1, 1);
});
