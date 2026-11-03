// MWNPC8b: THE
// DUNGEON'S AND THE STREET'S STANDING PEOPLE IN THEIR BODIES. Both hosts batched their StaticNPC flats together (the
// dungeon with the level's flats, the street per sprite over a pixel's active NPCs), and one billboard in a shared
// batch cannot step aside for one body. Each person's flat now stands ALONE - its own batch - and each host offers its
// people (read as the building's are: their StaticNPC data, their faction's row) before its flats draw. Pinned by
// source, as the dungeon's foes are (a dungeon or a street needs the game's own files): the per-person batches, the
// offers and the draw before the flats, the look never before the faction table, the teardowns - and THE STANDING-PEOPLE
// HOSTS ENUMERATED: every scene that stands StaticNPC billboards named, wired or flagged with its slice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ROW_CODECS } from '../../src/formats/worldData/worldDataPack.js';
import { blockFromJson } from '../../src/formats/worldData/worldDataReplacement.js';
import { collectBlockFlats } from '../../src/world/rmbFlats.js';
import { collectExteriorNpcs, exteriorNpcRecord } from '../../src/characters/exteriorNpcs.js';
import { staticNpcData } from '../../src/characters/staticNpc.js';
import { isNpcFlat } from '../../src/world/npcFlatArchives.js';
import { personLook, wardrobeOf } from '../../src/characters/peopleBodies.js';
import { SOCIAL_GROUPS, GUILD_GROUPS, FACTION_TYPES } from '../../src/formats/factionFile.js';
import { RACES } from '../../src/systems/races.js';
import { GENDERS } from '../../src/characters/nameHelper.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ordered = (s, needles, what) => {
  let at = -1;
  for (const n of needles) {
    const i = s.indexOf(n, at + 1);
    assert.ok(i > at, `${what}: "${n.slice(0, 70)}" ${i < 0 ? 'missing' : 'out of order'}`);
    at = i;
  }
};

test('MWNPC8b-d a flat with a faction is not always a person drawn: an editor marker (archive 199, never rendered) stands no body, whatever its faction; nor does anyone not mortal - a Daedra, a god, Oblivion\'s or the Fey\'s', () => {
  const data = (o) => ({ race: RACES.Breton, gender: GENDERS.Male, nameSeed: 9, hash: 3, factionID: 0, billboardArchiveIndex: 182, billboardRecordIndex: 1, ...o });
  assert.ok(personLook({}, data({}), null), 'a person drawn: a body');
  assert.equal(personLook({}, data({ billboardArchiveIndex: 199, billboardRecordIndex: 11 }), null), null, 'a marker: none');
  const fac = (o) => ({ type: FACTION_TYPES.Generic, sgroup: SOCIAL_GROUPS.Commoners, ggroup: GUILD_GROUPS.None, ...o });
  for (const [o, what] of [[{ type: FACTION_TYPES.Daedra }, 'a Daedra'], [{ type: FACTION_TYPES.God }, 'a god'], [{ ggroup: GUILD_GROUPS.Oblivion }, 'Oblivion\'s'], [{ ggroup: GUILD_GROUPS.TheFey }, 'the Fey\'s']]) {
    assert.equal(wardrobeOf(fac({ sgroup: SOCIAL_GROUPS.Nobility, ...o })), 'none', `${what} keeps their sprite, whatever else`);
    assert.equal(personLook({}, data({}), fac(o)), null, what);
  }
  assert.equal(wardrobeOf(fac({ type: FACTION_TYPES.WitchesCoven })), 'mage', 'a coven\'s witch is mortal');   // PIN MOVED (MWNPC17, section 25): and in a mage's robes, not the street's
});

test('STALL-FLATS (FIELD BUGS 2026-10-15c, "every animal and food stand item turned into freaks"; "The NPC\'s are clustered into groups and all have their heads down"): Beautiful Villages\' TVRNAS02 market, read off the vendored pack the town mods serve - RMBLayout\'s StaticNPC rule kept (113, every factioned flat), and a body stands only for a person\'s picture (RDBLayout.NPCFlatArchives), never for the stall\'s food, goods and animals (101 before); a quest\'s person keeps theirs whatever FLATS.CFG pictures them with (mutants: the archive law dropped; the quest\'s word unread)', () => {
  const pack = JSON.parse(gunzipSync(readFileSync(new URL('../../vendor/beautiful-villages/WorldDataPack/beautiful-villages.pack.json.gz', import.meta.url))).toString());
  const op = JSON.parse(pack.files['TVRNAS02.RMB.json'])[2].find((o) => JSON.stringify(o[1]) === '["RmbBlock","MiscFlatObjectRecords"]');
  const block = blockFromJson({ Name: 'TVRNAS02.RMB', RmbBlock: { FldHeader: {}, SubRecords: [], Misc3dObjectRecords: [], MiscFlatObjectRecords: op[2].$f.map(ROW_CODECS.$f) } }, 0);
  const npcs = collectExteriorNpcs(collectBlockFlats(block, 0));
  assert.equal(npcs.length, 113, 'DFU\'s StaticNPC rule kept - the click and the quest pass read them all');
  assert.ok(npcs.filter((f) => !isNpcFlat(f.archive)).length >= 100, 'the market\'s factioned scenery stands in the list');
  const bodied = npcs.filter((f) => { const pn = exteriorNpcRecord(f, null); return personLook(pn, staticNpcData(pn, { getFaction: () => null, raceOfCurrentRegion: () => 1 }), null); });
  assert.deepEqual(bodied.filter((f) => !isNpcFlat(f.archive)).map((f) => f.archive), [], 'no food, goods or animal bodied');
  assert.equal(bodied.length, 11, 'the block\'s twelve people less its child');
  // a quest's person, pictured off a FLATS.CFG archive outside the people's
  const look = (questPerson) => personLook({}, { race: 1, gender: GENDERS.Male, nameSeed: 7, hash: 9, billboardArchiveIndex: 186, billboardRecordIndex: 0, questPerson }, null);
  assert.equal(look(undefined), null);
  assert.notEqual(look(true), null, 'the quest\'s word stands them');
});
