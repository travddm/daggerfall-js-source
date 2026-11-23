// TESA3 - THE PROVINCE'S NAME AND ITS
// PEOPLE, pinned. Past the Bay a pixel answers the province it stands on (world/tamriel/tamrielLand.js provinceKeyBeyondBay) for
// what the player READS - the loading screen, the Overworld's line, the new region's word and its edge - and for whose
// NAMES its people carry (world/tamrielPeople.js: a Nord's in Skyrim, the Imperial bank in Black Marsh by DFU's own
// Argonian law). Never a region index: every system keyed by region keeps the 62 regions' law (no chat room, bank, price
// table or service past index 61 - the sweep in the page's record).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { provinceKeyBeyondBay, setTamrielTrace, provinceKeyAt } from '../src/world/tamriel/tamrielLand.js';
import { setTamrielFit, bayToPicture } from '../src/world/tamriel/tamrielFrame.js';
import { provinceNameBank } from '../src/world/tamrielPeople.js';
import { PROVINCES } from '../src/world/tamriel/tamrielGeography.js';
import { BANK_TYPES, getNameBank, getRandomFullName, getRandomFullNameOfBank, getNameBankOfRegion } from '../src/characters/nameHelper.js';
import { srand } from '../src/formats/dfRandom.js';
import { hostText } from './hostText.mjs';   // HOST-SPLIT (at the merge of main): the world host read whole - its pixel build stands in scenes/pixelBuild.js

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
afterEach(() => { setTamrielTrace(null); setTamrielFit(null); });

function rectTrace(rects) {
  const w = 320, h = 200, land = new Uint8Array(w * h), province = new Uint8Array(w * h);
  for (const [id, x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { land[y * w + x] = 1; province[y * w + x] = id; }
  return { w, h, land, province };
}

test('TESA3 the province past the Bay: a Bay pixel beyond the Bay answers the province its centre stands on - the trace\'s, else the authored rings\' - and the Bay\'s own pixels and the sea answer none (mutant: the Bay test, the centre)', () => {
  setTamrielFit({ ox: 400, oy: 500, ppu: 10 });
  setTamrielTrace(rectTrace([[3, 110, 20, 210, 50], [4, 210, 20, 260, 50], [1, 40, 50, 100, 100]]));   // High Rock's land under the Bay too
  assert.equal(provinceKeyAt(90.05, 75.05), 'HighRock', 'the Bay\'s pixel stands on High Rock\'s land in the picture');
  assert.equal(provinceKeyBeyondBay(800, -200), 'Skyrim');
  assert.equal(provinceKeyBeyondBay(1750, -200), 'Morrowind');
  assert.equal(provinceKeyBeyondBay(500, 250), null, 'the Bay\'s own pixel: Daggerfall\'s regions answer there');
  assert.equal(provinceKeyBeyondBay(800, -320), null, 'the sea north of Skyrim');
  // the centre decides: pixel 699's centre is picture 109.95 - the sea - though its far edge touches the land
  assert.equal(provinceKeyBeyondBay(699, -200), null);
  assert.equal(provinceKeyBeyondBay(700, -200), 'Skyrim');
  // no trace: the authored shape's own answer, as provinceKeyAt gives it
  setTamrielTrace(null); setTamrielFit(null);
  const [px, py] = [2200, -360];
  assert.equal(provinceKeyBeyondBay(px, py), provinceKeyAt(...bayToPicture(px + 0.5, py + 0.5)));
});

test('TESA3 the province\'s people: each province\'s name bank off its own race through DFU\'s GetNameBank - an Argonian\'s the Imperial bank (NameHelper.cs:50) - and the Imperial Province, which no race claims, the Imperial bank; none for no province (mutant: the Imperial arm, a race read)', () => {
  assert.deepEqual(Object.fromEntries(PROVINCES.map((p) => [p.key, provinceNameBank(p.key)])), {
    HighRock: BANK_TYPES.Breton, Hammerfell: BANK_TYPES.Redguard, Skyrim: BANK_TYPES.Nord, Morrowind: BANK_TYPES.DarkElf,
    Imperial: BANK_TYPES.Imperial, BlackMarsh: BANK_TYPES.Imperial, Elsweyr: BANK_TYPES.Khajiit, Valenwood: BANK_TYPES.WoodElf, Sumurset: BANK_TYPES.HighElf,
  });
  for (const p of PROVINCES) if (p.race) assert.equal(provinceNameBank(p.key), getNameBank(p.race), `${p.key} by GetNameBank`);
  assert.equal(provinceNameBank(null), null);
  assert.equal(provinceNameBank('Atmora'), null);
  assert.equal(getNameBank(null), BANK_TYPES.Breton, 'GetNameBank\'s own default is why the Imperial arm is the province\'s');
});

test('TESA3 the stranger\'s name: getRandomFullNameOfBank is getRandomFullName\'s own draw from a bank in hand - the same coin, the same stream - and getRandomFullName now calls it (mutant: the coin, the order)', () => {
  for (const seed of [1, 2, 3, 7, 11, 101]) {
    srand(seed);
    const region = getRandomFullName(17);
    srand(seed);
    assert.equal(getRandomFullNameOfBank(getNameBankOfRegion(17)), region, `seed ${seed}`);
  }
  srand(5);
  const nord = getRandomFullNameOfBank(BANK_TYPES.Nord);
  assert.match(nord, /sen$/, 'a Nord surname ends in -sen (NameGen.txt)');
});

const ARENA2 = process.env.ARENA2_PATH;
const HAVE = !!ARENA2 && ['TMAP00I0.IMG', 'TAMRIEL2.IMG', 'MAP.PAL', 'ART_PAL.COL'].every((f) => existsSync(join(ARENA2, f)));
test('TESA3 with ARENA2: on the player\'s own trace Winterhold\'s pixel is Skyrim\'s, Mournhold\'s country Morrowind\'s and the Bay\'s own Daggerfall none', { skip: HAVE ? false : 'ARENA2_PATH not set' }, async () => {
  const { DFPalette } = await import('../src/formats/dfPalette.js');
  const { preloadTamrielTrace } = await import('../src/ui/tamrielTrace.js');
  const fetchBytes = async (n) => new Uint8Array(readFileSync(join(ARENA2, n)));
  const pal = new DFPalette(); pal.load(await fetchBytes('ART_PAL.COL'), 'ART_PAL.COL');
  setTamrielTrace(await preloadTamrielTrace({ fetchBytes, palette: pal }));
  setTamrielFit({ ox: 38 * 15.5, oy: 57 * 15.5, ppu: 15.5 });
  assert.equal(provinceKeyBeyondBay(2200, -360), 'Skyrim');
  assert.equal(provinceKeyBeyondBay(3344, 535), 'Morrowind', 'Mournhold\'s own pixel (TESA2)');
  assert.equal(provinceKeyBeyondBay(207, 213), null);
});
