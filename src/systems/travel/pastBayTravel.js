// @ts-check
// ═══════════════════════════════════════════════════════════════════
// AUDIT TESA II P4 - NO JOURNEY INTO THE LAND PAST THE BAY.
//
// The owner, 2026-10-13: "fast travel shouldnt be a thing since we use portal stones online or the player can traverse
// using the overworld". TESA-NO-FAST kept the travel map's press past the Bay from picking a journey (ui/heldMap.js) -
// one door of several: a party's journey to its leader (PARTY-TRAVEL) and a rider's in its owner's wagon (WAGONS2) set
// out for a pixel past the Bay by the same fast travel, the map never asked. This is the journey's own law, asked by the
// one gate every journey passes (scenes/world.js fastTravelTo): a journey whose end lies past the Bay
// - the land TAMRIEL2 streams, its places TESA's - is refused, in words that say the two ways there are. The Eltheric
// Ocean's side of the Veil is the Veil's (veilRefused).
//
// Pure: the journey's end in, a verdict out. Not a DFU member: DFU's map stops at the Bay.
// ═══════════════════════════════════════════════════════════════════
import { inBay } from '../../world/tamriel/tamrielFrame.js';
import { inEther } from '../../world/ethericSea.js';
import { t } from '../textManager.js';
import { provinceKeyBeyondBay } from '../../world/tamriel/tamrielLand.js';   // PORTAL-ANYWHERE: the land's own law (SMOOTH-LAND)
import { provinceByKey } from '../../world/tamriel/tamrielGeography.js';

/** What the refusal says (the text core's: L10N4). */
export const PAST_BAY_TRAVEL_TEXT = Object.freeze({
  get refused() { return t('travel.pastBay.refused', 'No road the Bay knows leads there. The land past the Iliac Bay is walked, or reached through a Portal Stone.'); },
});

/**
 * A journey's verdict past the Bay: a refusal where its end lies past the Bay (not the Bay's map, not past the Veil),
 * else ok. Only the end decides; `_from` is there so the journey's gate and the teleports' read alike.
 * @param {{ x: number, y: number }|null} _from @param {{ x: number, y: number }|null} to
 * @returns {{ ok: boolean, text?: string }}
 */
export function pastBayJourney(_from, to) {
  if (!to || inBay(to.x, to.y) || inEther(to.x, to.y)) return { ok: true };
  return { ok: false, text: PAST_BAY_TRAVEL_TEXT.refused };
}

/**
 * PORTAL-ANYWHERE: A PORTAL STONE'S END ON THE LAND PAST THE BAY - a departure from TESA-NO-FAST for the
 * Portal Stone alone (TESA13 had kept a portal's ends to the cities). A pixel past the Bay (not the Bay's map, not past
 * the Veil) whose centre is land by the land's own law (world/tamriel/tamrielLand.js provinceKeyBeyondBay - the world's
 * ground and the sheet's ink read it) is one, named by the province it is land of, as a peer names a portal's end off its
 * own map (scenes/world.js portalGates' destOf); the sea is none. Where on it the traveller stands is the arrival's
 * (scenes/world.js _teleportToPixel: player/enterExit.js safeGroundAt). Answers `{ pixel, name }`, or null.
 * @param {number} px @param {number} py
 * @returns {{ pixel: { x: number, y: number }, name: string }|null}
 */
export function portalLandAt(px, py) {
  if (!Number.isInteger(px) || !Number.isInteger(py) || inBay(px, py) || inEther(px, py)) return null;
  const province = provinceByKey(provinceKeyBeyondBay(px, py));
  return province ? { pixel: { x: px, y: py }, name: province.name } : null;
}
