// DISC29-H (2026-09-28, Triage on Discord: expelled from the Mages Guild in the middle of its guard quest) - INFO MODE
// LOOKS AT A QUEST STAND; IT DOES NOT CLICK IT.
//
// What expels is N0B20Y02's own script, faithfully run: a click on the sleeping mage is `_S.04_` (-10, and a shielded
// hostile Mage placed in the hall) and that Mage's death is `_S.07_` (-50), so the guild's next visit finds a negative
// reputation (Guild.UpdateRank: expelled; JOIN: TEXT.RSC 612). The raiders' deaths change no reputation at all. The
// port's part was HOW a player could click him: DFU's quest-resource arm clicks "only ... when not in info mode"
// (PlayerActivate.cs:334-338), and a static NPC in Info is PresentNPCInfo's one line (:753-757, :1484-1486) -
// StaticNPCClick and its DoClick belong to Grab, Talk and Steal. The port's quest-stand click ran DoClick in every mode.
// The click lives in worldModes' closure, so this pins it by source, as DQ1's suite (dungeonquestclick) pins the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { presentNpcInfoText } from '../../src/player/activate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('DISC29-H: a Person in Info is PresentNPCInfo\'s one line, named by StaticNPC.DisplayName off the stamp\'s own layout data', () => {
  assert.equal(presentNpcInfoText('Mordard Bryte'), 'You see Mordard Bryte.');
});

