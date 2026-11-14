// What a sheathed weapon looks like on the third-person body, and where each piece of it comes from. The vendored
// scabbard mod ships the art: a skeleton add-on (animations/xbase_anim/xbase_anim_sh.nif) with one marked node
// per weapon kind, and a scabbard mesh `<weapon>_sh.nif` for each of 71 weapons. The files fix the rules below:
//
//   - The add-on's nodes are named "Bip01 <kind>": one for each kind of weapon that is carried on the body. A thrown
//     weapon has a bone too, for a scabbard or a quiver that holds the stack, but the weapon itself is never drawn on
//     it.
//   - A scabbard file holds a node called "Bip01 Weapon" where the blade sits, and a bow's or a quiver's scabbard
//     holds a node called "Bip01 Ammo" with one child per round, "Bip01 Ammo 0", "Bip01 Ammo 1" and so on.
//   - Some scabbards leave the weapon node empty. Their author moved the blade's place without shipping the blade, so
//     the weapon's own mesh is drawn at the node's transform.
//
// The pieces are rigid parts for the binder that the weapon in the hand uses, and each is bare: no bone offset and no
// mirror, because nothing of the holster is a left-hand part. The skeleton is third person only, since the first
// person skeleton has no add-on.
//
// The code that reads the nodes out of a parsed mesh lives in mwCharacter.js, which this file must not import (it
// reaches the net layer, whose types the Node type pass does not have). The caller passes the three node readers it
// needs as `NodeReader`.

import { MW_WEAPON_TYPE, ammoTypeFor } from '../formats/morrowind/mwWeaponAnim.js';

const KIND = MW_WEAPON_TYPE;

/**
 * The bone of the add-on for each weapon kind. A kind's bone is "Bip01 " and the kind's name, except for three: the
 * add-on calls the two-handed long blade and the two-handed axe "Close", like the blunt and the spear that are carried
 * the same way, and it hangs the one-handed axe on the long blade's bone (it has an axe bone of its own at the same
 * place, which stays unused).
 */
const BONE_NAME_OVERRIDES: Record<string, string> = {
  LongBladeTwoHand: 'LongBladeTwoClose',
  AxeTwoHand: 'AxeTwoClose',
  AxeOneHand: 'LongBladeOneHand',
};

const CARRIED_KINDS = [
  'ShortBladeOneHand',
  'LongBladeOneHand',
  'LongBladeTwoHand',
  'BluntOneHand',
  'BluntTwoClose',
  'BluntTwoWide',
  'SpearTwoWide',
  'AxeOneHand',
  'AxeTwoHand',
  'MarksmanBow',
  'MarksmanCrossbow',
  'MarksmanThrown',
] as const;

export const SHEATHING_BONE: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(CARRIED_KINDS.map((name) => [KIND[name], `Bip01 ${BONE_NAME_OVERRIDES[name] ?? name}`])),
);

/** The scabbard file's named nodes. */
export const SHEATH_WEAPON_NODE = 'Bip01 Weapon';
export const SHEATH_AMMO_NODE = 'Bip01 Ammo';

/** The piece slots a holster rig hides by: the holster shows while sheathed, the others always. */
export const HOLSTER_SLOTS: readonly string[] = Object.freeze(['holster', 'sheath', 'quiver']);

/** Whether the weapon itself is drawn on the body when sheathed: a thrown weapon is a stack, so it never is. */
export const holsters = (weaponKind: number): boolean =>
  SHEATHING_BONE[weaponKind] != null && weaponKind !== KIND.MarksmanThrown;

/** `meshes/w/w_saber.nif` becomes `meshes/w/w_saber_sh.nif`: the suffix goes before the extension, if there is one. */
export function sheathedMeshPath(model: string | null | undefined): string {
  const path = String(model || '');
  if (!path) return '';
  const extensionAt = path.lastIndexOf('.');
  const hasExtension = extensionAt > path.lastIndexOf('/');
  return hasExtension ? `${path.slice(0, extensionAt)}_sh${path.slice(extensionAt)}` : `${path}_sh`;
}

/** The folder of add-ons for a skeleton model: `meshes/xbase_anim.nif` has its add-ons in `animations/xbase_anim/`. */
export function animationsDirOf(model: string | null | undefined): string {
  let path = String(model || '')
    .replace(/\\/g, '/')
    .toLowerCase();
  if (path.startsWith('meshes/')) path = `animations/${path.slice('meshes/'.length)}`;
  const extensionAt = path.lastIndexOf('.');
  if (extensionAt > path.lastIndexOf('/')) path = path.slice(0, extensionAt);
  return `${path}/`;
}

/** A source of file names: a .bsa lists through `list()`, the loose and the vendored files through `names`. */
export interface NameSource {
  list?: () => string[];
  names?: string[];
}

/**
 * Every .nif the archives hold under the add-on folder of the base skeleton and then under the folder of the actor's
 * own skeleton, the base first, each once. A source that lists nothing offers nothing.
 */
export function boneSourcesFor(
  baseModel: string,
  skeletonPath: string,
  archives: NameSource[] | null | undefined,
): string[] {
  const folders = [animationsDirOf(baseModel)];
  const ownFolder = animationsDirOf(skeletonPath);
  if (ownFolder !== folders[0]) folders.push(ownFolder);
  const found: string[] = [];
  const seen = new Set<string>();
  for (const folder of folders) {
    for (const archive of archives ?? []) {
      const listed = typeof archive.list === 'function' ? archive.list() : (archive.names ?? []);
      for (const entry of listed) {
        const name = String(entry).replace(/\\/g, '/').toLowerCase();
        if (!name.startsWith(folder) || !name.endsWith('.nif') || seen.has(name)) continue;
        seen.add(name);
        found.push(name);
      }
    }
  }
  return found;
}

/** The archive paths that `holsterPartsFor` reads, for one preload: the scabbard, and nothing else. */
export function holsterPartPaths({ weaponModel }: { weaponModel?: string | null }): string[] {
  return weaponModel ? [sheathedMeshPath(`meshes/${weaponModel}`)] : [];
}

/**
 * Whether a holster slot is hidden. The holster shows while the hand is empty. The scabbard always shows. The quiver
 * always shows, but its last slot empties while a round is on the string: `tag` is the part's { i, n }. Any other slot
 * is not the holster's, and the answer is null.
 */
export function holsterHidden(
  slot: string | null,
  weaponShown: unknown,
  { arrowShown = false, tag = null }: { arrowShown?: unknown; tag?: { i: number; n: number } | null } = {},
): boolean | null {
  if (slot === 'holster') return !!weaponShown;
  if (slot === 'sheath') return false;
  if (slot === 'quiver') return !!(arrowShown && tag && tag.i === tag.n - 1);
  return null;
}

/** `vendor/<mod>/Data Files/Meshes/w/x_sh.nif` becomes `meshes/w/x_sh.nif`, the key the loose store uses. */
export function vendoredDataPath(file: string): string {
  const path = String(file).replace(/\\/g, '/').toLowerCase();
  const rootAt = path.indexOf('data files/');
  return rootAt >= 0 ? path.slice(rootAt + 'data files/'.length) : path.slice(path.lastIndexOf('/') + 1);
}

// ---- the holster's parts ------------------------------------------------------------

/** A parsed scabbard mesh, which this file only hands to the node readers. */
type ParsedNif = object;

/** What the holster needs of a node: its child record numbers (a negative number is no child). */
export interface NodeRecord {
  children?: number[];
  name?: string;
}

/** The readers of a parsed mesh that the caller passes in. */
export interface NodeReader<Nif extends ParsedNif> {
  /** The first node called `name`, or null. */
  findNode(nif: Nif, name: string): { rec: NodeRecord } | null;
  /** The node's transform, from the mesh root to the node, or null when the mesh has no such node. */
  transformOf(nif: Nif, name: string): unknown;
  /** The record behind a child number. */
  recordAt(nif: Nif, ref: number): NodeRecord | null;
}

/** An archive holding a loaded path. */
export interface HolsterArchive {
  get(path: string): Uint8Array;
}

export interface HolsterInput<Nif extends ParsedNif> {
  mwType: number | null | undefined;
  weaponModel: string | null | undefined;
  /** The weapon's own mesh, already read by the weapon code. */
  weaponBytes: Uint8Array | null | undefined;
  /** The equipped ammunition: its mesh and its kind. */
  ammo?: { bytes: Uint8Array | null; type: number } | null;
  /** How many rounds there are. A full quiver is asked for with `Number.MAX_SAFE_INTEGER`. */
  ammoCount?: number;
  find: (path: string) => HolsterArchive | null;
  /** Whether the skeleton, after its add-ons, has this bone. */
  hasBone: (name: string) => boolean;
  parseNif: (bytes: Uint8Array) => Nif;
}

/** One rigid piece of the holster, for the binder that attaches the weapon in the hand. */
export interface HolsterPart {
  slot: string;
  bones: string[];
  bytes: Uint8Array;
  excludeNode?: string;
  underNode?: string;
  preTransform?: unknown;
  bare: true;
  inheritOffsetFrom?: string;
  tag?: { i: number; n: number };
}

export interface HolsterInfo {
  bone: string;
  reason?: string;
  scabbard?: string | null;
  weaponNode?: boolean;
  weaponNodeEmpty?: boolean;
  quiver?: number;
  thrown?: boolean;
}

export interface HolsterResult {
  parts: HolsterPart[];
  info: HolsterInfo | null;
  notes: string[];
}

const childCount = (record: NodeRecord): number => (record.children ?? []).filter((ref) => ref >= 0).length;

/**
 * The holster's pieces for a body. With no skeleton bone for the weapon kind there are none. With no scabbard file,
 * the weapon's own mesh hangs at the bone while sheathed (and a thrown weapon hangs nothing). A scabbard without a
 * weapon node stands whole whatever the hand holds. A scabbard with one stands without it, and the weapon node's own
 * children are drawn under it while the weapon is sheathed, or the weapon's mesh is drawn at the node when the node is
 * empty. If the scabbard has an ammunition node, the equipped ammunition of the right kind is drawn once at each of
 * its children, as many as there are rounds.
 *
 * A mesh node that is a shape (a geometry record) does not count as the weapon node: the node readers do not find it,
 * and the scabbard stands whole.
 */
export function holsterPartsFor<Nif extends ParsedNif>(
  input: HolsterInput<Nif>,
  nodes: NodeReader<Nif>,
): HolsterResult {
  const { mwType, weaponModel, weaponBytes, ammo = null, ammoCount = 0, find, hasBone, parseNif } = input;
  const notes: string[] = [];
  const parts: HolsterPart[] = [];
  if (mwType == null || mwType === KIND.None || !weaponModel || !weaponBytes) return { parts, info: null, notes };
  const bone = SHEATHING_BONE[mwType];
  if (!bone) return { parts, info: null, notes };

  const weaponShown = holsters(mwType);
  const thrown = !weaponShown;
  if (!hasBone(bone)) {
    notes.push(
      `holster: this skeleton has no "${bone}" - no bone addon (animations/xbase_anim/xbase_anim_sh.nif) was found`,
    );
    return { parts, info: { bone, reason: 'no sheathing bone' }, notes };
  }

  const bareWeapon = (): HolsterPart => ({ slot: 'holster', bones: [bone], bytes: weaponBytes, bare: true });
  const scabbardPath = sheathedMeshPath(`meshes/${weaponModel}`);
  const archive = find(scabbardPath);
  if (!archive) {
    if (weaponShown) parts.push(bareWeapon());
    return { parts, info: { bone, scabbard: null, weaponNode: false, thrown }, notes };
  }

  const scabbardBytes = archive.get(scabbardPath).slice();
  let scabbard: Nif;
  try {
    scabbard = parseNif(scabbardBytes);
  } catch (error) {
    notes.push(`holster: ${scabbardPath}: ${(error as Error).message}`);
    if (weaponShown) parts.push(bareWeapon());
    return { parts, info: { bone, scabbard: null, weaponNode: false, thrown }, notes };
  }

  const weaponNode = nodes.findNode(scabbard, SHEATH_WEAPON_NODE);
  if (!weaponNode) {
    parts.push({ slot: 'sheath', bones: [bone], bytes: scabbardBytes, bare: true });
    return { parts, info: { bone, scabbard: scabbardPath, weaponNode: false, thrown }, notes };
  }

  parts.push({ slot: 'sheath', bones: [bone], bytes: scabbardBytes, excludeNode: SHEATH_WEAPON_NODE, bare: true });
  const weaponNodeChildren = childCount(weaponNode.rec);
  if (weaponShown && weaponNodeChildren > 0) {
    parts.push({ slot: 'holster', bones: [bone], bytes: scabbardBytes, underNode: SHEATH_WEAPON_NODE, bare: true });
  } else if (weaponShown) {
    parts.push({
      slot: 'holster',
      bones: [bone],
      bytes: weaponBytes,
      preTransform: nodes.transformOf(scabbard, SHEATH_WEAPON_NODE),
      bare: true,
      inheritOffsetFrom: 'sheath',
    });
  }

  const quiver = quiverParts(scabbard, bone, mwType, ammo, ammoCount, nodes);
  parts.push(...quiver);
  return {
    parts,
    info: {
      bone,
      scabbard: scabbardPath,
      weaponNode: true,
      weaponNodeEmpty: weaponNodeChildren === 0,
      quiver: quiver.length,
      thrown,
    },
    notes,
  };
}

/**
 * One instance of the ammunition at each ammunition slot of the scabbard, up to the number of rounds. A thrown weapon
 * is its own ammunition. A slot's tag holds its number and the count, so that the rig can empty the last slot while a
 * round is on the string.
 */
function quiverParts<Nif extends ParsedNif>(
  scabbard: Nif,
  bone: string,
  mwType: number,
  ammo: HolsterInput<Nif>['ammo'],
  ammoCount: number,
  nodes: NodeReader<Nif>,
): HolsterPart[] {
  const ammoNode = nodes.findNode(scabbard, SHEATH_AMMO_NODE);
  if (!ammoNode || !ammo?.bytes) return [];
  const fits = mwType === KIND.MarksmanThrown ? mwType : ammoTypeFor(mwType);
  if (fits === KIND.None || ammo.type !== fits) return [];

  const slots = (ammoNode.rec.children ?? []).filter((ref) => ref >= 0);
  // Not `| 0`: a full quiver is asked for with Number.MAX_SAFE_INTEGER, which that would wrap.
  const rounds = Math.min(Math.max(0, Math.floor(Number(ammoCount) || 0)), slots.length);
  const out: HolsterPart[] = [];
  for (let at = 0; at < rounds; at++) {
    const name = nodes.recordAt(scabbard, slots[at])?.name || `${SHEATH_AMMO_NODE} ${at}`;
    out.push({
      slot: 'quiver',
      bones: [bone],
      bytes: ammo.bytes,
      preTransform: nodes.transformOf(scabbard, name),
      bare: true,
      inheritOffsetFrom: 'sheath',
      tag: { i: at, n: rounds },
    });
  }
  return out;
}
