// @ts-check
// REVENANTS: the Features row for the returning-nemesis mod - a foe that escapes the player comes back stronger, can be
// beaten into yielding, and can be sworn as a companion (systems/revenant/revenant.js). Off is Daggerfall's own foes: none
// is made, flees or returns. Online the lane forces the row on. The mod also needs the Loot rarity row (its trophy is a
// rarity piece). Its tuning values (rank steps, flee chances) are not yet player settings; they go to the options sweep.
// Its own file keeps systems/features.js from growing.
import { t } from '../textManager.js';

/** The pref the row writes and revenant.js reads (revenantsOn.js). */
export const REVENANTS_PREF = 'revenants';

export const REVENANTS_ROW = Object.freeze({
  id: 'revenants',
  group: 'loot',
  get title() {
    return t('features.revenants.title', 'Revenants');
  },
  get note() {
    return t(
      'features.revenants.note',
      'A foe that escapes can return stronger, yield, and be sworn to you. Off, foes are as in Daggerfall. Needs Loot rarity. Always on online.',
    );
  },
  get effect() {
    return t('features.revenants.effect', 'Takes effect the next time a foe flees or falls.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: REVENANTS_PREF, initial: true, online: true }),
});
