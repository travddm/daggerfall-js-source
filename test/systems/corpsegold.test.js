// CORPSE-GOLD (2026-09-27, a player on the Discord: "out of sync dungeons can generate infinite gold upon entry if there
// are dead corpses of monsters"). Mounted, not matched: the room's memory is restored through the REAL
// restoreSharedWorld, applyWorld, patchFoe, applyLoot, retypeFoe and buildFoeAt's `stand`, sliced out of
// src/scenes/dungeonContext.js (the context cannot be stood up here). buildFoeAt's art await and its fresh loot roll are
// the one stand-in. Recorded in bible/01-Overview/bugs/Field-Bugs-2026-09-27f.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { validSharedFoe, respawnDue } from '../../src/net/wire.js';
import { validActionRecord } from '../../src/world/actionSystem.js';
import { validLootList } from '../../src/systems/loot/loot.js';
import { peerHanded } from '../../src/systems/peerWord.js';
import { withoutCarried } from '../../src/world/interior/interiorShared.js';   // PIN MOVED (AUDIT AUTO-HOLD): the lifted landing keeps off a piece the player carries   // SS3 (the Sigil Stones merge): the lifted loot seams drop a bound piece from a peer's list; PIN MOVED (HACKED-GOLD): and a letter of credit - the seams read systems/peerWord.js peerHanded
import { keepRebuiltSpawn } from '../../src/characters/enemy/enemyAnchor.js';
import { renownFoeCarry, renownFoeRevived } from '../../src/net/renownTracker.js';
import { registerFoeDoor } from '../../src/systems/artifactEffects.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { goldStack, isGoldPieces } from '../../src/systems/inventory.js';
import { ROOM_LOOT_OFF } from '../roomLootOff.mjs';   // PARTY-LOOT: the room's seams with no room

const scoped = (state) => new Proxy(state, {
  has: (t, k) => k !== '__s',
  get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : globalThis[k])),
  set: (t, k, v) => { t[k] = v; return true; },
});
const mount = (body, state) => new Function('__s', `with (__s) { ${body} }`)(scoped(state));
const tick = () => new Promise((r) => setTimeout(r, 0));

// Two species one random marker can hold: dungeonEnemies.js bands the pick on the player's level, so the room's roster
// (whoever built the room first) and a player at another level stand different kinds at the same index.
const RAT = 0, IMP = 1;
const goldIn = (items) => items.filter(isGoldPieces).reduce((s, it) => s + (it.stackCount ?? 0), 0);

/** A layout foe as this entry's build stands it: alive at its marker with its OWN loot roll (spawnEnemyLoot's gold). */
const built = (mobileType, roll) => ({
  mobileType, gender: 'male', dead: false, src: { mobileType },
  entity: { health: 10, maxHealth: 10, items: [goldStack(roll)], activeEffects: [], team: 'PlayerEnemy' },
  ai: { feet: [0, 0, 0], yaw: 0, isHostile: true },
});
/** The room's memory of a layout foe: dead, of `mobileType` (a record as sharedWorld writes it - no items). */
const deadRecord = (mobileType) => ({ health: 0, maxHealth: 10, dead: true, feet: [0, 0, 0], yaw: 0, mobileType, gender: 'male', team: 'PlayerEnemy' });

const memory = (foes, loot = []) => ({ locationKey: 'dungeon:7', stamp: 'the room', world: { foes, loot, actions: [] } });

test('CORPSE-GOLD: a foe record the restore refuses is a hole at its own index - the rest do not move up onto the next foe (mutants: filter(Boolean) back; the hole not skipped)', () => {
  const bad = { ...deadRecord(RAT), feet: [1e9, 0, 0] };
  assert.equal(validSharedFoe(bad), null, 'the door refuses it');
});
