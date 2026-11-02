// A wall stood on a town's outline past the Bay: what stood at its template's gates (the two bulletin boards, Immersive
// Travel's carriage and driver) carried to each new gate and stood clear of its towers, and a town's yards on its own
// ground. The Bay's cities keep Daggerfall's own ring, so none of this runs there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { outlineTownLocation, townOutlineBlockJson } from '../../src/world/townOutline.js';
import { townWallBlockName, gateFurniture, townBlockedCells, townWalkShut, registerTownWall, GATE_CLEAR, WALL_MODELS } from '../../src/world/townWalls.js';
import { carriageRecordsOf, installImmersiveTravelGates, hasCarriageGate } from '../../src/world/immersiveTravelGates.js';
import { installWorldDataReplacement } from '../../src/formats/worldData/worldDataReplacement.js';
import { setLocationTiles } from '../../src/world/terrain/terrainTiles.js';
import { townGroundOf } from '../../src/world/merchantYards/merchantYardSites.js';
import { CityNavigation } from '../../src/world/city/cityNavigation.js';
import { isWallCarrier } from '../../src/world/townShape.js';

const ARENA2 = process.env.ARENA2_PATH;
const skipReal = !ARENA2 || !existsSync(join(ARENA2 ?? '', 'BLOCKS.BSA')) ? 'ARENA2_PATH not set or missing - real-data validation skipped' : false;
const RING = ['WALLAA02.RMB', 'WALLAA10.RMB', 'WALLAA03.RMB', 'WALLAA07.RMB', 'H.RMB', 'WALLAA05.RMB', 'WALLAA00.RMB', 'WALLAA08.RMB', 'WALLAA01.RMB'];
const city = (names, mapId = 4321) => ({ name: 'Bayton', mapTableData: { mapId }, exterior: { buildings: [], exteriorData: { width: 3, height: 3, blockNames: names.slice() } } });

test('TS7 what stands at a gate: the template gate\'s own records - the game\'s block, Immersive Travel\'s while loaded - carried from its frame to the new gate\'s and turned with it, its start marker TS4\'s; each gate its nearest template gate, once (mutants: the frame unturned; the turn unread; the marker carried; the extra unread)', () => {
  // a template gate facing north at (38.4, 11.2) of its block at (0, 204.8); the new gate faces east at (300, 150)
  const wall = { middle: [150, 150], frames: [{ name: 'WALLAA08.RMB', block: [0, 204.8], at: [38.4, 216], out: [0, 1] }], pieces: [{ model: WALL_MODELS.gate, at: [300, 150], out: [1, 0], stretch: 1 }] };
  // a board 6.4 m west of the gate and 4 m inside it; a marker outside it
  const board = { modelId: '41739', modelIdNum: 41739, objectType: 0, xPos: (38.4 - 6.4) / 0.025, yPos: -55, zPos: (216 - 204.8 - 4) / 0.025 - 4096, xRotation: 0, yRotation: 100, zRotation: 0 };
  const marker = { position: 0, xPos: 1410, yPos: -4, zPos: -2977, textureArchive: 199, textureRecord: 10, factionID: 0, flags: 0 };
  const block = { name: 'WALLAA08.RMB', rmbBlock: { fldHeader: { numBlockDataRecords: 0, numMisc3dObjectRecords: 1, numMiscFlatObjectRecords: 1, buildingDataList: [], groundData: { groundTiles: [], groundScenery: [] }, autoMapData: new Uint8Array(4096) }, subRecords: [], misc3dObjectRecords: [board], miscFlatObjectRecords: [marker] } };
  const driver = { Position: 7, XPos: (38.4 + 2) / 0.025, YPos: -2, ZPos: (216 - 204.8 + 9) / 0.025 - 4096, TextureArchive: 184, TextureRecord: 25, FactionID: 8642, Flags: 0 };
  const f = gateFurniture(wall, (n) => (n === 'WALLAA08.RMB' ? block : null), (n) => (n === 'WALLAA08.RMB' ? { Misc3dObjectRecords: [], MiscFlatObjectRecords: [driver] } : null));
  assert.equal(f.models.length, 1);
  const at = (r) => [r.XPos * 0.025, (r.ZPos + 4096) * 0.025];
  // west (along -6.4) turns to north of an east gate; inside (-4) to its west
  assert.deepEqual(at(f.models[0]).map((v) => Math.round(v * 10) / 10), [296, 156.4]);
  assert.equal(f.models[0].YRotation, 100 - 512, 'turned a quarter clockwise with its gate');
  assert.equal(f.flats.length, 1, 'the start marker TS4\'s own, the driver carried');
  assert.equal(f.flats[0].FactionID, 8642);
  assert.deepEqual(at(f.flats[0]).map((v) => Math.round(v * 10) / 10), [309, 148], 'outside, two along: to the south');
  // two gates and two frames: each its nearest by bearing
  const two = { middle: [0, 0], frames: [{ name: 'A', block: [0, 0], at: [0, 100], out: [0, 1] }, { name: 'B', block: [0, 0], at: [100, 0], out: [1, 0] }], pieces: [{ model: WALL_MODELS.gate, at: [90, 10], out: [1, 0], stretch: 1 }, { model: WALL_MODELS.gate, at: [5, 95], out: [0, 1], stretch: 1 }] };
  const asked = [];
  // each a board 3 m inside its own gate
  const boardOf = (x, z, rot) => ({ rmbBlock: { misc3dObjectRecords: [{ modelId: '41739', modelIdNum: 41739, objectType: 0, xPos: x / 0.025, yPos: 0, zPos: z / 0.025 - 4096, xRotation: 0, yRotation: rot, zRotation: 0 }], miscFlatObjectRecords: [] } });
  const placed = gateFurniture(two, (n) => { asked.push(n); return n === 'A' ? boardOf(0, 97, 1000) : boardOf(97, 0, 2000); }, () => null).models;
  assert.deepEqual(asked.sort(), ['A', 'B']);
  const near = (m) => { const x = m.XPos * 0.025, z = (m.ZPos + 4096) * 0.025; return Math.hypot(x - 5, z - 95) < Math.hypot(x - 90, z - 10) ? 'north' : 'east'; };
  assert.deepEqual(placed.map((m) => [m.YRotation, near(m)]).sort(), [[1000, 'north'], [2000, 'east']], 'A\'s things at the gate by A, B\'s by B');
});

test('TS7 stood clear: a gate\'s things inside it moved further in together, those outside further out, by the least step clear of every wall and building cell; one that cannot go with its group its own nearest clear place, never across the wall (mutants: the group unmoved; the side unread; the fallback unlaid)', () => {
  const wall = { middle: [51.2, 0], frames: [{ name: 'G', block: [0, 0], at: [51.2, 51.2], out: [0, 1] }], pieces: [{ model: WALL_MODELS.gate, at: [51.2, 51.2], out: [0, 1], stretch: 1 }] };
  const rec = (a, b) => ({ ModelId: '41739', ModelIdNum: 41739, ObjectType: 0, XPos: (51.2 + a) / 0.025, YPos: 0, ZPos: (51.2 + b) / 0.025 - 4096, XRotation: 0, YRotation: 0, ZRotation: 0 });
  const extra = () => ({ Misc3dObjectRecords: [rec(-3, -5), rec(3, -5), rec(0, 6)], MiscFlatObjectRecords: [] });
  // the blocked cells: rows 28 to 35 (44.8 to 57.6 m north - the wall about 51.2) the whole way along
  const W = 64, H = 64, cells = new Uint8Array(W * H);
  for (let gz = 28; gz <= 35; gz++) for (let gx = 0; gx < W; gx++) cells[gz * W + gx] = 1;
  const f = gateFurniture(wall, null, extra, { cells, W, H });
  const z = f.models.map((r) => (r.ZPos + 4096) * 0.025);
  const x = f.models.map((r) => r.XPos * 0.025);
  const lo = 44.8 - GATE_CLEAR.model, hi = 57.6 + GATE_CLEAR.model;
  assert.ok(z[0] <= lo + 0.03 && z[0] > lo - GATE_CLEAR.step, `the inside pair clear, further in by the least step (${z[0].toFixed(2)})`);
  assert.equal(z[0], z[1], 'moved together');
  assert.deepEqual([x[0], x[1]], [48.2, 54.2], 'along as they stood');
  assert.ok(z[2] >= hi - 0.03 && z[2] < hi + GATE_CLEAR.step, `the outside one further out (${z[2].toFixed(2)})`);
  // a house behind one of the pair: it alone finds its own place, still inside
  for (let gz = 0; gz < 27; gz++) for (let gx = 0; gx < 32; gx++) cells[gz * W + gx] = 1;
  const g = gateFurniture(wall, null, extra, { cells, W, H });
  const free = (r) => { const px = r.XPos * 0.025, pz = (r.ZPos + 4096) * 0.025; for (let gz = 0; gz < H; gz++) for (let gx = 0; gx < W; gx++) if (cells[gz * W + gx] && Math.hypot(Math.max(gx * 1.6, Math.min(px, (gx + 1) * 1.6)) - px, Math.max(gz * 1.6, Math.min(pz, (gz + 1) * 1.6)) - pz) < GATE_CLEAR.model) return false; return true; };
  assert.ok(g.models.every(free), 'every one clear');
  assert.ok(g.models.slice(0, 2).every((r) => (r.ZPos + 4096) * 0.025 < 51.2), 'the pair still inside');
  assert.deepEqual(gateFurniture(wall, null, extra).models.map((r) => (r.ZPos + 4096) * 0.025).map((v) => Math.round(v * 10) / 10), [46.2, 46.2, 57.2], 'nothing blocked: where they were carried');
  // the blocked cells: the wall's and every town-map byte of its blocks but the ground flats'
  const bytes = new Uint8Array(4096);
  bytes[10 * 64 + 5] = 0x10; bytes[11 * 64 + 5] = 0xfb;
  const b = townBlockedCells({ exterior: { exteriorData: { width: 1, height: 1, blockNames: ['B.RMB'] } } }, { pieces: [] }, () => ({ fldHeader: { autoMapData: bytes } }));
  assert.equal(b.cells[(63 - 10) * 64 + 5], 1, 'a building\'s byte, on the walk grid\'s row');
  assert.equal(b.cells[(63 - 11) * 64 + 5], 0, 'a ground flat\'s none');
  assert.equal(b.cells.filter(Boolean).length, 1);
});

test('TS7 the carriages and the boards on the carrier: the mod\'s records on a gate while it is loaded, none else; a city walled on its outline a carriage town; the carrier\'s JSON its markers, then what stands at its gates (mutants: the switch unread; the carrier no carriage town; the furniture unlaid)', () => {
  const patch = { rebuilds: 'WALLAA08.RMB.json', ops: [['i', ['RmbBlock', 'Misc3dObjectRecords', 2], { ModelIdNum: 41214, XPos: 964, ZPos: -3236, YRotation: -690 }], ['i', ['RmbBlock', 'MiscFlatObjectRecords', 1], { XPos: 1075, ZPos: -3308, TextureArchive: 184, TextureRecord: 25, FactionID: 8642 }]] };
  let on = false;
  installImmersiveTravelGates([patch], [null], () => on);
  assert.equal(carriageRecordsOf('WALLAA08.RMB'), null, 'the mod not loaded');
  on = true;
  assert.equal(carriageRecordsOf('wallaa08.rmb').Misc3dObjectRecords[0].ModelIdNum, 41214);
  assert.equal(carriageRecordsOf('WALLAA09.RMB'), null);
  assert.equal(hasCarriageGate({ exterior: { exteriorData: { blockNames: [townWallBlockName(5), 'H.RMB'] } } }), true);
  assert.equal(hasCarriageGate({ exterior: { exteriorData: { blockNames: ['H.RMB'] } } }), false);
});

test('TS7 the ground under a carrier never read for the terrain (its wall made when it is laid out), a town\'s walk shut to its ground and its wall, and its yards placed on what that leaves (mutants: the carrier read; the yards unshut)', () => {
  const tile = { textureRecord: 2, tileBitfield: 2 };
  const plainBlock = { rmbBlock: { fldHeader: { groundData: { groundTiles: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => tile)) }, autoMapData: new Uint8Array(4096) }, misc3dObjectRecords: [], miscFlatObjectRecords: [] } };
  const names = [townWallBlockName(9), 'P.RMB'];
  const read = [];
  setLocationTiles({ capital: true, mapTableData: { locationType: 2 }, exterior: { exteriorData: { width: 2, height: 1, blockNames: names } } }, { getRmbBlockName: (l, x) => names[x] }, { checkName: (n) => n, getBlockIndex: (n) => names.indexOf(n), getBlock: (i) => { read.push(i); return plainBlock; } }, new Uint8Array(128 * 128));
  assert.deepEqual(read, [1], 'the carrier never read');
  // the walk shut: off the ground, and on the wall
  const loc = city(RING, 7777);
  const nav = new CityNavigation(3, 3);
  nav.grid.fill(7 << 4);
  const ground = new Uint8Array(128 * 128).fill(1);
  townWalkShut({ ...loc, outline: undefined }, ground)(nav);
  assert.ok(nav.grid.every((v) => v === 7 << 4), 'on its ground, no wall of its own: none shut');
  const off = new Uint8Array(128 * 128);
  townWalkShut({ ...loc, outline: undefined }, off)(nav);
  assert.ok(nav.grid.every((v) => v === 0), 'off its ground: all shut');
  // the yards: the shut taken
  let shut = 0;
  const layout = { width: 1, height: 1, blocks: [{ x: 0, y: 0, dfBlock: plainBlock }] };
  const g = townGroundOf(layout, {}, (n) => { shut++; n.grid.fill(0); });
  assert.equal(shut, 1);
  assert.ok(g.blocked.every((v) => v === 1), 'nothing left to place on');
  assert.equal(typeof registerTownWall, 'function');
});

test('TS7 with ARENA2: a town past the Bay\'s yards on its own ground - every yard of every sixth city and town on its outline\'s tiles with its walk shut, where some stood partly off it without (mutant: the yards unshut)', { skip: skipReal }, async () => {
  const { BlocksFile } = await import('../../src/formats/blocksFile.js');
  const { MapsFile } = await import('../../src/formats/mapsFile.js');
  const { bindWorldDataBlocks } = await import('../../src/formats/worldData/worldDataReplacement.js');
  const { installTownOutline } = await import('../../src/world/townOutline.js');
  const { standTownWall } = await import('../../src/world/townWalls.js');
  const { locationShapeField, getLocationTerrainTileOrigin } = await import('../../src/world/terrain/terrainTiles.js');
  const { layoutLocation } = await import('../../src/world/locationLayout.js');
  const { yardSitesOn } = await import('../../src/world/merchantYards/merchantYardSites.js');
  const { arenaTemplates } = await import('../../src/world/arenaLocations.js');
  const bytes = (n) => new Uint8Array(readFileSync(join(ARENA2, n)));
  const blocks = new BlocksFile(); blocks.load(bytes('BLOCKS.BSA'));
  const maps = new MapsFile(); maps.load(bytes('MAPS.BSA'), bytes('CLIMATE.PAK'), bytes('POLITIC.PAK')); maps.autoDiscard = false;
  installWorldDataReplacement(); bindWorldDataBlocks(blocks); installTownOutline();
  const rows = [];
  for (let r = 0; r < 62; r++) { const reg = maps.getRegion(r); if (!reg) continue; for (let l = 0; l < reg.locationCount; l++) { const loc = maps.getLocation(r, l); if (loc) rows.push(loc); } }
  const T = arenaTemplates(rows);
  const io = { classicOf: (n) => blocks.readClassicBlock(blocks.getBlockIndex(blocks.checkName(n))), servedOf: (n) => blocks.getBlockByName(n) };
  let yards = 0, offWithout = 0;
  for (const kind of ['city-state', 'town']) {
    for (let j = 0; j < T[kind].length; j += 6) {
      const t = T[kind][j], mapId = ((0xa7 << 20) | (500000 + j + (kind === 'town' ? 5000 : 0))) >>> 0;
      const loc = outlineTownLocation({ ...t, mapTableData: { ...t.mapTableData, mapId } }, io);
      if (loc.outline?.walled) standTownWall(loc, t.exterior.exteriorData.blockNames, io, townOutlineBlockJson);
      const yl = layoutLocation(loc, maps, blocks), ed = loc.exterior.exteriorData;
      const shape = locationShapeField(loc, (bx, by) => { const nm = ed.blockNames[by * ed.width + bx]; return isWallCarrier(nm) ? null : blocks.getBlockByName(nm)?.rmbBlock ?? null; });
      const ground = new Uint8Array(128 * 128);
      for (let i = 0; i < ground.length; i++) ground[i] = shape?.[i] ? 1 : 0;
      const o = getLocationTerrainTileOrigin(loc);
      const off = (s) => { for (let gy = s.gy; gy < s.gy + s.nz; gy++) for (let gx = s.gx; gx < s.gx + s.nx; gx++) if (!ground[(o.x + (gx >> 2)) + (o.y + (gy >> 2)) * 128]) return true; return false; };
      for (const s of yardSitesOn(townGroundOf(yl, {}, townWalkShut(loc, ground)))) { yards++; assert.ok(!off(s), `${t.name}: its ${s.kind} on its ground`); }
      offWithout += yardSitesOn(townGroundOf(yl, {})).filter(off).length;
    }
  }
  assert.ok(yards > 300, `${yards} yards`);
  assert.ok(offWithout > 0, 'without the shut some stood off it');
});
