// Two rules that tie bones to the rest of a Morrowind rig: which bones belong to a blend mask, and which mesh shapes
// belong to a bone.

/** What the rules read of a skeleton node. */
export type BoneNode = { name?: string; parent?: number };

/** What blendMaskBones reads of a skeleton (mwSkin.js buildSkeleton). */
export type BoneSkeleton = { nodes?: Map<number, BoneNode> };

/** The bones of one blend mask: the node named `rootName` and every node below it. Answers their lower-cased names,
 *  the spelling poseSkeleton looks tracks up by. A skeleton without the root (the fixture rigs, a rig cut down to an
 *  arm) answers the empty set, and the caller overlays nothing. */
export function blendMaskBones(skeleton?: BoneSkeleton | null, rootName = 'bip01 l clavicle'): Set<string> {
  const mask = new Set<string>();
  if (!skeleton || !skeleton.nodes) return mask;
  const rootBone = String(rootName).toLowerCase();
  const lowerName = (node: BoneNode) => String(node.name || '').toLowerCase();
  const childrenOf = new Map<number | undefined, number[]>();
  for (const [ref, node] of skeleton.nodes) {
    const siblings = childrenOf.get(node.parent) ?? [];
    siblings.push(ref);
    childrenOf.set(node.parent, siblings);
  }
  const pending: number[] = [];
  for (const [ref, node] of skeleton.nodes) {
    if (lowerName(node) === rootBone) pending.push(ref);
  }
  const visited = new Set<number>();
  while (pending.length) {
    const ref = pending.pop() as number;
    if (visited.has(ref)) continue;
    visited.add(ref);
    mask.add(lowerName(skeleton.nodes.get(ref) as BoneNode));
    pending.push(...(childrenOf.get(ref) ?? []));
  }
  return mask;
}

/** The shape filter: a case-insensitive prefix match on the shape name, with Morrowind's "Tri " convention
 *  stripped first. A shape with no name matches everything, because a nameless shape in a one-shape part file is
 *  the part. */
export function shapeMatchesBone(shapeName?: string | null, bone?: unknown): boolean {
  const name = String(shapeName || '')
    .trim()
    .toLowerCase();
  if (!name) return true;
  const prefix = String(bone).toLowerCase();
  const nameWithoutTri = name.startsWith('tri ') ? name.slice('tri '.length) : name;
  return name.startsWith(prefix) || nameWithoutTri.startsWith(prefix);
}
