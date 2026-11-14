// The tables and small rules behind a worn body: which skeleton node each armour and clothing part hangs on, which
// skin each part hides, which parts a robe or a skirt occupies, how garments rank against each other, and how a
// shield and a part group find their body parts. The composer that uses them is mwItemMap.js (composeWornArmor).
//
// The part list is the INDX enum of an ARMO or CLOT record (UESP, "Morrowind Mod:Mod File Format/ARMO"). It has
// 27 sided entries: it is not the 15 unsided entries of a BODY record's part byte, and the two must not be mixed.
// The bone of each part is the name of the part node in the retail base skeleton (base_anim.nif), which is the
// part's own name with a capital letter (Right Upper Arm, Left Knee, Shield Bone, Tail).

/** One entry of the ARMO/CLOT part enum. */
export interface PartRow {
  name: string;
  /** The skeleton node the part's mesh hangs on, lower-cased; none for the weapon, which the weapon code owns. */
  bones: string[];
  /** The skin slot the part hides (a sided slot is `slot:side`), or null when it hides none. */
  shadows: string | null;
}

/** [name, bone, shadow]: a null bone is the weapon's. */
const PART_LIST: [string, string | null, string | null][] = [
  ['head', 'head', 'head'],
  ['hair', 'head', 'hair'],
  ['neck', 'neck', 'neck'],
  ['cuirass', 'chest', 'chest'],
  ['groin', 'groin', 'groin'],
  // A skirt and a pauldron hide no skin of their own: they layer over the groin and the clavicle.
  ['skirt', 'groin', null],
  ['right hand', 'right hand', 'hand:right'],
  ['left hand', 'left hand', 'hand:left'],
  ['right wrist', 'right wrist', 'wrist:right'],
  ['left wrist', 'left wrist', 'wrist:left'],
  ['shield', 'shield bone', null],
  ['right forearm', 'right forearm', 'forearm:right'],
  ['left forearm', 'left forearm', 'forearm:left'],
  ['right upper arm', 'right upper arm', 'upperarm:right'],
  ['left upper arm', 'left upper arm', 'upperarm:left'],
  ['right foot', 'right foot', 'foot:right'],
  ['left foot', 'left foot', 'foot:left'],
  ['right ankle', 'right ankle', 'ankle:right'],
  ['left ankle', 'left ankle', 'ankle:left'],
  ['right knee', 'right knee', 'knee:right'],
  ['left knee', 'left knee', 'knee:left'],
  ['right upper leg', 'right upper leg', 'upperleg:right'],
  ['left upper leg', 'left upper leg', 'upperleg:left'],
  ['right pauldron', 'right clavicle', null],
  ['left pauldron', 'left clavicle', null],
  ['weapon', null, null],
  ['tail', 'tail', 'tail'],
];

export const ARMO_PART: readonly PartRow[] = Object.freeze(
  PART_LIST.map(([name, bone, shadows]) => ({ name, bones: bone === null ? [] : [bone], shadows })),
);

const partIndex = (name: string): number => PART_LIST.findIndex((row) => row[0] === name);

/** The index of the shield part. */
export const SHIELD_PART = partIndex('shield');

const indexesOf = (names: string[]): number[] => names.map(partIndex);

/**
 * The parts a long garment occupies whether or not it has a mesh there: it hides the skin under it and any
 * lesser garment. A robe drapes over the torso, the arms down to the forearm and the legs down to the knee; a
 * skirt over the groin and the upper legs.
 */
export const RESERVES = Object.freeze({
  robe: indexesOf([
    'groin',
    'skirt',
    'right upper leg',
    'left upper leg',
    'right upper arm',
    'left upper arm',
    'right knee',
    'left knee',
    'right forearm',
    'left forearm',
    'cuirass',
  ]),
  skirt: indexesOf(['groin', 'right upper leg', 'left upper leg']),
});

// ---- the priority law --------------------------------------------------------

/**
 * Every part slot is claimed by priority: the bare skin holds it at 1, and a garment claims it at
 * `(base + 1) * 2`, plus one for armour. So armour beats clothing at the same base, a robe (base 11) beats a
 * cuirass (base 0), and a skirt (base 3) beats trousers. A claim wins only when it is strictly greater, so at a tie the
 * piece that claimed first keeps the slot.
 */
const RESERVE_BASE: Record<string, number> = { robe: 11, skirt: 3 };

export function garmentPriority(reserve: string | null | undefined, isArmor: boolean): number {
  const base = (reserve && RESERVE_BASE[reserve]) || 0;
  return (base + 1) * 2 + (isArmor ? 1 : 0);
}

/**
 * The order the pieces of one figure are claimed in. A tie goes to the first claimant, so the layers that sit
 * outermost are walked first: robe, skirt, helm, cuirass, greaves, the two pauldrons, boots, gauntlets, shirt, the
 * other clothing, and last what is carried.
 */
const LAYERS = [
  'robe',
  'skirt',
  'helm',
  'cuirass',
  'greaves',
  'left pauldron',
  'right pauldron',
  'boots',
  'gauntlets',
  'shirt',
  'clothing',
  'carried',
] as const;

export type Layer = (typeof LAYERS)[number];

export const layerRank = (layer: Layer): number => LAYERS.indexOf(layer);

// ---- body-part ladders ----------------------------------------------------------

/** A BODY record, as the worn code reads it. */
export interface BodyRecord {
  id?: string;
  model?: string;
  /** 0 skin, 1 clothing, 2 armour: the kind of garment the body part is for. */
  bodyKind?: number;
  slot?: string;
}

/** One part reference of an ARMO or CLOT record: the part, and the BODY record id for a man and for a woman. */
export interface PartReference {
  part: number;
  male?: string | null;
  female?: string | null;
}

export interface WornRecord {
  id?: string;
  model?: string;
  parts?: PartReference[];
}

/**
 * The mesh a shield draws. The shield's part reference names a BODY record, the woman's when she has one and
 * otherwise the man's (a man never reads the woman's). A named body part that is missing or is not an armour part
 * means the shield is hidden on purpose: the slot is reserved with no mesh, and the answer is null. A named
 * armour body part with a model wins. A record with no usable shield reference draws the item's own ground model.
 */
export function shieldMeshOf(
  armo: WornRecord,
  female: boolean,
  bodyById: Map<string, BodyRecord>,
  notes: string[],
): { model?: string; recordId: string | null; ground?: true } | null {
  for (const reference of armo.parts ?? []) {
    if (reference.part !== SHIELD_PART) continue;
    const id = female && reference.female ? reference.female : reference.male;
    if (!id) continue;
    const body = bodyById.get(id);
    if (!body || body.bodyKind !== 2) {
      notes.push(
        `${armo.id}: shield body "${id}" ${!body ? 'is in no BODY record' : 'is not armor-kind'} - the slot is held empty`,
      );
      return null;
    }
    if (body.model) return { model: body.model, recordId: id };
  }
  return { model: armo.model, recordId: null, ground: true };
}

/** One part reference with the part row it fills and the body part found for it. */
export interface PartPick {
  ref: PartReference;
  row: PartRow;
  body: BodyRecord | null;
}

/**
 * The body part each reference of a record wears. For a woman the reference's woman's id is tried first, then the
 * man's; a man reads only the man's. In the first person each id is looked for with the suffix ".1st" (the arm
 * meshes made for the first-person camera); failing that, the plain record answers only for the parts the first
 * person draws (`firstPersonParts`: hand, wrist, forearm and upper arm). A reference nothing answers has body null:
 * its slot is held with no mesh. The weapon and an index outside the enum are skipped.
 */
export function partGroupPicks(
  record: WornRecord | null | undefined,
  bodyById: Map<string, BodyRecord>,
  female: boolean,
  firstPerson: boolean,
  firstPersonParts: ReadonlySet<string>,
): PartPick[] {
  const suffix = firstPerson ? '.1st' : '';
  const find = (id: string | null | undefined): BodyRecord | null => {
    if (!id) return null;
    const found = bodyById.get(`${id}${suffix}`);
    if (found) return found;
    if (!firstPerson) return null;
    const plain = bodyById.get(id);
    return plain && plain.slot !== undefined && firstPersonParts.has(plain.slot) ? plain : null;
  };
  const picks: PartPick[] = [];
  for (const ref of record?.parts ?? []) {
    const row = ARMO_PART[ref.part];
    if (!row || row.name === 'weapon') continue;
    const body = (female && ref.female ? find(ref.female) : null) ?? find(ref.male);
    picks.push({ ref, row, body: body && body.model ? body : null });
  }
  return picks;
}
