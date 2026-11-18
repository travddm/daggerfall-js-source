// @ts-check
// Allies across the clients in a cell. My companions ride my foes frame named as mine (`cp`, their names in `cn`), and
// another player's stand here as that player's: an ally of mine, which my foes may fight.

import { staticTeamOf } from '../characters/enemy/enemyTargets.js';

/**
 * @typedef {object} PoolFoe
 * @property {string | null} [companion] whose companion it is, or null
 * @property {boolean} [shipmate] a crewman, here or another player's
 * @property {boolean} [dead]
 * @property {string | null} [puppet] the owner's id, for a puppet of another player's foe
 * @property {number} [seq] the foe's number on its owner's frames
 * @property {number} [mobileType]
 * @property {{ isHostile?: boolean } | null} [ai]
 * @property {{ team?: string, mobileTeam?: string, name?: string } | null} [entity]
 */

/**
 * The puppets of other players' foes that a foe of mine may fight. My companion fights their foes, and a hostile foe of
 * mine fights their companions. Every other puppet stays out of my foes' hunt.
 * @param {PoolFoe} foe a foe of mine
 * @param {Iterable<PoolFoe>} puppets every puppet standing here
 * @returns {PoolFoe[]}
 */
export function coopCandidates(foe, puppets) {
  const mine = foe.companion != null;
  if (!mine && (foe.entity?.team === 'PlayerAlly' || !foe.ai?.isHostile)) return [];
  const out = [];
  for (const p of puppets) {
    if (p.dead || !p.ai) continue;
    if (mine ? p.companion == null && !p.shipmate : p.companion != null) out.push(p);
  }
  return out;
}

/**
 * The frame's words for my companions among its records: their numbers (`cp`) and their own names (`cn`, in that
 * order). A reader shows a companion by its name, never its class's.
 * @param {Array<{ i: number, d?: number }>} records the frame's records, all of my own foes
 * @param {(record: { i: number, d?: number }) => PoolFoe | undefined} sourceOf the foe a record was made from
 * @returns {{ cp: number[], cn: string[] }}
 */
export function companionWords(records, sourceOf) {
  const mates = records.filter((r) => r.d !== 1 && sourceOf(r)?.companion != null);
  return { cp: mates.map((r) => r.i), cn: mates.map((r) => sourceOf(r)?.entity?.name ?? '') };
}

/**
 * Stands a puppet as its owner's frame names it. A crewman (`cw`) is a shipmate here too: my ally, spared my harm, and
 * shown with the crew's bar (combat/friendlyFire.js). A companion is marked as its owner's. A puppet the frame no
 * longer names as crew takes its species' team again.
 * @param {PoolFoe} puppet
 * @param {boolean} crew
 * @param {boolean} [companion]
 */
export function standCrewPuppet(puppet, crew, companion = false) {
  puppet.companion = crew && companion ? `peer:${puppet.puppet}:${puppet.seq}` : null;
  if (!!puppet.shipmate === crew) return;
  puppet.shipmate = crew;
  const team = crew ? 'PlayerAlly' : staticTeamOf(puppet.mobileType);
  if (puppet.entity && puppet.entity.team !== team) {
    puppet.entity.team = team;
    puppet.entity.mobileTeam = team;
  }
}
