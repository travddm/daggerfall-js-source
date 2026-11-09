// The renderer's source for classic distance shading (render/classic-distance-shading.ts). main.js hands it to the
// renderer, which asks it once per world frame, so a press on the row takes effect on the next frame and the renderer
// never reads the preferences itself.
import { getPref } from './uiPrefs.js';

/** The row's preference (systems/classic-picture-rows.ts): 'off' or 'steps'. */
export const DISTANCE_SHADING_PREF = 'classicDistanceShading';

export function classicDistanceShadingOn(): boolean {
  return getPref(DISTANCE_SHADING_PREF) === 'steps';
}
