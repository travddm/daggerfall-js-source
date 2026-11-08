// @ts-check
// Features: whether a covered pref's online answer is one the lane takes (systems/features.js checkFeatures). Its own file
// keeps features.js from growing (docs/testing/lint-ratchet.md).

/** The lane forces a covered pref true or false, leaves it to the player, or pins one of the tiers its part offers (the
 *  room's pin). `c` the row's control, `a` the covered pref. */
export const coveredOnlineOk = (c, a) =>
  a.online === true ||
  a.online === false ||
  a.online === 'player' ||
  (c.parts ?? []).some((p) => p.key === a.key && (p.tiers ?? []).some((/** @type {any[]} */ x) => x[0] === a.online));
