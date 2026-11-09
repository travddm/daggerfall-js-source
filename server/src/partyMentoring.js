// NO-MENTORING (decision #70): the party leader sets the party to no mentoring (`on` false) or back. While it stands the
// party record and its view carry `nm: 1`, and the mentor host (src/scenes/mentorHost.js) mentors nobody: the
// higher-level member fights at full strength and nobody gets the pupil's training bonus. The leader's alone, as a kick
// is; every member hears the party as it stands. A Room method's body of its own (HOST-SPLIT): `room` is the hub.

/** @param {any} room @param {string} me @param {any} rec @param {boolean} on @param {number} now
 *  @returns {Promise<string | null>} null when done, else the refusal in words */
export async function partyMentoring(room, me, rec, on, now) {
  const [party] = await room._myParty(me, rec, now);
  if (!party) return 'you are not in a party';
  if (party.leader !== me) return 'only the leader can do that';
  const next = { ...party };
  if (on) delete next.nm;
  else next.nm = 1;
  await room._putParty(next);
  await room._sayParty(next, now);
  return null;
}
