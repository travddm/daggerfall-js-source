// SEA-VAULTS:
// the vaults of the deep - the wire's key and its room (net/wire.js), the day's picks (systems/sea/seaVaults.js), the
// world host's wiring (scenes/seaVenturesHost.js), the chart's marks (ui/etherChartWindow.js). A vault has no hub: no
// lock, no crows, no reset. tools/mutants/seavaults.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isWorldRoom, seaVaultKey, seaVaultCell, seaVaultMapId, seaRoomCell, seaVaultRoomMapId,
  WDUN_SEA_CELLS_W, WDUN_SEA_CELLS_H,
} from '../../../src/net/wire.js';
import { CELLS_W, CELLS_H, isleOfCell, etherBandAt, BANDS, VEIL_X, LEAGUE_PX, veilhaven, etherCellOf } from '../../../src/world/ethericSea.js';
import { etherPlaceId } from '../../../src/world/etherPlaces.js';
import { HAUNT_SPREAD, ABYSS_HAUNT_LEAGUES } from '../../../src/systems/naval/etherShips.js';
import {
  SEA_VAULTS, SEA_VAULT_SPACING_CELLS, SEA_VAULT_SEARCH_CELLS, SEA_VAULT_TRIES, SEA_VAULT_SALT, seaVaultPicks, seaVaultAt, seaVaultByKey, vaultWaters, _resetSeaVaultsForTests,
} from '../../../src/systems/sea/seaVaults.js';
import { createSeaVentures } from '../../../src/scenes/seaVenturesHost.js';
import * as M from '../../../src/ui/etherChartWindow.js';
import { createInstanceDoor } from '../../../src/scenes/instanceDoor.js';
import { SITE_TYPES } from '../../../src/systems/quest/place.js';
import { instanceOwnerOf, instanceRoomOf, instanceWord, INSTANCE_DOOR_WORD } from '../../../src/net/instanceRoom.js';
import { fakeRoom } from '../../fakeRoom.mjs';

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const DAY = 20400;

test('SEA-VAULTS the wire: a vault of the deep is keyed by its cell, `"e<cx>,<cy>"` - inside the lattice; its room its ruin isle\'s own place\'s, a world room; the lattice and the place\'s id the sea\'s own (mutants: the bounds, the lane)', () => {
  assert.deepEqual([WDUN_SEA_CELLS_W, WDUN_SEA_CELLS_H], [CELLS_W, CELLS_H], 'the relay\'s copy of the lattice is the sea\'s');
  assert.equal(seaVaultKey(723, 240), 'e723,240');
  assert.deepEqual(seaVaultCell('e723,240'), [723, 240]);
  assert.deepEqual(seaVaultCell('e0,0'), [0, 0]);
  for (const bad of ['e806,1', 'e1,499', 'e-1,2', 'e1,2,3', 'e1234,1', '723,240', 'E1,2', 'e1,2 ', null, 5]) assert.equal(seaVaultCell(bad), null, String(bad));
  assert.deepEqual([CELLS_W - 1, CELLS_H - 1].map(String), ['805', '498']);
  assert.deepEqual(seaVaultCell(`e${CELLS_W - 1},${CELLS_H - 1}`), [CELLS_W - 1, CELLS_H - 1], 'the last cell');
  for (const [cx, cy] of [[723, 240], [0, 0], [805, 498], [400, 13]]) {
    assert.equal(seaVaultMapId(cx, cy), etherPlaceId({ cx, cy }), `${cx},${cy}`+ ': the isle\'s own place\'s id');
    assert.ok(isWorldRoom(`dungeon:m${seaVaultRoomMapId(cx, cy)}`), 'its world room, the one its vault is stood in');
    assert.notEqual(seaVaultRoomMapId(cx, cy), etherPlaceId({ cx, cy }), 'never its plain ruin\'s');
  }
  assert.notEqual(seaVaultRoomMapId(723, 240), seaVaultRoomMapId(724, 240));
});

test('SEA-VAULTS the picks: the Deep Aether\'s four and the Abyss\'s three a day - each a ruin isle of its own band, near a point its waters draw (the haunts\' corridor), SEA_VAULT_SPACING_CELLS apart; the ring the band\'s (3, 4); the same every call and every client, another set another day (mutants: the counts, the kind, the band, the spacing, the ring, the day)', () => {
  _resetSeaVaultsForTests();
  assert.deepEqual({ ...SEA_VAULTS }, { deep: 4, abyss: 3 });
  assert.deepEqual([SEA_VAULT_SPACING_CELLS, SEA_VAULT_SEARCH_CELLS, SEA_VAULT_TRIES, SEA_VAULT_SALT], [6, 10, 8, 0x5ea7]);
  const deepW = vaultWaters('deep'), abyssW = vaultWaters('abyss');
  assert.deepEqual(deepW, { x0: Math.ceil(VEIL_X - BANDS[3].from * LEAGUE_PX), x1: Math.floor(VEIL_X - BANDS[2].from * LEAGUE_PX), y0: veilhaven().py - HAUNT_SPREAD.deep, y1: veilhaven().py + HAUNT_SPREAD.deep });
  assert.deepEqual(abyssW, { x0: Math.ceil(VEIL_X - (BANDS[3].from + ABYSS_HAUNT_LEAGUES) * LEAGUE_PX), x1: Math.floor(VEIL_X - BANDS[3].from * LEAGUE_PX), y0: veilhaven().py - HAUNT_SPREAD.abyss, y1: veilhaven().py + HAUNT_SPREAD.abyss });
  const reach = SEA_VAULT_SEARCH_CELLS * 10 + 10;
  const seen = new Set();
  for (let d = DAY; d < DAY + 30; d++) {
    const v = seaVaultPicks(d);
    assert.equal(v, seaVaultPicks(d), 'kept a day');
    assert.deepEqual(v.map((x) => x.band), ['deep', 'deep', 'deep', 'deep', 'abyss', 'abyss', 'abyss'], `day ${d}`);
    for (const x of v) {
      const isle = isleOfCell(x.cx, x.cy);
      assert.equal(isle.kind, 'ruin', `${x.key}: a ruin`);
      assert.deepEqual([x.x, x.y, x.name], [isle.px, isle.py, isle.name], 'its place\'s pixel and name the isle\'s own');
      assert.deepEqual(etherCellOf(x.x, x.y), [x.cx, x.cy]);
      assert.equal(etherBandAt(isle.px).id, x.band, 'of its own band');
      assert.equal(x.ring, x.band === 'deep' ? 3 : 4);
      assert.equal(x.key, seaVaultKey(x.cx, x.cy));
      const w = x.band === 'deep' ? deepW : abyssW;
      assert.ok(x.x >= w.x0 - reach && x.x <= w.x1 + reach && x.y >= w.y0 - reach && x.y <= w.y1 + reach, `${x.key}: within its waters' reach`);
    }
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      assert.ok(Math.max(Math.abs(v[i].cx - v[j].cx), Math.abs(v[i].cy - v[j].cy)) >= SEA_VAULT_SPACING_CELLS, `${v[i].key} and ${v[j].key} apart`);
    }
    seen.add(v.map((x) => x.key).join('|'));
  }
  assert.ok(seen.size >= 29, 'a new set each day');
  _resetSeaVaultsForTests();
  const again = seaVaultPicks(DAY);
  assert.deepEqual(again.map((x) => x.key), seaVaultPicks(DAY).map((x) => x.key), 'drawn again, the same');
  assert.equal(seaVaultAt(again, again[2].x, again[2].y), again[2]);
  assert.equal(seaVaultAt(again, again[2].x + 1, again[2].y), null, 'its place\'s pixel alone');
  assert.equal(seaVaultByKey(again, again[5].key), again[5]);
  assert.equal(seaVaultByKey(again, 'e0,0'), null);
});

test('SEA-VAULTS the world host\'s wiring (seaVenturesHost.js): a vault at the player\'s pixel while the sea stands, none otherwise; the chart\'s word - every vault of the day with its band and ring, nothing of a lock or of crows', () => {
  const v = seaVaultPicks(DAY);
  const st = { live: true, px: { x: v[0].x, y: v[0].y } };
  const sea = createSeaVentures({ live: () => st.live, day: () => DAY, pixel: () => st.px });
  assert.equal(sea.vaultHere(), v[0]);
  st.px = { x: v[0].x + 1, y: v[0].y };
  assert.equal(sea.vaultHere(), null, 'a pixel off');
  st.px = { x: 500, y: 250 };
  assert.equal(sea.vaultHere(), null, 'the Bay');
  st.px = { x: v[4].x, y: v[4].y };
  assert.equal(sea.vaultHere().ring, 4);
  st.live = false;
  assert.equal(sea.vaultHere(), null, 'the sea not standing: no vault, the ruin is itself');
  assert.deepEqual(sea.chartWord().vaults, []);   // SEA-EVENTS: beside the storm\'s and the fleet\'s words (test/systems/sea/seaevents.test.js)
  st.live = true;
  const w = sea.chartWord();
  assert.equal(w.vaults.length, 7);
  assert.deepEqual(w.vaults[1], { key: v[1].key, x: v[1].x, y: v[1].y, name: v[1].name, band: 'deep', ring: 3 });
  assert.equal('pvp' in w, false, 'the chart\'s word names no zone');
  const next = createSeaVentures({ live: () => true, day: () => DAY + 1, pixel: () => st.px }).chartWord().vaults;
  assert.notDeepEqual(next.map((t) => t.key), w.vaults.map((t) => t.key), 'the day\'s turn moves the vaults');
});

test('SEA-VAULTS the chart: every vault on the canvas marked in the halls\' oxblood whether its isle is charted or not, named from x4; keyed while the word carries any', () => {
  const v = seaVaultPicks(DAY);
  const word = { px: v[0].x, py: v[0].y, yaw: 0, charted: [], legends: [], stats: {}, vaults: v };
  const W = 1000, H = 600;
  const view = { cx: v[0].x + 0.5, cy: v[0].y + 0.5, zoom: 2 };
  const m = M.chartModel(word, view, W, H);
  const at = m.vaults.find((t) => t.key === v[0].key);
  assert.deepEqual([at.sx, at.sy, at.icon, at.named], [W / 2, H / 2, M.ICON_PX[2], true]);
  assert.equal(M.chartModel(word, { ...view, zoom: 1 }, W, H).vaults.find((t) => t.key === v[0].key).named, false);
  assert.equal(M.chartModel({ ...word, vaults: undefined }, view, W, H).vaults.length, 0);
  const log = [];
  const g = new Proxy({}, { get: (_, k) => (k === 'measureText' ? (s) => ({ width: String(s).length * 7 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => log.push([k, ...a])), set: (_, k, val) => { log.push(['=', k, val]); return true; } });
  M.paintChart(g, m, W, H);
  const hw = M.ICON_PX[2] + 2;
  const door = log.findIndex((c) => c[0] === 'arc' && c[1] === W / 2 && c[2] === H / 2 - M.ICON_PX[2] - 4 + hw && c[3] === hw && c[4] === Math.PI && c[5] === 0);
  assert.ok(door >= 0, 'the vault\'s arched door over its isle');
  assert.ok(log.slice(door).some((c) => c[0] === '=' && c[1] === 'fillStyle' && c[2] === '#7a1f14'), 'in the halls\' oxblood');
  assert.ok(log.some((c) => c[0] === 'fillText' && c[1] === v[0].name.replace(/^./, (s) => s.toUpperCase())), 'named');
  assert.deepEqual([...M.CHART_VAULT_KEY], ['vault', 'A vault of the deep, open today']);
});

test('SEA-VAULTS the open sea keeps no instance: an isle\'s dungeon room read back to its cell (seaVaultMapId\'s inverse) and nothing else\'s; the relay refuses an instance of one to everyone, staff and owner alike, its public room as it was; the page\'s door never keys one; the host\'s `wild` the open sea\'s too (mutants: the inverse\'s bounds, the relay\'s refusal, the door, the open sea)', async () => {
  for (const [cx, cy] of [[723, 240], [0, 0], [805, 498], [400, 13]]) assert.deepEqual(seaRoomCell(`dungeon:m${seaVaultMapId(cx, cy)}`), [cx, cy], `${cx},${cy}`);
  assert.equal(seaRoomCell('dungeon:m187853213'), null, 'a dungeon of the map\'s');
  assert.equal(seaRoomCell(`dungeon:m${(0xe6 << 20) | 500005}`), null, 'another lane\'s, though its low bits read as a cell');
  assert.equal(seaRoomCell(`dungeon:m${(0xe7 << 20) | 499999}`), null, 'under the isles\' 500,000');
  assert.equal(seaRoomCell(`dungeon:m${(0xe7 << 20) | (500000 + WDUN_SEA_CELLS_W * WDUN_SEA_CELLS_H)}`), null, 'past the lattice\'s last row');
  assert.deepEqual(seaRoomCell(`dungeon:m${(0xe7 << 20) | (500000 + WDUN_SEA_CELLS_W * WDUN_SEA_CELLS_H - 1)}`), [WDUN_SEA_CELLS_W - 1, WDUN_SEA_CELLS_H - 1], 'its last cell');
  for (const bad of [`dungeon:m${seaVaultMapId(1, 2)}.m`, `interior:m${seaVaultMapId(1, 2)}`, 'dungeon:m0', 'dungeon:m', null, 7]) assert.equal(seaRoomCell(bad), null, String(bad));

  const base = `dungeon:m${seaVaultMapId(723, 240)}`;
  const key = instanceRoomOf(base, { owner: await instanceOwnerOf('acct-alice'), epoch: '89abcdef' });
  assert.ok(key, 'the law keys it (the page never asks one)');
  const r = fakeRoom(key);
  const refusal = (ws) => ws.sent.find((m) => m.t === 'error')?.m ?? null;
  const alice = r.connect(); await r.hello(alice, 'alice');
  assert.equal(refusal(alice), INSTANCE_DOOR_WORD, 'its owner');
  const staff = r.connect(); await r.hello(staff, 'mod1', null, { glyphs: ['dev'] });
  assert.equal(refusal(staff), INSTANCE_DOOR_WORD, 'staff');
  const pub = fakeRoom(base);
  const carol = pub.connect(); await pub.hello(carol, 'carol');
  assert.ok(carol.sent.some((m) => m.t === 'welcome'), 'its public room is as it was');

  const d = createInstanceDoor({ online: () => true, instanceOk: () => true, account: () => 'acct-alice', character: () => 'char_alice', members: () => [], questMachine: () => null, openOverlay: () => true, say: () => {}, wild: () => false });
  const isle = { siteType: SITE_TYPES.Dungeon, mapId: seaVaultMapId(723, 240), buildingKey: 0, layout: null, isHold: false, home: false, name: '' };
  const word = instanceWord({ owner: await instanceOwnerOf('acct-alice'), epoch: '89abcdef' });
  assert.deepEqual(await d.entryFor(isle, { ins: word, staff: true }), { instance: null, whole: true }, 'an isle\'s dungeon keeps none, at the peace\'s edge as past it');

  const st = { live: true };
  const sea = createSeaVentures({ live: () => st.live, day: () => DAY, pixel: () => null });
  const v = seaVaultPicks(DAY);
  assert.equal(sea.openSeaAt({ x: v[0].x, y: v[0].y }), true, 'a vault\'s isle');
  assert.equal(sea.openSeaAt({ x: v[0].x + 3, y: v[0].y }), true, 'any water of the deep');
  assert.equal(sea.openSeaAt({ x: veilhaven().px, y: veilhaven().py }), false, 'Veilhaven\'s peace');
  assert.equal(sea.openSeaAt({ x: 500, y: 250 }), false, 'the Bay');
  assert.equal(sea.openSeaAt(null), false);
  st.live = false;
  assert.equal(sea.openSeaAt({ x: v[0].x, y: v[0].y }), false, 'the sea not standing: no open sea');
});
