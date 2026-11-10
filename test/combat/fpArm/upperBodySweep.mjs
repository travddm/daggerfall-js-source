// Scripted input for the arm's upper body (src/combat/fpArm/upperBody.js), and the way its answers are recorded tick
// by tick.
//
// upperBody.test.js plays every earlier script (fpAnimStateSweep.mjs SCRIPTS, animSlotsSweep.mjs SLOT_SCRIPTS) and the
// scripts below on the retail files, and compares the upper body's whole state each tick with
// test/fixtures/mw/upperBodyParity.json, recorded before the rewrite. The release flags are taken every tick, as the
// rig takes them. The scripts below reach what the earlier ones do not: paced blows, a blow cut in its follow-through,
// a sheathe refused while striking, a held bow shot, every cast range with a paced release, and a spell un-readied
// in the middle of its cast.
import { SCRIPTS, TICK, seededRandom } from '../fpAnimStateSweep.mjs';
import { SLOT_SCRIPTS } from './animSlotsSweep.mjs';

const BLOW = (hitAt, seconds) => ({ blow: { hitAt, seconds } });

export const UPPER_SCRIPTS = [
  {
    id: 'paced-blows-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { do: [['setSheathed', false]], ticks: 120 },
      { do: [['attack', 'StrikeDown', BLOW(0.25, 0.5)]], ticks: 20 },
      { do: [['attack', 'StrikeRight', BLOW(0.2, 0.4)]], ticks: 30 },
      { do: [['attack', 'StrikeLeft', BLOW(0.3, 0.6)]], ticks: 50 },
      { do: [['attack', 'StrikeUp', BLOW(0.1, 0.2)]], ticks: 60 },
      { do: [['attack', 'StrikeDown', {}]], ticks: 6 },
      { do: [['setSheathed', true]], ticks: 10 },
      { do: [['setSheathed', true]], ticks: 200 },
      { do: [['setSheathed', false]], ticks: 10 },
      { do: [['setSheathed', true]], ticks: 200 },
    ],
  },
  {
    id: 'bow-held-human',
    race: 'nord',
    weapon: 130,
    hasAmmo: true,
    steps: [
      { do: [['setSheathed', false]], ticks: 150 },
      { do: [['attack', 'StrikeUp', { hold: true }]], ticks: 90 },
      { do: [['release']], ticks: 120 },
      { do: [['attack', 'StrikeDown', {}]], ticks: 120 },
      { do: [['attack', 'StrikeDown', BLOW(0.3, 0.6)]], ticks: 120 },
      { do: [['setSheathed', true]], ticks: 150 },
    ],
  },
  {
    id: 'casts-human',
    race: 'nord',
    weapon: 120,
    steps: [
      { do: [['readySpell', true]], ticks: 90 },
      { do: [['castSpell', 0, 1, 0]], ticks: 120 },
      { do: [['castSpell', 1, 1.5, 0.4]], ticks: 120 },
      { do: [['castSpell', 2, 0.8, 0]], ticks: 30 },
      { do: [['readySpell', false]], ticks: 150 },
      { do: [['setSheathed', false]], ticks: 120 },
      { do: [['readySpell', true]], ticks: 90 },
      { do: [['castSpell', 2, 1, 0.3]], ticks: 20 },
      { do: [['attack', 'StrikeDown', {}]], ticks: 100 },
      { do: [['readySpell', false]], ticks: 120 },
      { do: [['castSpell', 0, 1, 0]], ticks: 120 },
    ],
  },
  {
    id: 'casts-third-beast',
    race: 'khajiit',
    weapon: null,
    unposed: true,
    steps: [
      {
        do: [
          ['setViewMode', 'third'],
          ['readySpell', true],
        ],
        ticks: 90,
      },
      { do: [['castSpell', 1, 1, 0]], ticks: 120 },
      { do: [['castSpell', 2, 2, 0.5]], ticks: 15 },
      { do: [['setViewMode', 'first']], ticks: 120 },
      {
        do: [
          ['readySpell', false],
          ['setSheathed', false],
        ],
        ticks: 150,
      },
      { do: [['attack', 'StrikeRight', { roll: 0.4 }]], ticks: 90 },
    ],
  },
];

const r4 = (value) => (Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : value === Infinity ? 'inf' : null);

const fakeRenderer = () => ({
  gl: null,
  createCharacterMesh: () => ({ vao: 1, buffers: [], ranges: [] }),
  updateCharacterMesh: () => {},
  createCharacterTexture: () => 1,
});

/**
 * Plays every script on a fresh arm and records one row per tick: the upper state and its group, the clip time, the
 * attack type, strength and side, what is shown in the hand, the stance flags, the paced blow and the release flags
 * (taken), plus what each call answered.
 */
export async function recordUpperScripts({
  createFpArm,
  deps,
  scripts = [...SCRIPTS, ...SLOT_SCRIPTS, ...UPPER_SCRIPTS],
}) {
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
        const answers = (step.do ?? []).map(([method, ...args]) => {
          const got = arm[method](...args);
          return got === undefined ? null : got;
        });
        for (let i = 0; i < step.ticks; i++) {
          if (step.yawRate) cam = { ...cam, yaw: cam.yaw + step.yawRate * TICK };
          arm.update(TICK, script.unposed ? { pose: false } : undefined);
          const s = arm.status();
          const blow = s.blow ? [r4(s.blow.rate), r4(s.blow.clock)] : null;
          rows.push([
            s.upperName,
            s.weaponGroup ?? null,
            r4(s.time),
            s.attackType ?? null,
            s.attackReversed ? 1 : 0,
            s.sheathed ? 1 : 0,
            s.spellReady ? 1 : 0,
            s.unreadyAfterCast ? 1 : 0,
            s.weaponShown ? 1 : 0,
            s.arrowShown ? 1 : 0,
            blow,
            arm.takeShootRelease() ? 1 : 0,
            arm.takeCastRelease() ? 1 : 0,
            s.posedGroup ?? null,
            i === 0 ? answers : null,
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
