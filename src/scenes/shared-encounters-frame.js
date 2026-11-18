// The room's shared encounters on the dungeon host's foes frame: a rest's foes, numbered by the room, that every reader
// stands as puppets. This picks which of their records ride one frame under the count cap.

/**
 * @typedef {object} SharedEncounter
 * @property {boolean} dead
 * @property {number} [_diedAt] when it died, by the host's clock
 */

/** The standing before the bodies, and the newest body first, so the cap sheds an old body a reader already holds and
 *  never a death that no frame has told yet. */
const standingFirst = (/** @type {SharedEncounter} */ a, /** @type {SharedEncounter} */ b) =>
  (a.dead ? 1 : 0) - (b.dead ? 1 : 0) || (a.dead ? (b._diedAt ?? 0) - (a._diedAt ?? 0) : 0);

/**
 * The records of the shared encounters that ride this frame, at most `max` of them.
 * @template {SharedEncounter} F
 * @param {Iterable<F>} encounters every shared encounter the room knows
 * @param {(foe: F) => object | null} recordOf the encounter's record, or null when it has nothing to say this frame
 * @param {number} max the most records one frame carries
 * @returns {object[]}
 */
export function sharedEncounterRecords(encounters, recordOf, max) {
  const records = [];
  for (const foe of [...encounters].sort(standingFirst)) {
    if (records.length >= max) break;
    const record = recordOf(foe);
    if (record) records.push(record);
  }
  return records;
}
