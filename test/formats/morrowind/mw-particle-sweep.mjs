import { createHash } from 'node:crypto';

// A fixed set of inputs for the particle system (src/formats/morrowind/mwParticles.js and mw-particle-sim.ts) and the
// way its answers are recorded. mw-particle-sim.test.ts runs the current code over these inputs and compares with the
// recording in test/fixtures/mw/mw-particle-parity.json, which was made from the implementation it replaced.
//
// The inputs are:
//   - every particle system in the NIF files of Morrowind.bsa, Tribunal.bsa and Bloodmoon.bsa, as the descriptor
//     particleSystemsOf builds for it. The recording keeps a spread of these (one per distinct feature set, the
//     smallest first) so that the test does not need the game files; with the game files the test runs all of them,
//   - seeded random descriptors that reach what the retail files do not: colliders of both kinds, both gravity
//     fields, every colour interpolation, an emitter with no node, the reference frames, a quota of a few slots,
//   - seeded argument grids for the pure rules (controller clock, shooting direction, colour ramp, the two colliders,
//     the affine helpers, quad packing, draw state).
// A system is run with seeded dice under several clocks and frames, and the particles it holds are recorded as a
// digest of the quads at every tenth step and at the end. The pure rules are recorded in full.

/** JSON that keeps Infinity and NaN, which plain JSON turns into null, and writes typed arrays as arrays. */
export const exactJson = (value) =>
  JSON.stringify(value, (_key, inner) => {
    if (typeof inner === 'number' && !Number.isFinite(inner)) return `number:${inner}`;
    if (inner === undefined) return 'undefined';
    if (ArrayBuffer.isView(inner)) return Array.from(inner);
    return inner;
  });

const digestOf = (value) => createHash('sha256').update(exactJson(value)).digest('hex').slice(0, 12);

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (random, low, high) => low + (high - low) * random();
const vectorOf = (random, size, low, high) => Array.from({ length: size }, () => range(random, low, high));

/** A rotation matrix (row-major, nine numbers) about a random axis. */
function rotationOf(random) {
  const axis = vectorOf(random, 3, -1, 1);
  const length = Math.hypot(...axis) || 1;
  const [x, y, z] = axis.map((component) => component / length);
  const angle = range(random, -Math.PI, Math.PI);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

function transformOf(random, withScale) {
  return {
    rotation: Float32Array.from(rotationOf(random)),
    translation: vectorOf(random, 3, -20, 20),
    scale: withScale ? range(random, 0.5, 2) : 1,
  };
}

/**
 * A descriptor cut down to what the simulation reads, so that it can be kept in the recording: the slots after the
 * live ones, the vertices no live particle names, the material and the name are dropped. The slot count survives as
 * `slots`, which the birth rate reads. Both the recording and the test compact the same way before they run.
 */
export function compactDescriptor(descriptor) {
  const live = descriptor.controller.particles.slice(0, descriptor.data.numActive).filter((p) => p.lifeSpan > 0);
  const reach = live.reduce((most, p) => Math.max(most, p.code + 1), 0);
  const data = descriptor.data;
  const filler = { velocity: [0, 0, 0], age: 0, lifeSpan: 0, code: 0 };
  const slots = descriptor.controller.particles.length;
  const particles = live.concat(Array.from({ length: Math.max(0, slots - live.length) }, () => filler));
  return {
    ...descriptor,
    name: '',
    material: null,
    controller: { ...descriptor.controller, particles },
    data: {
      ...data,
      vertices: data.vertices ? data.vertices.slice(0, reach * 3) : null,
      sizes: data.sizes ? data.sizes.slice(0, reach) : null,
    },
  };
}

/** The kept form of a compacted descriptor: the filler slots are written as a count, to keep the file small. */
export function packDescriptor(compacted) {
  const live = compacted.controller.particles.filter((p) => p.lifeSpan > 0);
  return {
    ...compacted,
    controller: { ...compacted.controller, particles: live, slots: compacted.controller.particles.length },
    world: { ...compacted.world, rotation: Array.from(compacted.world.rotation) },
    emitter: compacted.emitter
      ? {
          ...compacted.emitter,
          world: { ...compacted.emitter.world, rotation: Array.from(compacted.emitter.world.rotation) },
        }
      : null,
    data: {
      ...compacted.data,
      vertices: compacted.data.vertices ? Array.from(compacted.data.vertices) : null,
      sizes: compacted.data.sizes ? Array.from(compacted.data.sizes) : null,
    },
  };
}

/** The descriptor a kept form stands for, as the simulation takes it. */
export function unpackDescriptor(kept) {
  const filler = { velocity: [0, 0, 0], age: 0, lifeSpan: 0, code: 0 };
  const particles = kept.controller.particles.concat(
    Array.from({ length: Math.max(0, kept.controller.slots - kept.controller.particles.length) }, () => filler),
  );
  const { slots: _slots, ...controller } = kept.controller;
  return {
    ...kept,
    controller: { ...controller, particles },
    world: { ...kept.world, rotation: Float32Array.from(kept.world.rotation) },
    emitter: kept.emitter
      ? { ...kept.emitter, world: { ...kept.emitter.world, rotation: Float32Array.from(kept.emitter.world.rotation) } }
      : null,
    data: {
      ...kept.data,
      vertices: kept.data.vertices ? Float32Array.from(kept.data.vertices) : null,
      sizes: kept.data.sizes ? Float32Array.from(kept.data.sizes) : null,
    },
  };
}

/** The features of a descriptor that decide which branches of the simulation it reaches. */
function featureSet(descriptor) {
  const c = descriptor.controller;
  return JSON.stringify([
    c.type,
    descriptor.localSpace,
    descriptor.autoPlay,
    c.extrapolation,
    c.emitFlags,
    c.bspFlags,
    descriptor.modifiers.map((m) => `${m.type}${m.fieldType ?? ''}${m.interpolation ?? ''}`).sort(),
    descriptor.colliders.map((collider) => collider.type).sort(),
    descriptor.emitter !== null,
    c.particles.some((p) => p.lifeSpan > 0),
    descriptor.data.vertices !== null,
    descriptor.data.sizes !== null,
    c.lifetime === 0 && c.lifetimeVariation === 0,
    c.emitterDimensions.some((size) => size !== 0),
  ]);
}

/** The particle systems of every NIF in the three archives, compacted, as [{ key, descriptor }]; and the extraction digests. */
export function readRetailSystems({ dataPath, fs, path, modules }) {
  const { MwBsaFile, parseNif, particleSystemsOf } = modules;
  const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map(
    (name) => new MwBsaFile(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.bsa`)))),
  );
  const systems = [];
  const extraction = {};
  for (const archive of archives) {
    for (const file of archive.list().sort()) {
      if (!file.endsWith('.nif')) continue;
      let nif;
      try {
        nif = parseNif(archive.get(file).slice());
      } catch {
        continue;
      }
      let found;
      try {
        found = particleSystemsOf(nif);
      } catch (error) {
        extraction[file] = `throws: ${error.message}`;
        continue;
      }
      if (!found.length) continue;
      extraction[file] = digestOf(found);
      found.forEach((descriptor, index) => {
        systems.push({ key: `${file}#${index}`, descriptor: compactDescriptor(descriptor) });
      });
    }
  }
  return { systems, extraction };
}

/** One system per distinct feature set, the smallest first, then the next smallest of each: the kept spread. */
export function chooseSpread(systems, perFeatureSet = 2) {
  const groups = new Map();
  for (const system of systems) {
    const features = featureSet(system.descriptor);
    if (!groups.has(features)) groups.set(features, []);
    groups.get(features).push(system);
  }
  const chosen = [];
  for (const members of groups.values()) {
    members.sort((a, b) => exactJson(a.descriptor).length - exactJson(b.descriptor).length);
    chosen.push(...members.slice(0, perFeatureSet));
  }
  return chosen;
}

const COLOUR_TYPES = [1, 2, 3, 4];

/** Seeded random descriptors, built to reach the branches the retail files leave out. */
export function syntheticSystems() {
  const random = seededRandom(20261114);
  const pickOne = (items) => items[Math.floor(random() * items.length)];
  const systems = [];
  for (let n = 0; n < 160; n++) {
    const slots = pickOne([0, 1, 3, 8, 20, 60]);
    const numActive = Math.min(slots, pickOne([0, 0, 2, 5]));
    const lifetime = pickOne([0, 0.5, 1, 2.5]);
    const lifetimeVariation = pickOne([0, 0.25, 1]);
    const particles = Array.from({ length: slots }, (_, index) => ({
      velocity: vectorOf(random, 3, -3, 3),
      age: pickOne([-0.2, 0, 0.3, 1.4]),
      lifeSpan: index < numActive ? pickOne([-1, 0, 0.6, 2, 5]) : pickOne([0, 1]),
      code: Math.floor(random() * (slots + 3)),
    }));
    const vertexCount = pickOne([0, slots, slots + 2]);
    const modifiers = [];
    if (random() < 0.7) modifiers.push({ type: 'growFade', grow: pickOne([0, 0.2, 1]), fade: pickOne([0, 0.3, 2]) });
    if (random() < 0.5) {
      const type = pickOne(COLOUR_TYPES);
      const keyCount = pickOne([1, 2, 4]);
      modifiers.push({
        type: 'color',
        interpolation: type,
        keys: Array.from({ length: keyCount }, (_, index) => ({
          time: (index + range(random, 0, 0.2)) / keyCount,
          value: vectorOf(random, 4, 0, 1),
          inTan: type === 2 ? vectorOf(random, 4, -1, 1) : null,
          outTan: type === 2 ? vectorOf(random, 4, -1, 1) : null,
          tbc: type === 3 ? vectorOf(random, 3, -1, 1) : null,
        })),
      });
    }
    const gravityCount = pickOne([0, 0, 1, 2]);
    for (let g = 0; g < gravityCount; g++) {
      modifiers.push({
        type: 'gravity',
        decay: pickOne([0, 0, 0.3, 1.5]),
        force: range(random, -6, 6),
        fieldType: pickOne([0, 1]),
        position: vectorOf(random, 3, -4, 4),
        direction: pickOne([vectorOf(random, 3, -1, 1), [0, 0, 0], [0, 0, -1]]),
      });
    }
    if (random() < 0.1) modifiers.push({ type: 'bomb', unsupported: true });
    const colliders = [];
    if (random() < 0.4) {
      const normal = vectorOf(random, 3, -1, 1);
      colliders.push({
        type: 'planar',
        bounce: pickOne([0.3, 0.8, 1]),
        width: pickOne([2, 20]),
        height: pickOne([2, 20]),
        position: vectorOf(random, 3, -2, 2),
        xVector: [1, 0, 0],
        yVector: [0, 1, 0],
        normal: normal.map((component) => component / (Math.hypot(...normal) || 1)),
        constant: range(random, -3, 3),
      });
    }
    if (random() < 0.4) {
      colliders.push({
        type: 'spherical',
        bounce: pickOne([0.3, 0.8, 1]),
        radius: pickOne([0.5, 3, 12]),
        position: vectorOf(random, 3, -2, 2),
      });
    }
    const hasEmitter = random() < 0.7;
    const withVertices = vertexCount > 0 && random() < 0.85;
    systems.push({
      key: `synthetic-${n}`,
      descriptor: {
        kind: 'particles',
        name: '',
        ref: n,
        world: transformOf(random, true),
        localSpace: random() < 0.5,
        autoPlay: random() < 0.8,
        controller: {
          type: n % 17 === 0 ? 'NiBSPArrayController' : 'NiParticleSystemController',
          flags: pickOne([0x8, 0xc, 0xe]),
          frequency: pickOne([1, 0.5, 2]),
          phase: pickOne([0, 0.3]),
          startTime: pickOne([0, 0.5]),
          stopTime: pickOne([1, 3, 0.2, 0]),
          extrapolation: pickOne([0, 2, 4, 6]),
          speed: range(random, 0, 8),
          speedVariation: pickOne([0, 1, 4]),
          declination: range(random, 0, 1.5),
          declinationVariation: pickOne([0, 0.4]),
          planarAngle: range(random, -3, 3),
          planarAngleVariation: pickOne([0, 1]),
          initialColor: vectorOf(random, 4, 0, 1),
          initialSize: pickOne([0.5, 2, 6]),
          emitStart: pickOne([0, 0.3]),
          emitStop: pickOne([0.8, 2, 100]),
          birthRate: pickOne([4, 15, 80]),
          lifetime,
          lifetimeVariation,
          emitFlags: pickOne([0, 1]),
          emitterDimensions: pickOne([[0, 0, 0], vectorOf(random, 3, 0, 5)]),
          bspFlags: n % 17 === 0 ? pickOne([0x8, 0x10, 0x18]) : 0,
          particles,
        },
        emitter: hasEmitter ? { ref: n + 100, world: transformOf(random, random() < 0.5) } : null,
        data: {
          numParticles: slots,
          numActive,
          vertices: withVertices ? Float32Array.from(vectorOf(random, vertexCount * 3, -5, 5)) : null,
          sizes: withVertices && random() < 0.6 ? Float32Array.from(vectorOf(random, vertexCount, 0.2, 2)) : null,
          radius: 1,
        },
        modifiers,
        colliders,
        material: null,
      },
    });
  }
  return systems;
}

const STEP_RUNS = [
  { name: 'steady', step: 1 / 60, steps: 90, clock: 'time', frame: null, emitterFrame: null },
  { name: 'coarse', step: 0.25, steps: 24, clock: 'time', frame: null, emitterFrame: null },
  { name: 'absolute', step: 1 / 30, steps: 60, clock: 'time', frame: 'moving', emitterFrame: null },
  { name: 'emitter', step: 1 / 30, steps: 60, clock: 'time', frame: null, emitterFrame: 'turning' },
  { name: 'both', step: 0.1, steps: 40, clock: 'time', frame: 'moving', emitterFrame: 'turning' },
  { name: 'stalled', step: 1 / 30, steps: 30, clock: 'stalled', frame: null, emitterFrame: null },
  { name: 'wrapped', step: 0.2, steps: 40, clock: 'wrapping', frame: null, emitterFrame: null },
];

/** Runs one system under one drive and answers the particle counts and the digest of the quads. */
function runSystem(modules, descriptor, drive, seed) {
  const random = seededRandom(seed);
  const system = modules.createParticleSystem(descriptor, { rolls: random });
  const frames = seededRandom(seed + 7);
  const moving = modules.affineOfTransform({
    rotation: Float32Array.from(rotationOf(frames)),
    translation: [1, -2, 3],
    scale: 1.25,
  });
  const counts = [];
  const quadDigests = [];
  let time = 0;
  for (let step = 0; step < drive.steps; step++) {
    time += drive.step;
    const clock =
      drive.clock === 'stalled' ? (step < 10 ? null : time) : drive.clock === 'wrapping' ? time * 3.7 : time;
    const frame = drive.frame ? moving : null;
    const emitterFrame = drive.emitterFrame
      ? modules.affineOfTransform({
          rotation: Float32Array.from(rotationOf(seededRandom(step + 1))),
          translation: [step * 0.1, 0, 0],
          scale: 1,
        })
      : null;
    system.update(drive.step, clock, frame, emitterFrame);
    counts.push([system.particles.length, system.frozen, system.enabled]);
    if (step % 10 === 9 || step === drive.steps - 1) quadDigests.push(digestOf(system.quads()));
  }
  return { counts, quadDigests };
}

/** Every answer about one system, as one digest, and the facts about its construction. */
function answerFor(modules, descriptor, seed) {
  const system = modules.createParticleSystem(descriptor, { rolls: seededRandom(seed) });
  const construction = {
    quota: system.quota,
    rate: system.rate,
    emitterToPs: system.emitterToPs,
    unsupported: system.unsupported,
    frozen: system.frozen,
    enabled: system.enabled,
    initial: system.particles,
    quads: system.quads(),
  };
  const runs = STEP_RUNS.map((drive, index) => runSystem(modules, descriptor, drive, seed + index));
  return digestOf([construction, runs]);
}

/** The dice of a system are seeded from its key, so a system answers the same wherever it sits in a list. */
function seedOf(key) {
  return createHash('sha256').update(key).digest().readUInt32LE(0);
}

/** The simulation answers for a list of [{ key, descriptor }]: a digest per key. */
export function recordSystems(modules, systems) {
  const answers = {};
  for (const system of systems) answers[system.key] = answerFor(modules, system.descriptor, seedOf(system.key));
  return answers;
}

// ---- the pure rules ----------------------------------------------------------

function controllerGrid(random) {
  const cases = [];
  for (let n = 0; n < 400; n++) {
    const startTime = range(random, -1, 2);
    const stopTime = n % 9 === 0 ? startTime : startTime + range(random, -0.5, 3);
    const controller = {
      frequency: range(random, -2, 3),
      phase: range(random, -1, 1),
      startTime,
      stopTime,
      extrapolation: [0, 2, 4, 6, 1][n % 5],
    };
    cases.push([controller, ...Array.from({ length: 5 }, () => range(random, -10, 10))]);
  }
  return cases;
}

function colliderGrid(random) {
  const planar = [];
  const spherical = [];
  for (let n = 0; n < 3000; n++) {
    const normal = vectorOf(random, 3, -1, 1);
    const length = Math.hypot(...normal) || 1;
    planar.push({
      collider: {
        type: 'planar',
        bounce: range(random, 0.1, 1),
        width: range(random, 0.5, 8),
        height: range(random, 0.5, 8),
        position: vectorOf(random, 3, -2, 2),
        xVector: [1, 0, 0],
        yVector: [0, 1, 0],
        normal: normal.map((component) => component / length),
        constant: range(random, -2, 2),
      },
      position: vectorOf(random, 3, -4, 4),
      velocity: vectorOf(random, 3, -6, 6),
      step: pickStep(random),
    });
    spherical.push({
      collider: {
        type: 'spherical',
        bounce: range(random, 0.1, 1),
        radius: range(random, 0.3, 5),
        position: vectorOf(random, 3, -2, 2),
      },
      position: vectorOf(random, 3, -6, 6),
      velocity: n % 11 === 0 ? [0, 0, 0] : vectorOf(random, 3, -6, 6),
      step: pickStep(random),
    });
  }
  return { planar, spherical };
}

const pickStep = (random) => [1 / 60, 0.1, 0.5, 2][Math.floor(random() * 4)];

function affineGrid(random) {
  const affines = [];
  for (let n = 0; n < 80; n++) {
    const scale = n % 10 === 0 ? 0 : range(random, 0.3, 3);
    affines.push({
      a: Float32Array.from(rotationOf(random).map((value) => value * scale)),
      t: vectorOf(random, 3, -9, 9),
    });
  }
  return affines;
}

/** The pure rules over their argument grids, recorded in full (as digests per rule, plus the first cases). */
export function recordRules(modules) {
  const random = seededRandom(20261115);
  const clock = controllerGrid(random).map(([controller, ...values]) =>
    values.map((value) => modules.controllerTime(controller, value)),
  );
  const shoots = [];
  for (let h = -4; h <= 4; h += 0.37) for (let v = -2; v <= 2; v += 0.29) shoots.push(modules.shootDirection(h, v));
  const ramps = [];
  for (let n = 0; n < 120; n++) {
    const type = COLOUR_TYPES[n % 4];
    const count = [1, 2, 3, 5][n % 4];
    const keys = Array.from({ length: count }, (_, index) => ({
      time: index / Math.max(1, count - 1) + (n % 3) * 0.01,
      value: vectorOf(random, 4, 0, 1),
      inTan: type === 2 ? vectorOf(random, 4, -1, 1) : null,
      outTan: type === 2 ? vectorOf(random, 4, -1, 1) : null,
      tbc: type === 3 ? vectorOf(random, 3, -1, 1) : null,
    }));
    for (const time of [-0.5, 0, 0.13, 0.5, 0.77, 1, 1.4]) ramps.push(modules.interpColorKey(keys, time, type));
  }
  ramps.push(
    modules.interpColorKey([], 0.5),
    modules.interpColorKey(null, 0.5),
    modules.interpColorKey(undefined, 0.5, 2),
  );
  const { planar, spherical } = colliderGrid(random);
  const planes = planar.map((c) => modules.planarCollide(c.collider, c.position, c.velocity, c.step));
  const spheres = spherical.map((c) => modules.sphericalCollide(c.collider, c.position, c.velocity, c.step));
  const affines = affineGrid(random);
  const affineAnswers = affines.map((m, index) => {
    const other = affines[(index + 1) % affines.length];
    return {
      inverse: modules.affineInverse(m),
      scale: modules.affineScale(m),
      ortho: modules.affineOrthoNormalize(m),
      product: modules.affineMul(m, other),
      point: modules.affineApply(m, 1, 2, 3),
      direction: modules.affineRotate(m, 1, 2, 3),
    };
  });
  const quads = Array.from({ length: 9 }, (_, index) => ({
    pos: vectorOf(random, 3, -3, 3),
    size: range(random, 0.1, 4),
    color: vectorOf(random, 3, 0, 1),
    alpha: random() * (index % 2),
  }));
  const place = (x, y, z) => [x * 2 + 1, y - 3, z * 0.5];
  const packs = [
    modules.packParticleQuads([]),
    modules.packParticleQuads(quads),
    modules.packParticleQuads(quads, null, { place, sizeScale: 0.25 }),
    modules.packParticleQuads(quads.slice(0, 3), new Float32Array(500), { sizeScale: 3 }),
    modules.packParticleQuads(quads, new Float32Array(10)),
  ].map((pack) => ({
    count: pack.count,
    length: pack.packed.length,
    floats: Array.from(pack.packed.slice(0, 6 * modules.PARTICLE_FLOATS * 3)),
  }));
  const materials = [
    undefined,
    null,
    {},
    {
      alphaBlend: true,
      srcBlend: 4,
      dstBlend: 5,
      alphaTest: true,
      alphaThreshold: 128,
      depthTest: false,
      depthWrite: false,
      textureFile: 'a.dds',
      clampMode: 0,
      emissive: [0, 0, 0.2],
    },
    { vertexColorMode: modules.VERTEX_COLOR_MODE.Emission, emissive: [0, 0, 0] },
    { alphaTest: true, alphaThreshold: 0, emissive: [0, 0, 0] },
    { emissive: [0.1, 0, 0] },
    { emissive: [0, 0, 0], vertexColorMode: modules.VERTEX_COLOR_MODE.Diffuse },
  ];
  const states = materials.map((material) => modules.particleDrawState(material));
  return {
    clock: digestOf(clock),
    clockFirst: clock.slice(0, 12),
    shoots: digestOf(shoots),
    shootsFirst: shoots.slice(0, 6),
    ramps: digestOf(ramps),
    rampsFirst: ramps.slice(0, 14),
    planes: digestOf(planes),
    planesHit: planes.filter((answer) => answer !== null).length,
    spheres: digestOf(spheres),
    spheresHit: spheres.filter((answer) => answer !== null).length,
    affines: digestOf(affineAnswers),
    affinesFirst: affineAnswers.slice(0, 3),
    packs,
    states,
  };
}
