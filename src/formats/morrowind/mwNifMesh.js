// Morrowind NIF scene flattener - slice 2 of the import arc. Walks a
// parsed NIF (src/formats/morrowind/mwNifFile.js), composes node transforms down the
// graph, and emits draw-ready batches: baked world-space positions and
// normals, UV/color passthrough, the accumulated material and base
// texture, and the alpha-property state. Pure data in, pure data out -
// no GL, no DOM - so the same module feeds the viewer prototype now and
// the game's character/item pipeline in later slices.
//
// NetImmerse semantics honored here:
//   - transforms compose as R,S,T per node: world(v) = Rw*(Sw*v) + Tw
//     with Rw = Rp*Rl, Sw = Sp*Sl, Tw = Rp*(Sp*Tl) + Tp (uniform scale).
//   - flags bit 0 on any NiAVObject hides that node AND its subtree.
//   - RootCollisionNode subtrees are collision, never drawn.
//   - NiProperty records ACCUMULATE down the graph; a nearer record of
//     the same type overrides an ancestor's.
//   - Skinned shapes are emitted as-authored (bind pose) and marked
//     `skinned` - live deformation is the animation slice's work.

import { deref } from './mwNifFile.js';
import { resolveMaterial as resolveMaterialFrom, skipGeometryName } from './nif-material.ts';

// Every record type derived from NiNode is walked into, the selector nodes (switch, level of detail) included: a
// model that hangs part of its graph under one of them would otherwise lose that part.
export const NODE_TYPES = new Set([   // exported - an effect mesh's node graph is the drawing walk's own membership (formats/morrowind/mwVfx.js)
  'NiNode',
  'NiBSAnimationNode',
  'NiBSParticleNode',
  'NiBillboardNode',
  'AvoidNode',
  'NiSwitchNode',
  'NiLODNode',
  'NiSortAdjustNode',
  'NiCollisionSwitch',
]);

/**
 * The one child a selector node shows, or null for a plain node that shows
 * all of them. NiSwitchNode: the child its index names, and no other.
 * NiLODNode: each level covers a range of distances from the viewer, and
 * a level draws when the distance lies from its near edge up to, but not
 * including, its far edge. A flattener bakes one static scene and has no
 * viewer, so it reads the node at distance 0, the nearest level, which is
 * where Morrowind's files put level 0. NiSortAdjustNode and
 * NiCollisionSwitch keep every child, as a plain NiNode does.
 */
export function selectedChild(rec) {   // exported - an effect's switch shows the one branch the flattener shows
  if (rec.type === 'NiLODNode') {
    const levels = rec.lodLevels;
    if (Array.isArray(levels)) {
      for (let i = 0; i < levels.length; i++) {
        if (levels[i].near <= 0 && levels[i].far > 0) return i;
      }
      // No level covers distance 0: nothing is in range, so nothing draws.
      if (levels.length) return -1;
    }
    return 0;
  }
  // An index past the last child selects no branch, so nothing draws.
  if (rec.type === 'NiSwitchNode') return Number.isInteger(rec.index) ? rec.index : 0;
  return null;
}

/** The geometry classes this flattener draws. NiLines is parsed and is NOT
 *  here: a batch is a triangle list by contract, so a line shape has no
 *  honest home downstream and is dropped rather than drawn as triangles. */
export const GEOMETRY_TYPES = new Set(['NiTriShape', 'NiTriStrips']);   // exported (formats/morrowind/mwVfx.js)

/** The PARTICLE
 *  geometries. A batch here is a triangle list by contract, and a particle
 *  system is not one - it is an emitter and a law, drawn as quads that do
 *  not exist until the clock runs - so they do not become batches. They
 *  are handed WHOLE to `opts.effects` when a caller brings a sink, with the
 *  same composed transform and property chain a shape gets, and the flags
 *  of the enclosing NiBSAnimationNode or NiBSParticleNode, which say whether
 *  the system plays by itself (AutoPlay) and whether its particles live in
 *  the node's own space (LocalSpace). formats/morrowind/mwParticles.js
 *  turns a bundle into a system. A caller with no sink gets exactly what
 *  it always got: nothing. */
export const PARTICLE_TYPES = new Set(['NiParticles', 'NiAutoNormalParticles', 'NiRotatingParticles']);   // exported - an effect's particle geometry is a node of its graph
export const ANIM_FLAG_NODES = new Set(['NiBSAnimationNode', 'NiBSParticleNode']);   // exported - formats/morrowind/mwVfx.js reads the same AutoPlay/LocalSpace flags

/** A strip shorter than 3 draws nothing, and a shape whose strips are ALL
 *  short draws nothing. Unrolled to the triangle list this module emits,
 *  with the usual winding flip on odd triangles and the degenerate joins (a
 *  repeated index) left out. */
export function stripsToTriangles(data) {   // exported - an effect mesh's strips, the one expansion
  const out = [];
  for (const strip of data.strips ?? []) {
    if (!strip || strip.length < 3) continue;
    for (let i = 0; i + 2 < strip.length; i++) {
      const a = strip[i], b = strip[i + 1], c = strip[i + 2];
      if (a === b || b === c || a === c) continue;
      if (i & 1) out.push(b, a, c);
      else out.push(a, b, c);
    }
  }
  return Uint16Array.from(out);
}

/** Row-major 3x3 multiply: out = a*b. */
export function mat33Mul(a, b) {
  const o = new Float32Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

/** Row-major 3x3 applied to [x,y,z]. */
export function mat33Apply(m, x, y, z) {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

/** Copy a translation triple into a plain array. */
function bt3(t) {
  return [t[0], t[1], t[2]];
}

const IDENTITY = Object.freeze({
  rotation: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  translation: [0, 0, 0],
  scale: 1,
});

/** Compose parent world transform with a node's local transform. */
export function composeTransform(p, node) {
  const rotation = mat33Mul(p.rotation, node.rotation);
  const [tx, ty, tz] = mat33Apply(
    p.rotation,
    node.translation[0] * p.scale,
    node.translation[1] * p.scale,
    node.translation[2] * p.scale,
  );
  return {
    rotation,
    translation: [p.translation[0] + tx, p.translation[1] + ty, p.translation[2] + tz],
    scale: p.scale * node.scale,
  };
}

export {
  VERTEX_COLOR_MODE, VERT_MODE, LIGHT_MODE, DRAW_MODE, diffuseAt, emissiveAt, skipGeometryName,
} from './nif-material.ts';

/**
 * The surface a shape has from the properties on the way down to it, the root's first (nif-material.ts).
 * `hasVertexColors` says whether the shape carries a colour array.
 */
export function resolveMaterial(nif, props, hasVertexColors = false) {
  return resolveMaterialFrom(nif, props, hasVertexColors, deref);
}

/**
 * Whether the file's root carries the marker flag: a text extra-data record "MRK", exact and case-sensitive, on the
 * root node itself. The node's extra-data records form a linked list, which is read to its end.
 */
export function hasMarkerFlag(nif, rec) {
  for (let ref = rec ? rec.extra : -1; ref >= 0;) {
    const e = deref(nif, ref);
    if (!e) break;
    if (e.type === 'NiStringExtraData' && e.string === 'MRK') return true;
    ref = e.next ?? -1;
  }
  return false;
}

/**
 * Flatten a parsed NIF into draw-ready batches.
 * @param {{records:object[], roots:number[]}} nif - from parseNif.
 * @param {{includeHidden?: boolean}} [opts]
 * @returns {{name:string, skinned:boolean, positions:Float32Array,
 *   normals:Float32Array|null, uvs:Float32Array|null,
 *   colors:Float32Array|null, indices:Uint16Array, material:object}[]}
 */
export function flattenNif(nif, opts = {}) {
  const includeHidden = opts.includeHidden === true;
  // The scabbard files. `underNode` emits only the geometry BELOW the node of
  // that name (case-insensitive, exact name), `excludeNode` everything but
  // that subtree; both keep the full transform chain from the file root,
  // because a scabbard file is one model with the weapon's node inside it.
  const underNode = opts.underNode ? String(opts.underNode).toLowerCase() : null;
  const excludeNode = opts.excludeNode ? String(opts.excludeNode).toLowerCase() : null;
  const batches = [];

  function emit(shape, world, props, chain, animFlags, parentRef = -1) {
    const data = deref(nif, shape.data);
    if (!data || !data.vertices) return;
    let indices;
    if (shape.type === 'NiTriStrips') {
      indices = stripsToTriangles(data);
      if (!indices.length) return;   // no strip of 3 vertices: nothing to draw
    } else {
      indices = Uint16Array.from(data.triangles);
    }
    const skinned = shape.skin >= 0;
    const n = data.numVertices;
    const positions = new Float32Array(n * 3);
    let normals = null;
    if (skinned) {
      // A skinned shape's verts stay as authored - the bones place them
      // (mwSkin.js). Its own transform is NOT baked here and NOT ignored:
      // it rides the skin payload as `shapeTransform`, and is applied
      // after the bones have blended the vertices.
      positions.set(data.vertices);
      if (data.normals) normals = Float32Array.from(data.normals);
    } else {
      for (let i = 0; i < n; i++) {
        const [x, y, z] = mat33Apply(
          world.rotation,
          data.vertices[i * 3] * world.scale,
          data.vertices[i * 3 + 1] * world.scale,
          data.vertices[i * 3 + 2] * world.scale,
        );
        positions[i * 3] = x + world.translation[0];
        positions[i * 3 + 1] = y + world.translation[1];
        positions[i * 3 + 2] = z + world.translation[2];
      }
      if (data.normals) {
        normals = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const [x, y, z] = mat33Apply(
            world.rotation,
            data.normals[i * 3],
            data.normals[i * 3 + 1],
            data.normals[i * 3 + 2],
          );
          normals[i * 3] = x;
          normals[i * 3 + 1] = y;
          normals[i * 3 + 2] = z;
        }
      }
    }
    let skin = null;
    if (skinned) {
      const si = deref(nif, shape.skin);
      const sd = deref(nif, si.data);
      skin = {
        skeletonRoot: si.skeletonRoot,
        rootBone: si.skeletonRoot,
        transform: sd.transform,
        // The shape's OWN local transform, applied to the blend's output.
        // Carried as data; skinBatch composes it outermost.
        shapeTransform: {
          rotation: shape.rotation ?? [1, 0, 0, 0, 1, 0, 0, 0, 1],
          translation: shape.translation ?? [0, 0, 0],
          scale: shape.scale ?? 1,
        },
        bones: si.bones.map((ref, i) => ({
          ref,
          name: (deref(nif, ref)?.name || '').toLowerCase(),
          invBind: {
            a: (() => {
              const bt = sd.bones[i].transform;
              const a = new Float32Array(9);
              for (let k = 0; k < 9; k++) a[k] = bt.rotation[k] * bt.scale;
              return a;
            })(),
            t: bt3(sd.bones[i].transform.translation),
          },
          indices: sd.bones[i].indices,
          weights: sd.bones[i].weights,
        })),
      };
    }
    batches.push({
      name: shape.name || '',
      // Where the shape hangs - its record and every record from the file root down to it - and its
      // vertices as authored, so a part whose own controllers move it (a bow's string and its ArrowBone, on the weapon
      // clock - formats/morrowind/mwPartClock.js) can be posed again at another time. References, never copies.
      ref: shape,
      chain,
      animFlags,
      local: data.vertices,
      localNormals: data.normals ?? null,
      skinned,
      skin,
      positions,
      normals,
      uvs: data.uvSets.length ? Float32Array.from(data.uvSets[0]) : null,
      colors: data.colors ? Float32Array.from(data.colors) : null,
      indices,
      material: resolveMaterial(nif, props, !!data.colors),
      parentRef,   // the node the shape hangs under - a creature's rigid piece rides it (mwCharacter.js bindCreatureModel)
    });
  }

  // Whether the root carries the marker flag. It is read from the root's own
  // extra-data and from nowhere else, then applies to the whole walk.
  let hasMarkers = false;

  function walk(ref, world, props, isRoot = false, inside = !underNode, animFlags = 0, chain = [], parentRef = -1) {   // and the node above
    const rec = deref(nif, ref);
    if (!rec) return;
    const nextChain = [...chain, rec];   // the records from the root down
    if (ANIM_FLAG_NODES.has(rec.type)) animFlags = rec.flags | 0;   // AutoPlay and LocalSpace ride on these nodes
    const lname = String(rec.name || '').toLowerCase();
    if (excludeNode && lname === excludeNode) return;   // the masked subtree
    if (underNode && lname === underNode) inside = true;   // from here down
    // A node named "Bounding Box" (case-insensitive, exact) and its whole
    // subtree are not part of the scene. The root is exempt: a file whose root
    // carries that name would otherwise load as nothing.
    if (!isRoot && String(rec.name || '').toLowerCase() === 'bounding box') return;
    // A RootCollisionNode subtree is collision data and draws nothing, so
    // this flattener, which produces drawables, leaves it out.
    if (rec.type === 'RootCollisionNode') return;
    if (!includeHidden && (rec.flags & 0x0001) !== 0) return;
    if (isRoot) hasMarkers = hasMarkerFlag(nif, rec);

    const nextWorld = composeTransform(world, rec);
    let nextProps = props;
    if (rec.properties && rec.properties.length) {
      // Root-first APPEND, never a per-type overwrite - see
      // resolveMaterial's header for the one rule that can tell.
      nextProps = props.slice();
      for (const pRef of rec.properties) {
        const prop = deref(nif, pRef);
        if (prop) nextProps.push(prop);
      }
    }
    if (GEOMETRY_TYPES.has(rec.type)) {
      // The name skip list applies to the geometry itself, after the
      // transforms and properties are composed. The node is still walked and
      // emits nothing, which differs from pruning a subtree.
      if (inside && !skipGeometryName(rec.name, hasMarkers)) emit(rec, nextWorld, nextProps, nextChain, animFlags, parentRef);
      return;
    }
    if (PARTICLE_TYPES.has(rec.type)) {
      // A particle system takes the same gates a shape does (the
      // hidden flag above, the name skip here) and goes to the sink whole.
      if (inside && opts.effects && !skipGeometryName(rec.name, hasMarkers)) {
        opts.effects.push({ ref, rec, world: nextWorld, props: nextProps, animFlags, parentRef });
      }
      return;
    }
    if (NODE_TYPES.has(rec.type) && rec.children) {
      // A switch and a LOD hold every branch but SHOW one, so exactly one
      // subtree ever draws. This flattener emits drawables, so the selection
      // has to happen here: walking all of them would superimpose every
      // branch and every LOD level.
      const only = selectedChild(rec);
      if (only !== null) {
        const child = rec.children[only];
        if (child !== undefined && child >= 0) walk(child, nextWorld, nextProps, false, inside, animFlags, nextChain, ref);
        return;
      }
      for (const child of rec.children) {
        if (child >= 0) walk(child, nextWorld, nextProps, false, inside, animFlags, nextChain, ref);
      }
    }
  }

  for (const root of nif.roots) {
    if (root >= 0) walk(root, IDENTITY, [], true);
  }
  return batches;
}
