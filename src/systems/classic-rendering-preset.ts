// The Classic rendering preset: one switch that sets the picture options closest to the original game, and puts back
// what the player had when it is switched off, so today's look stays one press away (decision #104). It writes
// Daggerfall Unity's own [Video] retro keys as well as Features rows (decision #111), so a DFU settings file keeps its
// meaning. It does not change the skin, the field of view or the HUD.
//
// The stores are reached through doors the caller hands in, so this module holds the rule and imports no store.

/** A row's value, as its tiers hold it. */
export type RowValue = string | number | boolean;

/** What the preset found before it wrote, so switching it off can put it back. */
export type ClassicRenderingSaved = {
  readonly rows: Readonly<Record<string, RowValue>>;
  readonly video: Readonly<Record<string, string>>;
};

export type ClassicRenderingDoors = {
  /** A Features row's value, or null when the row cannot be set here (the online room decides it). */
  readRow(id: string): RowValue | null;
  writeRow(id: string, value: RowValue): void;
  /** A Daggerfall Unity setting as the store holds it, `Section/Key`. */
  readVideo(key: string): string;
  writeVideo(key: string, value: string): void;
  readSaved(): unknown;
  writeSaved(saved: ClassicRenderingSaved | null): void;
};

/** The pref that holds what the preset replaced. Null while the preset is off. */
export const CLASSIC_RENDERING_SAVED_PREF = 'classicRenderingSaved';

/** Features rows the preset sets. Land view 3 is Daggerfall Unity's default terrain distance; ground sharpness off draws
 *  the ground without mip-mapped sharpening, as the retro picture does. */
export const CLASSIC_RENDERING_ROWS: Readonly<Record<string, RowValue>> = Object.freeze({
  'land-view-distance': 3,
  'ground-sharpness': 'off',
});

/** Daggerfall Unity's retro keys: 320x200, 4:3, palettization of the whole picture, and no mip maps. */
export const CLASSIC_RENDERING_VIDEO: Readonly<Record<string, string>> = Object.freeze({
  'Video/RetroRenderingMode': '1',
  'Video/RetroModeAspectCorrection': '1',
  'Video/PostProcessingInRetroMode': '3',
  'Video/UseMipMapsInRetroMode': 'False',
});

function savedOf(doors: ClassicRenderingDoors): ClassicRenderingSaved | null {
  const saved = doors.readSaved();
  if (!saved || typeof saved !== 'object') return null;
  const { rows, video } = saved as { rows?: unknown; video?: unknown };
  if (!rows || typeof rows !== 'object' || !video || typeof video !== 'object') return null;
  return { rows: rows as Record<string, RowValue>, video: video as Record<string, string> };
}

/** On while it holds what it replaced. A value the player changes afterwards does not turn it off. */
export function classicRenderingOn(doors: ClassicRenderingDoors): boolean {
  return savedOf(doors) !== null;
}

/** Saves the current values, then writes the preset's. A row the online room decides is left as it is. Returns false
 *  when the preset was already on: a second press must not save the preset's own values over the player's. */
export function applyClassicRendering(doors: ClassicRenderingDoors): boolean {
  if (classicRenderingOn(doors)) return false;
  const rows: Record<string, RowValue> = {};
  const video: Record<string, string> = {};
  for (const id of Object.keys(CLASSIC_RENDERING_ROWS)) {
    const now = doors.readRow(id);
    if (now !== null) rows[id] = now;
  }
  for (const key of Object.keys(CLASSIC_RENDERING_VIDEO)) video[key] = doors.readVideo(key);
  // Saved before the writes, so a write that fails part way still leaves the way back.
  doors.writeSaved({ rows, video });
  for (const id of Object.keys(rows)) doors.writeRow(id, CLASSIC_RENDERING_ROWS[id]);
  for (const key of Object.keys(video)) doors.writeVideo(key, CLASSIC_RENDERING_VIDEO[key]);
  return true;
}

/** Puts back each saved value whose setting still holds the preset's value. A setting the player changed while the
 *  preset was on keeps the player's choice. Returns false when the preset was off. */
export function removeClassicRendering(doors: ClassicRenderingDoors): boolean {
  const saved = savedOf(doors);
  if (!saved) return false;
  for (const [id, before] of Object.entries(saved.rows)) {
    const now = doors.readRow(id);
    if (now !== null && String(now) === String(CLASSIC_RENDERING_ROWS[id])) doors.writeRow(id, before);
  }
  for (const [key, before] of Object.entries(saved.video)) {
    if (doors.readVideo(key) === CLASSIC_RENDERING_VIDEO[key]) doors.writeVideo(key, before);
  }
  doors.writeSaved(null);
  return true;
}
