// Particle systems of a Morrowind NIF file: the descriptors read out of the file, and the quad stream the renderer
// draws. The running system (the controller's clock, emission, modifiers, colliders and ageing) is in
// mw-particle-sim.ts and is re-exported from here.
//
// `particleSystemsOf(nif)` walks the file through flattenNif's own traversal (mwNifMesh.js hands each particle
// geometry to a sink with the same composed transform, property chain and particle flags a shape gets) and answers
// descriptors: the controller's terms, the emitter node's frame, the modifier chain, the colliders, the initial
// particles and the material with its blend function. `createParticleSystem` takes one. Nothing here touches GL;
// combat/fpArm.js places the answers on the rig and render/renderer.js draws them.
//
// Not carried:
//   - NiBSPArrayController's emission at the vertices of a target's geometry. A torch emits from one node, and no
//     effect that needs vertex emission is drawn yet. The controller's flags are read, and the system refuses to
//     emit, with a note.
//   - NiParticleBomb: no torch uses one. The record is parsed (mwNifFile.js) and the descriptor lists it as
//     unsupported. NiParticleRotation is skipped as well.
//   - The true world of the absolute reference frame. A lens-local arm has no world; its "world" is the rig root
//     (see fpArm.js), so a flame in that frame trails the hand's swing but not the player's walk.

import { deref } from './mwNifFile.js';
import { resolveMaterial, composeTransform, flattenNif, VERTEX_COLOR_MODE } from './mwNifMesh.js';
import { affineOfTransform, AFFINE_IDENTITY, affineMul, affineApply, affineRotate } from './mwAffine.js';
import {
  BSP_AT_NODE,
  BSP_AT_VERTEX,
  CONTROLLER_FLAG_ACTIVE,
  PARTICLE_FLAG_AUTOPLAY,
  PARTICLE_FLAG_LOCAL_SPACE,
} from './mw-particle-sim.ts';

export * from './mw-particle-sim.ts';

const IDENTITY_T = Object.freeze({ rotation: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), translation: [0, 0, 0], scale: 1 });

// The affine of a transform and the product live in mwAffine.js (mwSkin composes the same ones); re-exported for the rig.
export { affineOfTransform, AFFINE_IDENTITY, affineMul, affineApply, affineRotate };

// ---- the file's node transforms, for the emitter node ----------------------

/** The composed transform of ANY node in the file, root to node - the
 *  emitter may be an ancestor, a sibling or a cousin of the particle
 *  geometry, so it is looked up by reference rather than met on the walk.
 *  The parent map is built once per file. */
const PARENTS = new WeakMap();
function parentMap(nif) {
  let m = PARENTS.get(nif);
  if (m) return m;
  m = new Map();
  nif.records.forEach((rec, i) => {
    if (rec && Array.isArray(rec.children)) for (const c of rec.children) if (c >= 0) m.set(c, i);
  });
  PARENTS.set(nif, m);
  return m;
}
export function nodeWorldTransform(nif, ref) {
  const parents = parentMap(nif);
  const chain = [];
  const seen = new Set();
  for (let r = ref; r !== undefined && r >= 0 && !seen.has(r); r = parents.get(r)) {
    seen.add(r);
    const rec = deref(nif, r);
    if (!rec || !rec.rotation) break;
    chain.push(rec);
  }
  let world = IDENTITY_T;
  for (let i = chain.length - 1; i >= 0; i--) world = composeTransform(world, chain[i]);
  return world;
}

// ---- the descriptor -------------------------------------------------------

/** The particle geometry's controller: the last active
 *  NiParticleSystemController / NiBSPArrayController on its chain (a torch
 *  has one). */
function particleController(nif, rec) {
  let found = null;
  const seen = new Set();
  for (let ref = rec.controller; ref >= 0 && !seen.has(ref);) {
    seen.add(ref);
    const c = deref(nif, ref);
    if (!c) break;
    if ((c.type === 'NiParticleSystemController' || c.type === 'NiBSPArrayController') && (c.flags & CONTROLLER_FLAG_ACTIVE)) found = c;
    ref = c.next;
  }
  return found;
}

function modifierChain(nif, first) {
  const out = [];
  const seen = new Set();
  for (let ref = first; ref >= 0 && !seen.has(ref);) {
    seen.add(ref);
    const m = deref(nif, ref);
    if (!m) break;
    out.push(m);
    ref = m.next;
  }
  return out;
}

/**
 * One particle system's descriptor, from the bundle the flattener sinks.
 * Null when the geometry has no active controller: nothing is drawn for it.
 */
export function particleSystemOf(nif, bundle) {
  const { ref, rec, world, props, animFlags } = bundle;
  const ctrl = particleController(nif, rec);
  if (!ctrl) return null;
  const data = rec.data >= 0 ? deref(nif, rec.data) : null;
  const material = resolveMaterial(nif, props, true);   // the particle colour is the vertex colour
  const modifiers = [];
  for (const m of modifierChain(nif, ctrl.particleModifier)) {
    switch (m.type) {
      case 'NiParticleGrowFade': modifiers.push({ type: 'growFade', grow: m.grow, fade: m.fade }); break;
      case 'NiGravity':
        modifiers.push({ type: 'gravity', decay: m.decay, force: m.force, fieldType: m.fieldType, position: [...m.position], direction: [...m.direction] });
        break;
      case 'NiParticleColorModifier': {
        const cd = m.colorData >= 0 ? deref(nif, m.colorData) : null;
        if (cd && cd.data && cd.data.keys && cd.data.keys.length) modifiers.push({ type: 'color', keys: cd.data.keys.map((k) => ({ time: k.time, value: [...k.value], inTan: k.inTan ? [...k.inTan] : null, outTan: k.outTan ? [...k.outTan] : null, tbc: k.tbc ? [...k.tbc] : null })), interpolation: cd.data.type });   // a TCB key's tension/continuity/bias ride along
        break;
      }
      case 'NiParticleRotation': break;   // no effect on the particles drawn here
      case 'NiParticleBomb': modifiers.push({ type: 'bomb', unsupported: true }); break;
      default: break;
    }
  }
  const colliders = [];
  for (const c of modifierChain(nif, ctrl.particleCollider)) {
    if (c.type === 'NiPlanarCollider') {
      colliders.push({ type: 'planar', bounce: c.bounce, height: c.height, width: c.width, position: [...c.position], xVector: [...c.xVector], yVector: [...c.yVector], normal: [...c.plane.normal], constant: c.plane.constant });
    } else if (c.type === 'NiSphericalCollider') {
      colliders.push({ type: 'spherical', bounce: c.bounce, radius: c.radius, position: [...c.position] });
    }
  }
  const emitterRef = ctrl.emitter;
  const emitterWorld = emitterRef >= 0 ? nodeWorldTransform(nif, emitterRef) : null;
  const numParticles = data && data.numParticles ? data.numParticles : (ctrl.particles ? ctrl.particles.length : 0);
  return {
    kind: 'particles',
    name: rec.name || '',
    ref,
    // the particle node's own frame in the file, which is the space the
    // particles live in under the RELATIVE reference frame
    world: { rotation: Float32Array.from(world.rotation), translation: [...world.translation], scale: world.scale },
    localSpace: (animFlags & PARTICLE_FLAG_LOCAL_SPACE) !== 0,
    autoPlay: (animFlags & PARTICLE_FLAG_AUTOPLAY) !== 0,
    controller: {
      type: ctrl.type,
      flags: ctrl.flags, frequency: ctrl.frequency, phase: ctrl.phase, startTime: ctrl.startTime, stopTime: ctrl.stopTime,
      extrapolation: ctrl.flags & 0x6,
      speed: ctrl.speed, speedVariation: ctrl.speedVariation,
      declination: ctrl.declination, declinationVariation: ctrl.declinationVariation,
      planarAngle: ctrl.planarAngle, planarAngleVariation: ctrl.planarAngleVariation,
      initialColor: [...ctrl.initialColor], initialSize: ctrl.initialSize,
      emitStart: ctrl.emitStartTime, emitStop: ctrl.emitStopTime,
      birthRate: ctrl.birthRate, lifetime: ctrl.lifetime, lifetimeVariation: ctrl.lifetimeVariation,
      emitFlags: ctrl.useBirthRate | 0,
      emitterDimensions: [...ctrl.emitterDimensions],
      bspFlags: ctrl.type === 'NiBSPArrayController' ? (ctrl.flags & (BSP_AT_NODE | BSP_AT_VERTEX)) : 0,
      particles: (ctrl.particles ?? []).map((p) => ({ velocity: [...p.velocity], age: p.age, lifeSpan: p.lifeSpan, code: p.code })),
    },
    emitter: emitterWorld ? { ref: emitterRef, world: { rotation: Float32Array.from(emitterWorld.rotation), translation: [...emitterWorld.translation], scale: emitterWorld.scale } } : null,
    data: data ? {
      numParticles,
      numActive: data.numActive | 0,
      vertices: data.vertices ? Float32Array.from(data.vertices) : null,
      sizes: data.sizes ? Float32Array.from(data.sizes) : null,
      radius: data.particleRadius ?? 0,
    } : { numParticles, numActive: 0, vertices: null, sizes: null, radius: 0 },
    modifiers,
    colliders,
    material,
  };
}

/** Every particle system in a file, through flattenNif's own walk. `opts`
 *  are flattenNif's (underNode, excludeNode, includeHidden). */
export function particleSystemsOf(nif, opts = {}) {
  const effects = [];
  flattenNif(nif, { ...opts, effects });
  const out = [];
  for (const bundle of effects) {
    const d = particleSystemOf(nif, bundle);
    if (d) out.push(d);
  }
  return out;
}

// ---- the quad stream the renderer draws ------------------------------------

/** One quad is six vertices of PARTICLE_FLOATS: centre xyz, corner xy
 *  (-1/+1), uv, rgba, size. The corner is turned into a billboard by the
 *  shader off the view's own axes, so the stream is view-independent. */
export const PARTICLE_FLOATS = 12;
/** The corner-to-texel map. This port uploads a decoded DDS top row first,
 *  exactly as the NIF's own UVs expect (every textured piece proves it), so
 *  the picture's top is v = 0: the top corners take v 0, the bottom corners
 *  v 1, and the flame stands the way it was painted. */
export const PARTICLE_CORNERS = Object.freeze([
  [-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0],
  [-1, -1, 0, 1], [1, 1, 1, 0], [-1, 1, 0, 0],
]);

/**
 * Pack quads into a Float32Array the renderer's particle VAO reads.
 * `place` maps a particle-space centre to the buffer's space (the rig's,
 * for an arm) and `sizeScale` is the uniform scale that trip carries,
 * so a torch authored in file units lands in rig units.
 */
export function packParticleQuads(quads, out = null, { place = null, sizeScale = 1 } = {}) {
  const need = quads.length * 6 * PARTICLE_FLOATS;
  const buf = out && out.length >= need ? out : new Float32Array(Math.max(need, 6 * PARTICLE_FLOATS));
  let o = 0;
  for (const q of quads) {
    const p = place ? place(q.pos[0], q.pos[1], q.pos[2]) : q.pos;
    const size = q.size * sizeScale;
    for (const [cx, cy, u, v] of PARTICLE_CORNERS) {
      buf[o++] = p[0]; buf[o++] = p[1]; buf[o++] = p[2];
      buf[o++] = cx; buf[o++] = cy;
      buf[o++] = u; buf[o++] = v;
      buf[o++] = q.color[0]; buf[o++] = q.color[1]; buf[o++] = q.color[2]; buf[o++] = q.alpha;
      buf[o++] = size;
    }
  }
  return { packed: buf, count: quads.length * 6 };
}

/** The draw state a particle material asks for, as the renderer reads it:
 *  the drawable's NiAlphaProperty and NiZBufferProperty apply to the
 *  particle system exactly as to a shape. */
export function particleDrawState(material) {
  const m = material ?? {};
  return {
    blend: !!m.alphaBlend,
    srcBlend: m.srcBlend ?? 6, dstBlend: m.dstBlend ?? 7,
    alphaCut: m.alphaTest ? (m.alphaThreshold || 0) / 255 : 0,
    depthTest: m.depthTest !== false, depthWrite: m.depthWrite !== false,
    textureFile: m.textureFile ?? null, clampMode: m.clampMode ?? 3,
    // the particle colour substitutes for the material channel the vertex
    // colour mode names; the emission-only mode leaves just the emission,
    // which is the flame's whole point - it does not care what the room is
    // lit by
    emissive: m.vertexColorMode === VERTEX_COLOR_MODE.Emission || (m.emissive && (m.emissive[0] > 0 || m.emissive[1] > 0 || m.emissive[2] > 0)),
  };
}
