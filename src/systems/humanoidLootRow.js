// @ts-check
// HUMANOID-LOOT: the Features row for how much of a humanoid foe's loot reaches its body (systems/humanoidLootShare.js reads
// its pref). DFU's whole loot, or the port's quarter cut. Online the room uses DFU's tier, pinned in the server profile
// (net/profile/officialProfile.ts). Its own file keeps systems/features.js from growing.
import { t } from './textManager.js';

/** @param {string} value @param {() => string} label */
const tier = (value, label) => Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }));

export const HUMANOID_LOOT_ROW = Object.freeze({
  id: 'humanoid-loot',
  group: 'loot',
  get title() {
    return t('features.humanoidLoot.title', 'Humanoid loot');
  },
  get note() {
    return t(
      'features.humanoidLoot.note',
      'Class foes, Orcs, Centaurs and human foes drop their full loot table and all the gear they wear, as in the classic game. Cut keeps a quarter.',
    );
  },
  get effect() {
    return t('features.humanoidLoot.effect', 'Takes effect on the next foe. Online, the room uses the classic game’s.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({
    store: 'prefs',
    key: 'humanoidLoot',
    initial: 'dfu',
    online: 'room',
    tiers: Object.freeze([
      tier('dfu', () => t('features.humanoidLoot.dfu', 'Classic')),
      tier('cut', () => t('features.humanoidLoot.cut', 'Cut')),
    ]),
  }),
});
