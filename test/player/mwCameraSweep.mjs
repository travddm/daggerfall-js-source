// A fixed, seeded set of camera sessions, and the way they are replayed and recorded.
//
// mwCameraParity.test.js replays these sessions on the current camera and compares every observable with the
// recording in test/fixtures/mw/mwCameraParity.json. The recording was made from the implementation that this
// camera replaced (the last version before the clean-room rewrite), so it pins the behaviour the hosts were built on.

const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

/** The values one random choice may take. Frame lengths are the ones real displays give. */
const FRAME_SECONDS = [1 / 60, 1 / 60, 1 / 30, 1 / 144, 0];
const STANCES = [null, null, 'combat', 'swimming', undefined, 'unknown'];
const CAST_HITS = [null, null, undefined, NaN, 0, -0.01, 0.2, 0.7, 1.4, 3, 9];

function makeOperation(random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const roll = random();
  if (roll < 0.25) {
    return {
      op: 'wheel',
      clicks: pick([-10, -3, -1, -1, 1, 1, 3, 10, 0]),
      ready: pick([true, true, false, undefined]),
    };
  }
  if (roll < 0.33) return { op: 'update', ready: pick([true, false, undefined]) };
  if (roll < 0.58) {
    const heightScale = pick([undefined, 1, 1.1, 0.9]);
    const pivotFloor = pick([undefined, undefined, null, random() * 8]);
    return {
      op: 'eye',
      view: {
        fpEye: [random() * 5, random() * 5, random() * 5],
        feet: [random() * 20 - 10, random() * 5, random() * 20 - 10],
        yaw: random() * 7 - 3.5,
        pitch: (random() - 0.5) * 3,
        heightScale,
        pivotFloor,
      },
      castKind: pick(['none', 'ray', 'sphere', 'both', 'sphere', 'sphere']),
      hits: [0, 1, 2, 3].map(() => pick(CAST_HITS)),
    };
  }
  if (roll < 0.66)
    return { op: 'setShoulder', side: pick(['off', 'right', 'left', 'sideways', undefined, 'right', 'left']) };
  if (roll < 0.8) return { op: 'stepShoulder', dt: pick(FRAME_SECONDS), stance: pick(STANCES) };
  if (roll < 0.86) return { op: 'setSeaReach', metres: pick([0, 8, 11.5, 12, 66, NaN, -3, undefined, 100]) };
  if (roll < 0.93) {
    const saved = pick([
      undefined,
      null,
      { firstPerson: true },
      { firstPerson: false, baseDistance: pick([5, 30, 99, 500, 801, 5000, NaN, Infinity, 'text']) },
      { baseDistance: pick([100, 2000]) },
      { firstPerson: 'yes' },
    ]);
    return { op: 'restore', saved };
  }
  return { op: 'state' };
}

/** The operations of session number `index`. Most start in third person so that the zoom and aim code is reached. */
export function makeSession(index, length = 30) {
  const random = makeRandom(1000 + index * 7919);
  const operations = [];
  if (random() < 0.7) {
    const base = [30, 50, 192, 400, 800][Math.floor(random() * 5)];
    operations.push({ op: 'restore', saved: { firstPerson: false, baseDistance: base } });
  }
  for (let i = 0; i < length; i++) operations.push(makeOperation(random));
  return operations;
}

const round = (value) => (Number.isFinite(value) ? Number(value.toPrecision(10)) : String(value));

/** Casts that answer from a list, and write down what they were asked. */
function makeCasts(kind, hits, record) {
  let next = 0;
  const answer = () => hits[Math.min(next++, hits.length - 1)];
  const ray = (origin, direction, maxDistance) => {
    record.push(1, ...origin, ...direction, maxDistance);
    return answer();
  };
  const sphere = (origin, radius, direction, maxDistance) => {
    record.push(2, ...origin, radius, ...direction, maxDistance);
    return answer();
  };
  if (kind === 'ray') return { raycast: ray };
  if (kind === 'sphere') return { spherecast: sphere };
  if (kind === 'both') return { raycast: ray, spherecast: sphere };
  return {};
}

function perform(camera, operation, casts) {
  switch (operation.op) {
    case 'wheel':
      return camera.wheel(operation.clicks, operation.ready === undefined ? undefined : { ready: operation.ready });
    case 'update':
      return camera.update(operation.ready === undefined ? undefined : { ready: operation.ready });
    case 'eye': {
      const out = camera.eye({ ...operation.view, ...makeCasts(operation.castKind, operation.hits, casts) });
      return [out.thirdPerson ? 1 : 0, out.distance, ...out.eye, ...(out.focal ?? [])];
    }
    case 'setShoulder':
      return camera.setShoulder(operation.side);
    case 'stepShoulder':
      return camera.stepShoulder(operation.dt, operation.stance);
    case 'setSeaReach':
      return camera.setSeaReach(operation.metres);
    case 'restore':
      return camera.restore(operation.saved);
    default:
      return Object.values(camera.state());
  }
}

/** Replay a session; one flat list of numbers and strings per operation. */
export function recordSession(camera, operations) {
  return operations.map((operation) => {
    const casts = [];
    const result = perform(camera, operation, casts);
    const queued = camera.queued();
    const flat = [
      camera.mode(),
      queued === null ? 'none' : String(queued),
      camera.baseDistance(),
      camera.cameraDistance(),
      ...camera.focalOffset(),
      camera.seaFar(),
      camera.shoulder(),
      camera.shoulderState() ?? 'none',
      Array.isArray(result) ? result.length : 0,
      ...(Array.isArray(result) ? result : []),
      casts.length,
      ...casts,
    ];
    return flat.map((value) => (typeof value === 'number' ? round(value) : value));
  });
}

/**
 * Focal-offset sessions: retargets, with the speed set first as the camera does, then a stretch of steps at one frame
 * length. Retargets come at least half a second apart; closer ones are outside what the recording pins (see the test).
 */
export function makeFocalSession(index, segments = 8) {
  const random = makeRandom(5000 + index * 104729);
  const targets = [
    [30, -10],
    [-30, -10],
    [0, 15],
    [0, 0],
    [5, 5],
  ];
  const frame = FRAME_SECONDS[Math.floor(random() * 4)];
  const operations = [['step', frame]];
  for (let i = 0; i < segments; i++) {
    if (random() < 0.2) operations.push(['instant']);
    operations.push(['speed', random() < 0.5 ? 1 : 5], ['target', targets[Math.floor(random() * targets.length)]]);
    const steps = Math.ceil(0.5 / frame) + Math.floor((random() * 0.8) / frame);
    for (let k = 0; k < steps; k++) operations.push(['step', frame]);
  }
  return operations;
}

export function recordFocalSession(offset, operations) {
  return operations.map(([op, value]) => {
    if (op === 'step') offset.step(value);
    else if (op === 'target') offset.setTarget(value);
    else if (op === 'speed') offset.setSpeed(value);
    else offset.instant();
    return [...offset.current(), ...offset.target()].map(round);
  });
}
