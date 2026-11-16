// Scripted input for the arm's animation slots below the upper body (src/combat/fpArm/animSlots.js), and the way their
// answers are recorded tick by tick.
//
// animSlots.test.js plays the animation-state scripts (fpAnimStateSweep.mjs SCRIPTS) and the scripts below on the
// retail files and compares every slot of every tick with test/fixtures/mw/animSlotsParity.json, recorded before the
// rewrite. The scripts below reach what those do not: turning in third person, a weapon drawn while walking and in the
// air, the sneak idle, levitation, and walking after a revive. A step may turn the view by `yawRate` radians a second.
import { SCRIPTS, TICK, seededRandom } from '../fpAnimStateSweep.mjs';

const MOVE = (forward, strafe, running, extra = {}) => ({
  move: { forward, strafe, running, speed: running ? 5 : 2, ...extra },
});
const THIRD = [['setViewMode', 'third']];

export const SLOT_SCRIPTS = [
  {
    id: 'turn-third-human',
    race: 'nord',
    weapon: 120,
    unposed: true,
    steps: [
      { do: THIRD, ticks: 30 },
      { yawRate: 2, ticks: 40 },
      { ticks: 2 },
      { yawRate: -6, ticks: 30 },
      { ticks: 20 },
      { cam: { sneaking: true }, yawRate: 2, ticks: 30 },
      { cam: {}, do: [['setSheathed', false]], yawRate: 1, ticks: 90 },
      { cam: MOVE(1, 0, false), yawRate: 2, ticks: 60 },
    ],
  },
  {
    id: 'draw-walking-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { cam: MOVE(1, 0, false), ticks: 60 },
      { do: [['setSheathed', false]], ticks: 120 },
      { cam: MOVE(1, 0, true), ticks: 60 },
      { cam: MOVE(0, -1, false), do: [['setSheathed', true]], ticks: 120 },
      { cam: MOVE(-1, 1, true), ticks: 60 },
      { cam: MOVE(0, 0, false), ticks: 60 },
    ],
  },
  {
    id: 'draw-walking-third-beast',
    race: 'khajiit',
    weapon: 120,
    unposed: true,
    steps: [
      { do: THIRD, cam: MOVE(1, 0, false), ticks: 60 },
      { do: [['setSheathed', false]], ticks: 120 },
      { cam: MOVE(1, 0, true), ticks: 60 },
      { cam: { ...MOVE(1, 0, false), sneaking: true }, ticks: 60 },
      { cam: MOVE(0, 0, false), ticks: 60 },
    ],
  },
  {
    id: 'jump-draw-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { ticks: 30 },
      { cam: MOVE(1, 0, true, { jumping: true, grounded: false }), ticks: 1 },
      { cam: MOVE(1, 0, true, { grounded: false }), ticks: 20 },
      { cam: MOVE(1, 0, true, { grounded: false }), do: [['setSheathed', false]], ticks: 40 },
      { cam: MOVE(1, 0, true), ticks: 60 },
      { cam: MOVE(0, 0, false, { jumping: true, grounded: false }), ticks: 1 },
      { cam: MOVE(0, 0, false, { grounded: false }), ticks: 30 },
      { cam: MOVE(0, 0, false), ticks: 90 },
    ],
  },
  {
    id: 'jump-third-human',
    race: 'nord',
    weapon: 120,
    unposed: true,
    steps: [
      { do: [...THIRD, ['setSheathed', false]], ticks: 90 },
      { cam: MOVE(0, 0, false, { jumping: true, grounded: false }), ticks: 1 },
      { cam: MOVE(0, 0, false, { grounded: false }), ticks: 45 },
      { cam: MOVE(0, 0, false), ticks: 90 },
      { cam: MOVE(0, 0, false, { levitating: true, grounded: false }), ticks: 60 },
      { cam: MOVE(1, 0, false, { swimming: true, grounded: false }), ticks: 60 },
      { cam: MOVE(0, 0, false), ticks: 60 },
    ],
  },
  {
    id: 'sneak-idle',
    race: 'nord',
    weapon: 120,
    steps: [
      { cam: { sneaking: true }, ticks: 120 },
      { cam: { sneaking: true }, do: [['setSheathed', false]], ticks: 120 },
      { cam: { ...MOVE(1, 0, false), sneaking: true }, ticks: 60 },
      { cam: {}, ticks: 120 },
    ],
  },
  {
    id: 'sneak-idle-third',
    race: 'nord',
    weapon: null,
    unposed: true,
    steps: [
      { do: THIRD, cam: { sneaking: true }, ticks: 120 },
      { cam: {}, ticks: 60 },
      { cam: { sneaking: true }, do: [['setSheathed', false]], ticks: 120 },
    ],
  },
  {
    id: 'revive-walk-third',
    race: 'nord',
    weapon: 120,
    unposed: true,
    steps: [
      { do: [...THIRD, ['setSheathed', false]], cam: MOVE(1, 0, false), ticks: 60 },
      { do: [['hurt', 0.2]], ticks: 10 },
      { do: [['die', 0.5]], ticks: 120 },
      { do: [['hurt', 0.1]], cam: MOVE(1, 0, true), ticks: 30 },
      { do: [['revive']], ticks: 60 },
      { cam: MOVE(0, 0, false), do: [['hurt', 0.7]], ticks: 90 },
      { do: [['die', 0.1, { startPoint: 1 }]], ticks: 30 },
    ],
  },
];

const to4 = (value) => (Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : value === Infinity ? 'inf' : null);

const fakeRenderer = () => ({
  gl: null,
  createCharacterMesh: () => ({ vao: 1, buffers: [], ranges: [] }),
  updateCharacterMesh: () => {},
  createCharacterTexture: () => 1,
});

/**
 * Plays every script on a fresh arm and records one row per tick: the upper state, then each slot's group and clock
 * (idle with its loops left, movement with its rate, jump with its kind, hit, death) and the posed winner.
 */
export async function recordSlotScripts({ createFpArm, deps, scripts = [...SCRIPTS, ...SLOT_SCRIPTS] }) {
  const realRandom = Math.random;
  const out = {};
  try {
    for (const script of scripts) {
      Math.random = seededRandom(98765);
      let cam = { pitch: 0, yaw: 0 };
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
        if (step.cam) cam = { pitch: 0, yaw: cam.yaw, ...step.cam };
        for (const [method, ...args] of step.do ?? []) arm[method](...args);
        for (let i = 0; i < step.ticks; i++) {
          if (step.yawRate) cam = { ...cam, yaw: cam.yaw + step.yawRate * TICK };
          arm.update(TICK, script.unposed ? { pose: false } : undefined);
          const s = arm.status();
          rows.push([
            s.upperName,
            s.idleGroup,
            to4(s.idleTime),
            s.loopsLeft,
            s.movementGroup,
            to4(s.movementTime),
            s.movementRate,
            s.jumpGroup,
            s.jumpKind,
            to4(s.jumpTime),
            s.hit ? s.hit.group : null,
            s.hit ? to4(s.hit.time) : null,
            s.death ? s.death.group : null,
            s.death ? to4(s.death.time) : null,
            s.posedGroup ?? null,
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
