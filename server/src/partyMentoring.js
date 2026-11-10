// The party leader sets the party to no mentoring (`on` false) or back. While it stands the party record
// and its view carry `nm: 1`, and the mentor host (src/scenes/mentorHost.js) mentors nobody: the higher-level member
// fights at full strength and nobody gets the pupil's training bonus. The leader's alone, as a kick is; every member
// hears the party as it stands. A Room method's body of its own: `room` is the hub.
//
// The server profile's `party.allowNoMentoring` rule lets a server owner keep every party mentored. With the rule off,
// the act is refused and a stored `nm` is left out of the view, so a party set before the rule changed is mentored too.
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';
import { resolveRules } from '../../src/net/profile/profileKeys.ts';

const RULES = Object.freeze(resolveRules(OFFICIAL_PROFILE.rules));

/** Does the profile let a leader turn mentoring off? @param {Readonly<Record<string, unknown>>} [rules] */
export const noMentoringAllowed = (rules = RULES) => rules['party.allowNoMentoring'] !== false;

/** The party view's `nm` field: `{ nm: 1 }` while no mentoring stands and the profile allows it, else nothing.
 *  @param {any} party @param {Readonly<Record<string, unknown>>} [rules] */
export const noMentoringField = (party, rules = RULES) =>
  party.nm === 1 && noMentoringAllowed(rules) ? { nm: 1 } : {};

/** @param {any} room @param {string} me @param {any} rec @param {boolean} on @param {number} now
 *  @param {Readonly<Record<string, unknown>>} [rules]
 *  @returns {Promise<string | null>} null when done, else the refusal in words */
export async function partyMentoring(room, me, rec, on, now, rules = RULES) {
  const [party] = await room._myParty(me, rec, now);
  if (!party) return 'you are not in a party';
  if (party.leader !== me) return 'only the leader can do that';
  if (!on && !noMentoringAllowed(rules)) return 'this server keeps mentoring on';
  const next = { ...party };
  if (on) delete next.nm;
  else next.nm = 1;
  await room._putParty(next);
  await room._sayParty(next, now);
  return null;
}
