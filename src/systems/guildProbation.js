// @ts-check
// REP6: does a guild give a member below zero a probation? DFU expels a member at the first review that finds the guild
// reputation below 0 (Guild.cs UpdateRank l.84-92: rank -1, RemoveMembership, record 668). The port put such a member on
// probation and expelled at a later review below -10 (systems/guild/guilds.js updateRank). The `guildProbation` pref (a
// Features row): off is DFU's, on is the probation. Forced off online (onlineLane.js). A leaf.
import { getPref } from './uiPrefs.js';

export const GUILD_PROBATION_PREF = 'guildProbation';
/** Whether a review that finds a member below zero gives a probation before it expels. Read at every review. */
export const guildProbationOn = () => getPref(GUILD_PROBATION_PREF) === true;
