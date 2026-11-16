// GILDED1 - THE GILDED RUNG. The laws pinned, on the gate's Dragonfire Oath
// (test/systems/gilded2_world.test.js pins the records themselves):
//   - THE RUNG: the ladder's top, rank 6 over the Artifact's 5, a colour of its own (GILDED-RED: crimson); NOTHING ROLLS IT.
//   - A STATIC ROLL: one number off, a line short or long, a mark another door lays - the wire refuses it; and no door
//     that alters a piece (the Reforge, the hone, the salvage, the item maker, the exalt, the curse, the heirloom) takes it.
//   - THE LOOK: named as an artifact is, its card's lines and power, its codex row and its first find said.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import * as LR from '../../src/systems/loot/lootRarity.js';
import * as CX from '../../src/systems/loot/lootCodex.js';
import { GILDED, DRAGONFIRE_OATH, DRAGONFIRE, isGilded, mintGilded, validGildedMarks } from '../../src/systems/gilded.js';
import { WEAPON_MATERIALS, WEAPONS } from '../../src/characters/weapons.js';
import { stampedTier } from '../../src/systems/rarityTier.js';
import { validLootItem } from '../../src/systems/loot/loot.js';
import { salvageRefusal, reforgeRefusal, honeRefusal } from '../../src/systems/reforge.js';
import { itemMakerRefuses } from '../../src/systems/enchanting.js';
import { heirloomEligible } from '../../src/systems/legacy/heirloom.js';
import { temperRefusal } from '../../src/net/temperLaw.js';   // CRAFT4's temper, law 7
import { itemLongName } from '../../src/systems/item/itemInfo.js';
import { quickslotKey } from '../../src/systems/quickslots.js';
import { SPOILS_LINE_H } from '../../src/render/spoilsGlow.js';
import { PI_RIM } from '../../src/systems/physicalItems.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { modSaveRecords, restoreModSaveRecords } from '../../src/systems/modSaveData.js';
import { registerPresenter } from '../../src/systems/notify.js';

const on = () => { _resetForTests(); setPref('lootRarity', true); CX._resetCodexForTests(); };
const wire = (it) => validLootItem(JSON.parse(JSON.stringify(it)));

test('GILDED1 THE RUNG: the ladder\'s top - rank 6 over the Artifact\'s 5, gold leaf of its own; the rolled tiers what they were and the roll never lands on it, nor re-rolls a piece that wears it (mutants: the rung under the Artifact; the roll taking it)', () => {
  on();
  assert.equal(GILDED, 'gilded');
  assert.equal(LR.RARITY_ORDER.at(-1), GILDED, 'the last rung');
  assert.deepEqual({ rank: LR.RARITIES.gilded.rank, label: LR.RARITIES.gilded.label, colour: LR.RARITIES.gilded.colour }, { rank: 6, label: 'Gilded', colour: '#ff3b4a' });
  for (const t of LR.RARITY_ORDER.slice(0, -1)) assert.ok(LR.RARITIES[t].rank < LR.RARITIES.gilded.rank, `over ${t}`);
  assert.equal(LR.RARITIES.gilded.tint.length, 4);
  assert.deepEqual([...LR.ROLLED_TIERS], ['magic', 'rare', 'legendary'], 'nothing rolls it');
  const plain = createWeapon(WEAPONS.Dai_Katana, WEAPON_MATERIALS.Daedric);
  const before = JSON.stringify(plain);
  assert.equal(JSON.stringify(LR.applyRarity(plain, GILDED, () => 0)), before, 'asked for the rung, the ladder leaves the piece as it was');
  const h = mintGilded(DRAGONFIRE_OATH);
  assert.equal(LR.rarityEligible(h), false, 'and a piece that wears it is never rolled again (every door asks this first, as SET6\'s)');
  assert.equal(LR.rarityOf(h), GILDED);
  assert.equal(stampedTier(h), true, 'a stamped tier - minted whole, as the Aetheric is');
  assert.equal(isGilded(h), true);
  assert.equal(isGilded(plain), false);
  // the rung's dress, tallest and strongest of them all
  for (const t of LR.RARITY_ORDER.slice(0, -1)) assert.ok(SPOILS_LINE_H.gilded > SPOILS_LINE_H[t], `its line over ${t}'s`);
  for (const t of Object.keys(PI_RIM).filter((k) => k !== 'gilded')) assert.ok(PI_RIM.gilded > PI_RIM[t], `its rim over ${t}'s`);
});


test('GILDED1 A STATIC ROLL: the wire holds it to its record EXACTLY - one number off, a param changed, a line dropped, added or moved, another record, another tier, template or make, any mark another door lays, any enchantment: refused; a piece of no Gilded record passes untouched (mutants: the band let in; a mark let in)', () => {
  on();
  const forge = (f) => { const it = mintGilded(DRAGONFIRE_OATH); f(it); return wire(it); };
  assert.ok(forge(() => {}));
  assert.equal(forge((it) => { it.affixes[0].value = 39; }), null, 'one under');
  assert.equal(forge((it) => { it.affixes[0].value = 41; }), null, 'one over');
  assert.equal(forge((it) => { it.affixes[1].param = 'agility'; }), null, 'a param changed');
  assert.equal(forge((it) => { it.affixes.pop(); }), null, 'a line dropped');
  assert.equal(forge((it) => { it.affixes.push({ id: 'leech', value: 10 }); }), null, 'a line added');
  assert.equal(forge((it) => { it.affixes.reverse(); }), null, 'the lines moved');
  assert.equal(forge((it) => { it.gilded = 'the-dragonfire-oaths'; }), null, 'no such record');
  assert.equal(forge((it) => { it.rarity = 'legendary'; }), null, 'its record on another tier');
  assert.equal(forge((it) => { delete it.gilded; }), null, 'the tier with no record - never a bare word');
  assert.equal(forge((it) => { it.templateIndex = 120; }), null, 'another template');
  assert.equal(forge((it) => { it.material = WEAPON_MATERIALS.Ebony; }), null, 'another make');
  for (const [k, v] of [['sigil', { set: 'numidium', piece: 0 }], ['legendary', 'wyrmbane'], ['aetheric', 'x'], ['imprint', 'nightwhisper'], ['cursed', { type: 1, param: 0 }], ['socket', 'empty'], ['reforged', 0], ['honed', 1], ['exalted', true]]) {
    assert.equal(validGildedMarks({ ...mintGilded(DRAGONFIRE_OATH), [k]: v }), null, `${k}: a mark another door lays`);
  }
  assert.equal(forge((it) => { it.enchantments = [{ type: 0, param: 5 }]; }), null, 'a DFU enchantment');
  assert.equal(forge((it) => { it.customEnchantments = [{ type: 10, param: 1 }]; }), null, 'a made one');
  const plain = createWeapon(120, 1);
  assert.equal(validGildedMarks(plain), plain, 'a piece of no Gilded record passes untouched');
  assert.equal(validGildedMarks(null), null);
});

test('GILDED1 NO DOOR ALTERS IT: the salvage, the Reforge, the hone, the item maker, the exalt, the curse, the heirloom and the crafter\'s temper each refuse a Gilded piece - and the codex\'s imprint is never its (mutants: the salvage; the item maker; the heirloom)', () => {
  on();
  const h = mintGilded(DRAGONFIRE_OATH);
  assert.equal(salvageRefusal(h), 'gilded', 'never broken down');
  assert.equal(itemMakerRefuses(h), true, 'never enchanted');
  assert.equal(itemMakerRefuses(createWeapon(WEAPONS.Dai_Katana, WEAPON_MATERIALS.Daedric)), false, 'a plain blade is the item maker\'s');
  assert.deepEqual(LR.reforgeableLines(h), [], 'no line the Reforge turns');
  assert.equal(reforgeRefusal(h, 0, { items: [] }), 'not');
  assert.deepEqual(LR.honeableLines(h), [], 'no line the hone raises');
  assert.equal(honeRefusal(h, 0, { items: [] }), 'not');
  assert.equal(LR.exaltLegendary(h, () => 0), false, 'never exalted');
  assert.equal(LR.cursePiece(h, () => 0), false, 'never cursed');
  assert.equal(h.cursed, undefined);
  assert.equal(heirloomEligible({ ...h, equipSlot: 1 }), false, 'never an heirloom - it is its record\'s');
  assert.equal(CX.imprintRefusal(h, 'nightwhisper', { items: [] }), 'not', 'the imprint is a Rare\'s');
  assert.equal(temperRefusal({ ...createWeapon(120, 1), rarity: GILDED }), 'rarity', 'CRAFT4\'s temper: law 7 shuts the rung - on any base a smith could temper');
  assert.equal(JSON.stringify(h), JSON.stringify(mintGilded(DRAGONFIRE_OATH)).replace(/"currentCondition":\d+/, `"currentCondition":${h.currentCondition}`), 'and nothing laid on it');
});


test('GILDED1 THE LOOK: named as an artifact is (no metal before it); its card the tier, its lines, its power and its lore; its quickslot key its record\'s; the codex says its first find and keeps it, a save round-trips it and a forged id is dropped (mutants: the metal prefix; the codex blind to it)', () => {
  on();
  const h = mintGilded(DRAGONFIRE_OATH);
  assert.equal(itemLongName(h), 'The Dragonfire Oath');
  assert.deepEqual(LR.rarityLines(h), ['Gilded', ...DRAGONFIRE_OATH.affixes.map((a) => LR.affixLabel(a)), `${DRAGONFIRE.name}: ${DRAGONFIRE.brief}`, DRAGONFIRE_OATH.lore]);
  assert.ok(quickslotKey(h).endsWith('|gthe-dragonfire-oath'), 'its record in its key');
  assert.ok(!quickslotKey(createWeapon(WEAPONS.Dai_Katana, WEAPON_MATERIALS.Daedric)).includes('|g'), 'and nothing new in another piece\'s - a save\'s keys still resolve');
  // the codex
  const lines = [];
  const off = registerPresenter({ priority: 99, hudText: (t) => { lines.push(t); return true; } });
  try {
    assert.deepEqual(CX.codexKey(h), { kind: 'gilded', id: 'the-dragonfire-oath' });
    assert.equal(CX.noteFind(h), true);
    assert.deepEqual(lines, ['The Dragonfire Oath - a Gilded piece! Added to your codex.']);
    assert.equal(CX.noteFind(mintGilded(DRAGONFIRE_OATH)), false, 'once');
    const row = CX.codexGilded()[0];
    assert.deepEqual([row.found, row.name, row.power, row.lore], [true, 'The Dragonfire Oath', DRAGONFIRE, DRAGONFIRE_OATH.lore]);
    assert.deepEqual(CX.codexCount().gilded, 1);
  } finally { off(); }
  const rec = modSaveRecords()[CX.CODEX_SAVE_VENDOR];
  assert.deepEqual(Object.keys(rec.gilded), ['the-dragonfire-oath']);
  CX._resetCodexForTests();
  restoreModSaveRecords({ [CX.CODEX_SAVE_VENDOR]: { legendary: {}, aetheric: {}, gilded: { 'the-dragonfire-oath': 12, 'the-hourlock': 4, 'no-such': 3 } } });
  assert.deepEqual(CX.foundIds('gilded'), ['the-dragonfire-oath'], 'an unknown id dropped - the removed Hourlock\'s among them');
  assert.equal(CX.foundDay('gilded', 'the-dragonfire-oath'), 12);
  restoreModSaveRecords({ [CX.CODEX_SAVE_VENDOR]: { legendary: {}, aetheric: {} } });
  assert.deepEqual(CX.foundIds('gilded'), [], 'a save from before it: none found');
});
