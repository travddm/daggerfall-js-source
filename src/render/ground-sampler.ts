// The ground tile arrays' sampler: the Ground sharpness row (`groundSharpness`: off or default) decides the
// minification, the Anisotropic Filtering row (render/anisotropic-filtering.ts) the anisotropy, and the world filter
// (render/world-texture-filter.ts) the magnification. The renderer applies it at upload, at every world load and on the
// frame after any of them changes (Renderer.applyGroundSharpness, render/live-world-sampling.ts).
import { pageParam } from '../systems/pageQuery.js';
import { getPref } from '../systems/uiPrefs.js';
import { anisotropyOf, anisotropySetting } from './anisotropic-filtering.ts';
import { POINT, anisotropyExtension, worldFilterMode, type FilterGl, type TextureGl } from './world-texture-filter.ts';

/**
 * The tier is sampler state, and the minification filter is part of it.
 *
 * Trilinear minification is eight texel fetches a fragment on the pass that covers the most screen, where nearest-mip
 * is one. The mipmap is what cures the grain, not the filter within a level: NEAREST_MIPMAP_NEAREST is one fetch, the
 * shimmer is still gone, the texels stay square at every distance, and it is DFU's Point over a mip chain
 * (MaterialReader.MainFilterMode). `off` is that; any other tier (a stored `max` from before included) is trilinear.
 * `aniso` is the ground's anisotropy (groundAnisotropy), carried with the filter so the renderer sets both together.
 */
export function groundSamplerFor(tier: unknown, aniso = 1): { aniso: number; minFilter: string } {
  return { aniso, minFilter: tier === 'off' ? 'NEAREST_MIPMAP_NEAREST' : 'LINEAR_MIPMAP_LINEAR' };
}

/** The ground's anisotropy now: the Anisotropic Filtering row's, within the driver's ceiling, and 1 under Point. */
export function groundAnisotropy(driverMax: number): number {
  return anisotropyOf(anisotropySetting(), driverMax, true, worldFilterMode() === POINT);
}

/** The tier in force: `?ground=off|default` over the preference. The page parameter lets the real-GPU probe
 *  (tools/perfProbe.mjs, a fresh browser with an empty shelf every run) measure each tier. */
export function groundSharpnessTier(search: string = globalThis.location?.search ?? ''): unknown {
  return pageParam('ground', search) ?? getPref('groundSharpness');
}

/** The ground's magnification: NEAREST under the default Point, as DFU's terrain array (FilterMode.Point), and
 *  LINEAR under Bilinear and Trilinear. */
export function groundMagFor(gl: FilterGl, mode: number): number {
  return mode === POINT ? gl.NEAREST : gl.LINEAR;
}

/** A ground picture outside the tile arrays, on the bound TEXTURE_2D: the snow ground's albedo. It takes the arrays'
 *  sampling: the world filter's magnification, Ground sharpness's minification, the Anisotropic Filtering row's
 *  anisotropy. The snow mod sets its albedo to Point (DynamicSnowController: `snowAlbedo.filterMode` 0); following
 *  the world's settings is a departure, so the snow ground matches the ground beside it. Its masks are data, not art,
 *  and keep their own filter. */
export function filterGroundPicture(gl: TextureGl): void {
  const sampler = groundSamplerFor(groundSharpnessTier(), 1);
  const { ext, max } = anisotropyExtension(gl);
  const minFilter =
    sampler.minFilter === 'NEAREST_MIPMAP_NEAREST' ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, groundMagFor(gl, worldFilterMode()));
  if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, groundAnisotropy(max));
}
