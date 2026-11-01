// @ts-check
// POWER-CEILING: THE TWO SAFETY NETS. A blow's powers ADD (the sigil, the sets, the loot, the sky, mastery, the paths: each
// asks for its room, and the percents sum onto the damage the blow was handed) and a hurt's guards multiply. Each registry's
// numbers are set so that what a card or a sheet prints is what the blow gets: the tops below are what the registry's
// records reach at their best (tools/powerCeiling.mjs measures them, test/combat/powerceiling.test.js holds them equal).
// The net (BLOW_MOST, GUARD_LEAST) is above what a normal kit reaches and only catches a kit with every registry near its
// top at once. The runners (entityMods.js, playerEntity.js) and registries import this leaf.

/** THE BLOW POWERS' TOPS: each registry's most onto one blow (per cent), measured from today's records and laws. B1 (tame
 *  player power) rescaled the records themselves (the sets from +200 to +15, the loot's powers from +240 to +32, the sigil
 *  from 12 to 4, the paths from 40 to 6), so no printed number is cut. The Firmament tree (+50) is untouched: B5 retunes it. */
export const BLOW_TOPS = Object.freeze({ sigil: 4, sets: 15, loot: 32, firmament: 50, mastery: 21, martial: 6 });
/** THE GUARDS' TOPS: each registry's most off one hurt (per cent), its guards multiplied; measured as the blow's are. */
export const GUARD_TOPS = Object.freeze({ loot: 12.448, sets: 14, firmament: 15, martial: 6, arcane: 4 });
/** THE BLOW NET: the most all the registries add together, per cent. The registries' tops sum to 101; a kit with all six
 *  near their tops at once is cut to this (x1.754). Before B1 the blow's powers multiplied to x119.95. */
export const BLOW_NET_PCT = 75.4;
/** A blow is at most this many times the damage it was handed. */
export const BLOW_MOST = 1 + BLOW_NET_PCT / 100;
/** THE GUARD NET: a hurt keeps at least this share of what reached the guards (74.09%; 10.71% before B1). Points (Bulwark, a
 *  ward, a Shield's pool), a hit capped by health (Unyielding) and a blow turned aside whole are no share, and stand outside it. */
export const GUARD_LEAST = 0.7408776192;
/** Rounding's slack: a product taken in another order differs in its last bits, and that is no stacking. */
const SLACK = 1e-6;

/** @typedef {{ k: number, per: Record<string, number> }} Held  the running total (the blow's: per cent summed; the hurt's: share kept), and each registry's own */
/** @type {Held|null} the blow's while its runner holds it open; null outside */
let _blow = null;
/** @type {Held|null} the hurt's share kept, the same way */
let _guard = null;
const heldBlow = () => ({ k: 0, per: {} });
const heldGuard = () => ({ k: 1, per: {} });

/** The blow runner opens its sum before the first power and closes it after the last (a nested blow keeps its own). */
export function openBlowCeiling() { const was = _blow; _blow = heldBlow(); return was; }
/** @param {Held|null} was */
export function closeBlowCeiling(was) { _blow = was; }
/** The hurt runner's, the same way. */
export function openGuardCeiling() { const was = _guard; _guard = heldGuard(); return was; }
/** @param {Held|null} was */
export function closeGuardCeiling(was) { _guard = was; }

/** THE ROOM A BLOW POWER HAS: the share of `pct` (per cent of the damage the blow was handed) that keeps `registry` at its
 *  own top (BLOW_TOPS - a name it has no top under has no room) and the sum under the net. A price (a negative per cent) is
 *  taken whole and makes room. Outside a runner a power stands alone, held at its registry's top.
 *  @param {number} pct @param {string|null} [registry] */
export function blowRoom(pct, registry = null) {
  if (!Number.isFinite(pct)) return 0;
  const sum = _blow?.k ?? 0, own = (registry != null ? _blow?.per[registry] : null) ?? 0;
  const top = registry == null ? BLOW_NET_PCT : BLOW_TOPS[registry] ?? 0;
  const room = Math.max(0, Math.min(BLOW_NET_PCT - sum, top - own));
  const take = pct <= room + SLACK ? pct : room;
  if (_blow) { _blow.k = sum + take; if (registry != null) _blow.per[registry] = own + take; }
  return take;
}
/** THE ROOM A GUARD HAS: the share of `less` (per cent off the hurt it was handed) that keeps `registry`'s guards at
 *  their own top (GUARD_TOPS) and the hurt at GUARD_LEAST of what reached the guards. A price (more damage taken) is
 *  taken whole. @param {number} less @param {string|null} [registry] */
export function guardRoom(less, registry = null) {
  if (!Number.isFinite(less)) return 0;
  const k = _guard?.k ?? 1, own = (registry != null ? _guard?.per[registry] : null) ?? 1;
  const least = registry == null ? GUARD_LEAST : 1 - (GUARD_TOPS[registry] ?? 0) / 100;
  const room = Math.max(0, (1 - Math.max(GUARD_LEAST / k, least / own)) * 100);
  const take = less <= room + SLACK ? less : room;
  if (_guard) { _guard.k = k * (1 - take / 100); if (registry != null) _guard.per[registry] = own * (1 - take / 100); }
  return take;
}

/** Tests: the running products, or null where no runner holds one open. */
export const ceilingProducts = () => ({ blow: _blow ? 1 + _blow.k / 100 : null, guard: _guard?.k ?? null });
