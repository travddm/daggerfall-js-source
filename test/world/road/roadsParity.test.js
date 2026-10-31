// AUDIT 51: 1:1 PARITY WITH BASIC ROADS, BY ORACLE. tools/roadsOracle.py
// is PaintPath transliterated from the mod's C# line for line; its
// fixture holds the tilemap the MOD paints for 907 cases - every road
// mask, every track mask, every corner byte, random rivers with
// streams, mixed pixels, and location rects. Our painter runs the same
// cases and must match BYTE FOR BYTE. A difference is a parity bug by
// definition, and the message names the first tile that differs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paintRoads, TILE } from '../../../src/world/road/roadPainter.js';

const oracle = JSON.parse(readFileSync(new URL('../../fixtures/roads-oracle.json', import.meta.url), 'utf8'));

function quadrants() {
  const td = new Uint8Array(129 * 129);
  for (let y = 0; y < 129; y++) for (let x = 0; x < 129; x++) td[y * 129 + x] = y < 64 ? (x < 64 ? TILE.dirt : TILE.grass) : (x < 64 ? TILE.stone : TILE.water);
  return td;
}
const expand = (rle) => { const out = new Uint8Array(128 * 128); let i = 0; for (const [v, n] of rle) { out.fill(v, i, i + n); i += n; } return out; };

test('AUDIT 51: our painter matches the mod\u2019s PaintPath byte for byte over 907 cases', () => {
  let checked = 0; const diffs = [];
  for (const { case: c, tilemap: rle } of oracle.cases) {
    const want = expand(rle);
    const got = new Uint8Array(128 * 128);
    const rect = c.rect ? { xMin: c.rect[0], xMax: c.rect[1], yMin: c.rect[2], yMax: c.rect[3] } : null;
    paintRoads(quadrants(), got, c.road ?? 0, c.track ?? 0, rect, 129, {
      river: c.river ?? 0, stream: c.stream ?? 0, water: !!c.water,
      corners: { road: c.roadCorners ?? 0, track: c.trackCorners ?? 0, river: c.riverCorners ?? 0, stream: c.streamCorners ?? 0 },
    });
    for (let i = 0; i < want.length; i++) {
      if (want[i] !== got[i]) { diffs.push(`${JSON.stringify(c)} at (${i % 128},${(i / 128) | 0}): mod ${want[i]}, ours ${got[i]}`); break; }
    }
    checked++;
  }
  assert.equal(checked, 907);
  assert.deepEqual(diffs.slice(0, 12), [], `${diffs.length} of 907 cases differ from the mod`);
});

// MODS AUDIT (2026-09-08): THE RECT'S EDGE. His skip is
// `locationRect.Contains(new Vector2(x, y))` - Unity's Rect.Contains,
// min-inclusive and MAX-EXCLUSIVE - and the port's was max-inclusive:
// the column x == xMax and the row y == yMax were smoothed by the mod
// and skipped here. The rect is DFU's (xMax = xmax + extraClearance,
// terrainTiles.js:"xMax: xmax + extraClearance"), so the boundary is a real tile column.
test('MODS AUDIT: the smoother skips the rect as Rect.Contains does - min in, max OUT', async () => {
  const { smoothRoadHeights } = await import('../../../src/world/road/roadPainter.js');
  const H = 129;
  const mk = () => { const s = new Float32Array(H * H); for (let i = 0; i < s.length; i++) s[i] = (i % 2) ? 50 : 30; return s; };
  const rect = { xMin: 60, xMax: 70, yMin: 60, yMax: 70 };
  const at = (x, y) => { const t = new Uint8Array(128 * 128); t[y * 128 + x] = 46; return t; };
  assert.equal(smoothRoadHeights(mk(), at(60, 65), H, rect), 0, 'x == xMin is inside (min inclusive)');
  assert.equal(smoothRoadHeights(mk(), at(69, 65), H, rect), 0, 'x == xMax - 1 is inside');
  assert.equal(smoothRoadHeights(mk(), at(70, 65), H, rect), 4, 'x == xMax is OUTSIDE - the mod smooths it');
  assert.equal(smoothRoadHeights(mk(), at(65, 70), H, rect), 4, 'y == yMax is OUTSIDE');
  assert.equal(smoothRoadHeights(mk(), at(65, 60), H, rect), 0, 'y == yMin is inside');
});

// AUDIT 58 (f2/hosts): THE DIRECTIONAL PIN neither older test could
// make. Both computed their expected corners from the smoother's own
// base, so a transposed write agreed with itself and stayed green for
// three audits. This one asks the question in WORLD terms instead:
// paint a north-south road and read the samples back through the
// SAMPLER's own layout (terrainSampler.js:"data[x * hDim + y]", sample(x, y) =
// s[x * hDim + y]). A N-S road lies down tile columns 63/64, so what
// moves must be sample-x 62..66 spanning the road's length in y - and
// nothing at sample-y 62..66. Under the transposed base it is exactly
// the other way round: the bed is untouched and a mirrored E-W strip
// of open ground is blurred.
test('AUDIT 58: a NORTH-SOUTH road smooths a north-south bed - the corner base is the heightmap\u2019s, not the tilemap\u2019s', async () => {
  const { smoothRoadHeights, paintRoads, TILE: T } = await import('../../../src/world/road/roadPainter.js');
  const { DIR } = await import('../../../src/world/road/roadNetwork.js');
  const H = 129, TD = 128;
  const samples = new Float32Array(H * H); for (let i = 0; i < samples.length; i++) samples[i] = (i % 2) ? 50 : 30;
  const before = Float32Array.from(samples);
  const tilemap = new Uint8Array(TD * TD);
  paintRoads(new Uint8Array(H * H).fill(T.grass), tilemap, DIR.N | DIR.S, 0);   // the road runs down tile columns 63/64
  assert.equal(tilemap[10 * TD + 63] & 0x3f, T.road, 'the painter put road at tile (x=63, y=10) - tile index x + y*tDim');
  assert.ok(smoothRoadHeights(samples, tilemap) > 0);
  // sample(x, y) = s[x * H + y] - the sampler's layout, read here and
  // nowhere near the smoother's own arithmetic.
  const sample = (a, x, y) => a[x * H + y];
  let xs = [Infinity, -Infinity], ys = [Infinity, -Infinity], moved = 0;
  for (let x = 0; x < H; x++) for (let y = 0; y < H; y++) {
    if (sample(samples, x, y) === sample(before, x, y)) continue;
    moved++;
    xs = [Math.min(xs[0], x), Math.max(xs[1], x)];
    ys = [Math.min(ys[0], y), Math.max(ys[1], y)];
  }
  assert.ok(moved > 100, `the road bed moved (${moved} samples)`);
  // Only tile column 63 carries the bare 46: column 64's byte is 46|FLIP
  // (174), and the tile test is on the RAW byte, as his is - so the bed
  // that moves is that one tile's two corner columns, 63 and 64.
  assert.deepEqual(xs, [63, 64], 'ACROSS the road: sample-x is the road tile\u2019s own two corner columns');
  assert.ok(ys[1] - ys[0] > 100, `ALONG the road: sample-y spans its length (${ys[0]}..${ys[1]})`);
  // and the mirror is untouched - the exact strip the transposed base blurred
  for (let x = 0; x < 50; x++) for (let y = 62; y <= 66; y++) {
    assert.equal(sample(samples, x, y), sample(before, x, y), `the mirrored E-W strip at sample (${x},${y}) must not move`);
  }
});
