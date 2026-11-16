// @ts-check
// TERRAIN-CUT: the Features row for the slope cut (world/terrain/terrain-quad-cut.ts). Daggerfall Unity cuts every
// terrain quad on one diagonal, so Off is DFU's ground. The room's online: the cut moves the walked ground between
// samples, so two players who disagree would stand at different heights (net/profile/officialProfile.ts pins it).
// Its own file keeps systems/features.js from growing (docs/testing/lint-ratchet.md).
import { t } from './textManager.js';

export const TERRAIN_SLOPE_CUT_ROW = Object.freeze({
  id: 'terrain-slope-cut',
  group: 'world',
  get title() {
    return t('features.terrainSlopeCut.title', 'Ground follows slopes');
  },
  get note() {
    return t(
      'features.terrainSlopeCut.note',
      'Each square of ground divides along its slope, so ridges and valleys show fewer saw teeth. Off is the original: every square divides on the same diagonal. Online the server sets it.',
    );
  },
  get effect() {
    return t('features.effect.worldLoads', 'Takes effect when the world next loads.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'terrainSlopeCut', initial: false, online: 'room' }), // systems/terrainSlopeCut.js TERRAIN_SLOPE_CUT_PREF
});
