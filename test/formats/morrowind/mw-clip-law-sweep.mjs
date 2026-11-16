import { createHash } from 'node:crypto';

// A fixed set of inputs for the clip law (the text-key rules in src/formats/morrowind/mw-clip-law.ts), and the way
// its answers are recorded. mw-clip-law.test.ts runs the current code over these inputs and compares with the
// recording in test/fixtures/mw/mw-clip-law-parity.json, which was made from the implementation it replaced.
//
// The inputs are:
//   - every distinct list of text keys in the .nif and .kf files of Morrowind.bsa, Tribunal.bsa and Bloodmoon.bsa
//     (kept in the recording, so the test does not need the game files),
//   - seeded random lists on a coarse time grid, so that duplicate times, doubled blocks, prefix groups, stops with a
//     trailing character, stops before starts and loop windows with no width all occur (rebuilt from the seed),
//   - hand-written lists and argument shapes.
// For every list and every group it names, the answers are the clip range under eleven option sets, the playback of
// each clip at three step sizes (the fired keys and the whole state after every step), the lookups by key text, and
// the velocity along a seeded track. A list's groups are recorded as one short digest each, because the full answers
// run to several megabytes; the hand-written cases are recorded in full.

const RESET_OPTIONS = [
  {},
  { loopFallback: true },
  { start: 'loop start' },
  { start: 'loop start', loopFallback: true },
  { stop: 'loop stop', loopFallback: true },
  { startPoint: 0.5, loopFallback: true },
  { startPoint: 1 },
  { startPoint: 0.75, start: 'loop start', stop: 'loop stop', loopFallback: true },
  { loopFallback: true, loopCount: 2 },
  { loopFallback: true, loopingEnabled: false },
  { start: 'chop start', stop: 'chop hit' },
];
const STEP_SIZES = [1 / 60, 0.3, 2];
const STEPS_PER_RUN = 60;
const KEY_SUFFIXES = [': start', ': stop', ': loop start', ': loop stop', ': chop hit', ''];

/** JSON that keeps Infinity and NaN, which plain JSON turns into null. */
export const exactJson = (value) =>
  JSON.stringify(value, (_key, inner) => {
    if (typeof inner === 'number' && !Number.isFinite(inner)) return `number:${inner}`;
    if (inner === undefined) return 'undefined';
    return inner;
  });

const digestOf = (value) => createHash('sha256').update(exactJson(value)).digest('hex').slice(0, 12);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lists of text keys: the retail ones, then seeded random ones built from a small alphabet. */
export function syntheticLists() {
  const random = seededRandom(20261113);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const groups = ['idle', 'idle2', 'idle3', 'walkforward', 'attack1'];
  const actions = [
    'start',
    'stop',
    'stop.',
    'loop start',
    'loop stop',
    'chop start',
    'chop hit',
    'min attack',
    'sto',
    'start start',
  ];
  const lists = [];
  for (let n = 0; n < 400; n++) {
    const count = 2 + Math.floor(random() * 14);
    const keys = [];
    for (let i = 0; i < count; i++) {
      const time = Math.floor(random() * 9) * 0.25;
      const text =
        random() < 0.08 ? pick(['sound: swish', 'soundgen: left', 'noise']) : `${pick(groups)}: ${pick(actions)}`;
      keys.push({ time, text });
    }
    // Three out of four lists are in time order, as the files' own lists are; the rest are not.
    if (n % 4 !== 3) keys.sort((a, b) => a.time - b.time);
    lists.push({ id: `synthetic-${n}`, keys });
  }
  return lists;
}

/** A translation track with a seeded position at every key time of the list, as the velocity search reads it. */
export function trackFor(keys, seed, linear) {
  const random = seededRandom(seed);
  const times = [...new Set(keys.map((key) => key.time))].sort((a, b) => a - b);
  const points = times.map((time) => ({ time, value: [random() * 100, random() * 100, random() * 100] }));
  return { translations: { type: linear, keys: points } };
}

/** The distinct key lists of the retail files. Only the recording step calls this. */
export function readInputs({ dataPath, fs, path, modules }) {
  const { MwBsaFile, parseNif, collectTextKeys, normalizeTextKeys } = modules;
  const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map(
    (name) => new MwBsaFile(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.bsa`)))),
  );
  const byKeys = new Map();
  for (const archive of archives) {
    for (const name of archive.list().sort()) {
      if (!name.endsWith('.kf') && !name.endsWith('.nif')) continue;
      const keys = normalizeTextKeys(collectTextKeys(parseNif(archive.get(name).slice())));
      if (!keys.length) continue;
      const pairs = keys.map((key) => [key.time, key.text]);
      const id = JSON.stringify(pairs);
      if (!byKeys.has(id)) byKeys.set(id, { files: [], keys: pairs });
      byKeys.get(id).files.push(name);
    }
  }
  return { lists: [...byKeys.values()].map((list) => ({ files: list.files.slice(0, 3), keys: list.keys })) };
}

const asKeys = (pairs) => pairs.map(([time, text]) => ({ time, text }));

/** Plays one clip at one step size and answers the fired keys and the state after each step. */
function playClip(law, keys, clip, stepSize) {
  const state = { ...clip };
  const steps = [];
  for (let step = 0; step < STEPS_PER_RUN; step++) {
    const fired = [];
    law.advanceClip(state, keys, stepSize, (text, time, mine) => fired.push([text, time, mine]));
    steps.push([fired, { ...state }]);
    if (!state.playing) break;
  }
  return steps;
}

/** Every answer about one group of one list, as one value. */
function answersForGroup(law, keys, group, track) {
  const resets = RESET_OPTIONS.map((options) => law.resetClip(keys, group, options));
  const plays = [];
  resets.forEach((clip, index) => {
    if (!clip.ok) return;
    for (const stepSize of STEP_SIZES) plays.push([index, stepSize, playClip(law, keys, clip, stepSize)]);
  });
  const lookups = KEY_SUFFIXES.map((suffix) => law.getTextKeyTime(keys, `${group}${suffix}`));
  return {
    resets,
    plays,
    lookups,
    start: law.getStartTime(keys, group),
    velocity: law.animVelocity(keys, track, group),
    looping: law.isLoopingAnimation(keys, group),
    groupName: law.textKeyGroup(`${group}: start`),
  };
}

/** The answers over a set of lists: per list, the groups it names (sorted) and one digest per group. */
function answersForLists(law, lists, linear) {
  return lists.map((list, index) => {
    const keys = list.keys;
    const track = trackFor(keys, index + 1, linear);
    const groups = law.clipGroups(keys);
    return {
      groups,
      sorted: law.normalizeTextKeys(keys).length,
      digests: groups.map((group) => digestOf(answersForGroup(law, keys, group, track))),
      // A group the list does not name, and the empty and odd names.
      absent: ['', 'nosuchgroup', 'IDLE', 'idle: start'].map((group) =>
        digestOf(answersForGroup(law, keys, group, track)),
      ),
    };
  });
}

const HAND_TEXTS = [
  [{ time: 0, text: 'Idle: Start\r\nIdle: Stop' }],
  [{ time: 1, text: ' Walk: Loop Start \n\n SoundGen: Left\rwalk: LOOP STOP' }],
  [
    { time: 0, text: '' },
    { time: 1, text: '\r\n' },
    { time: 2, text: undefined },
    { time: 3, text: null },
  ],
  [
    { time: 0, text: 'K: start' },
    { time: 1, text: 'İ: stop' },
    { time: 2, text: 'ÀÉ: Stop' },
  ],
  [
    { time: 0, text: 'idle: start\tx' },
    { time: 0, text: '  ' },
    { time: 0.5, text: 'a b' },
  ],
  [
    { time: 0, text: 5 },
    { time: 1, text: ['idle: start'] },
  ],
];
const HAND_STATES = [
  null,
  undefined,
  { time: 0, loopStopTime: Infinity, loopingEnabled: true, loopCount: Infinity },
  { time: 1, loopStopTime: 1, loopingEnabled: true, loopCount: 1 },
  { time: 1, loopStopTime: 1, loopingEnabled: true, loopCount: 0 },
  { time: 1, loopStopTime: 1, loopingEnabled: false, loopCount: 5 },
  { time: 0.9, loopStopTime: 1, loopingEnabled: true, loopCount: 5 },
  { time: 2, loopStopTime: 1, loopingEnabled: 1, loopCount: 0.5 },
];
const HAND_GROUPS = [
  'idle',
  'Idle',
  'IDLE1H',
  'idle1h',
  'idlebow',
  'idlecrossbow',
  'idlecross',
  'walkforward1s',
  'walkforward2w',
  'spellturnleft',
  '1hidle',
  'idle9',
  'idle10',
  'move',
  'equip',
  'torch',
  'torchbow',
  'jump',
  'jumphh',
  'knockout',
  'swimknockout',
  'inventoryweapontwowide',
  'inventoryweapontwowide2c',
  'sneakleft',
  'swimsneakleft',
  'turnright1b',
  'idlestorm',
  'idlestormspell',
  'idle2',
  'idle2c',
  'idle2w',
  'bow',
  'crossbow',
  '',
  'İdle',
  'IDLE9',
];

/** The hand-written cases, recorded in full. */
function handWrittenAnswers(law, linear) {
  const lists = HAND_TEXTS.map((textKeys) => law.normalizeTextKeys(textKeys));
  const loopWithKeys = [
    { time: 0, text: 'move: loop start' },
    { time: 1, text: 'move: loop stop' },
  ];
  const stopOnly = [{ time: 1, text: 'move: loop stop' }];
  return {
    normalized: lists,
    normalizedOfNothing: [law.normalizeTextKeys(undefined), law.normalizeTextKeys(null), law.normalizeTextKeys([])],
    asciiLower: ['IDLE: START', 'K', 'İ', 'ÀÉ', '', 'aZ09[`{@'].map((text) => law.asciiLower(text)),
    textKeyGroup: ['idle: start', 'sneak:start', 'a: b: c', ': x', '', null, undefined, 'x:  y'].map((text) =>
      law.textKeyGroup(text),
    ),
    clipGroupsOfNothing: [law.clipGroups(undefined), law.clipGroups(null), law.clipGroups([])],
    shouldLoop: HAND_STATES.map((state) => law.shouldLoop(state)),
    looping: HAND_GROUPS.map((group) => [
      law.isLoopingAnimation([], group),
      law.isLoopingAnimation(
        loopWithKeys.map((key) => ({ ...key, text: key.text.replace('move', group.toLowerCase()) })),
        group,
      ),
    ]),
    loopingEdges: [
      law.isLoopingAnimation(loopWithKeys, 'move'),
      law.isLoopingAnimation(stopOnly, 'move'),
      law.isLoopingAnimation([], 'move'),
      law.isLoopingAnimation(undefined, 'idle'),
      law.isLoopingAnimation([], undefined),
      law.isLoopingAnimation([], null),
    ],
    loopingNames: [...law.LOOPING_ANIMATIONS].sort(),
    textKeyTimeEdges: [
      law.getTextKeyTime(undefined, 'a'),
      law.getTextKeyTime([], 'a'),
      law.getTextKeyTime(loopWithKeys, ''),
      law.getTextKeyTime(loopWithKeys, undefined),
      law.getTextKeyTime(loopWithKeys, 'move: loop'),
      law.getTextKeyTime(loopWithKeys, 'move: loop stop extra'),
    ],
    startTimeEdges: [
      law.getStartTime(undefined, 'move'),
      law.getStartTime(loopWithKeys, 'MOVE'),
      law.getStartTime(loopWithKeys, 'mov'),
      law.getStartTime(loopWithKeys, ''),
      law.getStartTime([{ time: 3, text: 'idle2: start' }], 'idle'),
      law.getStartTime([{ time: 3, text: 'idle: start' }], undefined),
    ],
    velocityEdges: [
      law.animVelocity(undefined, trackFor(loopWithKeys, 1, linear), 'move'),
      law.animVelocity([], trackFor(loopWithKeys, 1, linear), 'move'),
      law.animVelocity(loopWithKeys, undefined, 'move'),
      law.animVelocity(loopWithKeys, {}, 'move'),
      law.animVelocity(loopWithKeys, { translations: { type: linear, keys: [] } }, 'move'),
      law.animVelocity(loopWithKeys, trackFor(loopWithKeys, 2, linear), 'MOVE'),
      law.animVelocity(loopWithKeys, trackFor(loopWithKeys, 2, linear), undefined),
      law.animVelocity(
        [
          { time: 0, text: 'walk: start' },
          { time: 2, text: 'walk: stop' },
          { time: 1, text: 'walk: loop stop' },
          { time: 3, text: 'walk: stop' },
        ],
        trackFor(
          [
            { time: 0, text: '' },
            { time: 1, text: '' },
            { time: 2, text: '' },
            { time: 3, text: '' },
          ],
          3,
          linear,
        ),
        'walk',
      ),
    ],
    resetEdges: [
      law.resetClip(undefined, 'idle'),
      law.resetClip([], 'idle'),
      law.resetClip(lists[0], undefined),
      law.resetClip(lists[0], ''),
      law.resetClip(lists[0], 'IDLE'),
      law.resetClip(lists[0], 'idle', { startPoint: 0.5, loopFallback: true }),
      law.resetClip(lists[0], 'idle', { start: 'loop start' }),
    ],
    advanceEdges: [
      (() => {
        const state = law.resetClip(lists[0], 'idle', { loopFallback: true });
        const fired = [];
        law.advanceClip(state, undefined, 0.5, (text, time, mine) => fired.push([text, time, mine]));
        return [{ ...state }, fired];
      })(),
      (() => {
        const state = law.resetClip(lists[0], 'idle', { loopFallback: true });
        law.advanceClip(state, lists[0], 0.5);
        law.advanceClip(state, lists[0], -1);
        law.advanceClip(state, lists[0], NaN);
        return { ...state };
      })(),
    ],
  };
}

/** The answers of the current code over the inputs, as a plain object that can be compared with a recording. */
export function recordClipLaw(law, inputs, linear) {
  const retailLists = inputs.lists.map((list) => ({ keys: asKeys(list.keys) }));
  return {
    retail: answersForLists(law, retailLists, linear),
    synthetic: answersForLists(law, syntheticLists(), linear),
    handWritten: handWrittenAnswers(law, linear),
  };
}
