// The running part of a Morrowind particle system: the controller's clock, the emitter, the modifiers that act on a
// live particle, the two colliders and the ageing. Nothing here touches GL or reads a file.
//
// The records come from nif.xml (NiParticleSystemController, NiParticleGrowFade, NiParticleColorModifier, NiGravity,
// NiPlanarCollider, NiSphericalCollider). The file says what the numbers mean, not how an engine runs them, so the
// rules below are written from first principles and checked against the recorded answers of the earlier code
// (test/formats/morrowind/mw-particle-sim.test.ts). Where a number is a tuning choice and not a fact of the format,
// the comment says so.
//
// mwParticles.js reads the descriptors out of a NIF file and hands them to createParticleSystem.

import { affineOfTransform, AFFINE_IDENTITY, affineMul, affineApply, affineRotate } from './mwAffine.js';
import { sampleKeyGroup } from './mwKeys.js';

export type Vec3 = number[];

/** A row-major 3x3 (rotation times a uniform scale) and a translation: the shape mwAffine.js composes. */
export interface Affine {
  a: ArrayLike<number>;
  t: number[];
}

/** NiNode's particle flags: the system plays by itself, and its particles live in the node's own space. */
export const PARTICLE_FLAG_AUTOPLAY = 0x0020;
export const PARTICLE_FLAG_LOCAL_SPACE = 0x0080;
/** NiTimeController: the active flag. */
export const CONTROLLER_FLAG_ACTIVE = 0x0008;
/** NiTimeController: the extrapolation bits, as the flags carry them (bits 1 and 2). */
export const EXTRAPOLATION = Object.freeze({ Cycle: 0, Reverse: 2, Constant: 4 });
/** NiParticleSystemController's emit flags: the birth rate is used as written instead of being fitted to the slots. */
export const EMIT_FLAG_NO_AUTO_ADJUST = 0x1;
/** NiBSPArrayController's emit-at-node and emit-at-vertex flags. */
export const BSP_AT_NODE = 0x8;
export const BSP_AT_VERTEX = 0x10;
/** NiGravity's field type: a push along one direction, or a pull toward a point. */
export const FORCE_TYPE = Object.freeze({ Wind: 0, Point: 1 });
/**
 * A tuning constant, not part of the format: the force a NiGravity carries is multiplied by this to give the pull
 * the retail flames and sparks show.
 */
export const GRAVITY_MAGIC = 1.6;

export interface ColourKey {
  time: number;
  value: number[];
  inTan: number[] | null;
  outTan: number[] | null;
  tbc: number[] | null;
}

export type Modifier =
  | { type: 'growFade'; grow: number; fade: number }
  | { type: 'gravity'; decay: number; force: number; fieldType: number; position: Vec3; direction: Vec3 }
  | { type: 'color'; keys: ColourKey[]; interpolation: number }
  | { type: 'bomb'; unsupported: true };

export interface PlanarCollider {
  type: 'planar';
  bounce: number;
  height: number;
  width: number;
  position: Vec3;
  xVector: Vec3;
  yVector: Vec3;
  normal: Vec3;
  constant: number;
}

export interface SphericalCollider {
  type: 'spherical';
  bounce: number;
  radius: number;
  position: Vec3;
}

export type Collider = PlanarCollider | SphericalCollider;

/** One of the controller's particle slots, as the file stores it. */
export interface SlotRecord {
  velocity: Vec3;
  age: number;
  lifeSpan: number;
  code: number;
}

export interface ControllerTerms {
  type: string;
  flags: number;
  frequency: number;
  phase: number;
  startTime: number;
  stopTime: number;
  extrapolation: number;
  speed: number;
  speedVariation: number;
  declination: number;
  declinationVariation: number;
  planarAngle: number;
  planarAngleVariation: number;
  initialColor: number[];
  initialSize: number;
  emitStart: number;
  emitStop: number;
  birthRate: number;
  lifetime: number;
  lifetimeVariation: number;
  emitFlags: number;
  emitterDimensions: Vec3;
  bspFlags: number;
  particles: SlotRecord[];
}

/** A NIF node's transform. */
export interface NodeTransform {
  rotation: ArrayLike<number>;
  translation: Vec3;
  scale: number;
}

/** What mwParticles.js builds from a file for one particle geometry. */
export interface ParticleDescriptor {
  kind: 'particles';
  name: string;
  ref: number;
  world: NodeTransform;
  localSpace: boolean;
  autoPlay: boolean;
  controller: ControllerTerms;
  emitter: { ref: number; world: NodeTransform } | null;
  data: {
    numParticles: number;
    numActive: number;
    vertices: Float32Array | null;
    sizes: Float32Array | null;
    radius: number;
  };
  modifiers: Modifier[];
  colliders: Collider[];
  material: unknown;
}

/** One live particle. */
interface Particle {
  pos: Vec3;
  vel: Vec3;
  age: number;
  life: number;
  size: number;
  color: number[];
  colorA: number;
  alpha: number;
}

/** One billboard a system asks to be drawn. */
export interface Quad {
  pos: Vec3;
  size: number;
  color: number[];
  alpha: number;
}

// ---- affine helpers ----------------------------------------------------------

/** The inverse of an affine with a 3x3 that is invertible (a singular one inverts to the zero matrix). */
export function affineInverse(m: Affine): Affine {
  const a = m.a;
  const determinant =
    a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const scale = determinant !== 0 ? 1 / determinant : 0;
  const inverse = new Float32Array([
    (a[4] * a[8] - a[5] * a[7]) * scale,
    (a[2] * a[7] - a[1] * a[8]) * scale,
    (a[1] * a[5] - a[2] * a[4]) * scale,
    (a[5] * a[6] - a[3] * a[8]) * scale,
    (a[0] * a[8] - a[2] * a[6]) * scale,
    (a[2] * a[3] - a[0] * a[5]) * scale,
    (a[3] * a[7] - a[4] * a[6]) * scale,
    (a[1] * a[6] - a[0] * a[7]) * scale,
    (a[0] * a[4] - a[1] * a[3]) * scale,
  ]);
  const [tx, ty, tz] = m.t;
  return {
    a: inverse,
    t: [
      -(inverse[0] * tx + inverse[1] * ty + inverse[2] * tz),
      -(inverse[3] * tx + inverse[4] * ty + inverse[5] * tz),
      -(inverse[6] * tx + inverse[7] * ty + inverse[8] * tz),
    ],
  };
}

/** The uniform scale an affine carries: the length of its first column. */
export function affineScale(m: Affine): number {
  return Math.hypot(m.a[0], m.a[3], m.a[6]);
}

/** The same placement with the scale divided out of the 3x3 (a zero scale counts as one). */
export function affineOrthoNormalize(m: Affine): Affine {
  const scale = affineScale(m) || 1;
  const a = new Float32Array(9);
  for (let i = 0; i < 9; i++) a[i] = m.a[i] / scale;
  return { a, t: [m.t[0], m.t[1], m.t[2]] };
}

function normalized(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

// ---- the controller's clock ----------------------------------------------------

/**
 * The time a NiTimeController reads for a caller's clock value: scaled by the frequency, shifted by the phase, and
 * inside [startTime, stopTime] as it stands. Outside the window the extrapolation bits decide: Cycle repeats the
 * window, Reverse runs it back and forth, anything else (Constant) holds the nearest end.
 */
export function controllerTime(
  c: Pick<ControllerTerms, 'frequency' | 'phase' | 'startTime' | 'stopTime' | 'extrapolation'>,
  value: number,
): number {
  const time = c.frequency * value + c.phase;
  if (time >= c.startTime && time <= c.stopTime) return time;
  const length = c.stopTime - c.startTime;
  if (c.extrapolation === EXTRAPOLATION.Cycle || c.extrapolation === EXTRAPOLATION.Reverse) {
    if (length <= 0) return c.startTime;
    const windows = (time - c.startTime) / length;
    const intoWindow = (windows - Math.floor(windows)) * length;
    if (c.extrapolation === EXTRAPOLATION.Cycle) return c.startTime + intoWindow;
    const forward = Math.abs(Math.floor(windows)) % 2 === 0;
    return forward ? c.startTime + intoWindow : c.stopTime - intoWindow;
  }
  return Math.min(c.stopTime, Math.max(c.startTime, time));
}

/**
 * A NiParticleColorModifier's colour at a point of the particle's life (0 at birth, 1 at death), as rgba. The keys
 * are an ordinary key group of four values; an empty or missing list is opaque white.
 */
export function interpColorKey(keys: ColourKey[] | null | undefined, time: number, interpolation = 1): number[] {
  if (!keys || !keys.length) return [1, 1, 1, 1];
  return sampleKeyGroup({ keys, type: interpolation }, 4, time);
}

// ---- emission ----------------------------------------------------------------------

/**
 * A unit vector tipped `declination` away from +Z toward +X, then turned `planarAngle` about +Z: the polar form
 * NiParticleSystemController's declination and planar angle describe.
 */
export function shootDirection(planarAngle: number, declination: number): Vec3 {
  const sideways = Math.sin(declination);
  return [sideways * Math.cos(planarAngle), sideways * Math.sin(planarAngle), Math.cos(declination)];
}

/**
 * Turns an elapsed time into a whole number of births, carrying the fraction to the next step. A fraction above one
 * releases one more birth, never several.
 */
function createBirthCounter(birthsPerSecond: number): (seconds: number) => number {
  let carried = 0;
  return (seconds) => {
    const expected = seconds * birthsPerSecond;
    let births = Math.trunc(expected);
    carried += expected - births;
    if (carried > 1) {
      births += 1;
      carried -= 1;
    }
    return Math.max(0, births);
  };
}

// ---- colliders ----------------------------------------------------------------------

/**
 * The velocity of a particle after it hits a NiPlanarCollider in this step, or null when it does not. The particle
 * hits when it moves toward the plane and ends the step on the other side, inside the rectangle: `width` along the
 * collider's x vector and `height` along its y vector, centred on its position. The plane's normal is used reversed.
 * The bounce factor scales the reflected velocity.
 */
export function planarCollide(collider: PlanarCollider, position: Vec3, velocity: Vec3, step: number): Vec3 | null {
  const normal = [-collider.normal[0], -collider.normal[1], -collider.normal[2]];
  const distance = normal[0] * position[0] + normal[1] * position[1] + normal[2] * position[2] + collider.constant;
  const approach = velocity[0] * normal[0] + velocity[1] * normal[1] + velocity[2] * normal[2];
  if (distance * approach >= 0) return null;
  const distanceAfter = distance + approach * step;
  if (distance * distanceAfter > 0) return null;
  const offset = [
    position[0] - collider.position[0],
    position[1] - collider.position[1],
    position[2] - collider.position[2],
  ];
  const along = offset[0] * collider.xVector[0] + offset[1] * collider.xVector[1] + offset[2] * collider.xVector[2];
  const up = offset[0] * collider.yVector[0] + offset[1] * collider.yVector[1] + offset[2] * collider.yVector[2];
  if (-collider.width * 0.5 > along || collider.width * 0.5 < along) return null;
  if (-collider.height * 0.5 > up || collider.height * 0.5 < up) return null;
  const twice = 2 * approach;
  return [
    (velocity[0] - normal[0] * twice) * collider.bounce,
    (velocity[1] - normal[1] * twice) * collider.bounce,
    (velocity[2] - normal[2] * twice) * collider.bounce,
  ];
}

/**
 * The velocity of a particle after it hits a NiSphericalCollider in this step, or null when it does not. The path
 * is a ray; the surface is met at the time the ray enters the sphere (or, for a particle already inside, leaves it),
 * and the particle is reflected about the surface normal there.
 */
export function sphericalCollide(
  collider: SphericalCollider,
  position: Vec3,
  velocity: Vec3,
  step: number,
): Vec3 | null {
  const fromCentre = [
    position[0] - collider.position[0],
    position[1] - collider.position[1],
    position[2] - collider.position[2],
  ];
  const radiusSquared = collider.radius * collider.radius;
  const distanceSquared = fromCentre[0] * fromCentre[0] + fromCentre[1] * fromCentre[1] + fromCentre[2] * fromCentre[2];
  const inside = distanceSquared <= radiusSquared;
  const towardCentre = fromCentre[0] * velocity[0] + fromCentre[1] * velocity[1] + fromCentre[2] * velocity[2];
  if (!inside && towardCentre >= 0) return null;
  const speedSquared = velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2];
  if (speedSquared === 0) return null;
  // The ray's closest approach to the centre happens at this time, at this offset from the centre.
  const closest = -towardCentre / speedSquared;
  const offset = [
    fromCentre[0] + velocity[0] * closest,
    fromCentre[1] + velocity[1] * closest,
    fromCentre[2] + velocity[2] * closest,
  ];
  const offsetSquared = offset[0] * offset[0] + offset[1] * offset[1] + offset[2] * offset[2];
  if (!inside && offsetSquared >= radiusSquared) return null;
  const halfChord = Math.sqrt((radiusSquared - offsetSquared) / speedSquared);
  const hitTime = inside ? halfChord + closest : closest - halfChord;
  if (hitTime >= step) return null;
  const contact = [
    position[0] + velocity[0] * hitTime,
    position[1] + velocity[1] * hitTime,
    position[2] + velocity[2] * hitTime,
  ];
  const normal = normalized([
    contact[0] - collider.position[0],
    contact[1] - collider.position[1],
    contact[2] - collider.position[2],
  ]);
  const along = velocity[0] * normal[0] + velocity[1] * normal[1] + velocity[2] * normal[2];
  return [
    (velocity[0] - normal[0] * 2 * along) * collider.bounce,
    (velocity[1] - normal[1] * 2 * along) * collider.bounce,
    (velocity[2] - normal[2] * 2 * along) * collider.bounce,
  ];
}

// ---- the system ----------------------------------------------------------------------

export interface ParticleSystem {
  desc: ParticleDescriptor;
  /** Why the system emits nothing, or null. */
  unsupported: string | null;
  readonly particles: Particle[];
  readonly quota: number;
  readonly rate: number;
  readonly emitterToPs: Affine;
  readonly frozen: boolean;
  readonly enabled: boolean;
  update(dt: number, clock?: number | null, frame?: Affine | null, emitterFrame?: Affine | null): void;
  quads(): Quad[];
}

export interface ParticleSystemOptions {
  /** Uniform dice on [0, 1]; injectable so that a test can fix them. */
  rolls?: () => number;
}

/** The slots of a system that the file leaves alive at load: where they stand and how old they are. */
function initialParticles(desc: ParticleDescriptor, quota: number): Particle[] {
  const c = desc.controller;
  const d = desc.data;
  const made: Particle[] = [];
  if (!d.vertices) return made;
  const live = Math.min(d.numActive, c.particles.length);
  for (let index = 0; index < live; index++) {
    const slot = c.particles[index];
    if (slot.lifeSpan <= 0) continue;
    if (slot.code * 3 + 2 >= d.vertices.length) continue;
    if (made.length >= quota) break;
    let size = c.initialSize;
    if (d.sizes && slot.code < d.sizes.length) size *= d.sizes[slot.code];
    made.push({
      pos: [d.vertices[slot.code * 3], d.vertices[slot.code * 3 + 1], d.vertices[slot.code * 3 + 2]],
      vel: [slot.velocity[0], slot.velocity[1], slot.velocity[2]],
      age: Math.max(0, slot.age),
      life: slot.lifeSpan,
      size,
      color: [c.initialColor[0], c.initialColor[1], c.initialColor[2]],
      colorA: c.initialColor[3],
      alpha: 1,
    });
  }
  return made;
}

/** The births a second the controller asks for: the written rate, or the rate that keeps its slots full. */
function birthRateOf(c: ControllerTerms): number {
  if ((c.emitFlags & EMIT_FLAG_NO_AUTO_ADJUST) !== 0) return c.birthRate;
  if (c.lifetime === 0 && c.lifetimeVariation === 0) return 0;
  return c.particles.length / (c.lifetime + c.lifetimeVariation / 2);
}

/**
 * A running system built from a descriptor. `update(dt, clock)` emits, acts on and ages the particles; `quads()`
 * answers what to draw. `frame` is for particles kept in a space other than the node's (the world, under the
 * absolute reference frame): the node's frame in that space. Null keeps the particles in the node's space.
 */
export function createParticleSystem(desc: ParticleDescriptor, options: ParticleSystemOptions = {}): ParticleSystem {
  const rolls = options.rolls ?? Math.random;
  const c = desc.controller;
  const quota = Math.max(0, desc.data.numParticles | 0);
  const rate = birthRateOf(c);
  const countBirths = createBirthCounter(rate);
  let frozen = !desc.autoPlay;
  let enabled = true;
  const unsupported =
    desc.controller.bspFlags & BSP_AT_VERTEX
      ? 'NiBSPArrayController emits at a target’s vertices, which this port does not draw'
      : null;

  const slowest = c.speed - c.speedVariation * 0.5;
  const fastest = c.speed + c.speedVariation * 0.5;
  const halfBox = [c.emitterDimensions[0] / 2, c.emitterDimensions[1] / 2, c.emitterDimensions[2] / 2];

  // The emitter node's frame as seen from the particle node: out through the file's root, then back in.
  const nodeFrame = affineOfTransform(desc.world);
  const emitterToPs: Affine = desc.emitter
    ? affineOrthoNormalize(affineMul(affineInverse(nodeFrame), affineOfTransform(desc.emitter.world)))
    : AFFINE_IDENTITY;

  const particles = initialParticles(desc, quota);

  const growFade = desc.modifiers.find((m) => m.type === 'growFade') as
    Extract<Modifier, { type: 'growFade' }> | undefined;
  const colour = desc.modifiers.find((m) => m.type === 'color') as Extract<Modifier, { type: 'color' }> | undefined;
  const gravities = desc.modifiers.filter((m) => m.type === 'gravity') as Extract<Modifier, { type: 'gravity' }>[];

  /** Sets the new particle's velocity and life from the controller's angles, speeds and lifetimes. */
  function launch(p: Particle): void {
    const planar = c.planarAngle + c.planarAngleVariation * (2 * rolls() - 1);
    const declination = c.declination + c.declinationVariation * (2 * rolls() - 1);
    const direction = shootDirection(planar, declination);
    const speed = slowest + (fastest - slowest) * rolls();
    p.vel = [direction[0] * speed, direction[1] * speed, direction[2] * speed];
    p.life = Math.max(Number.EPSILON, c.lifetime + c.lifetimeVariation * rolls());
  }

  /** Births this step's particles in the emitter's box, then carries them into the frame particles are kept in. */
  function emit(dt: number, frame: Affine | null, emitterFrame: Affine): void {
    if (!enabled || frozen) return;
    const births = countBirths(dt);
    for (let i = 0; i < births && particles.length < quota; i++) {
      const p: Particle = {
        pos: [(2 * rolls() - 1) * halfBox[0], (2 * rolls() - 1) * halfBox[1], (2 * rolls() - 1) * halfBox[2]],
        vel: [0, 0, 0],
        age: 0,
        life: 0,
        size: c.initialSize,
        color: [c.initialColor[0], c.initialColor[1], c.initialColor[2]],
        colorA: c.initialColor[3],
        alpha: 1,
      };
      launch(p);
      p.pos = affineApply(emitterFrame, p.pos[0], p.pos[1], p.pos[2]);
      p.vel = affineRotate(emitterFrame, p.vel[0], p.vel[1], p.vel[2]);
      if (frame) {
        p.pos = affineApply(frame, p.pos[0], p.pos[1], p.pos[2]);
        p.vel = affineRotate(frame, p.vel[0], p.vel[1], p.vel[2]);
      }
      particles.push(p);
    }
  }

  /** The size a grow-and-fade modifier gives a particle: the default size, ramped up at birth and down at death. */
  function sizeAt(p: Particle, modifier: Extract<Modifier, { type: 'growFade' }>): number {
    let size = c.initialSize;
    if (p.age < modifier.grow && modifier.grow !== 0) size *= p.age / modifier.grow;
    if (p.life - p.age < modifier.fade && modifier.fade !== 0) size *= (p.life - p.age) / modifier.fade;
    return size;
  }

  /**
   * Adds one NiGravity's push to a particle. A wind pushes along its direction and fades with the distance from the
   * plane through its position; a point field pulls toward its position and fades with the distance to it.
   * `local` is the particle in the node's space, where the field is authored; the push is turned into the frame the
   * particles are kept in.
   */
  function pushByGravity(
    p: Particle,
    g: Extract<Modifier, { type: 'gravity' }>,
    local: Vec3,
    dt: number,
    frame: Affine | null,
  ): void {
    let heading: Vec3;
    let fade = 1;
    if (g.fieldType === FORCE_TYPE.Wind) {
      heading = normalized(g.direction);
      if (g.decay !== 0) {
        const distance = Math.abs(
          heading[0] * (local[0] - g.position[0]) +
            heading[1] * (local[1] - g.position[1]) +
            heading[2] * (local[2] - g.position[2]),
        );
        fade = Math.exp(-g.decay * distance);
      }
    } else {
      const toField = [g.position[0] - local[0], g.position[1] - local[1], g.position[2] - local[2]];
      const distance = Math.hypot(toField[0], toField[1], toField[2]);
      if (g.decay !== 0) fade = Math.exp(-g.decay * distance);
      heading = distance > 0 ? [toField[0] / distance, toField[1] / distance, toField[2] / distance] : [0, 0, 0];
    }
    const strength = g.force * dt * fade * GRAVITY_MAGIC;
    const push = frame ? affineRotate(frame, heading[0], heading[1], heading[2]) : heading;
    p.vel[0] += push[0] * strength;
    p.vel[1] += push[1] * strength;
    p.vel[2] += push[2] * strength;
  }

  /** Every modifier, then every collider, over every live particle, in the order the descriptor lists them. */
  function act(dt: number, frame: Affine | null): void {
    const toNode = frame ? affineInverse(frame) : null;
    for (const p of particles) {
      if (growFade) p.size = sizeAt(p, growFade);
      if (colour) {
        const rgba = interpColorKey(colour.keys, p.age / p.life, colour.interpolation);
        p.color = [rgba[0], rgba[1], rgba[2]];
        p.colorA = 1;
        p.alpha = rgba[3];
      }
      for (const g of gravities) {
        const local = toNode ? affineApply(toNode, p.pos[0], p.pos[1], p.pos[2]) : p.pos;
        pushByGravity(p, g, local, dt, frame);
      }
      for (const collider of desc.colliders) {
        const local = toNode ? affineApply(toNode, p.pos[0], p.pos[1], p.pos[2]) : p.pos;
        const velocity = toNode ? affineRotate(toNode, p.vel[0], p.vel[1], p.vel[2]) : p.vel;
        const bounced =
          collider.type === 'planar'
            ? planarCollide(collider, local, velocity, dt)
            : sphericalCollide(collider, local, velocity, dt);
        if (bounced) p.vel = frame ? affineRotate(frame, bounced[0], bounced[1], bounced[2]) : bounced;
      }
    }
  }

  /** A particle past its life is dropped, judged by the age it had before this step; the others move. */
  function age(dt: number): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const lived = p.life > 0 ? p.age / p.life : 0;
      p.age += dt;
      if (lived > 1) {
        particles.splice(i, 1);
        continue;
      }
      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;
    }
  }

  return {
    desc,
    unsupported,
    get particles() {
      return particles;
    },
    get quota() {
      return quota;
    },
    get rate() {
      return rate;
    },
    get emitterToPs() {
      return emitterToPs;
    },
    get frozen() {
      return frozen;
    },
    get enabled() {
      return enabled;
    },
    /**
     * One step of `dt` seconds. `clock` is the controller's input; null or missing freezes the system. The system
     * emits while the controller's own time is inside [emitStart, emitStop). `emitterFrame` is the emitter's frame in
     * the particle node's space for this step; without it the file's own is used.
     */
    update(dt, clock = null, frame = null, emitterFrame = null) {
      if (clock === null || clock === undefined) {
        frozen = true;
        return;
      }
      const time = controllerTime(c, clock);
      frozen = false;
      enabled = time >= c.emitStart && time < c.emitStop;
      if (unsupported) return;
      emit(dt, frame, emitterFrame ? affineOrthoNormalize(emitterFrame) : emitterToPs);
      act(dt, frame);
      age(dt);
    },
    /** The billboards: centre, half-extent, colour and alpha (the colour key's alpha times the initial colour's). */
    quads() {
      return particles.map((p) => ({
        pos: [p.pos[0], p.pos[1], p.pos[2]],
        size: p.size,
        color: p.color,
        alpha: p.colorA * p.alpha,
      }));
    },
  };
}
