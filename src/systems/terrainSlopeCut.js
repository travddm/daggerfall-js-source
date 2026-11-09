// @ts-check
// TERRAIN-CUT: does the world cut its terrain quads along the slope (world/terrain/terrain-quad-cut.ts)? The
// `terrainSlopeCut` pref, a Features row (systems/terrainSlopeCutRow.js): off is DFU's one fixed diagonal. A leaf.
import { getPref } from './uiPrefs.js';
import { isEnhanced } from './uiSkin.js';
import { isOnlinePage } from './online/onlineLane.js';

export const TERRAIN_SLOPE_CUT_PREF = 'terrainSlopeCut';

/** Whether the world about to mount cuts its quads along the slope. Online it is the room's pin whatever the skin, so a
 *  room stands on one ground; offline the row on the enhanced skin, and the classic skin keeps DFU's cut. */
export function terrainSlopeCutOn(search) {
  return getPref(TERRAIN_SLOPE_CUT_PREF) === true && (isOnlinePage(search) || isEnhanced(search));
}
