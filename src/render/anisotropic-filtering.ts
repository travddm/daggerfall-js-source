// The Anisotropic Filtering row: how clear the world's textures stay at a slant, for every world texture and the
// ground. It goes beyond DFU, which has no such setting: DFU fixes its terrain at 8x (TextureReader
// .GetTerrainTextureArray, anisoLevel = 8) and gets the rest from Unity's quality levels (QualitySettings.asset:
// Fastest and Fast disable anisotropy, Simple and Good use each texture's own level, Beautiful and Fantastic force it
// on). Detail Level (Video/QualityLevel) sets this row the same way when the player changes it, and the player can
// change the row afterwards.
//
// Under the Point world filter the anisotropy is always 1: Direct3D under ANGLE makes a sampler with anisotropy above
// 1 anisotropic for magnification too, so Point textures would lose their square texels.
import { getPref, setPref } from '../systems/uiPrefs.js';
import { onSettingChange } from '../systems/settings/settings.js';
import { ANISOTROPY_DEFAULT, ANISOTROPY_PREF } from '../systems/anisotropic-filtering-row.ts';

export { ANISOTROPY_DEFAULT, ANISOTROPY_PREF };

/** The row's values, in its order: off, each texture's own (DFU's Enable), then the levels. */
export const ANISOTROPY_TIERS = Object.freeze(['off', 'texture', 2, 4, 8, 16] as const);

/** DFU's terrain anisotropy (TextureReader.GetTerrainTextureArray). */
const TERRAIN_ANISOTROPY = 8;

/** Beautiful, the first of DFU's quality levels that forces anisotropy on. */
const FORCED_QUALITY_LEVEL = 4;
/** Simple, the first that uses each texture's own level. */
const PER_TEXTURE_QUALITY_LEVEL = 2;

/** The row's value as the player set it. */
export function anisotropySetting(): unknown {
  return getPref(ANISOTROPY_PREF);
}

/** The anisotropy a texture gets: 1 under Point and at Off; at Per texture, DFU's 8x on the ground and 1 elsewhere
 *  (DFU never sets a level on models or flats); else the level, within the driver's ceiling. */
export function anisotropyOf(setting: unknown, driverMax: number, ground: boolean, pointFilter: boolean): number {
  const cap = Math.max(1, driverMax || 1);
  if (pointFilter || setting === 'off') return 1;
  if (setting === 'texture') return ground ? Math.min(TERRAIN_ANISOTROPY, cap) : 1;
  const level = Number(setting);
  return Math.min(Number.isFinite(level) && level >= 1 ? level : ANISOTROPY_DEFAULT, cap);
}

/** The setting's place in the row, read without allocating (for the renderer's per-frame key). */
export function anisotropyIndex(setting: unknown): number {
  if (setting === 'off') return 0;
  if (setting === 'texture') return 1;
  const level = Number(setting);
  if (level === 2) return 2;
  if (level === 4) return 3;
  if (level === 16) return 5;
  return 4;
}

/** The quality level as DFU reads it: 0 to 5, anything else Fantastic (DFU's default). */
export function parseQualityLevel(stored: string | null | undefined): number {
  const level = Number.parseInt(String(stored ?? ''), 10);
  return Number.isInteger(level) && level >= 0 && level <= 5 ? level : 5;
}

/** What a quality level sets the row to, as DFU's quality levels set Unity's anisotropy. Beautiful and Fantastic force
 *  it on; Unity then raises a texture's level from 1 to 9 to 9 (Texture.anisoLevel), and 8x is the step below it. */
export function detailLevelAnisotropy(level: number): 'off' | 'texture' | number {
  if (level >= FORCED_QUALITY_LEVEL) return ANISOTROPY_DEFAULT;
  if (level >= PER_TEXTURE_QUALITY_LEVEL) return 'texture';
  return 'off';
}

/** From now on, a change of Detail Level sets the row. */
export function followDetailLevel(): void {
  onSettingChange((section: string, key: string, value: string) => {
    if (section === 'Video' && key === 'QualityLevel')
      setPref(ANISOTROPY_PREF, detailLevelAnisotropy(parseQualityLevel(value)));
  });
}
