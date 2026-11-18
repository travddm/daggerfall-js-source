// @ts-check
// Allies across the clients in a cell. The foes that fight at my side (my companions, my summons) ride my foes frame
// named as mine (`cp`, their names in `cn`), and another player's stand here as that player's: an ally of mine, which
// my foes may fight.

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
 * @property {{ team?: string, mobileTeam?: string, name?: string, summoned?: boolean } | null} [entity]
 */

/**
 * The puppets of other players' foes that a foe of mine may fight. A foe at my side (a companion, a summon) fights their
 * foes, and a hostile foe of mine fights their allies. Every other puppet stays out of my foes' hunt.
 * @param {PoolFoe} foe a foe of mine
 * @param {Iterable<PoolFoe>} puppets every puppet standing here
 * @returns {PoolFoe[]}
 */
export function coopCandidates(foe, puppets) {
  const mine = fightsAtMySide(foe);
  if (!mine && (foe.entity?.team === 'PlayerAlly' || !foe.ai?.isHostile)) return [];
  const out = [];
  for (const p of puppets) {
    if (p.dead || !p.ai) continue;
    if (mine ? p.companion == null && !p.shipmate : p.companion != null) out.push(p);
  }
  return out;
}

/**
 * Whether a foe of mine fights at my side: a companion, or my summon (a summoned body on the player's team). Crew,
 * refugees and the watch ride frame words of their own. A crewman off the deck is on the player's team too, but no
 * longer anyone's ally on another player's screen, so the team alone does not decide.
 * @param {PoolFoe | null | undefined} foe
 */
export function fightsAtMySide(foe) {
  if (!foe || foe.puppet) return false;
  if (foe.companion != null) return true;
  return foe.entity?.team === 'PlayerAlly' && foe.entity.summoned === true;
}

/**
 * The frame's words for the foes that fight at my side among its records: their numbers (`cp`) and their own names
 * (`cn`, in that order). A reader stands each as my ally, and shows a companion by its name, never its class's.
 * @param {Array<{ i: number, d?: number }>} records the frame's records, all of my own foes
 * @param {(record: { i: number, d?: number }) => PoolFoe | undefined} sourceOf the foe a record was made from
 * @returns {{ cp: number[], cn: string[] }}
 */
export function companionWords(records, sourceOf) {
  const mates = records.filter((r) => r.d !== 1 && fightsAtMySide(sourceOf(r)));
  return { cp: mates.map((r) => r.i), cn: mates.map((r) => sourceOf(r)?.entity?.name ?? '') };
}

/**
 * Stands a puppet as its owner's frame names it. A crewman (`cw`) is a shipmate here too: my ally, spared my harm, and
 * shown with the crew's bar (combat/friendlyFire.js). One that fights at its owner's side (`cp`) is marked as the
 * owner's and stands on the player's team, so it is not shown as a hostile foe and my foes may fight it. A puppet the
 * frame no longer names takes its species' team again.
 * @param {PoolFoe & { _namedAlly?: boolean }} puppet
 * @param {boolean} crew
 * @param {boolean} [companion]
 */
export function standCrewPuppet(puppet, crew, companion = false) {
  puppet.companion = companion ? `peer:${puppet.puppet}:${puppet.seq}` : null;
  const named = crew || companion;
  // A puppet named neither way keeps whatever team the other frame words gave it (an allied watchman's).
  if (!!puppet.shipmate === crew && !!puppet._namedAlly === named) return;
  puppet.shipmate = crew;
  puppet._namedAlly = named;
  const team = named ? 'PlayerAlly' : staticTeamOf(puppet.mobileType);
  if (puppet.entity && puppet.entity.team !== team) {
    puppet.entity.team = team;
    puppet.entity.mobileTeam = team;
  }
}
