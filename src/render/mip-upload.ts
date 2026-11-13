// Uploading the mip chains of world pictures, under the Mip quality row (systems/mip-quality-row.ts).
//
// Standard hands the picture to `gl.generateMipmap`, the driver's box average. Sharp builds each level on the CPU
// (render/mip-chain.ts) from the picture's level 0, as that level was uploaded, and uploads it by hand. The same levels
// of the same sizes are uploaded either way, so the texture's memory is the same.
//
// Every texture that takes either path is remembered here. When the row changes, each one is given the other chain at
// once: Standard calls `generateMipmap` again, which rebuilds every level from level 0; Sharp reads level 0 back from
// the GPU and builds from that. No CPU copy of a picture is kept for it.
import { getPref } from '../systems/uiPrefs.js';
import { MIP_QUALITY_DEFAULT, MIP_QUALITY_PREF } from '../systems/mip-quality-row.ts';
import { buildMipChain, mipLevelCount, type MipLevel } from './mip-chain.ts';

export type MipQuality = 'standard' | 'sharp';

/** How a picture's levels are filtered at its edges and in its alpha (render/mip-chain.ts). */
export type MipSpec = {
  readonly wrapX: boolean;
  readonly wrapY: boolean;
  readonly premultiplied?: boolean;
  readonly opaque?: boolean;
};

/** The calls of a WebGL 2 context this module makes. */
export type MipGl = Pick<
  WebGL2RenderingContext,
  | 'TEXTURE_2D'
  | 'TEXTURE_2D_ARRAY'
  | 'RGBA'
  | 'UNSIGNED_BYTE'
  | 'FRAMEBUFFER'
  | 'FRAMEBUFFER_BINDING'
  | 'COLOR_ATTACHMENT0'
  | 'createFramebuffer'
  | 'deleteFramebuffer'
  | 'bindFramebuffer'
  | 'bindTexture'
  | 'framebufferTexture2D'
  | 'framebufferTextureLayer'
  | 'readPixels'
  | 'getParameter'
  | 'generateMipmap'
  | 'texImage3D'
  | 'texSubImage2D'
  | 'texSubImage3D'
  | 'isTexture'
>;

/** The row's value now. Anything stored that is not `standard` is Sharp. */
export function mipQuality(): MipQuality {
  const stored = getPref(MIP_QUALITY_PREF) ?? MIP_QUALITY_DEFAULT;
  return stored === 'standard' ? 'standard' : 'sharp';
}

type Tracked = {
  readonly target: number;
  readonly width: number;
  readonly height: number;
  readonly layers: number;
  readonly spec: MipSpec;
};

const tracked = new Map<WebGLTexture, Tracked>();

/** Forgets every remembered texture: a lost context's textures are gone, and a test starts clean. */
export function forgetTrackedMips(): void {
  tracked.clear();
}

/** Remembers a texture whose chain follows the row. `layers` is 1 for a plain 2D texture. */
export function trackMips(
  texture: WebGLTexture | null,
  target: number,
  width: number,
  height: number,
  layers: number,
  spec: MipSpec,
): void {
  if (texture) tracked.set(texture, { target, width, height, layers, spec });
}

// A texture the renderer deletes stays in the map until a sweep finds it gone; the sweep runs each time the map has
// doubled since the last one.
let sweepAt = 256;

function sweepDeleted(gl: Pick<WebGL2RenderingContext, 'isTexture'>): void {
  for (const texture of tracked.keys()) if (!gl.isTexture(texture)) tracked.delete(texture);
  sweepAt = Math.max(256, tracked.size * 2);
}

/** Builds the bound 2D texture's chain under the row, from its level-0 bytes, and remembers the texture. */
export function uploadWorldMips(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture | null,
  level0: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  spec: MipSpec,
): void {
  if (tracked.size >= sweepAt) sweepDeleted(gl);
  trackMips(texture, gl.TEXTURE_2D, width, height, 1, spec);
  if (mipQuality() === 'sharp' && hasMips(width, height)) uploadTextureMips(gl, level0, width, height, spec);
  else gl.generateMipmap?.(gl.TEXTURE_2D);
}

type Canvas2dSource = {
  readonly width: number;
  readonly height: number;
  getContext?(
    kind: '2d',
  ): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } | null;
};

/** The bound 2D texture's chain, for a texture uploaded from a canvas with UNPACK_PREMULTIPLY_ALPHA_WEBGL: its levels
 *  are premultiplied too, so a cut's edge mips without a dark rim. Level 0 is the caller's, as it was. A canvas that
 *  cannot be read as 2D takes the driver's chain. */
export function uploadCanvasMips(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture | null,
  canvas: Canvas2dSource,
): void {
  const { width, height } = canvas;
  const spec: MipSpec = { wrapX: false, wrapY: false, premultiplied: true };
  const context = mipQuality() === 'sharp' && hasMips(width, height) ? canvas.getContext?.('2d') : null;
  trackMips(texture, gl.TEXTURE_2D, width, height, 1, spec);
  if (!context) {
    gl.generateMipmap(gl.TEXTURE_2D);
    return;
  }
  const bytes = context.getImageData(0, 0, width, height).data;
  for (let i = 0; i < bytes.length; i += 4) {
    const alpha = bytes[i + 3];
    if (alpha === 255) continue;
    bytes[i] = Math.round((bytes[i] * alpha) / 255);
    bytes[i + 1] = Math.round((bytes[i + 1] * alpha) / 255);
    bytes[i + 2] = Math.round((bytes[i + 2] * alpha) / 255);
  }
  uploadTextureMips(gl, bytes, width, height, spec);
}

/** The bound 2D texture's chain, for a texture uploaded from a decoded image (an ImageBitmap) with straight alpha. The
 *  image's pixels are read through a canvas; where none can be made the driver's chain is used. */
export function uploadImageMips(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture | null,
  image: { readonly width: number; readonly height: number },
  spec: MipSpec,
): void {
  const { width, height } = image;
  trackMips(texture, gl.TEXTURE_2D, width, height, 1, spec);
  const canvas = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(width, height);
  const context = mipQuality() === 'sharp' && hasMips(width, height) ? canvas?.getContext('2d') : null;
  if (!context) {
    gl.generateMipmap(gl.TEXTURE_2D);
    return;
  }
  context.drawImage(image as ImageBitmap, 0, 0);
  uploadTextureMips(gl, context.getImageData(0, 0, width, height).data, width, height, spec);
}

/** Whether a picture of this size has any level below level 0. */
export function hasMips(width: number, height: number): boolean {
  return mipLevelCount(width, height) > 0;
}

/** Allocates levels 1 and up of an array of `layers` pictures, ready for `uploadLayerMips`. */
export function allocateArrayMips(gl: MipGl, width: number, height: number, layers: number): void {
  let w = width;
  let h = height;
  for (let level = 1; level <= mipLevelCount(width, height); level++) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, level, gl.RGBA, w, h, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
}

/** A 2D array texture under construction, layer by layer: Sharp allocates every level up front and builds each layer's
 *  levels as the layer goes up, so the cost spreads over the caller's steps; Standard asks the driver at the end.
 *  The array must be bound by the caller, who has uploaded no level yet but level 0's allocation. */
export class ArrayMips {
  private readonly sharp: boolean;
  private readonly spec: MipSpec = { wrapX: false, wrapY: false };

  private readonly gl: WebGL2RenderingContext;
  private readonly width: number;
  private readonly height: number;
  private readonly layers: number;

  constructor(gl: WebGL2RenderingContext, width: number, height: number, layers: number) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.layers = layers;
    this.sharp = mipQuality() === 'sharp' && hasMips(width, height);
    if (this.sharp) allocateArrayMips(gl, width, height, layers);
  }

  /** Uploads layer `index`: level 0 as it is, and under Sharp its other levels. */
  put(index: number, rgba: Uint8Array | Uint8ClampedArray): void {
    const gl = this.gl;
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, index, this.width, this.height, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    if (this.sharp) uploadLayerMips(gl, rgba, this.width, this.height, index, this.spec);
  }

  /** Ends the build: the driver's chain under Standard, and the array is remembered for a change of the row. Tiles are
   *  drawn rotated and flipped, so their levels stop at the edge of the tile and never reach the neighbouring copy. */
  finish(texture: WebGLTexture | null): void {
    if (!this.sharp) this.gl.generateMipmap(this.gl.TEXTURE_2D_ARRAY);
    trackMips(texture, this.gl.TEXTURE_2D_ARRAY, this.width, this.height, this.layers, this.spec);
  }
}

/** Uploads levels 1 and up of one layer of the bound array, built from the layer's level-0 bytes. */
export function uploadLayerMips(
  gl: MipGl,
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  layer: number,
  spec: MipSpec,
): void {
  const levels = buildMipChain(rgba, width, height, spec);
  putArrayLevels(gl, levels, layer);
}

/** Uploads levels 1 and up of the bound 2D texture, whose level 0 is already up and whose other levels are not
 *  allocated, from the level-0 bytes. */
export function uploadTextureMips(
  gl: WebGL2RenderingContext,
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  spec: MipSpec,
): void {
  const levels = buildMipChain(rgba, width, height, spec);
  levels.forEach((level, i) => {
    gl.texImage2D(gl.TEXTURE_2D, i + 1, gl.RGBA, level.width, level.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, level.data);
  });
}

function putArrayLevels(gl: MipGl, levels: readonly MipLevel[], layer: number): void {
  levels.forEach((level, i) => {
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      i + 1,
      0,
      0,
      layer,
      level.width,
      level.height,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      level.data,
    );
  });
}

function putTextureLevels(gl: MipGl, levels: readonly MipLevel[]): void {
  levels.forEach((level, i) => {
    gl.texSubImage2D(gl.TEXTURE_2D, i + 1, 0, 0, level.width, level.height, gl.RGBA, gl.UNSIGNED_BYTE, level.data);
  });
}

/** Gives every remembered texture the chain the row now asks for. The caller forgets the texture bindings it shadows. */
export function applyMipQuality(gl: MipGl, quality: MipQuality = mipQuality()): void {
  const framebuffer = gl.createFramebuffer();
  const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  for (const [texture, entry] of tracked) {
    if (!gl.isTexture(texture)) {
      tracked.delete(texture);
      continue;
    }
    gl.bindTexture(entry.target, texture);
    if (quality === 'standard') {
      gl.generateMipmap(entry.target);
      continue;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    for (let layer = 0; layer < entry.layers; layer++) {
      if (entry.target === gl.TEXTURE_2D_ARRAY) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, texture, 0, layer);
      } else {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, entry.target, texture, 0);
      }
      const level0 = new Uint8Array(entry.width * entry.height * 4);
      gl.readPixels(0, 0, entry.width, entry.height, gl.RGBA, gl.UNSIGNED_BYTE, level0);
      const levels = buildMipChain(level0, entry.width, entry.height, entry.spec);
      if (entry.target === gl.TEXTURE_2D_ARRAY) putArrayLevels(gl, levels, layer);
      else putTextureLevels(gl, levels);
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
  gl.deleteFramebuffer(framebuffer);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
}
