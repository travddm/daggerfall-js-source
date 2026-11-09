// The renderer's source for classic distance shading (render/classic-distance-shading.ts). main.js hands it to the
// renderer, which asks it once per world frame, so a press on the row takes effect on the next frame and the renderer
// never reads the preferences itself.
import type { ShadeTarget } from '../render/classic-distance-shading.ts';
import { getPref } from './uiPrefs.js';

/** The row's preference (systems/classic-picture-rows.ts): 'off', 'black' or 'fog'. */
export const DISTANCE_SHADING_PREF = 'classicDistanceShading';

/** Where the shading leads, or null while it is off. The renderer opens a world image for any answer but null. */
export function classicDistanceShading(): ShadeTarget | null {
  const value = getPref(DISTANCE_SHADING_PREF);
  return value === 'black' || value === 'fog' ? value : null;
}
