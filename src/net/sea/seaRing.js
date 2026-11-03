// @ts-check
// THE SEA'S RING: how far the map pixels round a town's are asked for the sea. A port town is one the open sea bears on
// within it (world/portSites.js), and the harbour board's berth reads the same ring (systems/naval/harbourBoard.js
// deliveryPort, which the account Worker bundles), so the ring lives here, free of the world's placement code.
// Pure. Not a DFU member.

/** How far the map pixels round a town's are asked for the sea. */
export const SEA_RING = 2;

/** Whether the sea bears on a map pixel: a pixel of it (`isSea(x, y)`) within SEA_RING - the ring its bearing is read off
 *  (world/portSites.js seaBearing), so a town it bears on has a seaward edge to stand its places on. Pure. */
export function seaBears(px, py, isSea) {
  if (typeof isSea !== 'function') return false;
  for (let dy = -SEA_RING; dy <= SEA_RING; dy++)
    for (let dx = -SEA_RING; dx <= SEA_RING; dx++) if (isSea(px + dx, py + dy)) return true;
  return false;
}
