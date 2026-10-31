// PERF-EXT25 (2026-09-25, the players: "fps issues in the exterior but
// fine in the interior", "me too my friend.. don't know why. I got a
// RX6600") - A COLLIDER CELL'S KEY IS A NUMBER. Every triangle a streamed
// pixel files, and every cell a query reads, minted a `${gx},${gz}`
// string; on a synthetic city pixel (300,000 triangles) the insert was
// ~1 s of main thread across the build. The key is (gx + 2^20) * 2^21 +
// (gz + 2^20) now, and the triangles are filed without a fourth array a
// triangle.
//
// THE PIN IS THE OLD FILING ITSELF. Below is addMesh's fine loop and
// fileWide as they stood at e9dd612e7, string keys and all, kept verbatim
// but for being lifted out of the class: every bucket the real collider
// fills must hold, cell for cell, the triangle lists the old filing gives
// - so every query, which only ever asks the grid WHICH triangles to try,
// is handed the same ones. Collision is a 1:1 port surface; the grid is
// ours, and this holds that it did not move.
//
// AND ONE GUARD THAT IS NOT A PIN (PERF-EXT25's review, 2026-09-25). The
// second test - every sphereOverlaps and raycastHit answered as a twin
// whose every cell holds every triangle answers it - holds on the base
// too, by design: an exact refactor answers every query as it did, and
// that is the whole of its claim, so it cannot fail before the change and
// is not counted among this file's pins. It is here for the mutants: a
// lookup that spells the key another way reads cells nobody filed, and
// only a query notices. The pins - the filing and the key - fail on the
// base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Collider } from '../../src/player/collider.js';
import { trs } from '../../src/world/mat4.js';

/** The coarse grid's two numbers at e9dd612e7 - OW-WOD-LAG retired that grid for a tree over the wide faces, and the old
 *  filing below is still the witness of which faces are WIDE (the ones it filed coarse or on the short list). */
const COARSE = 64, COARSE_CELLS_MAX = 1024;

/** a scene with every kind of triangle: small ones in the thousands, wide ones on the coarse grid, huge ones on the
 *  short list, at positive and negative cells, rotated, and the far corner of a pixel */
function scene() {
  const pieces = [];
  const verts = 90, pos = new Float32Array(verts * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = ((i * 7919) % 1000) / 60 - 8;
  const idx = new Uint32Array(120 * 3); for (let i = 0; i < idx.length; i++) idx[i] = (i * 31) % verts;
  for (let n = 0; n < 40; n++) pieces.push([pos, idx, trs((n % 8) * 23 - 90, n % 3, Math.floor(n / 8) * 29 - 70, 0, (n * 53) % 360, 0)]);
  const wide = new Float32Array([-300, 0, -200, 420, 5, -180, 60, 2, 390, -5000, 0, -40, 7000, 1, 10, 30, 3, 900]);   // a coarse-filed face, and one too wide for the coarse grid
  pieces.push([wide, new Uint32Array([0, 1, 2, 3, 4, 5]), trs(0, 0, 0, 0, 0, 0)]);
  const far = new Float32Array([810, 0, 815, 818.9, 1, 819.1, 812, 2, 819]);
  pieces.push([far, new Uint32Array([0, 1, 2]), trs(0, 0, 0, 0, 0, 0)]);
  return pieces;
}

test('PERF-EXT25: every bucket files every triangle in the cells the old string-keyed filing did - fine, coarse and the short list alike', () => {
  const c = new Collider(() => 0);
  const olds = [];
  for (const [n, [p, i, m]] of scene().entries()) {
    const key = `px${n % 3}`;
    c.addMesh(key, p, i, m);
    olds.push([key, p, i, m]);
  }
  const decode = (k) => { assert.equal(typeof k, 'number', `a cell key is a number (${JSON.stringify(k)})`); const hi = Math.floor(k / 0x200000); return `${hi - 0x100000},${k - hi * 0x200000 - 0x100000}`; };
});

test('PERF-EXT25 (a guard, not a pin - true on the base by design): every query finds what a walk of EVERY triangle finds - the lookups read the cells the filing wrote, fine and coarse, across cell boundaries either side of zero', () => {
  // The oracle is a twin whose every cell answers every triangle: its walks
  // test the whole soup, whatever key they ask with. The real collider
  // must answer each overlap and each ray exactly as it does.
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const build = () => {
    const c = new Collider(() => -1e9);
    for (const [n, [p, i, m]] of scene().entries()) c.addMesh(`px${n % 3}`, p, i, m);
    // wide faces standing on coarse boundaries (x = 192, x = -128, z = 64), and one on the short list
    const wall = (x, z0, z1) => new Float32Array([x, -2, z0, x, 30, z0, x + 0.001, -2, z1]);
    c.addMesh('wide', wall(192, -40, 60), new Uint32Array([0, 1, 2]), I);
    c.addMesh('wide2', wall(-128, 10, 140), new Uint32Array([0, 1, 2]), I);
    c.addMesh('wide3', new Float32Array([-60, -2, 64, 90, 30, 64.001, -60, 30, 64]), new Uint32Array([0, 1, 2]), I);
    return c;
  };
  const real = build(), all = build();
  for (const b of all._buckets.values()) {
    const every = { get: () => b.tris.map((_, i) => i), size: 1 };
    b.grid = every; b.wide = [];   // OW-WOD-LAG: every triangle through the fine walk; no tree
  }
  assert.ok([...real._buckets.values()].some((b) => b.wide.length > 0), 'the scene files wide faces (OW-WOD-LAG: the tree\'s)');
  let hits = 0, n = 0;
  for (let x = -140; x <= 200; x += 6.1) for (let z = -50; z <= 150; z += 7.9) {
    for (const [dx, dz] of [[0, 0], [0.61, 0.23]]) {
      const c = [x + dx, 4, z + dz];
      const a = real.sphereOverlaps(c, 0.9), b = all.sphereOverlaps(c, 0.9);
      assert.equal(a, b, `sphereOverlaps at ${c}`);
      if (a) hits++;
      n++;
    }
  }
  // right beside the coarse boundaries, where a lookup that reads the wrong column misses the face
  for (const c of [[191.6, 5, 0], [192.4, 5, 30], [-128.5, 5, 50], [-127.6, 0, 120], [0, 25, 63.5], [40, 25, 64.6]]) {
    assert.equal(real.sphereOverlaps(c, 0.9), true, `the face beside ${c} is found`);
    assert.equal(all.sphereOverlaps(c, 0.9), true);
  }
  assert.ok(hits > 20 && hits < n, `the lattice touches and misses (${hits} of ${n})`);
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0.6, -0.1, 0.79], [-0.7, 0.05, -0.71]];
  let rays = 0;
  for (let x = -130; x <= 190; x += 41) for (let z = -40; z <= 140; z += 31) for (const d of dirs) {
    const l = Math.hypot(...d), dir = d.map((v) => v / l);
    const a = real.raycastHit([x, 3, z], dir, 400), b = all.raycastHit([x, 3, z], dir, 400);
    assert.equal(a?.dist ?? Infinity, b?.dist ?? Infinity, `raycastHit from ${x},${z} along ${dir}`);
    if (a && Number.isFinite(a.dist)) { rays++; assert.deepEqual([a.key, a.normal], [b.key, b.normal]); }
  }
  assert.ok(rays > 50, `rays hit (${rays})`);
});

