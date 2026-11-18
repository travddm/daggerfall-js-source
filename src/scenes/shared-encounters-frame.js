// @ts-check
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
 * The records of the shared encounters that ride this frame, at most `max` of them, and whether the cap left a standing
 * encounter out. A full frame that left one out must not tell its readers that its list is whole, or they take that
 * encounter down.
 * @template {SharedEncounter} F
 * @param {Iterable<F>} encounters every shared encounter the room knows
 * @param {(foe: F) => object | null} recordOf the encounter's record, or null when it has nothing to say this frame
 * @param {number} max the most records one frame carries
 * @param {{ full: boolean, unsent: (foe: F) => void }} frame `unsent` forgets what the encounter last said
 * @returns {{ records: object[], standingLeftOut: boolean }}
 */
export function sharedEncounterRecords(encounters, recordOf, max, { full, unsent }) {
  const records = [];
  let standingLeftOut = false;
  for (const foe of [...encounters].sort(standingFirst)) {
    if (records.length < max) {
      const record = recordOf(foe);
      if (record) records.push(record);
      continue;
    }
    if (foe.dead) continue;
    standingLeftOut = true;
    // A delta never asked its record, so it is still owed. A full frame's readers expect every record, and a standing
    // encounter left out of it may never change again: its record is made owed, so it rides the next frame.
    if (full) unsent(foe);
  }
  return { records, standingLeftOut };
}
