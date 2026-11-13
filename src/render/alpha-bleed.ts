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
  // Whole texels move through a 32-bit view of the copy (a fresh array, so its offset is aligned). Every platform WebGL
  // runs on is little-endian, so alpha is the top byte: a colour with it masked off keeps the texel transparent.
  const texels = new Uint32Array(out.buffer, out.byteOffset, count);
  const colourOnly = 0x00ffffff;
  const queue = new Int32Array(count);
  const filled = new Uint8Array(count);
  let tail = 0;
  for (let i = 0; i < count; i++) {
    if (out[i * 4 + 3] !== 0) {
      filled[i] = 1;
      queue[tail++] = i;
    }
  }
  // the four neighbours written out in place: a helper function per texel costs a quarter of the time
  for (let head = 0; head < tail; head++) {
    const from = queue[head];
    const colour = texels[from] & colourOnly;
    const x = from % width;
    const left = from - 1;
    const right = from + 1;
    const up = from - width;
    const down = from + width;
    if (x > 0 && !filled[left]) {
      filled[left] = 1;
      texels[left] = colour;
      queue[tail++] = left;
    }
    if (x < width - 1 && !filled[right]) {
      filled[right] = 1;
      texels[right] = colour;
      queue[tail++] = right;
    }
    if (up >= 0 && !filled[up]) {
      filled[up] = 1;
      texels[up] = colour;
      queue[tail++] = up;
    }
    if (down < count && !filled[down]) {
      filled[down] = 1;
      texels[down] = colour;
      queue[tail++] = down;
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
