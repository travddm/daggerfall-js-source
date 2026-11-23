// @ts-check
// What the relay holds a siege fighter to that its clients' words cannot move: the magicka its casts and heals draw on,
// and the field's ground. siegeRef.js re-exports these; this leaf imports nothing.

/** The relay's own magicka for a fighter's casts and heals: it knows no spell book, so a cast costs the points it lands
 *  (a heal, the points it restores). The pool and its refill are the arena's (net/arena/arenaLaw.js ARENA_MAGICKA_DEPTH,
 *  ARENA_MAGICKA_REGEN - pinned equal by test; DFU's most magicka is 300 and the pool twice that). */
export const SIEGE_MAGICKA = Object.freeze({ depth: 600, regenPerS: 12 });

/** The points of magicka the fighter `f` has at `now` (whole points). @param {any} f @param {number} now */
export function magickaRoom(f, now) {
  const refilled =
    (f.mana ?? SIEGE_MAGICKA.depth) + (Math.max(0, now - (f.manaAt ?? now)) / 1000) * SIEGE_MAGICKA.regenPerS;
  return Math.floor(Math.min(SIEGE_MAGICKA.depth, refilled));
}
/** Spends `cost` points of the fighter's magicka at `now` (never past what it has). @param {any} f @param {number} cost @param {number} now */
export function spendMagicka(f, cost, now) {
  f.mana = magickaRoom(f, now) - Math.max(0, cost);
  f.manaAt = now;
}

/**
 * AUDIT-SEATS R1: THE FIELD'S GROUND - the middle height (the median; two middles, their mean) of the sided fighters
 * standing in the room (`fighters` as battleStep takes them), in the room's units, or null with none.
 *
 * DECIDED here: the pass's points are `[x, z]` alone (net/identityToken.js's field - the service signs no height, and
 * the relay holds no ground), and presence was judged flat - a fighter 2,000 m over a banner stood at it, contesting it
 * for ever where no blow reached (a lone floater took two banners and the Throne). A seat town's ground is level (DFU
 * flattens a location's terrain - the camps and points all stand in or at its edge), and the fighters standing on it are
 * the room's honest many, so their middle height is the ground: a floater or a sinker more than SIEGE_HEIGHT_M off it
 * stands at no point. Its limit, recorded: a whole side lying together moves the middle by half - then nobody stands at
 * any point, and a siege's banners keep the holder's (a Tourney's whoever held them). The cure is a height in the
 * field's points, the service's to sign (SEAT2b's to ask).
 */
export function siegeGround(fighters) {
  const ys = [];
  for (const f of fighters)
    if (!f.down && f.pose && f.here && (f.side === 'attack' || f.side === 'defend') && Number.isFinite(f.pose.y))
      ys.push(f.pose.y);
  if (!ys.length) return null;
  ys.sort((p, q) => p - q);
  const h = ys.length >> 1;
  return ys.length % 2 ? ys[h] : (ys[h - 1] + ys[h]) / 2;
}
/** How far the field's ground may move from the first one the room judged, in room units: half the sphere a point is
 *  (siegeRef.js SIEGE_HEIGHT_M, 8 m, at SIEGE_UNITS_PER_M, 40 - pinned equal by test). */
export const SIEGE_GROUND_DRIFT_UNITS = 160;
/**
 * THE GROUND HELD NEAR ITS FIRST: the median of the fighters' own heights is the clients' word, and a side that climbed
 * together moved it until the other side stood off the ground and could neither strike nor hold a banner. The first
 * ground judged in a battle (everyone stands at a camp then) is kept on the battle, and a later median is held within
 * SIEGE_GROUND_DRIFT_UNITS of it. Answers the ground, or null where no fighter stands.
 * @param {any} b @param {number|null} median
 */
export function anchoredGround(b, median) {
  if (median == null) return null;
  if (!Number.isFinite(b.groundAnchor)) b.groundAnchor = median;
  return Math.max(
    b.groundAnchor - SIEGE_GROUND_DRIFT_UNITS,
    Math.min(b.groundAnchor + SIEGE_GROUND_DRIFT_UNITS, median),
  );
}
