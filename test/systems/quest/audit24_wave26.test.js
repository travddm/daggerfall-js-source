// AUDIT 24, wave 26: the two SPLIT findings from the seven-slice
// sweep - the ones where the two independent refuters disagreed and
// the adjudication was mine - plus the seam gate's alias hole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadQuestTables } from '../../../src/systems/quest/tables.js';
import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { hostText } from '../../hostText.mjs';   // TESA's merge (HOST-SPLIT): the quest world and the quick save moved out of bootWorld - the host read whole

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'vendor', 'dfu-quests');
const sources = {};
for (const f of readdirSync(join(VENDOR, 'Tables'))) {
  if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = readFileSync(join(VENDOR, 'Tables', f), 'utf8').replace(/^﻿/, '');
}
loadQuestTables(sources);
const rd = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');

const HEADERLESS = ['Quest: __NOHDR', 'QRC:', 'Message:  1011', ' x', '', 'QBN:', 'variable _x_', ''];
const NAMED = ['Quest: __HDR', 'DisplayName: The Sunken Ship', 'QRC:', 'Message:  1011', ' x', '', 'QBN:', 'variable _x_', ''];

test('audit24 wave26: a quest with no displayname: header has a NULL displayName', () => {
  // Quest.cs:56 is a bare `string displayName;` - null until
  // Parser.cs:86-89 assigns it, and only a `displayname:` line does.
  const m = new QuestMachine({ nowSeconds: () => 0 });
  const bare = m.parseQuestForLists(HEADERLESS, 0, { rolls: () => 0 });
  assert.equal(bare.displayName, null, "not '' - the C# field has no initialiser");
  const named = m.parseQuestForLists(NAMED, 0, { rolls: () => 0 });
  assert.equal(named.displayName, 'The Sunken Ship');

  // which is the whole point: `'' ?? x` is `''`, so the port's default
  // made DaggerfallGuildServicePopupWindow.cs:640's fallback dead code
  // and a header-less quest would have offered a BLANK picker row.
  assert.equal(bare.displayName ?? bare.questName, '__NOHDR', 'the ?? arm is live again');
  assert.equal('' ?? '__NOHDR', '', 'which it was not with the empty-string default');
});

test('audit24 wave26: a null displayName round-trips, and never renders as "null"', () => {
  const m = new QuestMachine({ nowSeconds: () => 0 });
  const q = m.parseQuestForLists(HEADERLESS, 0, { rolls: () => 0 });
  const data = q.getSaveData();
  assert.equal(data.displayName, null, 'Quest.cs:930 stores the field as-is');
  assert.equal(JSON.parse(JSON.stringify(data)).displayName, null, 'and JSON keeps it null');

});

test('audit24 wave26: the seam gate resolves world ALIASES', () => {
  // THE ALIAS HOLE. calledSeams() scanned for the literal `world.` /
  // `world?.` only, so a module that binds the seam to a local first -
  // `const w = hooks?.world;` - was invisible to the gate entirely.
  // questMacros.js is written that way throughout.
  const gate = rd('test/systems/quest/audit24_questseams.test.js');
  assert.match(gate, /Locals bound to the world seam ITSELF/);
  assert.match(gate, /const aliases = new Set\(/);

  // The tightening matters as much as the widening: a local bound to
  // something world RETURNS is not the seam. `const loc =
  // world\?\.currentLocation\?\.\(\)` must NOT contribute `building`
  // and `dungeon` as missing seams, which the first draft did.
  const seen = new Set();
  const dir = new URL('../../../src/systems/quest/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const mm of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*?)\s*;/g)) {
      if (/^[\w$]*(\??\.[\w$]+)*\??\.?world(\?\.)?(\(\))?$/.test(mm[2]) && mm[1] !== 'world') seen.add(`${mm[1]}=${mm[2]}`);
    }
  }
  assert.deepEqual([...seen].sort(), ['w=hooks?.world', 'w=world()'],
    'exactly the two shapes questMacros.js uses, and nothing derived');
});

// ---- the three seams the alias hole hid ----------------------------

test('audit24 wave26: locationCompassDirection keeps the last-match and (0,0) shapes', async () => {
  const { locationCompassDirection } = await import('../../../src/systems/talk/talk.js');
  // A region whose map table puts "Privys" at longitude/latitude that
  // land EAST of the player. longitudeLatitudeToMapPixel is
  // {x: trunc(lon/128), y: 499 - trunc(lat/128)}.
  const maps = {
    regionCount: 62,
    getPoliticIndex: () => 128 + 17,          // region 17
    getRegion: (i) => (i === 17 ? region : null),
  };
  const mkRegion = (mapNames, mapTable) => {
    // MapsFile.cs:1082-1083 builds MapNameLookup FIRST-WINS, and
    // mapsFile.js:"getRegionIndex(NAME)" does the same; the fixture must too or it is
    // not the shape under test.
    const mapNameLookup = new Map();
    mapNames.forEach((n, i) => { if (!mapNameLookup.has(n)) mapNameLookup.set(n, i); });
    return { mapNames, mapTable, mapNameLookup };
  };
  const region = mkRegion(
    ['Privys', 'Elsewhere'],
    [{ longitude: 400 * 128, latitude: (499 - 300) * 128 }, { longitude: 1 * 128, latitude: 498 * 128 }],
  );
  const at = (x, y) => locationCompassDirection({ playerMapPixel: () => ({ x, y }), maps }, 'Privys');
  assert.equal(at(300, 300), 'east', 'the target is at pixel x=400, y=300');
  assert.equal(at(500, 300), 'west');
  // map pixels grow SOUTHWARDS, and C# inverts y before the hint - so
  // a target at a SMALLER y is NORTH of the player
  assert.equal(at(400, 400), 'north');
  assert.equal(at(400, 200), 'south');

  // the name match is case-insensitive, and a name the region does not
  // carry leaves positionLocation at zero -> never-mind
  assert.equal(locationCompassDirection({ playerMapPixel: () => ({ x: 300, y: 300 }), maps }, 'privys'), 'east');
  assert.equal(locationCompassDirection({ playerMapPixel: () => ({ x: 300, y: 300 }), maps }, 'Nowhere'), '...never mind...');

  // THE SHAPE WAVE 26 GOT WRONG AND THE SCOUT CAUGHT. The loop does not
  // break - but the row is looked up BY NAME
  // (`MapTable[MapNameLookup[locations[i]]]`, TalkManager.cs:1263-1266),
  // and MapNameLookup is first-wins, so every iteration for a duplicated
  // name resolves the SAME first row. Wave 26 indexed mapTable by the
  // loop counter, which really is last-wins, and pinned that as the law.
  const twice = mkRegion(
    ['Privys', 'Privys'],
    [{ longitude: 400 * 128, latitude: (499 - 300) * 128 }, { longitude: 100 * 128, latitude: (499 - 300) * 128 }],
  );
  const mapsTwice = { ...maps, getRegion: () => twice };
  assert.equal(locationCompassDirection({ playerMapPixel: () => ({ x: 300, y: 300 }), maps: mapsTwice }, 'Privys'),
    'east', 'the FIRST Privys (x=400) wins - MapNameLookup is first-wins');

  // and two names differing only in CASE still take the last, because
  // the ToLower compare matches both while the dictionary keys stay
  // exact-case, so the lookup really is per-iteration
  const cased = mkRegion(
    ['Privys', 'privys'],
    [{ longitude: 400 * 128, latitude: (499 - 300) * 128 }, { longitude: 100 * 128, latitude: (499 - 300) * 128 }],
  );
  assert.equal(locationCompassDirection({ playerMapPixel: () => ({ x: 300, y: 300 }), maps: { ...maps, getRegion: () => cased } }, 'PRIVYS'),
    'west', 'the second, differently-cased Privys wins');

  // a name the lookup does not hold is SKIPPED, not defaulted to row 0
  const orphan = { ...mkRegion(['Privys'], [{ longitude: 400 * 128, latitude: (499 - 300) * 128 }]), mapNameLookup: new Map() };
  assert.equal(locationCompassDirection({ playerMapPixel: () => ({ x: 300, y: 300 }), maps: { ...maps, getRegion: () => orphan } }, 'Privys'),
    '...never mind...');

  // and a region record with NO lookup at all answers never-mind rather
  // than throwing. C# always builds MapNameLookup at load
  // (MapsFile.cs:1063), but the port's getRegion can hand back a
  // partially-built record, and `lookup.get` on a missing one is a
  // TypeError that would take the whole macro expansion down. Dropping
  // the `lookup?.has` guard survived every other pin here.
  const noLookup = { mapNames: ['Privys'], mapTable: [{ longitude: 400 * 128, latitude: (499 - 300) * 128 }] };
  assert.equal(locationCompassDirection({ playerMapPixel: () => ({ x: 300, y: 300 }), maps: { ...maps, getRegion: () => noLookup } }, 'Privys'),
    '...never mind...');
  // and no region at all, which is the out-of-range politic case
  assert.equal(locationCompassDirection({ playerMapPixel: () => ({ x: 1, y: 1 }), maps: { ...maps, getRegion: () => null } }, 'Privys'),
    '...never mind...');

  // an out-of-range politic index reads region -1, which has no map
  const bad = { ...maps, getPoliticIndex: () => 128 + 999 };
  assert.equal(locationCompassDirection({ playerMapPixel: () => ({ x: 1, y: 1 }), maps: bad }, 'Privys'), '...never mind...');
});

test('audit24 wave26: %rt and %nrn take the ZERO STRUCT on a lookup miss, not null', async () => {
  const { getContextValue } = await import('../../../src/systems/quest/questMacros.js');
  // RegentTitle (MacroHelper.cs:644-650) discards the lookup's bool
  // and reads the out struct, which PersistentFactionData.cs:239 has
  // already set to `new FactionData()`. GetRulerTitle(0) hits its
  // `default:` and answers Lord.
  const worldMiss = {
    currentRegionIndex: () => 17,
    findFactionByTypeAndRegion: () => null,       // the miss: zero struct
    getFactionData: () => null,
    currentRegionFaction: () => 0,
  };
  assert.equal(getContextValue('%rt', null, { world: worldMiss }), 'Lord');
  assert.equal(getContextValue('%t', null, { world: worldMiss }), 'Lord');

  // and a real ruler still reads its own title
  const worldHit = { ...worldMiss, findFactionByTypeAndRegion: () => ({ ruler: 2 }) };
  assert.equal(getContextValue('%rt', null, { world: worldHit }), 'Queen');

  // %nrn: GetLordNameForFaction has NO null path. The zero struct
  // gives ruler 0 -> gender (0+1)%2 = 1 = Female, race 0 ->
  // FactionRaces.Nord, seed 0 & 0xffff = 0.
  const nrn = getContextValue('%nrn', null, { world: worldMiss });
  assert.ok(typeof nrn === 'string' && nrn.length > 1, `a generated name, got ${JSON.stringify(nrn)}`);
  assert.doesNotMatch(nrn, /nullMCP|undefined/);

  // NO WORLD AT ALL is the other nothing, and it stays the port's loud
  // headless pending - this is the distinction %rn already drew and
  // these two conflated.
  assert.match(String(getContextValue('%rt', null, { world: null })), /nullMCP/);
  assert.match(String(getContextValue('%nrn', null, { world: null })), /nullMCP/);
});
