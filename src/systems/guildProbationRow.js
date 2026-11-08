// @ts-check
// REP6: the Features row for the guild probation (systems/guildProbation.js reads its pref). Off is DFU's: the first review
// that finds your reputation below zero expels you. On, you get a warning and 28 days, and are expelled only below -10.
// Forced off online.
import { t } from './textManager.js';

export const GUILD_PROBATION_ROW = Object.freeze({
  id: 'guild-probation',
  group: 'world',
  get title() {
    return t('features.guildProbation.title', 'Guild probation');
  },
  get note() {
    return t(
      'features.guildProbation.note',
      'A guild warns a member below zero and expels only below -10. Off is the original: the first review below zero expels. Online it is always off.',
    );
  },
  get effect() {
    return t('features.guildProbation.effect', 'Takes effect at the next review.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'guildProbation', initial: false, online: false }),
});
