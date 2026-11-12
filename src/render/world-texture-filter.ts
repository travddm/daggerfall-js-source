// The world's texture filter, Daggerfall Unity's Video/MainFilterMode: Point (0, the default), Bilinear (1) or
// Trilinear (2). DFU's MaterialReader puts it on every model, flat and terrain texture, and its weapon and spell-hand
// sprites take it too. UI art, the sky, smoothed pictures and data textures keep their own filters.
//
// A texture keeps the filter it was given at upload. A changed setting reaches every cached world texture on the next
// frame (render/live-world-sampling.ts), and a host that asks for a cached texture again re-filters it too.
import { getString } from '../systems/settings/settings.js';

export const POINT = 0;
export const BILINEAR = 1;
export const TRILINEAR = 2;

/** DFU draws the first-person weapon and spell hands this much larger off Point (FPSWeapon and its spell-casting class), so the
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

/** The quality level's anisotropy on world art, Unity's three modes over DFU's quality levels (QualitySettings.asset):
 *  Fastest and Fast disable it, Simple and Good use each texture's own level, Beautiful and Fantastic force it on.
 *  DFU never sets a level on models or flats, so they stay at 1 unless it is forced, and forced on, Unity raises a
 *  level from 1 to 9 to 9 (Texture.anisoLevel). The ground's anisotropy is the Ground sharpness row's.
 *
 *  Under Point it is always 1: Direct3D, under ANGLE, makes a sampler with anisotropy above 1 fully linear, so the
 *  default Point picture keeps its square texels and its cost whatever the quality level. */
export function qualityAnisotropyFor(level: number, mode: number, driverMax: number): number {
  if (mode === POINT || level < FORCED_QUALITY_LEVEL) return 1;
  return Math.max(1, Math.min(FORCED_ANISOTROPY, driverMax || 1));
}

/** Beautiful, the first quality level that forces anisotropy on. */
const FORCED_QUALITY_LEVEL = 4;
/** The level Unity gives a texture at level 1 to 9 when anisotropy is forced. */
const FORCED_ANISOTROPY = 9;

/** The quality level as DFU reads it: 0 to 5, anything else Fantastic (DFU's default). */
export function parseQualityLevel(stored: string | null | undefined): number {
  const level = Number.parseInt(String(stored ?? ''), 10);
  return Number.isInteger(level) && level >= 0 && level <= 5 ? level : 5;
}

type AnisotropyExtension = {
  readonly TEXTURE_MAX_ANISOTROPY_EXT: number;
  readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
};

type TextureGl = FilterGl & {
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
const anisotropyOf = new WeakMap<object, { ext: AnisotropyExtension | null; max: number }>();
function anisotropyExtension(gl: TextureGl): { ext: AnisotropyExtension | null; max: number } {
  let found = anisotropyOf.get(gl);
  if (!found) {
    const ext = (gl.getExtension('EXT_texture_filter_anisotropic') as AnisotropyExtension | null) ?? null;
    const max = ext ? Number(gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1 : 1;
    found = { ext, max };
    anisotropyOf.set(gl, found);
  }
  return found;
}

/** The world filter and anisotropy in force now, for this context. */
function currentWorldSampling(gl: TextureGl): { mode: number; aniso: number } {
  const mode = worldFilterMode();
  const level = parseQualityLevel(getString('Video', 'QualityLevel'));
  return { mode, aniso: qualityAnisotropyFor(level, mode, anisotropyExtension(gl).max) };
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
  if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, now.aniso);
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

/** DFU's sprite scale for the current mode: 1 under Point, 1.01 otherwise. */
export function spriteFilterScale(): number {
  return worldFilterMode() === POINT ? 1 : NON_POINT_SPRITE_SCALE;
}
