// @ts-check
// A seeded random stream that gives the same numbers as the Random struct of Unity's Mathematics package.
//
// DFU draws the beach-line jitter in its terrain texturing from that generator, so the same numbers here give the same
// shore as DFU. Weather, the world clock, nature on terrain and the underwater decorations use it as their seeded
// stream too, where DFU draws from UnityEngine.Random, whose numbers are not published.
//
// The generator is Marsaglia's 32-bit xorshift with the shift triple (13, 17, 5):
//   - A stream starts from a nonzero uint32 seed and takes one step before its first value.
//   - Each step returns the state as it was before the step.
//   - createFromIndex turns a run of indices (0, 1, 2, ...) into well-spread seeds with Thomas Wang's 32-bit integer
//     hash of index + 62. The hash maps 61 to 0, which is not a usable seed; the offset moves that case to the last
//     index, 2^32 - 1.
//   - A float is the top 23 bits of the state as a fraction of 2^23, so it is in [0, 1) and exact in float32.
//   - An int in [min, max) is min plus the high 32 bits of the state times the range's width.

/** The multiplier of Thomas Wang's 32-bit integer hash. */
const WANG_MULTIPLIER = 0x27d4eb2d;
/** Added to an index before hashing, so that the index whose hash is 0 is the last one. */
const INDEX_OFFSET = 62;
/** The float scale for a 23-bit fraction: 2^-23. */
const FRACTION_SCALE = 1 / 0x800000;

/**
 * Thomas Wang's 32-bit integer hash.
 * @param {number} value a uint32
 * @returns {number} a uint32
 */
function wangHash(value) {
  let hash = (value ^ 61 ^ (value >>> 16)) >>> 0;
  hash = Math.imul(hash, 9) >>> 0;
  hash = (hash ^ (hash >>> 4)) >>> 0;
  hash = Math.imul(hash, WANG_MULTIPLIER) >>> 0;
  return (hash ^ (hash >>> 15)) >>> 0;
}

/**
 * One xorshift step with the triple (13, 17, 5).
 * @param {number} state a uint32
 * @returns {number} the next state, a uint32
 */
function xorshift(state) {
  let next = (state ^ (state << 13)) >>> 0;
  next = (next ^ (next >>> 17)) >>> 0;
  return (next ^ (next << 5)) >>> 0;
}

/**
 * The high 32 bits of the 64-bit product of two uint32 values.
 *
 * The product can need 64 bits, more than the 53 a double holds exactly, so `a` is split into 16-bit halves: each
 * partial product then fits in 48 bits, and the low half's carry into bit 32 is kept.
 * @param {number} a a uint32
 * @param {number} b a uint32
 * @returns {number} a uint32
 */
function highWordOfProduct(a, b) {
  const aHigh = a >>> 16;
  const aLow = a & 0xffff;
  const lowCarry = Math.floor((aLow * b) / 0x10000);
  return Math.floor((aHigh * b + lowCarry) / 0x10000);
}

export class UMRandom {
  /**
   * A stream from a seed. Every caller passes a nonzero uint32; a zero seed gives a stream of zeros.
   * @param {number} seed
   */
  constructor(seed) {
    /** @type {number} the xorshift state, a uint32 */
    this.state = seed >>> 0;
    this.nextState();
  }

  /**
   * A stream for one of a run of indices, such as the samples of a terrain tile.
   * @param {number} index a uint32
   */
  static createFromIndex(index) {
    return new UMRandom(wangHash((index + INDEX_OFFSET) >>> 0));
  }

  /**
   * Steps the stream.
   * @returns {number} the state before the step, a uint32
   */
  nextState() {
    const current = this.state;
    this.state = xorshift(current);
    return current;
  }

  /** @returns {number} a float32 in [0, 1) */
  nextFloat() {
    return (this.nextState() >>> 9) * FRACTION_SCALE;
  }

  /**
   * A float32 in [min, max): the float scaled by the range's width, plus min.
   *
   * The width, the scaled float and the sum are each rounded to float32. For bounds that are float32 values, which
   * every caller passes, that is Unity's float arithmetic. Other bounds are used as given, not rounded first: that is
   * what this stream has always done, and rounding them now would change the numbers.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextFloatRange(min, max) {
    const width = Math.fround(max - min);
    const scaled = Math.fround(this.nextFloat() * width);
    return Math.fround(scaled + min);
  }

  /**
   * An int in [min, max). The bounds are int32 and min <= max.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextIntRange(min, max) {
    const width = (max - min) >>> 0;
    return (highWordOfProduct(this.nextState(), width) + min) | 0;
  }
}
