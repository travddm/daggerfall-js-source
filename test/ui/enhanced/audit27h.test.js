// AUDIT 27h (2026-09-28, Mac: "Lets audit before merging"): the 2026-09-27h Discord batch read again on the tree merged
// with main (#412), five lanes - the F5 page's doors, the sea and the shield, the map and the list tile, ending a spell,
// the spell maker's hold and field - every finding checked against the code (and the port's in Chromium) before it
// moved. Recorded in bible/01-Overview/bugs/Field-Bugs-2026-09-27h.md ## AUDIT, with what stands and why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sheetPageDoors } from '../../../src/ui/charSheetDoor.js';
import { pauseMenuAct } from '../../../src/ui/pauseDoor.js';
import { endingGesture } from '../../../src/ui/enhanced/enhancedHud.js';
import { activeSpellIconsPlaced } from '../../../src/ui/hud/hud.js';
import { createShieldWidget, readShieldWidgetSettings, shieldTextureIndex, SHIELD_TEMPLATES } from '../../../src/combat/shieldWidget.js';
import { createWeaponRig } from '../../../src/combat/weapon/weaponRig.js';
import { EQUIP_SLOTS } from '../../../src/systems/equip.js';
import { setModSetting, _resetModSettings } from '../../../src/systems/modSettings.js';
import { enterDungeonAutomap, exitDungeonAutomap, getDungeonAutomap, detachedAutomapRecord, resetAutomapStore } from '../../../src/systems/automap/automap.js';
import { setValue, _resetForTests } from '../../../src/systems/settings/settings.js';
import { SpellMakerWindow, SPELL_MAKER_RECTS, EDITOR_RECTS } from '../../../src/ui/spell/spellMakerWindow.js';
import { spellMakerGroups, spellMakerSubgroups } from '../../../src/systems/spell/spellEffects.js';
import { SPELLBOOK_TEMPLATE_INDEX } from '../../../src/systems/spell/spellMaker.js';
import { PORT_SPECS } from '../../../src/ui/enhanced/enhancedPorts.js';

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

// ── the literal readers (escbook.test.js's, f5quests.test.js's): a bag or a helper out of the LIVE source, run ──────
function literalBody(text, opener) {
  const i = text.indexOf(opener);
  assert.ok(i >= 0, `could not find ${opener}`);
  const open = text.indexOf('{', i + opener.length);
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    const c = text[k];
    if (c === '/' && text[k + 1] === '/') { k = text.indexOf('\n', k); continue; }
    if (c === '/' && text[k + 1] === '*') { k = text.indexOf('*/', k) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      const q = c;
      for (k++; k < text.length; k++) { if (text[k] === '\\') k++; else if (text[k] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(open, k + 1);
  }
  throw new Error(`unbalanced literal after ${opener}`);
}
const STUB = new Proxy(function stub() {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 'STUB' : STUB), apply: () => STUB });
const scopeOf = (env) => new Proxy({ undefined, ...env }, {   // `undefined` is a name too: the catch-all would stub it
  has: () => true,
  get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : STUB)),
});
// eslint-disable-next-line no-new-func
const run = (expr, env) => new Function('__scope', `with (__scope) { return (${expr}); }`)(scopeOf(env));
const mountLiteral = (text, opener, env = {}) => run(literalBody(text, opener), env);
function constOf(text, name, env = {}) {
  const m = new RegExp(`^\\s*const ${name} = (.*);$`, 'm').exec(text);
  assert.ok(m, `could not find const ${name}`);
  return run(m[1], env);
}

// ── A: THE F5 PAGE'S DOORS ─────────────────────────────────────────────────────────────────────────────────────────

test('AUDIT 27h A4: a door that opened nothing RESUMES - the page gone and nothing up is not left with the pointer free', () => {
  // the page's doors hand the arm's answer back
  assert.equal(sheetPageDoors({ openPack: () => false }, () => {}).openPack(), false);
  assert.equal(sheetPageDoors({ openPack: () => true }, () => {}).openPack(), true);
});

// ── S: THE SEA AND THE SHIELD ──────────────────────────────────────────────────────────────────────────────────────

// sw1_shield_widget.test.js's harness (the mod's defaults; Recoil off, so only a re-read repoints the sheet)
const RAW = {
  Enabled: true, 'Shield.OffsetHorizontal': 0.5, 'Shield.OffsetVertical': 0.5, 'Shield.Scale': 1,
  'Shield.Speed': 1, 'Shield.WhenSheathed': 1, 'Shield.WhenAttacking': 1, 'Shield.WhenCasting': 1,
  'Shield.LockAspectRatio': true, 'Shield.ConditionThresholdUpper': 75, 'Shield.ConditionThresholdLower': 25,
  'Modules.Bob': true, 'Modules.Inertia': false, 'Modules.Animation': false, 'Modules.Step': false, 'Modules.Recoil': false,
  'Bob.Length': 100, 'Bob.Offset': 0, 'Bob.SizeX': 1, 'Bob.SizeY': 1, 'Bob.SpeedMove': 1, 'Bob.SpeedState': 1,
  'Bob.Shape': 0, 'Bob.BobWhileIdle': true,
  'Inertia.Scale': 1, 'Inertia.Speed': 1, 'Inertia.ForwardDepth': 1, 'Inertia.ForwardSpeed': 1,
  'Animation.Speed': 1, 'Animation.Direction': 0, 'Step.Length': 1, 'Step.Condition': 0,
  'Recoil.Scale': 1, 'Recoil.Offset': false, 'Recoil.Speed': 1, 'Recoil.Condition': 2,
  'Compatibility.TextureScaleFactor': 1,
};
const shieldWidget = () => createShieldWidget({
  settings: () => readShieldWidgetSettings(() => RAW), textures: { size: () => ({ width: 100, height: 100 }) },
  audio: { playOneShot() {} }, rolls: () => 0.5, handedness: () => false,
});
const shieldAt = (conditionPercentage) => ({ templateIndex: SHIELD_TEMPLATES.Kite, nativeMaterialValue: 513, conditionPercentage, isShield: true });
const shieldFrame = (item) => ({
  dt: 1 / 60, time: 0, screenRect: { x: 0, y: 0, width: 640, height: 400 }, largeHudHeight: 0,
  item, attacking: false, sheathed: false, castingAnim: false, hasReadySpell: false,
  equipCountdownLeftHand: 0, isClimbing: false, isPaused: false, loadInProgress: false, entity: { stats: { speed: 50 } },
  motor: { speed: 0, baseSpeed: 3, isGrounded: true, isCrouching: false, isRiding: false, isStandingStill: true, moveDirectionLocal: [0, 0, 0] },
  look: { x: 0, y: 0, cursorActive: false, swingAction: false },
});

test('AUDIT 27h S3: the Shield Widget switched off and on again re-reads a shield repaired (or battered) while it was off', () => {
  const street = shieldWidget();
  for (let i = 0; i < 5; i++) street.lateUpdate(shieldFrame(shieldAt(20)));
  assert.equal(street.indexCurrent, shieldTextureIndex(shieldAt(20), 75, 25), 'battered');
  for (let i = 0; i < 30; i++) street.offFrame();   // the switch OFF: every rig frame still counts the step (the smith's visit rides here)
  street.lateUpdate(shieldFrame(shieldAt(100)));   // ON again, the first frame
  assert.equal(street.indexCurrent, shieldTextureIndex(shieldAt(100), 75, 25), 'whole, on the first frame back');
});

// sw1_shield_widget.test.js's real rig: the real mod settings, the rig's own frame, the widget that frame steps. S3's
// rig half was a regex over the source, and it matched the placement that failed - SW1's lesson, paid again.
function shieldRig({ otherMod }) {
  _resetModSettings();
  setModSetting('shield-widget', 'Enabled', true);
  setModSetting('weapon-widget', 'Enabled', otherMod);
  setModSetting('handheld-torches', 'Enabled', false);
  const shield = { group: 'Armor', templateIndex: SHIELD_TEMPLATES.Kite, material: 513, currentCondition: 15, maxCondition: 100 };
  const rig = createWeaponRig({
    renderer: { uploadTexture: () => null, drawScreenQuad: () => {} },
    canvas: { width: 1280, height: 800, clientWidth: 1280, clientHeight: 800 },
    fetchBytes: () => { throw new Error('no art in tests'); }, palette: null,
    audio: { playOneShot() {} },
    entity: { items: [], stats: { speed: 50 }, equip: { slots: { [EQUIP_SLOTS.LeftHand]: shield } } },
    camera: () => ({ pos: [0, 0, 0], yaw: 0, pitch: 0, move: { baseSpeed: 3, grounded: true, standing: true } }),
  });
  return { rig, shield, frames: (n) => { for (let i = 0; i < n; i++) rig.frame(1 / 60); } };
}

test('AUDIT 27h S3b: the rig counts a switched-off frame at its gate - the Shield Widget alone, off and on again, re-reads its shield', () => {
  // S3's count was the `else` of the shield's lateUpdate, INSIDE the mods' shared frame block - which a profile with
  // the Shield Widget alone (SW1-FEED's) shuts when the switch goes off: nothing counted, and the widget came back
  // on the sprite it last read. With another mod holding the block open it re-read, which is why S3's pin passed.
  const whole = shieldTextureIndex(shieldAt(100), 75, 25), battered = shieldTextureIndex(shieldAt(15), 75, 25);
  try {
    for (const otherMod of [false, true]) {
      const profile = otherMod ? 'beside the Weapon Widget' : 'the Shield Widget alone';
      const { rig, shield, frames } = shieldRig({ otherMod });
      frames(60);
      assert.equal(rig.shield.indexCurrent, battered, `${profile}: battered to begin with`);
      setModSetting('shield-widget', 'Enabled', false);
      frames(30);
      shield.currentCondition = 100;   // repaired while the switch was off (the smith's visit)
      frames(30);
      setModSetting('shield-widget', 'Enabled', true);
      frames(1);
      assert.equal(rig.shield.indexCurrent, whole, `${profile}: whole, on the first frame back`);
      setModSetting('shield-widget', 'Enabled', false);
      frames(30);
      shield.currentCondition = 15;   // ...and battered while it was off
      frames(30);
      setModSetting('shield-widget', 'Enabled', true);
      frames(1);
      assert.equal(rig.shield.indexCurrent, battered, `${profile}: battered, on the first frame back`);
    }
  } finally { _resetModSettings(); }
});

// ── M: THE COURT'S MAP ─────────────────────────────────────────────────────────────────────────────────────────────

test('AUDIT 27h M1: the Burning Court keeps no map and takes no slot - five remembered dungeons stay five', () => {
  resetAutomapStore(); _resetForTests();
  try {
    setValue('Map', 'AutomapNumberOfDungeons', 5);
    for (let i = 0; i < 5; i++) { enterDungeonAutomap(`3/Dungeon${i}`, 100 * (i + 1)).revealed.add('0:1'); exitDungeonAutomap(100 * (i + 1) + 50); }
    const court = detachedAutomapRecord();   // dungeonContext.js builds the court on this
    court.revealed.add('0:9');
    exitDungeonAutomap(9000);   // and tears it down through the one exit
    for (let i = 0; i < 5; i++) assert.ok(getDungeonAutomap(`3/Dungeon${i}`), `Dungeon${i}'s map is kept`);
    assert.equal(getDungeonAutomap('3/The Burning Court'), null, 'the court is never a record');
    // the fresh arm it used to take: stamped the newest, and the oldest real map pruned against it
    enterDungeonAutomap('3/The Burning Court', 9100);
    assert.equal(getDungeonAutomap('3/Dungeon0'), null, 'what each region\'s court cost');
  } finally { resetAutomapStore(); _resetForTests(); }
});

// ── B: ENDING A SPELL ──────────────────────────────────────────────────────────────────────────────────────────────

const ev = (target, button = 2) => ({
  target, button, stopped: false, prevented: false,
  stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; },
});
const tile = (bundle) => ({ dataset: { bundle: String(bundle) } });

test('AUDIT 27h B1: a tile owns a press and ITS release - a press of the world\'s released over a tile goes on to the host, and ends nothing', () => {
  const ended = [];
  const g = endingGesture((e) => e.target, (b) => ended.push(b));
  const A = tile(7), B = tile(9);
  // the tile's own right press: down and up are the widget's, the menu ends it
  g.forget(); const d1 = ev(A); g.down(d1); const u1 = ev(A); g.up(u1); const m1 = ev(A); g.menu(m1);
  assert.deepEqual([d1.stopped, u1.stopped, m1.prevented, ended], [true, true, true, [7]]);
  // a press begun on the world (a gap, a click-through tile) and let go over an endable tile
  ended.length = 0;
  g.forget(); const u2 = ev(A); g.up(u2); const m2 = ev(A); g.menu(m2);
  assert.equal(u2.stopped, false, 'the release reaches the host - its rightHeld comes down, the look moves again');
  assert.deepEqual([m2.prevented, ended], [true, []], 'no browser menu, and no spell ended');
  // a tile's press let go OFF the widget: the next press anywhere clears it, and inherits nothing
  g.forget(); g.down(ev(A)); g.forget(); const u3 = ev(A); g.up(u3); g.menu(ev(A));
  assert.deepEqual([u3.stopped, ended], [false, []]);
  // pressed on one spell, let go over another: neither ends
  g.forget(); g.down(ev(A)); g.menu(ev(B));
  assert.deepEqual(ended, []);
  // a LEFT press on a tile: its own release is the widget's, and it is no end
  g.forget(); const d5 = ev(A, 0); g.down(d5); const u5 = ev(A, 0); g.up(u5); g.menu(ev(A));
  assert.deepEqual([d5.stopped, u5.stopped, ended], [true, true, []]);
  // the tiles rebuilt mid-press (a blink): the same spell's new tile is the same press
  g.forget(); g.down(ev(tile(7))); g.menu(ev(tile(7)));
  assert.deepEqual(ended, [7]);
  // not ending (the mouse held, a window up, the pad): nothing is taken
  const idle = endingGesture(() => null, (b) => ended.push(b));
  const d7 = ev(A); idle.down(d7); const m7 = ev(A); idle.menu(m7);
  assert.deepEqual([d7.stopped, m7.prevented, ended.length], [false, false, 1]);
});

test('AUDIT 27h B2: the classic icons are where they were last DRAWN - a hidden HUD answers none', () => {
  assert.deepEqual(activeSpellIconsPlaced(), [], 'never drawn, nothing to click');
});

// ── H: THE SPELL MAKER'S HOLD AND FIELD ────────────────────────────────────────────────────────────────────────────

const editorOn = (group, subgroup) => {
  const w = new SpellMakerWindow({ entity: { name: 'S', level: 1, stats: {}, skills: [50], maxMagicka: 40, goldPieces: 100000,
    items: [{ group: 'MiscItems', templateIndex: SPELLBOOK_TEMPLATE_INDEX }], spells: [] } });
  const [x, y] = SPELL_MAKER_RECTS.addEffect;
  w.click(x + 1, y + 1);
  w.picker.selectedIndex = spellMakerGroups().indexOf(group);
  w.picker.input('Enter');
  w.picker.selectedIndex = spellMakerSubgroups(group).findIndex((e) => e.subgroup === subgroup);
  w.picker.input('Enter');
  return w;
};

test('AUDIT 27h H1: a spinner act of an editor since shut presses nothing - its fixed point is the main window\'s now', () => {
  const w = editorOn('Damage', 'Health');
  const spins = PORT_SPECS.spellMaker.view(w).blocks.filter((b) => b.type === 'group').flatMap((g) => g.blocks);
  const hi = spins.find((b) => b.label === 'Base max');
  let clicks = 0;
  const click = w.click.bind(w);
  w.click = (...a) => { clicks += 1; return click(...a); };
  hi.up();
  assert.equal(clicks, 1, 'live, the act clicks the classic spinner');
  const was = w.slots[0].settings.magnitudeBaseHigh;
  const [x, y, cw, ch] = EDITOR_RECTS.exit;
  w.click(x + cw / 2, y + ch / 2);   // Done
  assert.equal(w.editor, null, 'the editor is shut');
  clicks = 0;
  for (const b of spins) { b.down?.(); b.up?.(); b.set?.(50); }
  assert.equal(clicks, 0, 'no stale act reached the classic window (where Buy spell, Add effect and the slots stand now)');
  assert.equal(w.slots[0].settings.magnitudeBaseHigh, was, 'and no stale set wrote the slot');
  assert.equal(w.editor, null);
});

