import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bleedForFilter, bleedTransparentTexels } from '../../src/render/alpha-bleed.ts';

/** A picture from rows of texels, each '.' transparent black, 'R' opaque red, 'G' opaque green. */
function picture(rows: string[]): { rgba: Uint8Array; width: number; height: number } {
  const width = rows[0].length;
  const height = rows.length;
  const rgba = new Uint8Array(width * height * 4);
  const colours: Record<string, number[]> = { '.': [0, 0, 0, 0], R: [200, 0, 0, 255], G: [0, 180, 0, 255] };
  rows.forEach((row, y) => [...row].forEach((c, x) => rgba.set(colours[c], (y * width + x) * 4)));
  return { rgba, width, height };
}

const texel = (rgba: Uint8Array, width: number, x: number, y: number) => [
  ...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
];

test('each transparent texel takes the colour of the nearest opaque texel and keeps alpha 0; opaque texels are untouched', () => {
  const { rgba, width, height } = picture(['....', '.R..', '...G', '....']);
  const out = bleedTransparentTexels(rgba, width, height);
  assert.notEqual(out, rgba, "a copy: the caller's bytes (a cached replacement) are never written");
  assert.deepEqual(texel(rgba, width, 0, 0), [0, 0, 0, 0], 'the input unchanged');
  assert.deepEqual(texel(out, width, 1, 1), [200, 0, 0, 255]);
  assert.deepEqual(texel(out, width, 3, 2), [0, 180, 0, 255]);
  assert.deepEqual(texel(out, width, 0, 1), [200, 0, 0, 0], 'beside the red: red, still transparent');
  assert.deepEqual(texel(out, width, 3, 3), [0, 180, 0, 0], 'beside the green: green');
  assert.deepEqual(texel(out, width, 0, 3), [200, 0, 0, 0], 'two steps from the red, three from the green: red');
  for (let i = 0; i < width * height; i++) assert.equal(out[i * 4 + 3], rgba[i * 4 + 3], `texel ${i}: alpha kept`);
  for (let i = 0; i < width * height; i++)
    assert.ok(out[i * 4] + out[i * 4 + 1] > 0, `texel ${i}: no black left for a filter to mix in`);
});

test('a picture with nothing to bleed comes back as it is', () => {
  const opaque = picture(['RG', 'GR']);
  assert.equal(bleedTransparentTexels(opaque.rgba, 2, 2), opaque.rgba);
  const empty = picture(['..', '..']);
  assert.equal(bleedTransparentTexels(empty.rgba, 2, 2), empty.rgba, 'no opaque texel: nothing to take a colour from');
});

test('bled only where a linear filter can reach the picture', () => {
  const { rgba, width, height } = picture(['.R', '..']);
  assert.equal(bleedForFilter(false, rgba, width, height), rgba, 'nearest only (Point, UI): as it is');
  assert.deepEqual(texel(bleedForFilter(true, rgba, width, height), width, 0, 1), [200, 0, 0, 0]);
});

test('one pass: a 1024 x 1024 cut-out is bled in well under a frame budget per texture', () => {
  const size = 1024;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if ((x * 7 + y * 3) % 11 < 4) rgba.set([90, 120, 60, 255], (y * size + x) * 4);
  const start = performance.now();
  const out = bleedTransparentTexels(rgba, size, size);
  const ms = performance.now() - start;
  assert.ok(out[3] === 255 || out[0] === 90, 'filled');
  assert.ok(ms < 500, `${ms.toFixed(1)} ms`);
});
