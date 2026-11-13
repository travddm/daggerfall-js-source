// Whether this driver keeps a sampler's nearest-mip filter once anisotropy is above 1. Ground sharpness Off is a
// nearest-mip filter on the ground and Smooth a trilinear one; when the driver drops the mip filter for anisotropy, both
// draw the same picture, and the row has no effect.
//
// ANGLE's Direct3D 11 back end (Chrome and Edge on Windows) maps every sampler with anisotropy above 1 to Direct3D 11's
// anisotropic filter before it reads the GL min filter (renderer11_utils.cpp ConvertFilter), and Direct3D 11 has no
// anisotropic filter with a point mip (D3D11_FILTER). EXT_texture_filter_anisotropic lets any implementation ignore the
// min filter, so other drivers may do the same; a driver is listed here only where a measurement showed it
// (tools/probes/lib/samplerCheck.mjs).
//
// This module imports nothing: the Features table reads it, and the table must not reach the preferences store.

/** The renderer string and the anisotropy ceiling of the context the world draws with, noted at its first texture. */
type SamplingDriver = { readonly renderer: string; readonly maxAnisotropy: number };

let driver: SamplingDriver | null = null;

/** The part of a WebGL context this module reads. */
type DriverGl = {
  readonly RENDERER: number;
  getExtension(name: string): unknown;
  getParameter(name: number): unknown;
};

/** The renderer string: the unmasked one where the browser offers it (WEBGL_debug_renderer_info), else RENDERER. */
export function rendererString(gl: DriverGl): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return typeof name === 'string' ? name : '';
}

/** True for a renderer whose anisotropic samplers ignore the mip filter: ANGLE over Direct3D 11. */
export function anisotropyDropsMipFilter(renderer: string): boolean {
  return /\bANGLE\b/i.test(renderer) && /Direct3D11|D3D11/i.test(renderer);
}

/** Notes the world's context, once. Later contexts (a thumbnail, a test) leave the first one standing. */
export function noteSamplingDriver(gl: DriverGl, maxAnisotropy: number): void {
  driver ??= { renderer: rendererString(gl), maxAnisotropy };
}

/** For tests: forget the noted context. */
export function forgetSamplingDriver(): void {
  driver = null;
}

/** Why the Ground sharpness row has no effect now, or null when it has: the ground takes anisotropy above 1 (any
 *  Anisotropic Filtering value but Off, off the Point filter, on a driver with anisotropy), and this driver drops the
 *  mip filter for it. `anisotropySetting` is the Anisotropic Filtering row's stored value. */
export function groundSharpnessInactive(
  anisotropySetting: unknown,
  pointFilter: boolean,
  reason: string,
): string | null {
  if (!driver || pointFilter || driver.maxAnisotropy <= 1) return null;
  if (anisotropySetting === 'off' || anisotropySetting === 1 || anisotropySetting === '1') return null;
  return anisotropyDropsMipFilter(driver.renderer) ? reason : null;
}
