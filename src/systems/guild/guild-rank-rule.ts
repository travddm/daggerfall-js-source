// How guild ranks work online, from the server profile (net/profile/profileKeys.ts). DFU promotes at a review 28 days
// after the last change, up to rank 9, and every rank's services follow the rank (Guild.cs UpdateRank,
// CalculateNewRank; MagesGuild.cs CanAccessService). By default online plays the same, on the character's own clock.
// Two keys keep the older online rules as a server's options:
//
// - guild.promoteNow: a review promotes at once, without the 28 days, while the Roll paces the reputation.
// - guild.seatRanks: a member's own book stops at rank 7, and ranks 8 and 9 are chapter chairs won by Merit.

import { onlineRule } from '../online/serverProfile.ts';

/** DFU's highest guild rank. */
export const GUILD_TOP_RANK = 9;
/** The highest rank a member's own book holds while chapter chairs hold ranks 8 and 9 (net/npcChapterLaw.js). */
export const SEAT_BOOK_RANK_MAX = 7;

/** Whether chapter chairs hold ranks 8 and 9 online (guild.seatRanks). */
export const seatsHoldTopRanks = (): boolean => onlineRule('guild.seatRanks') === true;

/** The highest rank a member's own book holds online. */
export const bookRankMax = (): number => (seatsHoldTopRanks() ? SEAT_BOOK_RANK_MAX : GUILD_TOP_RANK);

/** Whether a review online promotes without DFU's 28-day wait (guild.promoteNow). */
export const promotesWithoutWait = (): boolean => onlineRule('guild.promoteNow') === true;
