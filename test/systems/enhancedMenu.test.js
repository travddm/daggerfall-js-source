// THE ENHANCED FRONT DOOR, pinned.
//
// These are SOURCE SWEEPS and say so. The screen is DOM and the boot
// is a host, neither of which node can drive; the behaviour is proven
// in a real browser by tools/enhancedMenuProbe.mjs, which boots the
// game with no ARENA2 at all. What a sweep CAN hold is the structure
// the browser check would not notice going wrong: a second copy of the
// design, a data gate that drifts back in front of the door, or an
// exit where there should not be one.
import { test } from 'node:test';
import { PREF_DEFAULTS } from '../../src/systems/uiPrefs.js';   // RF4: the shelf derives the switches from the rows
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const exists = (p) => { try { read(p); return true; } catch { return false; } };

// ── ONE IMPLEMENTATION, TWO HOSTS ────────────────────────────────
// The prototype at /menu.html and the game mount the SAME module. A
// prototype carrying its own copy of the design is a prototype arguing
// about a screen the player will never see, and the divergence would
// be invisible until someone opened both at once.
test('the prototype page carries no design of its own', () => {
  const html = read('menu.html');
  assert.ok(!/--brass|--verdigris|\.railbtn|\.subbtn/.test(html),
    'menu.html must not hold tokens or layout - they live in src/ui/enhanced/enhancedStyle.js');
  assert.match(html, /src\/tools\/enhanced\/enhancedMenu\.js/);
});

// ═══ EE1: Enhanced Environments replaces the procedural sky switch ═══
test('EE1: one switch for the whole outdoors, migrated once from the old sky answer', async () => {
  assert.equal(PREF_DEFAULTS.enhancedEnvironments, true, 'the new key defaults ON');
  // AUDIT FT15 (drift): the claim is that the row names the sky the tree
  // actually has - the sun, the moons, the stars - not one wording of it.
  // "both moons" -> "the two moons" is a harmless edit and used to be red.
  const { FEATURES: FEAT } = await import('../../src/systems/features.js');
  const eeNote = FEAT.find((x) => x.id === 'enhanced-environments').note;
  for (const w of [/\bsun\b/, /\bmoons\b/, /\bstar/]) {
    assert.match(eeNote, w, `the row claims what the tree has: ${w} (FT4: the words are the registry's now; FT15 shortened them)`);
  }
  // nothing outside uiPrefs reads the retired key at runtime - src AND tools
  const hits = execSync("grep -rl \"getPref('proceduralSky')\" src/ tools/ || true", { encoding: 'utf8' }).trim();
  assert.equal(hits, '', `still reading the retired pref: ${hits}`);
});

test('EE1: the migration, exercised - stale OFF comes up OFF, an explicit answer is never overwritten', async () => {
  // a throwaway localStorage, so loadPrefs reads what this test wrote
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; },
  };
  const m = await import('../../src/systems/uiPrefs.js');
  const KEY = 'dagger.ui.v1';
  store[KEY] = JSON.stringify({ proceduralSky: false, textScale: 0 });
  m.loadPrefs();
  assert.equal(m.getPref('enhancedEnvironments'), false, 'a player who turned the sky off gets environments off');
  store[KEY] = JSON.stringify({ proceduralSky: false, enhancedEnvironments: true });
  m.loadPrefs();
  assert.equal(m.getPref('enhancedEnvironments'), true, 'an explicit answer beats the old one');
  store[KEY] = JSON.stringify({ textScale: 1 });
  m.loadPrefs();
  assert.equal(m.getPref('enhancedEnvironments'), true, 'no old answer: the default');
  delete globalThis.localStorage;
});

test('A54: and the envelope really does carry it there (E4)', async () => {
  const { snapshotPlayer } = await import('../../src/systems/save/save.js');
  const entity = {
    name: 'Uthar', level: 3, health: 20, maxHealth: 20,
    goldPieces: 1234, items: [{ group: 'Weapons', templateIndex: 113, name: 'Dagger' }],
    stats: {}, skills: [],
  };
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(entity, {})));
  assert.equal(snap.goldPieces, 1234, 'SerializablePlayer.cs:133');
  assert.equal((snap.items ?? []).find((i) => i?.name === 'Gold Pieces'), undefined,
    'no Currency row - which is exactly why the old find() never matched');
  // the reading the card makes, spelled out
  assert.equal(snap.goldPieces ?? null, 1234);
  // ...and a pre-E4 envelope with no field still draws the card
  const old = { ...snap };
  delete old.goldPieces;
  assert.equal(old.goldPieces ?? null, null, 'null, not a bogus 0');
});
