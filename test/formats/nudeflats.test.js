// NUDE-FLATS. Show Nudity reached the paperdoll and the adult quests and never the world's people: a Temple
// of Kynareth stands TEXTURE.184 records 11 and 12 ("naked blonde woman", "naked brunette") as its own. The table and
// the setting's door are driven here, every host that draws a person pinned by source (the hosts need a browser to
// import), and under ARENA2_PATH the table is held to FLATS.CFG's own "?" mark and sexes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NUDE_FLAT_STAND_INS, drawnFlat, showNudity } from '../../src/characters/nudeFlats.js';
import { NPC_FLAT_ARCHIVES } from '../../src/world/rdbLayout.js';
import { FlatsFile, flatCensored, flatGender } from '../../src/formats/flatsFile.js';
import { TextureFile } from '../../src/formats/textureFile.js';
import { setValue, resetToDefaults } from '../../src/systems/settings/settings.js';
import { composeWornModest, MODESTY_SHIRT } from '../../src/formats/morrowind/mwItemMap.js';
import { ARMOR_ENUM } from '../../src/combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ARENA2 = process.env.ARENA2_PATH;
const skipReal = !ARENA2 || !existsSync(ARENA2) ? 'ARENA2_PATH not set' : false;
const pairOf = (k) => k.split('_').map(Number);
/** FLATS.CFG's "?" flats that are DRESSED - a halter, a bikini, a corset, blouses - and stay as they are. */
const MARKED_DRESSED = ['176_4', '182_33', '184_8', '184_9', '184_10', '184_28', '184_33'];

test('NUDE-FLATS: the Temple of Kynareth\'s two draw clothed while Show Nudity is off, and as themselves when it is on', () => {
  assert.deepEqual(drawnFlat(184, 11, false), [184, 29], '"naked blonde woman" -> "blonde wearing blue"');
  assert.deepEqual(drawnFlat(184, 12, false), [184, 23], '"naked brunette" -> "woman in green pants"');
  assert.deepEqual(drawnFlat(184, 11, true), [184, 11]);
  assert.deepEqual(drawnFlat(184, 12, true), [184, 12]);
  // a dressed figure, and anything that is not a person, is itself either way
  assert.deepEqual(drawnFlat(184, 29, false), [184, 29]);
  assert.deepEqual(drawnFlat(184, 8, false), [184, 8], 'marked "?" by classic, and dressed');
  assert.deepEqual(drawnFlat(210, 3, false), [210, 3]);
});

test('NUDE-FLATS: the switch is Show Nudity itself - ChildGuard/PlayerNudity, off as it ships', () => {
  try {
    resetToDefaults();
    assert.equal(showNudity(), false, 'ships False');
    assert.deepEqual(drawnFlat(184, 11), [184, 29], 'the default draws the stand-in');
    setValue('ChildGuard', 'PlayerNudity', true);
    assert.equal(showNudity(), true);
    assert.deepEqual(drawnFlat(184, 11), [184, 11], 'on: the figure as Daggerfall drew it');
  } finally { resetToDefaults(); }
});

test('NUDE-FLATS: the table - people for people, no stand-in nude or marked itself, the mark\'s miss in and its dressed seven out', () => {
  const npc = new Set(NPC_FLAT_ARCHIVES);
  for (const [k, s] of Object.entries(NUDE_FLAT_STAND_INS)) {
    const [a, r] = pairOf(k);
    assert.ok(npc.has(a) && npc.has(s[0]), `${k} -> ${s.join('_')}: both NPC flats`);
    assert.ok(Number.isInteger(r) && r >= 0 && r <= 127 && s[1] >= 0 && s[1] <= 127, `${k}: flat ids`);
    const sk = `${s[0]}_${s[1]}`;
    assert.ok(!(sk in NUDE_FLAT_STAND_INS) && !MARKED_DRESSED.includes(sk), `${k}'s stand-in ${sk} is neither nude nor marked`);
  }
  assert.ok('179_3' in NUDE_FLAT_STAND_INS, 'the naked coven dancer FLATS.CFG does not mark');
  for (const k of MARKED_DRESSED) assert.ok(!(k in NUDE_FLAT_STAND_INS), `${k} is dressed and stays as it is`);
});

test('NUDE-FLATS under ARENA2: every "?" flat is judged, and every stand-in is its figure\'s sex, unmarked and drawable', { skip: skipReal }, () => {
  const f = new FlatsFile().load(new Uint8Array(readFileSync(join(ARENA2, 'FLATS.CFG'))));
  const marked = [...f.flats.values()].filter((d) => flatCensored(d.gender)).map((d) => `${d.archive}_${d.record}`);
  assert.ok(marked.length >= 20, `the mark is read (${marked.length})`);
  for (const k of marked) assert.ok(k in NUDE_FLAT_STAND_INS || MARKED_DRESSED.includes(k), `${k} ("?") is in the table or named dressed`);
  const textures = new Map();
  const recordCount = (a) => {
    if (!textures.has(a)) {
      const t = new TextureFile();
      assert.ok(t.load(new Uint8Array(readFileSync(join(ARENA2, `TEXTURE.${a}`))), `TEXTURE.${a}`), `TEXTURE.${a} loads`);
      textures.set(a, t.recordCount);
    }
    return textures.get(a);
  };
  for (const [k, [sa, sr]] of Object.entries(NUDE_FLAT_STAND_INS)) {
    const [a, r] = pairOf(k);
    assert.ok(r < recordCount(a) && sr < recordCount(sa), `${k} and ${sa}_${sr} are records`);
    const born = f.getFlatData(a, r), stand = f.getFlatData(sa, sr);
    assert.ok(stand && !flatCensored(stand.gender), `${sa}_${sr} is in FLATS.CFG, unmarked`);
    if (born) assert.equal(flatGender(stand.gender), flatGender(born.gender), `${k} (${born.caption}) -> ${stand.caption}: the same sex`);
  }
});

test('NUDE-FLATS, the Morrowind body: a woman\'s bare chest wears the plainest shirt while Show Nudity is off - nothing else changes', () => {
  // retail's shape, in miniature: two sleeved shirts (the id sort picks common_ first), pants, a cuirass (no sleeve, so
  // a shirt welded under it would show one), a cloak's robe (whose reserve holds the sleeve)
  const bodyPool = [{ id: 'b_shirt', model: 'm/s.nif' }, { id: 'b_sleeve', model: 'm/sl.nif' }, { id: 'b_shirt_x', model: 'm/x.nif' },
    { id: 'b_sleeve_x', model: 'm/xl.nif' }, { id: 'b_pants', model: 'm/p.nif' }, { id: 'b_cu', model: 'm/c.nif' }, { id: 'b_robe', model: 'm/r.nif' }];
  const clothes = [
    { id: 'expensive_shirt_01', model: 'x.nif', name: '', type: 2, enchanted: false, parts: [{ part: 3, male: 'b_shirt_x', female: null }, { part: 13, male: 'b_sleeve_x', female: null }] },
    { id: 'common_shirt_01', model: 's.nif', name: '', type: 2, enchanted: false, parts: [{ part: 3, male: 'b_shirt', female: null }, { part: 13, male: 'b_sleeve', female: null }] },
    { id: 'common_pants_01', model: 'p.nif', name: '', type: 0, enchanted: false, parts: [{ part: 21, male: 'b_pants', female: null }] },
    { id: 'common_robe_01', model: 'r.nif', name: '', type: 4, enchanted: false, parts: [{ part: 3, male: 'b_robe', female: null }] },
  ];
  const armors = [{ id: 'iron_cuirass', model: 'c.nif', name: '', enchanted: false, parts: [{ part: 3, male: 'b_cu', female: null }] }];
  const ids = (w) => w.adds.map((a) => a.recordId).sort();
  const wear = (pieces, female, show) => composeWornModest({ pieces, armors, clothes, bodyPool, female }, show);
  const pants = { kind: 'clothing', templateIndex: 151, name: 'Casual Pants' };
  // bare, or in pants alone: the weld - the id-sorted plainest shirt, on the chest
  assert.deepEqual(ids(wear([], true, false)), ['b_shirt', 'b_sleeve'], 'a bare woman wears common_shirt_01');
  assert.ok(wear([], true, false).shadows.includes('chest'));
  assert.deepEqual(ids(wear([pants], true, false)), ['b_pants', 'b_shirt', 'b_sleeve'], 'pants alone leave the chest to the weld');
  // Show Nudity on, or a man: composed as it always was
  assert.deepEqual(ids(wear([], true, true)), [], 'Show Nudity on: the body as Morrowind drew it');
  assert.deepEqual(ids(wear([], false, false)), [], 'a man\'s bare chest is left as it is');
  // a chest something covers takes no weld: a worn shirt, a cuirass
  assert.deepEqual(ids(wear([{ kind: 'clothing', templateIndex: 165, name: 'Short Shirt' }], true, false)), ['b_shirt', 'b_sleeve']);
  assert.deepEqual(ids(wear([{ kind: 'armor', templateIndex: ARMOR_ENUM.Cuirass, material: ARMOR_MATERIAL.Iron }], true, false)), ['b_cu'], 'the cuirass, no shirt under it');
  // MW-CLOAK1: a cloak is the port's own and hangs down the back - the chest under it takes the weld
  assert.deepEqual(ids(wear([{ kind: 'clothing', templateIndex: 154, name: 'Casual Cloak' }], true, false)), ['b_shirt', 'b_sleeve', 'daggerfall_cloak'], 'the cloak, the shirt under it');
  assert.equal(MODESTY_SHIRT.name, 'Short Shirt');
});

