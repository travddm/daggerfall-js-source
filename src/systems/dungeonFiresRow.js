// @ts-check
// DUNGEON-FIRE-ONE: the Features row for the dungeon's campfire (world/dungeon/dungeonFires.js). Daggerfall Unity stands
// no fire in a dungeon, so Off is DFU's dungeon. Forced on online: a fire is a rest point, and the room's ground is the
// room's. Its own file keeps systems/features.js from growing (docs/testing/lint-ratchet.md).
import { t } from './textManager.js';

export const DUNGEON_FIRES_ROW = Object.freeze({
  id: 'dungeon-fires',
  group: 'world',
  get title() {
    return t('features.dungeonFires.title', 'Dungeon campfire');
  },
  get note() {
    return t(
      'features.dungeonFires.note',
      'Each dungeon has one campfire at its entrance, where you can rest, cook and dry off. Off is the original: no fire in a dungeon. Online it is always on.',
    );
  },
  get effect() {
    return t('features.dungeonFires.effect', 'Takes effect in the next dungeon you enter.');
  },
  kinds: Object.freeze(['enhanced', 'classic']),
  control: Object.freeze({ store: 'prefs', key: 'dungeonFires', initial: true, online: 'room' }), // world/dungeon/dungeonFires.js FIRES_PREF
});
