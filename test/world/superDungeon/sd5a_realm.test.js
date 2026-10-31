// SD5a (2026-10-07, the Super Dungeons arc; bible/11-Multiplayer/Super-Dungeons.md section 7): THE SHATTERED HOUR - the
// made level beyond a Hollow's Rift (world/superDungeon/sdRealm.js, world/superDungeon/sdRealmArt.js; its frame net/superDungeon/sdBrain.js) and its ways in and
// out. The Burning Court's law: the dungeon host with a level made in code - a made location, an empty block, the Hour's
// own mesh, floors, edge, lamps, light and air - its room the relay's realm `sd:<s>`; the Court's refusals beside the
// Court's own (rest, save, map, Mark, Recall, regeneration). In by the Rift (out of the Hollow, to its pixel, into the
// Hour, under the veil); back by the Rift at the Threshold's back (out of the Hour, into the Hollow by its door, beside
// its Rift); out by a death or the Hour's end before the Hollow's door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SD_REALM_ORIGIN, SD_THRESHOLD, SD_WALK, SD_ORRERY, SD_STEPS, SD_ARENA, SD_PILLAR_R, SD_PILLAR_H, realmToDungeon, dungeonToRealm } from '../../../src/net/superDungeon/sdBrain.js';
import {
  sdRealmLocation, isSdRealm, sdRealmBlock, sdRealmBlocks, buildRealmModel, realmFloorTris, realmClamp, realmArena, realmLights, realmLightsNear,
  realmLighting, SD_REALM_ARCHIVE, SD_REALM_BLOCK, SD_REALM_BLOCK_INDEX, SD_REALM_LOCATION_ID, SD_ARRIVE_Z, SD_WAY_BACK_Z, SD_WAY_BACK_SIZE,
  SD_REALM_TEXT, SD_REALM_FLOORS, SD_REALM_FOG, SD_LAMP_COLOR, SD_LAMP_H, SD_ROOT_DEPTH, SD_LIP,
  SD_REALM_FLOOR_RECORD, SD_REALM_BRASS_RECORD, SD_REALM_ROOT_RECORD, SD_REALM_DIAL_RECORD, SD_REALM_ARENA_RECORD, SD_REALM_COBBLE_RECORD, SD_REALM_EDGE_RECORD, SD_REALM_PILLAR_RECORD,
  SD_REALM_TRILIGHT, SD_REALM_KEY_LIGHT, SD_DIAL_INLAY,
} from '../../../src/world/superDungeon/sdRealm.js';
import { SD_HALL_GLOW_RECORD } from '../../../src/world/superDungeon/sdHallArt.js';
import { buildHangModel } from '../../../src/world/superDungeon/sdIslandModel.js';
import { realmArt, SD_ART_SIZE, SD_DIAL_SIZE, SD_ROOT_ART_H } from '../../../src/world/superDungeon/sdRealmArt.js';
import { gateArenaLocation, isGateArena, GATE_ARENA_LOCATION_ID, GATE_ARENA_BLOCK_INDEX } from '../../../src/world/gate/gateArena.js';
import { madeDungeon, dungeonTierLabel } from '../../../src/world/dungeon/dungeonLabel.js';
import { sdRoomKey, SD_NO_CLOSED } from '../../../src/net/superDungeon/sdLaw.js';
import { madeLevelRule, madeLevelSays } from '../../../src/systems/madeLevel.js';   // EG-H2: the made level's law the hosts' doors ask

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
/** SD-LOOK S11: the Threshold's hang (world/superDungeon/sdIslandModel.js), the realm's frame. */
const hangVerts = () => { const m = buildHangModel('threshold'), out = []; for (let i = 0; i < m.positions.length; i += 3) out.push(dungeonToRealm(m.positions[i], m.positions[i + 1], m.positions[i + 2])); return out; };
const HOLLOW = { key: '303,202', px: 303, py: 202, name: 'The Stopped Bell' };

test('SD5a the frame: the Threshold at the made block\'s middle, the walk, the Orrery\'s hall, the Steps\' span and the Last Moment\'s arena laid along +z - the stages of section 7 (mutants: a stage moved)', () => {
  assert.deepEqual(SD_REALM_ORIGIN, [25.6, 0, 25.6], 'the made block\'s middle, as the court\'s centre is');
  assert.deepEqual(SD_THRESHOLD, { x: 0, z: 0, r: 8 });
  assert.deepEqual(SD_WALK, { x: 0, z0: 7, z1: 25, halfW: 2 });
  assert.deepEqual(SD_ORRERY, { x: 0, z: 42, r: 18 });
  assert.equal(SD_ORRERY.z - SD_ORRERY.r, 24, 'z 24');
  assert.equal(SD_ORRERY.z + SD_ORRERY.r, 60, 'to z 60');
  assert.deepEqual(SD_STEPS, { z0: 60, z1: 220 });   // SD7a (PIN MOVED): the course the engine can jump runs to z 220
  assert.deepEqual(SD_ARENA, { x: 0, z: 246, r: 26 });   // SD7a (PIN MOVED): the arena moved out past it
  assert.ok(SD_ARENA.z - SD_ARENA.r >= SD_STEPS.z1 && SD_ARENA.z + SD_ARENA.r <= 272, 'the arena within z 220-272');
  assert.ok(SD_WALK.z0 < SD_THRESHOLD.r && SD_WALK.z1 > SD_ORRERY.z - SD_ORRERY.r, 'the walk reaches into both floors');
  assert.deepEqual(realmToDungeon(1, 2, 3), [26.6, 2, 28.6]);
  assert.deepEqual(dungeonToRealm(...realmToDungeon(-4, 0, 99)), [-4, 0, 99]);
});

test('SD5a the made location: the Shattered Hour, one made block, map id 0 (no world room keys off it), its slot and the Hollow it was entered from - the court\'s shape, its own id; no tier, no size (mutants: the court\'s id; the slot unread)', () => {
  const loc = sdRealmLocation({ s: 7, hollow: { ...HOLLOW, extra: 1 }, regionIndex: 17, regionName: 'Alik\'r Desert', climate: { worldClimate: 226, climateType: 1 } });
  assert.equal(loc.name, 'The Shattered Hour');
  assert.equal(loc.hasDungeon, true);
  assert.equal(loc.mapTableData.mapId, 0);
  assert.equal(loc.dungeon.recordElement.header.locationId, SD_REALM_LOCATION_ID);
  assert.deepEqual(loc.dungeon.blocks.map((b) => [b.blockName, b.isStartingBlock]), [[SD_REALM_BLOCK, true]]);
  assert.equal(loc.sdRealm, 7);
  assert.deepEqual(loc.sdHollow, HOLLOW, 'where the way back leads - its own copy');
  assert.deepEqual([loc.regionIndex, loc.regionName, loc.climate], [17, 'Alik\'r Desert', { worldClimate: 226, climateType: 1 }]);
  assert.ok(isSdRealm(loc));
  assert.ok(!isSdRealm({ ...loc, sdRealm: undefined }), 'no slot: no realm');
  assert.ok(!isSdRealm(gateArenaLocation({ day: 7 })), 'the court is the court');
  assert.ok(!isGateArena(loc));
  assert.notEqual(SD_REALM_LOCATION_ID, GATE_ARENA_LOCATION_ID);
  assert.notEqual(SD_REALM_BLOCK_INDEX, GATE_ARENA_BLOCK_INDEX);
  assert.deepEqual([SD_REALM_LOCATION_ID, SD_REALM_BLOCK_INDEX, SD_REALM_ARCHIVE], [0x7ffff200, 900200, 38151], 'section 7\'s numbers');
  assert.ok(madeDungeon(loc), 'a place the port made');
  assert.equal(dungeonTierLabel(loc), null, 'no Regular Dungeon to anyone walking in');
  assert.equal(sdRealmLocation({ s: 3 }).sdHollow, null);
});

test('SD5a the empty block: its start marker on the Threshold a step ahead of its centre, no model, no water, no castle; the blocks file answers its one name and hands every other to the real one (mutants: the marker off the Threshold)', () => {
  const b = sdRealmBlock();
  assert.equal(b.name, SD_REALM_BLOCK);
  assert.deepEqual(b.rdbBlock.modelReferenceList, []);
  const [marker] = b.rdbBlock.objectRootList[0].rdbObjects;
  const [x, , z] = realmToDungeon(0, 0, SD_ARRIVE_Z);
  assert.deepEqual([marker.xPos, marker.zPos], [Math.round(x * 40), Math.round(z * 40)]);
  assert.deepEqual([marker.resources.flatResource.textureArchive, marker.resources.flatResource.textureRecord], [199, 10], 'the editor\'s start marker');
  assert.deepEqual([marker.resources.flatResource.soundIndex, marker.resources.flatResource.magnitude], [0, 0], 'no water, no castle');
  assert.ok(Math.hypot(x - SD_REALM_ORIGIN[0], z - SD_REALM_ORIGIN[2]) < SD_THRESHOLD.r);
  const real = { getBlockIndex: (n) => (n === 'N0000001.RDB' ? 5 : -1), getBlock: (i) => (i === 5 ? { name: 'real' } : null) };
  const f = sdRealmBlocks(real);
  assert.equal(f.getBlockIndex(SD_REALM_BLOCK), SD_REALM_BLOCK_INDEX);
  assert.equal(f.getBlock(SD_REALM_BLOCK_INDEX).name, SD_REALM_BLOCK);
  assert.equal(f.getBlockIndex('N0000001.RDB'), 5);
  assert.deepEqual(f.getBlock(5), { name: 'real' });
  assert.equal(sdRealmBlocks(null).getBlockIndex('X'), -1);
});

test('SD5a the Hour\'s mesh: its five records and its lamps\' glow, of its own archive, 32-bit indices; the floors\' tops at y 0, the dial over the Orrery\'s hall, the arena\'s plates over the arena, the pillars standing, the islands\' lips under their rims and the roots hanging into the void (mutants: the dial off the hall; no lip)', () => {
  const m = buildRealmModel();
  assert.ok(m.indices instanceof Uint32Array, 'the renderer\'s one index type (WBX1)');
  assert.deepEqual(m.subMeshes.map((s) => s.textureRecord), [SD_REALM_FLOOR_RECORD, SD_REALM_BRASS_RECORD, SD_REALM_ROOT_RECORD, SD_REALM_DIAL_RECORD, SD_REALM_ARENA_RECORD, SD_HALL_GLOW_RECORD.brass, SD_REALM_COBBLE_RECORD, SD_REALM_EDGE_RECORD, SD_REALM_PILLAR_RECORD]);   // AUDIT SD II (L2 F14 - PIN MOVED): the lamps' heads wear the hands' brass glow; SD-LOOK (PIN MOVED): the Threshold's cobbles and the gold edge line; PIN MOVED (SD-LOOK S7): the pillars' basalt
  assert.ok(m.subMeshes.every((s) => s.textureArchive === SD_REALM_ARCHIVE && s.primitiveCount > 0));
  assert.ok(m.positions.every(Number.isFinite) && m.normals.every(Number.isFinite) && m.uvs.every(Number.isFinite));
  const verts = (rec) => { const s = m.subMeshes.find((x) => x.textureRecord === rec); const out = []; for (let i = s.startIndex; i < s.startIndex + s.primitiveCount * 3; i++) out.push(dungeonToRealm(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2])); return out; };
  assert.ok(verts(SD_REALM_FLOOR_RECORD).every((p) => close(p[1], 0)), 'the floors\' tops at y 0');
  assert.ok(verts(SD_REALM_DIAL_RECORD).every((p) => close(p[1], 0) && Math.hypot(p[0] - SD_ORRERY.x, p[2] - SD_ORRERY.z) <= SD_ORRERY.r + 1e-3), 'the dial is the Orrery\'s floor');   // the mesh is 32-bit: a millimetre's slack
  assert.ok(verts(SD_REALM_ARENA_RECORD).every((p) => close(p[1], 0) && Math.hypot(p[0] - SD_ARENA.x, p[2] - SD_ARENA.z) <= SD_ARENA.r + 1e-3), 'the arena\'s');
  const brass = verts(SD_REALM_BRASS_RECORD);
  assert.ok(brass.some((p) => close(p[1], SD_PILLAR_H) && close(Math.hypot(p[0] - SD_ARENA.x, p[2] - SD_ARENA.z), SD_PILLAR_R, 1.2)), 'the pillars\' tops');
  // PIN MOVED (SD-LOOK S11): the island keeps its torn lip, SD_LIP of stone under its rim; what hangs under it is the hang's
  // (world/superDungeon/sdIslandModel.js - a noShadow mesh a stage, its main spire SD_ROOT_DEPTH under the Threshold: test/world/superDungeon/sd25_hang.test.js)
  for (const isl of [SD_THRESHOLD, SD_ORRERY, SD_ARENA]) assert.ok(verts(SD_REALM_ROOT_RECORD).filter((p) => close(p[1], -SD_LIP, 1e-4) && close(Math.hypot(p[0] - isl.x, p[2] - isl.z), isl.r, 1e-3)).length >= 48, 'each island\'s lip under its rim, all round');
  assert.ok(Math.min(...hangVerts().map((p) => p[1])) <= -SD_ROOT_DEPTH, 'the roots hang into the void');
  // the dial's uv: the whole image over the whole hall
  const s = m.subMeshes.find((x) => x.textureRecord === SD_REALM_DIAL_RECORD);
  const uv = [];
  for (let i = s.startIndex; i < s.startIndex + s.primitiveCount * 3; i++) uv.push([m.uvs[i * 2], m.uvs[i * 2 + 1]]);
  assert.ok(uv.every(([u, v]) => u >= -1e-4 && u <= 1 + 1e-4 && v >= -1e-4 && v <= 1 + 1e-4));
});

test('SD5a the floors, for the collider: the Threshold, the walk, the Orrery\'s hall and the arena, every stage\'s centre over one of them, nothing over the void between (mutants: a floor left out)', () => {
  const t = realmFloorTris();
  assert.equal(t.length % 9, 0);
  const tris = [];
  for (let i = 0; i < t.length; i += 9) tris.push([[t[i], t[i + 2]], [t[i + 3], t[i + 5]], [t[i + 6], t[i + 8]]]);
  assert.ok([...t].filter((_, i) => i % 3 === 1).every((y) => y === 0), 'level at y 0');
  const sign = (p, a, b) => (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const inTri = (p, [a, b, c]) => { const d1 = sign(p, a, b), d2 = sign(p, b, c), d3 = sign(p, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  const floored = (x, z) => { const [dx, , dz] = realmToDungeon(x, 0, z); return tris.some((tr) => inTri([dx, dz], tr)); };
  for (const [x, z, what] of [[0, 0, 'the Threshold'], [0, 16, 'the walk'], [1.5, 16, 'the walk\'s edge'], [0, 42, 'the Orrery'], [12, 42, 'its hall'], [0, SD_ARENA.z, 'the arena'], [20, SD_ARENA.z, 'its rim']]   /* SD7a (PIN MOVED): the arena at its own place */) assert.ok(floored(x, z), what);
  for (const [x, z, what] of [[0, 120, 'the Steps\' void'], [4, 16, 'beside the walk'], [0, -9, 'behind the Threshold']]) assert.ok(!floored(x, z), what);
});

test('SD5a the edge: a body on the Threshold, the walk or the Orrery\'s hall is left be; off them, put back to the nearest, its capsule off the rim - the arena not among them until the Steps reach it; the motor\'s arena carries the clamp (mutants: the walk unwalked; the inset ignored)', () => {
  const at = (x, z) => realmToDungeon(x, 0, z);
  assert.equal(realmClamp(at(0, 0), 0.3), null);
  assert.equal(realmClamp(at(0, 16), 0.3), null, 'the walk');
  assert.equal(realmClamp(at(-10, 42), 0.3), null, 'the hall');
  const off = realmClamp(at(12, 0), 0.3);
  assert.ok(close(Math.hypot(off[0] - SD_REALM_ORIGIN[0], off[1] - SD_REALM_ORIGIN[2]), SD_THRESHOLD.r - 0.3), 'back on the Threshold\'s rim, less the capsule');
  const side = realmClamp(at(3, 16), 0.3);
  assert.deepEqual(side.map((v) => Math.round(v * 1000) / 1000), [SD_REALM_ORIGIN[0] + SD_WALK.halfW - 0.3, SD_REALM_ORIGIN[2] + 16], 'onto the walk\'s side');
  const between = realmClamp(at(0, 100), 0.3);
  assert.ok(close(between[1] - SD_REALM_ORIGIN[2], SD_ORRERY.z + SD_ORRERY.r - 0.3), 'over the void: back to the hall\'s far rim');
  assert.notEqual(realmClamp(at(0, 220), 0.3), null, 'the arena is no floor of the Hour yet (SD8 lays it among them)');
  assert.deepEqual(SD_REALM_FLOORS.map((f) => f.kind), ['disc', 'band', 'disc']);
  const a = realmArena();
  assert.ok(a.radius > 0 && typeof a.clamp === 'function');
  assert.deepEqual(a.clamp(at(12, 0), 0.3), off);
  assert.equal(a.clamp(at(0, 16)), null);
});

test('SD5a the lamps and the light: the Threshold\'s four and the hall\'s and the arena\'s eight, warm brass at a lamp\'s height inside each rim; the Hour\'s trilight and its clock-face\'s key, set each frame; its haze (mutants: the lamps outside the rims)', () => {
  const L = realmLights();
  assert.equal(L.length, 20);
  for (const l of L) {
    const [x, y, z] = dungeonToRealm(l.x, l.y, l.z);
    assert.equal(y, SD_LAMP_H);
    assert.deepEqual(l.color, [...SD_LAMP_COLOR]);
    const on = [SD_THRESHOLD, SD_ORRERY, SD_ARENA].some((s) => Math.hypot(x - s.x, z - s.z) < s.r);
    assert.ok(on, 'inside a rim');
  }
  const near = realmLightsNear(realmToDungeon(0, 0, 220));
  assert.ok(Math.hypot(near[0].x - SD_REALM_ORIGIN[0], near[0].z - SD_REALM_ORIGIN[2] - SD_ARENA.z) < SD_ARENA.r, 'the nearest first');
  const a = realmLighting();
  a.tri.sky[0] = 9;   // a host that wrote into it
  const b = realmLighting();
  assert.equal(a, b, 'the frame\'s one object (AUDIT SD II, L2 F9 - PIN MOVED: it was fresh arrays a frame)');
  assert.deepEqual([b.tri.sky, b.tri.equator, b.tri.ground], [[...SD_REALM_TRILIGHT.sky], [...SD_REALM_TRILIGHT.equator], [...SD_REALM_TRILIGHT.ground]], 'set again each frame');
  assert.deepEqual([b.key.scale, b.key.dir, b.key.color], [SD_REALM_KEY_LIGHT.scale, [...SD_REALM_KEY_LIGHT.dir], [...SD_REALM_KEY_LIGHT.color]]);
  assert.ok(close(Math.hypot(...a.key.dir), 1));
  assert.ok(a.key.dir[2] > 0 && a.key.dir[1] > 0, 'from the clock-face, high behind the arena');
  assert.ok(a.tri.sky[0] > a.tri.sky[2] && a.tri.ground[0] > a.tri.sky[0] && a.tri.ground[0] > 2 * a.tri.ground[2], 'brass over; SD-LOOK (PIN MOVED): the furnace under, warm, brighter than the void over (it was dark under)');
  assert.equal(SD_REALM_FOG.mode, 'exp');
});

test('SD5a the art: five textures made in code, the same every boot - the floor, brass, the roots, the Hour-dial over the whole hall and the arena\'s cracked brass; brass glows a little of its own (mutants: the dial\'s twelfth unlit)', () => {
  const art = realmArt();
  assert.deepEqual(art.map(([r]) => r), [0, 1, 2, 3, 4, 31, 32, 56, 80, 81]);   // SD-LOOK (PIN MOVED): the Threshold's cobbles, the edge line's gold; PIN MOVED (SD-LOOK S7): the pillars' basalt; PIN MOVED (SD-LOOK S11): the Works' brass and the chains (world/superDungeon/sdHangArt.js)
  for (const [r, a] of art) {
    const S = r === 3 ? SD_DIAL_SIZE : r === 32 ? 8 : r === 81 ? 32 : SD_ART_SIZE, H = r === 2 ? SD_ROOT_ART_H : S;   // SD-LOOK (PIN MOVED): the root a strip, top to tip; S11: the chains' 32
    assert.equal(a.albedo.width, S); assert.equal(a.emission.width, S);
    assert.equal(a.albedo.colors.length, S * H * 4);
  }
  assert.deepEqual(realmArt()[3][1].albedo.colors, art[3][1].albedo.colors, 'the same every boot');
  const brass = art[1][1].emission.colors;
  assert.ok(brass.some((v, i) => i % 4 === 0 && v > 0), 'brass glows');
  // SD-LOOK (PIN MOVED): the twelfth hour, toward the arena (+z), its mark the widest - brass laid in the floor now, not
  // painted at 7 texels a metre (world/superDungeon/sdRealm.js SD_DIAL_INLAY): a point just off its middle is on it at twelve and off
  // it at three; the dial's art is quiet stone with no light of its own
  const dial = art[3][1];
  assert.equal(SD_DIAL_SIZE, 256);
  assert.ok(dial.emission.colors.every((v, i) => i % 4 === 3 || v === 0), 'the dial\'s stone: no light of its own');
  const m = buildRealmModel(), b = m.subMeshes.find((x) => x.textureRecord === SD_REALM_BRASS_RECORD);
  const tris = [];
  for (let i = b.startIndex; i < b.startIndex + b.primitiveCount * 3; i += 3) {
    const P = [0, 1, 2].map((j) => dungeonToRealm(m.positions[(i + j) * 3], m.positions[(i + j) * 3 + 1], m.positions[(i + j) * 3 + 2]));
    if (P.every((p) => Math.abs(p[1] - SD_DIAL_INLAY.y) < 1e-4)) tris.push(P);
  }
  const on = (x, z) => tris.some(([a, c, d]) => { const s1 = (x - c[0]) * (a[2] - c[2]) - (a[0] - c[0]) * (z - c[2]), s2 = (x - d[0]) * (c[2] - d[2]) - (c[0] - d[0]) * (z - d[2]), s3 = (x - a[0]) * (d[2] - a[2]) - (d[0] - a[0]) * (z - a[2]); return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0); });
  const R = SD_ORRERY.r, rr = 0.92 * R, off = 0.03 * R;
  assert.ok(on(SD_ORRERY.x, SD_ORRERY.z + rr) && on(SD_ORRERY.x + off, SD_ORRERY.z + rr), 'beside the twelfth hour\'s middle, still on it');
  assert.ok(on(SD_ORRERY.x + rr, SD_ORRERY.z) && !on(SD_ORRERY.x + rr, SD_ORRERY.z - off), 'as far beside the third\'s, off it');
  assert.ok(!on(SD_ORRERY.x, SD_ORRERY.z), 'the hall\'s heart bare');
});

test('SD5a the dungeon host by source: the Hour\'s refusals beside the court\'s (map, rest, save, the pause\'s Save), no drip, no map slot, no fire; its way back the Hollow\'s own Rift at the Threshold\'s back, to the Hollow; the landing beside a Hollow\'s Rift kept for the way back (mutants: a rest in the Hour; the way back unstood)', () => {
  for (const [rule, word] of [['automap', SD_REALM_TEXT.noMap], ['rest', SD_REALM_TEXT.noRest], ['save', SD_REALM_TEXT.noSave]]) assert.deepEqual([madeLevelRule('hour', rule), madeLevelSays('hour', rule)], [rule === 'automap' ? 'off' : 'refused', word], rule);
  assert.ok(SD_WAY_BACK_Z < 0 && Math.abs(SD_WAY_BACK_Z) < SD_THRESHOLD.r && SD_WAY_BACK_SIZE < 2 * SD_THRESHOLD.r, 'at the Threshold\'s back, on it');
  assert.deepEqual(SD_REALM_TEXT, {
    wayBack: 'To the Abyss Dungeon', noRest: 'You cannot rest in the Shattered Hour.', noSave: 'You cannot save in the Shattered Hour.',
    noMap: 'You cannot map the Shattered Hour.', noMark: 'You cannot set a Mark in the Shattered Hour.',
    noRecall: 'Nothing answers a Recall in the Shattered Hour.', lost: 'The way to the Shattered Hour is lost.',
    died: 'The Shattered Hour casts you out. You wake before the Abyss Dungeon\'s door.',   // PIN MOVED (SD-BACK, 2026-10-28): no longer for good - its Rift takes you back to your own Hour; AUDIT SD II (L6 F4, PIN MOVED): a death in the Hour is the Hour's; SD-ONELIFE (PIN MOVED): and final; AUDIT SD III (T15, PIN MOVED): the player's word for it, Abyss Dungeon
    noCompanions: 'Your companions cannot follow you through the Rift.',   // SD-ALONE (PIN MOVED): no companion through the Rift (test/scenes/sd21_alone.test.js)
  });
});

test('SD5a the mode machine by source: into the Hour from the open world (its made location, its blocks file, its room the relay\'s realm), the Hour stood before the marker is read, out of it before the Hollow\'s door, its light, air and lamps every frame, its room identity, its slot, and the doors the world host takes (mutants: the room a dungeon\'s; the Hour unstood; out at no door)', () => {
  assert.equal(sdRoomKey(7, '0123456789abcdef'), 'sd:7.0123456789abcdef');   // PIN MOVED: SD-PARTY - a party's own Hour
});

test('SD5a the world host by source: the Rift\'s door; the doors out of the Hour; its room the relay\'s realm; no Mark, no Recall, regeneration held; its floors an edge; the Hollow stands while I stand in its Hour, so its end casts me out of either (mutants: a Recall out of the Hour; the room a dungeon\'s; left in a room that refused me)', () => {
  assert.deepEqual([madeLevelRule('hour', 'says'), madeLevelRule('hour', 'mark'), madeLevelSays('hour', 'mark'), madeLevelRule('hour', 'recall'), madeLevelSays('hour', 'recall')], ['hour', 'refused', SD_REALM_TEXT.noMark, 'refused', SD_REALM_TEXT.noRecall]);
  assert.equal(madeLevelRule('hour', 'regen'), 'held');
});
