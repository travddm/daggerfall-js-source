// IH1 - THE LAST FOUR PENDING SEAMS. audit24_questseams'
// PENDING map is EMPTY of M-X rows now: %cbd (the current building's
// name), %nt (the random tavern), Place's isHouseOwned residence
// filter and its buildingNameOpts bag all answered by the world host.
// The name bag is townTalk's ONE nameOpts() - extracted so the quest
// world's generated names and the talk directory's cannot drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getContextValue } from '../../../src/systems/quest/questMacros.js';
import { hostText } from '../../hostText.mjs';   // TESA's merge (HOST-SPLIT): the quest world and the quick save moved out of bootWorld - the host read whole

const read = (p) => readFileSync(p, 'utf8');

// ── the macro flows ──────────────────────────────────────────────

test('IH1 %cbd: the hook\'s answer inside, DFU\'s "[invalid]" outside (:851-854)', () => {
  assert.equal(getContextValue('%cbd', null, { world: { currentBuildingName: () => 'The Odd Blades' } }),
    'The Odd Blades');
  // outside a building the hook answers null and the HANDLER supplies
  // C#'s own literal - the world does not spell it
  assert.equal(getContextValue('%cbd', null, { world: { currentBuildingName: () => null } }),
    '[invalid]');
});

test('IH1 %nt: the hook\'s tavern, straight through', () => {
  assert.equal(getContextValue('%nt', null, { world: { randomTavernName: () => 'The Howling Stag' } }),
    'The Howling Stag');
});

// ── the world mounts, source-pinned ──────────────────────────────

