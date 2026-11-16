// FIELD BUGS 2026-10-16b STALL-SHAPE (Discord, 2026-10-15 9:59 PM: "market stalls all shifted into the ground/walls",
// "at least the lawn decoration owns" - a stall's awning low over the street, a stall-keeper standing inside it; a red
// awning against a wall, its counter half buried).
//
// TEMPLE-STEPS (FIELD BUGS 2026-10-15f) stood the RMB Resource Pack's stalls at their prefabs' 0.75 about Unity's own
// origin - the box right, the shape inside it the port's guess: a counter 0.75 m high at the front's foot (the author's
// goods 0.3 m over it), the awning's low edge at 1.84 m, and a bench 0.53 m high where the stall-keeper stands; the
// pack's second stall (53113 on, no counter) given the counter all the same, over the goods its author laid on the
// ground.
//
// The stand-in is now the pack's stall, measured off its FBX (world/townStandIns.js RMBRP_STALL_FRAME), its second
// mesh its own.
// No game data here: the packs' records are carried whole in the vendored packs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

import { ROW_CODECS } from '../../src/formats/worldData/worldDataPack.js';
import { blockFromJson } from '../../src/formats/worldData/worldDataReplacement.js';
import { layoutRmbBlock } from '../../src/world/rmbLayout.js';
import { collectMiscFlats } from '../../src/world/rmbFlats.js';
import { isNpcFlat } from '../../src/world/npcFlatArchives.js';
import {
  RMBRP_PIECES, RMBRP_STALLS, RMBRP_STALL_SCALE, RMBRP_STALL_FRAME, RMBRP_STALL_OPEN_FIRST, RMBRP_STALL_OPEN_SHIFT,
} from '../../src/world/townStandIns.js';
import { localAabb } from '../../src/render/frustum.js';
import { placedSolid, depthInside, TOUCH_M } from '../../tools/townSolidsSweep.mjs';

const S = RMBRP_STALL_SCALE;
const STALL_BOX = [-2.0625, 0, -1.86, 0.3, 3.3, 1.8];
const OPEN_STALL_BOX = [-2.2125, 0, -1.8105, -0.0615, 3.4545, 1.8495];
const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;
const verts = (m) => { const P = []; for (let i = 0; i < m.positions.length; i += 3) P.push([m.positions[i], m.positions[i + 1], m.positions[i + 2]]); return P; };
const tris = (m) => { const P = verts(m), T = []; for (let t = 0; t < m.indices.length; t += 3) T.push([P[m.indices[t]], P[m.indices[t + 1]], P[m.indices[t + 2]]]); return T; };
const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const inside2 = ([x0, x1], [z0, z1], x, z) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6;
/** The highest face of the mesh over (x, z) at or under `y`, or -Infinity. */
function faceUnder(T, x, z, y) {
  let best = -Infinity;
  for (const [a, b, c] of T) {
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const h = l1 * a[1] + l2 * b[1] + l3 * c[1];
    if (h <= y + 1e-6 && h > best) best = h;
  }
  return best;
}

// ---- the stand-in ---------------------------------------------------------------------------------------------------
test('STALL-SHAPE: the stand-in is the pack\'s stall, measured off its FBX - posts 0.375 m square, a beam and a lintel, the awning between their tops, its counter\'s top 1.04 m over the origin, the front\'s headroom 2.17 m, nothing low but the posts and the counter (no bench); the second mesh (53113 on) the same frame shifted, no counter', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(RMBRP_STALL_FRAME)), {
    back: [-2.75, -2.382], front: [-0.257, 0.118], sides: [[-2.48, -2.105], [2.02, 2.4]], tops: [4.4, 3.638],
    beam: [3.76, 4.138], lintel: [3.01, 3.388], valance: 0.5, counter: { x: [-1.07, 0.4], z: [-1.792, 1.708], top: 1.388 },
  });
  assert.equal(RMBRP_STALL_OPEN_FIRST, 53113);
  assert.deepEqual([...RMBRP_STALL_OPEN_SHIFT], [-0.2, 0.206, 0.066]);
  const F = RMBRP_STALL_FRAME;
  for (const [id] of Object.entries(RMBRP_STALLS)) {
    const open = Number(id) >= RMBRP_STALL_OPEN_FIRST, [dx, dy, dz] = open ? RMBRP_STALL_OPEN_SHIFT : [0, 0, 0];
    const mesh = RMBRP_PIECES[id](), P = verts(mesh), T = tris(mesh);
    const posts = [F.back, F.front].flatMap((x) => F.sides.map((z) => [x.map((v) => (v + dx) * S), z.map((v) => (v + dz) * S)]));
    const counter = [F.counter.x.map((v) => v * S), F.counter.z.map((v) => v * S)];
    // nothing under 1.5 m but a post's or the counter's
    for (const [x, y, z] of P) {
      if (y >= 1.5) continue;
      assert.ok(posts.some(([px, pz]) => inside2(px, pz, x, z)) || (!open && inside2(counter[0], counter[1], x, z)), `${id}: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) - a post's or the counter's (no bench)`);
    }
    // every post stands on the origin
    for (const [px, pz] of posts) assert.ok(near(Math.min(...P.filter(([x, , z]) => inside2(px, pz, x, z)).map((p) => p[1])), 0, 1e-6), `${id}: the post at ${px} on the origin`);
    assert.ok(near(Math.min(...P.map((p) => p[1])), 0, 1e-6), `${id}: on the origin`);
    // the counter's top (where the author lays the goods), or none
    const top = faceUnder(T, -0.25, 0, 2);
    assert.ok(open ? top === -Infinity : near(top, 1.388 * S, 1e-5), `${id}: the counter's top ${top}`);
    // the lowest thing over the stall's head - the lintel's fringe at the front
    const over = Math.min(...P.map((p) => p[1]).filter((y) => y > 1.5));
    assert.ok(near(over, (3.388 - 0.5 + dy) * S, 1e-5), `${id}: the front's headroom ${over}`);
    // the awning: from the beam's top down to the lintel's
    assert.ok(near(Math.max(...P.filter(([x]) => near(x, (F.back[1] + dx) * S, 1e-5)).map((p) => p[1])), (F.tops[0] + dy) * S, 1e-5), `${id}: the back posts' tops`);
    const box = localAabb(mesh.positions);
    assert.deepEqual([...box].map((v) => +v.toFixed(4)), (open ? OPEN_STALL_BOX : STALL_BOX), `${id}: its box`);
  }
  assert.ok(near(1.388 * S, 1.041, 1e-9) && near((3.388 - 0.5) * S, 2.166, 1e-9));
});

// ---- the author's own stalls ----------------------------------------------------------------------------------------
const packs = Object.fromEntries(['beautiful-villages', 'beautiful-cities'].map((v) => [v, JSON.parse(zlib.gunzipSync(readFileSync(new URL(`../../vendor/${v}/WorldDataPack/${v}.pack.json.gz`, import.meta.url))).toString('utf8'))]));
const Pj = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
function whole(pack, name, key) {
  const nodes = (pack._nodes ??= pack.nodes.map(Pj));
  const expand = (v) => {
    if (Array.isArray(v)) return v.map(expand);
    if (!v || typeof v !== 'object') return v;
    const keys = Object.keys(v);
    assert.ok(!keys.includes('$c') && !keys.includes('$o'), `${name}: a record carried whole, not read from the player's BLOCKS.BSA`);
    if (v.$n !== undefined) return expand(nodes[v.$n]);
    const k = keys.find((kk) => ROW_CODECS[kk]);
    if (k) return v[k].map((row) => (Array.isArray(row) || typeof row === 'number' ? ROW_CODECS[k](row) : expand(row)));
    return Object.fromEntries(keys.map((kk) => [kk, expand(v[kk])]));
  };
  for (let n = `${name}.json`; n;) {
    const [, base, ops] = Pj(pack.files[n]);
    const op = ops.find((o) => o[0] === 's' && o[1].join('.') === `RmbBlock.${key}`);
    if (op) return expand(op[2]).filter(Boolean);
    n = base[0] === 'f' ? base[1] : null;
  }
  return [];
}
/** Every stall the two packs lay, with the author's flats in its own frame. */
function laidStalls() {
  const out = [];
  for (const pack of Object.values(packs)) {
    for (const f of Object.keys(pack.files)) {
      if (!f.endsWith('.RMB.json')) continue;
      const name = f.slice(0, -5), misc = whole(pack, name, 'Misc3dObjectRecords');
      if (!misc.some((r) => RMBRP_STALLS[r.ModelIdNum])) continue;
      const blk = blockFromJson({ Name: name, RmbBlock: { FldHeader: {}, SubRecords: [], Misc3dObjectRecords: misc, MiscFlatObjectRecords: whole(pack, name, 'MiscFlatObjectRecords') } }, 9300);
      const flats = collectMiscFlats(blk).filter((fl) => !fl.editor);
      for (const s of layoutRmbBlock(blk).models.filter((m) => RMBRP_STALLS[m.modelIdNum])) {
        const M = s.matrix, o = [M[12], M[13], M[14]];
        const local = (p) => { const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; return [d[0] * M[0] + d[1] * M[1] + d[2] * M[2], d[1], d[0] * M[8] + d[1] * M[9] + d[2] * M[10]]; };
        out.push({ block: name, id: s.modelIdNum, flats: flats.map((fl) => ({ archive: fl.archive, record: fl.record, npc: isNpcFlat(fl.archive), at: local([fl.x, fl.y, fl.z]) })) });
      }
    }
  }
  return out;
}
/** The tallest stall-keeper the author stood at a stall (357.1, RESIAS02's 53101 - read off the player's TEXTURE.357). */
const KEEPER_M = 2.25;

test('STALL-SHAPE: the author\'s own stalls - 32 in Beautiful Villages\' four markets: 126 of the goods laid at them rest on a counter\'s top (two lamps of 211.11 hang 0.21 m over it, as over the pack\'s own), none stands inside the stand-in, those of the second mesh lie on the ground under it, and no stall-keeper\'s 2.25 m meets any of it', () => {
  const stalls = laidStalls();
  assert.equal(stalls.length, 32);
  assert.equal(stalls.filter((s) => s.id >= RMBRP_STALL_OPEN_FIRST).length, 15, 'the second mesh\'s');
  let resting = 0, hanging = 0, ground = 0, keepers = 0;
  for (const s of stalls) {
    const mesh = RMBRP_PIECES[s.id](), solid = placedSolid(mesh, ID), T = tris(mesh), { lo, hi } = solid;
    for (const { archive, record, npc, at: [x, y, z] } of s.flats) {
      if (x < lo[0] || x > hi[0] || z < lo[2] || z > hi[2]) continue;
      const where = `${s.block} ${s.id} ${archive}.${record} at (${x.toFixed(2)}, ${y.toFixed(3)}, ${z.toFixed(2)})`;
      if (npc) {
        keepers++;
        for (let h = 0.1; h <= KEEPER_M + 1e-9; h += 0.05) assert.equal(depthInside(solid, [x, y + h, z]), 0, `${where}: the keeper clear at ${h.toFixed(2)} m`);
        assert.ok(faceUnder(T, x, z, y + KEEPER_M) <= y + 0.1, `${where}: nothing over the keeper under ${KEEPER_M} m`);
        continue;
      }
      assert.equal(depthInside(solid, [x, y + 0.02, z]), 0, `${where}: never inside the stand-in`);
      const under = faceUnder(T, x, z, y + TOUCH_M);
      if (under === -Infinity) { ground++; continue; }
      if (y - under <= TOUCH_M) { resting++; continue; }
      assert.ok(archive === 211 && record === 11 && near(y - under, 0.209, 0.001), `${where}: ${(y - under).toFixed(3)} m over the stand-in`);
      hanging++;
    }
  }
  assert.deepEqual({ resting, hanging, ground, keepers }, { resting: 126, hanging: 2, ground: 57, keepers: 27 });
});
