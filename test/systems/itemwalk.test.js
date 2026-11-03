// ITEM-WALK: every list of items a save holds, by one walk. A - the walk itself (systems/save/save.js savedItemLists),
// which the load's festival-face fold reads. C - the realm's wealth measure counts a sworn revenant's pack
// (net/realm/realmGoldLaw.js stashedItemLists).
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { WEAPONS, WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { goldStack, letterOfCredit } from '../../src/systems/inventory.js';
import { liquidWealthOf, stashedItemLists } from '../../src/net/realm/realmGoldLaw.js';
import { firstSaveRefusal } from '../../server-account/src/realm.js';
import { modSaveRecords } from '../../src/systems/modSaveData.js';
import { LEGACY_VENDOR } from '../../src/systems/legacy/family.js';
import { snapshotPlayer, restorePlayer, savedItemLists } from '../../src/systems/save/save.js';

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null), setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); }, clear: () => _store.clear(), key: (i) => [..._store.keys()][i] ?? null, get length() { return _store.size; },
};
const N = await import('../../src/systems/revenant/revenant.js');
const RC = await import('../../src/systems/revenant/revenantCompanions.js');
const S = await import('../../src/systems/companionSlots.js');

const at = (v) => () => v;
/** An iron dagger from the real producer: a piece to find in each list. */
const piece = () => createWeapon(WEAPONS.Dagger, WEAPON_MATERIALS.Iron, at(0.5));

// ── C: the first save and a sworn revenant's pack ───────────────────────────────────────────────────────────────────────────

const me = { isPlayer: true, name: 'Ayla Stormwind', characterId: 'char-walk', level: 8, health: 100, maxHealth: 100 };
function swornOne() {
  N._resetRevenantForTests(); RC._resetRetinueForTests(); S._resetCompanionSlotsForTests(); _store.clear();
  S.registerCompanionCount('revenant', () => RC.revenantsWithYou().length);
  RC.setRetinuePlayer(me);
  const mobileType = MOBILE_TYPES.Orc;
  const r = N.revenantDeed(me, { mobileType, level: 6, champion: 'mighty', unquiet: true, health: 5, maxHealth: 50, team: 'Orcs' }, 'fled', { mobileType, rolls: at(0) });   // UNQUIET (Revenants.md section 46): a marked foe
  return N.revenantSpared(me, { revenant: { id: r.id } }, { state: 'with' });
}
const feudSave = () => ({ level: 1, goldPieces: 0, items: [], wagonItems: [], bankAccounts: [], houses: [], modData: { [N.REVENANT_SAVE]: JSON.parse(JSON.stringify(modSaveRecords()[N.REVENANT_SAVE])) } });

test('ITEM-WALK C: the account service\'s first save counts a sworn revenant\'s pack - the storage the player fills as the crew\'s (revenantCompanions.js packOf), saved in the feud\'s record: a million gold in it passed uncounted while the same million in a crew hand\'s pack was counted; now counted alike; a pack the load keeps for no one (not sworn, or defeated) counts nothing (mutants: the pack unread; the oath or the defeat unasked; the key misnamed)', () => {
  const r = swornOne();
  RC.revenantParty().packOf(r.id).push(goldStack(1_000_000), letterOfCredit(50_000));
  const snap = feudSave();
  const pack = snap.modData[N.REVENANT_SAVE].list[0].companion.items;
  assert.ok(stashedItemLists(snap).includes(pack), 'its pack is a stash the wealth measure reads');
  assert.equal(liquidWealthOf(snap), 1_050_000);
  // the service's first save: refused with the pack full, and passed once it is empty
  assert.deepEqual(firstSaveRefusal(JSON.stringify(feudSave())), { error: 'realm-birth' });
  pack.length = 0;
  assert.equal(firstSaveRefusal(JSON.stringify(snap)), null);
  // a record the load keeps no pack for (revenant.js sanitize: sworn and not defeated) counts nothing, whatever it holds
  const rec = JSON.parse(JSON.stringify(modSaveRecords()[N.REVENANT_SAVE])).list[0];
  for (const off of [{ sworn: false }, { defeated: true }]) {
    assert.equal(liquidWealthOf({ modData: { [N.REVENANT_SAVE]: { list: [{ ...rec, ...off }] } } }), 0, JSON.stringify(off));
  }
  // and a record that is no list measures as none
  for (const list of [5, {}, 'x', null, [null, 7, { sworn: true, companion: { items: 5 } }, { sworn: true }]]) {
    assert.equal(liquidWealthOf({ modData: { [N.REVENANT_SAVE]: { list } } }), 0, `list ${JSON.stringify(list)}`);
  }
});

// ── A: every list a save holds, by one walk ─────────────────────────────────────────────────────────────────────────
// (C and A read the feud's record through the save registry.)

const ROOM = 'DaggerfallInterior [MapID=1, BuildingKey=2]';
/** A save from the real snapshot, `fill` putting a piece in each list, and the entity its load restores. */
function loadOf(fill) {
  const p = { isPlayer: true, level: 10, gender: 'male', activeEffects: [], health: 60, maxHealth: 60, items: [piece()], spells: [], stats: {}, skills: {}, career: { primarySkills: [], majorSkills: [], luck: 50 } };
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(p, { classicMinutes: 100 })));
  fill(snap);
  const loaded = { isPlayer: true };
  restorePlayer(loaded, snap, new Map());
  return { snap, loaded };
}

test('ITEM-WALK A: savedItemLists walks every list a save holds - the character\'s own five, a thing set out in a room, a guild\'s shelf, a living foe\'s and a guard\'s kit (in the street and in a building), a revenant\'s take and a sworn one\'s pack, a quest\'s item and a quest foe\'s queue, and Project Legacy\'s bequests and remains; the load\'s festival-face fold reads every list but the pack through it (mutants: each list dropped from the walk)', () => {
  // the feud's record through its own producer: a sworn one with a pack, a living one holding what it took
  const sworn = swornOne();
  RC.revenantParty().packOf(sworn.id).push(piece());
  const mobileType = MOBILE_TYPES.Orc;
  const living = N.revenantDeed(me, { mobileType, level: 6, champion: 'mighty', unquiet: true, health: 5, maxHealth: 50, team: 'Orcs' }, 'fled', { mobileType, rolls: at(0) });
  N.revenantById(living.id).took = [piece()];
  const feud = JSON.parse(JSON.stringify(modSaveRecords()[N.REVENANT_SAVE]));
  // Project Legacy's record in the shape its host saves: a member's bequest, the waiting Succession's, and a fallen
  // member's remains as they lie and as they were laid
  const legacy = { people: [{ id: 'm1', bequest: [piece()] }], pending: { bequest: [piece()] }, remains: [{ of: 'm0', items: [piece()], first: [piece()] }] };
  const shelf = { day: 3, items: [piece()] };   // a guild's day's Buy shelf (GUILD-SHELF)
  const decor = piece(), questItem = piece();
  const { snap, loaded } = loadOf((s) => {
    s.furnishings = [{ group: 'Furniture', templateIndex: 217, name: 'Bed' }];   // DECOR2b: a bed the furnisher delivered (decorFurnish.js FURNISH_BEDS)
    s.sceneCache = { scenes: [{ sceneName: ROOM, decorOwn: { 'own-1': decor }, guildShelves: { BuyMagicItems: shelf } }] };
    s.world = { piles: [], droppedLoot: [], foes: [{ items: [piece()] }], guards: [{ items: [piece()] }] };
    s.interior = { foes: [{ items: [piece()] }], guards: [{ items: [piece()] }] };
    s.quest = { machine: { quests: [{ resources: [
      { type: 'Person', resourceSpecific: {} }, { type: 'Item', resourceSpecific: { item: questItem } }, { type: 'Foe', resourceSpecific: { itemQueue: [piece()] } },
    ] }] } };
    s.modData = { [N.REVENANT_SAVE]: feud, [LEGACY_VENDOR]: legacy };
  });
  const walk = savedItemLists(snap, loaded);
  const walked = (list, what) => assert.ok(walk.includes(list), what);
  for (const l of [loaded.items, loaded.wagonItems, loaded.bagItems, loaded.furnishings, loaded.otherItems]) walked(l, 'the character\'s own lists, from the restored entity');
  assert.equal(loaded.furnishings[0].templateIndex, 217);
  // a room's set-out pieces and a quest's item are one piece each, walked as a list of one
  assert.ok(walk.some((l) => l.includes(decor)), 'a thing set out in a room');
  assert.ok(walk.some((l) => l.includes(questItem)), 'a quest\'s item');
  walked(shelf.items, 'a guild\'s shelf');
  walked(snap.world.foes[0].items, 'a living foe\'s kit');
  walked(snap.world.guards[0].items, 'a guard\'s kit');
  walked(snap.interior.foes[0].items, 'a building\'s foe');
  walked(snap.interior.guards[0].items, 'and its guard');
  walked(snap.quest.machine.quests[0].resources[2].resourceSpecific.itemQueue, 'what a quest foe will carry');
  walked(feud.list.find((r) => r.id === sworn.id).companion.items, 'a sworn revenant\'s pack');
  walked(feud.list.find((r) => r.id === living.id).took, 'what a revenant took');
  walked(legacy.people[0].bequest, 'a member\'s bequest');
  walked(legacy.pending.bequest, 'the waiting Succession\'s bequest');
  walked(legacy.remains[0].items, 'a fallen member\'s remains as they lie');
  walked(legacy.remains[0].first, 'and as they were laid');
});
