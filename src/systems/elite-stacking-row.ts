// The Features row for an elite's stacked multipliers (systems/elite-stacking.ts reads its pref). Off, an elite in an
// Elite or Super dungeon is as strong as the stronger of the elite tier and the dungeon's own foes, stat by stat. On, the
// two stack. Pinned off online.
import { t } from './textManager.js';

export const ELITE_STACKING_ROW = Object.freeze({
  id: 'elite-stacking',
  group: 'combat',
  get title(): string {
    return t('features.eliteStacking.title', 'Elites stack with dungeon difficulty');
  },
  get note(): string {
    return t(
      'features.eliteStacking.note',
      'An elite in an Elite Dungeon has 7 times the health and 2.6 times the damage, and in a Super dungeon 9 times and 3 times. Off, an elite there is as strong as the stronger of an elite and the dungeon’s other enemies. Online it is always off.',
    );
  },
  get effect(): string {
    return t('features.eliteStacking.effect', 'Takes effect in the next dungeon.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'eliteStacking', initial: false, online: 'room' }),
});
