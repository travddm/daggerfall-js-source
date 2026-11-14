import { createHash } from 'node:crypto';

// A fixed set of inputs for the worn-body rules (the part table, the reserve lists, the priority law, the layer order,
// the shield and part-group ladders in src/formats/morrowind/mwItemMap.js and mw-worn-parts.ts), and the way their
// answers are recorded. mw-worn-parts.test.ts runs the current code over these inputs and compares with the recording
// in test/fixtures/mw/mw-worn-parity.json, which was made from the implementation it replaced.
//
// The inputs are:
//   - the armour, clothing and body-part records of Morrowind.esm, Tribunal.esm and Bloodmoon.esm (the body parts the
//     armour and clothing name, kept in the recording so that the test does not need the game files),
//   - the pieces a figure can wear: every Daggerfall armour template in every material, every clothing row, every
//     clothing and armour record handed in whole, the cloaks and the townsfolk's outfits,
//   - compositions of them: each piece alone, and seeded random sets of two to seven.
// Each composition is dressed as a man and as a woman, with a beast race's switches in four positions, and the
// answers (the parts added, the skin hidden in the third and the first person, what is covered, the notes, the parts
// the first person draws, the skin rows that survive) are recorded as one short digest each.

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

const ARCHIVES = ['Morrowind', 'Tribunal', 'Bloodmoon'];

/** The records of the three master files, and the body parts that the armour and clothing records name. */
export function readRecords({ dataPath, fs, path, modules }) {
  const { armorRecords, clothingRecords, bodyParts } = modules;
  const armors = [];
  const clothes = [];
  const bodies = [];
  for (const name of ARCHIVES) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.esm`)));
    armors.push(...armorRecords(bytes));
    clothes.push(...clothingRecords(bytes));
    bodies.push(...bodyParts(bytes));
  }
  const named = new Set();
  for (const record of [...armors, ...clothes]) {
    for (const part of record.parts ?? []) {
      for (const id of [part.male, part.female]) {
        if (id) {
          named.add(String(id).toLowerCase());
          named.add(`${String(id).toLowerCase()}.1st`);
        }
      }
    }
  }
  return { armors, clothes, bodies: bodies.filter((body) => named.has(String(body.id).toLowerCase())) };
}

/** The pieces a figure can wear, from the records and the item tables. */
export function piecesOf({ armors, clothes }, tables) {
  const pieces = [];
  const templates = [...Object.keys(tables.DF_ARMOR_ROWS), ...Object.keys(tables.MOD_ARMOR_ROWS)].map(Number);
  for (const templateIndex of templates) {
    for (const material of Object.values(tables.ARMOR_MATERIAL)) pieces.push({ templateIndex, material });
  }
  for (const name of Object.keys(tables.DF_CLOTHING_ROWS)) {
    pieces.push({ kind: 'clothing', name });
    pieces.push({ kind: 'clothing', name, dye: 3 });
  }
  const reserves = [undefined, 'robe', 'skirt'];
  clothes.forEach((record, index) => {
    if (record.parts?.length) pieces.push({ kind: 'record', record, reserve: reserves[index % 3] });
  });
  const robe = clothes.find((record) => record.id === 'werewolfrobe');
  if (robe) pieces.push({ kind: 'record', record: robe, reserve: 'robe' });
  for (const outfit of Object.values(tables.TOWNSFOLK_OUTFITS)) pieces.push({ kind: 'outfit', id: outfit.id });
  pieces.push({ kind: 'outfit', id: 'no-such-outfit' });
  return pieces;
}

const BEAST_SETS = [
  { beast: false },
  { beast: true, beastWear: { feet: 'worn', helm: 'worn' } },
  { beast: true, beastWear: { feet: 'shafts', helm: 'open' } },
  { beast: true, beastWear: { feet: 'hidden', helm: 'hidden' } },
];
const HELM_STYLES = [undefined, 'open', 'closed'];

/** The compositions: each piece alone, then seeded sets of two to seven. */
export function compositionsOf(pieces) {
  const compositions = pieces.map((piece) => [piece]);
  const random = seededRandom(20261116);
  for (let n = 0; n < 700; n++) {
    const count = 2 + Math.floor(random() * 6);
    compositions.push(Array.from({ length: count }, () => pieces[Math.floor(random() * pieces.length)]));
  }
  return compositions;
}

const SKIN_SLOTS = [
  'head',
  'hair',
  'neck',
  'chest',
  'groin',
  'hand',
  'wrist',
  'forearm',
  'upperarm',
  'foot',
  'ankle',
  'knee',
  'upperleg',
  'tail',
];
const SKIN_ROWS = SKIN_SLOTS.map((slot) => ({ slot, bones: [`left ${slot}`, `right ${slot}`], model: `${slot}.nif` }));

/** Every answer about one composition under one dressing, as one value. */
function answerFor(modules, records, pieces, options) {
  const args = { pieces, armors: records.armors, clothes: records.clothes, bodyPool: records.bodies, ...options };
  const worn = modules.composeWornArmor(args);
  return {
    worn,
    firstPerson: modules.fpWornAdds(worn.adds),
    skin: modules.shadowSkinRows(SKIN_ROWS, worn.shadows),
  };
}

/** The digests of every composition under every dressing: [composition][dressing]. */
export function recordCompositions(modules, records, compositions) {
  const dressings = [];
  for (const female of [false, true]) {
    BEAST_SETS.forEach((beast, index) =>
      dressings.push({ female, ...beast, helmStyle: HELM_STYLES[index % HELM_STYLES.length] }),
    );
  }
  return compositions.map((pieces) =>
    dressings.map((options) => digestOf(answerFor(modules, records, pieces, options))),
  );
}

/** The modest composition and the first person's part group, over the records. */
export function recordGroups(modules, records) {
  const pickedModest = [];
  for (const female of [false, true]) {
    for (const show of [false, true]) {
      for (const piece of [
        { kind: 'clothing', name: 'Short Shirt' },
        { kind: 'clothing', name: 'Plain Robes' },
        { templateIndex: 102, material: 0 },
      ]) {
        pickedModest.push(
          digestOf(
            modules.composeWornModest(
              { pieces: [piece], armors: records.armors, clothes: records.clothes, bodyPool: records.bodies, female },
              show,
            ),
          ),
        );
      }
    }
  }
  const groups = [];
  for (const record of [...records.armors, ...records.clothes]) {
    if (!record.parts?.length) continue;
    groups.push(
      digestOf([
        modules.firstPersonPartGroup(record, records.bodies, false),
        modules.firstPersonPartGroup(record, records.bodies, true),
      ]),
    );
  }
  return { modest: pickedModest, groups: digestOf(groups), groupCount: groups.length };
}

/** The tables, recorded whole. */
export function recordTables(modules) {
  return {
    parts: modules.ARMO_PART,
    reserves: modules.RESERVES,
    wear: modules.BEAST_WEAR_WORN,
    modest: modules.MODESTY_SHIRT,
  };
}

// ---- hand-written cases ------------------------------------------------------

const ARMOR_BODY = (id, kind = 2, model = `${id}.nif`, slot = 'hand') => ({
  id,
  model,
  bodyKind: kind,
  slot,
  firstPerson: false,
});
const BODIES = [
  ARMOR_BODY('shield_m'),
  ARMOR_BODY('shield_f'),
  ARMOR_BODY('skin_shield', 0),
  ARMOR_BODY('empty_shield', 2, ''),
  ARMOR_BODY('hand_m', 2, 'hand_m.nif', 'hand'),
  ARMOR_BODY('hand_m.1st', 2, 'hand_m_1st.nif', 'hand'),
  ARMOR_BODY('hand_f', 2, 'hand_f.nif', 'hand'),
  ARMOR_BODY('knee_m', 2, 'knee_m.nif', 'knee'),
  ARMOR_BODY('knee_m.1st', 2, 'knee_m_1st.nif', 'knee'),
  ARMOR_BODY('wrist_m', 2, 'wrist_m.nif', 'wrist'),
  ARMOR_BODY('head_m', 2, 'head_m.nif', 'head'),
  ARMOR_BODY('robe_chest', 2, 'robe_chest.nif', 'chest'),
  ARMOR_BODY('robe_groin', 2, 'robe_groin.nif', 'groin'),
  ARMOR_BODY('pants_groin', 2, 'pants_groin.nif', 'groin'),
  ARMOR_BODY('cuirass_chest', 2, 'cuirass_chest.nif', 'chest'),
];

const refs = (...entries) => entries.map(([part, male, female = null]) => ({ part, male, female }));
const SHIELD = 10;
const HAND_R = 6;
const KNEE_R = 19;
const WRIST_R = 8;
const HEAD = 0;
const CUIRASS = 3;
const GROIN = 4;

/** Records for the hand-written cases: shields in every state of their ladder, and garments that contend for slots. */
const RECORDS = {
  armors: [
    { id: 'sh_named', model: 'sh_ground.nif', parts: refs([SHIELD, 'shield_m', 'shield_f']) },
    { id: 'sh_male_only', model: 'sh_ground.nif', parts: refs([SHIELD, 'shield_m']) },
    { id: 'sh_missing', model: 'sh_ground.nif', parts: refs([SHIELD, 'no_such_body']) },
    { id: 'sh_skin', model: 'sh_ground.nif', parts: refs([SHIELD, 'skin_shield']) },
    { id: 'sh_modelless', model: 'sh_ground.nif', parts: refs([SHIELD, 'empty_shield']) },
    { id: 'sh_unnamed', model: 'sh_ground.nif', parts: refs([HEAD, 'head_m']) },
    { id: 'sh_noparts', model: 'sh_ground.nif', parts: [] },
    { id: 'plate', model: 'plate.nif', parts: refs([CUIRASS, 'cuirass_chest'], [HEAD, 'head_m']) },
    {
      id: 'greave',
      model: 'greave.nif',
      parts: refs(
        [KNEE_R, 'knee_m'],
        [HAND_R, 'hand_m', 'hand_f'],
        [WRIST_R, 'wrist_m'],
        [99, 'hand_m'],
        [25, 'hand_m'],
        [GROIN, ''],
      ),
    },
  ],
  clothes: [
    { id: 'robe_a', model: 'robe_a.nif', type: 4, parts: refs([CUIRASS, 'robe_chest'], [GROIN, 'robe_groin']) },
    { id: 'robe_hole', model: 'robe_hole.nif', type: 4, parts: refs([CUIRASS, 'robe_chest'], [HEAD, 'gone_head']) },
    { id: 'pants_a', model: 'pants_a.nif', type: 0, parts: refs([GROIN, 'pants_groin']) },
    { id: 'skirt_a', model: 'skirt_a.nif', type: 7, parts: refs([GROIN, 'robe_groin']) },
  ],
  bodies: BODIES,
};

const SHIELD_TEMPLATE = 110;
const HAND_CASES = [
  { label: 'a named shield', pieces: [{ kind: 'record', record: RECORDS.armors[0], reserve: undefined }] },
  {
    label: 'a robe held over a cuirass',
    pieces: [
      { kind: 'record', record: RECORDS.clothes[0], reserve: 'robe' },
      { kind: 'record', record: RECORDS.armors[7] },
    ],
  },
  {
    label: 'a cuirass over a robe, listed the other way',
    pieces: [
      { kind: 'record', record: RECORDS.armors[7] },
      { kind: 'record', record: RECORDS.clothes[0], reserve: 'robe' },
    ],
  },
  {
    label: 'pants under a skirt',
    pieces: [
      { kind: 'record', record: RECORDS.clothes[2] },
      { kind: 'record', record: RECORDS.clothes[3], reserve: 'skirt' },
    ],
  },
  {
    label: 'a robe whose head the body pool lacks',
    pieces: [{ kind: 'record', record: RECORDS.clothes[1], reserve: 'robe' }],
  },
  { label: 'a greave with every odd reference', pieces: [{ kind: 'record', record: RECORDS.armors[8] }] },
  {
    label: 'two robes',
    pieces: [
      { kind: 'record', record: RECORDS.clothes[0], reserve: 'robe' },
      { kind: 'record', record: RECORDS.clothes[1], reserve: 'robe' },
    ],
  },
  {
    label: 'a skirt over a robe',
    pieces: [
      { kind: 'record', record: RECORDS.clothes[3], reserve: 'skirt' },
      { kind: 'record', record: RECORDS.clothes[0], reserve: 'robe' },
    ],
  },
];

/** composeWornArmor and firstPersonPartGroup on the hand-written records, recorded in full. */
export function recordHandWritten(modules) {
  const cases = {};
  for (const female of [false, true]) {
    for (const entry of HAND_CASES) {
      cases[`${entry.label} (${female ? 'woman' : 'man'})`] = modules.composeWornArmor({
        armors: RECORDS.armors,
        clothes: RECORDS.clothes,
        bodyPool: BODIES,
        pieces: entry.pieces,
        female,
      });
    }
    for (const armor of RECORDS.armors)
      cases[`first person ${armor.id} (${female ? 'woman' : 'man'})`] = modules.firstPersonPartGroup(
        armor,
        BODIES,
        female,
      );
    for (const cloth of RECORDS.clothes)
      cases[`first person ${cloth.id} (${female ? 'woman' : 'man'})`] = modules.firstPersonPartGroup(
        cloth,
        BODIES,
        female,
      );
    cases[`first person nothing (${female ? 'woman' : 'man'})`] = modules.firstPersonPartGroup(null, null, female);
  }
  // A shield worn through the item rows: every state of its ladder, as a man and as a woman.
  const shields = [
    { id: 'iron_shield', model: 'iron_ground.nif', parts: refs([SHIELD, 'shield_m', 'shield_f']) },
    { id: 'steel_shield', model: 'steel_ground.nif', parts: refs([SHIELD, 'no_such_body']) },
    { id: 'dwemer_shield', model: 'dwemer_ground.nif', parts: refs([SHIELD, 'skin_shield']) },
    { id: 'orcish_shield', model: 'orcish_ground.nif', parts: refs([SHIELD, 'empty_shield']) },
    { id: 'ebony_shield', model: 'ebony_ground.nif', parts: refs([HEAD, 'head_m']) },
    { id: 'adamantium_shield', model: 'adamantium_ground.nif', parts: refs([SHIELD, 'shield_m']) },
  ];
  for (const female of [false, true]) {
    for (const material of [512, 513, 516, 518, 519, 520, 521]) {
      cases[`shield material ${material} (${female ? 'woman' : 'man'})`] = modules.composeWornArmor({
        pieces: [{ templateIndex: SHIELD_TEMPLATE, material }],
        armors: shields,
        bodyPool: BODIES,
        female,
      });
    }
  }
  return cases;
}
