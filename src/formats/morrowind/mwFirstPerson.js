// The diagnostic for the player's own Morrowind files: format readers and reports that say what the archives
// genuinely contain. It draws nothing, so every answer is a fact about the files and never a claim about
// rendering. Where a routine is a heuristic rather than a parse, its name and its output say so.

/** The Morrowind BSA directory is one contiguous block: a 12-byte header of three uint32 LE (id 0x100, dirsize,
 *  filenum); then 3*filenum uint32 read as one run, indexed [i*2] size, [i*2+1] offset and [2*filenum + i] name
 *  offset; then a string buffer of (dirsize - 12*filenum) bytes of NUL-terminated names; then 8*filenum bytes of
 *  name hashes, which this reader ignores. File data begins at 12 + dirsize + 8*filenum and every stored offset is
 *  relative to that. */
export function parseBsaIndex(bytes) {
  const size = bytes.byteLength;
  if (size < 12) throw new Error('file too small to be a BSA (under 12 bytes)');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, size);
  const id = dv.getUint32(0, true);
  if (id !== 0x100) {
    throw new Error(`not a Morrowind BSA: header id is 0x${id.toString(16)}, expected 0x100`);
  }
  const dirsize = dv.getUint32(4, true);
  const filenum = dv.getUint32(8, true);

  // The directory must fit inside the archive. A file takes at least 21 bytes of it: 8 for its size and offset, 4
  // for its name offset, 8 for its hash and one for the NUL that ends its name. The name table and the hashes
  // must fit as well.
  if (filenum * 21 > size - 12) throw new Error('directory larger than the archive (file count)');
  if (dirsize + 8 * filenum > size - 12) throw new Error('directory larger than the archive (dir size)');

  const tableBytes = 12 * filenum;
  const stringStart = 12 + tableBytes;
  const stringLen = dirsize - tableBytes;
  if (stringLen < 0) throw new Error('directory smaller than its own offset table');
  const dataStart = 12 + dirsize + 8 * filenum;

  const u32 = (i) => dv.getUint32(12 + i * 4, true);
  const files = [];
  for (let i = 0; i < filenum; i++) {
    const fileSize = u32(i * 2);
    const offset = u32(i * 2 + 1) + dataStart;
    const nameOffset = u32(2 * filenum + i);
    if (nameOffset >= stringLen) throw new Error(`name offset outside the string buffer (entry ${i})`);
    let end = stringStart + nameOffset;
    while (end < stringStart + stringLen && bytes[end] !== 0) end++;
    if (end >= stringStart + stringLen) throw new Error(`unterminated name (entry ${i})`);
    files.push({
      // Stored names use backslashes and any case; paths are compared with forward slashes in lower case.
      name: latin1(bytes.subarray(stringStart + nameOffset, end)).replace(/\\/g, '/').toLowerCase(),
      size: fileSize,
      offset,
    });
  }
  return { fileCount: filenum, dirSize: dirsize, dataStart, files };
}

/** Windows-1252 is the English release's code page, not a property of the format: localised releases ship other
 *  code pages. This decoder is therefore named for what it assumes. The five bytes Windows-1252 maps differently
 *  from Latin-1 in the 0x80-0x9F range are ones a bone name would never use, so Latin-1 is the honest cheap
 *  approximation and is labelled as such rather than called a decode. */
export function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** A NIF file starts with one newline-terminated text line that begins with one of these strings, then a raw
 *  uint32 BCD version. */
export const NIF_MAGICS = Object.freeze(['NetImmerse File Format', 'Gamebryo File Format']);

export function readNifHeader(bytes) {
  let nl = -1;
  for (let i = 0; i < Math.min(bytes.length, 128); i++) if (bytes[i] === 0x0a) { nl = i; break; }
  if (nl < 0) return { ok: false, why: 'no newline in the first 128 bytes - not a NIF' };
  const line = latin1(bytes.subarray(0, nl)).replace(/\r$/, '');
  const magic = NIF_MAGICS.find((m) => line.startsWith(m));
  if (!magic) return { ok: false, why: `header line is ${JSON.stringify(line)}`, line };
  if (bytes.length < nl + 5) return { ok: false, why: 'file ends before the version field', line };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getUint32(nl + 1, true);
  return {
    ok: true, magic, line, version,
    versionText: [24, 16, 8, 0].map((s) => (version >>> s) & 0xff).join('.'),
    // A NIF `bool` is an int32 below version 4.1.0.0 and an int8 from it on.
    boolBytes: version < 0x04010000 ? 4 : 1,
  };
}

/** The first-person skeletons the layer asks for, by actor. `base_anim.1st.nif` is listed so that the report can
 *  say whether a skeleton by that name exists; the retail first-person skeletons are the three above it, and
 *  `base_anim.nif` is the third-person skeleton. */
export const FP_SKELETONS = Object.freeze([
  { path: 'meshes/xbase_anim.1st.nif', who: 'male, non-beast' },
  { path: 'meshes/base_anim_female.1st.nif', who: 'female' },
  { path: 'meshes/base_animkna.1st.nif', who: 'beast (Khajiit, Argonian)' },
  { path: 'meshes/wolf/skin.1st.nif', who: 'werewolf' },
  { path: 'meshes/xbase_anim.1st.kf', who: 'first-person animation source' },
  { path: 'meshes/base_anim.1st.nif', who: 'THE NAME THE REVERTED RIG HARDCODED' },
]);

/** A TES3 record is name[4] + uint32 size + 8 bytes of header and flags, then `size` bytes of subrecords, each
 *  name[4] + uint32 size + data. Unlike NIF, every record carries its size, so an unknown type is skippable by
 *  design, and this walk cannot lose its place. */
export function walkEsm(bytes, { limit = Infinity } = {}) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let p = 0;
  while (p + 16 <= bytes.length && out.length < limit) {
    const type = latin1(bytes.subarray(p, p + 4));
    const size = dv.getUint32(p + 4, true);
    const body = p + 16;
    if (body + size > bytes.length) break;   // truncated tail, not a throw
    out.push({ type, start: body, size });
    p = body + size;
  }
  return out;
}

export function subrecords(bytes, rec) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let p = rec.start;
  const end = rec.start + rec.size;
  while (p + 8 <= end) {
    const name = latin1(bytes.subarray(p, p + 4));
    const len = dv.getUint32(p + 4, true);
    if (p + 8 + len > end) break;
    out.push({ name, start: p + 8, len });
    p = p + 8 + len;
  }
  return out;
}

const zstr = (bytes, s, n) => {
  let e = s;
  while (e < s + n && bytes[e] !== 0) e++;
  return latin1(bytes.subarray(s, e));
};

/** Morrowind's body-part slots, by BYDT index. The ESM reader owns this table; it is re-exported so this
 *  module's API stays as it was. */
export { MW_BODY_PARTS, isFirstPersonId } from './mwEsmFile.js';
import { MW_BODY_PARTS, isFirstPersonId } from './mwEsmFile.js';
import FACE_TABLE from '../mwFaceTable.json' with { type: 'json' };
import { GRAPH_ROOT } from './mwSkin.js';
import { transferSkin, sourceSkin, fitLift, liftBatch } from './mwSkinTransfer.js';   // a worn model skinned from the body under it; and fitted onto it
import { collectTextKeys, normalizeTextKeys, clipGroups, resetClip, parseAnimGroups, extractTracks } from './mwAnim.js';
import { batchMoves, posePartBatch, nodeAffineAt, nodeClockAt, clockFor } from './mwPartClock.js';   // a part's own clock
import { applyClimbRig } from '../../combat/climbRig.js';   // the climb's pose on the rig's own bones
import { applyMirrorRig, limbSkeleton, offWeaponBoneAddon, WEAPON_BONE_LEFT_SOURCE, mirrorBindSources } from '../../combat/twoHands/mirrorRig.js';   // the second hand - an arm, or the body, in the mirror; the left hand's weapon bone   // the skins it is mirrored by
import { ownFacePools } from '../../characters/ownModels/ownHeadModels.js';   // the port's own heads and hairs - a race's pools where it has them
import { MW_WEAPON_TYPE } from './mwWeaponAnim.js';
export * from './mwWeaponAnim.js';
import { SKIN_SWEEP_SLOTS, resolveBodyParts } from './mwBodyParts.js';
export * from './mwBodyParts.js';
export * from './mwAnimSources.js';   // callers import the animation sources, body parts and weapon rules from here
import { pitchNeck } from './mwHeadView.js';
export * from './mwHeadView.js';   // the camera node and the neck turn moved out; callers keep importing them from here

/** The four parts that may fall back to a third-person mesh when the first-person record is missing. This is not
 *  the list of what gets shown. */
export const ARM_PARTS = Object.freeze(['hand', 'wrist', 'forearm', 'upperarm']);

// Every record reader below is ONE record off the walk, so the
// per-kind extractors and extractArmRecords (one pass, every kind)
// cannot disagree - they call the same function on the same bytes.
function readBodyPart(bytes, rec) {
  const e = { id: '', model: '', race: '', part: -1, female: false, playable: true, skin: false, vampire: false };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.race = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'BYDT' && sub.len >= 4) {
      e.part = bytes[sub.start];
      e.vampire = bytes[sub.start + 1] !== 0;   // the vampire flag is BYDT's second byte
      const flags = bytes[sub.start + 2];
      e.female = (flags & 1) !== 0;            // flag bit 1: female
      e.playable = (flags & 2) === 0;          // flag bit 2: not playable
      e.skin = bytes[sub.start + 3] === 0;     // mesh type 0: skin
      e.bodyKind = bytes[sub.start + 3];       // the raw mesh type (0 skin, 2 armor); a shield's mesh is armor
    }
  }
  e.slot = MW_BODY_PARTS[e.part] ?? `#${e.part}`;
  e.firstPerson = isFirstPersonId(e.id);
  return e;
}

export function bodyParts(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type === 'BODY') out.push(readBodyPart(bytes, rec));
  }
  return out;
}

/** The RACE records the build needs: the beast flag decides the skeleton column, and the height and weight pairs
 *  scale the rig. RADT is 140 bytes: 7 skill pairs (56) and 8x2 attributes (64), then the maleHeight, femaleHeight,
 *  maleWeight and femaleWeight floats at 120..135 and the flags int32 at 136 (Playable 0x1, Beast 0x2). */
function readRace(bytes, rec) {
  const e = { id: '', beast: false, playable: false, height: [1, 1], weight: [1, 1], radt: false };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'RADT' && sub.len >= 140) {
      e.radt = true;
      const dv = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 140);
      e.height = [dv.getFloat32(120, true), dv.getFloat32(124, true)];
      e.weight = [dv.getFloat32(128, true), dv.getFloat32(132, true)];
      const flags = dv.getInt32(136, true);
      e.playable = (flags & 1) !== 0;
      e.beast = (flags & 2) !== 0;
    }
  }
  return e.id ? e : null;
}

export function raceRecords(bytes) {
  const out = new Map();
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'RACE') continue;
    const e = readRace(bytes, rec);
    if (e) out.set(e.id, e);
  }
  return out;
}


/**
 * The WEAP records in a player's .esm.
 *
 * WPDT is a 32-byte struct: float weight; int32 value; int16 type; uint16 health; float speed, reach; uint16
 * enchantment; uchar chop[2], slash[2], thrust[2]; int32 flags (UESP, Tes3Mod:File Format). Only the offset of the
 * type matters here, byte 8, and a short record is refused rather than read past: a wrong offset silently yields
 * a plausible weapon type.
 */
function readWeapon(bytes, rec) {
  const e = { id: '', model: '', name: '', type: MW_WEAPON_TYPE.None, enchanted: false, speed: 1 };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'ENAM') e.enchanted = true;
    else if (sub.name === 'WPDT') {
      if (sub.len < 32) continue;   // refused, not read past
      // The type is at byte 8, after the weight and the value; the health that follows is not the type. A fixture
      // written from the same offset as the reader cannot expose a wrong one, so check a change here against
      // retail data.
      const dv = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 32);
      e.type = dv.getInt16(8, true);
      // The speed is the float at byte 12, after the health. It is the only record field that changes how fast
      // an attack plays: it scales the three attack sections, while equip and unequip play at normal speed.
      e.speed = dv.getFloat32(12, true);
    }
  }
  return e.id && e.model ? e : null;
}

/** A CREA record's FLAG bits (UESP, Tes3Mod:File Format). Only the low byte is kept. */
export const CREA_FLAG = Object.freeze({ Biped: 0x01, Respawn: 0x02, WeaponAndShield: 0x04, None: 0x08, Swims: 0x10, Flies: 0x20, Walks: 0x40, Essential: 0x80 });

/** The CREA records, which a creature's body is built from: its id, its model (MODL, the path as the WEAP reader
 *  keeps one), its name, its flags (FLAG's low byte) and its scale (XSCL, 1 when absent). */
function readCreature(bytes, rec) {
  const e = { id: '', model: '', name: '', flags: 0, scale: 1 };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'FLAG' && sub.len >= 4) e.flags = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getInt32(0, true) & 0xff;
    else if (sub.name === 'XSCL' && sub.len >= 4) e.scale = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getFloat32(0, true);
  }
  return e.id && e.model ? e : null;
}

/** The CREA records, one walk (extractArmRecords' `creatures`, by the same reader). */
export function creatureRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'CREA') continue;
    const e = readCreature(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

export function weaponRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'WEAP') continue;
    const e = readWeapon(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

/** The carriable lights. Morrowind's torch is a LIGH record with a mesh, carried in the left hand at the Shield
 *  Bone (the slot a shield takes) and animated by the "torch" group on the left arm's blend mask. LHDT is 24
 *  bytes: float weight (0), int value (4), int time (8), int radius (12), uint32 colour (16), int flags (20). The
 *  flags are Dynamic 0x1, Can Carry 0x2, Negative 0x4, Flicker 0x8, Fire 0x10, Off By Default 0x20, Flicker Slow
 *  0x40, Pulse 0x80 and Pulse Slow 0x100. Only a light the player can carry is a candidate for the hand; a wall
 *  sconce is a LIGH record too. */
export const MW_LIGHT_CARRY = 0x2;
export const MW_LIGHT_FIRE = 0x10;
function readLight(bytes, rec) {
  const e = { id: '', model: '', name: '', carry: false, fire: false, flags: 0 };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'LHDT') {
      if (sub.len < 24) continue;   // refused, not read past
      const dv = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 24);
      e.flags = dv.getInt32(20, true);
      e.carry = (e.flags & MW_LIGHT_CARRY) !== 0;
      e.fire = (e.flags & MW_LIGHT_FIRE) !== 0;
    }
  }
  return e.id && e.model ? e : null;
}

/**
 * A magic effect (MGEF; UESP, Tes3Mod:File Format): INDX is the effect's index and MEDT its 36 bytes (school, base
 * cost, flags, red, green, blue, size, speed, size cap). The icon, the particle texture, four sounds, the four
 * visuals by id (CVFX casting, BVFX bolt, HVFX hit, AVFX area) and the description follow in any order. The effects
 * layer reads the colour, the speed, the flags' NegativeLight, the particle texture and the visuals
 * (formats/morrowind/mwSpellFx.js); nothing else is kept. Only the three modifiable flag bits are the file's: the
 * hard-coded rest is not read here, so it is not stored.
 */
function readMagicEffect(bytes, rec) {
  const e = { index: -1, school: 0, flags: 0, color: [255, 255, 255], speed: 1, particle: '', casting: '', bolt: '', hit: '', area: '' };
  for (const sub of subrecords(bytes, rec)) {
    const dv = () => new DataView(bytes.buffer, bytes.byteOffset + sub.start, sub.len);
    if (sub.name === 'INDX' && sub.len >= 4) e.index = dv().getInt32(0, true);
    else if (sub.name === 'MEDT') {
      if (sub.len < 36) continue;   // refused, not read past
      const d = dv();
      e.school = d.getInt32(0, true);
      e.flags = d.getInt32(8, true) & (0x200 | 0x400 | 0x800);   // AllowSpellmaking | AllowEnchanting | NegativeLight
      e.color = [d.getInt32(12, true), d.getInt32(16, true), d.getInt32(20, true)];
      e.speed = d.getFloat32(28, true);
    } else if (sub.name === 'PTEX') e.particle = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'CVFX') e.casting = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'BVFX') e.bolt = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'HVFX') e.hit = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'AVFX') e.area = zstr(bytes, sub.start, sub.len).toLowerCase();
  }
  return e.index >= 0 && e.index < 256 ? e : null;
}

export function magicEffectRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'MGEF') continue;
    const e = readMagicEffect(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

/** A STAT's id and mesh, kept for the statics an effect is drawn with: every id that begins VFX_ (each visual the
 *  masters' MGEFs name, VFX_Default* and VFX_Hands among them) and any other id an MGEF in the same file names. An
 *  MGEF in a mod that names a non-VFX_ static of another file is not found. */
function readStatic(bytes, rec) {
  const e = { id: '', model: '' };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
  }
  return e.id && e.model ? e : null;
}
export const VFX_STATIC_PREFIX = 'vfx_';
/** The statics kept, out of a file's STATs (`byId`, last record of an id wins) and the ids its MGEFs name. */
function vfxStatics(byId, effects) {
  const named = new Set(effects.flatMap((m) => [m.casting, m.bolt, m.hit, m.area]).filter(Boolean));
  return [...byId.values()].filter((e) => e.id.startsWith(VFX_STATIC_PREFIX) || named.has(e.id));
}

export function vfxStaticRecords(bytes) {
  const byId = new Map();
  const effects = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type === 'STAT') { const e = readStatic(bytes, rec); if (e) byId.set(e.id, e); }
    else if (rec.type === 'MGEF') { const m = readMagicEffect(bytes, rec); if (m) effects.push(m); }
  }
  return vfxStatics(byId, effects);
}

export function lightRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'LIGH') continue;
    const e = readLight(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

/** Which torch. Daggerfall's Torch (TEMPLATES.Torch, 247) is one item; Morrowind's are many LIGH records. Here the
 *  held light is Daggerfall's lit light, so the record is chosen by the same shape pickWeaponRecord uses for a
 *  blade: a carriable light whose id names a torch, the plain `torch` first (retail's "Torch"), then the shortest
 *  id (torch_256 over torch_256_yellow, the base over its variants), and only one whose mesh the attached
 *  archives carry. Otherwise a torch would resolve to a mesh the build cannot read, and the card would say
 *  nothing useful. */
export function pickTorchRecord(lights, { has = null } = {}) {
  return pickCarriedLight(lights, /torch/, 'torch', has);
}
/** WHICH LANTERN - pickTorchRecord's own shape for the lantern Handheld Torches' waist switch hangs at
 *  the third-person body's hip: a CARRIABLE light whose id names a lantern, whose mesh the attached archives
 *  carry, the shortest id first (the base over its coloured variants). No retail id is assumed - the pick is by
 *  the same shape, and a master with none answers null and a note, never a torch in the lantern's place. */
export function pickLanternRecord(lights, { has = null } = {}) {
  return pickCarriedLight(lights, /lantern/, null, has);
}
function pickCarriedLight(lights, named, exactId, has) {
  const cands = (lights ?? []).filter((l) => l && l.carry && l.model && named.test(l.id)
    && (!has || has(`meshes/${l.model}`)));
  if (!cands.length) return null;
  const exact = exactId ? cands.find((l) => l.id === exactId) : null;
  if (exact) return exact;
  return cands.slice().sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/** The bones of one blend mask. A bone belongs to the mask whose root name it meets first walking up its
 *  parents: "Bip01 L Clavicle" is the left arm, and the arm test wins over the spine because the clavicle is met
 *  before the spine on the way up. Answers the lower-cased node names under `rootName` (itself included), which is
 *  the spelling poseSkeleton looks tracks up by. A skeleton without the root (the fixture rigs, a rig cut down to
 *  an arm) answers the empty set, and the caller overlays nothing. */
export function blendMaskBones(skeleton, rootName = 'bip01 l clavicle') {
  const mask = new Set();
  if (!skeleton || !skeleton.nodes) return mask;
  const rootBone = String(rootName).toLowerCase();
  const lowerName = (node) => String(node.name || '').toLowerCase();
  const childrenOf = new Map();
  for (const [ref, node] of skeleton.nodes) {
    if (!childrenOf.has(node.parent)) childrenOf.set(node.parent, []);
    childrenOf.get(node.parent).push(ref);
  }
  const pending = [];
  for (const [ref, node] of skeleton.nodes) if (lowerName(node) === rootBone) pending.push(ref);
  const visited = new Set();
  while (pending.length) {
    const ref = pending.pop();
    if (visited.has(ref)) continue;
    visited.add(ref);
    mask.add(lowerName(skeleton.nodes.get(ref)));
    pending.push(...(childrenOf.get(ref) ?? []));
  }
  return mask;
}

/** The one mask this port has: a second animation state wins one blend mask while the frame's winner keeps the
 *  rest. In the single-winner pose pass (the update in fpArm.js) that is a track map, which answers the overlay's
 *  track for a bone in the mask and the base's track for every other bone, read through a sampler that samples an
 *  overlay track at the overlay's own clock. poseSkeleton asks `tracks.get(name)` and `sampleTrack(track, time)`
 *  and nothing else, so the pair drops in with no change to the pass. A mask bone the overlay does not key falls
 *  to the base's track: the node would otherwise keep its last transform, and the base's is the safer reading of
 *  "last". */
export function overlayTracks(base, overlay, bones) {
  // ONE merged Map per (base, overlay, mask) - built
  // eagerly so the frame's lookups allocate nothing. The caller memoises
  // it on those three identities.
  const out = new Map(base ?? []);
  if (overlay && bones) {
    for (const [name, t] of overlay) if (bones.has(name) && t) out.set(name, { __overlay: t });
  }
  return out;
}
export function overlaySampler(sampleTrack, clock) {
  const at = typeof clock === 'function' ? clock : () => clock;
  return (track, time) => (track && track.__overlay ? sampleTrack(track.__overlay, at()) : sampleTrack(track, time));
}

/** The worn half of an ARMO or CLOT record: one structure on both, so one reader. An ARMO or CLOT MODL is the
 *  ground mesh, the thing a dropped cuirass looks like; the worn shape is a list of part references. INDX (one
 *  byte, the sided part type) opens a reference, then BNAM names the male BODY record and CNAM the female one,
 *  either optional. Reading MODL as the worn mesh would dress the player in ground clutter. Any other subrecord
 *  is not this reader's. */
function readPartRef(bytes, sub, e, kind) {
  if (sub.name === 'INDX') {
    if (sub.len !== 1) throw new Error(`${kind} ${e.id}: INDX is ${sub.len} bytes`);
    e.parts.push({ part: bytes[sub.start], male: null, female: null });
  } else if (sub.name === 'BNAM' && e.parts.length) {
    e.parts[e.parts.length - 1].male = zstr(bytes, sub.start, sub.len).toLowerCase();
  } else if (sub.name === 'CNAM' && e.parts.length) {
    e.parts[e.parts.length - 1].female = zstr(bytes, sub.start, sub.len).toLowerCase();
  }
}

/** The CLOT records: the ARMO reader's twin, plus CTDT's type, which the composer needs twice over. Daggerfall
 *  garments resolve to Morrowind clothing by type (a shirt is any CLOT of type 2, id-sorted), and the robe and
 *  skirt types reserve body slots. CTDT is 12 bytes (u32 type, f32 weight, u16 value, u16 enchant points) and is
 *  refused at any other size. The part references are the same INDX, BNAM and CNAM list armor carries, and MODL is
 *  the ground mesh here too. */
function readClothing(bytes, rec) {
  const e = { id: '', model: '', name: '', type: -1, enchanted: false, parts: [] };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'ENAM') e.enchanted = true;
    else if (sub.name === 'CTDT') {
      if (sub.len !== 12) throw new Error(`CLOT ${e.id}: CTDT is ${sub.len} bytes`);
      e.type = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getUint32(0, true);
    } else readPartRef(bytes, sub, e, 'CLOT');
  }
  // A garment worn by its parts needs no ground mesh. A CLOT record requires NAME and CTDT and may leave MODL out.
  // "werewolfrobe" is a technical item, never shown and never dropped, so a record with part references and no
  // MODL is kept: dropping it refused the whole wolf on data that carries it. The Daggerfall garment pool still
  // asks for a model (mwItemMap mwClothingRecord).
  return e.id && (e.model || e.parts.length) ? e : null;
}

export function clothingRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'CLOT') continue;
    const e = readClothing(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

/** IS THIS RACE A BEAST? Read from the RACE record's
 *  own RADT flags (bit 2), the WEAP way - a targeted walk, lenient of
 *  fixtures, because the one consumer is a boolean and parseEsm's
 *  full door throws on headerless test bytes. Later masters override
 *  earlier ones, so the caller feeds esms IN ORDER and the last RACE
 *  with this id wins - the load order, not a preference.
 *
 *  THE DEFECT THIS CLOSES: fpSkeletonPath/tpSkeletonPath switch on
 *  `beast`, playerBodyRows hides the tail row on `!beast` - and no
 *  production caller ever SET it. An Argonian or Khajiit player built
 *  on the human skeleton (base_anim, not base_animkna) with the tail
 *  slot silently skipped, and nothing on screen said so. The flag was
 *  in the player's own data the whole time. */
export function raceBeastFlag(bytes, raceId) {
  // ONE HOME: the full RACE reader below answers; this stays as the
  // narrow question its callers ask. null = this esm does not know.
  const rec = raceRecords(bytes).get(String(raceId || '').toLowerCase());
  return rec && rec.radt ? rec.beast : null;
}

/** The ARMO records, read the WEAP way - id, model, display
 *  name, enchantment flag. AODT is not decoded: nothing this port
 *  draws needs Morrowind's armor class, and a struct nobody consumes
 *  is a guess waiting to go wrong (the byte-eight lesson, one
 *  screen up). mwItemMap resolves DF armor against these by token. */
function readArmor(bytes, rec) {
  const e = { id: '', model: '', name: '', enchanted: false, parts: [] };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'ENAM') e.enchanted = true;
    else readPartRef(bytes, sub, e, 'ARMO');   // the worn half
  }
  return e.id && e.model ? e : null;
}

export function armorRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'ARMO') continue;
    const e = readArmor(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

/**
 * The GMST the sneak sink is measured in: `i1stPersonSneakDelta`, the distance the first-person view sinks while
 * the player sneaks and is neither swimming nor flying. It is a step change with no smoothing.
 *
 * Read from the player's own .esm rather than hardcoded, because it is a GMST and a mod may move it, and a
 * constant here would invent a number the data already carries. GMST layout: NAME is the id, and the value rides
 * INTV, FLTV or STRV by the id's first letter (i, f or s), which is Morrowind's own convention and the reason the
 * type does not need to be stored.
 *
 * @returns the number, or null when the .esm does not carry it - the caller decides, and a missing GMST is not a
 *   reason to refuse an arm.
 */
function readGmst(bytes, rec) {
  let name = '';
  let value = null;
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') name = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'INTV' && sub.len >= 4) {
      value = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getInt32(0, true);
    } else if (sub.name === 'FLTV' && sub.len >= 4) {
      value = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getFloat32(0, true);
    } else if (sub.name === 'STRV') value = zstr(bytes, sub.start, sub.len);
  }
  return { name, value };
}

export function gmstValue(bytes, id) {
  const want = String(id).toLowerCase();
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'GMST') continue;
    const g = readGmst(bytes, rec);
    if (g.name === want) return g.value;
  }
  return null;
}

/** The GMST id, spelled once. */
export const GMST_SNEAK_DELTA = 'i1stpersonsneakdelta';

/** The GMSTs the arm build reads. Spelled once so the derived
 *  record set carries exactly what buildFpArm asks for and a new
 *  question here is a version bump there. */
export const ARM_GMST_IDS = Object.freeze([GMST_SNEAK_DELTA]);

/** The SHAPE of extractArmRecords' answer. Bumped whenever a
 *  reader above changes what it returns, so a derived set written by
 *  an older build is refused and re-extracted rather than read wrong. */
export const ARM_RECORDS_VERSION = 6;   // + the BODY vampire flag (a set without it is re-extracted); + the LIGH records (a set without them is re-extracted); a CLOT with parts and no MODL is kept; + the MGEF records and the VFX statics; + the CREA records

/**
 * EVERY record the arm build reads, in ONE pass of the master.
 *
 * buildFpArm asked six questions of each .esm - bodies, races, armors,
 * clothes, weapons, one GMST - and each was its own walk of the whole
 * file: 1.0-2.7 s per walk on Morrowind.esm measured, times six, times
 * the three retail masters, on EVERY page load (the memo was
 * per-session). The records do not change between two loads of the
 * same bytes, so they are extracted once here and kept (dataSource's
 * derived store) against the file's name, size and a sample stamp.
 *
 * The answer is plain data - arrays, an entries list for the races (a
 * Map does not survive JSON), a name-to-value object for the GMSTs -
 * and each list is exactly what the per-kind extractor returns for the
 * same bytes: same readers, same order, same filters. `races` is the
 * last-id-wins Map as entries; `gmst` holds the FIRST record of each
 * asked id (gmstValue's rule) and omits ids the file does not carry.
 */
export function extractArmRecords(bytes, { gmst = ARM_GMST_IDS } = {}) {
  const want = new Set(gmst.map((id) => String(id).toLowerCase()));
  const out = { version: ARM_RECORDS_VERSION, parts: [], races: [], armors: [], clothes: [], weapons: [], lights: [], magicEffects: [], statics: [], creatures: [], gmst: {} };
  const races = new Map();
  const statics = new Map();   // every STAT, until the file's MGEFs have said which they name
  for (const rec of walkEsm(bytes)) {
    switch (rec.type) {
      case 'BODY': out.parts.push(readBodyPart(bytes, rec)); break;
      case 'RACE': { const e = readRace(bytes, rec); if (e) races.set(e.id, e); break; }
      case 'ARMO': { const e = readArmor(bytes, rec); if (e) out.armors.push(e); break; }
      case 'CLOT': { const e = readClothing(bytes, rec); if (e) out.clothes.push(e); break; }
      case 'WEAP': { const e = readWeapon(bytes, rec); if (e) out.weapons.push(e); break; }
      case 'CREA': { const e = readCreature(bytes, rec); if (e) out.creatures.push(e); break; }
      case 'LIGH': { const e = readLight(bytes, rec); if (e) out.lights.push(e); break; }
      case 'MGEF': { const e = readMagicEffect(bytes, rec); if (e) out.magicEffects.push(e); break; }
      case 'STAT': { const e = readStatic(bytes, rec); if (e) statics.set(e.id, e); break; }
      case 'GMST': {
        const g = readGmst(bytes, rec);
        if (want.has(g.name) && !Object.hasOwn(out.gmst, g.name)) out.gmst[g.name] = g.value;
        break;
      }
      default: break;
    }
  }
  out.races = [...races.entries()];
  out.statics = vfxStatics(statics, out.magicEffects);   // the VFX_ family and whatever this file's MGEFs name
  return out;
}

/** Is this a record set this build can read - the shape it
 *  writes, every list present? A derived set from another version, or
 *  a torn one, answers false and is re-extracted. */
export function isArmRecords(r) {
  return !!r && typeof r === 'object' && r.version === ARM_RECORDS_VERSION
    && ['parts', 'races', 'armors', 'clothes', 'weapons', 'lights', 'magicEffects', 'statics', 'creatures'].every((k) => Array.isArray(r[k]))
    && !!r.gmst && typeof r.gmst === 'object';
}

/**
 * The sneak sink as a vector in the object root's space: [0, 0, -offset] while sneaking and the zero vector
 * otherwise. The whole first-person body sinks by that much in -Z through the neck, so the Camera bone goes with
 * it and the eye drops too, which is the point.
 *
 * The game also refuses the sink while swimming or flying. That has no Daggerfall counterpart worth porting here:
 * the host already refuses the port's sneak input in those states, so the guard would be a branch no frame can
 * take.
 */
export function sneakOffset(sneaking, delta) {
  return sneaking && delta ? [0, 0, -delta] : [0, 0, 0];
}

/**
 * THE DIVERGENCE, DECLARED. Daggerfall's weapon taxonomy is NOT
 * Morrowind's, and this document's own warning is that any mapping
 * between them is a PORT DECISION which "belongs in the recorded
 * divergences with its reasoning visible - not inferred inside a lookup
 * table, where the last attempt hid it wrong twice."
 *
 * So it is a table, it is exported, it is pinned, and every row is
 * arguable. Keyed by the port's own WEAPONS template index, because
 * Daggerfall's templates are finer than its WEAPON_TYPES: a Claymore and
 * a Longsword are both LongBlade to the sprite layer, and they are a
 * two-hander and a one-hander to Morrowind.
 *
 * THE ROWS THAT ARE JUDGEMENT, not translation:
 *   - FLAIL. Morrowind has no flail. BluntOneHand is the nearest thing
 *     that exists; nothing here is right.
 *   - STAFF. Daggerfall's staff is a two-handed blunt; Morrowind's own
 *     staves are BluntTwoWide, so that is where it goes.
 *   - WAR AXE vs BATTLE AXE. Daggerfall's names are the REVERSE of
 *     Morrowind's: its Battle Axe is the one-hander (DFU's ItemTemplates,
 *     WEAPON_HANDS 127 'Either') and its War Axe the two-hander (128
 *     'Both'), where every later game - Morrowind's records included -
 *     calls the one-hander the war axe. So a Daggerfall Battle Axe draws
 *     Morrowind's AxeOneHand (its war axes) and a War Axe its AxeTwoHand
 *     (its battle axes), the grip and the clips following the hands the
 *     item really has (matching on the names alone,
 *     a War Axe swings one-handed beside a torch
 *     while a Battle Axe takes both hands). dfWeaponShape crosses the
 *     two names for the same reason.
 *   - DAI-KATANA and CLAYMORE are LongBladeTwoHand, which costs them
 *     Daggerfall's own one-handed animation - a real behavioural change,
 *     not just a mesh swap.
 */
export const DF_TO_MW_WEAPON = Object.freeze({
  Dagger: MW_WEAPON_TYPE.ShortBladeOneHand,
  Tanto: MW_WEAPON_TYPE.ShortBladeOneHand,
  Shortsword: MW_WEAPON_TYPE.ShortBladeOneHand,
  Wakazashi: MW_WEAPON_TYPE.ShortBladeOneHand,
  Broadsword: MW_WEAPON_TYPE.LongBladeOneHand,
  Saber: MW_WEAPON_TYPE.LongBladeOneHand,
  Longsword: MW_WEAPON_TYPE.LongBladeOneHand,
  Katana: MW_WEAPON_TYPE.LongBladeOneHand,
  Claymore: MW_WEAPON_TYPE.LongBladeTwoHand,
  Dai_Katana: MW_WEAPON_TYPE.LongBladeTwoHand,
  Mace: MW_WEAPON_TYPE.BluntOneHand,
  Flail: MW_WEAPON_TYPE.BluntOneHand,
  Warhammer: MW_WEAPON_TYPE.BluntTwoClose,
  Staff: MW_WEAPON_TYPE.BluntTwoWide,
  War_Axe: MW_WEAPON_TYPE.AxeTwoHand,
  Battle_Axe: MW_WEAPON_TYPE.AxeOneHand,
  Short_Bow: MW_WEAPON_TYPE.MarksmanBow,
  Long_Bow: MW_WEAPON_TYPE.MarksmanBow,
});

/** Daggerfall's materials against Morrowind's, for picking WHICH record
 *  of a type to draw. Only the seven Morrowind actually ships are here;
 *  the rest fall through to whatever the type offers, and the caller
 *  reports which record it took so a wrong pick is visible rather than
 *  merely odd. */
// THE MATERIAL ROWS ARE COLOUR TRUTH, NOT LORE GUESSES. Every
// Daggerfall material is a 16-index band of ART_PAL (dyes.js
// METAL_TABLES); the band's mean is what the sprite art actually looks
// like, measured (mwItemMap.DF_MATERIAL_RGB). The rows below follow it:
//   Elven is SILVER-WHITE in Daggerfall (#a6a6a7, the same band family
//     as Silver) - not green glass, which no Daggerfall
//     player would recognise as elven. Silver weapons exist in MW.
//   Mithril is a dark blue-steel (#2a3849), Adamantium near-black
//     (#2e2e30), Ebony black (#3a3a3a): Daggerfall's own art barely
//     tells the three apart, and the darkest MW metal is ebony - so all
//     three read as ebony, with Adamantium trying Tribunal's own
//     'adamantium' first when that master is loaded.
//   Orcish is dark GREEN (#314026). MW has no orcish weapon; glass is
//     the green metal, ebony the dark one - green is the identity a
//     player reads, so glass, recorded as the judgement it is.
// Each value is a CHAIN tried in order; the first token present wins.
export const DF_TO_MW_MATERIAL = Object.freeze({
  Iron: ['iron'], Steel: ['steel'], Silver: ['silver'], Elven: ['silver', 'steel'],
  Dwarven: ['dwarven'], Mithril: ['ebony'], Adamantium: ['adamantium', 'ebony'],
  Ebony: ['ebony'], Orcish: ['glass', 'ebony'], Daedric: ['daedric'],
});

/**
 * Pick the WEAP record to put in the hand: the right TYPE first, then
 * the closest material, then anything of that type. Enchanted records
 * are avoided because in Morrowind they carry a glow this slice does not
 * draw, so taking one would show an ordinary mesh under a name that
 * promises light.
 *
 * Answers null rather than substituting a different type - a longsword
 * standing in for a bow would be drawn on the wrong bone, in the wrong
 * hand, and nothing on screen would say so.
 */
/**
 * A Daggerfall item to a Morrowind weapon type, through the table above.
 * Answers None for anything not in it - unarmed, a lockpick, a torch, a
 * werecreature's claws - and None means NO WEAPON IS DRAWN, which is the
 * honest answer for an item Morrowind has no weapon for.
 *
 * templateIndex is the key, not the sprite layer's WEAPON_TYPES, because
 * WEAPON_TYPES folds a Claymore and a Longsword into one class and
 * Morrowind holds them in different numbers of hands.
 */
export function dfWeaponToMw(item, weaponsTable) {
  if (!item || item.werecreatureClaws) return MW_WEAPON_TYPE.None;
  const idx = item.templateIndex;
  for (const [name, tmpl] of Object.entries(weaponsTable ?? {})) {
    if (tmpl === idx && name in DF_TO_MW_WEAPON) return DF_TO_MW_WEAPON[name];
  }
  return MOD_WEAPON_TO_MW[idx] ?? MW_WEAPON_TYPE.None;   // a mod's weapon of a classic shape
}

/** THE WEAPONS A MOD ADDS, by template -
 *  Roleplay & Realism Items' Archer's Axe (ItemArchersAxe: one-handed, either hand) and Light Flail (ItemLightFlail: a
 *  flail, as the classic one maps). Outside DFU's frozen WEAPONS, so the walk above never met them: in Morrowind first
 *  person they drew EMPTY HANDS, and their icon and a wall's mount stood as the classic picture. */
export const MOD_WEAPON_TO_MW = Object.freeze({
  513: MW_WEAPON_TYPE.AxeOneHand,     // Archer's Axe
  514: MW_WEAPON_TYPE.BluntOneHand,   // Light Flail
});

export function pickWeaponRecord(records, type, material = null, { has = null, shape = null } = {}) {
  // Id-sorted, for the face's own reason - file
  // order is a property of the LOAD, and `ofType[0]` handed a player
  // whichever record their archive arrangement listed first. Sorted,
  // the same character draws the same sword on every machine, and on
  // retail the alphabetical first is the iron/chitin commons the old
  // pick usually landed on anyway.
  const sorted = (records ?? []).filter((r) => r.type === type && !r.enchanted)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!sorted.length) return null;
  // A bow shows no arrow unless the arrow record's mesh is in the archives:
  // PICK A RECORD WHOSE MESH THE ARCHIVES CARRY. The records come
  // from EVERY .esm attached and the meshes from whichever .bsa files
  // are - and the two need not agree. With Tribunal.esm or
  // Bloodmoon.esm beside Morrowind.esm, the id-sorted first Arrow is
  // an expansion's ("adamantium arrow"), whose mesh lives in the
  // expansion's .bsa; without that archive attached the pick landed
  // on a file the store did not have, resolveWeaponParts noted "not in
  // your archives", and the bow drew EMPTY, for ever, while the base
  // game's own iron arrow sat one id further down. The bow itself
  // escaped by its material chain (an iron bow finds "long bow" in
  // the base game). So, given `has` (the archives' directory), the
  // pool is first the records whose model is actually there; only
  // when NONE is does the old pick stand, so the note still names the
  // file the player is missing. weaponPartPaths and resolveWeaponParts
  // pass the same `has`, so the preload and the read agree.
  const present = has ? sorted.filter((r) => has(`meshes/${r.model}`)) : sorted;
  const ofType = present.length ? present : sorted;
  const chain = material ? DF_TO_MW_MATERIAL[material] : null;
  for (const want of (Array.isArray(chain) ? chain : chain ? [chain] : [])) {
    const matches = ofType.filter((r) => r.id.includes(want));
    if (matches.length) return (shape && matches.find((r) => r.id.replace(/[^a-z]/g, '').endsWith(shape))) || matches[0];
  }
  return ofType[0];
}

/** The report the reverted arc never printed: for one race, which
 *  first-person arm records actually exist, and what each one would fall
 *  back to. Answers are about the PLAYER'S data, never about ours. */
export function armReport(parts, race, female) {
  const want = String(race || '').toLowerCase();
  // The picks come from resolveBodyParts, the one resolver; the report only
  // adds the verdict shape the card shows.
  const fpResolved = resolveBodyParts(parts, race, female, { firstPerson: true });
  const tpResolved = resolveBodyParts(parts, race, female, { firstPerson: false });
  const rows = [];
  for (const slot of ARM_PARTS) {
    const forSlot = parts.filter((p) => p.race === want && p.slot === slot && p.skin && p.playable);
    const fp = forSlot.filter((p) => p.firstPerson);
    const tp = forSlot.filter((p) => !p.firstPerson);
    const resolved = fpResolved.get(slot) ?? null;
    const chosenFp = resolved && resolved.firstPerson ? resolved : null;
    const chosenTp = resolved && !resolved.firstPerson ? resolved : (tpResolved.get(slot) ?? null);
    rows.push({
      slot,
      firstPerson: chosenFp,
      thirdPersonFallback: chosenTp,
      // Only the four arm parts may fall back, and this is one of them.
      verdict: chosenFp ? 'first-person record found'
        : chosenTp ? 'no .1st record - falls back to the third-person mesh (allowed for arms)'
          : 'NOTHING for this slot',
      counts: { firstPerson: fp.length, thirdPerson: tp.length },
    });
  }
  return rows;
}

/**
 * THE THIRD-PERSON BODY, one row per slot. The same question
 * armReport answers for the four arm slots, asked for every slot the
 * body has, in the THIRD-PERSON records (the ones whose id does not end
 * "1st"). Sex picks with the male fallback retail relies on
 * (assembleNpc's law); head and hair are skin-type BODY records like
 * everything else. A missing tail on a non-beast race is the data
 * being right.
 *
 * THE FACE IS DERIVED, NOT CHOSEN (Mac's call, 2026-08-30): classic
 * chargen stays byte-for-byte - the portrait strip, faceIndex 0..9 -
 * and the Morrowind head and hair are a pure function of what classic
 * already saved. faceIndex indexes the race-and-sex's own playable
 * head list and hair list, modulo their counts, so every classic face
 * resolves to SOME real face, a save from before this slice resolves
 * the same way forever, and no schema changed. The pools are sorted BY
 * RECORD ID first: "first in file order" was the old law and file
 * order is a property of the load, not of the character - two archive
 * arrangements would give one save two faces. Sorted, index 0 lands on
 * the _01 records vanilla names first, which is exactly what the old
 * first-in-file pick chose on retail. Every slot that is not the head
 * or the hair keeps index 0 - a chest has one skin record and a face
 * has six, and only the face was ever a choice in Daggerfall.
 */
/** The race-and-sex's head and hair pools, id-sorted - THE
 *  SAME pools playerBodyRows walks, exposed so the matcher measures
 *  exactly the candidates the walk would have chosen among.
 *  where the port carries its own heads and hairs for the race
 *  and sex (characters/ownModels/ownHeadModels.js - the Breton men's), THOSE are the
 *  pools, in place of the data's: every door that chooses a face - the NPC
 *  walk, the curated table, the measured match - chooses among them.
 *  WHERE THE ARCHIVES CARRY THEM. `has` is the
 *  archives' directory (fpArm.js archiveHas): the own pools stand only
 *  while every one of their meshes is in it, and the data's otherwise -
 *  the own archive is a chunk the page imports, and one that did not load
 *  left every Breton man with no head and no hair, notes and all, where
 *  the data's would have drawn. All or none: a pool half-present would
 *  walk a save's face onto another index. No `has` - a caller with no
 *  archives - reads the own as shipped. */
export function facePools(parts, race, female, { has = null, own: ownAsked = false } = {}) {
  const own = ownAsked ? ownFacePools(race, female) : null;   // the port's own heads are a player's alone - asked for
  if (own && (!has || [...own.heads, ...own.hairs].every((r) => has(`meshes/${r.model}`)))) return { heads: own.heads, hairs: own.hairs };
  const want = String(race || '').toLowerCase();
  const pool = (slot) => {
    const forSlot = (parts ?? []).filter((p) => p.race === want && p.slot === slot
      && p.skin && p.playable && !p.firstPerson);
    const sexed = forSlot.filter((p) => p.female === !!female);
    return (sexed.length ? sexed : forSlot.filter((p) => !p.female))
      .slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  };
  return { heads: pool('head'), hairs: pool('hair') };
}

/** The werewolf's head and hair: the BODY records `WerewolfHead` and `WerewolfHair`, looked up by id and nothing
 *  else (no race, sex, part or flag test; the actor's own head and hair are ignored), the last .esm to carry one
 *  winning (the load order). Third person only. Every other slot is empty for a werewolf, and the body is the
 *  robe's (mwItemMap composeWornArmor, a `record` piece). */
export const WEREWOLF_HEAD_ID = 'werewolfhead';
export const WEREWOLF_HAIR_ID = 'werewolfhair';
export function werewolfHeadRows(parts) {
  const lastRecordWithId = (wantedId) =>
    (parts ?? []).filter((part) => String(part.id || '').toLowerCase() === wantedId).at(-1) ?? null;
  return [
    { slot: 'head', record: lastRecordWithId(WEREWOLF_HEAD_ID) },
    { slot: 'hair', record: lastRecordWithId(WEREWOLF_HAIR_ID) },
  ];
}

/** THE CURATED FACE - mwFaceTable.json's judgement for a race, sex and portrait, `{ head, hair }` record ids,
 *  or null where the table holds none. One reading, for the rows that wear it and the match
 *  that stands down when it answers both halves. */
export const curatedFace = (race, female, faceIndex, faceTable = FACE_TABLE) =>
  faceTable?.[String(race || '').toLowerCase()]?.[female ? 'female' : 'male']?.[String(faceIndex | 0)] ?? null;

/** A BODY id keeps its raw case (the walk's sort order is the save-stable law), so a wanted id
 *  - the curated table's, or the matcher's raw-case verdict - is compared without it. */
export const poolRecord = (pool, id) => {
  const w = String(id || '').toLowerCase();
  return w ? pool.find((p) => String(p.id).toLowerCase() === w) ?? null : null;
};

/** Does the curated table answer BOTH halves of this face among these pools? Then no measured
 *  match is ever worn (playerBodyRows: the curated id wins wherever the pool carries it), and none is measured. */
export function curatedAnswersFace(pools, race, female, faceIndex, faceTable = FACE_TABLE) {
  const c = curatedFace(race, female, faceIndex, faceTable);
  return !!c && !!poolRecord(pools.heads, c.head) && !!poolRecord(pools.hairs, c.hair);
}

export function playerBodyRows(parts, race, female, { beast = false, faceIndex = 0, faceTable = FACE_TABLE, faceMatch = null, vampire = false, walk = null, has = null, ownHeads = false } = {}) {   // `vampire` the race's vampire head; `walk` an NPC's { head, hair }; `has` the archives' (facePools); `ownHeads` a player's - the port's own heads
  const want = String(race || '').toLowerCase();
  // The sweep slots resolve through resolveBodyParts (mwBodyParts.js): the last
  // matching record in load order wins, a male record fills a female's empty
  // slot, there is no vampire filter, and clavicle is not a sweep slot.
  const resolved = resolveBodyParts(parts, race, female, { firstPerson: false });
  const rows = [];
  for (const slot of SKIN_SWEEP_SLOTS) {
    const forSlot = parts.filter((p) => p.race === want && p.slot === slot
      && p.skin && p.playable && !p.firstPerson);
    const chosen = resolved.get(slot) ?? null;
    if (!chosen && slot === 'tail' && !beast) continue;
    rows.push({
      slot,
      record: chosen,
      verdict: chosen ? 'third-person record found' : 'NOTHING for this slot',
      counts: { all: forSlot.length },
    });
  }
  // Head and hair are not sweep slots: the actor's own record names them,
  // and the player's stand-in is the chargen face law below.
  //
  // THE CURATION TABLE. Mac's report: the
  // derived head and hair do not match the portrait - the modulo walk
  // is deterministic but it is not a LIKENESS, and a likeness is a
  // judgement no arithmetic makes. mwFaceTable.json holds the
  // judgements: race -> sex -> faceIndex -> { head, hair } record ids,
  // authored by eye. A curated id wins when the pool carries it; an id
  // the archives do not carry falls back to the walk (never traps),
  // and the row's verdict says which happened.
  const curated = curatedFace(race, female, faceIndex, faceTable);
  // The sex law, list-shaped: the matching sex's pool, else the male pool retail relies on, never a mix, or the
  // index would walk across sexes. The sort and the index are the face's law and no one else's. Head and hair sort
  // by id so a save's face survives any archive arrangement; the sweep slots above ride resolveBodyParts, whose
  // last-record-wins walk is untouched here. facePools is that law: the pools the matcher measured are the pools
  // walked here, by construction (the same `has`).
  const pools = facePools(parts, race, female, { has, own: ownHeads });
  for (const slot of ['head', 'hair']) {
    const sorted = slot === 'head' ? pools.heads : pools.hairs;
    let chosen = null;
    let how = null;
    // AN NPC'S OWN - its head and its hair walked each on its own off its seed (characters/wardrobe.js
    // npcFaceOf), over the same pools in the same order: no portrait is theirs to match, and the face index named one
    // pair of ten where a race carries its heads times its hairs
    const step = walk ? walk[slot] : null;
    if (sorted.length && Number.isInteger(step) && step >= 0) {
      chosen = sorted[step % sorted.length];
      how = 'walked for an NPC';
    } else if (sorted.length) {
      const wantId = curated ? String(curated[slot] || '').toLowerCase() : '';
      chosen = poolRecord(sorted, wantId);
      how = chosen ? 'curated' : null;
      // The MEASURED match sits between the
      // hand-curated table and the walk - a likeness computed from the
      // player's own data, named as such on the row.
      if (!chosen && faceMatch?.[slot]) {
        chosen = poolRecord(sorted, faceMatch[slot]);
        how = chosen ? 'matched to the portrait' : null;
      }
      if (!chosen) {
        chosen = sorted[((faceIndex % sorted.length) + sorted.length) % sorted.length];
        how = wantId ? `derived (curated "${wantId}" is not in these archives)` : 'derived';
      }
    }
    rows.push({
      slot,
      record: chosen,
      verdict: chosen ? (how ? `third-person record found, ${how}` : 'third-person record found') : 'NOTHING for this slot',
      counts: { all: sorted.length },   // the pool chosen among - the port's own where it stands
    });
  }
  // A vampire's face: the race's vampire head replaces the one walked and the hair stays the actor's own. A race
  // with no vampire head keeps the face as walked.
  const vamp = vampire ? vampireHeadRecord(parts, race, female) : null;
  if (vamp) {
    const row = rows.find((r) => r.slot === 'head');
    if (row) { row.record = vamp; row.verdict = 'third-person record found, a vampire\'s head'; }
  }
  return rows;
}

/** The vampire's head: the BODY record that is a vampire's, a skin and a head, of the sex and the race (ignoring
 *  case), the last in load order of those. NotPlayable is no bar (Morrowind's vampire heads are never offered at
 *  chargen). Null when the race has none. */
export function vampireHeadRecord(parts, race, female) {
  const raceId = String(race || '').toLowerCase();
  const vampireHeads = (parts ?? []).filter(
    (part) =>
      part.vampire && part.skin && part.slot === 'head' && !part.firstPerson && part.female === !!female && part.race === raceId,
  );
  return vampireHeads.at(-1) ?? null;
}

/** Is this mesh skinned, or rigid?
 *
 * The question the whole attach design rests on, asked of a real file. The design assumes that Morrowind's arms
 * are rigid meshes hung off a bone; if they are actually skinned, a rigid attach is wrong.
 *
 * This is a scan, not a parse, and it is named so. A Morrowind NIF (4.0.0.2) stores each record's type name as a
 * sized string immediately before the record and has no per-record sizes, which is why an unknown type is fatal
 * to a real reader: a full walk needs every record's layout. The type names are recoverable without that: a
 * uint32 length followed by that many bytes of a NIF type name is a pattern a mesh's other contents essentially
 * never produce.
 *
 * So this answers "does a NiSkinInstance appear in this file" with high confidence and answers nothing about
 * geometry, transforms or bones. It is a census, offered as a census.
 */
export function scanNifRecordTypes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const census = new Map();
  const NAME = /^[A-Z][A-Za-z0-9_]{2,39}$/;
  for (let i = 0; i + 4 < bytes.length; i++) {
    const len = dv.getUint32(i, true);
    if (len < 3 || len > 40 || i + 4 + len > bytes.length) continue;
    let ok = true;
    for (let j = i + 4; j < i + 4 + len; j++) {
      const c = bytes[j];
      if (c < 0x30 || c > 0x7a || (c > 0x39 && c < 0x41) || (c > 0x5a && c < 0x61 && c !== 0x5f)) { ok = false; break; }
    }
    if (!ok) continue;
    const name = latin1(bytes.subarray(i + 4, i + 4 + len));
    if (!NAME.test(name)) continue;
    // Morrowind's own vocabulary: almost everything is Ni*, plus a short
    // tail of engine markers. Anything else is far more likely to be a
    // coincidence in vertex data than a record type.
    if (!/^Ni/.test(name) && !['RootCollisionNode', 'AvoidNode'].includes(name)) continue;
    census.set(name, (census.get(name) || 0) + 1);
    i += 3 + len;
  }
  return census;
}

/** The verdict, with its own uncertainty attached. `skinned` is only ever
 *  true because a NiSkinInstance was SEEN - never inferred from absence of
 *  something else. */
export function skinVerdict(bytes) {
  const header = readNifHeader(bytes);
  if (!header.ok) return { ok: false, why: header.why };
  const census = scanNifRecordTypes(bytes);
  const skinInstances = census.get('NiSkinInstance') || 0;
  const shapes = (census.get('NiTriShape') || 0) + (census.get('NiTriStrips') || 0);
  return {
    ok: true,
    version: header.versionText,
    skinned: skinInstances > 0,
    skinInstances,
    shapes,
    census: [...census.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    method: 'record-type SCAN, not a parse - it can tell you a NiSkinInstance is present, nothing more',
  };
}

/** Where an arm slot's mesh actually lives in the archive: the record used for this actor, then its own MODL under
 *  meshes/. The first-person record carries its own mesh name; the path is never built by splicing `.1st` into a
 *  filename. */
export function armMeshPaths(rows) {
  return rows.map((row) => {
    const rec = row.firstPerson || row.thirdPersonFallback || null;
    return {
      slot: row.slot,
      record: rec ? rec.id : null,
      firstPerson: !!row.firstPerson,
      path: rec && rec.model ? `meshes/${rec.model}` : null,
    };
  });
}

/** Parse the mesh for real, and show it.
 *
 * The scan above answers "is there a NiSkinInstance" without parsing. This does the opposite: it runs the strict
 * reader (parseNif and flattenNif) over an actual arm mesh and hands back geometry a page can draw.
 *
 * It is allowed to fail, and saying so is the point. An unknown record type throws and kills the whole file,
 * because NIF has no per-record sizes to skip it by. A failure here is a fact about which records this file needs,
 * reported with the message, not swallowed into an empty view.
 */
export async function parseMeshForPreview(bytes) {
  let parseNif; let flattenNif;
  try {
    ({ parseNif } = await import('./mwNifFile.js'));
    ({ flattenNif } = await import('./mwNifMesh.js'));
  } catch (err) {
    return { ok: false, error: `reader unavailable: ${err.message}` };
  }
  let nif;
  try {
    nif = parseNif(bytes);
  } catch (err) {
    return { ok: false, stage: 'parse', error: err.message };
  }
  let batches;
  try {
    batches = flattenNif(nif);
  } catch (err) {
    return { ok: false, stage: 'flatten', error: err.message };
  }
  const shapes = batches.map((b) => ({
    positions: b.positions,
    indices: b.indices,
    skinned: !!(b.skinned && b.skin),
    vertices: b.positions ? b.positions.length / 3 : 0,
    triangles: b.indices ? b.indices.length / 3 : 0,
  })).filter((s) => s.vertices > 0 && s.triangles > 0);
  if (!shapes.length) return { ok: false, stage: 'geometry', error: 'parsed, but it carries no drawable geometry' };
  return {
    ok: true,
    shapes,
    vertices: shapes.reduce((n, s) => n + s.vertices, 0),
    triangles: shapes.reduce((n, s) => n + s.triangles, 0),
    skinnedShapes: shapes.filter((s) => s.skinned).length,
    bounds: meshBounds(shapes),
  };
}

/** Axis-aligned bounds over every shape, for framing a preview.
 *  Morrowind is Z-UP, so a front view is x across and z up. */
export function meshBounds(shapes) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const s of shapes) {
    const p = s.positions;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < minX) minX = p[i];
      if (p[i] > maxX) maxX = p[i];
      if (p[i + 1] < minY) minY = p[i + 1];
      if (p[i + 1] > maxY) maxY = p[i + 1];
      if (p[i + 2] < minZ) minZ = p[i + 2];
      if (p[i + 2] > maxZ) maxZ = p[i + 2];
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** PR-BOW1b: meshBounds' fold, PIECE BY PIECE - poseAssembly's
 *  one walk of the posed vertices. Each piece's own box is written onto the
 *  piece (`p.box`: one object the piece owns, living and dying with it and
 *  rewritten every pose, so a frame mints nothing), and the union is
 *  answered exactly as meshBounds answers it (null when nothing is finite).
 *  The third-person pass folds what it draws off these boxes
 *  (fpArm.js foldRangeBoxes) - walking every posed vertex a SECOND time,
 *  per body per frame, a walk the boxes save. */
export function foldPieceBounds(pieces) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const s of pieces) {
    const p = s.positions;
    let aX = Infinity; let aY = Infinity; let aZ = Infinity;
    let bX = -Infinity; let bY = -Infinity; let bZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]; const y = p[i + 1]; const z = p[i + 2];
      if (x < aX) aX = x; if (x > bX) bX = x;
      if (y < aY) aY = y; if (y > bY) bY = y;
      if (z < aZ) aZ = z; if (z > bZ) bZ = z;
    }
    const b = s.box || (s.box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
    b.minX = aX; b.minY = aY; b.minZ = aZ; b.maxX = bX; b.maxY = bY; b.maxZ = bZ;
    if (aX < minX) minX = aX; if (bX > maxX) maxX = bX;
    if (aY < minY) minY = aY; if (bY > maxY) maxY = bY;
    if (aZ < minZ) minZ = aZ; if (bZ > maxZ) maxZ = bZ;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Fit the bounds into a w x h box, front view (x across, z up, z flipped
 *  because canvas y grows downward). Returns a point mapper. Uniform
 *  scale - a per-axis fit would make a hand look correct while hiding
 *  proportions that are actually wrong. */
export function frontViewMapper(bounds, w, h, pad = 8) {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1e-6);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return (x, y, z) => [w / 2 + (x - cx) * scale, h / 2 - (z - cz) * scale];
}

/** Does your skeleton have the bones the attach table names?
 *
 * The table names bones such as "Right Hand", "Left Upper Arm" and "Weapon Bone". The lookup is
 * case-insensitive (lower-cased on both sides), and duplicate names resolve to the first in depth-first order.
 *
 * Until this report runs, no name has been checked against a skeleton in an actual archive. If a name is wrong,
 * every attach silently finds nothing and the rig draws an empty view, so ask the file.
 */
export async function skeletonReport(bytes) {
  let parseNif; let buildSkeleton;
  try {
    ({ parseNif } = await import('./mwNifFile.js'));
    ({ buildSkeleton } = await import('./mwSkin.js'));
  } catch (err) {
    return { ok: false, error: `reader unavailable: ${err.message}` };
  }
  let skel;
  try {
    skel = buildSkeleton(parseNif(bytes));
  } catch (err) {
    return { ok: false, stage: 'parse', error: err.message };
  }
  const names = [...skel.nodes.values()].map((n) => n.name).filter(Boolean);
  return {
    ok: true,
    boneCount: skel.nodes.size,
    names,
    // Lower-cased on both sides. The report must use the same comparison the binder does, or it answers a question
    // nobody asked.
    has: (name) => skel.byName.has(String(name).toLowerCase()),
  };
}

/** The bones a first-person arm actually needs, plus the two weapon bones chosen per weapon type. Names are given
 *  in Morrowind's own spelling; the lookup lowercases. */
export const FP_REQUIRED_BONES = Object.freeze([
  { name: 'Left Hand', why: 'hand, left side' },
  { name: 'Right Hand', why: 'hand, right side' },
  { name: 'Left Wrist', why: 'wrist, left side' },
  { name: 'Right Wrist', why: 'wrist, right side' },
  { name: 'Left Forearm', why: 'forearm, left side' },
  { name: 'Right Forearm', why: 'forearm, right side' },
  { name: 'Left Upper Arm', why: 'upper arm, left side' },
  { name: 'Right Upper Arm', why: 'upper arm, right side' },
  { name: 'Weapon Bone', why: 'every weapon type except the bow' },
  { name: 'Weapon Bone Left', why: 'the BOW, and only the bow' },
  { name: 'Bip01 Spine1', why: 'blend mask: Torso' },
  { name: 'Bip01 L Clavicle', why: 'blend mask: LeftArm' },
  { name: 'Bip01 R Clavicle', why: 'blend mask: RightArm' },
]);

/** Which of them this skeleton actually carries. A missing bone is
 *  reported as missing, never worked around - a silent fallback here is
 *  how an empty view gets called a working one. */
export function checkRequiredBones(report) {
  if (!report || !report.ok) return [];
  return FP_REQUIRED_BONES.map((b) => ({ ...b, present: report.has(b.name) }));
}

/** Assemble the arm.
 *
 * The first step that places parts relative to one another rather than examining them one at a time. Three rules
 * do the work:
 *
 *  - Skinned and rigid parts take completely different paths. A skinned part's geometry is skinned to the actor's
 *    skeleton and is never parented to a bone. A rigid part is placed at a bone.
 *  - A rigid part whose attach bone's name contains "Left" is drawn with x negated. One mesh serves both sides.
 *    Attaching the same mesh at both bones with no mirror makes the left hand a second right hand.
 *  - For a skinned part the bone name is also a geometry filter: a case-insensitive prefix match on the shape
 *    name with Morrowind's "Tri " convention stripped. That is how a skinned part picks its side, where a rigid
 *    one uses the mirror.
 *
 * This is one of two stages. This function binds only: parse, skeleton, the shape filter, the mirror, the attach
 * ref and the output buffers, none of which depend on time. It ends by calling poseAssembly once, so the rest
 * pose is "pose at t=0 with no tracks" rather than a second copy of the same arithmetic, which is what lets the
 * result be re-posed at all.
 */
/** The readers an assembly carries (`fns`), resolved once so its per-frame calls are synchronous. One home,
 *  the arm's and the creature's. */
async function assemblyFns(parseNif) {
  const mod = {};
  ({ parseNif: mod.parseNif } = await import('./mwNifFile.js'));
  // A caller's parse - fpArm.js's parseNifOnce, so a mesh one body parsed is the next body's parse. A parsed
  // NIF is never written after its read (flattenNif copies every array it transforms, and a skin's bones are fresh
  // objects over the parse's read-only lists), so one parse serves every assembly that binds it.
  if (parseNif) mod.parseNif = parseNif;
  ({ buildSkeleton: mod.buildSkeleton, poseSkeleton: mod.poseSkeleton,
    skeletonSpaceMatrices: mod.skelMats, skinBatch: mod.skinBatch,
    accumRootRef: mod.accumRootRef, trackBinding: mod.trackBinding,
    injectSkeletonNodes: mod.injectSkeletonNodes } = await import('./mwSkin.js'));
  ({ bindPart: mod.bindPart, attachmentTransform: mod.attachmentTransform, bindCreatureModel: mod.bindCreatureModel } = await import('./mwCharacter.js'));
  ({ PART_BONES: mod.PART_BONES } = await import('./mwNpc.js'));
  return mod;
}

export async function assembleFirstPersonArm({ skeletonBytes, parts, boneSources = [], parseNif = null, offWeaponBone = false }) {
  let mod;
  try {
    mod = await assemblyFns(parseNif);
  } catch (err) {
    return { ok: false, error: `readers unavailable: ${err.message}` };
  }

  let skeleton, skeletonFile;
  try {
    skeletonFile = mod.parseNif(skeletonBytes);
    skeleton = mod.buildSkeleton(skeletonFile);
  } catch (err) {
    return { ok: false, stage: 'skeleton', error: err.message };
  }
  const pieces = [];
  const notes = [];
  const effects = [];
  // The bone addons (extra skeleton files that bring extra bones) join the skeleton before any part binds, so a part
  // may attach at a bone an addon brought. Each is `{ name, bytes }`; a file that will not parse is a note, never the
  // assembly's refusal.
  const injected = [];
  for (const src of boneSources ?? []) {
    try {
      const r = mod.injectSkeletonNodes(skeleton, mod.parseNif(src.bytes));
      injected.push({ name: src.name, added: r.added, skipped: r.skipped });
    } catch (err) {
      notes.push(`bones: ${src.name}: ${err.message}`);
    }
  }
  // The left hand's weapon bone, asked for by the player's two rigs (`offWeaponBone`). A skeleton without a
  // "Weapon Bone Left", which is every retail one, takes one made by the mirror from its own Weapon Bone
  // (combat/twoHands/mirrorRig.js offWeaponBoneAddon), through the addons' own door and after them (an addon that
  // brings one is the skeleton's), before any part binds and before the mirror's plan is first read. A bow never
  // hangs on it: resolveWeaponParts looks for the weapon's bone in the actor's own skeleton bytes, which hold no
  // such bone in retail. The skeleton file itself rides along: its own skin (retail's Tri Shadow) is the frame the
  // hands are mirrored in.
  if (offWeaponBone) {
    const addon = offWeaponBoneAddon(skeleton, GRAPH_ROOT, mod.skelMats, skeletonFile);
    if (addon) {
      const r = mod.injectSkeletonNodes(skeleton, addon);
      injected.push({ name: WEAPON_BONE_LEFT_SOURCE, added: r.added, skipped: r.skipped });
    }
  }
  bindPartsInto({ pieces, notes, effects, skeleton, fns: mod }, parts);
  const assembly = {
    ok: pieces.length > 0,
    pieces,
    effects,   // the parts' particle systems, placed like their rigid shapes
    notes,
    skeleton,
    // The resolved readers ride along so the per-frame call is SYNCHRONOUS.
    // A dynamic import inside a requestAnimationFrame body is a promise per
    // frame; this function already paid for them once.
    fns: mod,
    bounds: null,
    injected,   // what each bone addon added
    skinBinds: offWeaponBone ? mirrorBindSources({ nif: skeletonFile }) : null,   // the skeleton file's own skins (retail's Tri Shadow), for the picture's mirror (mirrorBindsOf)
    error: pieces.length ? null : 'nothing bound - see the notes for why',
  };
  // THE REST POSE IS NOW "pose at t=0 with no tracks" - one home, and the
  // The pins keep seeing byte-identical numbers because they are the
  // same arithmetic, called once instead of inlined.
  return pieces.length ? poseAssembly(assembly) : assembly;
}

/**
 * A CREATURE, ASSEMBLED. Its model is its skeleton and its
 * body at once (one parse: the skeleton's refs ARE the shapes' parent refs), bound by mwCharacter.js
 * bindCreatureModel - the skinned shapes by their bones, each rigid shape riding its own node through the inverse of
 * that node's rest. The pieces are the arm's own shape (slot 'creature'), so the pose, the GPU skin, the upload and the
 * sprite tile take them as they take a body's; no part rule applies - nothing is worn, mirrored or offset.
 */
export async function assembleCreature({ modelBytes, parseNif = null }) {
  let mod;
  try {
    mod = await assemblyFns(parseNif);
  } catch (err) {
    return { ok: false, error: `readers unavailable: ${err.message}` };
  }
  let nif, skeleton;
  try {
    nif = mod.parseNif(modelBytes);
    skeleton = mod.buildSkeleton(nif);
  } catch (err) {
    return { ok: false, stage: 'skeleton', error: err.message };
  }
  const notes = [];
  let bound;
  try {
    bound = mod.bindCreatureModel(skeleton, nif);
  } catch (err) {
    return { ok: false, stage: 'assembly', error: err.message };
  }
  if (bound.missingBones.length) notes.push(`creature: its skin names no node ${bound.missingBones.map((b) => `"${b}"`).join(', ')} - those influences are skipped`);
  const pieces = [];
  // A creature lit by its own normals, as a person's parts are - a skinned piece's posed by
  // skinBatch, a rigid one's turned by its pre-transform once here and placed with its vertices each pose
  for (const batch of bound.skinned) {
    pieces.push({ slot: 'creature', bone: null, kind: 'skinned', mirrored: false, batch, source: null, attachRef: null,
      uvs: batch.uvs || null, colors: batch.colors || null, material: batch.material || null,
      positions: new Float32Array(batch.positions.length), indices: batch.indices, normals: posedNormals(batch) });
  }
  for (const { batch, attachRef, pre } of bound.rigid) {
    const normals = posedNormals(batch);
    pieces.push({ slot: 'creature', bone: null, kind: 'rigid', mirrored: false, tag: null, hang: null,
      batch: null, source: applyPre(batch.positions, pre), attachRef, boneOffset: null,
      uvs: batch.uvs || null, colors: batch.colors || null, material: batch.material || null, shape: batch.name || null,
      positions: new Float32Array(batch.positions.length), indices: batch.indices,
      sourceNormals: normals ? applyPreNormals(batch.normals, pre) : null, normals });
  }
  const effects = bound.effects.map(({ desc, attachRef, pre }) => ({ slot: 'creature', bone: null, mirrored: false, tag: null, hang: null,
    attachRef, boneOffset: null, pre, desc, material: desc.material }));
  const assembly = {
    ok: pieces.length > 0, pieces, effects, notes, skeleton, fns: mod, bounds: null, injected: [],
    dropped: bound.dropped,   // the Tri Bip shapes left out
    error: pieces.length ? null : 'the creature model has no shape to draw',
  };
  return pieces.length ? poseAssembly(assembly) : assembly;
}

/**
 * THE PART LOOP, callable on a LIVE assembly. The build calls it
 * once with every part; a weapon swap calls it again with just the new
 * weapon and arrow, through the very same bind, filter, mirror and note
 * paths - a second copy of any of those is how they drift apart. Mutates
 * `assembly.pieces` and `assembly.notes` in place.
 */
export function bindPartsInto(assembly, parts) {
  const mod = assembly.fns;
  const { skeleton, pieces, notes } = assembly;
  const effects = assembly.effects ?? (assembly.effects = []);   // the parts' particle systems
  // The weapon's own BoneOffset, kept for the ammunition that rides inside its mesh. resolveWeaponParts pushes
  // 'weapon' before 'arrow', so by the time the arrow binds this is the offset already applied one level above
  // ArrowBone. Null for every other part list and reset per call, so a body without a weapon cannot inherit a stale
  // one.
  let weaponBoneOffset = null;
  // The scabbard's offset, for what rides inside its file: the holstered weapon the base mesh stands in for and the
  // quiver's arrows are bare children of nodes in the scabbard's graph, so they wear the scabbard's transform
  // exactly as the arrow wears the weapon's.
  let sheathBoneOffset = null;
  for (const part of parts) {
    // `part.bones` overrides the table so a test can drive real assembly
    // against a fixture skeleton whose bone names are not Morrowind's.
    const bones = part.bones ?? mod.PART_BONES[part.slot] ?? [];
    // A worn model of the port's own is SKINNED FROM THE BODY under it (formats/morrowind/mwSkinTransfer.js) - it
    // moves by the body's own bones and binds, never by an attach node the body does not use.
    if (part.skinFrom) { bindSkinnedFromBody(assembly, part, bones); continue; }
    let nif;
    try {
      nif = mod.parseNif(part.bytes);
    } catch (err) {
      notes.push(`${part.slot}: ${err.message}`);
      continue;
    }
    // The nameless-shape extension binds ONCE for the part; a
    // NAMED shape binds once PER SIDE, filtered. See the block below.
    let tookNameless = false;
    const piecesBefore = pieces.length;
    let shapeCensus = null;
    for (const bone of bones.length ? bones : [null]) {
      if (bone && !skeleton.byName.has(bone.toLowerCase())) {
        notes.push(`${part.slot}: this skeleton has no bone "${bone}"`);
        continue;
      }
      let bound;
      try {
        bound = mod.bindPart(skeleton, nif, { ...(bone ? { attachBone: bone } : {}), underNode: part.underNode, excludeNode: part.excludeNode });   // a subtree of the file
      } catch (err) {
        notes.push(`${part.slot} @ ${bone}: ${err.message}`);
        continue;
      }
      const bonePiecesBefore = pieces.length;
      // A skipped influence draws wrong, not invisibly, so the card must say why a finger sags or a strip
      // collapses. One note per part, not per bone: the names are the same.
      if (bound.missingBones?.length) {
        const say = `${part.slot}: this skeleton has no bone `
          + `${bound.missingBones.map((b) => `"${b}"`).join(', ')} - `
          + 'those influences are skipped';
        if (!notes.includes(say)) notes.push(say);
      }
      shapeCensus ??= bound.skinned.map((b) => String(b.name || '').trim() || '(nameless)');

      // Skinned geometry carries its own bones, so it is never mirrored: it picks its side by the shape name. And
      // it binds once per side, not once per part.
      //
      // No `if (!tookSkinned)` latch wraps this block. Such a latch, raised by the first bone that yielded any
      // skinned batch, would break every two-bone slot, and every arm slot is one (`PART_BONES.hand = ['left hand',
      // 'right hand']`): it would emit the left hand and never ask for the right. The filter that exists precisely
      // to pick a side would run once and then be skipped, which on retail data is a one-handed arm.
      //
      // One body part has two slots, each side its own part reference at its own bone. Treating a part as one mesh
      // attached at two bones in one pass is the error, and the latch is the same error in another shape.
      //
      // A latch is still needed, but only for the port's own extension of that filter: a shape with no name matches
      // every bone (a strict prefix test would drop it), so a nameless one-shape part would bind at every side and
      // stack duplicates in the same place. That one binds once.
      //
      // Exception: the hair part attaches at the Head bone, but its geometry filter is the word "hair". Every other
      // slot filters on its bone name. The test is on the part's own name, never its display slot: a worn add's slot
      // reads "hair (record id)" (mwItemMap composeRefs) and would miss it, filtering a wig on the bone "head".
      const geomFilter = (part.partName ?? part.slot) === 'hair' ? 'hair' : bone;
      let namelessHere = false;
      for (const batch of bound.skinned) {
        const nameless = !String(batch.name || '').trim();
        if (nameless && tookNameless) continue;
        if (geomFilter && !shapeMatchesBone(batch.name, geomFilter)) continue;
        // The piece KEEPS its batch, and `positions` is its own
        // buffer - never an alias of batch.positions, which poseAssembly
        // reads every frame. Aliasing them makes each frame skin the previous
        // frame's output, and the pose runs away.
        pieces.push({ slot: part.slot, bone, kind: 'skinned', mirrored: false,
          batch, source: null, attachRef: null,
          // The UVs and the material ride WITH the piece. They
          // were reachable through `batch` for a skinned piece and lost
          // entirely for a rigid one (which keeps only its positions), so
          // the texture a Morrowind mesh names never reached the draw.
          uvs: batch.uvs || null, colors: batch.colors || null, material: batch.material || null,
          positions: new Float32Array(batch.positions.length), indices: batch.indices,
          normals: posedNormals(batch) });   // the mesh's own normals, skinned with it
        if (nameless) namelessHere = true;
      }
      tookNameless = tookNameless || namelessHere;

      // A rigid part is placed at the bone, once per side, with x negated on the left.
      //
      // The skinned-versus-rigid branch is decided per file, not per shape. One skinned geometry makes the whole
      // file a rig, and in a rig file only the skinned geometry is attached: an unskinned shape in it never takes
      // the rigid path's mirror or offset, and is drawn only as part of a copied rig ancestor's subtree, which this
      // flattened graph cannot express. So a rig file's rigid batches are noted and dropped rather than mirrored
      // into places the game never draws them.
      if (bound.attached.length && bound.skinned.length) {
        const say = `${part.slot}: ${bound.attached.length} unskinned shape(s) in a RIG file are not `
          + 'attached (only skinned geometry is attached in a rig file)';
        if (!notes.includes(say)) notes.push(say);
      } else if (bound.attached.length) {
        // The mirror is fixed here, at bind time, because it is a fact about the bone's name, not about the pose.
        // Re-deriving it per frame invites a pose-dependent mirror, which is a left hand that flips sides mid-clip.
        //
        // The test is on the resolved node's own name, case-sensitively. The requested name in the part table is
        // lowercase; the node the skeleton actually carries is what decides.
        const nodeRef = bone ? skeleton.byName.get(bone.toLowerCase()) : null;
        const nodeName = nodeRef != null && skeleton.nodes.has(nodeRef) ? skeleton.nodes.get(nodeRef).name : (bone || '');
        const mirror = nodeName.includes('Left');
        for (const batch of bound.attached) {
          const normals = posedNormals(batch);
          pieces.push({ slot: part.slot, bone, kind: 'rigid', mirrored: mirror, tag: part.tag ?? null,   // a part's own tag (the quiver slot's index)
            hang: part.hang ?? null,   // a part that HANGS from its bone (hangAffine) rather than riding it
            // A part instanced under a node INSIDE another part's
            // mesh (the arrow, under the bow's ArrowBone) carries that
            // node's whole chain. It is baked in ONCE here rather than
            // applied per frame, because it is a fact about two FILES and
            // not about the pose.
            batch: null, source: applyPre(batch.positions, part.preTransform), attachRef: bound.attachRef,
            // The part's own BoneOffset node, resolved once at bind time because it is a fact about the file.
            //
            // Ammunition never takes its own. The arrow mesh's own "BoneOffset" node is never searched for or
            // applied: the arrow is a bare child of its parent node, with no offset, attitude or mirror of its own.
            // Whatever the arrow ends up wearing, it wears because its parent wears it.
            //
            // So it takes the weapon's offset, though never its own. The parent is the ArrowBone node inside the
            // weapon mesh, and the weapon hangs from the actor's bone through one transform that carries the
            // weapon's BoneOffset position and the left-side mirror scale. Everything under ArrowBone inherits that
            // transform, the arrow included. Giving the arrow only preTransform (the weapon mesh's own
            // root-to-ArrowBone chain) left it displaced from the hand by exactly the weapon's offset, every time.
            //
            // Translation only, and that is exact. The offset node's rotation is never read, and the only rotation
            // a part can be given when it is attached is the light attitude, which is for held lights alone and
            // never for a weapon. So placeAtBone's bone x (offset + mirror(v)) is the whole transform: the
            // translation, no rotation, and the mirror scale.
            //
            // Only when it rides the weapon. preTransform is set exactly in the fallback case, where the arrow's
            // parent is the ArrowBone node inside the weapon mesh. When the actor's skeleton carries "Bip01
            // Arrow", the parent is that bone and the weapon is not in the chain at all, so inheriting its offset
            // there would be the same mistake pointing the other way.
            boneOffset: part.ammo
              ? (part.preTransform ? weaponBoneOffset : null)
              : part.bare
                ? (part.inheritOffsetFrom === 'sheath' ? sheathBoneOffset : null)   // a bare instance under the scabbard's node
                : (bound.boneOffset || null),
            uvs: batch.uvs || null, colors: batch.colors || null, material: batch.material || null,
            // The file and the batch's chain, for a part whose own controllers move it on the weapon clock
            // (formats/morrowind/mwPartClock.js posePartBatch) - the weapon's slots alone, so no other part keeps its parsed
            // file alive; and, for a part instanced under a node of ANOTHER file (the arrow under the bow's
            // ArrowBone), that file and node with the part's own vertices before the node's chain - so the node can
            // move it. Nothing is copied: references to what the walk already made.
            clip: WEAPON_CLOCK_SLOTS.has(part.slot) ? { nif, batch } : null,
            preClip: part.preClip ? { ...part.preClip, local: batch.positions, localNormals: batch.normals ?? null } : null,
            positions: new Float32Array(batch.positions.length), indices: batch.indices,
            // The mesh's own normals, turned as its vertices are - the pre-transform once, here, and the
            // bone and the mirror each frame (placeNormalsAtBone)
            sourceNormals: normals ? applyPreNormals(batch.normals, part.preTransform) : null, normals });
        }
        // The part's particle systems ride the same placement its rigid shapes do (the bone, the mirror, the bone
        // offset and the part's pre-transform), because they were authored in the same file at the same origin. A
        // torch's flame is one. They are kept apart from the pieces (a piece is a triangle list; this is a law and
        // a clock) on `assembly.effects`, which combat/fpArm.js runs and draws. Only a rigid part carries them: a
        // skinned file's particles would follow a bone this flattener does not track.
        for (const desc of bound.effects ?? []) {
          effects.push({
            slot: part.slot, bone, mirrored: mirror, tag: part.tag ?? null, hang: part.hang ?? null,   // a hanging part's flame hangs with it
            attachRef: bound.attachRef, boneOffset: bound.boneOffset || null, pre: part.preTransform || null,
            desc, material: desc.material,
          });
        }
        // The weapon's offset, held for the ammunition that
        // rides inside its mesh. Only the weapon's - a shield or a body
        // part must not lend the arrow anything.
        if (part.slot === 'weapon') weaponBoneOffset = bound.boneOffset || null;
        if (part.slot === 'sheath') sheathBoneOffset = bound.boneOffset || null;
      }
      // The silent hole. A bone whose every named skinned shape fails the shape filter would bind nothing and say
      // nothing: the card would read "on - N pieces" with a side simply absent from the arm, which is both the
      // missing-hand hole and the one-handed defect in a new shape. If this bone gained no piece and the part had
      // named shapes to offer, the note lists them against the filter. (A nameless shape skipped by the
      // once-per-part latch is correct and stays silent: `named` is empty for it.)
      if (pieces.length === bonePiecesBefore && bone) {
        const named = bound.skinned
          .map((b) => String(b.name || '').trim())
          .filter((s) => s);
        // No attached-geometry guard: rigid geometry always binds, so
        // reaching here with no new piece already means attached was
        // empty - a guard on it would be a branch no fixture can take.
        if (named.length) {
          notes.push(`${part.slot} @ ${bone}: no shape matched - the mesh offers `
            + `${named.map((s) => `"${s}"`).join(', ')} (the shape filter is a `
            + 'case-insensitive prefix, "tri " stripped first)');
        }
      }
    }
    // And a part that contributed nothing AT ALL with geometry in hand
    // (both sides missed, or an empty mesh) is one sentence, not a hole.
    if (pieces.length === piecesBefore && shapeCensus && !shapeCensus.length) {
      notes.push(`${part.slot}: nothing bound - the mesh has no geometry to bind`);
    }
  }
}

/**
 * Pose the assembly. The one home for everything that changes when time does, and the reason
 * assembleFirstPersonArm's return value can be re-posed at all.
 *
 * What is recomputed here, and nothing else:
 *   - the pose (one poseSkeleton over the whole skeleton);
 *   - the skeleton-space matrices, memoised per skeleton root. The assembly had been walking the chain once per
 *     skinned batch; the distinct roots are what the walk actually depends on, and on an arm that is one.
 *   - per skinned piece: skinBatch into the piece's own buffer;
 *   - per rigid piece: the attachment affine, which now carries the bone's animated rotation, so rigid parts move
 *     too. A stage that re-skinned the skinned half and left the rigid half at rest would draw a hand that
 *     animates inside a cuff that does not.
 *
 * What is not recomputed, because it is a fact about the files and not about time: the parse, the skeleton, the
 * bind, the shape filter, the mirror, the attach ref, the output buffers, and the draw mapper. A mapper that
 * follows the per-frame bounds renormalises the picture every frame and hides the very motion this stage exists
 * to show.
 *
 * Mutates `assembly` in place and returns it.
 */
/** The slots whose own controllers run on the weapon clock: the weapon's (they follow the weapon's animation time)
 *  and the arrow instanced under a node of it. Every other part's controllers run on the lower body's clock, which
 *  this port does not drive. */
export const WEAPON_CLOCK_SLOTS = Object.freeze(new Set(['weapon', 'arrow']));

/**
 * THE WEAPON MOVES ON ITS OWN CLOCK. Before a pose, every rigid weapon piece whose file's controllers move
 * it is re-posed at `value` (the weapon group's playhead, from the group's start for a ranged weapon -
 * WeaponAnimationTime), and the arrow under the bow's ArrowBone takes the node where the clock has it - the arrow
 * drawn to the string and loosed off it, as the mesh carries it. `frameTime` is an AutoPlay node's clock. A file with
 * nothing that moves keeps its rest pose untouched. Written in place: a rigid piece's source is its own bind's
 * flattened copy, and the pose reads the file's own vertices (`batch.local`), never it. Answers how many pieces moved.
 */
export function posePartClocks(assembly, value, { frameTime = value, slots = WEAPON_CLOCK_SLOTS } = {}) {
  let moved = 0;
  for (const p of assembly.pieces ?? []) {
    if (p.kind !== 'rigid' || !slots.has(p.slot)) continue;
    // A part whose clock reads the time it was last posed at stands where that pose put it - an idle or a
    // sheathed bow's clock holds still (WeaponAnimationTime answers its group's playhead, or 0), so it is neither posed
    // again nor counted, and a GPU body re-streams nothing for it
    if (p.preClip) {
      const t = nodeClockAt(p.preClip.nif, p.preClip.node, value, frameTime);
      if (t === null || t === p._clockAt) continue;
      const pre = nodeAffineAt(p.preClip.nif, p.preClip.node, t);
      writePre(p.preClip.local, pre, p.source);
      if (p.sourceNormals && p.preClip.localNormals) writePreNormals(p.preClip.localNormals, pre, p.sourceNormals);
      p._clockAt = t;
      p.sourceGen = (p.sourceGen | 0) + 1;   // the GPU stream re-streams this piece's corners (mwGpuSkin.js restreamMovedRows)
      moved++;
    } else if (p.clip && batchMoves(p.clip.nif, p.clip.batch)) {
      const t = clockFor(p.clip.batch.animFlags | 0, value, frameTime);
      if (t === p._clockAt) continue;
      posePartBatch(p.clip.nif, p.clip.batch, t, p.source, p.sourceNormals);
      p._clockAt = t;
      p.sourceGen = (p.sourceGen | 0) + 1;
      moved++;
    }
  }
  return moved;
}

export function poseAssembly(assembly, { tracks = null, sampleTrack = null,
  time = 0, accumRoot = null, neckPitch = 0, neckAim = 0, neckOffset = null, climb = null, skin = true, mirror = null, run = null, motion = null, aim = null } = {}) {
  const { fns, skeleton, pieces } = assembly;
  if (!fns || !skeleton) return assembly;
  // An arm mirrored across the picture is mirrored by the binds of the skins it wears (mirrorBindsOf)
  if (mirror?.plane && mirror.plane.binds === undefined) mirror.plane.binds = mirrorBindsOf(assembly);
  const pose = fns.poseSkeleton(skeleton, tracks, sampleTrack, time, { accumRoot });
  // THE SECOND HAND - an arm, or the whole body, as the mirror of another
  // (combat/twoHands/mirrorRig.js), straight over the clip's pose and under every law that follows it (the neck's look, the
  // climb's hands): a left-hand blow, a second weapon held up. An arm read from ANOTHER clip (`clip`: the idle under a
  // blow) is posed here, on this skeleton, at that clip's own time.
  assembly.mirrored = mirror ? applyMirrorRig(skeleton, pose, GRAPH_ROOT, fns.skelMats, mirrorWithPoses(mirror, fns, skeleton, accumRoot)) : null;
  // One space: every piece (skinned, rigid, and the camera node) is posed in the same space, the full graph below
  // the Skeleton group with the root node's own transform included. Memoising matrices per declared skin root and
  // placing rigid pieces relative to the file root gives two spaces that coincide exactly when every declared root
  // is the root and the root's transform is identity: true of every fixture, false of retail data, where the
  // difference is a hand floating away from its forearm.
  pitchNeck(skeleton, pose, GRAPH_ROOT, fns.skelMats, neckPitch, neckAim, neckOffset);
  // The third person's ranged aim: the spine turns over the clip's pose, after the animation and under the body
  // motion, which keeps the clip's chest while the clip has the arms.
  assembly.aimFit = aim ? aim(skeleton, pose, GRAPH_ROOT, fns.skelMats) : null;
  // Body motion (characters/bodyMotion/bodyMotion.js, the third-person body's): the gait, the carry and a blow's body
  // solved over the clip's pose - after the mirror (a pair's arm is the layer's to place) and UNDER the run, the climb
  // and the seat, which still win the bones they ask for
  assembly.motionFit = motion ? motion(skeleton, pose, GRAPH_ROOT, fns.skelMats) : null;
  // The running hands' reach (combat/fpArm.js firstRun), by the climb's own solver and UNDER the
  // climb's request - each at its own weight: the climb eases every wrist on from where the run put it, so the two
  // blend (no choosing: a run easing out as a climb or a sheet comes in is still drawn, never dropped whole)
  assembly.runFit = run ? applyClimbRig(skeleton, pose, GRAPH_ROOT, fns.skelMats, run) : null;
  // The climb's pose over the clip's - the hands on the stone, the feet on the wall - solved on THIS skeleton's
  // own bones (combat/climbRig.js) in the same graph space, before any piece is placed on it
  assembly.climbFit = climb ? applyClimbRig(skeleton, pose, GRAPH_ROOT, fns.skelMats, climb) : null;
  const mats = fns.skelMats(skeleton, pose, GRAPH_ROOT);
  // `skin: false` - THE GPU SKIN'S POSE. The skeleton is posed and
  // its matrices kept exactly as below, and the pieces are NOT: the vertex
  // shader blends them from the palette (mwGpuSkin.js writeSkinPalette), so
  // their CPU positions and the fold over them are left as they stood, and
  // `cpuSkinned` says so - the palette's own boxes stand in for the fold.
  assembly.cpuSkinned = skin !== false;
  if (!assembly.cpuSkinned) {
    assembly.pose = pose;
    assembly.mats = mats;
    assembly.time = time;
    // The stowed gear goes with the cloak on this pose too - the follow reads the cloak where
    // the pose puts it and hands each turned piece's placement to the palette (formats/morrowind/mwCloakFit.js applyCloakFollow)
    if (assembly.afterPose) assembly.afterPose(assembly);
    return assembly;
  }
  for (const p of pieces) {
    if (p.kind === 'skinned') {
      fns.skinBatch(p.batch, skeleton, pose, mats, p.positions, p.normals ?? null);   // and its normals
    } else {
      const at = fns.attachmentTransform(mats, p.attachRef);
      const placed = p.hang ? hangAffine(at, p.hang) : at;
      placeAtBone(p.source, placed, p.mirrored, p.positions, p.boneOffset);
      if (p.normals && p.sourceNormals) placeNormalsAtBone(p.sourceNormals, placed, p.mirrored, p.normals);
    }
  }
  assembly.pose = pose;
  // The rig-space transform of every node, kept so the camera node's translation can be read without re-posing the
  // skeleton.
  assembly.mats = mats;
  assembly.time = time;
  // What the assembly's owner places after every piece is posed - the stowed gear that goes with the
  // cloak (formats/morrowind/mwCloakFit.js followCloak), which reads the cloak where this pose just put it
  if (assembly.afterPose) assembly.afterPose(assembly);
  assembly.bounds = pieces.length ? foldPieceBounds(pieces) : null;   // PR-BOW1b: and each piece's own box, in the same walk
  return assembly;
}

/** The skins an assembly's picture mirror is read by - the skeleton file's own
 *  (`skinBinds`, kept at assembly) and its skinned pieces' (combat/twoHands/mirrorRig.js mirrorBindSources) - read once
 *  for each set of pieces it holds. */
function mirrorBindsOf(assembly) {
  const n = assembly.pieces?.length ?? 0;
  if (assembly.mirrorBinds?.n !== n) assembly.mirrorBinds = { n, binds: [...(assembly.skinBinds ?? []), ...mirrorBindSources({ pieces: assembly.pieces })] };
  return assembly.mirrorBinds.binds;
}

/** A mirror request's arms read from another clip (`limbs.X.clip` - { tracks, sampleTrack, time }) posed into
 *  the pose maps combat/twoHands/mirrorRig.js reads (`limbs.X.pose`) - for the one arm each reads and nothing else:
 *  no need to sample the whole skeleton for an arm's eleven bones (mirrorRig.js limbSkeleton). */
function mirrorWithPoses(req, fns, skeleton, accumRoot) {
  if (!req.limbs) return req;
  const limbs = {};
  for (const side of ['L', 'R']) {
    const l = req.limbs[side];
    if (!l) continue;
    limbs[side] = l.clip && !l.pose
      ? { ...l, pose: fns.poseSkeleton(limbSkeleton(skeleton, GRAPH_ROOT, fns.skelMats, side, l), l.clip.tracks, l.clip.sampleTrack, l.clip.time, { accumRoot }) }
      : l;
  }
  return { ...req, limbs };
}

/**
 * A part that hangs. Every other rigid part rides its bone: the bone's whole transform, rotation and all, is its
 * placement (placeAtBone). A lantern hooked to a belt does not: it hangs plumb from the hook whatever the pelvis
 * is doing, and swings about it. So a part carrying a `hang` takes, instead of the bone's affine:
 *
 *   the hook   - a point fixed to the bone (`hookLocal`, in the bone's own frame), so it follows the hip's walk
 *   the anchor - the point of the part that hangs from the hook (`anchor`, in the part's placed coordinates:
 *                after its attitude, the mirror and the bone offset - hangAnchor measures it once, at bind)
 *   the attitude - `rot`, a rig-space 3x3 the part's owner writes each frame (plumb, times the swing)
 *   the size   - `size`, a uniform scale about the anchor its owner sets once at bind (a lantern made
 *                for a street or a hand, hung at a belt lantern's height - combat/fpArm.js hipLanternSize); 1 unset
 *
 * and the answer is an affine placeAtBone takes like any other: v -> rot * size * (v - anchor) + hook. The rig
 * space is the actor's own (Z up), so plumb there is plumb in the world: the body only turns in yaw. The result is
 * written into the hang's own scratch, so the per-frame path allocates nothing. (A normal under the size is
 * renormalised as a bone's scale is: placeNormalsAtBone, and the skin shader's.)
 */
export function hangAffine(at, hang) {
  const out = hang._at ?? (hang._at = { a: new Float32Array(9), t: [0, 0, 0] });
  const s = hang.size > 0 ? hang.size : 1, r = hang.rot, A = out.a;
  for (let i = 0; i < 9; i++) A[i] = r[i] * s;
  const k = hang.hookLocal ?? ZERO3, n = hang.anchor ?? ZERO3, a = at.a;
  const hx = a[0] * k[0] + a[1] * k[1] + a[2] * k[2] + at.t[0];
  const hy = a[3] * k[0] + a[4] * k[1] + a[5] * k[2] + at.t[1];
  const hz = a[6] * k[0] + a[7] * k[1] + a[8] * k[2] + at.t[2];
  out.t[0] = hx - (A[0] * n[0] + A[1] * n[1] + A[2] * n[2]);
  out.t[1] = hy - (A[3] * n[0] + A[4] * n[1] + A[5] * n[2]);
  out.t[2] = hz - (A[6] * n[0] + A[7] * n[1] + A[8] * n[2]);
  return out;
}
const ZERO3 = Object.freeze([0, 0, 0]);

/** Where a hanging part hangs FROM - the top of its placed shapes, centred: the ring a lantern's handle
 *  ends in on any mesh authored Z-up, wherever its author put the origin. Measured over EVERY rigid piece the
 *  part bound (they share the one `hang`), so its shapes hang as one. Writes `hang.anchor` - and `hang.height`, the
 *  shapes' own from that top to their foot, in the same units - and answers the anchor. */
export function hangAnchor(pieces, hang) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pieces ?? []) {
    if (p.hang !== hang || !p.source) continue;
    const o = p.boneOffset;
    for (let v = 0; v < p.source.length; v += 3) {
      const x = (p.mirrored ? -p.source[v] : p.source[v]) + (o ? o[0] : 0);
      const y = p.source[v + 1] + (o ? o[1] : 0);
      const z = p.source[v + 2] + (o ? o[2] : 0);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  hang.anchor = Number.isFinite(maxZ) ? [(minX + maxX) / 2, (minY + maxY) / 2, maxZ] : [0, 0, 0];
  hang.height = Number.isFinite(maxZ) ? maxZ - minZ : 0;
  return hang.anchor;
}

/** A rig-space offset from a bone's REST position, as the point fixed to that bone (hangAffine's
 *  `hookLocal`) - so a hook placed "a hand's breadth out from the pelvis, in the actor's own axes" is written in
 *  the axes a reader can check against the skeleton, and rides the bone's own frame from then on. Null when the
 *  skeleton has no such bone. */
export function hookOnBone(assembly, boneName, offset) {
  const { fns, skeleton } = assembly ?? {};
  const ref = skeleton?.byName?.get(String(boneName).toLowerCase());
  if (!fns || ref === undefined) return null;
  const rest = fns.skelMats(skeleton, fns.poseSkeleton(skeleton, null, null, 0, {}), GRAPH_ROOT).get(ref);
  if (!rest) return null;
  const inv = invert33(rest.a);
  if (!inv) return null;
  return [
    inv[0] * offset[0] + inv[1] * offset[1] + inv[2] * offset[2],
    inv[3] * offset[0] + inv[4] * offset[1] + inv[5] * offset[2],
    inv[6] * offset[0] + inv[7] * offset[1] + inv[8] * offset[2],
  ];
}
function invert33(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-12)) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

/** One row per assembled piece, for the page's table and the probe's readback, so neither invents its own summary
 *  of the same data and the two can disagree.
 *
 *  Keyed by slot and bone. Every arm slot is two-boned (one body part has two slots), so a key of slot alone
 *  collides on exactly the case this stage exists to show. Bounds are per piece, not the assembly's, which is
 *  what makes a left/right mix-up readable in a table as well as on the canvas. */
export function armPieceRows(pieces) {
  return (pieces ?? []).map((p) => ({
    key: `${p.slot} @ ${p.bone ?? '(no bone)'}`,
    slot: p.slot,
    bone: p.bone ?? null,
    kind: p.kind,
    mirrored: !!p.mirrored,
    // The bone offset, on the card: a part placed at its bone's bare origin and one placed at its authored offset
    // are the same picture until you know which you are looking at.
    boneOffset: p.boneOffset || null,
    vertices: p.positions ? p.positions.length / 3 : 0,
    triangles: p.indices ? p.indices.length / 3 : 0,
    bounds: meshBounds([p]),
  }));
}

/**
 * Bind a garment skinned from the body. `part.skinFrom` lists the body parts it is fitted over (the player's own
 * skin meshes, `{ slot, bones?, bytes }`); each is bound exactly as the body binds it (a skinned shape by the
 * shape filter per bone, a rigid one at its bone with the mirror and the bone offset) and the garment copies their
 * skins (formats/morrowind/mwSkinTransfer.js), solved against the skeleton's rest pose. A garment with no body
 * under it is a note and is not drawn: floating free of the body is exactly the failure this exists to end.
 *
 * `part.fitTo` names the body part the garment hides (the cuirass hides the chest), and the garment is first moved
 * onto the wearer, its top to that part's top, measured in the same rest pose (fitLift), rather than trusted to
 * sit where the modeller's scene put it. That scene's body stood lower than this one, and the brigandine drawn at
 * the scene's height left the chest it hides bare. With no such part, the garment keeps its baked height and a
 * note says so.
 */
function bindSkinnedFromBody(assembly, part, bones) {
  const mod = assembly.fns;
  const { skeleton, pieces, notes } = assembly;
  let nif;
  try { nif = mod.parseNif(part.bytes); } catch (err) { notes.push(`${part.slot}: ${err.message}`); return; }
  const sources = [];
  const slotOf = new Map();   // which body part each source is, for the fit
  for (const src of part.skinFrom) {
    let srcNif;
    try { srcNif = mod.parseNif(src.bytes); } catch (err) { notes.push(`${part.slot}: body ${src.slot}: ${err.message}`); continue; }
    let tookNameless = false;
    for (const bone of src.bones ?? mod.PART_BONES[src.slot] ?? []) {
      if (!skeleton.byName.has(bone.toLowerCase())) continue;
      let bound;
      try { bound = mod.bindPart(skeleton, srcNif, { attachBone: bone }); } catch { continue; }
      for (const b of bound.skinned) {
        const nameless = !String(b.name || '').trim();
        if (nameless ? tookNameless : !shapeMatchesBone(b.name, bone)) continue;
        if (nameless) tookNameless = true;
        sources.push(b);
        slotOf.set(b, src.slot);
      }
      if (bound.skinned.length) continue;   // a rig file's rigid shapes are not drawn, so they are no body
      const ref = skeleton.byName.get(bone.toLowerCase());
      const mirrored = (skeleton.nodes.get(ref)?.name ?? '').includes('Left');
      for (const b of bound.attached) {
        const skin = sourceSkin(b, { attachRef: bound.attachRef, mirrored, boneOffset: bound.boneOffset || null });
        sources.push(skin);
        slotOf.set(skin, src.slot);
      }
    }
  }
  if (!sources.length) {
    notes.push(`${part.slot}: no body part to skin it from (${part.skinFrom.map((x) => x.slot).join(', ') || 'none named'}) - not drawn`);
    return;
  }
  let garment;
  try { garment = mod.bindPart(skeleton, nif, bones[0] ? { attachBone: bones[0] } : {}); } catch (err) { notes.push(`${part.slot}: ${err.message}`); return; }
  const pose = mod.poseSkeleton(skeleton, null, null, 0, {});
  const ctx = { skeleton, pose, mats: mod.skelMats(skeleton, pose, GRAPH_ROOT), skinBatch: mod.skinBatch };
  let worn = [...garment.attached, ...garment.skinned];
  // ONTO THE WEARER FIRST - its top to the top of the part it hides - and only then skinned from the body
  // there, so every vertex copies the skin of the body it now actually covers.
  if (part.fitTo) {
    const fit = fitLift(worn, sources.filter((s) => slotOf.get(s) === part.fitTo), ctx);
    if (fit) {
      worn = worn.map((g) => liftBatch(g, fit.lift));
      notes.push(`${part.slot}: fitted to the ${part.fitTo} - moved ${fit.lift >= 0 ? 'up' : 'down'} ${Math.abs(fit.lift).toFixed(1)} `
        + `(its top from ${fit.top.toFixed(1)} to the ${part.fitTo}'s top at ${fit.anchorTop.toFixed(1)})`);
    } else {
      notes.push(`${part.slot}: no ${part.fitTo} to fit it to - drawn at its baked height`);
    }
  }
  for (const g of worn) {
    for (const batch of transferSkin(g, sources, ctx)) {
      pieces.push({ slot: part.slot, bone: bones[0] ?? null, kind: 'skinned', mirrored: false,
        batch, source: null, attachRef: null,
        uvs: batch.uvs || null, colors: null, material: batch.material || null,
        positions: new Float32Array(batch.positions.length), indices: batch.indices,
        normals: posedNormals(batch) });   // the garment's own normals, carried through its transferred skin
    }
  }
}

/** Bake a part's pre-transform into its authored vertices. Null
 *  is the common case and returns the array untouched, so nothing pays
 *  for a feature it does not use. */
function applyPre(positions, pre) {
  if (!pre) return positions;
  const out = new Float32Array(positions.length);
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v]; const y = positions[v + 1]; const z = positions[v + 2];
    out[v] = pre.a[0] * x + pre.a[1] * y + pre.a[2] * z + pre.t[0];
    out[v + 1] = pre.a[3] * x + pre.a[4] * y + pre.a[5] * z + pre.t[1];
    out[v + 2] = pre.a[6] * x + pre.a[7] * y + pre.a[8] * z + pre.t[2];
  }
  return out;
}

/** The shape filter: a case-insensitive prefix match on the shape name, with Morrowind's "Tri " convention
 *  stripped first. A shape with no name matches everything, because a nameless shape in a one-shape part file is
 *  the part. */
export function shapeMatchesBone(shapeName, bone) {
  const name = String(shapeName || '').trim().toLowerCase();
  if (!name) return true;
  const prefix = String(bone).toLowerCase();
  const nameWithoutTri = name.startsWith('tri ') ? name.slice('tri '.length) : name;
  return name.startsWith(prefix) || nameWithoutTri.startsWith(prefix);
}

/** The mirror, alone and directly testable: place a rigid part's vertices at a bone, mirroring x first when the
 *  part is going on the left.
 *
 *  Extracted because the mirror could not be reached end to end: no fixture skeleton carries a bone whose name
 *  contains "left", so an assembly test never took this branch and three mutants survived a full sweep. A rule
 *  that cannot be exercised is not pinned, whatever the test output says.
 */
export function placeAtBone(positions, at, mirror, out = new Float32Array(positions.length), offset = null) {
  // The bone offset rides the same transform as the mirror, and the order is that of a translate-rotate-scale
  // transform (T * R * S): the mirror scales the vertex, the offset translates the result, and only then does the
  // bone place it. Adding the offset before the mirror would negate its x on every left-hand part, the bow among
  // them.
  const ox = offset ? offset[0] : 0;
  const oy = offset ? offset[1] : 0;
  const oz = offset ? offset[2] : 0;
  for (let v = 0; v < positions.length; v += 3) {
    const x = (mirror ? -positions[v] : positions[v]) + ox;
    const y = positions[v + 1] + oy;
    const z = positions[v + 2] + oz;
    out[v] = at.a[0] * x + at.a[1] * y + at.a[2] * z + at.t[0];
    out[v + 1] = at.a[3] * x + at.a[4] * y + at.a[5] * z + at.t[1];
    out[v + 2] = at.a[6] * x + at.a[7] * y + at.a[8] * z + at.t[2];
  }
  return out;
}

/**
 * A rigid part's normals, placed as its vertices are (placeAtBone): mirrored with them (x negated: a reflection
 * takes a normal to the reflected surface's normal, so no flip follows) and turned by the bone. The bone offset is
 * a translation and leaves a normal alone. Renormalised, so a bone's uniform scale does not dim the light.
 */
export function placeNormalsAtBone(normals, at, mirror, out = new Float32Array(normals.length)) {
  const a = at.a;
  for (let v = 0; v < normals.length; v += 3) {
    const x = mirror ? -normals[v] : normals[v];
    const y = normals[v + 1];
    const z = normals[v + 2];
    const nx = a[0] * x + a[1] * y + a[2] * z;
    const ny = a[3] * x + a[4] * y + a[5] * z;
    const nz = a[6] * x + a[7] * y + a[8] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[v] = nx / len; out[v + 1] = ny / len; out[v + 2] = nz / len;
  }
  return out;
}

/** The posed-normal buffer a piece of this batch carries - one normal per vertex, or null for a mesh that
 *  authored none (packFpArm then lights it by its faces, as every mesh was before). */
function posedNormals(batch) {
  return batch.normals && batch.normals.length === batch.positions.length ? new Float32Array(batch.normals.length) : null;
}

/** A part's pre-transform applied to its normals - turned, never moved. */
/** ApplyPre into a buffer the piece owns - the per-frame form. */
function writePre(positions, pre, out) {
  for (let v = 0; v + 2 < positions.length && v + 2 < out.length; v += 3) {
    const x = positions[v]; const y = positions[v + 1]; const z = positions[v + 2];
    out[v] = pre.a[0] * x + pre.a[1] * y + pre.a[2] * z + pre.t[0];
    out[v + 1] = pre.a[3] * x + pre.a[4] * y + pre.a[5] * z + pre.t[1];
    out[v + 2] = pre.a[6] * x + pre.a[7] * y + pre.a[8] * z + pre.t[2];
  }
}
/** ApplyPreNormals into a buffer the piece owns. */
function writePreNormals(normals, pre, out) {
  for (let v = 0; v + 2 < normals.length && v + 2 < out.length; v += 3) {
    const x = normals[v]; const y = normals[v + 1]; const z = normals[v + 2];
    const nx = pre.a[0] * x + pre.a[1] * y + pre.a[2] * z;
    const ny = pre.a[3] * x + pre.a[4] * y + pre.a[5] * z;
    const nz = pre.a[6] * x + pre.a[7] * y + pre.a[8] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[v] = nx / len; out[v + 1] = ny / len; out[v + 2] = nz / len;
  }
}

function applyPreNormals(normals, pre) {
  if (!pre) return normals;
  const out = new Float32Array(normals.length);
  for (let v = 0; v < normals.length; v += 3) {
    const x = normals[v]; const y = normals[v + 1]; const z = normals[v + 2];
    const nx = pre.a[0] * x + pre.a[1] * y + pre.a[2] * z;
    const ny = pre.a[3] * x + pre.a[4] * y + pre.a[5] * z;
    const nz = pre.a[6] * x + pre.a[7] * y + pre.a[8] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[v] = nx / len; out[v + 1] = ny / len; out[v + 2] = nz / len;
  }
  return out;
}

/**
 * The clip, read and reported. One summary the page renders and the probe reads back, so the two cannot invent
 * different accounts of the same file.
 *
 * `binding` is the field that earns its place. poseSkeleton answers an unmatched bone with its rest transform, so a
 * .kf keyed to bones this skeleton does not have poses nothing and draws a clean, static, entirely plausible arm.
 * That failure is invisible in a picture and invisible in a pixel count; it is only ever visible as a sentence.
 *
 * `tracks[].rotationType` is the second: it says how much of a player's real file rides KEY_TYPE.constant, whose
 * sampler this tree holds at the previous key rather than flipping at the segment midpoint. That is a different
 * member with no fixture, deliberately not touched here, but a player looking at their own data deserves to see
 * how much of it is affected rather than being told nothing.
 *
 * `legacy` is parseAnimGroups' answer to the same question, carried so the page can show both. On the fixture they
 * disagree by construction: the listing reports Idle [1.00 -> 0.50], a range that runs backwards, while the clip
 * law reads [1.00 -> 3.00].
 */

export async function clipReport({ kfBytes, skeleton = null, group = 'Idle', clipOpts = {} } = {}) {
  const mod = {};
  try {
    ({ parseNif: mod.parseNif } = await import('./mwNifFile.js'));
    // mwAnim.js is this module's own static import (above): a dynamic import of it split nothing off and only
    // made the build warn - its readers are here whatever the others' load does
    Object.assign(mod, { collectTextKeys, normalizeTextKeys, clipGroups, resetClip, parseAnimGroups, extractTracks });
    ({ trackBinding: mod.trackBinding, accumRootRef: mod.accumRootRef } = await import('./mwSkin.js'));
  } catch (err) {
    return { ok: false, error: `readers unavailable: ${err.message}` };
  }
  if (!kfBytes || !kfBytes.length) {
    return { ok: false, error: 'no animation file - the archive carries no first-person .kf' };
  }
  let nif;
  try {
    nif = mod.parseNif(kfBytes);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const rawKeys = mod.collectTextKeys(nif);
  const keys = mod.normalizeTextKeys(rawKeys);
  const tracks = mod.extractTracks(nif);
  const clip = mod.resetClip(keys, group, clipOpts);
  const legacyRaw = mod.parseAnimGroups(rawKeys).get(group);
  const channels = (t) => ({
    rotation: (t.rotationKeys?.length ?? 0) || (t.xyzRotations ? -1 : 0),
    translation: t.translations?.keys?.length ?? 0,
    scale: t.scales?.keys?.length ?? 0,
  });
  return {
    ok: true,
    header: readNifHeader(kfBytes),
    rawKeys,
    keys,
    groups: mod.clipGroups(keys),
    group,
    clip,
    // The default loopStopTime is +Infinity, and JSON turns that into null on its way through a page evaluation.
    // The boolean is what survives the trip, so a probe never asserts on a null it cannot read.
    loopStopFinite: !!clip.ok && Number.isFinite(clip.loopStopTime),
    legacy: legacyRaw
      ? { start: legacyRaw.start, stop: legacyRaw.stop,
        loopStart: legacyRaw.loopStart, loopStop: legacyRaw.loopStop }
      : null,
    tracks: [...tracks.entries()].map(([bone, t]) => ({
      bone,
      channels: channels(t),
      rotationType: t.rotationType,
      translationType: t.translations?.type ?? 0,
      startTime: t.startTime,
      stopTime: t.stopTime,
      frequency: t.frequency,
      phase: t.phase,
    })),
    binding: skeleton ? mod.trackBinding(skeleton, tracks) : null,
    accumRoot: skeleton ? mod.accumRootRef(skeleton, tracks) : null,
    trackMap: tracks,
  };
}

/** The draw mapper's bounds, over the WHOLE clip rather than one
 *  frame. A mapper recomputed per frame renormalises the picture every
 *  time the arm moves, which cancels out exactly the motion this stage
 *  exists to show - the arm would appear to hold still while its numbers
 *  changed underneath. Sample, union, fix the mapper once. */
/** The sample times to measure an arm's REACH over - every clip
 *  every source carries, not the idle alone. A clip is a start/stop
 *  pair in a source's text keys; each is sampled at a fixed count, so
 *  the cost is bounded by the data's own clip count and a rig with one
 *  animation costs exactly what it did before. Falls back to the idle's
 *  own span when a source carries no readable pairs, so a rig this
 *  cannot read is measured no worse than it was. */
export function clipSweepTimes(sources, idleState, { perClip = 9 } = {}) {
  const spans = [];
  for (const so of sources ?? []) {
    // A source's keys are normalizeTextKeys' ARRAY of {time,text} - the
    // port's one text-key shape (mwAnim.js:"export function normalizeTextKeys"), handed over by clipReport.
    const keys = so?.keys;
    if (!Array.isArray(keys)) continue;
    const starts = new Map();
    for (const k of keys) {
      const time = k?.time;
      const n = String(k?.text ?? '').toLowerCase();
      const i = n.lastIndexOf(': ');
      if (i < 0) continue;
      const group = n.slice(0, i);
      const word = n.slice(i + 2);
      if (word.endsWith('start')) starts.set(`${group}|${word.slice(0, -5)}`, time);
      else if (word.endsWith('stop')) {
        const from = starts.get(`${group}|${word.slice(0, -4)}`);
        if (from != null && time > from) spans.push([from, time]);
      }
    }
  }
  if (!spans.length) {
    const a = idleState?.startTime ?? 0;
    const b = idleState?.stopTime ?? a;
    return Array.from({ length: 25 }, (_, i) => a + ((b - a) * i) / 24);
  }
  const out = [];
  for (const [a, b] of spans) {
    for (let i = 0; i < perClip; i++) out.push(a + ((b - a) * i) / (perClip - 1));
  }
  return out;
}

export function clipUnionBounds(assembly, poseAt, times) {
  let acc = null;
  for (const t of times ?? []) {
    poseAt(t);
    const b = assembly.bounds;
    if (!b) continue;
    acc = acc ? {
      minX: Math.min(acc.minX, b.minX), minY: Math.min(acc.minY, b.minY), minZ: Math.min(acc.minZ, b.minZ),
      maxX: Math.max(acc.maxX, b.maxX), maxY: Math.max(acc.maxY, b.maxY), maxZ: Math.max(acc.maxZ, b.maxZ),
    } : { ...b };
  }
  return acc;
}

/** Preserve the item's shape within an animation class, after material and archive
 * availability. An absent equivalent keeps the existing fallback. Retail uses Wakizashi
 * in record IDs, while Daggerfall's template enum spells it Wakazashi. And the two
 * axes cross - a Daggerfall Battle Axe is Morrowind's war axe shape, its War Axe the battle axe. */
const DF_TO_MW_SHAPE = Object.freeze({ wakazashi: 'wakizashi', battleaxe: 'waraxe', waraxe: 'battleaxe' });
export function dfWeaponShape(item, weaponsTable) {
  if (!item || item.werecreatureClaws) return null;
  const name = Object.keys(weaponsTable ?? {}).find((key) => weaponsTable[key] === item.templateIndex);
  const shape = name ? name.toLowerCase().replace(/[^a-z]/g, '') : null;
  return shape ? (DF_TO_MW_SHAPE[shape] ?? shape) : null;
}
