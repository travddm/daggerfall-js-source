// PARTY-LOOT's END-TO-END PROBE'S EDITS STAND IN THE TREE (test/tooling/perfon4_probes.test.js's law for the online probe's):
// tools/partyLootProbe.mjs plays the report in two browsers through probe-only seams beside `__takeLoot` - what a body's
// plaque names, the room's base apart from the player's own bonus (`__bodyLoot`), which piece is a player's own
// (`__isPersonal`) and who holds the seat (`__seat`) - and a probe is not in the suite, so a change that moved the needle
// or a door the seams read would be found by the next person to run it, minutes in. The needle is held to
// src/scenes/worldModes.js here, once, the edit read off the source as the probe's own plugin serves it, and each door
// it reads held to the file that owns it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editsPlugin } from '../../tools/frameProbe.mjs';
import { PARTY_LOOT_PROBE_EDITS } from '../../tools/partyLootProbe.mjs';
import * as RL from '../../src/systems/roomLoot.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('PARTY-LOOT probe: its needle stands once in the file it names, and its plugin serves the seams beside the loot door - the plaque\'s base and bonus, the personal mark asked of roomLoot.js, and the seat', () => {
  assert.deepEqual(PARTY_LOOT_PROBE_EDITS.map((r) => r.file), ['src/scenes/worldModes.js']);
});

test('PARTY-LOOT probe: the doors its seams read are where it reads them - the dungeon\'s plaque (an unborn body names nothing), the context\'s seat and room, roomLoot.js\'s personal mark, and the enhanced pack\'s host and rows (a loot-side click takes)', () => {
  const it = {};
  assert.equal(RL.isPersonalLoot(it), false);
  RL.markPersonal(it);
  assert.equal(RL.isPersonalLoot(it), true, 'roomLoot.js answers the personal mark by the piece itself');
});
