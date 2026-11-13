// Colour for the transparent texels of a cut-out picture. Daggerfall stores a cut-out's transparent texels (palette
// index 0) with alpha 0 and a colour of their own, usually black. A linear filter at a cut-out's edge, and every mip
// level built from the picture, mixes that colour into the opaque texels beside it, which draws a dark outline under
// Bilinear, Trilinear and Sharp. Point never shows it: it reads the opaque texel alone.
//
// So before a picture that a linear filter can reach is uploaded, each transparent texel takes the colour of the nearest
// opaque texel, and keeps alpha 0, so the cut-out's shape is unchanged; the mips are then built from the bled picture.
// DFU does the same for its weapon sprites, which it dilates "into a transparent coloured border to remove dark edges
// when filtered" (FPSWeapon.cs, ImageProcessing.DilateColors).

/** A copy of `rgba` (width x height texels, four bytes each) whose transparent texels carry the colour of the nearest
 *  opaque texel (by steps across and down), alpha kept; or `rgba` itself when no texel is transparent or none is
 *  opaque. One pass: a breadth-first fill outward from the opaque texels, each texel visited once. */
export function bleedTransparentTexels<T extends Uint8Array | Uint8ClampedArray>(
  rgba: T,
  width: number,
  height: number,
): T {
  const count = width * height;
  let transparent = 0;
  for (let i = 0; i < count; i++) if (rgba[i * 4 + 3] === 0) transparent++;
  if (transparent === 0 || transparent === count) return rgba;
  const out = rgba.slice() as T;
  const queue = new Int32Array(count);
  const filled = new Uint8Array(count);
  let tail = 0;
  for (let i = 0; i < count; i++) {
    if (out[i * 4 + 3] !== 0) {
      filled[i] = 1;
      queue[tail++] = i;
    }
  }
  for (let head = 0; head < tail; head++) {
    const from = queue[head];
    const x = from % width;
    const y = (from - x) / width;
    for (let n = 0; n < 4; n++) {
      const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
      const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const to = ny * width + nx;
      if (filled[to]) continue;
      filled[to] = 1;
      out[to * 4] = out[from * 4];
      out[to * 4 + 1] = out[from * 4 + 1];
      out[to * 4 + 2] = out[from * 4 + 2];
      queue[tail++] = to;
    }
  }
  return out;
}

/** The bytes a picture is uploaded with: bled when a linear filter can reach it (`linear`, world art under the world
 *  texture filter), as they are otherwise. */
export function bleedForFilter<T extends Uint8Array | Uint8ClampedArray>(
  linear: boolean,
  rgba: T,
  width: number,
  height: number,
): T {
  return linear ? bleedTransparentTexels(rgba, width, height) : rgba;
}
