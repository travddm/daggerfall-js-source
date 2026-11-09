// @ts-check
// QUESTLINE-REWARDS: the Features row for what a questline outcome pays beyond the quest script. On, an outcome that
// pays gear offers a fitted piece (Magic, or Rare once the character's level opens the Rare gate) and the gold is the
// script's within a tenth either way. Off, the quest pays what DFU's script pays and nothing more. Online the lane
// forces it on, so the server pins the scale. Its own file keeps systems/features.js from growing.
import { t } from '../textManager.js';

/** The pref the row writes and qlRewards.js reads. */
export const QUEST_REWARDS_PREF = 'questlineRewards';

export const QUEST_REWARDS_ROW = Object.freeze({
  id: 'questline-rewards',
  group: 'world',
  get title() {
    return t('features.questlineRewards.title', 'Questline rewards');
  },
  get note() {
    return t(
      'features.questlineRewards.note',
      'Some quest outcomes offer a piece of gear fitted to you, and the gold can differ by a tenth from the quest script. Off, a quest pays only what Daggerfall Unity pays. Online it is always on.',
    );
  },
  get effect() {
    return t('features.questlineRewards.effect', 'Takes effect on the next reward a quest pays.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: QUEST_REWARDS_PREF, initial: true, online: 'room' }),
});
