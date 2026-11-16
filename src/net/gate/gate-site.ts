// Where a gate stands, as the players' games say it. The relay holds no map file, so each online game tells the hub
// where it found the gate the clock is about (the `gate` `site` word, net/wire.js). The hub keeps one word an account a
// day and names the place the most accounts said, once at least GATE_SITE_AGREE of them agree: one lying client names
// nothing. The broken rite stands by the agreed site (server/src/index.js riteCirclesBy), and the sea serpent's site is
// agreed by the same law (net/serpent/serpent-site.ts).
//
// Not a DFU member: Daggerfall has no other players. A leaf the relay bundles: it imports gateLaw.js alone.
import { isGateDay, gateAt, gateLaneOf } from './gateLaw.js';

/** A place is named once this many accounts say it. */
export const GATE_SITE_AGREE = 2;
/** A day's record's bounds: the places said, and the accounts counted for one. */
export const GATE_SITE_CANDIDATES_MAX = 8;
export const GATE_SITE_VOTES_MAX = 16;
/** A word for the next gate is taken this far before the turn, because a client's clock may run a moment ahead of the
 *  relay's, ms. */
export const GATE_SITE_SKEW_MS = 60_000;

/** One place said: its map pixel, its name, and the accounts that said it. */
export type GateSiteCandidate = [px: number, py: number, pl: string, subs: string[]];
/** The hub's record of a day's words: the day, and each place in the order it was first said. */
export type GateSiteRecord = { d: number; c: GateSiteCandidate[] };

/** Does the hub take a word of day `day`'s site at `nowMs`: the gate the clock is about, or the next one a moment
 *  before the turn? On the gate's own lane (`day` is a gate's number). */
export const gateSiteDayOk = (day: number, nowMs: number): boolean =>
  isGateDay(day) &&
  (day === gateAt(nowMs, gateLaneOf(day)).day || day === gateAt(nowMs + GATE_SITE_SKEW_MS, gateLaneOf(day)).day);

/**
 * The hub's record with one account's word folded in. One word an account a day (its first stands); a newer day's word
 * starts the record again, and an older day's is ignored. Returns the same record when nothing changed, so the caller
 * writes only a change.
 */
export function foldGateSite(
  rec: unknown,
  day: number,
  sub: string,
  px: number,
  py: number,
  pl: string,
): GateSiteRecord {
  const cur = isRecord(rec) ? rec : null;
  if (cur && cur.d > day) return cur;
  const c = cur && cur.d === day ? cur.c.slice() : [];
  if (c.some((e) => e[3].includes(sub))) return cur;
  const i = c.findIndex((e) => e[0] === px && e[1] === py && e[2] === pl);
  if (i >= 0) {
    if (c[i][3].length >= GATE_SITE_VOTES_MAX) return cur;
    c[i] = [px, py, pl, [...c[i][3], sub]];
  } else {
    if (c.length >= GATE_SITE_CANDIDATES_MAX) return cur;
    c.push([px, py, pl, [sub]]);
  }
  return { d: day, c };
}

/** The place the record names for day `day`: the one the most accounts said, at least GATE_SITE_AGREE of them (the
 *  first said wins a tie), or null. */
export function agreedGateSite(rec: unknown, day: number): { px: number; py: number; pl: string } | null {
  if (!rec || typeof rec !== 'object' || (rec as GateSiteRecord).d !== day || !Array.isArray((rec as GateSiteRecord).c))
    return null;
  let best: GateSiteCandidate | null = null;
  for (const e of (rec as GateSiteRecord).c)
    if (e[3].length >= GATE_SITE_AGREE && (!best || e[3].length > best[3].length)) best = e;
  return best ? { px: best[0], py: best[1], pl: best[2] } : null;
}

function isRecord(rec: unknown): rec is GateSiteRecord {
  return (
    !!rec &&
    typeof rec === 'object' &&
    Number.isSafeInteger((rec as GateSiteRecord).d) &&
    Array.isArray((rec as GateSiteRecord).c)
  );
}
