import { createHash } from 'node:crypto';
import { exactJson } from './nif-material-sweep.mjs';
import { seededRandom } from './mw-particle-sweep.mjs';

// A fixed set of inputs for the key-group sampler (src/formats/morrowind/mwKeys.js, with the tangent rule of
// src/formats/morrowind/nif-key-tangents.ts) and the way its answers are recorded. nif-key-tangents.test.ts runs the
// current code over these inputs and compares with the recording in test/fixtures/mw/key-parity.json, which was made
// from the implementation it replaced.
//
// The inputs are:
//   - seeded random key groups of every interpolation type, of one, three and four components, of zero to nine keys
//     with uneven spacing, repeated times and every extreme of tension, continuity and bias, each sampled at a grid of
//     times that reaches before the first key, every key, the middle of every segment and past the last key,
//   - with the game files, every key group found in every NIF and KF file of the three archives, sampled at a grid
//     of times over the span of the group. A file keeps one digest of the samples of its groups that are not TCB,
//     and each group that is TCB, the rule that was rewritten, keeps the sum, the least and the greatest of each
//     column of its samples.

const digestOf = (value) => createHash('sha256').update(exactJson(value)).digest('hex').slice(0, 8);

/** The interpolation type numbers of a key group (mwNifFile.js KEY_TYPE). */
const TYPE = { linear: 1, quadratic: 2, tbc: 3, constant: 5 };

/**
 * The sample times for a list of keys: before the first key, every key time, the middle and the quarter points of
 * every segment, and past the last key.
 */
export function timesFor(keys) {
  if (!keys.length) return [0];
  const times = [keys[0].time - 0.5, keys[0].time - 1e-6];
  keys.forEach((key, index) => {
    times.push(key.time);
    if (index + 1 < keys.length) {
      const next = keys[index + 1].time;
      for (const share of [0.01, 0.25, 0.5, 0.75, 0.99]) times.push(key.time + (next - key.time) * share);
    }
  });
  times.push(keys[keys.length - 1].time + 1e-6, keys[keys.length - 1].time + 0.5);
  return times;
}

/** A value of `dim` components from a seeded generator. */
function valueOf(random, dim) {
  const one = () => Math.fround((random() * 2 - 1) * 10);
  return dim === 1 ? one() : Array.from({ length: dim }, one);
}

const EXTREMES = [-1, 0, 1];

/** One seeded key group of the given type, dimension and key count. */
function groupOf(random, type, dim, count) {
  const keys = [];
  let time = Math.fround(random() * 2 - 0.5);
  for (let index = 0; index < count; index++) {
    // Mostly uneven spacing; now and then the same time again, which gives a segment of length zero.
    const repeat = index > 0 && random() < 0.12;
    if (index > 0 && !repeat) time = Math.fround(time + random() * 2);
    const key = { time, value: valueOf(random, dim) };
    if (type === TYPE.quadratic) {
      key.inTan = valueOf(random, dim);
      key.outTan = valueOf(random, dim);
    } else if (type === TYPE.tbc) {
      const pick = () => (random() < 0.3 ? EXTREMES[Math.floor(random() * 3)] : Math.fround(random() * 2 - 1));
      key.tbc = [pick(), pick(), pick()];
    }
    keys.push(key);
  }
  return { type: count ? type : 0, keys };
}

/** The seeded synthetic groups: { dim, group }. */
export function syntheticGroups() {
  const random = seededRandom(20261116);
  const out = [];
  for (const type of [TYPE.linear, TYPE.quadratic, TYPE.tbc, TYPE.constant]) {
    for (const dim of [1, 3, 4]) {
      for (const count of [0, 1, 2, 3, 4, 5, 7, 9]) {
        for (let copy = 0; copy < (type === TYPE.tbc ? 14 : 3); copy++) {
          out.push({ dim, group: groupOf(random, type, dim, count) });
        }
      }
    }
  }
  // A TCB group with a key that carries no tension, continuity and bias: the rule takes zero for each.
  const bare = groupOf(random, TYPE.tbc, 3, 4);
  delete bare.keys[1].tbc;
  out.push({ dim: 3, group: bare });
  return out;
}

/** What the sampler answers for one group over its sample times: the list of [time, answer]. */
export function sampleAll({ sampleKeyGroup }, { dim, group }) {
  return timesFor(group.keys).map((time) => [time, sampleKeyGroup(group, dim, time)]);
}

/** The synthetic groups sampled, in full. */
export function recordSynthetic({ modules }) {
  return syntheticGroups().map((entry) => sampleAll(modules, entry));
}

/** The segment lookup on a grid of times, over the synthetic groups' keys. */
export function recordSegments({ modules }) {
  return syntheticGroups()
    .filter(({ group }) => group.keys.length)
    .map(({ group }) => timesFor(group.keys).map((time) => modules.segment(group.keys, time)));
}

/** Every key group inside a parsed NIF record list: objects with a `keys` list and a numeric `type`. */
export function keyGroupsOf(nif) {
  const found = [];
  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (ArrayBuffer.isView(value)) return;
    if (Array.isArray(value.keys) && typeof value.type === 'number' && value.keys.length) {
      const first = value.keys[0].value;
      const dim = typeof first === 'number' ? 1 : Array.isArray(first) || ArrayBuffer.isView(first) ? first.length : 0;
      const complete = value.keys.every(
        (key) =>
          typeof key.time === 'number' &&
          (value.type !== TYPE.quadratic || (key.inTan !== undefined && key.outTan !== undefined)) &&
          (value.type !== TYPE.tbc || Array.isArray(key.tbc)),
      );
      if (dim && complete && [TYPE.linear, TYPE.quadratic, TYPE.tbc, TYPE.constant].includes(value.type)) {
        found.push({ dim, group: value });
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(nif.records);
  return found;
}

/** The sum, the least and the greatest of each of `width` columns of a flat list. */
export function columnsOf(values, width) {
  const sums = new Array(width).fill(0);
  const least = new Array(width).fill(Infinity);
  const greatest = new Array(width).fill(-Infinity);
  values.forEach((value, index) => {
    const column = index % width;
    sums[column] += value;
    if (value < least[column]) least[column] = value;
    if (value > greatest[column]) greatest[column] = value;
  });
  return { sums, least, greatest };
}

/**
 * Every key group of every NIF and KF file of the three archives, sampled. Per archive: the number of files, one digest
 * per file for its groups that are not TCB (every sample of every such group), and, for the files that hold a TCB
 * group, one column summary per TCB group.
 */
export function recordRetail({ dataPath, fs, path, modules }) {
  const { MwBsaFile, parseNif, sampleKeyGroup } = modules;
  const perArchive = {};
  const names = {};
  for (const name of ['Morrowind', 'Tribunal', 'Bloodmoon']) {
    const archive = new MwBsaFile(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.bsa`))));
    const files = archive
      .list()
      .filter((file) => file.endsWith('.nif') || file.endsWith('.kf'))
      .sort();
    const digests = [];
    const tcb = {};
    let groups = 0;
    for (const file of files) {
      let nif;
      try {
        nif = parseNif(archive.get(file).slice());
      } catch {
        digests.push('unparsed');
        continue;
      }
      const plain = [];
      const summaries = [];
      for (const entry of keyGroupsOf(nif)) {
        groups++;
        const samples = sampleAll({ sampleKeyGroup }, entry);
        if (entry.group.type === TYPE.tbc) {
          const flat = samples.flatMap(([, answer]) => (typeof answer === 'number' ? [answer] : Array.from(answer)));
          summaries.push({ dim: entry.dim, count: entry.group.keys.length, ...columnsOf(flat, entry.dim) });
        } else {
          plain.push(samples);
        }
      }
      digests.push(plain.length ? digestOf(plain) : 'none');
      if (summaries.length) tcb[file] = summaries;
    }
    perArchive[name] = { names: files.length, groups, digests, tcb };
    names[name] = files;
  }
  return { perArchive, names };
}
