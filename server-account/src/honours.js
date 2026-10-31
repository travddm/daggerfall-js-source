// @ts-check
// SIGN-BATCH (2026-10-16, Mac: "Is the server okay?", then "Start #2" - the account database's primary at its ceiling of
// round trips; bible/11-Multiplayer/Scale-Arc.md SIGN-BATCH): THE HONOURS A BADGE IS MADE OF, IN ONE BATCH. The doors
// that read a badge (arena.js ARENA_HONOUR_PATHS - the token's mint first) lay the arena's honours on the row, its reads
// on the binding (AUDIT SCALE4d A1: a stale #1 is counted again and written, so never off a replica). Each game says its
// reads as statements (arenaHonoursPlan); they go in ONE batch, and each game's answer is read from its own - a stale #1
// counted and stored after it.
import { arenaHonoursPlan } from './arena.js';

/**
 * The row with the games' honours on it - `arena`, as withArenaHonours lays it.
 * @param {{ db: any }} ctx @param {any} player @param {number} nowS
 */
export async function withHonours(ctx, player, nowS) {
  if (!player) return player;
  const plans = [arenaHonoursPlan(ctx, player, nowS)];
  const reads = plans.flatMap((p) => p.reads);
  const res = reads.length ? await ctx.db.batch(reads) : [];
  let at = 0;
  /** @type {any[]} */
  const answers = [];
  for (const p of plans) { answers.push(await p.from(res.slice(at, at + p.reads.length))); at += p.reads.length; }
  return { ...player, arena: answers[0] };
}
