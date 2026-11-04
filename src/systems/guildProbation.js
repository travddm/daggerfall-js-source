// @ts-check
// REP6: DOES A GUILD GIVE A MEMBER BELOW ZERO A PROBATION? DFU expels a member at the first review that finds the guild
// reputation below 0 (Guild.cs UpdateRank l.84-92: the new rank is -1, RemoveMembership, record 668). The port put such a
// member on probation instead, and expelled at a later review below -10 (systems/guild/guilds.js updateRank). The
// `guildProbation` pref (a Features row) is that choice: off is DFU's, on is the probation. Online the room's answer is
// forced off (onlineLane.js). A leaf: the shelf only.
import { getPref } from './uiPrefs.js';

export const GUILD_PROBATION_PREF = 'guildProbation';
/** Whether a review that finds a member below zero gives a probation before it expels. Read at every review. */
export const guildProbationOn = () => getPref(GUILD_PROBATION_PREF) === true;
