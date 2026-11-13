// The mip chain of a world picture, built on the CPU with a sharper filter than the driver's.
//
// `gl.generateMipmap` averages each 2 x 2 block of texels in the stored (sRGB) numbers. Averaging in those numbers
// darkens a distant bright and dark pattern, the box also blurs: a one-texel line is spread over two texels of the next
// level at half contrast. This builder filters in linear light with a windowed-sinc kernel, which keeps a line's contrast
// longer, and it does the following for cut-outs:
//   - the colour is weighted by alpha, so a transparent texel's colour never leaks into an opaque one;
//   - for art whose alpha is only 0 or 255 (a cut-out the shader discards below half alpha), each level's alpha is scaled
//     so the same share of texels stays above the cut, so a tree or a sign neither thins nor grows with distance
//     (Unity's "mip maps preserve coverage");
//   - each level's transparent texels then take the colour of the nearest opaque texel (render/alpha-bleed.ts), as the
//     picture's own level does, so a linear filter at a cut's edge shows no dark rim at any level.
// A level is filtered from the float level above it, never from an 8-bit level, so a rounding error is not filtered again.
import { bleedTransparentTexels } from './alpha-bleed.ts';

/** The kernels tried. `box` is the driver's own average (still in linear light here), the others are windowed sinc. */
export type MipKernel = 'box' | 'lanczos2' | 'lanczos3' | 'kaiser';

export type MipLevel = { readonly width: number; readonly height: number; readonly data: Uint8Array };

export type MipOptions = {
  /** The texture's wrap on each axis: a repeating axis filters across its edge, a clamped one stops at it. */
  readonly wrapX: boolean;
  readonly wrapY: boolean;
  /** The kernel; the module's default when left out. */
  readonly kernel?: MipKernel;
  /** The bytes hold colour already multiplied by alpha (a canvas uploaded with UNPACK_PREMULTIPLY_ALPHA_WEBGL), and
   *  every level is returned that way, with no bleed. */
  readonly premultiplied?: boolean;
  /** A picture that is only colour, with no alpha to keep: the fourth channel is ignored and every level is opaque. */
  readonly opaque?: boolean;
};

/** The kernel the world's pictures use. Chosen from stills at the Daggerfall gate (docs/rendering/performance.md). */
export const DEFAULT_MIP_KERNEL: MipKernel = 'lanczos2';

/** Below this share of a texel's alpha the world shaders discard it (uAlphaCut and the flats' cut are 0.5). */
const ALPHA_CUT = 0.5;
/** A level's alpha is scaled up by at most this to bring its coverage back; it is never scaled down. */
const MAX_COVERAGE_SCALE = 8;
const COVERAGE_BINS = 1024;
const SRGB_TO_LINEAR = buildDecodeTable();
const ENCODE_STEPS = 4096;
const LINEAR_TO_SRGB = buildEncodeTable();

/** The number of levels below level 0 a picture of this size has: GL's chain runs to 1 x 1, each side halving down. */
export function mipLevelCount(width: number, height: number): number {
  let levels = 0;
  let w = width;
  let h = height;
  while (w > 1 || h > 1) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    levels++;
  }
  return levels;
}

/** Levels 1 and up of a picture of `width` x `height` RGBA texels, each side `max(1, floor(side / 2))` of the one above,
 *  which is the size GL expects for a complete chain. Level 0 is the caller's, uploaded as it is. */
export function buildMipChain(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: MipOptions,
): MipLevel[] {
  const count = mipLevelCount(width, height);
  if (count === 0) return [];
  const kernel = options.kernel ?? DEFAULT_MIP_KERNEL;
  const premultiplied = options.premultiplied === true;
  const opaque = options.opaque === true;
  const levelZero = toLinearPremultiplied(rgba, width * height, premultiplied, opaque);
  const targetCoverage = opaque || premultiplied ? -1 : binaryCoverage(rgba, width * height);
  const levels: MipLevel[] = [];
  let source = levelZero;
  let sourceWidth = width;
  let sourceHeight = height;
  for (let level = 1; level <= count; level++) {
    const nextWidth = Math.max(1, sourceWidth >> 1);
    const nextHeight = Math.max(1, sourceHeight >> 1);
    const across = axisWeights(sourceWidth, nextWidth, kernel, options.wrapX);
    const down = axisWeights(sourceHeight, nextHeight, kernel, options.wrapY);
    const next = resample(source, sourceWidth, sourceHeight, across, down, nextWidth, nextHeight);
    if (targetCoverage >= 0) keepCoverage(next, nextWidth * nextHeight, targetCoverage);
    levels.push({
      width: nextWidth,
      height: nextHeight,
      data: quantise(next, nextWidth, nextHeight, premultiplied, opaque),
    });
    source = next;
    sourceWidth = nextWidth;
    sourceHeight = nextHeight;
  }
  return levels;
}

function buildDecodeTable(): Float32Array {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return table;
}

function buildEncodeTable(): Uint8Array {
  const table = new Uint8Array(ENCODE_STEPS + 1);
  for (let i = 0; i <= ENCODE_STEPS; i++) {
    const c = i / ENCODE_STEPS;
    const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    table[i] = Math.round(Math.max(0, Math.min(1, encoded)) * 255);
  }
  return table;
}

/** Linear colour times alpha, then alpha, four floats a texel. */
function toLinearPremultiplied(
  rgba: Uint8Array | Uint8ClampedArray,
  texels: number,
  premultiplied: boolean,
  opaque: boolean,
): Float32Array {
  const out = new Float32Array(texels * 4);
  for (let i = 0; i < texels; i++) {
    const at = i * 4;
    const alpha = opaque ? 1 : rgba[at + 3] / 255;
    out[at + 3] = alpha;
    if (alpha === 0) continue;
    // premultiplied bytes hold colour * alpha in the stored numbers: the straight colour comes back first
    const scale = premultiplied ? 255 / (alpha * 255) : 1;
    for (let c = 0; c < 3; c++) {
      const stored = Math.min(255, Math.round(rgba[at + c] * scale));
      out[at + c] = SRGB_TO_LINEAR[stored] * alpha;
    }
  }
  return out;
}

/** The share of texels at or over the cut, when the picture's alpha is only 0 and 255 with some of each; else -1. */
function binaryCoverage(rgba: Uint8Array | Uint8ClampedArray, texels: number): number {
  let solid = 0;
  for (let i = 0; i < texels; i++) {
    const alpha = rgba[i * 4 + 3];
    if (alpha === 255) solid++;
    else if (alpha !== 0) return -1;
  }
  return solid === 0 || solid === texels ? -1 : solid / texels;
}

type AxisWeights = {
  /** The first tap of destination texel i is at `starts[i]` in `taps`/`weights`, and `ends[i]` is one past its last. */
  readonly starts: Int32Array;
  readonly ends: Int32Array;
  readonly taps: Int32Array;
  readonly weights: Float32Array;
};

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/** Modified Bessel function of order 0, by its series. */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 30; k++) {
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
  }
  return sum;
}

const KAISER_BETA = 4;
const KAISER_NORMALISER = besselI0(KAISER_BETA);

/** The kernel's weight at `x` destination texels from the centre, and its reach in destination texels. */
function kernelAt(kernel: MipKernel, x: number): number {
  const d = Math.abs(x);
  switch (kernel) {
    case 'box':
      return d < 0.5 ? 1 : d === 0.5 ? 0.5 : 0;
    case 'lanczos2':
      return d < 2 ? sinc(d) * sinc(d / 2) : 0;
    case 'lanczos3':
      return d < 3 ? sinc(d) * sinc(d / 3) : 0;
    case 'kaiser':
      return d < 3 ? sinc(d) * (besselI0(KAISER_BETA * Math.sqrt(1 - (d / 3) * (d / 3))) / KAISER_NORMALISER) : 0;
  }
}

function kernelReach(kernel: MipKernel): number {
  switch (kernel) {
    case 'box':
      return 0.5;
    case 'lanczos2':
      return 2;
    case 'lanczos3':
    case 'kaiser':
      return 3;
  }
}

/** The taps that shrink `from` texels to `to` along one axis. Weights sum to 1. A texel pair that GL would average is
 *  here the kernel centred on the pair; an odd side's texel at the far end is reached too. */
function axisWeights(from: number, to: number, kernel: MipKernel, wrap: boolean): AxisWeights {
  const scale = from / to;
  const reach = kernelReach(kernel) * scale;
  const maxTaps = Math.ceil(reach * 2) + 2;
  const starts = new Int32Array(to);
  const ends = new Int32Array(to);
  const taps = new Int32Array(to * maxTaps);
  const weights = new Float32Array(to * maxTaps);
  let at = 0;
  for (let i = 0; i < to; i++) {
    const centre = (i + 0.5) * scale - 0.5;
    const first = Math.ceil(centre - reach);
    const last = Math.floor(centre + reach);
    starts[i] = at;
    let total = 0;
    const base = at;
    for (let s = first; s <= last; s++) {
      const weight = kernelAt(kernel, (s - centre) / scale);
      if (weight === 0) continue;
      let index = s;
      if (wrap) index = ((s % from) + from) % from;
      else index = Math.max(0, Math.min(from - 1, s));
      taps[at] = index;
      weights[at] = weight;
      total += weight;
      at++;
    }
    for (let k = base; k < at; k++) weights[k] /= total;
    ends[i] = at;
  }
  return { starts, ends, taps, weights };
}

/** Two separable passes over four-float texels: across, then down. */
function resample(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  across: AxisWeights,
  down: AxisWeights,
  width: number,
  height: number,
): Float32Array {
  const middle = new Float32Array(width * sourceHeight * 4);
  for (let y = 0; y < sourceHeight; y++) {
    const row = y * sourceWidth * 4;
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = across.starts[x]; k < across.ends[x]; k++) {
        const from = row + across.taps[k] * 4;
        const w = across.weights[k];
        r += source[from] * w;
        g += source[from + 1] * w;
        b += source[from + 2] * w;
        a += source[from + 3] * w;
      }
      const to = (y * width + x) * 4;
      middle[to] = r;
      middle[to + 1] = g;
      middle[to + 2] = b;
      middle[to + 3] = a;
    }
  }
  const out = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = down.starts[y]; k < down.ends[y]; k++) {
        const from = (down.taps[k] * width + x) * 4;
        const w = down.weights[k];
        r += middle[from] * w;
        g += middle[from + 1] * w;
        b += middle[from + 2] * w;
        a += middle[from + 3] * w;
      }
      const to = (y * width + x) * 4;
      // a negative lobe can undershoot: a colour is never below black nor above its own alpha
      out[to] = Math.max(0, r);
      out[to + 1] = Math.max(0, g);
      out[to + 2] = Math.max(0, b);
      out[to + 3] = Math.max(0, Math.min(1, a));
    }
  }
  return out;
}

/** Scales the level's alpha so the share of texels at or over the cut is `target`. Colour is premultiplied, so it is
 *  scaled with the alpha, and the colour of a texel stays what it was once the division by alpha is taken. */
function keepCoverage(level: Float32Array, texels: number, target: number): void {
  const histogram = new Uint32Array(COVERAGE_BINS + 1);
  for (let i = 0; i < texels; i++) histogram[Math.round(level[i * 4 + 3] * COVERAGE_BINS)]++;
  // the alpha above which `target` of the texels lie
  const wanted = Math.round(target * texels);
  let above = 0;
  let bin = COVERAGE_BINS;
  for (; bin > 0; bin--) {
    above += histogram[bin];
    if (above >= wanted) break;
  }
  const threshold = bin / COVERAGE_BINS;
  if (threshold <= 0) return;
  const scale = Math.min(MAX_COVERAGE_SCALE, ALPHA_CUT / threshold);
  if (scale <= 1) return;
  for (let i = 0; i < texels; i++) {
    const alpha = level[i * 4 + 3];
    if (alpha === 0) continue;
    const scaled = Math.min(1, alpha * scale);
    const keep = scaled / alpha;
    level[i * 4] *= keep;
    level[i * 4 + 1] *= keep;
    level[i * 4 + 2] *= keep;
    level[i * 4 + 3] = scaled;
  }
}

function encode(linear: number): number {
  return LINEAR_TO_SRGB[Math.min(ENCODE_STEPS, Math.round(linear * ENCODE_STEPS))];
}

/** The level as stored bytes: straight alpha and bled, or (for a premultiplied picture) premultiplied in the stored
 *  numbers; or opaque colour alone. */
function quantise(
  level: Float32Array,
  width: number,
  height: number,
  premultiplied: boolean,
  opaque: boolean,
): Uint8Array {
  const texels = width * height;
  const out = new Uint8Array(texels * 4);
  for (let i = 0; i < texels; i++) {
    const at = i * 4;
    const alpha = level[at + 3];
    if (opaque || alpha === 1) {
      out[at] = encode(level[at]);
      out[at + 1] = encode(level[at + 1]);
      out[at + 2] = encode(level[at + 2]);
      out[at + 3] = 255;
      continue;
    }
    const byteAlpha = Math.round(alpha * 255);
    out[at + 3] = byteAlpha;
    if (alpha <= 0) continue;
    for (let c = 0; c < 3; c++) {
      const stored = encode(Math.min(1, level[at + c] / alpha));
      out[at + c] = premultiplied ? Math.round((stored * byteAlpha) / 255) : stored;
    }
  }
  return premultiplied ? out : bleedTransparentTexels(out, width, height);
}
