// VIEW-TOGGLE (2026-09-28, Mac: "Also add a force first person/third person toggle") - ONE PRESS, THE OTHER VIEW.
//
// Pinned here: the seam (player/mwView.js mwViewTogglePerspective - the EOTB lane flips the mod's own ToggleOffset both
// ways; nothing to show refuses; the travel view's hold refuses it), the Morrowind lane's doors by source, the action
// (a port action on the mouse's forward side button, drawn in the Movement group), and the world host's poll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIONS, PORT_ACTIONS, DEFAULT_BINDINGS, ACTION_GROUPS } from '../../src/systems/inputActions.js';
import { mouseCode } from '../../src/ui/input.js';
import { isBindableKeyCode } from '../../src/systems/keyCodes.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('VIEW-TOGGLE action: a port action, appended, on the mouse\'s forward side button (a binding code since VOICE1, kept when voice was reverted - and never the browser\'s Forward), drawn in Movement; the world host polls its press edge under no window and hands it to the seam before the view frame', () => {
  assert.deepEqual(ACTIONS.slice(-14, -4), ['TogglePerspective', 'ActChoice', 'BoatSailUp', 'BoatSailDown', 'Professions', 'LegacyFamily', 'ModeWheel', 'WeaponTechnique', 'Spyglass', 'SaddlePanel'],   // PIN MOVED (Decorate appended)   // PIN MOVED (PARTY-PING: PartyPing after ShotCycle)   // PIN MOVED (SHOT-KINDS: ShotCycle appended after ShipHold)   // PIN MOVED (CARGO-ANYWHERE: ShipHold appended after)
      // PIN MOVED (UI-CALM)
    'appended - MERGE 2: the professions branch\'s act choice after it, main\'s shipped first; HELM-KEYS\' two after them; CLASSIC-PAGES\' key; LEGACY1\'s family tree; MODE-WHEEL\'s wheel; TECH1\'s technique; SPYGLASS\' glass last (PIN MOVED)');
  assert.ok(PORT_ACTIONS.includes('TogglePerspective'));
  assert.deepEqual(DEFAULT_BINDINGS.filter(([, a]) => a === 'TogglePerspective'), [['Mouse4', 'TogglePerspective']]);
  assert.equal(DEFAULT_BINDINGS.filter(([k]) => k === 'Mouse4').length, 1, 'nothing else on it');
  assert.equal(mouseCode(4), 'Mouse4', 'the forward side button is a binding code');
  assert.ok(isBindableKeyCode('Mouse4'), 'and a key the controls pane can name');
  assert.ok(ACTION_GROUPS.find((g) => g.title === 'Movement').rows.some((r) => r.action === 'TogglePerspective' && r.label === 'First / third person'));
});
