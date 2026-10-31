// PX23 - THE SPELLBOOK'S ONE DOOR, AND THE ENHANCED BOOK.
//
// Mac's call, off the arc's own board: the spellbook next. It was the
// fifth window four hosts built by hand, and the last classic canvas
// window either enhanced screen still pushed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookModel, effectWords } from '../../../src/ui/enhanced/enhancedSpellbook.js';
import {
  spellPointCost, EFFECT_NOT_FOUND,
  CANNOT_DELETE_VAMP, CANNOT_DELETE_WERE,
  VAMPIRE_SPELL_TAG, LYCANTHROPY_SPELL_TAG,
} from '../../../src/ui/spellbookWindow.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('PX23 book: it borrows every law and invents none', () => {
  // The free-cast quirk is the CLASSIC's (spellPointCost), not a second
  // reading of it: a lycanthropy spell costs 0 in both books.
  const spells = [
    { name: 'Free Action', effects: [{ type: 1, subType: 0 }], cost: 12 },
    { name: 'Nightstalker', tag: LYCANTHROPY_SPELL_TAG, effects: [{ type: 1, subType: 0 }], cost: 40 },
    { name: 'Vampiric Touch', tag: VAMPIRE_SPELL_TAG, effects: [], cost: 25 },
  ];
  const rows = bookModel(spells, (sp) => sp.cost);
  assert.deepEqual(rows.map((r) => r.cost), [12, 0, 25]);
  assert.equal(rows[1].cost, spellPointCost(spells[1], (sp) => sp.cost));
  // The two refusals are the classic's own WORDS, imported not retyped.
  assert.equal(rows[0].undeletable, null);
  assert.equal(rows[1].undeletable, CANNOT_DELETE_WERE);
  assert.equal(rows[2].undeletable, CANNOT_DELETE_VAMP);
  // The effects filter drops the empty slots, and an unknown key gets
  // the classic's fallback rather than a blank.
  // PX23b: an entry carries its numbers too - here there are none.
  assert.deepEqual(effectWords({ type: 999, subType: 0 }), { group: EFFECT_NOT_FOUND, subgroup: '999,0', parts: [] });
  assert.equal(effectWords(null), null);
  assert.equal(rows[2].effects.length, 0);
  assert.ok(rows[0].effects[0].group.length > 0);
});

// ── PX23b: THE SAME LOVE (Mac: "revisit the spell UI") ────────────
// The chronicle's two lessons, applied here: an effect carries NUMBERS
// the first draft never read, and the classic can RENAME while the
// first draft could not.
import { effectWords as ew, spellFrame } from '../../../src/ui/enhanced/enhancedSpellbook.js';
import { TARGET_DESCRIPTIONS, ELEMENT_DESCRIPTIONS } from '../../../src/ui/spell/spellIcons.js';

test('PX23b: an effect carries magnitude, duration and chance - and the first draft read none', () => {
  // spellEffects hands back the effect RECORDS; the cast engine
  // resolves a live effect from exactly these eleven fields.
  //
  // SB-FX: THIS PIN MOVED, DELIBERATELY. It asserted '8-20 +2/level' and
  // '6 +1/level rounds' for a Continuous Damage Health record and
  // '40% +2/level' for a chance that effect does not have: it read
  // magnitudeLevelBase (MagnitudePlusMin) as a per-level step, and its
  // literals held ZEROS in the fields no producer zeroes, so "a field
  // that is not 0 is a component" passed here and nowhere in the game
  // (the SB-FX pins below are built from the producers). The law it was
  // written for stands: the record's numbers are read - all eleven, as
  // ClassicEffectRecordToEffectSettings reads them - and a component
  // appears only when the effect HAS it, by the effect's support flags.
  const rec = (type, subType) => ({ type, subType,
    durationBase: 6, durationMod: 1, durationPerLevel: 2, chanceBase: 40, chanceMod: 2, chancePerLevel: 3,
    magnitudeBaseLow: 8, magnitudeBaseHigh: 20, magnitudeLevelBase: 2, magnitudeLevelHigh: 5, magnitudePerLevel: 4 });
  const e = ew(rec(1, 0));   // Continuous Damage Health: duration and magnitude, no chance
  assert.deepEqual(e.parts, ['Duration: 6 + 1 per 2 level(s)', 'Magnitude: 8 - 20 + 2 - 5 per 4 level(s)']);
  assert.deepEqual(ew(rec(0, -1)).parts, ['Duration: 6 + 1 per 2 level(s)', 'Chance: 40 + 2 per 3 level(s)'],
    'Paralyze, its subType the signed byte a record reads: duration and chance, no magnitude');
  assert.deepEqual(ew(rec(26, 255)).parts, ['Duration: 6 + 1 per 2 level(s)'], 'Free Action: duration alone');
  assert.deepEqual(ew(rec(43, 255)).parts, [], 'Teleport supports none - its name alone, whatever its fields hold');
  // A per-level divisor the record leaves at 0 reads as DFU floors it, at 1.
  assert.deepEqual(ew({ ...rec(4, 0), magnitudePerLevel: 0 }).parts, ['Magnitude: 8 - 20 + 2 - 5 per 1 level(s)']);
  // ...and the names still come from the classic's own key lookup.
  assert.ok(e.group.length > 0);
});

test('PX23b: the two icons the classic only shows on HOVER are printed as words', () => {
  // spellbookWindow.js:"this.tip.show(TARGET_DESCRIPTIONS[spell.rangeType] ?? null, vx, vy)"/spellbookWindow.js:"this.tip.show(ELEMENT_DESCRIPTIONS[spell.element] ?? null, vx, vy)" pushes TARGET_DESCRIPTIONS and
  // ELEMENT_DESCRIPTIONS into a tooltip. This window draws no icons -
  // it reads no ARENA2 - so it prints what they mean, which is more
  // than the classic tells you at a glance.
  assert.deepEqual(spellFrame({ rangeType: 4, element: 0 }),
    { target: TARGET_DESCRIPTIONS[4], element: ELEMENT_DESCRIPTIONS[0] });
  // A spell with NO rangeType is not "Caster only" by accident - the
  // absent field reads as absent, so the chip does not appear at all.
  assert.equal(spellFrame({}).target, null, 'no rangeType prints no chip');
  assert.equal(spellFrame({ rangeType: 0 }).target, TARGET_DESCRIPTIONS[0], 'an explicit 0 IS Caster only');
  assert.deepEqual(spellFrame({ rangeType: 99, element: 99 }), { target: null, element: null },
    'an index off the end is nothing, not a blank chip');
});

// ── SB-FX (2026-10-14, a player on Discord: "The spell details panel in the Spellbook shows placeholder values
// instead of what the spell actually does") ─────────────────────────────────────────────────────────────────────────
// Built from the PRODUCER, not a literal: the spell the real SpellMakerWindow inscribes, through its own clicks and
// its own typed spinner field, then saved and restored the way a player's book is.
import { SpellMakerWindow, SPELL_MAKER_RECTS, EDITOR_RECTS } from '../../../src/ui/spell/spellMakerWindow.js';
import { SPELLBOOK_TEMPLATE_INDEX } from '../../../src/systems/spell/spellMaker.js';
import { spellMakerGroups, spellMakerSubgroups, SPELL_MAKER_EFFECTS } from '../../../src/systems/spell/spellEffects.js';
import { snapshotPlayer, restorePlayer } from '../../../src/systems/save/save.js';
import { readSpellsStd } from '../../../src/formats/spellsStd.js';
import { join } from 'node:path';

/** A spell made at the maker, as a player makes one: each effect picked from the two lists, its settings typed into
 *  the editor's fields (the enhanced port's door - ui/enhanced/enhancedPorts.js spellEditorView's `set`), the editor shut, a
 *  target and an element pressed, a name, Buy. Answers the record the book is handed. */
function madeSpell(effects, { target, element, name }) {
  const entity = { name: 'S', level: 1, stats: {}, skills: [50], maxMagicka: 40, goldPieces: 100000,
    items: [{ group: 'MiscItems', templateIndex: SPELLBOOK_TEMPLATE_INDEX }], spells: [] };
  const w = new SpellMakerWindow({ entity });
  const press = ([x, y]) => w.click(x + 1, y + 1);
  for (const [group, subgroup, settings] of effects) {
    press(SPELL_MAKER_RECTS.addEffect);
    w.picker.selectedIndex = spellMakerGroups().indexOf(group);
    w.picker.input('Enter');
    if (subgroup) {
      w.picker.selectedIndex = spellMakerSubgroups(group).findIndex((e) => e.subgroup === subgroup);
      w.picker.input('Enter');
    }
    assert.ok(w.editor, `${group} ${subgroup}: the editor opened`);
    for (const [field, v] of settings) w.editor.setValue(field, v);
    press(EDITOR_RECTS.exit);
    assert.equal(w.editor, null, 'and shut');
  }
  press(SPELL_MAKER_RECTS[target]);
  press(SPELL_MAKER_RECTS[element]);
  w.name = name;
  press(SPELL_MAKER_RECTS.buySpell);
  assert.equal(entity.spells.length, 1, 'the spell was inscribed');
  return { entity, spell: entity.spells[0] };
}

test('SB-FX: the book reads the spell the SPELL MAKER inscribed - its own settings, and only the parts its effects support', () => {
  // The player's spell: By Touch, Shock based, Damage Health - and a Paralyze beside it, for the two components
  // Damage Health does not have. Every value is one the maker's floor of 1 cannot fake.
  const { entity, spell } = madeSpell([
    ['Damage', 'Health', [['magnitudeBaseHigh', 12], ['magnitudeBaseLow', 4], ['magnitudeLevelHigh', 6], ['magnitudeLevelBase', 2],
      ['magnitudePerLevel', 3], ['durationBase', 20], ['chanceBase', 50]]],
    ['Paralyze', null, [['durationBase', 5], ['durationMod', 2], ['durationPerLevel', 3],
      ['chanceBase', 30], ['chanceMod', 4], ['chancePerLevel', 2], ['magnitudeBaseHigh', 9]]],
  ], { target: 'byTouch', element: 'shockBased', name: 'Spark' });
  // THE PRODUCER'S SHAPE, which is why reading a field's value for "has it" can never work: a greyed-out spinner
  // takes no value (DaggerfallEffectSettingsEditorWindow.InitControlState) and keeps the maker's floor of 1
  // (blankEffectSettings - DefaultEffectSettings' "1 + 1 per level"), so Damage Health is inscribed holding a
  // duration and a chance of 1 + 1 per 1 level, and Paralyze a magnitude of 1 - 1 + 1 - 1.
  assert.deepEqual([spell.rangeType, spell.element], [1, 3]);
  const [dmg, para] = spell.effects;
  assert.deepEqual([dmg.type, dmg.subType, dmg.durationBase, dmg.durationMod, dmg.chanceBase, dmg.chanceMod], [4, 0, 1, 1, 1, 1]);
  assert.deepEqual([para.type, para.subType, para.magnitudeBaseLow, para.magnitudeBaseHigh, para.magnitudeLevelBase], [0, 255, 1, 1, 1]);
  // THE BOOK SAYS WHAT THE SPELL DOES. Each part is the component's header row of DFU's own spellbook description
  // (DaggerfallSpellBookWindow.ShowEffectPopup's SpellBookDescription - TEXT.RSC 1212 for Damage Health,
  // 1202 for Paralyze), over the settings ClassicEffectRecordToEffectSettings gives the effect - and a component
  // the effect does not support (SupportDuration / SupportChance / SupportMagnitude) is not printed at all.
  const want = [
    ['Magnitude: 4 - 12 + 2 - 6 per 3 level(s)'],
    ['Duration: 5 + 2 per 3 level(s)', 'Chance: 30 + 4 per 2 level(s)'],
  ];
  const [row] = bookModel(entity.spells, () => 0);
  assert.deepEqual(row.effects.map((e) => [e.group, e.subgroup]), [['Damage', 'Health'], ['Paralyze', '']]);
  assert.deepEqual(row.effects.map((e) => e.parts), want);
  // ...and the book a SAVE brings back says the same: a made spell travels whole (systems/save/save.js snapshotPlayer).
  const back = { name: 'S' };
  restorePlayer(back, JSON.parse(JSON.stringify(snapshotPlayer(entity))), new Map());
  assert.deepEqual(back.spells[0].effects, spell.effects, 'the settings round-trip');
  assert.deepEqual(bookModel(back.spells, () => 0)[0].effects.map((e) => e.parts), want);
});

test('SB-FX: on the real SPELLS.STD every stock effect reads its supported components alone, with the record\'s own numbers', (t) => {
  // The stock records are the book's other producer, and they carry the same 1s: all 99 effect slots in the file
  // hold 1 + 1 per 1 level in a component their effect does not support.
  if (!process.env.ARENA2_PATH) return t.skip('ARENA2_PATH not set');
  const spells = readSpellsStd(new Uint8Array(readFileSync(join(process.env.ARENA2_PATH, 'SPELLS.STD'))));
  const shock = spells.find((s) => s.index === 8);
  assert.equal(shock.name, 'Shock');
  assert.deepEqual(effectWords(shock.effects[0]).parts, ['Magnitude: 1 - 20 + 1 - 4 per 1 level(s)']);
  let n = 0;
  for (const sp of spells) {
    for (const e of sp.effects.filter((x) => x.type >= 0)) {
      const tpl = SPELL_MAKER_EFFECTS.find((x) => x.key === `${e.type},${e.subType & 0xff}`);
      if (!tpl) continue;
      const parts = effectWords(e).parts;
      const has = ['duration', 'chance', 'magnitude'].filter((c) => tpl[c]);
      assert.deepEqual(parts.map((p) => p.split(':')[0].toLowerCase()), has, `${sp.name} ${tpl.key}`);
      n++;
    }
  }
  assert.ok(n > 90, `the whole file was read (${n})`);
});
