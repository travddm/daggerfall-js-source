// A fixed set of inputs for the body-part resolution, and the way its answers are recorded.
//
// mwBodyPartsParity.test.js runs the current module over these inputs and compares with the recording in
// test/fixtures/mw/mwBodyPartsParity.json, which was made from the implementation this module replaced. The inputs
// are the BODY records of Morrowind, Tribunal and Bloodmoon in load order (kept in the recording, so the test does
// not need the game files), then seeded random lists of records that put every branch of the sex and view fallbacks
// in the position of deciding the answer.

const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

/** The fields of a BODY record that the resolution reads. */
export const toPart = (record) => ({
  id: record.id,
  slot: record.slot,
  race: record.race,
  female: !!record.female,
  skin: !!record.skin,
  playable: !!record.playable,
  firstPerson: !!record.firstPerson,
});

const SLOTS = [
  'head', 'hair', 'neck', 'chest', 'groin', 'hand', 'wrist', 'forearm', 'upperarm', 'foot', 'ankle', 'knee',
  'upperleg', 'clavicle', 'tail',
];
const SYNTHETIC_RACES = ['alpha', 'beta'];
const SYNTHETIC_LISTS = 400;

/** Seeded random lists of records over a few slots, with every combination of the flags the resolution reads. */
export function syntheticLists() {
  const random = makeRandom(20261102);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const lists = [];
  for (let n = 0; n < SYNTHETIC_LISTS; n++) {
    const list = [];
    const count = 1 + Math.floor(random() * 12);
    for (let i = 0; i < count; i++) {
      list.push({
        id: `r${n}_${i}`,
        slot: pick(SLOTS),
        race: pick(SYNTHETIC_RACES),
        female: random() < 0.5,
        skin: random() < 0.85,
        playable: random() < 0.85,
        firstPerson: random() < 0.4,
      });
    }
    lists.push(list);
  }
  return lists;
}

const idsBySlot = (map) => [...map].map(([slot, record]) => [slot, record.id]);

/** For each race, sex and view, the record id chosen for each slot, in the order the slots were first filled. */
export function recordResolution(resolveBodyParts, parts, races) {
  const out = { real: {}, synthetic: [] };
  for (const race of races) {
    for (const female of [false, true]) {
      for (const firstPerson of [false, true]) {
        out.real[`${race}|${female ? 'f' : 'm'}|${firstPerson ? '1' : '3'}`] = idsBySlot(
          resolveBodyParts(parts, race, female, { firstPerson }),
        );
      }
    }
  }
  for (const list of syntheticLists()) {
    const answers = [];
    for (const race of SYNTHETIC_RACES) {
      for (const female of [false, true]) {
        for (const firstPerson of [false, true]) {
          answers.push(idsBySlot(resolveBodyParts(list, race, female, { firstPerson })));
        }
      }
    }
    out.synthetic.push(answers);
  }
  return out;
}

/** Argument shapes the callers use: no options, and the race in mixed case. */
export function recordEdgeCalls(resolveBodyParts, parts, races) {
  const race = races[0];
  return [
    idsBySlot(resolveBodyParts(parts, race, false)),
    idsBySlot(resolveBodyParts(parts, race.toUpperCase(), true)),
    idsBySlot(resolveBodyParts(null, race, false)),
    idsBySlot(resolveBodyParts(undefined, race, true, { firstPerson: true })),
    idsBySlot(resolveBodyParts(parts, undefined, false)),
    idsBySlot(resolveBodyParts(parts, race, 1, { firstPerson: 1 })),
  ];
}
