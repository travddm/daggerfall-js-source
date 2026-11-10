// @ts-check
// The Features row for spawned dungeons, the ruins that stand on map pixels
// online and expire (world/spawnedDungeons.js). DFU has none, so the row is off by default and the official profile
// pins it off. The feature stands only on an online page, as it did before the row, so offline the row changes
// nothing. Its own file keeps systems/features.js from growing. It imports no pref store: uiPrefs.js reads features.js,
// which reads this row.
import { t } from '../textManager.js';

/** The pref the row writes and the spawn hosts read. */
export const SPAWNED_DUNGEONS_PREF = 'spawnedDungeons';

export const SPAWNED_DUNGEONS_ROW = Object.freeze({
  id: 'spawned-dungeons',
  group: 'world',
  get title() {
    return t('features.spawnedDungeons.title', 'Spawned dungeons');
  },
  get note() {
    return t(
      'features.spawnedDungeons.note',
      "Online, ruins appear on the map, and each one goes after its time runs out. Off, only Daggerfall's dungeons stand. Online it follows the server.",
    );
  },
  get effect() {
    return t('features.spawnedDungeons.effect', 'Takes effect the next time you load a place.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: SPAWNED_DUNGEONS_PREF, initial: false, online: 'room' }),
});

/**
 * Whether spawned dungeons stand on this page: an online page whose room has the row on. Online, getPref answers the
 * server profile's pin, so every client in a room agrees.
 * @param {{ has(k: string): boolean }} params the page's query
 * @param {(key: string) => unknown} readPref the pref store (systems/uiPrefs.js getPref)
 */
export function spawnedDungeonsStand(params, readPref) {
  return params.has('online') && readPref(SPAWNED_DUNGEONS_PREF) === true;
}
