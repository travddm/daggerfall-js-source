// A fixed set of inputs for UMRandom (src/formats/umRandom.js), and the way its answers are recorded.
//
// umRandomParity.test.js runs the current module over these inputs and compares with the recording in
// test/fixtures/umRandomParity.json, which was made from the implementation this module replaced. Every caller seeds
// with a nonzero uint32 (a zero seed is swapped for a fixed one before it reaches the constructor), so the inputs stay
// in that domain:
//   - streams made by createFromIndex, as the beach jitter makes one per terrain sample;
//   - streams made by the constructor, as weather, the world clock, nature and the underwater decorations make one;
//   - each stream read with nextFloat, nextFloatRange and nextIntRange, alone and interleaved.

const UINT32_LIMIT = 2 ** 32;

/** A deterministic uint32 sequence (Numerical Recipes' LCG), so the swept values need no list of their own. */
function* uint32Sequence(start) {
  let value = start >>> 0;
  for (;;) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    yield value;
  }
}

/** The first `count` values of a uint32 sequence, with zero skipped: no caller seeds with zero. */
function sweptUint32(start, count) {
  const values = [];
  for (const value of uint32Sequence(start)) {
    if (values.length === count) break;
    if (value !== 0) values.push(value);
  }
  return values;
}

// The ends of the index range, the values next to the +62 offset's wrap, and the indices the existing pins use.
const EDGE_INDICES = [
  0,
  1,
  2,
  3,
  7,
  61,
  62,
  63,
  255,
  256,
  16641,
  65535,
  65536,
  2 ** 31 - 1,
  2 ** 31,
  UINT32_LIMIT - 64,
  UINT32_LIMIT - 63,
  UINT32_LIMIT - 62,
  UINT32_LIMIT - 61,
  UINT32_LIMIT - 2,
  UINT32_LIMIT - 1,
];

// The ends of the seed range, the fallback seed the callers use for zero, and the seed the streaming test uses.
const EDGE_SEEDS = [1, 2, 3, 0x6e624eb7, 0xdead1234, 2 ** 31 - 1, 2 ** 31, UINT32_LIMIT - 2, UINT32_LIMIT - 1];

/** The fixed inputs: which streams are made, and how each is read. */
export const INPUTS = {
  indices: [...EDGE_INDICES, ...sweptUint32(0x1d4f0b3e, 256)],
  seeds: [...EDGE_SEEDS, ...sweptUint32(0x5eed5eed, 24)],
  // Values read from each stream in the plain sections.
  reads: 8,
  // The float bounds the callers pass (0..1, 1..2, the beach jitter's +-1.5, the streaming test's +-900), an empty
  // range, and spans that are wide, offset or not representable as float32. The last two are bounds where a width
  // rounded from the two doubles and a width from bounds rounded first give different floats for these seeds.
  floatRanges: [
    [0, 1],
    [1, 2],
    [-1.5, 1.5],
    [-900, 900],
    [-0.1, 0.1],
    [0.25, 0.75],
    [10, 20],
    [-1000.5, 2000.25],
    [3, 3],
    [0, 0.001],
    [1e6, 1e6 + 1],
    [-6.349040560889989, 9.100295137614012],
    [-3.115626205690205, 0.07070621708407998],
  ],
  // The int bounds the callers pass (1..32, -4..5), the empty and one-wide ranges, and spans that need the high bits
  // of the product of a 32-bit state and a 32-bit span.
  intRanges: [
    [1, 32],
    [-4, 5],
    [0, 1],
    [0, 2],
    [0, 100],
    [-50, 50],
    [7, 7],
    [0, 2 ** 31 - 1],
    [-(2 ** 31), 0],
    [-(2 ** 31), 2 ** 31 - 1],
  ],
  // Seeds read with every kind of call in turn, to show that each call takes one step of the stream.
  mixedSeeds: EDGE_SEEDS,
  mixedReads: 48,
};

/**
 * The answers of a UMRandom implementation over INPUTS.
 * @param {typeof import('../../src/formats/umRandom.js').UMRandom} UMRandom
 */
export function recordUmRandom(UMRandom, inputs = INPUTS) {
  const readFloats = (stream) => Array.from({ length: inputs.reads }, () => stream.nextFloat());

  const byIndex = inputs.indices.map((index) => readFloats(UMRandom.createFromIndex(index)));
  const bySeed = inputs.seeds.map((seed) => readFloats(new UMRandom(seed)));

  // A fresh stream for every seed and range, so a difference points at one range.
  const floatRanges = inputs.seeds.map((seed) =>
    inputs.floatRanges.map(([min, max]) => {
      const stream = new UMRandom(seed);
      return Array.from({ length: inputs.reads }, () => stream.nextFloatRange(min, max));
    }),
  );
  const intRanges = inputs.seeds.map((seed) =>
    inputs.intRanges.map(([min, max]) => {
      const stream = new UMRandom(seed);
      return Array.from({ length: inputs.reads }, () => stream.nextIntRange(min, max));
    }),
  );

  const mixed = inputs.mixedSeeds.map((seed) => {
    const stream = new UMRandom(seed);
    const values = [];
    for (let read = 0; read < inputs.mixedReads; read++) {
      const kind = read % 3;
      if (kind === 0) values.push(stream.nextFloat());
      else if (kind === 1) values.push(stream.nextFloatRange(-1.5, 1.5));
      else values.push(stream.nextIntRange(1, 32));
    }
    return values;
  });

  return { byIndex, bySeed, floatRanges, intRanges, mixed };
}
