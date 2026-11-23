// The search that finds which classic TEXTURE record a mod's picture is. A picture that a record covers by
// DERIVED_SHARE or more is carried as that record plus the pixels that differ (formats/derivedTexture.js), so the
// repository holds a recipe built from the player's own files instead of the picture. The mods' asset tools and
// tools/lib/classicBlocks.mjs use it.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TextureFile } from '../../src/formats/textureFile.js';
import { classicRecordRgba } from '../../src/formats/derivedTexture.js';
import type { DFPalette } from '../../src/formats/dfPalette.js';

/** A picture as RGBA bytes, row by row. */
export interface Picture {
  width: number;
  height: number;
  data: Uint8Array;
}

/** One frame of one classic record. */
export interface ClassicRecord {
  archive: number;
  record: number;
  frame: number;
  rgba: Picture;
}

/** A record found for a picture: where it sits on the picture and how many visible pixels it matches. */
export interface ClassicSource extends ClassicRecord {
  at: [number, number];
  same: number;
}

/** A picture is a classic record's when the record covers at least this share of its visible pixels exactly. */
export const DERIVED_SHARE = 0.6;

const visible = (pic: Picture, i: number): boolean => pic.data[i * 4 + 3] !== 0;

/** How many of `pic`'s visible pixels `src` placed at (ax, ay) matches exactly. */
function coverage(pic: Picture, src: Picture, ax: number, ay: number): number {
  let same = 0;
  for (let y = 0; y < pic.height; y++) {
    const sy = y - ay;
    for (let x = 0; x < pic.width; x++) {
      const i = y * pic.width + x;
      if (!visible(pic, i)) continue;
      const sx = x - ax;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const j = (sy * src.width + sx) * 4;
      if (
        src.data[j + 3] !== 0 &&
        src.data[j] === pic.data[i * 4] &&
        src.data[j + 1] === pic.data[i * 4 + 1] &&
        src.data[j + 2] === pic.data[i * 4 + 2] &&
        pic.data[i * 4 + 3] === 255
      ) {
        same++;
      }
    }
  }
  return same;
}

/** Every classic record, frame 0..n, as RGBA: the search space. */
export function* classicRecords(arena2: string, palette: DFPalette): Generator<ClassicRecord> {
  for (const f of readdirSync(arena2)
    .filter((n) => /^TEXTURE\.\d{3}$/i.test(n))
    .sort()) {
    const t = new TextureFile();
    if (!t.load(new Uint8Array(readFileSync(join(arena2, f))), f.toUpperCase(), palette)) continue;
    for (let r = 0; r < t.recordCount; r++) {
      const frames = Math.max(1, t.getFrameCount(r));
      for (let fr = 0; fr < frames; fr++) {
        const bm = t.getDFBitmap(r, fr);
        if (bm?.width) yield { archive: t.archive, record: r, frame: fr, rgba: classicRecordRgba(bm, palette) };
      }
    }
  }
}

/** The best classic source for a picture, or null: records within one pixel of its size, at every offset that keeps them on it. */
export function findClassicSource(pic: Picture, records: Iterable<ClassicRecord>): ClassicSource | null {
  let visibleCount = 0;
  for (let i = 0; i < pic.width * pic.height; i++) if (visible(pic, i)) visibleCount++;
  let best: ClassicSource | null = null;
  for (const c of records) {
    const { width: w, height: h } = c.rgba;
    if (Math.abs(w - pic.width) > 1 || Math.abs(h - pic.height) > 1) continue;
    for (let ay = Math.min(0, pic.height - h); ay <= Math.max(0, pic.height - h); ay++) {
      for (let ax = Math.min(0, pic.width - w); ax <= Math.max(0, pic.width - w); ax++) {
        const same = coverage(pic, c.rgba, ax, ay);
        if (!best || same > best.same) best = { ...c, at: [ax, ay], same };
      }
    }
  }
  return best && best.same >= DERIVED_SHARE * visibleCount ? best : null;
}
