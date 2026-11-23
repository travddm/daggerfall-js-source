// The water bed reads a shore tile's painted water from the tile's alpha (render/waterBedGlsl.js bedCover). The ground's
// tile arrays repeat under the linear filters, so the mask's sample must keep every tap inside its tile, or a shore
// tile's wet edge blends into its dry edge. These tests run the shader's own functions (test/glsl.mjs) over a sampler
// that repeats as the GPU does, on a mask shaped as a shore tile is: wet on one side, dry on the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { glslFunctions } from '../glsl.mjs';
import { EDGE_NOISE_GLSL } from '../../src/render/roadEdgeGlsl.js';
import { groundWanderGlsl } from '../../src/render/groundEdgeGlsl.js';
import { WATER_BED_GLSL } from '../../src/render/waterBedGlsl.js';
import { sharpenWorldFs } from '../../src/render/sharp-texels.ts';
import { packWaterMask, WATER_DRAW_MASK_TABLE, waterCoverage } from '../../src/world/water/waterCorners.js';
import { PUDDLE_RECORDS } from '../../src/world/puddleMask.js';

const SIZE = 64;
type Vec = number[];
type Mask = (x: number, y: number) => number;

/** A shore tile's mask as the left/right halves of 002 r6 lie: wet where x < 32, dry from there to the right edge. */
const halfWet: Mask = (x) => (x < SIZE / 2 ? 1 : 0);

/** Bilinear at level 0 with a repeat wrap, as the sampler reads a texel position. */
function bilinearRepeat(mask: Mask, u: number, v: number): number {
  const x = u * SIZE - 0.5;
  const y = v * SIZE - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (i: number, j: number) => mask(((i % SIZE) + SIZE) % SIZE, ((j % SIZE) + SIZE) % SIZE);
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** A repeating sampler's reach: bilinear taps spread over the screen pixel's footprint (gx, gy), as the coarser mip and
 *  the anisotropic taps reach. Records each coordinate it is handed. */
function repeatingSampler(mask: Mask, seen: Vec[]) {
  return (_sampler: unknown, p: Vec, gx: Vec, gy: Vec): Vec => {
    seen.push([...p]);
    let sum = 0;
    let n = 0;
    for (let s = -0.5; s <= 0.5; s += 0.25) {
      for (let t = -0.5; t <= 0.5; t += 0.25) {
        sum += bilinearRepeat(mask, p[0] + s * gx[0] + t * gy[0], p[1] + s * gx[1] + t * gy[1]);
        n++;
      }
    }
    return [0, 0, 0, sum / n];
  };
}

const SOURCE = `precision highp sampler2DArray;
uniform sampler2DArray uTileArr;
uniform highp ivec4 uSnowArr;
${EDGE_NOISE_GLSL}
${groundWanderGlsl()}
${WATER_BED_GLSL}`;

function bedShader(mask: Mask, { clamped = 0, sharp = false } = {}) {
  const seen: Vec[] = [];
  const words = packWaterMask(WATER_DRAW_MASK_TABLE);
  const fns = glslFunctions(sharp ? sharpenWorldFs(SOURCE) : SOURCE, {
    uGroundEdge: 0,
    uWaterBed: 1,
    uGroundClamped: clamped,
    uSnowArr: [3, 0, 0, 0],
    uSharpRetro: [0, 0],
    uBedMask: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [...words.slice(4 * i, 4 * i + 4)]),
    textureGrad: repeatingSampler(mask, seen),
    textureSize: () => [SIZE, SIZE, 8],
  });
  return { fns, seen };
}

/** A part-water tile byte and a spot on it where the corner table puts no water, so the bed's share there is the art's
 *  mask alone. */
function dryCornerSpot(): { byte: number; f: Vec } {
  for (let byte = 0; byte < 256; byte++) {
    const m = WATER_DRAW_MASK_TABLE[byte];
    if (!m || m === 15 || PUDDLE_RECORDS.includes(byte >> 2)) continue;
    for (const f of [
      [0.95, 0.1],
      [0.95, 0.9],
      [0.05, 0.1],
      [0.05, 0.9],
    ]) {
      if (waterCoverage(m, f[0], f[1]) < 0.2) return { byte, f };
    }
  }
  throw new Error('no part-water tile with a dry corner');
}

const FOOTPRINTS: ReadonlyArray<readonly [string, Vec, Vec]> = [
  ['magnified', [0.2 / SIZE, 0], [0, 0.2 / SIZE]],
  ['minified', [3 / SIZE, 0], [0, 3 / SIZE]],
  ['stretched by a grazing view', [8 / SIZE, 0], [0, 0.5 / SIZE]],
];

/** The mask the bed reads at the dry edge of a shore tile: the art's share of the bed (bedCover's x, the corner table
 *  giving none there). */
function artAtDryEdge(fns: ReturnType<typeof bedShader>['fns'], gx: Vec, gy: Vec, snow = 0): number {
  const { byte, f } = dryCornerSpot();
  const tl = [1 - 0.1 / SIZE, 0.5, byte >> 2];
  return fns.bedCover(byte, f, [10 + f[0], 10 + f[1]], tl, gx, gy, snow, false)[0];
}

test('under a repeat wrap, the dry edge of a shore tile reads its own dry mask at every footprint, and the unclamped sample would read the wet edge', () => {
  const unclamped = bedShader(halfWet, { clamped: 1 });
  const kept = bedShader(halfWet);
  for (const [name, gx, gy] of FOOTPRINTS) {
    assert.ok(
      artAtDryEdge(unclamped.fns, gx, gy) > 0.1,
      `${name}: without the margin the repeat blends the wet edge in`,
    );
    assert.equal(artAtDryEdge(kept.fns, gx, gy), 0, `${name}: with it the dry edge stays dry`);
    assert.equal(artAtDryEdge(kept.fns, gx, gy, 1), 0, `${name}: and under snow, read from the winter layer`);
  }
  const winterLayer = (dryCornerSpot().byte >> 2) + 3;
  assert.ok(
    kept.seen.some((p) => p[2] === winterLayer),
    'the winter layer is read',
  );
});

test('under Sharp, the snapped mask sample stays inside the tile too', () => {
  const kept = bedShader(halfWet, { sharp: true });
  for (const [name, gx, gy] of FOOTPRINTS) assert.equal(artAtDryEdge(kept.fns, gx, gy), 0, name);
});

test('where the sampler clamps (Point), the mask is read at the coordinate the ground hands in, unchanged', () => {
  const { fns } = bedShader(halfWet, { clamped: 1 });
  for (const tl of [
    [1 - 0.1 / SIZE, 0.5, 5],
    [0.0001, 0.999, 5],
    [0.5, 0.5, 5],
  ]) {
    for (const [, gx, gy] of FOOTPRINTS) assert.deepEqual(fns.bedMaskAt(tl, gx, gy), tl);
  }
});

test('the margin is never more than half the tile, so a far footprint reads the tile centre rather than an undefined clamp', () => {
  const { fns } = bedShader(halfWet);
  assert.deepEqual(fns.bedMaskAt([0.01, 0.99, 2], [4, 0], [0, 4]), [0.5, 0.5, 2]);
  const near = fns.bedMaskAt([0.999, 0.001, 2], [0.1 / SIZE, 0], [0, 0.1 / SIZE]);
  assert.ok(
    Math.abs(near[0] - (1 - 0.5 / SIZE)) < 1e-9 && Math.abs(near[1] - 0.5 / SIZE) < 1e-9,
    'up close, half a texel',
  );
});

test('the bed reads no mask on a tile with no water corner, nor on a whole-water tile', () => {
  const { fns, seen } = bedShader(halfWet);
  const none = WATER_DRAW_MASK_TABLE.findIndex((m: number, byte: number) => m === 0 && byte > 3);
  const whole = WATER_DRAW_MASK_TABLE.findIndex((m: number) => m === 15);
  assert.deepEqual(
    fns.bedCover(none, [0.5, 0.5], [10.5, 10.5], [0.5, 0.5, none >> 2], [0.01, 0], [0, 0.01], 0, false),
    [0, 0],
  );
  fns.bedCover(whole, [0.5, 0.5], [10.5, 10.5], [0.5, 0.5, whole >> 2], [0.01, 0], [0, 0.01], 0, false);
  assert.equal(seen.length, 0);
});

const ARENA2 = process.env.ARENA2_PATH;
test(
  "002 r6, a shore tile of the game's own art: the dry edge reads dry at every footprint (needs ARENA2)",
  { skip: !(ARENA2 && existsSync(join(ARENA2, 'TEXTURE.002'))) && 'no ARENA2' },
  async () => {
    const { TextureFile } = await import('../../src/formats/textureFile.js');
    const { DFPalette } = await import('../../src/formats/dfPalette.js');
    const { markPuddleWater } = await import('../../src/world/puddleMask.js');
    const palette = new DFPalette();
    palette.load(readFileSync(join(ARENA2 as string, 'ART_PAL.COL')), 'ART_PAL.COL');
    const file = new TextureFile();
    file.load(readFileSync(join(ARENA2 as string, 'TEXTURE.002')), 'TEXTURE.002', palette);
    const layers = [];
    for (let r = 0; r < file.recordCount; r++) layers.push(file.getColor32(file.getDFBitmap(r, 0), 0));
    const r6 = markPuddleWater(layers)[6];
    const bytes = new Uint8Array(r6.colors.buffer, r6.colors.byteOffset, SIZE * SIZE * 4);
    const wet = (x: number, y: number) => (bytes[(y * SIZE + x) * 4 + 3] > 127 ? 1 : 0);
    // A row whose two edges differ, turned if need be so its dry edge is on the right, where the bed is read.
    const row = [...Array(SIZE).keys()].find((y) => wet(SIZE - 1, y) !== wet(0, y));
    assert.ok(row !== undefined, 'r6 has a row whose left and right edges differ');
    const dryOnRight = wet(SIZE - 1, row) === 0;
    const rowMask: Mask = (x) => wet(dryOnRight ? x : SIZE - 1 - x, row);
    const unclamped = bedShader(rowMask, { clamped: 1 });
    const kept = bedShader(rowMask);
    for (const [name, gx, gy] of FOOTPRINTS) {
      assert.ok(artAtDryEdge(unclamped.fns, gx, gy) > 0.1, `${name}: the repeat would blend r6's wet edge in`);
      assert.equal(artAtDryEdge(kept.fns, gx, gy), 0, name);
    }
  },
);

test("the renderer's flag follows the ground's wrap: set under Point, where the sampler clamps, and clear under the others", async () => {
  const { setValue } = await import('../../src/systems/settings/settings.js');
  const { groundClampedFlag } = await import('../../src/render/ground-sampler.ts');
  const gl = { NEAREST: 0x2600, LINEAR: 0x2601, REPEAT: 0x2901, CLAMP_TO_EDGE: 0x812f } as Parameters<
    typeof groundClampedFlag
  >[0];
  const flags = ['0', '1', '2', '3'].map((mode) => {
    setValue('Video', 'MainFilterMode', mode);
    return groundClampedFlag(gl);
  });
  setValue('Video', 'MainFilterMode', '3');
  assert.deepEqual(flags, [1, 0, 0, 0]);
});
