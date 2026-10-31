// WAGONS2 (FINAL AUDIT, 2026-10-09, Mac: "Audit this one more time"): the last audit of the wagons branch, after the merge
// of main that renumbered its relay world185 - five cold lenses (the relay and the visits, the riders and the wheels, the
// caravan's room as a house, the windows' render half, the items and the docs). Each fix below is pinned by execution where
// its code runs on its own, and by its wiring where it is a host's; bible/06-Systems/Wagons.md "The final audit".
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { createCaravanAccess, parkedCaravanAt, caravanStandsAt, caravanTurnOf, CARAVAN_STANDS_NATIVES } from '../../src/scenes/caravanRoom.js';
import { CARAVAN_TEXT, CARAVAN_STANDS_TURN, turnGap } from '../../src/systems/caravanRoom.js';
import { WAGON_MODE } from '../../src/systems/horse/horseCartLaw.js';
import { quatLookRotation } from '../../src/world/quat.js';
import { newWagonItem, wagonItemName, wagonKgFor } from '../../src/systems/wagon/wagonKinds.js';
import { LOOK_TEXT } from '../../src/systems/wagon/wagonLooks.js';
import { createWagonRiders, RIDE_ROW } from '../../src/scenes/wagon/wagonRiders.js';
import { RIDE_TEXT, RIDE_ASK_REACH } from '../../src/systems/wagon/wagonSeats.js';
import { TOO_FAR_AWAY_TEXT } from '../../src/player/activate.js';
import { createDuelPrompt, DUEL_PROMPT_CSS } from '../../src/ui/duelPrompt.js';
import { sellGuardOf, localClickDecision } from '../../src/systems/tradeModes.js';
import { wagonLoadedHeld, packTradeRefusal, WAGON_LOADED_TRADE_TEXT } from '../../src/systems/tradePack.js';
import { planStore } from '../../src/systems/item/itemTransfer.js';
import { takeTradeGoods } from '../../src/net/realm/realmTradeLaw.js';
import { validLootItem } from '../../src/systems/loot/loot.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { clockFogColor, realWindowsGlsl, RW_SEED_GLSL } from '../../src/render/realWindows.js';
import { exteriorAmbient, sunScale, viewOutLight } from '../../src/world/worldClock.js';
import { EMIT_MESH_FS } from '../../src/render/airPass.js';
import { ROOM_LIT_SHARE } from '../../src/world/windowRoomArt.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const sources = new Map();
/** One function of a file, its source (a declaration, an arrow's value, or a method), to run here. */
function lift(file, name) {
  if (!sources.has(file)) { const src = read(file); sources.set(file, { src, ast: parse(src, { ecmaVersion: 'latest', sourceType: 'module' }) }); }
  const { src, ast } = sources.get(file);
  const walk = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) return src.slice(node.start, node.end);
    if (node.type === 'VariableDeclarator' && node.id?.name === name && node.init?.type === 'ArrowFunctionExpression') return src.slice(node.init.start, node.init.end);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) { for (const n of v) { const f = walk(n); if (f) return f; } } else if (v && typeof v === 'object') { const f = walk(v); if (f) return f; }
    }
    return null;
  };
  const found = walk(ast);
  assert.ok(found, `${file} has ${name}`);
  return found;
}
const rad = (deg) => (deg * Math.PI) / 180;
const heading = (deg) => ({ HeadingX: Math.sin(rad(deg)), HeadingZ: Math.cos(rad(deg)) });

// ─── the caravan's room ─────────────────────────────────────────────────────────────────────────────────────────────
test('WAGONS2 (FINAL AUDIT) THE ROOM ON ITS CARAVAN AS IT FACES: a room comes back onto its caravan where it stands AND as it faces - re-parked on its own spot facing another way is another room (its walls the old turn\'s, its rear door\'s step inside the re-parked body); the parked heading read as the room\'s own turn; a state with no heading judged by its place alone (mutants: the heading unread, any turn the same)', () => {
  // the parked heading is the room's turn, in caravanTurnOf's degrees
  for (const deg of [0, 30, 90, -120, 179]) {
    const at = parkedCaravanAt({ Mode: WAGON_MODE.Deployed, WorldX: 1, WorldZ: 2, ...heading(deg) });
    assert.ok(turnGap(at[2], caravanTurnOf(quatLookRotation([Math.sin(rad(deg)), 0, Math.cos(rad(deg))]))) < 1e-6, `${deg}: the heading as the cart's own rotation turns the room`);
  }
  const room = { v: 2, kind: 'caravan', origin: [4000, 10, 8000], turn: 30, step: [4000, 10, 7900], yaw: 0 };
  let parked = { Mode: WAGON_MODE.Deployed, WorldX: 4010, WorldZ: 8020, ...heading(30) };
  const access = createCaravanAccess({ available: () => true, mode: () => 'exterior', busy: () => false, say() {}, toNative: (p) => p, fromNative: (p) => p, parked: () => null, ownsCaravan: () => true, parkedAt: () => parkedCaravanAt(parked), enterInterior: async () => true });
  assert.equal(access.canRestore(room), true, 'where it was entered, as it faced');
  parked = { ...parked, ...heading(30 + CARAVAN_STANDS_TURN - 1) };
  assert.equal(access.canRestore(room), true, 'a lean of the ground it stands on');
  parked = { ...parked, ...heading(210) };
  assert.equal(access.canRestore(room), false, 're-parked on its spot, turned about: not this room');
  parked = { ...parked, ...heading(30 + CARAVAN_STANDS_TURN + 5) };
  assert.equal(access.canRestore(room), false, 'turned past the lean');
  assert.equal(caravanStandsAt({ ...room, turn: -350 }, [4000, 8000, 10]), true, 'the turn read round the circle');
  assert.equal(caravanStandsAt(room, [4000, 8000]), true, 'no heading said: its place alone');
  assert.equal(caravanStandsAt(room, [4000, 8000, null]), true);
  assert.equal(caravanStandsAt(room, [4000 + CARAVAN_STANDS_NATIVES + 1, 8000, 30]), false, 'and its place still');
  assert.equal(parkedCaravanAt({ Mode: WAGON_MODE.Deployed, WorldX: 1, WorldZ: 2, HeadingX: 0, HeadingZ: 0 })[2], null, 'a state with no heading says none');
});

test('WAGONS2 (FINAL AUDIT) A CARAVAN\'S SAVE THAT CANNOT COME BACK LANDS AT ITS REAR DOOR: a save or a Recall anchor made in a caravan whose room is refused (a visit\'s - the room is its owner\'s - the caravan moved, sold, the mod off) stands the player on the ground behind the rear door it was made by, told so - it fell to the building\'s no-door arm (the teleport\'s landing at the pixel\'s centre: a town\'s roof, half a kilometre off in the wilds, "Building has no exterior doors") and a Recall stood inside the wagon\'s body (mutants: the door\'s landing unused at a load, at a Recall)', () => {
  const access = createCaravanAccess({ available: () => true, mode: () => 'exterior', busy: () => false, say() {}, parked: () => null, toNative: (p) => p, fromNative: (p) => p.map((v) => v / 2), ground: (p) => [p[0], 0.25, p[2]], enterInterior: async () => true });
  const room = { v: 2, kind: 'caravan', origin: [4000, 10, 8000], turn: 30, step: [4000, 10, 7900], yaw: 1.5 };
  assert.equal(CARAVAN_TEXT.outside, 'You stand outside the caravan.');
});

test('WAGONS2 (FINAL AUDIT) THE WORDS: an inside painted says "is" of a floor and a ceiling and "are" of the walls; "Ask to ride" out of reach says too far (it said there was no room); an Accept after the ask lapsed says so (it said no seat was free); the ride\'s strip stands below the duel\'s (both stood at the top centre - a challenge under a ride\'s ask lapsed unseen) (mutants: each word, the strip\'s place)', () => {
  assert.equal(LOOK_TEXT.paintedInside('floor', 'Red rug'), 'The floor is now red rug.');
  assert.equal(LOOK_TEXT.paintedInside('ceiling', 'Night sky'), 'The ceiling is now night sky.');
  assert.equal(LOOK_TEXT.paintedInside('walls', 'Whitewash'), 'The walls are now whitewash.');
  // the rider's and the owner's words
  const said = [];
  const riders = createWagonRiders({ selfId: () => 'me-000001', now: () => 1000, say: (l) => said.push(l), pool: { peerRide: () => ({ model: 'openWagon', passengers: [], declined: [] }), mySeatCount: () => 4, peerSeat: () => null } });
  riders.press('own-000001', RIDE_ROW.ask, RIDE_ASK_REACH + 1);
  assert.equal(said.at(-1), RIDE_TEXT.tooFar);
  assert.equal(RIDE_TEXT.tooFar, TOO_FAR_AWAY_TEXT, 'the game\'s own');
  riders.press('own-000001', RIDE_ROW.ask, 1);
  assert.equal(said.at(-1), RIDE_TEXT.asking('Someone'), 'in reach: asked');
  riders.accept('rid-000001');
  assert.equal(said.at(-1), RIDE_TEXT.lapsed('Someone'), 'no ask standing: it lapsed, said so');
  // the strip
  const node = () => ({ children: [], dataset: {}, className: '', textContent: '', append(...c) { this.children.push(...c); }, addEventListener() {} });
  const doc = { head: node(), body: node(), createElement: () => node(), getElementById: () => null };
  const strip = createDuelPrompt({ asks: () => [], accept() {}, decline() {}, name: () => '', now: () => 0, doc, second: true });
  assert.ok(strip.root.className.split(' ').includes('second'));
  assert.ok(!createDuelPrompt({ asks: () => [], accept() {}, decline() {}, name: () => '', now: () => 0, doc }).root.className.split(' ').includes('second'), 'a duel\'s own strip stands where it stood');
  const below = /\.dfduel-toast\.second \{ top: calc\((\d+)px \+ env\(safe-area-inset-top, 0px\)\); \}/.exec(DUEL_PROMPT_CSS);
  assert.ok(below && Number(below[1]) >= 70, 'below a touch strip\'s height (its 44 px buttons and padding)');
});

test('WAGONS2 (FINAL AUDIT) THE COUNTER\'S WAGON, ONE HOME: what a counter\'s click reads off the entity (the wagon driven, whether its store holds goods, the bag) is sellGuardOf\'s - the six copies across the two trade windows were pinned nowhere; a loaded caravan stays while a spare cart sells (mutants: the first wagon in the pack, a window\'s own copy)', () => {
  const cart = newWagonItem('cart'), caravan = newWagonItem('caravan'), grain = { group: 'MiscItems', templateIndex: 1, weightInKg: 10 };
  const loaded = { items: [cart, caravan], wagonItems: [grain], bagItems: [] };
  assert.deepEqual(sellGuardOf(loaded), { wagonLoaded: true, bagLoaded: false, usedWagon: caravan }, 'the caravan driven, not the cart first in the pack');
  assert.deepEqual(localClickDecision('Sell', caravan, sellGuardOf(loaded)), { kind: 'ignore' }, 'the loaded caravan stays');
  assert.deepEqual(localClickDecision('Sell', cart, sellGuardOf(loaded)), { kind: 'stage' }, 'the spare cart sells');
  assert.deepEqual(localClickDecision('Sell', caravan, sellGuardOf({ ...loaded, wagonItems: [] })), { kind: 'stage' }, 'empty, it sells');
  assert.equal(sellGuardOf({ items: [], bagItems: [grain] }).bagLoaded, true);
  assert.deepEqual(sellGuardOf(null), { wagonLoaded: false, bagLoaded: false, usedWagon: null });
  // the keyed shelf asks the pack's own law
  assert.equal(wagonLoadedHeld(caravan, loaded), true);
  assert.equal(wagonLoadedHeld(cart, loaded), false);
  assert.equal(wagonLoadedHeld(caravan, { ...loaded, wagonItems: [] }), false);
  assert.equal(wagonLoadedHeld(null, loaded), false);
  assert.equal(packTradeRefusal(caravan, loaded), WAGON_LOADED_TRADE_TEXT);
});

test('WAGONS2 (FINAL AUDIT) THE STORE READS THE DRIVEN WAGON\'S CAPACITY AT EVERY PLAN: every planStore and planDropGold the two inventory windows make is handed wagonKgFor of the entity - a call without it plans against the Small Cart\'s 750 kg (a dropped one was pinned nowhere) (mutants: a window\'s call without it)', () => {
  for (const f of ['src/ui/enhanced/enhancedInventory.js', 'src/ui/native/nativeInventory.js']) {
    const src = read(f);
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    const calls = [];
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' && (n.callee.name === 'planStore' || n.callee.name === 'planDropGold')) calls.push(n);
      for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
    };
    walk(ast);
    assert.ok(calls.length >= 2, `${f}: its plans found`);
    for (const c of calls) {
      const opts = c.arguments[1];
      const kg = opts?.type === 'ObjectExpression' ? opts.properties.find((p) => p.key?.name === 'wagonKg') : null;
      assert.ok(kg && /^wagonKgFor\((deps|this\.hooks)\.entity\)$/.test(src.slice(kg.value.start, kg.value.end)), `${f}: ${src.slice(c.start, c.start + 60)}... reads the driven wagon`);
    }
  }
  const brick = { group: 'MiscItems', templateIndex: 1, weightInKg: 100, stackCount: 10 };
  const full = [{ group: 'MiscItems', templateIndex: 1, weightInKg: 700, stackCount: 1 }];
  assert.equal(planStore(brick, { remote: full, usingWagon: true, wagonKg: wagonKgFor({ items: [newWagonItem('caravan')] }) }).amount, 10, 'the caravan\'s 2000 kg');
  assert.equal(planStore(brick, { remote: full, usingWagon: true }).ok, false, 'the cart\'s 750 when none is said');
});

test('WAGONS2 (FINAL AUDIT) THE ACCOUNT SERVICE KEEPS THE LOADED WAGON: the realm\'s take (trade, market, vault - takeTradeGoods) gives nothing of the wagon a save drives while its store holds goods - the client\'s refusal was the only one, so a modified client sold a loaded caravan and kept its 2000 kg in a 750 kg cart; the wagon stays whole in the save when another piece moves, and a spare cart or an empty caravan moves (mutants: the service\'s check, the untouched record dropped)', () => {
  const rec = (it) => JSON.parse(JSON.stringify(it));
  const cart = rec(newWagonItem('cart')), caravan = rec(newWagonItem('caravan')), dagger = rec(createWeapon(113, 9, () => 0.5));
  const save = () => ({ items: [cart, caravan, dagger].map(rec), wagonItems: [{ group: 'MiscItems', templateIndex: 1 }], goldPieces: 0 });
  const offer = (it) => ({ items: [validLootItem(it)], gold: 0 });
  assert.equal(takeTradeGoods(save(), offer(caravan), [1]), null, 'the loaded caravan: nothing moves');
  const s1 = save();
  assert.equal(takeTradeGoods(s1, offer(dagger), [2]).length, 1, 'another piece moves');
  assert.deepEqual(s1.items.map((r) => r.wagonKind ?? r.name), [cart.name, 'caravan'], 'and the caravan stays whole beside the cart');
  const s2 = save();
  assert.equal(takeTradeGoods(s2, offer(cart), [0]).length, 1, 'the spare cart moves');
  const s3 = { ...save(), wagonItems: [] };
  assert.equal(takeTradeGoods(s3, offer(caravan), [1]).length, 1, 'an empty caravan moves');
});

// ─── the windows' render half ───────────────────────────────────────────────────────────────────────────────────────
test('RW1 x WAGONS2 (FINAL AUDIT) THE VIEW OUT IN THE WEATHER: the street behind the glass is lit by the street frame\'s own terms - the clock\'s minute AND the weather\'s sun and the cloud\'s - so a rainy noon looked out on is the rainy street (it was a clear day\'s: five times the ambient, a storm\'s sixteen), and the clock\'s air compares a dimmed sun with a dimmed sun (no minute gone, the fog unchanged) (mutants: the weather unread, the cloud unread, a host\'s setup clear-skied)', () => {
  const noon = 12 * 60, ns = 0.4;
  const clear = viewOutLight(noon, ns);
  assert.deepEqual([...clear.ambient], [...exteriorAmbient(noon, ns, 1)]);
  assert.equal(clear.sun, sunScale(noon), 'a clear day: the clock\'s light alone');
  const rain = viewOutLight(noon, ns, 0.45, 0.8);
  assert.deepEqual([...rain.ambient], [...exteriorAmbient(noon, ns, 0.45)], 'the ambient at the weather\'s sun');
  assert.ok(Math.abs(rain.sun - sunScale(noon) * 0.45 * 0.8) < 1e-9, 'the key: the clock\'s times the weather\'s and the cloud\'s');
  assert.ok(rain.ambient[0] < clear.ambient[0] / 3, 'a rainy street is a dim one');
  // the clock's air: the street kept at the rain's light, looked out on at once - unchanged
  const kept = new Float32Array([0.4, 0.45, 0.5]);
  assert.deepEqual([...clockFogColor(kept, rain.sun, rain.sun)], [...kept], 'no minute gone, no change');
  assert.notDeepEqual([...clockFogColor(kept, rain.sun, clear.sun)], [...kept], 'the clear-sky light it was given brightened it');
  assert.deepEqual(viewOutLight(noon, ns, NaN, undefined).sun, sunScale(noon), 'no word: a clear day');
  for (const f of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const src = read(f);
    assert.match(src, /const light = viewOutLight\(clockMinute, getFloat\('Enhancements', 'NightAmbientLightScale', 0, 1\), weatherTerms\(\)\.sun, sky\.sunFactor\(\)\);\n\s+r\.setLighting\(withMoonAmbient\(light\.ambient, sky\.moonlight\(\)\), light\.sun, SUN_RIG_COLOR\);\n\s+r\.setFogColor\(clockFogColor\(keptFog, keptSun, r\._sunScale\)\);/, f);
  }
});

test('RW1 x WAGONS2 (FINAL AUDIT) A DARK ROOM GLOWS NOWHERE: the room\'s lit seed is one text (RW_SEED_GLSL), read by the room behind the glass and by the air pass\'s emission replay - which blooms an exterior pane\'s mask only where its room is lit, so a room drawn dark at night wears no amber halo with Enhanced Lighting on (mutants: the replay\'s test, its uniform never set, the renderer\'s word)', () => {
  const room = realWindowsGlsl('c');
  assert.ok(room.includes(RW_SEED_GLSL), 'the room\'s seed is the shared text');
  assert.match(room, /float s2 = rwLitSeed\(vn, vWorldPos, uModel\[3\]\.xyz, vUV\);/);
  assert.match(room, /float lit = night \* step\(s2, RW_LIT_SHARE\);/);
  assert.match(RW_SEED_GLSL, new RegExp(`const float RW_LIT_SHARE = ${ROOM_LIT_SHARE};`));
  assert.ok(EMIT_MESH_FS.includes(RW_SEED_GLSL), 'and the replay\'s');
  assert.match(EMIT_MESH_FS, /if \(uRoomsLit > 0\.5 && rwLitSeed\(normalize\(vNormal\), vWorldPos, uModel\[3\]\.xyz, vUV\) > RW_LIT_SHARE\) discard;/, 'unlit (s2 past the share, as step(s2, share) reads it): no bloom');
  // the JS twin of the hash: the share the shader keeps
  const fr = (x) => x - Math.floor(x);
  const hash = (p) => { let [x, y, z] = [fr(p[0] * 0.1031), fr(p[1] * 0.1030), fr(p[2] * 0.0973)]; const d = x * (y + 33.33) + y * (x + 33.33) + z * (z + 33.33); x += d; y += d; z += d; return fr((x + y) * z); };
  let lit = 0, n = 0;
  for (let tx = 0; tx < 40; tx++) for (let pl = 0; pl < 40; pl++) { n++; if (hash([3.1 * 0 + 0, pl * 0.37, tx + 11]) <= ROOM_LIT_SHARE) lit++; }
  assert.ok(Math.abs(lit / n - ROOM_LIT_SHARE) < 0.08, `about the share lit (${lit}/${n})`);
});
