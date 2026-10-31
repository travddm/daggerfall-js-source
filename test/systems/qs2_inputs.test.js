// QS2 (2026-09-17, Mac: a Demon's Souls quickslot diamond on the ENHANCED
// HUD's bottom-left - main hand, off hand, and two consumables, each with a
// keybind tag): THE ACTIONS, THE ROUTE, AND THE FOUR HOSTS' DOORS.
//
// QS1 built the model (systems/quickslots.js) and nothing could reach it. This
// is the wiring, and it has four laws:
//
//   - THE ACTIONS. Three more of the port's own, APPENDED past DFU's
//     forty-four and past SOC5's row, because the classic controls window
//     indexes ACTIONS by NUMBER against fixed art. Defaulted to the number row,
//     which nothing in DFU, the port or any vendored mod spends. A bindings
//     file written before this slice gains them on the next boot.
//   - THE PANE. Every bindable action needs a row a player can rebind from, and
//     the classic window cannot draw these - so they go in the enhanced pane,
//     under their own heading rather than SOC5's 'Online'.
//   - THE ROUTE. routeAction hands each to a ctx door and passes the DOOR's
//     answer back; a host without one consumes nothing and throws nothing.
//   - THE FOUR HOSTS. AUDIT SOC B4/D1 is the lesson this slice is written
//     against: SOC5 put its door under the exterior host's MODE gate and F did
//     nothing in a tavern or a dungeon for a week. Every host that carries
//     `toggleSheath` carries these, and the two self-routing hosts answer them
//     ABOVE their mode gate.
//
// Plus the thing a source pin cannot claim: that a swap actually changes what
// the weapon rig reports as held. That one is DRIVEN, on a real rig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIONS, PORT_ACTIONS, DEFAULT_BINDINGS, parseActionName,
  createBindings, resetDefaults, setBinding, getBinding, actionForCode, loadKeyBinds, serializeKeyBinds,
} from '../../src/systems/inputActions.js';
import { routeAction, QUICKSLOT_ACTIONS, POLLED_ACTIONS } from '../../src/ui/input.js';
import { gridButtons } from '../../src/ui/controlsWindow.js';   // KB1: the classic faces, read off the windows that draw them
import { KEYBIND_ROWS } from '../../src/ui/mouseControlsWindow.js';
import { ACTION_GROUPS, HIDDEN_ACTIONS } from '../../src/systems/inputActions.js';
const GRID_ACTIONS = gridButtons().map((b) => b.action);
import { createWeaponRig } from '../../src/combat/weapon/weaponRig.js';
import { equipItem, equipTableOf, EQUIP_SLOTS } from '../../src/systems/equip.js';
import { assignQuickslot, clearQuickslots, swapQuickslot, quickslotOf } from '../../src/systems/quickslots.js';
import { USE_PENDING as USE_PENDING_SYS } from '../../src/systems/useItem.js';
import { USE_PENDING as USE_PENDING_UI } from '../../src/ui/native/nativeInventory.js';
import { setPref } from '../../src/systems/uiPrefs.js';
// HB-LYCFREE (2026-09-30): the hotbar is the quick slots' default now. This suite is the DIAMOND's, written while the
// diamond was the default, so it chooses the diamond (PIN MOVED: the environment it always ran in, now said).
setPref('quickbarStyle', 'quickbar');

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// QS6 (2026-09-17) added a fifth - 'QuickSpell' - and moved Digit3 onto it.
// 'QuickSwap' keeps its row here for the reason the header above gives: an
// action is never removed from ACTIONS, and the swap is still rebindable. What
// it lost is its DEFAULT key, which the off-hand cell that draws it now carries.
const QS = Object.freeze(['QuickUse1', 'QuickUse2', 'QuickSwap', 'QuickOffHand', 'QuickSpell']);
/** QUICK-LOOT B4: the plaque's two, appended past the quickslots for
 *  the same reason the quickslots were appended past SOC5's row - an
 *  action is never inserted, because the classic grid draws by INDEX. */
const QL = Object.freeze(['QuickLootAll', 'QuickLootOpen']);
/** The three a HOLD belongs to: a tap performs the slot, a hold cycles it, and
 *  only the frame can tell those apart - so these are polled, not dispatched. */
const HOLD = Object.freeze(['QuickUse1', 'QuickUse2', 'QuickSpell']);

// ── THE ACTIONS ──────────────────────────────────────────────────────

test('QS2: the three actions are APPENDED - past DFU\'s forty-four and past SOC5\'s row - parse, and never displace an index the classic grid draws by number (mutants: a name spliced mid-list; a name the parser answers Unknown for)', () => {
  // FREEMOUSE appended one more past the plaque's two, so the slice
  // that names "the last seven" now has an eighth row behind it. It is
  // sliced from the END of the port's rows rather than widened to
  // include a row this pin is not about.
  assert.deepEqual(ACTIONS.slice(45, 52), [...QS, ...QL], 'the seven rows QS2 and QUICK-LOOT own, in this order');
  assert.equal(ACTIONS[52], 'FreeMouse', 'and FREEMOUSE\'s appended past them');
  assert.equal(ACTIONS.length, 95, 'Decorate, unbound (PIN MOVED) + PARTY-PING\'s 1 (PartyPing - PIN MOVED) + SHOT-KINDS\' 1 (ShotCycle - PIN MOVED) + CARGO-ANYWHERE\'s 1 (ShipHold - PIN MOVED) + UI-CALM\'s 1 (SaddlePanel, last - PIN MOVED) + SPYGLASS\' 1 (Spyglass, last - PIN MOVED) + TECH1\'s 1 (WeaponTechnique) + MODE-WHEEL\'s 1 (ModeWheel) + LEGACY3\'s 1 (LegacyFamily, last) + CLASSIC-PAGES\'s 1 + DFU\'s 44 + SOC5\'s 1 + QS2\'s 3 + QS4\'s 1 + QS6\'s 1 + QUICK-LOOT\'s 2 + FREEMOUSE\'s 1 + KB1\'s 17 (Interact, QuickDial, six hotbar slots, eight mod keys, DebugOverlay) + CSA-D\'s 2 (the helm\'s two keys) + CSA-E\'s 4 (the sails\' and the trim\'s) + CSA-G\'s 3 (the time scale\'s) + TV1\'s 1 (TravelView) + PADWALK\'s WalkMode + VIEW-TOGGLE\'s TogglePerspective + PROF1\'s 1 (ActChoice, after it) + HELM-KEYS\' 2 (more and less sail, last)');
  // Every index DFU's own enum had, it still has. This is the whole reason the
  // list is appended to and never inserted into (ui/controlsWindow.js).
  assert.equal(ACTIONS[43], 'AutoRun', 'DFU\'s last row keeps index 43');
  assert.equal(ACTIONS[44], 'SocialInteract', 'and SOC5\'s keeps 44');
  assert.deepEqual([...GRID_ACTIONS], ACTIONS.slice(2, 40), 'so the classic grid\'s slice still means what it meant');
  for (const a of [...QS, ...QL]) {
    assert.equal(ACTIONS.filter((x) => x === a).length, 1, `${a} once`);
    assert.equal(parseActionName(a), a);
  }
  assert.equal(ACTIONS[47], 'QuickSwap', 'and QS2\'s swap keeps ITS index - an action is never removed, only unbound');
  assert.equal(parseActionName('QuickUse3'), 'Unknown', 'the sentinel still answers for a near miss');
});

test('QS2: the port\'s own actions YIELD in the classic windows - all four of them, because none of the four is on either classic face (mutant: the three left out of PORT_ACTIONS, so a classic player is told of a clash against a row they cannot see or clear)', () => {
  assert.deepEqual([...PORT_ACTIONS], ['SocialInteract', ...QS, ...QL, 'FreeMouse', ...ACTIONS.slice(53)]);   // FREEMOUSE: the classic windows cannot draw its row either; KB1: nor any of its seventeen
  // The claim PORT_ACTIONS makes is "not drawable by a classic window", and it
  // is derived here rather than asserted: the classic grid is ACTIONS[2..40)
  // and the ADVANCED popup is its six.
  const classicFace = new Set([...GRID_ACTIONS, ...KEYBIND_ROWS.map((r) => r.action)]);
  for (const a of PORT_ACTIONS) assert.ok(!classicFace.has(a), `${a} is on neither classic face`);
  // ...and the other way: nothing DFU's own windows DO draw yields there.
  for (const a of classicFace) assert.ok(!PORT_ACTIONS.includes(a), `${a} is drawable and must not yield`);
});

test('QS2: the defaults are the number row, spent exactly once each, and free before this slice took them (mutants: a default on a key DFU or a vendored mod already answers; two actions on one digit)', () => {
  const byCode = new Map(DEFAULT_BINDINGS.map(([c, a]) => [c, a]));
  assert.equal(byCode.get('Digit1'), 'QuickUse1');
  assert.equal(byCode.get('Digit2'), 'QuickUse2');
  // QS6: the third digit is the SPELL slot now.
  assert.equal(byCode.get('Digit3'), 'QuickSpell');
  assert.equal(byCode.get('Digit4'), 'QuickOffHand');
  const codes = DEFAULT_BINDINGS.map(([c]) => c);
  assert.equal(new Set(codes).size, codes.length, 'no key is spent twice');
  // QS6: EVERY ACTION HAS AT MOST ONE DEFAULT, and exactly one has none - the
  // swap, which gave its digit to the spell slot. It is still in ACTIONS and
  // still on the enhanced pane, so a player who wants a dedicated swap key
  // binds one; what it must not be is a second action on a spent key.
  const acts = DEFAULT_BINDINGS.map(([, a]) => a);
  assert.equal(new Set(acts).size, acts.length, 'no action is defaulted twice');
  // KB1: three more ship unbound - the two DFU rows nothing reads (HIDDEN_ACTIONS, off the pane) and the
  // developer's DebugOverlay - and the swap is still the one whose cell another key presses. TV1: and the travel
  // view's, whose door is the held map's.
  // HELM-KEYS: and More sail owns no key - it SHARES the up arrow (inputActions.js DEFAULT_SHARES); CLASSIC-PAGES: nor
  // the Professions key - it shares the down arrow
  // MODE-WHEEL: and DFU's four mode keys and Sneak - the wheel and Crouch answer for them
  // SPYGLASS (PIN MOVED): nor the captain's glass - it shares K with the road's follow; SHOT-KINDS (PIN MOVED): nor the guns' load - the helm's button and the wheel choose it
  assert.deepEqual(ACTIONS.filter((a) => !acts.includes(a)), ['ToggleConsole', 'Slide', 'StealMode', 'GrabMode', 'InfoMode', 'TalkMode', 'Sneak', 'QuickSwap', 'DebugOverlay', 'TravelView', 'WalkMode', 'BoatSailUp', 'Professions', 'Spyglass', 'ShotCycle', 'Decorate'],
    'the actions without an owned key');
  assert.equal(DEFAULT_BINDINGS.length, ACTIONS.length - 16);   // Decorate unbound; SHOT-KINDS: the guns' load unbound; PADWALK: WalkMode ships unbound too; HELM-KEYS: BoatSailUp a share; CLASSIC-PAGES: the Professions key a share; SPYGLASS: the glass a share
  // THE KEYS WERE FREE. DFU's own table is the rows above SOC5's, and none of
  // them is a digit - read off the table rather than asserted about it.
  const dfu = DEFAULT_BINDINGS.slice(0, DEFAULT_BINDINGS.findIndex(([, a]) => a === 'SocialInteract')).map(([c]) => c);   // MODE-WHEEL: DFU's rows are those before SOC5's (five ship unbound now)
  for (const d of ['Digit1', 'Digit2', 'Digit3']) assert.ok(!dfu.includes(d), `SetupDefaults never spends ${d}`);
  // The port's own spending, named where it is spent, so a rename there fails
  // here (the same shape HT4's pin uses one file over).
  assert.equal(DEFAULT_BINDINGS.find(([, a]) => a === 'QuickDial')?.[0], 'Tab', 'PX15: Tab is the pixel dial - KB1: as the QuickDial row, in this same table');
  // A live store built from the defaults answers each digit with its action.
  const s = createBindings();
  resetDefaults(s);
  assert.equal(actionForCode(s, 'Digit1'), 'QuickUse1');
  assert.equal(getBinding(s, 'QuickSpell'), 'Digit3');
  assert.equal(getBinding(s, 'QuickOffHand'), 'Digit4');
  assert.equal(getBinding(s, 'QuickSwap'), null, 'the swap ships unbound and rebindable');
});

test('QS2: a bindings blob written BEFORE this slice gains the three on the next load, and a player who had already bound a digit keeps it (mutants: the autofill stealing a bound key; the rows put in a host so an existing save never gets them)', () => {
  // The startup path is loadKeyBinds then resetDefaults(store, true) - what
  // loadOrCreateBindings does after every load.
  const old = createBindings();
  resetDefaults(old);
  const file = serializeKeyBinds(old);
  for (const d of ['Digit1', 'Digit2', 'Digit3']) delete file.actionKeyBinds[d];   // the blob as it was written before QS2
  const fresh = createBindings();
  loadKeyBinds(fresh, file);
  for (const d of ['Digit1', 'Digit2', 'Digit3']) assert.equal(actionForCode(fresh, d), null, 'the blob itself says nothing about the digits');
  resetDefaults(fresh, true);
  assert.equal(actionForCode(fresh, 'Digit1'), 'QuickUse1', 'the autofill gives an existing player the action - no reset, no lost bindings');
  assert.equal(actionForCode(fresh, 'Digit2'), 'QuickUse2');
  assert.equal(actionForCode(fresh, 'Digit3'), 'QuickSpell');
  assert.equal(actionForCode(fresh, 'Digit4'), 'QuickOffHand');
  assert.equal(getBinding(fresh, 'Rest'), 'KeyR', 'and disturbs nothing else');
  assert.equal(getBinding(fresh, 'SocialInteract'), 'KeyF', 'SOC5\'s row included');
  // ...and a player who put Rest on 1 keeps Rest on 1; QuickUse1 simply waits.
  const mine = createBindings();
  loadKeyBinds(mine, file);
  setBinding(mine, 'Digit1', 'Rest');
  resetDefaults(mine, true);
  assert.equal(actionForCode(mine, 'Digit1'), 'Rest', 'testSetBinding never steals a code the player has spent');
  assert.equal(getBinding(mine, 'QuickUse1'), null, 'so the new action waits, rebindable, rather than fighting for the key');
  assert.equal(actionForCode(mine, 'Digit2'), 'QuickUse2', 'and its siblings are unaffected');
});

// ── THE PANE ─────────────────────────────────────────────────────────

test('QS2 (re-aimed by KB1): the enhanced pane draws the quickslots under their OWN heading - with the hotbar\'s slots, which ARE those keys - and the coverage rule holds over every group (mutants: the rows dropped so the keys are unrebindable; the rows hidden under Online; a row twice)', () => {
  // QS2 gave the quickslots a heading of their own (a potion press is not an online act), QUICK-LOOT B4 the plaque
  // its own, FREEMOUSE the mouse its own. KB1 kept every one of those calls and made the groups the registry's
  // ACTION_GROUPS: the hotbar's ten slots join the quickslots, because its slots 1-4 ARE the diamond's four
  // actions (one key, one action - the meaning follows hotbarInForce).
  const g = (t) => ACTION_GROUPS.find((x) => x.title === t);
  assert.deepEqual(g('Quickslots and hotbar').rows.slice(0, 5).map((r) => r.action), ['QuickUse1', 'QuickUse2', 'QuickSpell', 'QuickOffHand', 'QuickSwap']);
  assert.match(g('Quickslots and hotbar').rows.find((r) => r.action === 'QuickSpell').label, /hold to cycle the book/, 'HOTSLOT: the hold is said');
  assert.ok(g('Interaction').rows.some((r) => r.action === 'QuickLootAll') && g('Interaction').rows.some((r) => r.action === 'QuickLootOpen'),
    'looting sits with the other things you do to what is in front of you');
  assert.ok(!g('Online').rows.some((r) => QS.includes(r.action) || QL.includes(r.action)), 'not under Online - a potion press is not an online act');
  // COVERAGE: every bindable action has exactly one row across every group; the hidden two have none.
  const all = ACTION_GROUPS.flatMap((x) => x.rows.map((r) => r.action));
  assert.equal(new Set(all).size, all.length, 'none twice');
  assert.deepEqual([...all, ...HIDDEN_ACTIONS].sort(), [...ACTIONS].sort(), 'and none missing');
});

// ── THE ROUTE ────────────────────────────────────────────────────────

test('QS2: routeAction sends each action to its ctx door with the slot number, and passes the DOOR\'S answer back (mutants: the arms swapped so 1 drinks slot 2; a bare true so the key is eaten on a host with no door; the arm missing so the key is dead)', () => {
  const calls = [];
  const ctx = {
    quickUse: (n) => { calls.push(['use', n]); return true; },
    quickSwap: () => { calls.push(['swap']); return true; },
    quickOffHand: () => { calls.push(['off']); return true; },
    quickSpell: () => { calls.push(['spell']); return true; },   // QS6
  };
  assert.equal(routeAction('QuickUse1', ctx), true);
  assert.equal(routeAction('QuickUse2', ctx), true);
  assert.equal(routeAction('QuickSwap', ctx), true);
  assert.equal(routeAction('QuickOffHand', ctx), true);
  assert.equal(routeAction('QuickSpell', ctx), true);
  assert.deepEqual(calls, [['use', 1], ['use', 2], ['swap'], ['off'], ['spell']], 'each arm is its own, and the SLOT NUMBER travels');
  // The door's answer, passed through.
  assert.equal(routeAction('QuickUse1', { quickUse: () => false }), false);
  assert.equal(routeAction('QuickSwap', { quickSwap: () => false }), false);
  assert.equal(routeAction('QuickOffHand', { quickOffHand: () => false }), false);
  assert.equal(routeAction('QuickSpell', { quickSpell: () => false }), false);
  assert.equal(routeAction('QuickUse2', { quickUse: () => undefined }), false, 'a door that answers nothing is not a door that consumed');
  // A host with NO doors: false, and nothing thrown.
  for (const a of QS) assert.equal(routeAction(a, {}), false, `${a} on a bare ctx`);
  // The arms steal nothing from their neighbours.
  let sheath = 0, social = 0;
  routeAction('ReadyWeapon', { toggleSheath: () => { sheath++; } });
  routeAction('SocialInteract', { socialInteract: () => { social++; return true; } });
  assert.deepEqual([sheath, social], [1, 1]);
  // QS6 - THE POLL, not the edge, FOR THE THREE THAT HOLD. QS2 wrote the
  // opposite here and was right at the time: a held 1 must not drink one
  // potion a frame. Mac then asked for the hold to MEAN something ("hold the
  // keybind to switch between applicable spells"), and a press that acts on
  // its DOWN edge cannot also be the start of a hold - the potion is drunk
  // before the player has held long enough to mean "let me choose one". So the
  // three are polled and the frame's machine owns both edges; routeAction
  // keeps their arms for the panel, which has no poll. The two that do NOT
  // hold stay edge actions, because there the down edge is the whole press.
  for (const a of HOLD) assert.ok(POLLED_ACTIONS.has(a), `${a} holds, so the frame owns it`);
  for (const a of QS) if (!HOLD.includes(a)) assert.ok(!POLLED_ACTIONS.has(a), `${a} does not hold, so it is an edge action`);
  assert.deepEqual([...QUICKSLOT_ACTIONS].sort(), [...QS].sort(), 'and the set the self-routing hosts read is the same five');
});

// ── THE FOUR HOSTS ───────────────────────────────────────────────────

// AUDIT SOC B4/D1's pin, twinned. The social one walks world.js for the door
// and the arm; this walks EVERY host ctx that carries `toggleSheath`, because
// that list is exactly the list of places a gameplay key is answered, and a
// door missing from one of them is the tavern bug again.
const HOSTS = Object.freeze([
  ['src/scenes/world.js', 'the streaming world'],
  ['src/scenes/exterior.js', 'the ?town/?exterior host'],
  ['src/scenes/dungeonContext.js', 'the dungeon context, in both hosts that mount it'],
  ['src/scenes/worldModes.js', 'the interior mode'],
]);

// ── THE MODEL'S OWN IMPORTS ──────────────────────────────────────────

test('QS2: the quickslot model imports no UI window - the cycle that killed five test files the moment anything imported it (mutant: USE_PENDING taken from ui/native/nativeInventory.js again)', () => {
  // The words themselves are one table, read three ways.
  assert.equal(USE_PENDING_UI, USE_PENDING_SYS, 'the window and the ladder hand out the same frozen object');
});

// ── THE RIG, DRIVEN ──────────────────────────────────────────────────

// A source pin over `refreshWorn()` proves a call exists, not that a swap
// changes what the player is holding. This is the host's shape - an entity, an
// equip table, a real rig - with the swap performed and the rig ASKED.
const CANVAS = { clientWidth: 1000, clientHeight: 800 };
const sword = () => ({ group: 'Weapons', templateIndex: 120, material: 0, name: 'Longsword', currentCondition: 800, maxCondition: 1000 });
const dagger = () => ({ group: 'Weapons', templateIndex: 113, material: 3, name: 'Dagger', currentCondition: 50, maxCondition: 100 });
const hero = (items) => ({ isPlayer: true, level: 5, career: {}, activeEffects: [], spells: [], stats: {}, items });
const rigFor = (entity) => createWeaponRig({
  renderer: {}, canvas: CANVAS, fetchBytes: () => { throw new Error('no art in tests'); },
  palette: null, audio: { playOneShot() {} }, entity, say: () => {},
});

test.beforeEach(() => clearQuickslots());

test('QS2: a swap changes what the RIG reports as held, in the same press - not on the next frame (mutants: refreshWorn dropped from the performer; refreshWorn made a no-op)', () => {
  const e = hero([sword(), dagger()]);
  const [held, dag] = e.items;
  equipItem(e, held);
  const rig = rigFor(e);
  rig.frame(1 / 60);
  assert.equal(rig.playerWeapon.weapon, held, 'the rig starts on the worn weapon');
  assignQuickslot('swap', dag);

  // The performer's two halves, in the order every host writes them.
  const r = swapQuickslot({ entity: e, say: () => {} });
  assert.equal(r.kind, 'swapped');
  assert.equal(equipTableOf(e)[EQUIP_SLOTS.RightHand], dag, 'the equip table changed');
  assert.equal(rig.playerWeapon.weapon, held, 'and the rig has NOT noticed - this is why the refresh is called at all');
  rig.refreshWorn();
  assert.equal(rig.playerWeapon.weapon, dag, 'now the hand holds the dagger');
  assert.equal(quickslotOf(held), 'swap', 'and the sword is the next press');

  // ...and the frame's own read agrees, so the refresh is the same law early
  // and not a second one.
  swapQuickslot({ entity: e, say: () => {} });
  rig.frame(1 / 60);
  assert.equal(rig.playerWeapon.weapon, held);
});

test('QS2: the rig\'s refresh door is idempotent and changes nothing on its own (mutant: refreshWorn wired to something that toggles)', () => {
  const e = hero([sword()]);
  equipItem(e, e.items[0]);
  const rig = rigFor(e);
  rig.frame(1 / 60);
  const before = rig.playerWeapon.weapon;
  const sheathed = rig.playerWeapon.sheathed;
  rig.refreshWorn(); rig.refreshWorn(); rig.refreshWorn();
  assert.equal(rig.playerWeapon.weapon, before, 'asking twice is asking once');
  assert.equal(rig.playerWeapon.sheathed, sheathed, 'and it is not a second sheath door');
  assert.equal(rig.toggleSheathCalls, 0, 'the sheath counter never moved');
});
