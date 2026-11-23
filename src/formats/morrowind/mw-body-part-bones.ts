// Which skeleton node an unskinned body part hangs on. A BODY record names its part with one byte (UESP, "Morrowind
// Mod:Mod File Format/BODY"): head, hair, neck, chest, groin, hand, wrist, forearm, upper arm, foot, ankle, knee, upper
// leg, clavicle, tail. The retail base skeleton (base_anim.nif) has one node for each part, named for it with capital
// letters (Head, Neck, Chest, Groin, Tail, and Left and Right before the name of a sided part: Left Upper Arm), so the
// node of a part is the part's own name. The one exception is hair, which has no node and hangs on the head.
//
// A sided part has one mesh per side in the skeleton and the table lists the left node first.
//
// Node names are lower case, as the track map and the skeleton's name table key them.

/** Part names whose node is the part's own name and which have a left and a right node. */
const SIDED_PARTS = [
  'hand',
  'wrist',
  'forearm',
  'upper arm',
  'foot',
  'ankle',
  'knee',
  'upper leg',
  'clavicle',
] as const;

/** Part names with a single node. */
const SINGLE_PARTS = ['head', 'neck', 'chest', 'groin', 'tail'] as const;

/** The part names the ESM reader uses for the BODY part byte differ from the node names where the node has two words. */
const NODE_PART_OF_SLOT: Readonly<Record<string, string>> = { upperarm: 'upper arm', upperleg: 'upper leg' };

/** A body-part slot as the ESM reader names it (`upperarm`, `upperleg`, one word each). */
export type BodyPartSlot = string;

/**
 * The attach nodes of every slot in `slots` that has one, as a frozen table: `{ head: ['head'], hand: ['left hand',
 * 'right hand'], ... }`. A slot the skeleton has no node for is left out.
 */
export function bodyPartBones(slots: readonly BodyPartSlot[]): Readonly<Record<BodyPartSlot, readonly string[]>> {
  const table: Record<BodyPartSlot, readonly string[]> = {};
  for (const slot of slots) {
    const bones = nodesOf(slot);
    if (bones) table[slot] = bones;
  }
  return Object.freeze(table);
}

function nodesOf(slot: BodyPartSlot): string[] | null {
  if (slot === 'hair') return ['head'];
  const part = NODE_PART_OF_SLOT[slot] ?? slot;
  if ((SINGLE_PARTS as readonly string[]).includes(part)) return [part];
  if ((SIDED_PARTS as readonly string[]).includes(part)) return [`left ${part}`, `right ${part}`];
  return null;
}
