// What a quest that ends unfinished costs online. DFU takes QuestFailureRep (2) from the quest's faction, spread through
// its allies and enemies (Quest.cs EndQuest). QFAIL-FREE, a failure that costs nothing online, is the server profile's
// option (net/profile/profileKeys.ts quest.failureFree). Kept apart from questRepute.js, which stays a leaf the guild hall
// reads without the server profile.

import { onlineRule } from '../online/serverProfile.ts';

/** The quest machine's hooks this rule reads: the shared clock answers whether the quest runs online. */
type QuestHooks = { sharedClock?: () => unknown } | null | undefined;

/** Whether this quest's end costs its faction nothing: a failure, online, under the server profile's option. */
export function questFailureFree(success: boolean, hooks: QuestHooks): boolean {
  return !success && !!hooks?.sharedClock?.() && onlineRule('quest.failureFree') === true;
}
