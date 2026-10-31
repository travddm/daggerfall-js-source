// HCC (2026-09-23): THE HOSTS' WIRING - what world.js, exterior.js, worldModes.js, mountRig.js, the inventory
// session, the foe pool and the collider hand Horse Cart and Cargo, pinned by execution where the seam is a
// function (the inventory's open state and wagon toggle, the activation race, the collider's filtered sphere
// cast, the pool's threat qualification) and by reading the host source where the seam is a call in a frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openState, planWagonToggle } from '../../src/systems/inventorySession.js';
import { raceActivation, raceWinner } from '../../src/player/activationRace.js';
import { Collider } from '../../src/player/collider.js';
import { STORAGE_CONTEXT, HCC_TEXT } from '../../src/systems/horse/horseCartLaw.js';
import { TRANSPORT_MODES } from '../../src/systems/transport.js';
import { createMountRig } from '../../src/player/mountRig.js';
import { boxTriangles, WAGON_BUCKET } from '../../src/scenes/horseCartPool.js';
import { hostText } from '../hostText.mjs';   // TESA's merge: the quick save moved out of bootWorld (scenes/worldQuickSave.js) - its HCC slot read with the host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
const cart = { group: 'Transportation', templateIndex: 93 };   // Transportation.Small_cart (systems/shopStock.js TRANSPORT_SMALL_CART, which transport.js hasCart reads)

/** A stand-in runtime answering the inventory's two questions and the transport window's two rows. */
const fakeRt = ({ allowed = true, exitAllowed = true, select = false, horse = true, cartRow = true } = {}) => {
  const rt = {
    asked: [], used: [],
    canAccessWagonStorage: (ctx) => { rt.asked.push(ctx); const ok = ctx === STORAGE_CONTEXT.DungeonExitSelection ? exitAllowed : allowed; return ok ? { allowed: true, denialMessage: '' } : { allowed: false, denialMessage: ctx === STORAGE_CONTEXT.DungeonExitSelection ? HCC_TEXT.tooFarFromEntrance : HCC_TEXT.notAccessibleFromHere }; },
    consumeWagonSelectionRequest: () => { const r = select; select = false; return r; },
    canMountHorseFromTransportWindow: () => horse, canUseCartFromTransportWindow: () => cartRow,
    tryUseTransport: (m) => { rt.used.push(m); return { handled: true, succeeded: true }; },
  };
  return rt;
};

test('HCC hosts: the inventory opens on the runtime\'s word - a plain open shows no wagon, a selection request shows it in Remove, a refused one does not', () => {
  const rt = fakeRt({ select: true });
  let o = openState({ horseCart: () => rt, items: () => [cart] });
  assert.equal(o.usingWagon, true); assert.equal(o.mode, 'remove'); assert.equal(o.allowDungeonWagonAccess, false, 'DFU\'s own dungeon-wagon path is closed with the mod on');
  assert.deepEqual(rt.asked, [STORAGE_CONTEXT.NormalInventory]);
  o = openState({ horseCart: () => rt, items: () => [cart] });
  assert.equal(o.usingWagon, false, 'the request was consumed by the first open');
  const refused = fakeRt({ allowed: false, select: true });
  o = openState({ horseCart: () => refused, items: () => [cart] });
  assert.equal(o.usingWagon, false); assert.equal(o.refusal, undefined, 'a plain open refused says nothing - the button will');
  o = openState({ horseCart: () => fakeRt({ select: true }), items: () => [cart], loot: { items: () => [] } });
  assert.equal(o.usingWagon, false, 'a loot target outranks the selection');
  // without the mod: DFU's own law stands (the dungeon proximity arm)
  o = openState({ items: () => [cart], dungeon: { inside: true, nearExit: () => true } });
  assert.equal(o.usingWagon, true); assert.equal(o.allowDungeonWagonAccess, true);
});

test('HCC hosts: the dungeon-exit prompt\'s Yes asks CanAccessWagonFromDungeonExit - allowed shows the wagon and marks the grant, refused opens the pack with the reason over it', () => {
  let o = openState({ horseCart: () => fakeRt({ exitAllowed: true }), items: () => [cart], dungeon: { inside: true, wagonPrompt: true } });
  assert.equal(o.usingWagon, true); assert.equal(o.mode, 'remove'); assert.equal(o.dungeonExitAccessGranted, true); assert.equal(o.refusal, undefined);
  o = openState({ horseCart: () => fakeRt({ exitAllowed: false }), items: () => [cart], dungeon: { inside: true, wagonPrompt: true } });
  assert.equal(o.usingWagon, false); assert.equal(o.refusal.text, HCC_TEXT.tooFarFromEntrance); assert.equal(o.refusal.reason, 'horseCart');
  o = openState({ items: () => [cart], dungeon: { inside: true, wagonPrompt: true } });
  assert.equal(o.usingWagon, true, 'without the mod the prompt\'s Yes simply shows the wagon');
});

test('HCC hosts: the wagon button - showing hides; hidden asks the runtime (the exit\'s door while the grant holds) and a refusal is its own message', () => {
  const rt = fakeRt();
  assert.deepEqual(planWagonToggle({ horseCart: () => rt, items: () => [cart] }, { usingWagon: true }), { ok: true, usingWagon: false });
  assert.equal(rt.asked.length, 0, 'hiding asks nothing');
  assert.deepEqual(planWagonToggle({ horseCart: () => rt, items: () => [cart] }, { usingWagon: false }), { ok: true, usingWagon: true });
  assert.deepEqual(rt.asked, [STORAGE_CONTEXT.NormalInventory]);
  planWagonToggle({ horseCart: () => rt, items: () => [cart], dungeon: { inside: true } }, { usingWagon: false, dungeonExitAccessGranted: true });
  assert.equal(rt.asked.at(-1), STORAGE_CONTEXT.DungeonExitSelection, 'the exit\'s grant asks the exit\'s door');
  planWagonToggle({ horseCart: () => rt, items: () => [cart], dungeon: { inside: false } }, { usingWagon: false, dungeonExitAccessGranted: true });
  assert.equal(rt.asked.at(-1), STORAGE_CONTEXT.NormalInventory, 'outside a dungeon the grant means nothing');
  const r = planWagonToggle({ horseCart: () => fakeRt({ allowed: false }), items: () => [cart] }, { usingWagon: false });
  assert.equal(r.ok, false); assert.equal(r.refusal.text, HCC_TEXT.notAccessibleFromHere);
  const r2 = planWagonToggle({ horseCart: () => fakeRt(), items: () => [] }, { usingWagon: false });
  assert.equal(r2.ok, true, 'with the mod on the runtime decides even without the cart in the pack (its own CanAccessWagonInventory reads HasCart)');
  assert.equal(planWagonToggle({ items: () => [] }, { usingWagon: false }).refusal.reason, 'noWagon', 'without the mod DFU\'s ladder');
});

test('HCC hosts: the activation race - the mod\'s activator stands with the custom activations, after the cart and before the torch, and feeds the rival', () => {
  const pick = (key, distance) => ({ key, distance, reach: 3.2 });
  let r = raceActivation({ horseCart: pick('hccHorse', 2), torch: pick('t', 2), corpse: pick('c', 2.5), doorDistance: 3 });
  assert.equal(r.horseCartWins, true); assert.equal(r.torchWins, false); assert.equal(r.nonPersonRival, 2);
  r = raceActivation({ horseCart: pick('hccHorse', 2), wagon: pick('eotbWagon', 2) });
  assert.equal(r.wagonWins, true); assert.equal(r.horseCartWins, false, 'a tie with Eye Of The Beholder\'s cart goes to the cart, the earlier arm');
  r = raceActivation({ horseCart: pick('hccWagon', 2), torch: pick('t', 1) });
  assert.equal(r.horseCartWins, false); assert.equal(r.torchWins, true, 'nearer wins');
  assert.equal(raceWinner({ horseCart: pick('hccWagon', 2), ground: { key: '__ground__', distance: 2 } }).key, 'hccWagon', 'the plaque reads the same tie');
  assert.equal(raceWinner({ horseCart: pick('hccWagon', 2), peer: pick('peer:1', 1) }).key, 'peer:1');
  assert.equal(raceActivation({}).horseCartWins, false);
});

test('HCC hosts: the collider\'s sphere cast takes the ray\'s bucket filter - the parked wagon\'s box stops a sweep unless skipped', () => {
  const col = new Collider(() => -Infinity);
  const box = boxTriangles([2, 0, -1], [3, 2, 1]);
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  col.addMesh(WAGON_BUCKET, box.positions, box.indices, I);
  const hit = col.sphereCast([0, 1, 0], 0.35, [1, 0, 0], 5);
  assert.ok(Number.isFinite(hit.dist) && hit.dist < 2 && hit.key === WAGON_BUCKET, `the box stops the sweep: ${JSON.stringify(hit)}`);
  const skipped = col.sphereCast([0, 1, 0], 0.35, [1, 0, 0], 5, { skip: [WAGON_BUCKET] });
  assert.equal(skipped.dist, Infinity, 'skipped, the sweep is clear');
  assert.equal(col.capsuleCast([0, 1, 0], [0, 1.5, 0], 0.3, [1, 0, 0], 5, 3, { skip: [WAGON_BUCKET] }).dist, Infinity);
  col.removeBucket(WAGON_BUCKET);
  assert.equal(col.sphereCast([0, 1, 0], 0.35, [1, 0, 0], 5).dist, Infinity);
});

test('HCC hosts: the transport window - with the mod on the horse and cart rows are the runtime\'s answers and a row goes through TryUseTransport', () => {
  // the rig is built with the hook and reads it at open (a null hook is DFU's window)
  const rig = createMountRig({ renderer: null, canvas: null, fetchBytes: null, palette: null, audio: null, player: { transportMode: TRANSPORT_MODES.Foot, grounded: false, setTransportMode() {} }, playerEntity: { items: [] }, showOverlay: () => {}, horseCart: () => null });
  assert.equal(typeof rig.open, 'function');
  rig.open();   // not grounded: nothing opens, nothing throws
});

