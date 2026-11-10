// The Features row for the port's absorption limits (systems/absorption-limits.ts reads its pref). Off is DFU's. On, an
// item that absorbs spells does so half the time, a Spell Absorption effect stops at 50%, and an absorbed spell gives
// back half its cost. Pinned off online.
import { t } from './textManager.js';

export const ABSORPTION_LIMITS_ROW = Object.freeze({
  id: 'absorption-limits',
  group: 'combat',
  get title(): string {
    return t('features.absorptionLimits.title', 'Absorption limits');
  },
  get note(): string {
    return t(
      'features.absorptionLimits.note',
      'An item that absorbs spells does so half the time, Spell Absorption stops at 50%, and an absorbed spell gives back half its cost. Off is the original: the item always absorbs and gives back the whole cost. Online it is always off.',
    );
  },
  get effect(): string {
    return t('features.absorptionLimits.effect', 'Takes effect at the next spell.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'absorptionLimits', initial: false, online: 'room' }),
});
