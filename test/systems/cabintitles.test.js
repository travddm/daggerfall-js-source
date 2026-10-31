// CABIN-TITLES (2026-10-04, "cabins specifically are broken ... check past commits (before the recent naval overhaul)").
// SAILING-CABINS (#574) links a bank ship's furnished cabin to ONE sailing ship of her size, and only when that ship is
// unambiguous: world.js's legacyCabinItems handed boatCabinOwnership.bankCabinCandidates the pack and the wagon, where
// every ship's deed rode until HOLDINGS (#549) entered deeds in the Fleet's book instead (systems/fleet.js titleDeed).
// From then a ship laid up in the book was no candidate: with a second ship of the bank ship's size afloat, the link
// read that one as the only one and moved the bank cabin's contents into her; with none afloat it read no ship at all.
// Every fixture from its real producer (TEST THE SHAPE THE PRODUCER MINTS): the deeds minted by Come Sail Away's own
// mintDeed and entered by the Fleet's titleDeed (worldModes.js commitTrade's call), the afloat ship launched from her
// title by the real runtime over the vendored hulls (test/csaScene.mjs), the link by the shipped linkBankCabin, and the
// host's own legacyCabinItems lifted from world.js's source. THE FOUR HOSTS: world.js is the one host with a bank cabin
// link (fixed here); worldModes.js asks it (host.linkedBankCabin, unchanged); exterior.js has no sailing runtime and
// dungeonContext.js no exterior fleet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scene, terrain } from '../csaScene.mjs';
import { titleDeed, titleOf, fleetBook, knowShip, retitle, _resetFleetForTests } from '../../src/systems/fleet.js';
import { mintDeed, mintBoatItem } from '../../src/systems/comeSailAway/comeSailAwayItems.js';
import { linkBankCabin, readBankCabinLink } from '../../src/systems/boatCabinOwnership.js';
import { cabinSceneName } from '../../src/systems/sailingCabin.js';
import { SHIP_INTERIOR_MAP_IDS, SHIP_TYPES } from '../../src/systems/banking.js';
import { BUILDING_KEY_0 } from '../../src/systems/talk/talkTopics.js';
import { createSceneCache, interiorSceneName } from '../../src/systems/sceneCache.js';

const SMALL_SHIP = 2, LARGE_GALLEY = 3, CARRACK = 4;

test('CABIN-TITLES: a ship picked up is her parts in the pack, her title gone from the book (AUDIT HOLDINGS F1) - still her size\'s one match, so the pack is asked beside the book (mutant: the pack left out of legacyCabinItems)', () => {
  assert.equal(titleOf(821), null, 'her title left the book with her');

});

