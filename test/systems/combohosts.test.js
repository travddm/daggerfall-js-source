// AUDIT 58 (f3/input) - THE COMBO ARM'S MISSING ARGUMENT.
//
// InputManager.GetUnaryKey's combo branch (InputManager.cs:1666-1712)
// does two things: a held modifier plus the combo'd key produces the
// COMBO's action, and the plain binding on that key is SUPPRESSED
// while the modifier is down ("'space' is jump, 'LeftShift+Space'
// opens inventory. We want to ignore jumping", :1681-1685).
// GameManager.Update (:509-557) then dispatches those Actions.
//
// The port implements both halves in ui/input.js's actionOf - but ONLY
// inside `if (keys)`, i.e. only when a host hands in its held-keys Set.
// No host did. The polled half worked, because `held()` runs the same
// arm on the Set every frame; the DISPATCHED half - Inventory,
// CharacterSheet, LogBook, NoteBook, AutoMap, TravelMap, Rest,
// CastSpell, Status, Transport, UseMagicItem, QuickSave, QuickLoad,
// Escape - was dead. A player who bound Inventory to Shift+I in the
// controls window (systems/controlsConfig.js:"export function comboFromEvent" mints exactly that
// code) got the Status box instead and could never open the inventory
// from the keyboard. A8's pins drove the parameter no host passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionOf, routeKey, setBindings } from '../../src/ui/input.js';
import { clearBinding, createBindings, resetDefaults, setBinding, comboCode } from '../../src/systems/inputActions.js';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const SCENES = join(HERE, '..', 'src', 'scenes');
const body = (f) => readFileSync(join(SCENES, f), 'utf8');

function store() {
  const b = createBindings(); resetDefaults(b);
  clearBinding(b, 'Inventory', false);   // PAD1: the pad layout gave Inventory a secondary (View); this pin is the SINGLE-bound combo
  setBinding(b, comboCode('ShiftLeft', 'KeyI'), 'Inventory', true);   // what controlsWindow.js:"const combo = comboFromEvent" stages
  setBindings(b);
  return b;
}
function keyCtx() {
  const opened = [];
  return {
    opened,
    uiOverlayActive: false,
    toggleInventory() { opened.push('inventory'); },
    showStatus() { opened.push('status'); },
    toggleCharSheet() { opened.push('sheet'); },
  };
}

test('AUDIT 58 (f3/input): the OUTDOOR ladders’ read - Shift+I opens the inventory, bare I still opens Status', () => {
  store();
  try {
    // world.js / exterior.js run their own ladder off actionOf. Either
    // shape reaches the same arm: ROAD-G G3 hoisted `keys.add(e.code)`
    // ABOVE the ladder in all four hosts, so the Set usually holds this
    // key already, and actionOf unions e.code in when it does not.
    assert.equal(actionOf({ code: 'KeyI' }, new Set(['ShiftLeft'])), 'Inventory',
      'the rebound combo reaches the dispatch');
    assert.equal(actionOf({ code: 'KeyI' }, new Set()), 'Status',
      'and the plain key keeps its own binding when no modifier is down');
    // the dropped argument's answer, kept as the thing that must not
    // come back
    assert.equal(actionOf({ code: 'KeyI' }), 'Status',
      'without a Set actionOf cannot see a combo at all - this is why the hosts must pass one');
  } finally { setBindings(null); }
});

test('AUDIT 58 (f3/input): routeKey carries the Set through to the same arm (the two dungeon hosts + the interior arm)', () => {
  store();
  try {
    const withSet = keyCtx();
    assert.equal(routeKey({ code: 'KeyI', key: 'i' }, withSet, null, new Set(['ShiftLeft'])), true);
    assert.deepEqual(withSet.opened, ['inventory'], 'Shift+I opens the inventory through routeKey');
    const bare = keyCtx();
    assert.equal(routeKey({ code: 'KeyI', key: 'i' }, bare, null, new Set()), true);
    assert.deepEqual(bare.opened, ['status'], 'and bare I is still the Status box');
    // GetUnaryKey's suppression half, :1681-1685: a DOUBLE-bound combo
    // kills the plain key rather than firing it under the modifier.
    const b = createBindings(); resetDefaults(b);
    setBinding(b, comboCode('ShiftLeft', 'KeyI'), 'Inventory', true);
    setBinding(b, comboCode('ShiftLeft', 'KeyI'), 'Inventory', false);
    setBindings(b);
    const paired = keyCtx();
    assert.equal(routeKey({ code: 'KeyI', key: 'i' }, paired, null, new Set(['ShiftLeft'])), true);
    assert.deepEqual(paired.opened, ['inventory']);
  } finally { setBindings(null); }
});

