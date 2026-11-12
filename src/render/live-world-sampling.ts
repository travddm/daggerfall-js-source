// Texture sampling that follows its settings at once. The world filter (Video/MainFilterMode), the quality level's
// anisotropy (Video/QualityLevel) and the Ground sharpness row (a preference) are read when a texture is uploaded, and
// a cached texture keeps what it was given. So the renderer asks here once a frame: when any of the three changed since
// the last frame, every cached world texture and ground array takes the new state before the frame draws, and a player
// sees the row's effect while playing. Settings publish their changes and preferences do not, and the Quality preset
// writes both, so a key compared each frame covers every way in.
//
// DFU applies the quality level at once (the pause menu's detail bar calls QualitySettings.SetQualityLevel) and the
// filter only at the next game start (StartGameBehaviour.ApplyStartSettings). Both apply at once here.
import { getString } from '../systems/settings/settings.js';
import { groundSharpnessTier } from './ground-sampler.ts';
import { parseQualityLevel, worldFilterMode } from './world-texture-filter.ts';

const GROUND_TIERS = ['off', 'default', 'max'];
const DEFAULT_TIER = 1;

/** The three settings as one number, read without allocating. */
export function worldSamplingKey(): number {
  const tier = GROUND_TIERS.indexOf(String(groundSharpnessTier()));
  const quality = parseQualityLevel(getString('Video', 'QualityLevel'));
  return worldFilterMode() * 100 + quality * 10 + (tier < 0 ? DEFAULT_TIER : tier);
}

/** What the renderer hands in: its texture caches and the two re-apply doors it already has. */
export type SamplingRenderer = {
  readonly textures: Map<unknown, object | null>;
  readonly emissionTextures: Map<unknown, object | null>;
  readonly tileArrays: Map<unknown, unknown>;
  readonly gl: { readonly TEXTURE1: number };
  _samplingKey?: number;
  /** Re-filters one cached world texture when its state differs from the settings; others are left alone. */
  _worldHit(texture: object | null, unit?: number): unknown;
  /** Sets the Ground sharpness tier and the world filter's magnification on every cached ground array. */
  applyGroundSharpness(): unknown;
};

/** Once a frame. The first frame only records the key: everything uploaded before it took the current settings. */
export function refreshWorldSamplingOnChange(renderer: SamplingRenderer): void {
  const key = worldSamplingKey();
  if (renderer._samplingKey === key) return;
  const first = renderer._samplingKey === undefined;
  renderer._samplingKey = key;
  if (first) return;
  for (const texture of renderer.textures.values()) renderer._worldHit(texture);
  for (const texture of renderer.emissionTextures.values()) renderer._worldHit(texture, renderer.gl.TEXTURE1);
  if (renderer.tileArrays.size > 0) renderer.applyGroundSharpness();
}
