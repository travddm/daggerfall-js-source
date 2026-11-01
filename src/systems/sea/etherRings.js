// @ts-check
// ═══════════════════════════════════════════════════════════════════
// THE ELTHERIC SEA'S RINGS: its four depth bands as tiers, Veilhaven's peace, and the compass words.
//
// The sea's box is world/ethericSea.js inEther. Its water is four rings by depth band: the Shallows (1), the Reaches (2),
// the Deep Aether (3) and the Abyss (4). Veilhaven's peace (the Veil, the water within ETHER_PEACE_PX of Veilhaven's own
// pixel, and her rows east to the Veil) belongs to no ring. The deeper the ring, the better the sea's loot and the harder
// its vault halls (systems/sea/vaultFoes.js); a vault or a storm names its ring by the band's name.
//
// Pure and worker-safe: world/ethericSea.js imports formats/ alone. (Moved out of the open zone's file when the zone was
// removed; the rings, the peace and the words are unchanged.)
// ═══════════════════════════════════════════════════════════════════
import { BANDS, inEther, inVeil, etherBandAt, veilhaven, islesNear } from '../../world/ethericSea.js';
import { t } from '../textManager.js';

/** The sea's ring count: the Shallows (1) to the Abyss (4). */
export const ETHER_RINGS = 4;

/** VEILHAVEN'S PEACE: the ring-less water within this many pixels of Veilhaven's own pixel (some 10 km - the landfall,
 *  LANDFALL_OFF_PX east of it, well inside), and the Veil itself. */
export const ETHER_PEACE_PX = 12;

/** Is pixel (x, y) in Veilhaven's peace: the Veil, within ETHER_PEACE_PX of Veilhaven, or on the way between them? */
export function etherInPeace(x, y) {
  if (inVeil(x, y)) return true;
  const h = veilhaven();
  if (Math.hypot(x - h.px, y - h.py) <= ETHER_PEACE_PX) return true;
  // The way home: her own rows, east of her to the Veil. Thirty-one pixels of ring water stood between the peace and the
  // crossing, every captain's one way home through them.
  return inEther(x, y) && x >= h.px && Math.abs(y - h.py) <= ETHER_PEACE_PX;
}

/** The ring of the open sea at pixel (x, y): its depth band's place (1 the Shallows ... 4 the Abyss), or 0 outside the
 *  sea's box and in Veilhaven's peace. */
export function etherWildRingAt(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !inEther(x, y) || etherInPeace(x, y)) return 0;
  return Math.max(1, Math.min(ETHER_RINGS, BANDS.indexOf(etherBandAt(x)) + 1));
}

/**
 * A sea place's ring by its map pixel (mapTableData's longitude/latitude, MapsFile's own sum): an isle's place
 * (world/etherPlaces.js synthesizeEtherLocation's `ether`) by the sea's band at its pixel. 0 for a place that is not the
 * sea's and for one that cannot say where it stands. A vault's build reads it once.
 * @param {any} loc
 */
export function etherRingAtPlace(loc) {
  const at = loc?.mapTableData;
  if (!loc?.ether || !Number.isFinite(at?.longitude) || !Number.isFinite(at?.latitude)) return 0;
  const px = Math.trunc(at.longitude / 128);
  const py = 499 - Math.trunc(at.latitude / 128);   // formats/mapsFile.js longitudeLatitudeToMapPixel
  return etherWildRingAt(px, py);
}

/** Where a death on the open sea rises: the nearest port isle's town, sought from ETHER_RISE_PX out and the reach doubled
 *  until a port stands within it. Veilhaven is a port, so it ends at her at the farthest: a death with no freeport within
 *  ETHER_RISE_PX rose at Veilhaven, not at a Bay temple a crossing away. */
export const ETHER_RISE_PX = 60;
export function etherRisePort(x, y) {
  const h = veilhaven();
  const far = Math.hypot(h.px - x, h.py - y);
  if (!Number.isFinite(far)) return h;
  for (let r = ETHER_RISE_PX; ; r *= 2) {
    const port = islesNear(x, y, Math.min(r, far + 1)).find((i) => i.kind === 'port' && Math.hypot(i.px - x, i.py - y) <= r);
    if (port) return port;
    if (r > far) return h;
  }
}

/** The bands' names, each its own key (the extractor reads a key whole). */
const BAND_NAMES = Object.freeze({
  shallows: () => t('sea.wild.band.shallows', 'The Shallows'),
  reaches: () => t('sea.wild.band.reaches', 'The Reaches'),
  deep: () => t('sea.wild.band.deep', 'The Deep Aether'),
  abyss: () => t('sea.wild.band.abyss', 'The Abyss'),
});
/** A ring's name on the sea: its band's ("The Shallows" ... "The Abyss"). */
export const etherRingName = (ring) => BAND_NAMES[BANDS[Math.max(1, Math.min(ETHER_RINGS, ring | 0 || ETHER_RINGS)) - 1].id]();

/** The compass's sixteen points through the text core (world/ethericSea.js compassPoint's words: the sea's rumours, its
 *  storm's and its fleet's lines, the chart's ways), each its own key whole for the extractor. */
const WAY_WORDS = Object.freeze({
  north: () => t('sea.way.n', 'north'), 'north-north-east': () => t('sea.way.nne', 'north-north-east'), 'north-east': () => t('sea.way.ne', 'north-east'), 'east-north-east': () => t('sea.way.ene', 'east-north-east'),
  east: () => t('sea.way.e', 'east'), 'east-south-east': () => t('sea.way.ese', 'east-south-east'), 'south-east': () => t('sea.way.se', 'south-east'), 'south-south-east': () => t('sea.way.sse', 'south-south-east'),
  south: () => t('sea.way.s', 'south'), 'south-south-west': () => t('sea.way.ssw', 'south-south-west'), 'south-west': () => t('sea.way.sw', 'south-west'), 'west-south-west': () => t('sea.way.wsw', 'west-south-west'),
  west: () => t('sea.way.w', 'west'), 'west-north-west': () => t('sea.way.wnw', 'west-north-west'), 'north-west': () => t('sea.way.nw', 'north-west'), 'north-north-west': () => t('sea.way.nnw', 'north-north-west'),
});
/** A compass point's word in the language of the moment (compassPoint's, or '' for none). */
export const etherWayWord = (/** @type {string | null | undefined} */ point) => (point ? WAY_WORDS[/** @type {keyof typeof WAY_WORDS} */ (point)]?.() ?? point : '');

// ── THE SEA GROUND FLAG ──────────────────────────────────────────────────────────────────────────────────────────────
// Which ground the player stands on, for the laws that differ at sea (SEA-SET Undertow). It used to ride the open zone's
// live flag (kind 'ether'); the world host sets this one each frame instead.
let _atSea = false;
/** The world host's word each frame: the player is on the open Eltheric sea (a ring above 0), not in Veilhaven's peace. */
export function setSeaGround(/** @type {boolean} */ on) {
  _atSea = !!on;
}
/** Does the player stand on the open Eltheric sea now? */
export const seaGroundHere = () => _atSea;
