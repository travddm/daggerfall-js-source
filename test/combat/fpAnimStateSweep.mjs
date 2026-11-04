// Scripted input for the first-person arm's animation machine, and the way its answers are recorded.
//
// fpAnimStateParity.test.js runs createFpArm over these scripts on the retail Morrowind files and compares the
// per-tick answers with test/fixtures/mw/fpAnimStateParity.json, which was recorded from the animation-state helpers
// before their rewrite. The scripts are a data table (SCRIPTS), so later steps that move more of the machine can
// reuse them. The tick is fixed at 1/60 s and the dice (Math.random) are replaced by a seeded sequence so that
// both runs roll the same numbers.

export const TICK = 1 / 60;

const MOVE = (forward, strafe, running, extra = {}) => ({ move: { forward, strafe, running, ...extra } });

/** Each script: a rig and a list of steps. A step runs its `do` calls, sets the camera, then ticks `ticks` times. */
export const SCRIPTS = [
  {
    id: 'stance-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { ticks: 120 },
      { do: [['setSheathed', false]], ticks: 240 },
      { cam: { sneaking: true }, ticks: 60 },
      { cam: { sneaking: false }, ticks: 600 },
      { do: [['setSheathed', true]], ticks: 240 },
      { ticks: 600 },
    ],
  },
  {
    id: 'stance-fists-human',
    race: 'nord',
    weapon: null,
    steps: [
      { do: [['setSheathed', false]], ticks: 360 },
      { do: [['setSheathed', true]], ticks: 120 },
    ],
  },
  {
    id: 'movement-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 90 },
      { cam: MOVE(1, 0, false), ticks: 120 },
      { cam: MOVE(1, 0, true), ticks: 120 },
      { cam: MOVE(0, 1, false), ticks: 90 },
      { cam: MOVE(-1, 0, false), ticks: 90 },
      { cam: { ...MOVE(1, 0, false), sneaking: true }, ticks: 90 },
      { cam: { ...MOVE(0, 0, false), sneaking: true }, ticks: 60 },
      { cam: MOVE(1, 0, true, { jumping: true, grounded: false }), ticks: 60 },
      { cam: MOVE(0, 0, false), ticks: 120 },
      { do: [['setSheathed', true]], cam: MOVE(1, 0, false), ticks: 90 },
    ],
  },
  {
    id: 'movement-beast',
    race: 'khajiit',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 90 },
      { cam: MOVE(1, 0, false), ticks: 120 },
      { cam: MOVE(1, 0, true), ticks: 120 },
      { cam: MOVE(0, 0, false), ticks: 120 },
    ],
  },
  {
    id: 'attack-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 120 },
      { do: [['attack', 'StrikeDown', { roll: 0.3 }]], ticks: 120 },
      { do: [['attack', 'StrikeRight', { hold: true }]], ticks: 20 },
      { do: [['release']], ticks: 120 },
      { do: [['attack', 'StrikeUp', { hold: true }]], ticks: 50 },
      { do: [['release']], ticks: 120 },
      { do: [['attack', 'StrikeLeft', { hold: true }]], ticks: 4 },
      { do: [['release']], ticks: 120 },
      {
        do: [
          ['attack', 'StrikeDown', {}],
          ['attack', 'StrikeDown', {}],
        ],
        ticks: 15,
      },
      { do: [['attack', 'StrikeRight', {}]], ticks: 150 },
    ],
  },
  {
    id: 'attack-twohand-human',
    race: 'nord',
    weapon: 122,
    steps: [
      { do: [['setSheathed', false]], ticks: 150 },
      { do: [['attack', 'StrikeDown', { hold: true }]], ticks: 30 },
      { do: [['release']], ticks: 150 },
    ],
  },
  {
    id: 'attack-bow-human',
    race: 'nord',
    weapon: 130,
    hasAmmo: true,
    steps: [
      { do: [['setSheathed', false]], ticks: 150 },
      { do: [['attack', 'StrikeDown', { hold: true }]], ticks: 40 },
      { do: [['release']], ticks: 150 },
    ],
  },
  {
    id: 'attack-fists-human',
    race: 'nord',
    weapon: null,
    steps: [
      { do: [['setSheathed', false]], ticks: 150 },
      { do: [['attack', 'StrikeLeft', { hold: true }]], ticks: 10 },
      { do: [['release']], ticks: 90 },
      { do: [['attack', 'StrikeRight', {}]], ticks: 120 },
    ],
  },
  {
    id: 'attack-beast',
    race: 'khajiit',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 120 },
      { do: [['attack', 'StrikeDown', { hold: true }]], ticks: 15 },
      { do: [['release']], ticks: 120 },
      { do: [['attack', 'StrikeRight', {}]], ticks: 120 },
    ],
  },
  {
    id: 'sheathe-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 10 },
      { do: [['setSheathed', true]], ticks: 15 },
      { do: [['setSheathed', false]], ticks: 100 },
      { do: [['attack', 'StrikeDown', { hold: true }]], ticks: 10 },
      { do: [['setSheathed', true]], ticks: 200 },
    ],
  },
  {
    id: 'cast-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 120 },
      { do: [['readySpell', true]], ticks: 90 },
      { do: [['castSpell', 2, 1, 0]], ticks: 150 },
      { do: [['castSpell', 1, 1, 0]], ticks: 150 },
      { do: [['castSpell', 0, 1.5, 0]], ticks: 150 },
      { do: [['readySpell', false]], ticks: 120 },
    ],
  },
  {
    id: 'cast-beast',
    race: 'khajiit',
    weapon: null,
    steps: [
      { do: [['readySpell', true]], ticks: 90 },
      { do: [['castSpell', 2, 1, 0]], ticks: 150 },
      { do: [['readySpell', false]], ticks: 90 },
    ],
  },
  {
    id: 'hurt-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 120 },
      { do: [['hurt', 0]], ticks: 60 },
      { do: [['hurt', 0.4]], ticks: 60 },
      { do: [['hurt', 0.9]], ticks: 60 },
      {
        do: [
          ['attack', 'StrikeDown', { hold: true }],
          ['hurt', 0.2],
        ],
        ticks: 30,
      },
      { do: [['release']], ticks: 120 },
    ],
  },
  {
    id: 'hurt-beast',
    race: 'khajiit',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 90 },
      { do: [['hurt', 0.5]], ticks: 90 },
    ],
  },
  {
    id: 'die-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 120 },
      { do: [['die', 0]], ticks: 240 },
      { do: [['revive']], ticks: 90 },
      { do: [['die', 0.7]], ticks: 240 },
    ],
  },
  {
    id: 'die-beast',
    race: 'khajiit',
    weapon: null,
    steps: [{ ticks: 60 }, { do: [['die', 0.3]], ticks: 240 }],
  },
  {
    id: 'hurt-third-human',
    race: 'nord',
    weapon: 120,
    unposed: true,
    steps: [
      {
        do: [
          ['setViewMode', 'third'],
          ['setSheathed', false],
        ],
        ticks: 120,
      },
      { do: [['hurt', 0]], ticks: 60 },
      { do: [['hurt', 0.6]], ticks: 60 },
      { cam: MOVE(1, 0, true), do: [['hurt', 0.3]], ticks: 90 },
    ],
  },
  {
    id: 'die-third-human',
    race: 'nord',
    weapon: 120,
    unposed: true,
    steps: [
      {
        do: [
          ['setViewMode', 'third'],
          ['setSheathed', false],
        ],
        ticks: 120,
      },
      { do: [['die', 0]], ticks: 240 },
      { do: [['revive']], ticks: 90 },
      { do: [['die', 0.7]], ticks: 240 },
    ],
  },
  {
    id: 'die-third-beast',
    race: 'khajiit',
    weapon: null,
    unposed: true,
    steps: [
      { do: [['setViewMode', 'third']], ticks: 60 },
      { do: [['die', 0.3]], ticks: 240 },
    ],
  },
  {
    id: 'attack-third-human',
    race: 'nord',
    weapon: 120,
    unposed: true,
    steps: [
      {
        do: [
          ['setViewMode', 'third'],
          ['setSheathed', false],
        ],
        ticks: 120,
      },
      { do: [['attack', 'StrikeDown', { hold: true }]], ticks: 20 },
      { do: [['release']], ticks: 120 },
      {
        cam: MOVE(1, 0, false),
        do: [
          ['readySpell', true],
          ['castSpell', 2, 1, 0],
        ],
        ticks: 200,
      },
    ],
  },
];

/** A deterministic stand-in for Math.random: a linear congruential sequence over [0, 1). */
export function seededRandom(seed = 12345) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const to4 = (value) => (Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : null);

/** The archives and the main ESM, from a Morrowind Data Files folder. */
export function readRetailDeps({ dataPath, fs, MwBsaFile }) {
  const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map(
    (name) => new MwBsaFile(new Uint8Array(fs.readFileSync(`${dataPath}/${name}.bsa`))),
  );
  const esm = new Uint8Array(fs.readFileSync(`${dataPath}/Morrowind.esm`));
  return {
    loadMorrowindArchives: async () => archives,
    storedMorrowindNames: async () => ['Morrowind.esm'],
    loadMorrowindFile: async () => esm,
  };
}

const fakeRenderer = () => ({
  gl: null,
  createCharacterMesh: () => ({ vao: 1, buffers: [], ranges: [] }),
  updateCharacterMesh: () => {},
  createCharacterTexture: () => 1,
});

/**
 * Plays every script on a fresh arm and records one row per tick:
 *   [upper state name, idle group, weapon group, movement group, jump group, hit group, death group,
 *    the status clock, loops left, sheathed]
 * `createFpArm` and `deps` come from the caller so the same sweep runs against either implementation.
 */
export async function recordScripts({ createFpArm, deps, scripts = SCRIPTS }) {
  const realRandom = Math.random;
  const out = {};
  try {
    for (const script of scripts) {
      Math.random = seededRandom(98765);
      let cam = { pitch: 0 };
      const arm = createFpArm();
      arm.attach(fakeRenderer(), () => cam);
      const res = await arm.build({
        race: script.race,
        weapon: script.weapon === null ? null : { templateIndex: script.weapon },
        hasAmmo: !!script.hasAmmo,
        deps,
      });
      if (!res.ok) throw new Error(`${script.id}: build ${res.stage} ${res.error}`);
      const rows = [];
      for (const step of script.steps) {
        if (step.cam) cam = { pitch: 0, ...step.cam };
        for (const [method, ...args] of step.do ?? []) arm[method](...args);
        for (let i = 0; i < step.ticks; i++) {
          // A third-person body steps its clocks without skinning: the clip choice is what is recorded.
          arm.update(TICK, script.unposed ? { pose: false } : undefined);
          const s = arm.status();
          rows.push([
            s.upperName,
            s.idleGroup,
            s.weaponGroup,
            s.movementGroup,
            s.jumpGroup,
            s.hit ? s.hit.group : null,
            s.death ? s.death.group : null,
            to4(s.time),
            s.loopsLeft,
            s.sheathed ? 1 : 0,
          ]);
        }
      }
      out[script.id] = rows;
    }
  } finally {
    Math.random = realRandom;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The pure helpers, over inputs that are kept in the recording (so that the test does not need the game files).

const RIGS = [
  { id: 'fp-human', kf: 'meshes/xbase_anim.1st.kf' },
  { id: 'fp-beast', kf: 'meshes/xbase_animkna.1st.kf' },
  { id: 'tp-human', kf: 'meshes/xbase_anim.kf' },
];
const GROUP_PREFIXES = [
  'weapononehand',
  'weapontwohand',
  'weapontwowide',
  'handtohand',
  'bowandarrow',
  'crossbow',
  'throwweapon',
  'spellcast',
  'walkforward',
  'runforward',
  'idle',
  'hit1',
  'death1',
];
export const ATTACK_GROUPS = [
  'weapononehand',
  'weapontwohand',
  'weapontwowide',
  'handtohand',
  'bowandarrow',
  'crossbow',
  'throwweapon',
];
export const ATTACK_TYPES = ['chop', 'slash', 'thrust', 'shoot'];
export const STRENGTHS = [0, 0.1, 0.25, 0.32, 0.33, 0.5, 0.65, 0.66, 0.8, 0.95, 1];
export const MOVE_GROUPS = ['walkforward', 'runforward', 'idle', 'hit1', 'death1', 'weapononehand', 'handtohand'];

/** The text keys of the groups above, from the retail files. */
export function readHelperInputs({ dataPath, fs, modules }) {
  const { MwBsaFile, parseNif, anim } = modules;
  const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map(
    (name) => new MwBsaFile(new Uint8Array(fs.readFileSync(`${dataPath}/${name}.bsa`))),
  );
  const rigs = {};
  for (const rig of RIGS) {
    const bytes = archives
      .find((archive) => archive.has(rig.kf))
      .get(rig.kf)
      .slice();
    const keys = anim.normalizeTextKeys(anim.collectTextKeys(parseNif(bytes)));
    rigs[rig.id] = keys
      .filter((key) => GROUP_PREFIXES.some((prefix) => key.text.startsWith(prefix)))
      .map((key) => [Math.round(key.time * 1e5) / 1e5, key.text]);
  }
  return { rigs };
}

export const TYPE_NAMES = [
  'HandToHand',
  'Spell',
  'None',
  'ShortBladeOneHand',
  'LongBladeOneHand',
  'LongBladeTwoHand',
  'BluntOneHand',
  'BluntTwoClose',
  'BluntTwoWide',
  'SpearTwoWide',
  'AxeOneHand',
  'AxeTwoHand',
  'MarksmanBow',
  'MarksmanCrossbow',
  'MarksmanThrown',
  'Arrow',
  'Bolt',
];
export const UPPER_NAMES = [
  'None',
  'Equipping',
  'Unequipping',
  'WeaponEquipped',
  'AttackWindUp',
  'AttackRelease',
  'AttackEnd',
  'Casting',
];

const r6 = (value) => (Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : String(value));

/**
 * Records the answers of an implementation. `api` adapts it:
 *   completion, strideOpposite, releaseSkip, blowRate, idleBaseFor, weaponTypeFor, carriedLeftVisible,
 *   spellAttackType, accurateAiming (taking an upper-state NAME from UPPER_NAMES), fpSkeleton, tpSkeleton,
 *   idleLoops (called with Math.random replaced), weaponTypeValue (a TYPE_NAMES name to the type)
 *   clipAt(keys, group)  the clip state of a group as { time, startTime, stopTime, playing, group }
 */
export function recordHelpers(api, inputs) {
  const out = {};
  const spans = [
    [0, 0],
    [0, 5],
    [1, 3],
    [2, 2],
  ];
  out.completion = [null];
  for (const [startTime, stopTime] of spans) {
    for (const time of [-1, 0, 1, 2.5, 5, 7]) {
      for (const playing of [true, false])
        out.completion.push(r6(api.completion({ time, startTime, stopTime, playing })));
    }
  }
  out.stride = {};
  out.release = {};
  for (const [id, rows] of Object.entries(inputs.rigs)) {
    const keys = rows.map(([time, text]) => ({ time, text }));
    out.stride[id] = {};
    for (const group of MOVE_GROUPS) {
      const state = api.clipAt(keys, group);
      if (!state) continue;
      const times = [];
      for (let i = 0; i <= 12; i++) times.push(state.startTime + ((state.stopTime - state.startTime) * i) / 12);
      out.stride[id][group] = [
        ...times.map((time) => r6(api.strideOpposite({ ...state }, time, keys))),
        r6(api.strideOpposite({ ...state }, undefined, null)),
      ];
    }
    out.release[id] = {};
    for (const group of ATTACK_GROUPS) {
      for (const type of ATTACK_TYPES) {
        out.release[id][`${group}/${type}`] = STRENGTHS.map((strength) =>
          r6(api.releaseSkip(keys, group, type, strength)),
        );
      }
    }
  }
  out.blow = [];
  for (const span of [-1, 0, 0.01, 0.4, 0.8, 5]) {
    for (const left of [-1, 0, 0.0001, 0.2, 0.4, 1, 100]) out.blow.push(r6(api.blowRate(span, left)));
  }
  out.idleBase = [];
  for (const sneaking of [false, true]) {
    for (const inJump of [false, true]) {
      for (const has of [false, true]) out.idleBase.push(api.idleBaseFor({ sneaking, inJump, hasGroup: () => has }));
    }
  }
  out.idleBase.push(
    api.idleBaseFor(),
    api.idleBaseFor({ sneaking: true }),
    api.idleBaseFor({ sneaking: true, hasGroup: (g) => g === 'idlesneak' }),
  );
  out.weaponType = {};
  out.carried = {};
  for (const name of TYPE_NAMES) {
    const type = api.weaponTypeValue(name);
    out.carried[name] = api.carriedLeftVisible(type);
    for (const sheathed of [false, true]) {
      for (const spell of [false, true]) {
        out.weaponType[`${name}/${sheathed}/${spell}`] = api.weaponTypeName(api.weaponTypeFor(type, sheathed, spell));
      }
    }
  }
  out.spellAttack = [-1, 0, 1, 2, 3, 4, 5, 6].map((range) => api.spellAttackType(range));
  out.aiming = UPPER_NAMES.map((name) => api.accurateAiming(name));
  out.skeletons = [];
  for (const female of [false, true]) {
    for (const beast of [false, true]) {
      for (const werewolf of [false, true])
        out.skeletons.push([api.fpSkeleton({ female, beast, werewolf }), api.tpSkeleton({ female, beast, werewolf })]);
    }
  }
  out.skeletons.push([api.fpSkeleton(), api.tpSkeleton()]);
  const realRandom = Math.random;
  Math.random = seededRandom(4242);
  try {
    out.loops = Array.from({ length: 40 }, () => api.idleLoops());
  } finally {
    Math.random = realRandom;
  }
  return out;
}
