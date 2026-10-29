// @ts-check
// RELIEF-CARETS (bible/03-World/Tamriel.md): the high ground past the Bay, marked by the Bay's own law. A caret stands on
// every land pixel at or over the treeline, larger over the snowline, on the Bay's pixel grid and CARET_STEP, so a range
// runs across the join with no change of spacing. The byte is the ground's (tamrielGround.js tamrielHeightByte), so when
// the land or the heights move the ink is built again and these with it. The authored range lines stopped dead at their
// ends and missed most of the high ground the ground stands.
// The continent is too large to read whole at the near step: a view reads only the blocks it shows, and keeps them.

import { TREELINE_BYTE, SNOWLINE_BYTE, isWaterPixel } from '../overworldModel.js';
import { PEN, CARET_STEP, CONTINENT_BAND, toPaper } from './inkMap.js';

/** One caret: a Bay pixel and whether it is over the snowline. @typedef {{ x: number, y: number, peak: boolean }} Caret */
/**
 * The ground past the Bay, each read of a Bay pixel; `frame` is the continent's box (tamrielFrameInBay), and the Bay's
 * own ground (`inBay`) is the Bay painter's to mark.
 * @typedef {{ heightByte: (x: number, y: number) => number, climateAt: (x: number, y: number) => number,
 *   frame: { x0: number, y0: number, w: number, h: number }, inBay: (x: number, y: number) => boolean }} CaretGround
 */
/** A block's side in Bay pixels: a multiple of every CARET_STEP, so a block's lattice is the sheet's lattice. */
export const CARET_BLOCK = 96;

/**
 * The carets of one step's block, read off the ground. A pixel is high ground by the Bay's law: land (not water by
 * isWaterPixel, the Bay's water law) at or over TREELINE_BYTE. The byte is read first, since most pixels fail on it and
 * the climate is the dearer read.
 * @param {CaretGround} ground @param {number} step @param {number} blockX @param {number} blockY
 * @returns {Caret[]}
 */
export function blockCarets(ground, step, blockX, blockY) {
  const carets = [];
  const left = Math.max(blockX * CARET_BLOCK, Math.ceil(ground.frame.x0));
  const top = Math.max(blockY * CARET_BLOCK, Math.ceil(ground.frame.y0));
  const right = Math.min((blockX + 1) * CARET_BLOCK, Math.floor(ground.frame.x0 + ground.frame.w));
  const bottom = Math.min((blockY + 1) * CARET_BLOCK, Math.floor(ground.frame.y0 + ground.frame.h));
  const firstX = Math.ceil(left / step) * step;
  const firstY = Math.ceil(top / step) * step;
  for (let y = firstY; y < bottom; y += step) {
    for (let x = firstX; x < right; x += step) {
      if (ground.inBay(x + 0.5, y + 0.5)) continue;
      const byte = ground.heightByte(x, y);
      if (byte < TREELINE_BYTE) continue;
      if (isWaterPixel(ground.climateAt(x, y), byte)) continue;
      carets.push({ x, y, peak: byte >= SNOWLINE_BYTE });
    }
  }
  return carets;
}

/**
 * The store of the carets past the Bay, read a block at a time and kept. Build one per ink (it belongs to the land and
 * heights the ink was built on).
 * @param {CaretGround} ground
 */
export function createPastBayCarets(ground) {
  /** @type {Map<string, Caret[]>} */
  const blocks = new Map();

  /** The carets of a step within a rectangle of Bay pixels, a whole block at a time (the caller culls). */
  function inRect(x0, y0, x1, y1, step) {
    const carets = [];
    for (let blockY = Math.floor(y0 / CARET_BLOCK); blockY <= Math.floor(y1 / CARET_BLOCK); blockY++) {
      for (let blockX = Math.floor(x0 / CARET_BLOCK); blockX <= Math.floor(x1 / CARET_BLOCK); blockX++) {
        const key = `${step}|${blockX}|${blockY}`;
        let block = blocks.get(key);
        if (!block) {
          block = blockCarets(ground, step, blockX, blockY);
          blocks.set(key, block);
        }
        for (const caret of block) carets.push(caret);
      }
    }
    return carets;
  }

  return { inRect, blockCount: () => blocks.size };
}

/** The step a view thins the carets to: the Bay's, so the two lattices are one at the join. */
export const caretStep = (band, continent) => CARET_STEP[continent ? CONTINENT_BAND : band] ?? CARET_STEP.mid;

/**
 * The carets past the Bay on the sheet, in the Bay's pen, size and shape (inkMap.js paintInkStatic's caret loop): a
 * caret's half-width follows the scale between 2.5 and 7 paper pixels, a peak's is 1.3 times it.
 * @param {any} ctx
 * @param {{ ox: number, oy: number, scale: number }} view
 * @param {ReturnType<typeof createPastBayCarets>} store
 * @param {{ paperW: number, paperH: number, band: string, continent: boolean }} opts
 */
export function paintPastBayCarets(ctx, view, store, { paperW, paperH, band, continent }) {
  const scale = view.scale;
  const pad = 2;
  const x0 = view.ox - pad;
  const y0 = view.oy - pad;
  const x1 = view.ox + paperW / scale + pad;
  const y1 = view.oy + paperH / scale + pad;
  const size = Math.max(2.5, Math.min(7, scale * 0.9));
  ctx.strokeStyle = PEN.relief;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const caret of store.inRect(x0, y0, x1, y1, caretStep(band, continent))) {
    if (caret.x < x0 || caret.y < y0 || caret.x > x1 || caret.y > y1) continue;
    const [x, y] = toPaper(view, caret.x + 0.5, caret.y + 0.5);
    const half = caret.peak ? size * 1.3 : size;
    ctx.moveTo(x - half, y + half * 0.6);
    ctx.lineTo(x, y - half * 0.6);
    ctx.lineTo(x + half, y + half * 0.6);
  }
  ctx.stroke();
}
