// @ts-check
// THE BATTLEFIELD A PASS CARRIES (townSeatLaw.js re-exports these): how the account service settles a battle's field
// from what clients derived off the town, and bounds it to the seat's pixel. The service never holds ARENA2, so it learns
// a field as it learns a seat: from the accounts that derived it.
import { PIXEL_UNITS } from './wire.js';

/** The field a client derives from the town, settled for a battle (DECIDED, part three): the first one an attacker and a
 *  defender submitted alike (two sides whose interests differ agreeing on it), else - once the battle is joined and a side
 *  is absent altogether - the one most submitted, the earliest first. `rows` `[{ side, field, at }]` (`field` its JSON), oldest
 *  first. Null while nothing settles it. SEAT2b part two (c): a revolt (`kind`) has the holder's side alone - its first
 *  defender's field settles it (DECIDED: no other side's interest to weigh it against; the rising is the relay's). */
export function settleField(rows, joined, kind = 'siege') {
  const seen = new Map();
  for (const r of rows ?? []) {
    const k = String(r.field);
    let v = seen.get(k);
    if (!v) seen.set(k, (v = { field: k, attack: false, defend: false, n: 0, at: r.at }));
    if (r.side === 'attack') v.attack = true;
    else if (r.side === 'defend') v.defend = true;
    v.n++;
    if (v.attack && v.defend) return k;
    if (kind === 'revolt' && v.defend) return k; // SEAT2b part two (c): a revolt has one side - its first defender's
  }
  if (!joined || !seen.size) return null;
  // Two sides that submitted and never agreed settle nothing: a count would hand the field to the bigger side's own
  // geometry. Only a lone side (the other absent) has its most-submitted field settled.
  if (rows.some((r) => r.side === 'attack') && rows.some((r) => r.side === 'defend')) return null;
  return [...seen.values()].sort((a, b) => b.n - a.n || a.at - b.at)[0].field;
}
/**
 * THE WITNESSED FIELD: the field that at least `confirm` different accounts a week old reported alike, over every week's
 * submissions for the seat - the seats' own law (a seat is what three witnesses agree on, net/nodeLaw.js WITNESS). It
 * outranks the two sides' agreement, which two accounts can fake. Null where none has that many, or two fields both do
 * (a dispute waits on the sides' agreement). `rows` `[{ account, field, at }]`, aged accounts' only.
 */
export function witnessedField(rows, confirm = 3) {
  const by = new Map();
  for (const r of rows ?? []) {
    const k = String(r.field);
    const v = by.get(k) ?? new Set();
    v.add(r.account);
    by.set(k, v);
  }
  const agreed = [...by].filter(([, who]) => who.size >= confirm).map(([field]) => field);
  return agreed.length === 1 ? agreed[0] : null;
}
/** How far past its seat's pixel a battlefield's point may lie, in room units (200 m at 40 units a metre). */
export const SIEGE_FIELD_MARGIN = 8000;
/** Whether every point of a pass's field `sf` (`[x, z]` world points, identityToken.js siegeFieldValid's shape) lies in
 *  or near the pixel `[px, py]` of the seat that holds the battle - the service knows the seat's pixel, never the town. */
export function fieldInPixel(sf, pixel) {
  if (!Array.isArray(sf) || !Array.isArray(pixel)) return false;
  const x0 = pixel[0] * PIXEL_UNITS,
    z0 = (499 - pixel[1]) * PIXEL_UNITS;
  return sf.every(
    (p) =>
      p[0] >= x0 - SIEGE_FIELD_MARGIN &&
      p[0] <= x0 + PIXEL_UNITS + SIEGE_FIELD_MARGIN &&
      p[1] >= z0 - SIEGE_FIELD_MARGIN &&
      p[1] <= z0 + PIXEL_UNITS + SIEGE_FIELD_MARGIN,
  );
}
/** The offsets siegeFieldOf (systems/siegeField.js SIEGE_FIELD) fixes between a town's points, metres: the defenders' camp
 *  lies defendCampM - thronePaceM = 10.5 from the Throne, the attackers' camp 20 from the Gate banner (6 m in from the gate
 *  and 14 out, or 40 and 60 from the town's middle), a crown's Palace square 18.5 from the Throne; and the attackers' camp
 *  is never inside a banner's radius (8 m) or the Throne's. */
export const SIEGE_FIELD_OFFSETS = Object.freeze({
  defendFromThrone: 10.5,
  attackFromGate: 20,
  squareFromThrone: 18.5,
  campClearM: 8,
  slackUnits: 3,
});
/**
 * Whether a pass's field `sf` (siegeFieldValid's shape: the banners, the Throne, the attackers' camp, the defenders') keeps
 * the offsets every honest town's field has (SIEGE_FIELD_OFFSETS). A field a client made up to put the camp on the
 * banners or the banners on the Throne is not one. `unitsPerM` the room's units a metre (siegeRef.js SIEGE_UNITS_PER_M).
 */
export function fieldShapeOk(sf, tier, unitsPerM = 40) {
  const n = tier === 'crown' ? 4 : 3;
  if (!Array.isArray(sf) || sf.length !== n + 3) return false;
  const o = SIEGE_FIELD_OFFSETS,
    slack = o.slackUnits;
  const apart = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const near = (p, q, metres) => Math.abs(apart(p, q) - metres * unitsPerM) <= slack;
  const banners = sf.slice(0, n),
    [throne, attack, defend] = sf.slice(n);
  return (
    near(throne, defend, o.defendFromThrone) &&
    near(banners[0], attack, o.attackFromGate) &&
    (n === 3 || near(banners[3], throne, o.squareFromThrone)) &&
    [...banners, throne].every((p) => apart(p, attack) > o.campClearM * unitsPerM)
  );
}
