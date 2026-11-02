// @ts-check
// SEA-EVENTS: THE SOCIAL ROOM'S RECORD OF SUNK TREASURE FLEETS.
//
// A treasure fleet's route and ships are every client's own pure pick off the sailing's number
// (systems/sea/seaEvents.js). The one thing no client may decide is whether a flagship is down, because a sunk fleet
// is sunk for everyone. The social room keeps that as a small record, `{ fleets: { sailing: until } }`:
// a sailing whose flagship went down, and the relay time at which the record lets it go (the sailing after it is over).
//
// Pure: the relay (server/src/index.js `_seaWord`) reads the record, calls these and writes it back.
import { SEA_FLEET_PERIOD_MS, SEA_FLEET_OFFSET_MS, SEA_FLEET_SAIL_MS, SEA_FLEET_LATE_MS } from '../wire.js';

/** The storage key of the record in the social room. */
export const SEA_HUB_KEY = 'seahub';

/** A fresh, empty record. */
export const fleetHubEmpty = () => ({ fleets: {} });

/** A stored record, made safe: anything malformed is dropped. */
export function fleetHubOf(/** @type {unknown} */ stored) {
  const out = fleetHubEmpty();
  const fleets = stored && typeof stored === 'object' ? /** @type {any} */ (stored).fleets : null;
  if (!fleets || typeof fleets !== 'object' || Array.isArray(fleets)) return out;
  for (const [sailing, until] of Object.entries(fleets)) {
    if (Number.isSafeInteger(Number(sailing)) && Number.isFinite(until))
      out.fleets[sailing] = /** @type {number} */ (until);
  }
  return out;
}

/** Let go of every sailing whose time has passed. Answers whether anything went, so the caller writes only on change. */
export function fleetHubPrune(/** @type {{ fleets: Record<string, number> }} */ record, /** @type {number} */ now) {
  let moved = false;
  for (const [sailing, until] of Object.entries(record.fleets)) {
    if (until > now) continue;
    delete record.fleets[sailing];
    moved = true;
  }
  return moved;
}

/**
 * A treasure fleet's flagship sunk: sailing `n`. The relay hears it only while she is under way by its own clock, or
 * SEA_FLEET_LATE_MS after (a word in her hour in port, or the hour before, would scatter a sailing before it sailed).
 * The sailing stays down until the one after it is over. A second report moves nothing.
 * Returns whether it was news.
 */
export function fleetSunk(
  /** @type {{ fleets: Record<string, number> }} */ record,
  /** @type {unknown} */ n,
  /** @type {number} */ now,
) {
  if (!Number.isSafeInteger(n)) return false;
  const sailing = /** @type {number} */ (n);
  const start = sailing * SEA_FLEET_PERIOD_MS + SEA_FLEET_OFFSET_MS;
  const underWay = now >= start && now <= start + SEA_FLEET_SAIL_MS + SEA_FLEET_LATE_MS;
  if (!underWay) return false;
  if (record.fleets[sailing] > now) return false;
  record.fleets[sailing] = (sailing + 2) * SEA_FLEET_PERIOD_MS;
  return true;
}

/** The sailings whose flagship is down, oldest first. */
export function fleetsDown(/** @type {{ fleets: Record<string, number> }} */ record, /** @type {number} */ now) {
  return Object.entries(record.fleets)
    .filter(([, until]) => until > now)
    .map(([sailing]) => Number(sailing))
    .sort((a, b) => a - b);
}
