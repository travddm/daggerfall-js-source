// The world's texture filter, Daggerfall Unity's Video/MainFilterMode: Point (0, DFU's default), Bilinear (1),
// Trilinear (2), and the port's Sharp (3, render/sharp-texels.ts), the port's default and a departure from DFU. DFU's
// MaterialReader puts the filter on every model, flat and terrain texture, and its weapon and spell-hand sprites take it
// too. UI art, the sky, smoothed pictures and data textures keep their own filters.
//
// A texture keeps the filter it was given at upload. A changed setting reaches every cached world texture on the next
// frame (render/live-world-sampling.ts), and a host that asks for a cached texture again re-filters it too.
import { getString } from '../systems/settings/settings.js';
import { SHARP } from './sharp-texels.ts';
import { anisotropyOf, anisotropySetting } from './anisotropic-filtering.ts';

export const POINT = 0;
export const BILINEAR = 1;
export const TRILINEAR = 2;

/** DFU draws the first-person weapon and spell hands this much larger off Point (FPSWeapon and its spell-casting
 *  class), so the filtered edge texels fall off screen. */
export const NON_POINT_SPRITE_SCALE = 1.01;

/** The filter constants a WebGL2 context answers. */
export type FilterGl = {
  readonly NEAREST: number;
  readonly LINEAR: number;
  readonly NEAREST_MIPMAP_NEAREST: number;
  readonly LINEAR_MIPMAP_NEAREST: number;
  readonly LINEAR_MIPMAP_LINEAR: number;
};

export type WorldFilter = { readonly min: number; readonly mag: number };

/** The stored value as DFU reads it: an integer from 0 to 2, anything else Point. */
export function parseWorldFilterMode(stored: string | null | undefined): number {
  const mode = Number.parseInt(String(stored ?? ''), 10);
  return mode === BILINEAR || mode === TRILINEAR ? mode : POINT;
}

/** Video/MainFilterMode as stored: DFU's three, or Sharp; anything else Point. The video and compass keys have DFU's
 *  three alone (parseWorldFilterMode). */
export function parseMainFilterMode(stored: string | null | undefined): number {
  return Number.parseInt(String(stored ?? ''), 10) === SHARP ? SHARP : parseWorldFilterMode(stored);
}

/** The player's choice, read when it is needed. */
export function worldFilterMode(): number {
  return parseMainFilterMode(getString('Video', 'MainFilterMode'));
}

/** Unity's three modes on a texture with or without mip maps. Bilinear blends within a mip level and picks the nearest
 *  level; Trilinear also blends between levels. Sharp samples a mip-mapped texture trilinear (its shaders keep the
 *  texels square); a sprite without mip maps (the weapon, the spell hands) is drawn by a screen quad no Sharp shader
 *  reaches, so it stays nearest. */
export function worldFilterFor(gl: FilterGl, mode: number, mips: boolean): WorldFilter {
  if (mode === SHARP)
    return mips ? { min: gl.LINEAR_MIPMAP_LINEAR, mag: gl.LINEAR } : { min: gl.NEAREST, mag: gl.NEAREST };
  if (mode === TRILINEAR) return { min: mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR, mag: gl.LINEAR };
  if (mode === BILINEAR) return { min: mips ? gl.LINEAR_MIPMAP_NEAREST : gl.LINEAR, mag: gl.LINEAR };
  return { min: mips ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST, mag: gl.NEAREST };
}

type AnisotropyExtension = {
  readonly TEXTURE_MAX_ANISOTROPY_EXT: number;
  readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
};

export type TextureGl = FilterGl & {
  readonly TEXTURE_2D: number;
  readonly TEXTURE_MIN_FILTER: number;
  readonly TEXTURE_MAG_FILTER: number;
  bindTexture(target: number, texture: unknown): void;
  texParameteri(target: number, name: number, value: number): void;
  texParameterf(target: number, name: number, value: number): void;
  getExtension(name: string): unknown;
  getParameter(name: number): unknown;
};

/** The anisotropy extension and the driver's ceiling, asked once per context. */
const extensionOf = new WeakMap<object, { ext: AnisotropyExtension | null; max: number }>();
export function anisotropyExtension(gl: TextureGl): { ext: AnisotropyExtension | null; max: number } {
  let found = extensionOf.get(gl);
  if (!found) {
    const ext = (gl.getExtension('EXT_texture_filter_anisotropic') as AnisotropyExtension | null) ?? null;
    const max = ext ? Number(gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1 : 1;
    found = { ext, max };
    extensionOf.set(gl, found);
  }
  return found;
}

/** The world filter and anisotropy in force now, for this context. */
function currentWorldSampling(gl: TextureGl): { mode: number; aniso: number } {
  const mode = worldFilterMode();
  return { mode, aniso: anisotropyOf(anisotropySetting(), anisotropyExtension(gl).max, false, mode === POINT) };
}

/** What a world texture was uploaded with. */
type WorldTextureState = { mips: boolean; mode: number; aniso: number };

/** Every world texture's state, by texture object; a deleted texture drops out on its own. */
const worldTextures = new WeakMap<object, WorldTextureState>();

function setWorldSampling(gl: TextureGl, state: WorldTextureState, now: { mode: number; aniso: number }): void {
  const filter = worldFilterFor(gl, now.mode, state.mips);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter.min);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter.mag);
  const { ext } = anisotropyExtension(gl);
  // a texture without mip maps takes none: under Sharp it is a nearest sprite, which anisotropy would smear on ANGLE
  if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, state.mips ? now.aniso : 1);
  state.mode = now.mode;
  state.aniso = now.aniso;
}

/** A texture's own filter, for art that is not world art. */
export type OwnFilter = { readonly min: number; readonly mag: number };

/** World art is a mip-mapped classic texture, or a sprite that asks for it (`world`), unless it brings its own
 *  sampler or is smoothed (a picture, the logo). */
export function isWorldArt(opts: { smooth?: boolean; world?: boolean }, mips: boolean, own: OwnFilter | null): boolean {
  return !own && !opts.smooth && (mips || opts.world === true);
}

/** Sets the bound TEXTURE_2D's filter at upload: world art the world filter and the quality level's anisotropy
 *  (recorded, so a later change reaches it), other art its own sampler's, or `plain` (NEAREST over the mip chain when
 *  it has one). */
export function filterUpload(
  gl: TextureGl,
  texture: object | null,
  world: boolean,
  mips: boolean,
  own: OwnFilter | null,
  plain: number,
): void {
  if (world) {
    const state = { mips, mode: POINT, aniso: 1 };
    setWorldSampling(gl, state, currentWorldSampling(gl));
    if (texture) worldTextures.set(texture, state);
    return;
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, own ? own.min : mips ? gl.NEAREST_MIPMAP_NEAREST : plain);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, own ? own.mag : plain);
}

/** True when a cached world texture was given another filter or anisotropy than the current ones. */
export function needsRefilter(gl: TextureGl, texture: object | null | undefined): boolean {
  const state = texture ? worldTextures.get(texture) : undefined;
  if (!state) return false;
  const now = currentWorldSampling(gl);
  return state.mode !== now.mode || state.aniso !== now.aniso;
}

/** Brings the cached world texture to the current filter and anisotropy; the caller has made its unit active. */
export function refilterWorldTexture(gl: TextureGl, texture: object): void {
  const state = worldTextures.get(texture);
  if (!state) return;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  setWorldSampling(gl, state, currentWorldSampling(gl));
}

/** A filter mode as the word a texture's own sampler takes (render/meshAlpha.js samplerParams). A picture without mip
 *  maps blends the same under Bilinear and Trilinear. */
export function samplerFilterWord(mode: number): 'nearest' | 'linear' {
  return mode === POINT ? 'nearest' : 'linear';
}

/** DFU's sprite scale for the current mode: 1 under Point and Sharp (both draw the sprites nearest), 1.01 otherwise. */
export function spriteFilterScale(): number {
  const mode = worldFilterMode();
  return mode === POINT || mode === SHARP ? 1 : NON_POINT_SPRITE_SCALE;
}
