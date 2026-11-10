// FT0 - THE FEATURES HOME.
//
// The registry is the law: a row names a store and a key the store
// really has, wears one or more of three kinds, and the filter shows a
// two-kind row under both. Empty at FT0
// is the work list and rows arrive one audited slice at a time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FEATURES, KINDS, KIND_ORDER, STORES, checkFeature, checkFeatures, filterFeatures, featureCounts, resolveControl,
  MOD_CURATED, modModules, modDials,   // AUDIT FT14: the curation, walked
} from '../../src/systems/features.js';
import '../../src/world/landView.js';   // RF4: the lanes register themselves; the checks read them
import '../../src/world/outdoors.js';
import '../../src/systems/featureLanes.js';   // FT18: the wind, the quick slots and the blood
import { PREF_DEFAULTS } from '../../src/systems/uiPrefs.js';
import { ALL_KEYS } from '../../src/systems/settings/settings.js';
import { MOD_SETTINGS } from '../../src/systems/modSettings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

// Fixtures built over REAL keys of each store, so a pin here fails if
// the store loses the key (the shape-the-producer-mints law).
const prefsRow = { id: 'p', title: 'P', note: 'n', group: 'sight', kinds: ['enhanced'], control: { store: 'prefs', key: 'enhancedAI', initial: false, online: 'room' } };   // RF4: a prefs row declares its switch
const settingsRow = { id: 's', title: 'S', note: 'n', group: 'world', kinds: ['classic'], control: { store: 'settings', key: 'Experimental/SmallerDungeons' } };
const modRow = { id: 'm', title: 'M', note: 'n', group: 'sight', kinds: ['mod'], control: { store: 'mods', vendor: 'dynamic-skies', key: 'Enabled' } };
const bothRow = { id: 'b', title: 'B', note: 'n', group: 'sight', kinds: ['enhanced', 'mod'], control: { store: 'prefs', key: 'enhancedEnvironments', initial: true, online: 'room' } };

test('FT0: three kinds in label order, three stores, and the registry is empty and sound', () => {
  assert.deepEqual(KIND_ORDER, ['enhanced', 'mod', 'classic']);
  assert.deepEqual(KIND_ORDER.map((k) => KINDS[k].label), ['Enhanced', 'Mod Authored', 'DFU Classic'], "Mac's three labels");
  assert.deepEqual(STORES, ['prefs', 'settings', 'mods']);
  assert.deepEqual(FEATURES.map((f) => f.id), ['smaller-dungeons', 'medium-dungeons', 'world-dungeon-sizes', 'horse-care', 'wagon-upkeep', 'land-view-distance', 'enhanced-environments', 'enhanced-ai', 'enhanced-climbing', 'enhanced-water', 'water-quality', 'enhanced-lighting', 'modded-lighting', 'grass', 'cloud-quality', 'ground-sharpness', 'real-windows', 'render-scale', 'enhanced-combat-visuals', 'weapon-glow', 'resource-highlights', 'quick-loot', 'loot-rarity', 'revenants', 'weapon-techniques', 'gate-portent-loot', 'town-seats', 'humanoid-loot', 'repair-price-by-damage', 'cure-keeps-infection', 'claw-metal', 'gentle-equip-bill', 'legendary-equip-free', 'lockpick-tumblers', 'dress-for-the-part', 'guild-probation', 'horse-walks', 'crime-recovery', 'dungeon-fires', 'terrain-slope-cut', 'wind', 'enhanced-sounds', 'first-person-lighting', 'enhanced-map', 'dungeon-map-3d', 'tamriel-map', 'tamriel-land', 'weather-events', 'real-forests', 'bantha-jungle', 'tamriel-lands', 'landforms', 'road-verges', 'climate-blend', 'nearby-quests', 'questlines', 'questline-rewards', 'living-world', 'mod-windmills-kamer', 'mod-seasons-iliac-bay', 'mod-low-poly-trees', 'mod-heat-haze', 'mod-windfall', 'mod-snowfall', 'mod-roads-hazelnut', 'mod-travel-options', 'mod-immersive-travel', 'mod-world-of-daggerfall', 'mod-aquatic-sprites', 'mod-detailed-ships', 'mod-beautiful-villages', 'mod-beautiful-cities', 'mod-warm-ashes-ships', 'mod-world-events-raiding-parties', 'mod-iliac-puddle-no-more', 'mod-ocean-holes', 'mod-come-sail-away', 'mod-foraging', 'mod-daggerfall-enemy-expansion', 'mod-pcaao', 'mod-unleveledloot', 'mod-weapon-widget', 'mod-shield-widget', 'mod-readied-spellcasting-hands', 'mod-diverse-weapons', 'mod-roleplay-realism-items', 'mod-roleplay-realism', 'mod-handheld-torches', 'mod-eye-of-the-beholder', 'mod-immersive-footsteps', 'mod-world-tooltips', 'mod-better-ambience', 'mod-horse-cart-and-cargo', 'mod-physical-items', 'mod-weapon-sheathing', 'steel-helm', 'beast-footwear', 'beast-helmets', 'mw-spell-effects', 'mw-body-motion', 'mw-shoulder-camera', 'mw-npc-bodies', 'npc-marks', 'mw-billboard-look', 'mw-model-detail', 'mod-character-modes', 'mod-project-legacy', 'enemy-infighting', 'varied-dungeon-monsters', 'torches-from-items', 'combat-voices', 'calm-hud', 'near-death-warning', 'bows-left-hand', 'choose-guild-jobs', 'dungeon-wall-style', 'quick-slots', 'loading-screen', 'event-board', 'quest-herald', 'quest-tracker', 'quest-marks', 'quest-guidance', 'dungeon-sense', 'dungeon-echoes', 'dungeon-way-out', 'wilderness-camps', 'road-encounters', 'town-watch', 'blood', 'mod-climates-calories', 'naval-combat'], 'FT0 shipped the home empty; FT1, FT2, FT4-FT11 moved rows in (one slice at a time); LR1 added the first row built in house; WIND3 three more; WEATHER2b the weather field; WM3 gave Windmills the switch it had never had; EOTB0 Eye Of The Beholder; IF1 Immersive Footsteps; BA1 Better Ambience; EL1 Enhanced Lighting; WS1 Weapon Sheathing; TO1 Travel Options; MAC-I first-person lighting; MAP-TOGGLE the enhanced map; SURV2 the survival arc; SW1 Shield Widget; GRAIN2 ground sharpness; GRASS-PX the grass style; WORLD-HOVER World Tooltips; QUICK-LOOT the plaque that takes; DW1 Diverse Weapons; RRI1 Roleplay & Realism: Items; RR1 Roleplay & Realism; HB1 the quickbar-or-hotbar switch; DISC19-F the town watch; FORAGE1 Foraging; IIL1-T modded lighting; FT18 condensed ten rows into four - grass (density and style), wind (sway and wisps), quick slots (the diamond and the bar) and blood (marks, overkill, lens and gore); NAV the naval combat; CLIMB1 the enhanced climb; FOREST1 real forests; WD3 Beautiful Villages and Beautiful Cities; FLICKER-FIX steady shadows, a part of the enhanced-lighting row; IT1 Immersive Travel; FIELD BUGS 2026-10-04e encounters and hunting on the road; LPT1 Low Poly Trees; LOAD1 the loading screen; LW2 the living world; LEGACY1 Project Legacy; THE DELVE ARC medium dungeons, the quest guidance tiers, the look round, the lever echoes and the way out; SD-ONLINE the world\'s dungeon sizes; MW-STEEL1 the Steel Helm, beside Weapon Sheathing; LANDFORM1 the landforms, beside real forests; VERGE1 clear roadsides and ECOTONE1 blended climates, beside real forests; PI1 Physical Items, beside Horse Cart and Cargo; MW-SPELLFX1 the Morrowind Spell Effects, beside the Steel Helm; MWNPC5b the Morrowind People, beside them; HAZE1 Heat Haze and WINDFALL1 Windfall, beside Low Poly Trees; SNOWFALL1 Snowfall, beside Windfall; TAMRIEL1 the continent on the map, beside the 3D dungeon map; TAMRIEL2 the land beyond the Bay, beside it; RW1 the real windows, beside ground sharpness; STEED1 horse care and WAGONS4 wagon upkeep, beside the dungeon sizes; KG3 The King\'s Gambit, beside the Windmills; BODY-CARD the Billboard Look, beside the Morrowind People; UI-CALM the calm HUD, beside the near-death warning; WEAPON-GLOW1 the weapon glow, beside the enhanced combat visuals; BODY-MOTION the Morrowind Body Motion, beside the Morrowind Spell Effects; BANTHA1 the Jungle of Bantha, beside real forests; NPC-MARKS the Morrowind People Marks, beside the Morrowind People; MW-DETAIL the Morrowind Model Detail, beside the Billboard Look; MW-SHOULDER the Over the Shoulder camera, beside the Morrowind Body Motion; RESOURCE-HIGHLIGHTS the resource highlights, beside the weapon glow');
  assert.deepEqual(checkFeatures(FEATURES), []);
});

test('FT0: a sound row passes for each store, and the fixtures ride real keys', () => {
  assert.ok(Object.hasOwn(PREF_DEFAULTS, 'enhancedAI') && Object.hasOwn(PREF_DEFAULTS, 'enhancedEnvironments'), 'RF4: the shelf derives them from the rows');
  assert.equal(typeof resolveControl, 'function');
  assert.ok(ALL_KEYS.includes('Experimental/SmallerDungeons'));
  assert.ok(MOD_SETTINGS['dynamic-skies'].keys.Enabled);
  for (const f of [prefsRow, settingsRow, modRow, bothRow]) assert.deepEqual(checkFeature(f), [], f.id);
  assert.deepEqual(checkFeatures([prefsRow, settingsRow, modRow, bothRow]), []);
});

test('FT0: every law of the row fails under a one-field mutation', () => {
  const mut = (f, patch) => checkFeature({ ...f, ...patch });
  assert.deepEqual(mut(prefsRow, { id: '' }), ['no id']);
  assert.deepEqual(mut(prefsRow, { title: '' }), ['no title']);
  assert.deepEqual(mut(prefsRow, { kinds: [] }), ['no kinds']);
  assert.deepEqual(mut(prefsRow, { kinds: ['vendored'] }), ["unknown kind 'vendored'"]);
  assert.deepEqual(mut(prefsRow, { kinds: ['enhanced', 'enhanced'] }), ['a kind repeated']);
  assert.deepEqual(mut(prefsRow, { control: null }), ['no control']);
  assert.deepEqual(mut(prefsRow, { control: { store: 'ini', key: 'enhancedAI' } }), ["unknown store 'ini'"]);
  // RF4: a prefs row IS the shelf's declaration of its key, so a typo is a new key - what a row cannot do is stay silent on its default or its online answer
  assert.deepEqual(mut(prefsRow, { control: { store: 'prefs', key: 'enhancedAI', online: 'room' } }), ['a prefs row declares its initial value']);
  assert.deepEqual(mut(prefsRow, { control: { store: 'prefs', key: 'enhancedAI', initial: false } }), ["a prefs row declares its online answer: 'room' (pinned in the server profile) or 'player'"]);
  assert.deepEqual(mut(prefsRow, { control: { store: 'prefs', key: 'enhancedAI', initial: false, online: 'maybe' } }), ["a prefs row declares its online answer: 'room' (pinned in the server profile) or 'player'"]);
  assert.deepEqual(mut(prefsRow, { control: { store: 'prefs', key: 'enhancedAI', initial: false, online: 'player', lane: 'nope' } }), ["lane 'nope' is not registered"]);
  assert.deepEqual(mut(prefsRow, { control: { store: 'prefs', key: '' } }), ["prefs has no key ''"], 'an empty key is no key');
  assert.deepEqual(mut(settingsRow, { control: { store: 'settings', key: 'Experimental/SmallerDungeon' } }), ["settings has no key 'Experimental/SmallerDungeon'"]);
  assert.deepEqual(mut(modRow, { control: { store: 'mods', vendor: 'dynamic-sky', key: 'Enabled' } }), ["mods has no key 'dynamic-sky/Enabled'"]);
  assert.deepEqual(mut(modRow, { control: { store: 'mods', vendor: 'dynamic-skies', key: 'Enable' } }), ["mods has no key 'dynamic-skies/Enable'"]);
  // a choice row's tiers must include the pref's default, or the row opens on a value it cannot name
  const tiers = [[3, 'Classic'], [5, 'Far']];
  assert.deepEqual(mut(prefsRow, { control: { store: 'prefs', key: 'landViewDistance', initial: 5, online: 'player', tiers } }), []);
  assert.deepEqual(mut(prefsRow, { control: { store: 'prefs', key: 'landViewDistance', initial: 5, online: 'player', tiers: [[3, 'Classic'], [6, 'Farther']] } }), ['tiers do not include the default 5']);
  assert.deepEqual(mut(prefsRow, { control: { store: 'prefs', key: 'landViewDistance', initial: 5, online: 'player', tiers: [] } }), ['tiers is not a list']);
  assert.deepEqual(checkFeature(null), ['not an object']);
});

test('FT0: the list refuses a repeated id and two rows over one switch', () => {
  assert.deepEqual(checkFeatures([prefsRow, { ...settingsRow, id: 'p' }]), ['p: id repeated']);
  assert.deepEqual(checkFeatures([prefsRow, { ...prefsRow, id: 'p2' }]), ['p2: control repeated (prefs::enhancedAI)']);
  assert.deepEqual(checkFeatures([modRow, { ...modRow, id: 'm2' }]), ['m2: control repeated (mods:dynamic-skies:Enabled)']);
  assert.deepEqual(checkFeatures([settingsRow, { ...prefsRow, control: { ...prefsRow.control, also: [settingsRow.control] } }]), ['p: control repeated (settings::Experimental/SmallerDungeons)'], 'FT2: a covered control is a control - two rows cannot both own a key');
  assert.deepEqual(checkFeatures([{ id: 'x', title: 'X', group: 'sight', kinds: ['nope'], control: { store: 'prefs', key: 'zzz' } }]),
    ["x: unknown kind 'nope'", 'x: a prefs row declares its initial value', "x: a prefs row declares its online answer: 'room' (pinned in the server profile) or 'player'"], 'every problem, prefixed by the row');
});

test('FT0: the filter shows a two-kind row under both kinds, and the counts say so', () => {
  const list = [prefsRow, settingsRow, modRow, bothRow];
  assert.deepEqual(filterFeatures(list, null).map((f) => f.id), ['p', 's', 'm', 'b'], 'All');
  assert.deepEqual(filterFeatures(list, 'enhanced').map((f) => f.id), ['p', 'b']);
  assert.deepEqual(filterFeatures(list, 'mod').map((f) => f.id), ['m', 'b'], "Mac's condensed row wears both labels");
  assert.deepEqual(filterFeatures(list, 'classic').map((f) => f.id), ['s']);
  assert.notEqual(filterFeatures(list, null), list, 'a copy, never the frozen list itself');
  assert.deepEqual(featureCounts(list), { all: 4, enhanced: 2, mod: 2, classic: 1 });
  assert.deepEqual(featureCounts([]), { all: 0, enhanced: 0, mod: 0, classic: 0 });
});

test('FT0: every feature is reachable from every rail - ORG2: through Settings, whose tabs hold its rows - and the screen is the registry over the three builders', () => {
  const menu = read('src/ui/enhanced/enhancedMenu.js');
  for (const rail of ['SECTIONS_BOOT', 'SECTIONS_CLASSIC', 'SECTIONS_PAUSE']) {
    const m = new RegExp(`const ${rail} = \\[([^\\]]*)\\]`).exec(menu);
    assert.ok(m, rail);
    const list = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    assert.ok(list.includes('Settings'), `${rail} carries Settings, the door every feature stands behind`);
    // ORG2: Features is no door of its
    // own - one screen for every option; FT14: and no Mods door either, its mods being rows
    assert.ok(!list.includes('Features'), `${rail}: no Features door - ORG2 folded it into Settings`);
    assert.ok(!list.includes('Mods'), `${rail}: no Mods door - FT14 folded it into Features`);
  }
  assert.doesNotMatch(menu, /\['features', 'Features'\],/, 'nor in the pause system rail (SYSTEM_PANES)');
  assert.doesNotMatch(menu, /features: paneFeatures,|function paneFeatures\(/, 'no pane, no dispatch');
  assert.match(menu, /if \(id === 'features'\) id = 'settings';/, 'a door still named features (a probe, an old link) lands on Settings');
  assert.match(menu, /import \{ FEATURES, KINDS, KIND_ORDER, featureForControl, resolveControl, modModules, modDials, featureSearchText \} from '\.\.\/\.\.\/systems\/features\.js';/);
  // the Features home's three kinds are filters over every tab now, after All and Changed
  assert.match(menu, /const OPT_FILTERS = Object\.freeze\(\[\['all', 'All'\], \['changed', 'Changed'\], \['enhanced', 'Enhanced'\], \['mod', 'Mods'\], \['classic', 'Daggerfall Unity'\]\]\);/);
  for (const k of KIND_ORDER) assert.match(menu, new RegExp(`\\['${k}', '`), `the ${k} filter`);
  assert.match(menu, /if \(item\.startsWith\('feat:'\)\) return FEATURES\.find\(\(f\) => f\.id === item\.slice\(5\)\)\?\.kinds \?\? \[\];/, 'a row answers the filter for its own kinds');
  assert.match(menu, /if \(!sections\.length\) body\.append\(empty\(/, 'a tab the filter empties says so - the rail-hole law - rather than drawing nothing');
  // the three builders: a row is the row its store already draws, dressed
  assert.match(menu, /function featureRow\(f\) \{[\s\S]*?c\.tiers \? choiceRow\(c\.key, f\.title, f\.note, c\.tiers, \{ home: true, read: c\.read, write: c\.write \}\) : prefRow\(c\.key, f\.title, f\.note, \{ home: true \}\)[\s\S]*?settingRow\(c\.key, \{ compact: true, home: true \}\)[\s\S]*?modRow\(c\.vendor, c\.key, /);
  assert.match(menu, /main\.prepend\(kindTags\(f\.kinds\)\);/, 'every row wears its labels');
  assert.match(menu, /function kindTags\(kinds\) \{[\s\S]*?for \(const k of KIND_ORDER\) if \(kinds\.includes\(k\)\)/, 'labels in KIND_ORDER, whatever order the row lists them');
  // modRow survives its pane: the tile's DRAWER draws through it, so a curated mod key is not a second copy
  assert.match(menu, /^function modRow\(vendor, key, def, \{ name = null, note = null, home = false \} = \{\}\) \{/m);
  assert.match(menu, /for \(const key of dials\) d\.append\(modRow\(vendor, key, MOD_SETTINGS\[vendor\]\.keys\[key\], \{ home: true \}\)\);/,
    'FT14: the drawer draws the mod\'s curated dials with the row the pane used');
  assert.match(menu, /let optFilter = 'all';/, 'the filter is per-mount state like the rest');
});

// ── FT14 ──────────────────────────────────────────────
test('FT14: the panel is tiles grouped by what they change, the control is always a BAR, and the Mods pane is gone', async () => {
  const { whereIs } = await import('../../src/ui/settings/settingsMap.js');
  const menu = read('src/ui/enhanced/enhancedMenu.js');

  // (1) THE MODS PANE IS GONE - not hidden behind a flag, gone from the file
  assert.doesNotMatch(menu, /function paneMods\b/, 'the pane itself');
  assert.doesNotMatch(menu, /\bmods: paneMods\b/, 'and from both dispatch tables');
  // what it carried that was never a mod setting has a home - ORG2: the Mods & files tab, the Morrowind assets card at
  // the head of its first section (MWA4), the packs after it, DFU's own mod switches as rows of their own
  const files = whereIs('card:morrowind');
  assert.equal(files?.tab.id, 'mods');
  assert.deepEqual(files.section.items, ['card:morrowind', 'card:packs'], 'MWA4: the Morrowind assets card heads the files, the packs door after it - PIN MOVED (TESA12): the Arena card gone with Arena');
  assert.equal(whereIs('Enhancements/LypyL_ModSystem')?.tab.id, 'mods', 'the packs door and DFU\'s own mod switches survive the pane');
  assert.equal(menu.match(/morrowindCard\(\)/g)?.length, 1, 'and the card is drawn once, by the map');

  // (2) GROUPED BY WHAT THEY CHANGE, filtered by who wrote them - ORG2: by the tab and section the map gives each row
  for (const f of FEATURES) assert.ok(whereIs(`feat:${f.id}`), `${f.id} stands on a tab`);
  assert.match(menu, /const nodes = s\.items\.flatMap\(\(item\) => itemNodes\(item, \{ \.\.\.ctx, fold \}\)\);/, 'a section draws its items in the map\'s order');
  assert.match(menu, /if \(item\.startsWith\('feat:'\)\) \{\s*\n\s*const f = FEATURES\.find\(\(x\) => x\.id === item\.slice\(5\)\);\s*\n\s*return f \? \[mark\(featureTile\(f\)\)\] : \[\];/, 'and a Features row as its tile');

  // (3) THE CONTROL IS A BAR, for every store, and Off is its first segment
  assert.match(menu, /function tileStates\(f\) \{/, 'one adapter answers the states, whatever store the row lives in');
  for (const [store, why] of [["c\\.store === 'prefs'", 'the port\'s own shelf'], ["c\\.store === 'settings'", 'DFU\'s ini']]) {
    assert.ok(new RegExp(store).test(menu), `tileStates answers for ${why}`);
  }
  assert.match(menu, /return \{ labels: \['Off', 'On'\], shown: toggleWords\(\), at: getPref\(c\.key\) \? 1 : 0, locked,/, 'a two-state pref is a two-segment bar');
  assert.match(menu, /labels: c\.tiers\.map\(\(\[, l\]\) => l\)/, 'and a tiered one is its tiers, in order');
  assert.match(menu, /const vals = ENUM_LAW\[c\.key\]\.values;/, 'a DFU enum is its own values');
  assert.match(menu, /function segBar\(st, label\) \{/, 'one bar builder for all of them');
  // the row's own builder is the fallback, so a control the bar cannot express is not silently dropped
  assert.match(menu, /if \(st\) ctl\.append\(segBar\(st, f\.title\)\);\s*\n\s*else ctl\.append\(featureRow\(f\)\);/,
    'a store that cannot answer in segments falls back to its own row rather than vanishing');

  // (4) OL1 SURVIVES THE REDESIGN: a forced switch still reads forced and refuses the press
  assert.match(menu, /locked: onlineForcedModSetting\(c\.vendor, c\.key\) !== undefined/, 'a mod\'s Enabled, online');
  assert.match(menu, /if \(st\.locked\) \{\s*\n\s*b\.disabled = true;/, 'and the bar will not take the press');

  // (5) THE HELP PANE carries the words the rows no longer do: ORG2 - a press on a row's name picks it, and the help pane
  // reads the picked row (its card), or the tab's card with none
  assert.match(menu, /main\.onclick = \(\) => \{ pickedFeature = f\.id; pickedKey = null; sheetOpen = true; render\(\); \};/);
  assert.match(menu, /detail\.append\(confirming \? confirmCard\(\) : \(pickedKey \? helpCard\(pickedKey\) : f \? featureCard\(f\) : categoryCard\(\{ pool, pause \}\)\)\);/);

  // (6) the drawer's shape: modules derived, dials curated - and the vendor is the row's OWN
  // or the one it COVERS. AUDIT FT14: reading `c.vendor` alone left Dynamic Skies' five particle
  // keys with no tile to open, because Enhanced environments IS its switch (FT4's three-way, via
  // `also`) and does not live in the mods store. `also` already declared the cover.
  assert.match(menu, /const vendor = c\.store === 'mods' \? c\.vendor\s*\n\s*: \(Array\.isArray\(c\.also\) \? c\.also\.find\(\(a\) => a\.store === 'mods'\)\?\.vendor : null\) \?\? null;/);
  assert.match(menu, /const mods = modModules\(vendor\);\s*\n\s*const dials = modDials\(vendor\);/);

  // (7) the classes are NAMESPACED. `.tile` and `.seg` were already the inventory icon and a
  // progress strip; the first cut collided with both and the grid collapsed into a column.
  const css = read('src/ui/enhanced/enhancedStyle.js');
  for (const c of ['ft-tile', 'ft-tile-ctl', 'ft-seg', 'ft-segb', 'ft-card', 'ft-mchip']) {
    assert.ok(css.includes(`.${c} `) || css.includes(`.${c}[`) || css.includes(`.${c}{`) || css.includes(`.${c} {`), `.${c} is styled`);
  }
  assert.match(css, /\.pack-shell \.itemrow \.tile \{/, 'and the inventory tile it must not collide with is still its own thing');
});

// AUDIT FT14: EVERY VENDORED MOD IS STILL REACHABLE.
//
// Curating is hiding keys on purpose; losing a MOD is not. The audit found one: Dynamic Skies
// has no row of its own - Enhanced environments is its switch through FT4's three-way - so once
// the Mods pane was gone its five particle keys had nowhere to live. This walks the vendors
// rather than trusting the table, so the next mod folded into a condensed row cannot go quiet.
test('AUDIT FT14: every vendored mod reaches a tile, and the curation hides keys rather than mods', () => {
  const vendors = Object.keys(MOD_SETTINGS);
  const covered = new Map();   // vendor -> the row that carries it
  for (const f of FEATURES) {
    const c = resolveControl(f);
    for (const k of [c, ...(Array.isArray(c.also) ? c.also : [])]) {
      if (k.store === 'mods' && k.key === 'Enabled') covered.set(k.vendor, f.id);
    }
  }
  for (const v of vendors) assert.ok(covered.has(v), `${v} has a row that carries its switch`);

  // and every mod with keys beyond Enabled shows at least one of them somewhere
  for (const v of vendors) {
    const extra = Object.keys(MOD_SETTINGS[v].keys).filter((k) => k !== 'Enabled');
    if (!extra.length) continue;
    const shown = modModules(v).length + modDials(v).length;
    assert.ok(shown > 0, `${v} carries ${extra.length} keys past Enabled and shows none - curation must hide keys, not mods`);
  }

  // the curated names are real keys, always - a typo is a silent missing row otherwise
  for (const [v, list] of Object.entries(MOD_CURATED)) {
    for (const k of list) assert.ok(MOD_SETTINGS[v]?.keys?.[k] !== undefined, `${v}/${k} is a key the mod ships`);
  }
});

test('FT0: the three kinds have three colours, all the skin\'s own tokens', () => {
  const css = read('src/ui/enhanced/enhancedStyle.js');
  for (const [k, tok] of [['enhanced', '--brass'], ['mod', '--verdigris'], ['classic', '--bone']]) {
    assert.match(css, new RegExp(`\\.kind\\.${k} \\{ color: var\\(${tok}\\);`), `${k} wears ${tok}`);
    assert.match(css, new RegExp(`\\.chip\\.${k}\\.on \\{ color: var\\(${tok}\\);`), `${k}'s chip lights the same colour`);
  }
  assert.match(css, /\.chips \{ display: flex; flex-wrap: wrap;/, 'the chip row wraps on a phone');
  assert.match(css, /\.kinds \{ display: flex; flex-wrap: wrap;/, 'so do the labels');
});

// FT15: A NOTE IS A SENTENCE OR TWO, AND STAYS THAT WAY.
//
// The 28 notes carried 10,292 characters when Mac complained - a median of 317 and a
// worst case of 917, which the FT14 reading rail drew as 619px of prose for one tile.
// The trim took them to 6,353 / 218 / 429. The per-note limit below is what keeps it
// there: a note that grows past it is the wall growing back, and the place to put the
// long version is the system's own bible page, not the panel.
//
// There is no ceiling on the panel's total. Every new row raised it by its own size, so
// it never held the panel back, and two branches that each added words failed it
// together with nothing wrong in either (#93 and #83, 2026-11-04).
//
// The bounds are deliberately loose - this is a guard against DRIFT, not a style rule,
// and a row that legitimately needs 400 characters (Enhanced AI names three unshipped
// slices AND a name collision) must not have to fight it.
test('FT15: every note is one or two sentences, and none runs past its limit', () => {
  const MAX_ROW = 450;
  for (const f of FEATURES) {
    assert.ok(typeof f.note === 'string' && f.note.length > 0, `${f.id} has a note`);
    assert.ok(f.note.length <= MAX_ROW,
      `${f.id}'s note is ${f.note.length} chars (max ${MAX_ROW}) - say it shorter, or say the rest in the bible`);
    // no note repeats its own title back at the reader: the tile already says it
    assert.ok(!f.note.startsWith(f.title), `${f.id}'s note opens by restating its title`);
  }

  // and the seven mod rows are STILL the mod's own description - FT15 trimmed the
  // description itself rather than adding a short-note override, so there is no
  // second copy to drift (test/systems/ft9_mods.test.js holds the equality; this holds the why)
  const src = readFileSync('src/systems/features.js', 'utf8');
  assert.match(src, /get note\(\) \{ return mod\.keys\.Enabled\.description; \},/, 'modFeature takes no note of its own');
});

// FT16: THE SHELL PASS FT14 NEVER WROTE.
//
// Every component family on this screen has TWO paints: the base tokens, and a
// `.shell` override for PX11, where the boot door stands on the live sky and every
// painted panel colour comes off (`.shell .pane`, `.shell .list`, `.shell .row` are
// transparent grounds, low-alpha scrims and 2px rules in the brass line). FT14 wrote
// the first and stopped, so the tiles drew solid --slate boxes with hairline borders
// over a screen that was see-through everywhere else - which is the whole report.
//
// The pause window is deliberately OUT of scope: `.px-win` panels are opaque because
// there is a game behind them, so the base paint is already right there. A fix written
// into the tokens instead of under `.shell` would have taken that with it, which is
// why this pin holds the SCOPE as well as the rules.
test('FT16: the feature tiles take the shell\'s transparent paint, and only under the shell', () => {
  const css = readFileSync('src/ui/enhanced/enhancedStyle.js', 'utf8');
  // ORG2: a tile is a ROW of the one Settings screen now, and stands on the list as a row does - no ground of its own in
  // either paint: the list's opaque --slate in the pause window, the list's scrim where the sky is behind it
  const base = css.slice(css.indexOf('\n.ft-tile {'), css.indexOf('}', css.indexOf('\n.ft-tile {')));
  assert.ok(base.length > 0 && !/background:/.test(base), 'the tile takes the list\'s ground, as a row does');
  assert.match(css, /\n\.list \{ background: var\(--slate\); overflow: auto; \}/, 'the list is opaque in the pause window');
  assert.match(css, /\n\.shell \.list \{ background: rgba\(10,12,17,0\.38\); \}/, 'and a scrim on the shell, as .shell .detail is');
  // ORG2: but on a phone the help pane is a SHEET over the rows, and a see-through sheet let them read through its words
  const phone = css.slice(css.lastIndexOf('@media (max-width: 860px) {\n  .ft-tile {'));
  assert.match(phone.slice(0, phone.indexOf('\n}\n')), /\.shell \.detail \{ background: rgb\(10,12,17\); border-left: 0; \}/, 'the phone\'s sheet is opaque');
  // and every 1px iron rule becomes the shell's own 2px brass line.
  //
  // AUDIT FT16 F5: this sliced a fixed 200 characters from the
  // selector, and a CSS rule is not 200 characters long - so deleting
  // one rule's border just slid the window onto the NEXT rule's, and
  // `.shell .ft-seg` losing its border passed because `.shell .ft-mchip`
  // still had one. That is this repo's own documented failure (a pin
  // matching an identical line in the wrong branch), committed again.
  // The slice ends at the rule's own closing brace now.
  for (const sel of ['.shell .ft-tile ', '.shell .ft-seg ', '.shell .ft-mchip ', '.shell .opt-search ', '.shell .opt-tools ', '.shell .sec-head ']) {
    const at = css.indexOf(sel);
    assert.ok(at > 0, `${sel} has a shell rule`);
    const end = css.indexOf('}', at);
    assert.ok(end > at, `${sel}'s rule is closed`);
    assert.match(css.slice(at, end), /border(-bottom)?: 2px solid rgba\(125,116,96/, `${sel} takes the 2px brass line`);
  }
  // THE SCOPE: the transparency is the shell's alone - the pause window's list keeps its opaque ground
  assert.equal(/\n\.list \{[^}]*background: (none|transparent)/.test(css), false,
    'the transparency must be scoped to .shell, not written into the base');
  // AUDIT FT16 F4: and the TOKEN ROUTE, which the comment above claimed
  // this pin held and it did not. `.ft-tile` takes its ground from
  // var(--slate); emptying that token makes the tiles see-through
  // INSIDE .px-win too - and takes nine other surfaces with it - while
  // both assertions above still pass, because they only read the
  // literal text `background: var(--slate)`. Driven and confirmed
  // survived before this line existed. So the token's VALUE is read.
  const slate = /--slate:\s*([^;]+);/.exec(css)?.[1]?.trim();
  assert.ok(slate, 'the skin declares --slate');
  assert.match(slate, /^#[0-9a-f]{6}$/i,
    '--slate is an OPAQUE colour: the base tile leans on it, and a transparent token would strip the pause window too');
});

// FT16: and the tile's controls join the 44px law. FT14 replaced the list's one
// cycling `.ctl .act` - which the coarse-pointer block already sized - with a
// segmented bar, chips and a drawer door, and none of them inherited it. The
// outdoors switch measured 20px on a phone. tools/enhancedMenuProbe.mjs, which
// measures it in a real browser, had been red since FT14 and so nobody saw it.
test('FT16: every control on a tile is a thumb\'s target where there is a thumb', () => {
  const css = readFileSync('src/ui/enhanced/enhancedStyle.js', 'utf8');
  const at = css.indexOf('@media (pointer: coarse) {\n  .step { width: 44px; height: 44px; }');
  assert.ok(at > 0, 'the coarse-pointer law is where it was');
  const law = css.slice(at, css.indexOf('\n}', at));
  for (const sel of ['.ft-segb', '.ft-mchip', '.ft-tile-more', '.opt-search', '.opt-filters .chip', '.sec-jumpbtn']) {
    assert.ok(law.includes(sel), `${sel} is sized by the law, not by its own component block`);
  }
  assert.match(law, /\.ft-segb, \.ft-mchip, \.ft-tile-more, \.opt-search, \.opt-filters \.chip, \.sec-jumpbtn \{ min-height: 44px; \}/, 'FT18: the search field is a thumb\'s target too (ORG2: the filters and the jumps)');
});
