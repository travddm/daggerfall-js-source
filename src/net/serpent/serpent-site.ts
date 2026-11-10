// Where the sea serpent lies, as the players' games say it. Each online game tells the hub the site it found (the
// `serpent` `site` word, net/wire.js), and the hub agrees on a site by the gate's law (net/gate/gate-site.ts): the
// record's pixel slots hold the serpent's native point. The site rolls over the world's lanes, which a game without the
// land past the Bay cannot roll, so the hub tells every game online the agreed site (`serpentAtWord`, the hub's `at`)
// and such a game rises its serpent there.
//
// Not a DFU member: Daggerfall has no other players. The relay bundles it.
import { serpentAt } from './serpentLaw.js';
import { agreedGateSite, GATE_SITE_SKEW_MS } from '../gate/gate-site.ts';

/** Does the hub take a word of day `day`'s site at `nowMs`: the serpent the clock is about, or the next one a moment
 *  before the turn? */
export const serpentSiteDayOk = (day: unknown, nowMs: number): boolean =>
  Number.isSafeInteger(day) && (day === serpentAt(nowMs).day || day === serpentAt(nowMs + GATE_SITE_SKEW_MS).day);

/** The site the hub's record agrees on for day `day`, as `{sx, sz, place}`, or null. */
export function agreedSerpentSite(rec: unknown, day: number): { sx: number; sz: number; place: string } | null {
  const a = agreedGateSite(rec, day);
  return a ? { sx: a.px, sz: a.py, place: a.pl } : null;
}

/**
 * The hub's word of where the serpent lies: `{t: 'serpent', k: 'at', d, sx, sz, pl}`, the site its record agrees on for
 * the record's day while that day is the one the clock is about, or null.
 */
export function serpentAtWord(
  rec: unknown,
  nowMs: number,
): { t: 'serpent'; k: 'at'; d: number; sx: number; sz: number; pl: string } | null {
  const d = rec && typeof rec === 'object' ? (rec as { d?: unknown }).d : null;
  if (typeof d !== 'number' || !serpentSiteDayOk(d, nowMs)) return null;
  const a = agreedSerpentSite(rec, d);
  return a ? { t: 'serpent', k: 'at', d, sx: a.sx, sz: a.sz, pl: a.place } : null;
}
