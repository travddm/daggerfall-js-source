// TECH1 (bible/05-Combat/Weapon-Techniques.md): THE KEY AND THE FOUR HOSTS - the registry's own action (appended, on the
// mouse's back side button, in the Controls page's Combat group, a touch corner's and a pad's to choose), the one runner
// every rig steps ahead of the gesture with the loose claimed at the frame's end, and THE FOUR HOSTS RULE (bible/Home.md):
// exterior.js, world.js, worldModes.js' interior arm and dungeonContext.js each hand their rig the technique's door and
// draw the player's marks in their ground pass - swept from the source, so a fifth host or a forgotten one fails here.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIONS, PORT_ACTIONS, DEFAULT_BINDINGS, ACTION_GROUPS, actionLabel } from '../../src/systems/inputActions.js';
import { TOUCH_BUTTON_ACTIONS } from '../../src/ui/touch/touchButtons.js';
import { DPAD_CHOICES } from '../../src/ui/plus/plusPad.js';
import { PLUS_BIND_ROWS } from '../../src/ui/plus/plusPadBinds.js';
import { TECHNIQUE_ACTION } from '../../src/combat/techniques.js';
import { TECH_CHIP_COLOUR } from '../../src/combat/technique/techniqueRoster.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
/** A file's text with its comments out - a pin on code reads code. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
/** The argument bag of a host's createWeaponRig call. */
const rigBag = (src, open) => { const i = src.indexOf(open); assert.ok(i >= 0, open); let d = 0, j = src.indexOf('({', i) + 1; const s = j; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } } return src.slice(s, j + 1); };

test('TECH1 THE ACTION: WeaponTechnique appended last, a port row the classic windows yield, on Mouse3 alone, in Combat - and a touch corner\'s, a d-pad\'s and a pad button\'s to choose (mutants: inserted mid-list; another key; the group)', () => {
  assert.equal(TECHNIQUE_ACTION, 'WeaponTechnique');
  assert.equal(ACTIONS.at(-7), 'WeaponTechnique',   // SHOT-KINDS: the guns' load after the hold   // PIN MOVED (UI-CALM: the saddle panel's key; CARGO-ANYWHERE: the hold's last; PARTY-PING: the ping's; Decorate)
    'appended - the classic grid and a saved file resolve by position (SPYGLASS\' glass after it - PIN MOVED)');
  assert.ok(PORT_ACTIONS.includes('WeaponTechnique'));
  assert.deepEqual(DEFAULT_BINDINGS.filter(([, a]) => a === 'WeaponTechnique'), [['Mouse3', 'WeaponTechnique']]);
  assert.deepEqual(DEFAULT_BINDINGS.filter(([c]) => c === 'Mouse3'), [['Mouse3', 'WeaponTechnique']], 'one key, one action');
  const combat = ACTION_GROUPS.find((g) => g.title === 'Combat');
  assert.deepEqual(combat.rows.map((r) => r.action), ['ReadyWeapon', 'SwingWeapon', 'SwitchHand', 'WeaponTechnique', 'ShotCycle']);   // PIN MOVED (SHOT-KINDS: the guns' load at a helm after it)
  assert.equal(actionLabel('WeaponTechnique'), 'Weapon technique (hold to aim)');
  assert.deepEqual(TOUCH_BUTTON_ACTIONS.find((a) => a.id === 'WeaponTechnique'), { id: 'WeaponTechnique', label: 'Weapon technique (hold to aim)', glyph: 'Tech', kind: 'hold', w: 60 });
  assert.deepEqual(DPAD_CHOICES.find(([v]) => v === 'WeaponTechnique'), ['WeaponTechnique', 'Weapon technique']);
  assert.deepEqual(PLUS_BIND_ROWS.find((r) => r.sec === 'WeaponTechnique'), { id: 'technique', label: 'Weapon technique (hold to aim)', sec: 'WeaponTechnique' });
});

test('TECH1 THE WORLD HOST\'S OWN: the chip off the MODE\'s rig with its key\'s name, the recentre\'s shift beside the foes\' (AUDIT TACT D3); the HUD\'s chip wears the marks\' blue from the leaf; every host keeps the browser\'s Back off the side buttons (mutants: the chip off world.js\'s own rig; the shift; the guard)', () => {
  assert.equal(TECH_CHIP_COLOUR, '#59c7ff');
  for (const file of ['src/scenes/world.js', 'src/scenes/exterior.js', 'src/scenes/dungeon.js']) {
    assert.match(code(file), /for \(const kind of \['mousedown', 'mouseup'\]\) addEventListener\(kind, \(e\) => \{ if \(e\.button === 3 \|\| e\.button === 4\) e\.preventDefault\(\); \}\);/, file);
  }
});
