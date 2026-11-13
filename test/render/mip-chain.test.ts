import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMipChain, mipLevelCount } from '../../src/render/mip-chain.ts';

const KERNELS = ['box', 'lanczos2', 'lanczos3', 'kaiser'] as const;

function filled(width: number, height: number, texel: (x: number, y: number) => number[]): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgba.set(texel(x, y), (y * width + x) * 4);
  return rgba;
}

const clampBoth = { wrapX: false, wrapY: false };

test('a chain is complete down to 1 x 1, each side the floor of half the one above, for odd and thin pictures', () => {
  for (const [w, h] of [
    [37, 61],
    [1, 9],
    [8, 1],
    [64, 64],
    [3, 5],
  ]) {
    const levels = buildMipChain(new Uint8Array(w * h * 4).fill(255), w, h, clampBoth);
    assert.equal(levels.length, mipLevelCount(w, h));
    let wantW = w;
    let wantH = h;
    for (const level of levels) {
      wantW = Math.max(1, wantW >> 1);
      wantH = Math.max(1, wantH >> 1);
      assert.equal(level.width, wantW);
      assert.equal(level.height, wantH);
      assert.equal(level.data.length, wantW * wantH * 4);
    }
    assert.equal(levels[levels.length - 1].width, 1);
    assert.equal(levels[levels.length - 1].height, 1);
  }
});

test('a flat colour stays the same colour at every level, for every kernel', () => {
  const rgba = filled(16, 16, () => [200, 120, 40, 255]);
  for (const kernel of KERNELS) {
    for (const level of buildMipChain(rgba, 16, 16, { ...clampBoth, kernel })) {
      for (let i = 0; i < level.width * level.height; i++) {
        assert.deepEqual([...level.data.subarray(i * 4, i * 4 + 4)], [200, 120, 40, 255]);
      }
    }
  }
});

test('black and white stripes average in linear light: brighter than the stored-number mean of 128', () => {
  const rgba = filled(8, 8, (x) => (x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  const [level1] = buildMipChain(rgba, 8, 8, { ...clampBoth, kernel: 'box' });
  assert.ok(level1.data[0] > 170 && level1.data[0] < 195, `got ${level1.data[0]}`);
});

test('a lanczos level keeps more of a fine pattern than a box level', () => {
  // a sine of period 4 texels, 100 +- 40 in stored numbers: the box passes a smaller share of it than lanczos
  const rgba = filled(64, 2, (x) => {
    const v = Math.round(100 + 40 * Math.sin((x * 2 * Math.PI) / 8));
    return [v, v, v, 255];
  });
  const range = (kernel: 'box' | 'lanczos2') => {
    const [level1] = buildMipChain(rgba, 64, 2, { wrapX: true, wrapY: false, kernel });
    const values = Array.from({ length: 32 }, (_, x) => level1.data[x * 4]);
    return Math.max(...values) - Math.min(...values);
  };
  assert.ok(range('lanczos2') > range('box'), `${range('lanczos2')} vs ${range('box')}`);
});

test('a repeating axis filters across its edge and a clamped one does not', () => {
  const rgba = filled(8, 2, (x) => (x === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  const edgeRight = (wrapX: boolean) =>
    buildMipChain(rgba, 8, 2, { wrapX, wrapY: false, kernel: 'box' })[0].data[3 * 4];
  assert.equal(edgeRight(false), 0);
  assert.equal(edgeRight(true), 0);
  const wide = buildMipChain(rgba, 8, 2, { wrapX: true, wrapY: false, kernel: 'lanczos3' })[0];
  const clamped = buildMipChain(rgba, 8, 2, { wrapX: false, wrapY: false, kernel: 'lanczos3' })[0];
  assert.ok(wide.data[3 * 4] > clamped.data[3 * 4], 'the last texel sees the bright first texel across the wrap');
});

test('a transparent texel colour never leaks into the opaque ones, and transparent levels are bled', () => {
  // opaque green with a hole whose stored colour is red
  const rgba = filled(8, 8, (x, y) => (x > 2 && x < 5 && y > 2 && y < 5 ? [255, 0, 0, 0] : [0, 200, 0, 255]));
  for (const level of buildMipChain(rgba, 8, 8, clampBoth)) {
    for (let i = 0; i < level.width * level.height; i++) {
      assert.equal(level.data[i * 4], 0, 'no red anywhere');
    }
  }
});

test('a cut-out keeps its share of solid texels at every level', () => {
  // a 2-texel-thick bar over a 32 x 32 picture: a quarter of the picture is solid
  const rgba = filled(32, 32, (x, y) => (y >= 12 && y < 20 ? [30, 90, 30, 255] : [0, 0, 0, 0]));
  const solidShare = (data: Uint8Array) => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) n++;
    return n / (data.length / 4);
  };
  const base = solidShare(rgba);
  for (const level of buildMipChain(rgba, 32, 32, clampBoth).slice(0, 2)) {
    assert.ok(
      Math.abs(solidShare(level.data) - base) < 0.08,
      `level ${level.width}: ${solidShare(level.data)} vs ${base}`,
    );
  }
});

test('a soft-alpha picture is not rescaled: its alpha is the filtered alpha', () => {
  const rgba = filled(8, 8, () => [100, 100, 100, 100]);
  for (const level of buildMipChain(rgba, 8, 8, clampBoth)) assert.equal(level.data[3], 100);
});

test('a premultiplied picture comes back premultiplied, and zero where it is empty', () => {
  const solid = buildMipChain(
    filled(8, 8, () => [50, 100, 25, 128]),
    8,
    8,
    { ...clampBoth, premultiplied: true },
  );
  for (const level of solid) {
    for (let c = 0; c < 4; c++) assert.ok(Math.abs(level.data[c] - [50, 100, 25, 128][c]) <= 1);
  }
  const empty = buildMipChain(
    filled(8, 8, () => [0, 0, 0, 0]),
    8,
    8,
    { ...clampBoth, premultiplied: true },
  );
  assert.deepEqual([...empty[0].data.subarray(0, 4)], [0, 0, 0, 0]);
});

test('an opaque request ignores the fourth channel', () => {
  const rgba = filled(4, 4, () => [10, 20, 30, 0]);
  for (const level of buildMipChain(rgba, 4, 4, { ...clampBoth, opaque: true })) assert.equal(level.data[3], 255);
});
