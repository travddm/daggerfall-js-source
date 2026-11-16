// CG2.
//
// THE ROOT: the enhanced wizard's name boxes are real <input>s over the
// canvas. Its capture keydown steps aside for a field (the field must
// take the character) and lets the key bubble - straight into the
// host's ladder, whose first rung under any overlay was an
// unconditional preventDefault (townTalk.keydown in the two exterior
// hosts; routeKey + the dungeon host's preventDefault-on-true). No
// character was ever inserted; the name stayed empty; Continue stayed
// disabled. One definition now - isTextEntryTarget - and every ladder
// leaves a field's key to the field, consumed for the host (typing
// never walks the player) and untouched for the browser.
//
// And the wedge behind it: an enhanced wrapper whose view failed to
// import held the overlay slot for ever with no-op input/click and
// `done` false - every key and pointer eaten, nothing on screen. The
// classic wizard takes over on the same flow now.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTextEntryTarget, routeKey } from '../../src/ui/input.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('CG2: a DOM text field owns its key - the dungeon route neither routes nor swallows it, and the exterior hosts\' first rung steps aside before its preventDefault', () => {
  assert.equal(isTextEntryTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTextEntryTarget({ tagName: 'DIV' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'CANVAS' }), false);
  assert.equal(isTextEntryTarget(null), false);
  assert.equal(isTextEntryTarget(undefined), false);
  // routeKey: under an overlay, a key aimed at a field is NOT handled (so the dungeon host does not preventDefault) and
  // the overlay's input is NOT called with it; a key aimed at the canvas still reaches the native overlay as before
  const calls = [];
  const ctx = { uiOverlayActive: true, overlayIsNative: true, overlayInput: (code, e) => calls.push([code, e?.key]) };
  assert.equal(routeKey({ code: 'KeyS', key: 'S', target: { tagName: 'INPUT' } }, ctx, null, new Set()), false, 'the field\'s key: not handled');
  assert.deepEqual(calls, [], 'and not routed to the window');
  assert.equal(routeKey({ code: 'KeyS', key: 'S', target: { tagName: 'CANVAS' } }, ctx, null, new Set()), true, 'the canvas\'s key: the window\'s, as before');
  assert.deepEqual(calls, [['KeyS', 'S']]);
  const sink = { uiOverlayActive: true, overlayIsNative: false, overlayInput: (a) => calls.push([a]) };
  assert.equal(routeKey({ code: 'Enter', key: 'Enter', target: { tagName: 'TEXTAREA' } }, sink, null, new Set()), false, 'a keyed (non-native) overlay too');
  assert.equal(calls.length, 1);
  assert.equal(routeKey({ code: 'KeyM', key: 'm', target: { tagName: 'INPUT' } }, { uiOverlayActive: false, toggleAutomap: () => calls.push(['map']) }, null, new Set()), false, 'no overlay: a field\'s M is typed, not the map');
  assert.equal(calls.length, 1, 'and the map did not open');
  // the hosts' ladders still put townTalk first, so the fix sits where the swallow was
  for (const h of ['src/scenes/world.js', 'src/scenes/exterior.js']) assert.match(read(h), /if \(townTalk\.keydown\(e, keys\)\) return;/, `${h}: the rung`);
});

