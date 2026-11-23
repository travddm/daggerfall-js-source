// The renderer's source for classic distance shading (render/classic-distance-shading.ts). main.js hands it to the
// renderer, which asks it once per world frame, so a change on the row or the settings screen takes effect on the next
// frame and the renderer never reads the preferences or the settings itself.
import type { ShadeChoice } from '../render/classic-distance-shading.ts';
import { getBool, getFloat } from './settings/settings.js';
import { getPref } from './uiPrefs.js';

/** The row's preference (systems/classic-picture-rows.ts): 'off' or 'fog'. */
export const DISTANCE_SHADING_PREF = 'classicDistanceShading';

/** DFU's range for ColorBoostDungeonFalloff (its settings window). */
const FALLOFF_MAX = 8;

/** The dungeon falloff as Daggerfall Unity applies it: part of Color Boost, so it runs only while Color Boost is on. */
function dungeonFalloff(): number {
  if (!getBool('Effects', 'ColorBoostEnable')) return 0;
  return getFloat('Effects', 'ColorBoostDungeonFalloff', 0, FALLOFF_MAX);
}

/** What to shade this frame, or null while both fades are off; the renderer opens a world image for any other answer. */
export function classicDistanceShading(): ShadeChoice | null {
  const fogColour = getPref(DISTANCE_SHADING_PREF) === 'fog';
  const falloff = dungeonFalloff();
  return fogColour || falloff > 0 ? { fogColour, falloff } : null;
}
