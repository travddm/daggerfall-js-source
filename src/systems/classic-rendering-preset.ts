// The Classic rendering preset: one switch between two stored graphics profiles, standard and classic. Each profile
// holds every graphics setting the switch covers (the caller names them: the Graphics tab's Daggerfall Unity keys,
// Features rows and the choices in their drawers), so turning Classic on puts the classic profile in place and turning it off puts the standard one
// back exactly. A setting changed while a profile is in use belongs to that profile and is there the next time. The
// first time Classic is turned on, its profile is the standard one with the preset's values over it: the picture
// options closest to the original game. It writes Daggerfall Unity's own [Video] keys as well as Features rows, so a
// DFU settings file keeps its meaning. It does not change the skin, the HUD, the controls, gameplay or audio.
//
// The stores are reached through doors the caller hands in, so this module holds the rule and imports no store.

/** A row's value, as its tiers hold it. */
export type RowValue = string | number | boolean;

/** One profile: each covered Features row's value, each covered Daggerfall Unity key's stored value, and each covered
 *  drawer choice's value. */
export type GraphicsProfile = {
  readonly rows: Readonly<Record<string, RowValue>>;
  readonly video: Readonly<Record<string, string>>;
  readonly parts: Readonly<Record<string, unknown>>;
};

/** Which profile is in use, and the stored copy of each. The profile in use lives in the stores themselves; its stored
 *  copy is refreshed each time the player switches away from it. */
export type GraphicsProfiles = {
  readonly active: 'standard' | 'classic';
  readonly standard: GraphicsProfile | null;
  readonly classic: GraphicsProfile | null;
};

export type ClassicRenderingDoors = {
  /** The Features rows a profile holds. */
  readonly rowIds: readonly string[];
  /** The Daggerfall Unity keys a profile holds, `Section/Key`. */
  readonly videoKeys: readonly string[];
  /** A Features row's value, or null when the row cannot be set here (the online room decides it). */
  readRow(id: string): RowValue | null;
  writeRow(id: string, value: RowValue): void;
  /** A Daggerfall Unity setting as the store holds it. */
  readVideo(key: string): string;
  writeVideo(key: string, value: string): void;
  /** The drawer choices a profile holds: a row's parts and a mod's modules and dials. */
  readonly partIds: readonly string[];
  /** A drawer choice's value, or null when the online room decides it. */
  readPart(id: string): { readonly value: unknown } | null;
  writePart(id: string, value: unknown): void;
  readProfiles(): unknown;
  writeProfiles(profiles: GraphicsProfiles): void;
};

/** The pref that holds the two profiles. */
export const GRAPHICS_PROFILES_PREF = 'graphicsProfiles';

/** Features rows the preset sets. Land view 3 is Daggerfall Unity's default terrain distance; ground sharpness off draws
 *  the ground without mip-mapped sharpening, as the retro picture does. Enhanced lighting off gives the flat classic
 *  light, the closest to the original game's even dungeon light. Enhanced environments off gives the painted sky and
 *  the classic weather; it also turns off the meadow grass and the evolving weather, which the original game did not
 *  have either. */
export const CLASSIC_RENDERING_ROWS: Readonly<Record<string, RowValue>> = Object.freeze({
  'land-view-distance': 3,
  'ground-sharpness': 'off',
  'mip-quality': 'standard',
  'enhanced-lighting': false,
  'enhanced-environments': 'off',
});

/** Daggerfall Unity's retro keys: 320x200, 4:3, palettization of the whole picture, and no mip maps. Field of view 60
 *  is the narrowest Daggerfall Unity allows; the original game's view was narrower still. Point is DFU's own world
 *  texture filter, where the port's default is Sharp. */
export const CLASSIC_RENDERING_VIDEO: Readonly<Record<string, string>> = Object.freeze({
  'Video/RetroRenderingMode': '1',
  'Video/RetroModeAspectCorrection': '1',
  'Video/PostProcessingInRetroMode': '3',
  'Video/UseMipMapsInRetroMode': 'False',
  'Video/FieldOfView': '60',
  'Video/MainFilterMode': '0',
});

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

function profileOf(value: unknown): GraphicsProfile | null {
  if (!isRecord(value) || !isRecord(value.rows) || !isRecord(value.video)) return null;
  const parts = isRecord(value.parts) ? value.parts : {};
  return { rows: value.rows as Record<string, RowValue>, video: value.video as Record<string, string>, parts };
}

function profilesOf(doors: ClassicRenderingDoors): GraphicsProfiles {
  const stored = doors.readProfiles();
  if (!isRecord(stored)) return { active: 'standard', standard: null, classic: null };
  return {
    active: stored.active === 'classic' ? 'classic' : 'standard',
    standard: profileOf(stored.standard),
    classic: profileOf(stored.classic),
  };
}

/** The settings in use now, as a profile. A row the online room decides is left out. */
function capture(doors: ClassicRenderingDoors): GraphicsProfile {
  const rows: Record<string, RowValue> = {};
  const video: Record<string, string> = {};
  for (const id of doors.rowIds) {
    const value = doors.readRow(id);
    if (value !== null) rows[id] = value;
  }
  for (const key of doors.videoKeys) video[key] = doors.readVideo(key);
  const parts: Record<string, unknown> = {};
  for (const id of doors.partIds) {
    const part = doors.readPart(id);
    if (part !== null) parts[id] = part.value;
  }
  return { rows, video, parts };
}

/** Puts a profile in the stores, writing only what differs. The Daggerfall Unity keys go first: a key can move a row
 *  (Detail Level sets Anisotropic Filtering), and the row's own stored value must be the one that stays. The drawer
 *  choices go after the rows they belong to. */
function putInPlace(doors: ClassicRenderingDoors, profile: GraphicsProfile): void {
  for (const [key, value] of Object.entries(profile.video)) {
    if (doors.readVideo(key) !== value) doors.writeVideo(key, value);
  }
  for (const [id, value] of Object.entries(profile.rows)) {
    const now = doors.readRow(id);
    if (now !== null && String(now) !== String(value)) doors.writeRow(id, value);
  }
  // A dial can be a pair, so a choice is compared whole.
  for (const [id, value] of Object.entries(profile.parts)) {
    const now = doors.readPart(id);
    if (now !== null && JSON.stringify(now.value) !== JSON.stringify(value)) doors.writePart(id, value);
  }
}

/** The classic profile the first time: the standard one with the preset's values over it. */
function firstClassic(standard: GraphicsProfile): GraphicsProfile {
  const rows: Record<string, RowValue> = { ...standard.rows };
  for (const [id, value] of Object.entries(CLASSIC_RENDERING_ROWS)) if (id in rows) rows[id] = value;
  return { rows, video: { ...standard.video, ...CLASSIC_RENDERING_VIDEO }, parts: { ...standard.parts } };
}

/** On while the classic profile is in use. */
export function classicRenderingOn(doors: ClassicRenderingDoors): boolean {
  return profilesOf(doors).active === 'classic';
}

/** Stores the settings in use as the standard profile, then puts the classic profile in place. Returns false when
 *  Classic was already on: a second press must not store the classic settings as the standard ones. */
export function applyClassicRendering(doors: ClassicRenderingDoors): boolean {
  const profiles = profilesOf(doors);
  if (profiles.active === 'classic') return false;
  const standard = capture(doors);
  const classic = profiles.classic ?? firstClassic(standard);
  // Stored before the writes, so a write that fails part way still leaves the way back.
  doors.writeProfiles({ active: 'classic', standard, classic });
  putInPlace(doors, classic);
  return true;
}

/** Stores the settings in use as the classic profile, then puts the standard profile back. Returns false when Classic
 *  was off. */
export function removeClassicRendering(doors: ClassicRenderingDoors): boolean {
  const profiles = profilesOf(doors);
  if (profiles.active !== 'classic') return false;
  const classic = capture(doors);
  doors.writeProfiles({ active: 'standard', standard: profiles.standard, classic });
  if (profiles.standard) putInPlace(doors, profiles.standard);
  return true;
}
