// The ground tile arrays' sampler: the Ground sharpness row (`groundSharpness`: off, default, max) decides the
// minification and the anisotropy, and the world filter (render/world-texture-filter.ts) decides the magnification.
// The renderer applies it at upload and again at every world load (Renderer.applyGroundSharpness).
import { pageParam } from '../systems/pageQuery.js';
import { getPref } from '../systems/uiPrefs.js';
import { POINT, type FilterGl } from './world-texture-filter.ts';

/**
 * The ground-sharpness tier as a max-anisotropy value, against what the driver allows.
 *
 * 4 is a conservative choice, not a measurement. Anisotropy is paid in fill rate on the pass that covers the most
 * screen, and the only GL a test run has is SwiftShader, a software rasteriser whose cost profile is nothing like a
 * GPU's (the "16" it reports is its own). So the number is a dial and the default is the safe end of it.
 *
 * `1` is the extension's own word for no anisotropy, which is why `off` answers it rather than 0; an unknown tier is
 * the default, so a stored preference from a future build cannot turn the ground to mush.
 */
export function anisotropyFor(tier: unknown, driverMax = 1): number {
  const cap = Math.max(1, driverMax || 1);
  if (tier === 'off') return 1;
  if (tier === 'max') return cap;
  return Math.min(4, cap);
}

/**
 * The tier is sampler state, and the minification filter is part of it.
 *
 * Trilinear minification is eight texel fetches a fragment on the pass that covers the most screen, where nearest-mip
 * is one. The mipmap is what cures the grain, not the filter within a level: NEAREST_MIPMAP_NEAREST is one fetch, the
 * shimmer is still gone, the texels stay square at every distance, and it is DFU's Point over a mip chain
 * (MaterialReader.MainFilterMode). `off` is that. `default` and `max` keep trilinear, because anisotropy wants a linear
 * filter within the level to have anything to spread its taps over.
 */
export function groundSamplerFor(tier: unknown, driverMax = 1): { aniso: number; minFilter: string } {
  return {
    aniso: anisotropyFor(tier, driverMax),
    minFilter: tier === 'off' ? 'NEAREST_MIPMAP_NEAREST' : 'LINEAR_MIPMAP_LINEAR',
  };
}

/** The tier in force: `?ground=off|default|max` over the preference. The page parameter lets the real-GPU probe
 *  (tools/perfProbe.mjs, a fresh browser with an empty shelf every run) measure each tier. */
export function groundSharpnessTier(search: string = globalThis.location?.search ?? ''): unknown {
  return pageParam('ground', search) ?? getPref('groundSharpness');
}

/** The ground's magnification: NEAREST under the default Point, as DFU's terrain array (FilterMode.Point), and
 *  LINEAR under Bilinear and Trilinear. */
export function groundMagFor(gl: FilterGl, mode: number): number {
  return mode === POINT ? gl.NEAREST : gl.LINEAR;
}
