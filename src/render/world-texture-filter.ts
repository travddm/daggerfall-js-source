// The world's texture filter, Daggerfall Unity's Video/MainFilterMode: Point (0, the default), Bilinear (1) or
// Trilinear (2). DFU's MaterialReader puts it on every model, flat and terrain texture, and its weapon and spell-hand
// sprites take it too. UI art, the sky, smoothed pictures and data textures keep their own filters.
//
// A texture keeps the filter it was given at upload, so the renderer asks `refilterWorldTexture` whenever a host asks
// for a cached world texture again: a changed setting reaches each texture the next time a scene uses it. DFU itself
// applies the setting only when the game starts.
import { getString } from '../systems/settings/settings.js';

export const POINT = 0;
export const BILINEAR = 1;
export const TRILINEAR = 2;

/** DFU draws the first-person weapon and spell hands this much larger off Point (FPSWeapon, FPSSpellCasting), so the
 *  filtered edge texels fall off screen. */
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

/** The player's choice, read when it is needed. */
export function worldFilterMode(): number {
  return parseWorldFilterMode(getString('Video', 'MainFilterMode'));
}

/** Unity's three modes on a texture with or without mip maps. Bilinear blends within a mip level and picks the nearest
 *  level; Trilinear also blends between levels. */
export function worldFilterFor(gl: FilterGl, mode: number, mips: boolean): WorldFilter {
  if (mode === TRILINEAR) return { min: mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR, mag: gl.LINEAR };
  if (mode === BILINEAR) return { min: mips ? gl.LINEAR_MIPMAP_NEAREST : gl.LINEAR, mag: gl.LINEAR };
  return { min: mips ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST, mag: gl.NEAREST };
}

type TextureGl = FilterGl & {
  readonly TEXTURE_2D: number;
  readonly TEXTURE_MIN_FILTER: number;
  readonly TEXTURE_MAG_FILTER: number;
  bindTexture(target: number, texture: unknown): void;
  texParameteri(target: number, name: number, value: number): void;
};

/** What a world texture was uploaded with. */
type WorldTextureState = { mips: boolean; mode: number };

/** Every world texture's state, by texture object; a deleted texture drops out on its own. */
const worldTextures = new WeakMap<object, WorldTextureState>();

function setWorldFilter(gl: TextureGl, state: WorldTextureState, mode: number): void {
  const filter = worldFilterFor(gl, mode, state.mips);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter.min);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter.mag);
  state.mode = mode;
}

/** A texture's own filter, for art that is not world art. */
export type OwnFilter = { readonly min: number; readonly mag: number };

/** World art is a mip-mapped classic texture, or a sprite that asks for it (`world`), unless it brings its own
 *  sampler or is smoothed (a picture, the logo). */
export function isWorldArt(opts: { smooth?: boolean; world?: boolean }, mips: boolean, own: OwnFilter | null): boolean {
  return !own && !opts.smooth && (mips || opts.world === true);
}

/** Sets the bound TEXTURE_2D's filter at upload: world art the world filter (recorded, so a later change reaches it),
 *  other art its own sampler's, or `plain` (NEAREST over the mip chain when it has one). */
export function filterUpload(
  gl: TextureGl,
  texture: object | null,
  world: boolean,
  mips: boolean,
  own: OwnFilter | null,
  plain: number,
): void {
  if (world) {
    const state = { mips, mode: worldFilterMode() };
    setWorldFilter(gl, state, state.mode);
    if (texture) worldTextures.set(texture, state);
    return;
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, own ? own.min : mips ? gl.NEAREST_MIPMAP_NEAREST : plain);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, own ? own.mag : plain);
}

/** True when a cached world texture was given another mode than the current one. */
export function needsRefilter(texture: object | null | undefined): boolean {
  const state = texture ? worldTextures.get(texture) : undefined;
  return !!state && state.mode !== worldFilterMode();
}

/** Brings the cached world texture to the current mode; the caller has made its unit active. */
export function refilterWorldTexture(gl: TextureGl, texture: object): void {
  const state = worldTextures.get(texture);
  if (!state) return;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  setWorldFilter(gl, state, worldFilterMode());
}

/** A filter mode as the word a texture's own sampler takes (render/meshAlpha.js samplerParams). A picture without mip
 *  maps blends the same under Bilinear and Trilinear. */
export function samplerFilterWord(mode: number): 'nearest' | 'linear' {
  return mode === POINT ? 'nearest' : 'linear';
}

/** DFU's sprite scale for the current mode: 1 under Point, 1.01 otherwise. */
export function spriteFilterScale(): number {
  return worldFilterMode() === POINT ? 1 : NON_POINT_SPRITE_SCALE;
}
