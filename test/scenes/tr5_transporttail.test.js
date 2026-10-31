import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dismountOnTransition, TRANSPORT_MODES } from '../../src/systems/transport.js';
import { CANNOT_CHANGE_INDOORS } from '../../src/ui/transportWindow.js';

// TR5 - THE ARC'S TAIL: the two laws TR1 and TR3 shipped WITHOUT
// CALLERS. `dismountOnTransition` was ported and never run, so you
// could ride a horse through a shop door and stay mounted inside;
// `CANNOT_CHANGE_INDOORS` was exported and never said, so the T key
// indoors did nothing instead of refusing. Both are the dangling-door
// shape this session found three times in other people's code
// (openUseMagicItem, openTransport, audio.setLoop) and then left in
// its own.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('TR5: both interior transitions dismount, and nothing else does (HandleTransition :196-202)', () => {
  // The law itself, once more at the boundary: leaving does NOT remount.
  assert.equal(dismountOnTransition(TRANSPORT_MODES.Horse, 'ToDungeonExterior'), TRANSPORT_MODES.Horse);
});

test('TR5: the T key indoors REFUSES with the HUD line, in both interior hosts', () => {
  assert.equal(CANNOT_CHANGE_INDOORS, 'You cannot change transportation indoors.');
});

