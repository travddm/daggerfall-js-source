import { createHash } from 'node:crypto';
import { exactJson } from './nif-material-sweep.mjs';
import { seededRandom } from './mw-particle-sweep.mjs';

// A fixed set of inputs for the effect-mesh motion rules (src/formats/morrowind/nif-effect-motion.ts, reached
// through mwVfx.js) and the way their answers are recorded. nif-effect-motion.test.ts runs the current code over
// these inputs and compares with the recording in test/fixtures/mw/vfx-parity.json, which was made from the
// implementation it replaced.
//
// The inputs are:
//   - the billboard rotation: every mode against seeded random frames, the degenerate frames (the eye on the
//     node, straight above it, a look parallel to the up vector, zero vectors) and a ladder of sizes around the
//     two thresholds below which a frame counts as degenerate,
//   - the texture-coordinate transform, the flipbook slot and the visibility key lookup against grids that reach
//     the edges (no keys, equal times, NaN, a zero or negative step),
//   - with the game files, every NIF of the three archives read as an effect and run for four steps with seeded
//     dice under a fixed placement, view and eye: one digest of the descriptor per file, one digest of the
//     streams per file, and, for the files that hold a billboard (their answers come out of float arithmetic, so the
//     comparison there has a tolerance), the vertex count of each stream and the sum, least and greatest of each of its
//     columns.

const digestOf = (value) => createHash('sha256').update(exactJson(value)).digest('hex').slice(0, 8);

const describeError = (error) => (error.message.startsWith('NIF:') ? `${error.name}: ${error.message}` : error.name);

const round = (value) => Number(value.toPrecision(9));

/** A row-major 3x3 turn about a random axis, from a seeded generator. */
function randomTurn(random) {
  const axis = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
  const length = Math.hypot(...axis) || 1;
  const [x, y, z] = axis.map((component) => component / length);
  const angle = random() * Math.PI * 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return Float32Array.from([
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ]);
}

const IDENTITY = Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/** The billboard frames: { mode, base, translation, eye, look, up }. */
export function billboardCases() {
  const random = seededRandom(20261116);
  const range = (low, high) => low + (high - low) * random();
  const vector = (low, high) => [range(low, high), range(low, high), range(low, high)];
  const cases = [];
  const modes = [0, 1, 2, 3, 4, 5];
  for (const mode of modes) {
    for (let index = 0; index < 150; index++) {
      cases.push({
        mode,
        base: randomTurn(random),
        translation: vector(-50, 50),
        eye: vector(-300, 300),
        look: vector(-1, 1),
        up: vector(-1, 1),
      });
    }
    for (let index = 0; index < 20; index++) {
      cases.push({
        mode,
        base: IDENTITY,
        translation: vector(-5, 5),
        eye: vector(-30, 30),
        look: [0, 1, 0],
        up: [0, 0, 1],
      });
    }
  }
  const tip = [
    { eye: [0, 0, 0], look: [0, 1, 0], up: [0, 0, 1] },
    { eye: [3, 4, 5], look: [0, 0, 0], up: [0, 0, 1] },
    { eye: [3, 4, 5], look: [0, 1, 0], up: [0, 0, 0] },
    { eye: [0, 0, 90], look: [0, 0, -1], up: [0, 1, 0] },
    { eye: [0, 0, -90], look: [0, 0, 1], up: [0, 1, 0] },
  ];
  // A look along the up vector has no right-hand direction. Under a turned frame the two come out of float noise
  // that is not worth recording, so these run under the identity frame only, where the cross product is exactly zero.
  const along = [
    { eye: [3, 4, 5], look: [0, 0, 1], up: [0, 0, 1] },
    { eye: [3, 4, 5], look: [0, 0, -1], up: [0, 0, 1] },
    { eye: [3, 4, 5], look: [1, 0, 0], up: [-2, 0, 0] },
    { eye: [0, 90, 0], look: [0, -1, 0], up: [0, 1, 0] },
  ];
  for (const mode of modes) {
    for (const frame of [...tip, ...along]) cases.push({ mode, base: IDENTITY, translation: [0, 0, 0], ...frame });
    for (const frame of tip) cases.push({ mode, base: randomTurn(random), translation: [1, -2, 3], ...frame });
  }
  // A ladder around the two thresholds: the sideways distance for the rotate-about-up mode, and the size of the
  // two vertical components for the always-face-camera mode.
  for (const sideways of [0, 1e-14, 1e-13, 5e-13, 1e-12, 2e-12, 1e-11, 1e-9, 1e-7, 1e-6, 1e-3]) {
    cases.push({
      mode: 1,
      base: IDENTITY,
      translation: [0, 0, 0],
      eye: [sideways, 7, 0],
      look: [0, 1, 0],
      up: [0, 0, 1],
    });
    cases.push({
      mode: 1,
      base: IDENTITY,
      translation: [0, 0, 0],
      eye: [0, 7, sideways],
      look: [0, 1, 0],
      up: [0, 0, 1],
    });
    cases.push({
      mode: 1,
      base: IDENTITY,
      translation: [0, 0, 0],
      eye: [sideways * 0.6, 7, sideways * 0.8],
      look: [0, 1, 0],
      up: [0, 0, 1],
    });
  }
  for (const tilt of [0, 1e-9, 1e-8, 5e-8, 1e-7, 5e-7, 9e-7, 1e-6, 1.1e-6, 2e-6, 1e-5, 1e-3]) {
    cases.push({ mode: 0, base: IDENTITY, translation: [0, 0, 0], eye: [0, 0, 0], look: [1, 0, 0], up: [0, tilt, 1] });
    cases.push({ mode: 0, base: IDENTITY, translation: [0, 0, 0], eye: [0, 0, 0], look: [0, 0, 1], up: [0, 1, tilt] });
    cases.push({ mode: 0, base: IDENTITY, translation: [0, 0, 0], eye: [0, 0, 0], look: [1, tilt, 0], up: [0, 0, 1] });
    cases.push({
      mode: 0,
      base: IDENTITY,
      translation: [0, 0, 0],
      eye: [0, 0, 0],
      look: [tilt, 1, 0],
      up: [0, tilt, 1],
    });
  }
  return cases;
}

const KEY_LISTS = [
  null,
  undefined,
  [],
  [{ time: 0, value: 1 }],
  [{ time: 2, value: 0 }],
  [
    { time: 0, value: 1 },
    { time: 1, value: 0 },
  ],
  [
    { time: 0, value: 0 },
    { time: 0.5, value: 1 },
    { time: 1, value: 0 },
  ],
  [
    { time: 0.5, value: 1 },
    { time: 0.5, value: 0 },
  ],
  [
    { time: 0.5, value: 0 },
    { time: 0.5, value: 1 },
    { time: 0.5, value: 0 },
  ],
  [
    { time: 1, value: 0 },
    { time: 2, value: 1 },
    { time: 3, value: 'on' },
    { time: 4, value: null },
    { time: 5, value: NaN },
  ],
  [
    { time: 0, value: true },
    { time: 1, value: false },
    { time: 2, value: 2 },
    { time: 3, value: undefined },
  ],
  [
    { time: 0, value: 1 },
    { time: 0.25, value: 0 },
    { time: 0.5, value: 1 },
    { time: 0.75, value: 0 },
    { time: 1, value: 1 },
    { time: 1.25, value: 0 },
    { time: 1.5, value: 1 },
  ],
];
const KEY_TIMES = [-Infinity, -1, 0, 0.1, 0.25, 0.5, 0.999, 1, 1.5, 2, 3, 4.5, 5, 6, NaN, Infinity];

const UV_PARAMS = [
  {},
  { uTrans: 0.25 },
  { vTrans: -0.3 },
  { uScale: 2, vScale: 0.5 },
  { uTrans: 0.1, vTrans: 0.2, uScale: 3, vScale: 1.5 },
  { uScale: 0 },
  { vScale: 0 },
  { uTrans: undefined, vTrans: undefined, uScale: undefined, vScale: undefined },
  { uTrans: NaN },
  { uScale: -1, vScale: -1 },
];
const UV_VALUES = [-2, -0.5, 0, 0.25, 0.5, 1, 1.75, 3.3];

const FLIP_TIMES = [-1.3, -0.25, 0, 0.1, 0.25, 0.6, 0.8, 2.5, 1e6, NaN, Infinity];
const FLIP_STEPS = [0, 0.25, 0.1, -0.25, NaN, undefined, 1e-9, Infinity];
const FLIP_COUNTS = [-1, 0, 1, 2, 3, 7, NaN, undefined, 2.5];

/** The motion rules over their grids, one list of answers per rule. */
export function recordMotion({ modules }) {
  const { billboardRotation, uvAt, flipIndex, visAt } = modules;
  const billboard = billboardCases().map((frame) =>
    Array.from(billboardRotation(frame.mode, frame.base, frame.translation, frame.eye, frame.look, frame.up)),
  );
  const uv = [];
  for (const params of UV_PARAMS) {
    for (const u of UV_VALUES) for (const v of UV_VALUES) uv.push(uvAt(u, v, params));
  }
  const flip = [];
  for (const time of FLIP_TIMES) {
    for (const step of FLIP_STEPS) for (const count of FLIP_COUNTS) flip.push(flipIndex(time, step, count));
  }
  const visible = [];
  for (const keys of KEY_LISTS) for (const time of KEY_TIMES) visible.push(visAt(keys, time));
  return { billboard, uv, flip, visible };
}

function seedOf(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  return hash;
}

/** The sum, least and greatest of each column of a packed array. */
export function columnsOf(packed, width) {
  const sums = new Array(width).fill(0);
  const least = new Array(width).fill(Infinity);
  const greatest = new Array(width).fill(-Infinity);
  for (let at = 0; at < packed.length; at++) {
    const column = at % width;
    sums[column] += packed[at];
    least[column] = Math.min(least[column], packed[at]);
    greatest[column] = Math.max(greatest[column], packed[at]);
  }
  return { sums, least, greatest };
}

const STEP_SECONDS = 0.1;
const STEPS = 4;

/** Every NIF of the three archives read as an effect and run for a few steps. */
export function recordEffects({ dataPath, fs, path, modules }) {
  const { MwBsaFile, parseNif, vfxOf, createVfx, affineOfTransform, PARTICLE_FLOATS } = modules;
  const placement = affineOfTransform({
    rotation: randomTurn(seededRandom(7)),
    translation: [100, 50, 20],
    scale: 1.5,
  });
  const view = affineOfTransform({ rotation: IDENTITY, translation: [0, 0, -5], scale: 1 });
  const eye = { position: [300, -200, 120], look: [-0.5, 0.7, -0.3], up: [0, 0, 1] };
  const perArchive = {};
  const names = {};
  for (const name of ['Morrowind', 'Tribunal', 'Bloodmoon']) {
    const archive = new MwBsaFile(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.bsa`))));
    const files = archive
      .list()
      .filter((file) => file.endsWith('.nif'))
      .sort();
    const descriptors = [];
    const streams = [];
    const billboards = {};
    for (const file of files) {
      let nif;
      try {
        nif = parseNif(archive.get(file).slice());
      } catch {
        descriptors.push('unparsed');
        streams.push('unparsed');
        continue;
      }
      let desc;
      try {
        desc = vfxOf(nif);
      } catch (error) {
        descriptors.push(`throws: ${describeError(error)}`);
        streams.push('none');
        continue;
      }
      descriptors.push(digestOf([[...desc.nodes.entries()], desc.shapes, desc.particles, desc.length]));
      if (!desc.shapes.length && !desc.particles.length) {
        streams.push('none');
        continue;
      }
      const hasBillboard = [...desc.nodes.values()].some((node) => node.billboard !== null);
      const running = createVfx({ ...desc, length: Math.max(desc.length, 1) }, { rolls: seededRandom(seedOf(file)) });
      const frames = [];
      try {
        for (let step = 0; step < STEPS; step++) {
          const frame = running.update(STEP_SECONDS, { place: placement, view, eye });
          frames.push({
            time: round(frame.time),
            done: frame.done,
            streams: frame.streams.map((stream) => ({
              key: stream.key,
              count: stream.count,
              drawState: stream.drawState,
              texture: stream.texture,
              packed: Array.from(stream.packed.subarray(0, stream.count * PARTICLE_FLOATS)),
            })),
          });
        }
      } catch (error) {
        streams.push(`throws: ${describeError(error)}`);
        continue;
      }
      if (hasBillboard) {
        streams.push('billboard');
        billboards[file] = frames.map((frame) => ({
          ...frame,
          streams: frame.streams.map((stream) => ({ ...stream, packed: columnsOf(stream.packed, PARTICLE_FLOATS) })),
        }));
      } else {
        streams.push(digestOf(frames));
      }
    }
    perArchive[name] = { names: files.length, descriptors, streams, billboards };
    names[name] = files;
  }
  return { perArchive, names };
}
