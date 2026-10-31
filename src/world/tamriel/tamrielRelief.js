// @ts-check
// ═══════════════════════════════════════════════════════════════════
// TAMRIEL-RELIEF (2026-10-24, bible/03-World/Tamriel.md TAMRIEL-RELIEF) - THE CONTINENT'S RELIEF, as a trace carries it:
// a height a cell, RELIEF_SCALE cells a picture unit, in WOODS bytes (the trace's `relief`). PURE over the trace: the terrain
// worker and the roads worker hold the same module. HEIGHTMAP-OUT (2026-10-31, Tamriel.md TAMRIEL-RELIEF): the owner's
// heightmap and the data baked from it are removed, so no trace carries a relief and the authored law stands everywhere
// past the Bay (world/tamriel/tamrielGround.js authoredHeightByte). What reads the cells stays for the relief generated
// from the remake's own sketch (tamriel-remake PLAN).
//
//   - THE COAST IS THE TRACE'S: a cell at sea on the trace is 0, so a relief never makes land or water - it only says
//     how high the land the trace draws stands.
//   - THE PEAKS (world/tamriel/tamrielBiomes.js): a province's peaks zone is its highest PEAKS_SHARE of land, never under
//     PEAKS_FLOOR (`peaksLine`); a range a zone names (Red Mountain) stands at the relief's summit nearest the range's
//     authored place, within NAMED_SEEK (`namedSummit`).
// ═══════════════════════════════════════════════════════════════════
import { tamrielTrace, tamrielLandVersion, provinceKeyAt } from './tamrielLand.js';
import { tamrielFit, bayPictureRect } from './tamrielFrame.js';   // AUDIT TESA II G11: the peaks' share is of the land past the Bay

/** How far inland (picture units) from the waterline the land takes to rise from the shore to the relief's own height -
 *  the heightmap's coast is near the trace's, not on it, so its height is eased in rather than standing as a cliff at the
 *  water (world/tamriel/tamrielGround.js authoredHeightByte - AUDIT TESA II G4: from the waterline, not a pixel's centre). */
export const RELIEF_COAST_REACH = 1;
/** AUDIT TESA II G12: the least the relief's land stands inland (WOODS bytes, eased up from SHORE_BYTE over
 *  RELIEF_COAST_REACH as the height is) - over the kernel's dips, so no sea-level pond stands inside the land. */
export const RELIEF_FLOOR = 8;
/** A province's peaks: its highest share of land (by the relief), and never land under this byte. */
export const PEAKS_SHARE = 0.08;
export const PEAKS_FLOOR = 40;
/** A named range's summit is sought this far (picture units) from its authored spine; its zone is the peaks within
 *  NAMED_REACH of the summit. */
export const NAMED_SEEK = 30;
export const NAMED_REACH = 10;

/** Cells a picture unit, each way. */
export const RELIEF_SCALE = 2;

/** The installed trace's cells, or null. */
const reliefCells = () => /** @type {Uint8Array|null} */ (tamrielTrace()?.relief ?? null);
/** Whether the relief stands: the installed trace carries cells of its own size. */
export function reliefStands() {
  const t = tamrielTrace();
  return !!t?.relief && t.relief.length === t.w * RELIEF_SCALE * t.h * RELIEF_SCALE;
}

/** THE RELIEF at a picture point (units), in WOODS bytes - bilinear between the cells' centres, a cell at sea 0 (so the
 *  height falls toward a coast between its last two cells), 0 off the grid or with no relief standing. */
export function reliefAt(px, py) {
  const t = tamrielTrace(), cells = reliefCells();
  if (!t || !cells) return 0;
  const s = RELIEF_SCALE, w = t.w * s, h = t.h * s;
  const fx = px * s - 0.5, fy = py * s - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cells[y * w + x]);
  return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
}

let _linesFor = -1, _linesFit = /** @type {any} */ (null);
/** @type {Map<string, number>} */
const _lines = new Map();
/** @type {Map<string, [number, number]|null>} */
const _summits = new Map();
/** The lines and summits are the land's and the fit's (AUDIT TESA II G11: the line reads the Bay's rectangle, the fit's). */
const fresh = () => {
  const v = tamrielLandVersion(), f = tamrielFit();
  if (v === _linesFor && f === _linesFit) return;
  _linesFor = v; _linesFit = f; _lines.clear(); _summits.clear();
};

/** THE PEAKS' LINE of a province (its key): the relief its highest PEAKS_SHARE of land PAST THE BAY stands at or over (AUDIT
 *  TESA II G11: a cell inside the Bay's rectangle is WOODS' ground, where no zone stands - High Rock's and Hammerfell's
 *  share was of land mostly the Bay's), never under PEAKS_FLOOR - every province's made in one pass over the trace's
 *  cells, once a trace and a fit; 256 (none) with no relief. */
export function peaksLine(province) {
  fresh();
  if (!_lines.size) {
    const t = tamrielTrace(), cells = reliefCells();
    if (!t || !cells) return 256;
    const s = RELIEF_SCALE, w = t.w * s, bay = bayPictureRect();
    /** @type {Map<string, Uint32Array>} */ const counts = new Map();
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) continue;
      const x = i % w, y = (i - x) / w, px = (x + 0.5) / s, py = (y + 0.5) / s;
      if (px >= bay.x0 && px < bay.x1 && py >= bay.y0 && py < bay.y1) continue;
      const key = provinceKeyAt(px, py);
      if (!key) continue;
      let c = counts.get(key);
      if (!c) counts.set(key, (c = new Uint32Array(257)));
      c[cells[i]]++; c[256]++;
    }
    for (const [key, c] of counts) {
      let line = 256;
      for (let v = 255, above = 0; v >= 0; v--) { above += c[v]; if (above > c[256] * PEAKS_SHARE) { line = v; break; } }
      _lines.set(key, Math.max(PEAKS_FLOOR, line));
    }
  }
  return _lines.get(province) ?? 256;
}

/** THE SUMMIT OF A NAMED RANGE: the highest cell of `province` within NAMED_SEEK of the range's authored spine (`pts`,
 *  picture units), [px, py] - or null where the province holds none there. Made once a trace and a range. */
export function namedSummit(province, name, pts) {
  fresh();
  const key = `${province}|${name}`;
  if (_summits.has(key)) return _summits.get(key) ?? null;
  const t = tamrielTrace(), cells = reliefCells();
  if (!t || !cells) return null;
  const s = RELIEF_SCALE, w = t.w * s, h = t.h * s;
  let best = 0, at = /** @type {[number, number]|null} */ (null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = cells[y * w + x];
    if (v <= best) continue;
    const px = (x + 0.5) / s, py = (y + 0.5) / s;
    // AUDIT RED-MOUNTAIN L6: squared - the volcano's centre is this summit, a ground source (one float in every engine, A8)
    if (!pts.some(([qx, qy]) => (px - qx) * (px - qx) + (py - qy) * (py - qy) <= NAMED_SEEK * NAMED_SEEK) || provinceKeyAt(px, py) !== province) continue;
    best = v; at = [px, py];
  }
  _summits.set(key, at);
  return at;
}
