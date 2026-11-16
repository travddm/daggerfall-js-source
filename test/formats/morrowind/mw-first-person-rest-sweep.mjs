// A fixed set of inputs for four small rules that were rewritten, and the way their answers are recorded:
//   - vampireHeadRecord and werewolfHeadRows (mwBodyParts.js), and the vampire row of playerBodyRows that uses them;
//   - blendMaskBones (mw-bone-rules.ts): which bones of a skeleton belong to the blend mask under a root bone;
//   - shapeMatchesBone (mw-bone-rules.ts): whether a mesh shape belongs to a bone.
//
// mwBodyPartsParity.test.js and mw-bone-rules.test.ts run the current code over these inputs and compare with the
// recording in test/fixtures/mw/mw-first-person-rest-parity.json, which was made from the implementation the rewrite
// replaced. The inputs are kept in the recording too, so the tests do not need the game files:
//   - the BODY records of Morrowind, Tribunal and Bloodmoon in load order, then seeded random record lists;
//   - the nodes of four retail skeletons, then seeded random node trees;
//   - the shape names of every retail body-part mesh against every bone name of the retail skeletons, then a set of
//     hand-written names that put every branch of the filter in the position of deciding the answer.

const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

export const RIGS = [
  { id: 'fp-human', nif: 'meshes/xbase_anim.1st.nif' },
  { id: 'fp-female', nif: 'meshes/base_anim_female.1st.nif' },
  { id: 'fp-beast', nif: 'meshes/base_animkna.1st.nif' },
  { id: 'tp-human', nif: 'meshes/base_anim.nif' },
];
export const MASK_ROOTS = [
  'bip01 l clavicle',
  'Bip01 R Clavicle',
  'bip01 spine1',
  'bip01 spine',
  'bip01 neck',
  'bip01',
  'camera',
  'nosuchbone',
  '',
];
const BEAST_RACES = new Set(['khajiit', 'argonian']);

/** The fields of a BODY record that these rules read. */
export const toPart = (record) => ({
  id: record.id,
  slot: record.slot,
  race: record.race,
  female: !!record.female,
  skin: !!record.skin,
  playable: !!record.playable,
  firstPerson: !!record.firstPerson,
  vampire: !!record.vampire,
});

/** The inputs, read from the retail files. Only the recording step calls this. */
export function readInputs({ dataPath, fs, path, modules }) {
  const { MwBsaFile, parseNif, flattenNif, buildSkeleton, bodyParts } = modules;
  const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map(
    (name) => new MwBsaFile(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.bsa`)))),
  );
  const get = (name) => {
    const archive = archives.find((candidate) => candidate.has(name));
    return archive ? archive.get(name).slice() : null;
  };
  const parts = ['Morrowind', 'Tribunal', 'Bloodmoon'].flatMap((name) =>
    bodyParts(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.esm`)))).map(toPart),
  );
  const modelOf = [];
  for (const name of ['Morrowind', 'Tribunal', 'Bloodmoon']) {
    for (const record of bodyParts(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.esm`))))) {
      if (record.model) modelOf.push(record.model);
    }
  }

  const skeletons = {};
  for (const rig of RIGS) {
    const skeleton = buildSkeleton(parseNif(get(rig.nif)));
    skeletons[rig.id] = [...skeleton.nodes].map(([ref, node]) => [ref, node.name, node.parent]);
  }

  const shapeNames = new Set();
  for (const model of new Set(modelOf)) {
    const bytes = get(`meshes/${model}`);
    if (!bytes) continue;
    try {
      for (const batch of flattenNif(parseNif(bytes), { includeHidden: true })) shapeNames.add(batch.name);
    } catch {
      // A mesh the reader refuses has no shape names to record.
    }
  }
  const boneNames = new Set();
  for (const nodes of Object.values(skeletons)) for (const [, name] of nodes) boneNames.add(name);

  const races = [...new Set(parts.map((part) => part.race))].sort();
  return {
    parts,
    races,
    skeletons,
    shapeNames: [...shapeNames].sort(),
    boneNames: [...boneNames].sort(),
  };
}

const SYNTHETIC_RACES = ['alpha', 'beta'];
const HEAD_IDS = ['WerewolfHead', 'werewolfhair', 'WEREWOLFHEAD', 'WerewolfHair', 'wolfmask', 'b_n_alpha_m_head'];
const SLOTS = ['head', 'hair', 'chest', 'hand'];

/** Seeded random lists of records over the slots and flags that these rules read. */
export function syntheticLists() {
  const random = makeRandom(20261113);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const lists = [];
  for (let n = 0; n < 400; n++) {
    const list = [];
    const count = 1 + Math.floor(random() * 10);
    for (let i = 0; i < count; i++) {
      list.push({
        id: random() < 0.45 ? pick(HEAD_IDS) : `r${n}_${i}`,
        slot: pick(SLOTS),
        race: pick(SYNTHETIC_RACES),
        female: random() < 0.5,
        skin: random() < 0.85,
        playable: random() < 0.7,
        firstPerson: random() < 0.3,
        vampire: random() < 0.5,
      });
    }
    lists.push(list);
  }
  return lists;
}

const NAME_POOL = [
  'Bip01',
  'Bip01 L Clavicle',
  'bip01 spine1',
  'BIP01 NECK',
  'Camera',
  'Tri Hand',
  'hand',
  'Shield Bone',
];

/** Seeded random node trees: shuffled refs, repeated and mixed-case names, parents that are missing or -1. */
export function syntheticTrees() {
  const random = makeRandom(20261114);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const trees = [];
  for (let n = 0; n < 300; n++) {
    const count = 1 + Math.floor(random() * 40);
    const refs = Array.from({ length: count }, (_, i) => i * 3 + 5);
    const nodes = refs.map((ref, i) => {
      let parent = i === 0 ? -1 : refs[Math.floor(random() * i)];
      if (random() < 0.04) parent = -1;
      if (random() < 0.03) parent = 9999;
      return [ref, pick(NAME_POOL), parent];
    });
    trees.push({ nodes, roots: [pick(NAME_POOL), pick(NAME_POOL).toLowerCase(), pick(NAME_POOL).toUpperCase()] });
  }
  return trees;
}

export const HAND_SHAPES = [
  '',
  null,
  undefined,
  '   ',
  'Tri Left Hand',
  'tri left hand',
  'TRI  left hand',
  'Tri',
  'tri ',
  'Left Hand',
  'left hand extra',
  'Hand',
  'Tri Tri Hand',
  'Tri Bip01 Head',
  'hair',
];
export const HAND_BONES = [
  'left hand',
  'Left Hand',
  'hand',
  '',
  'tri ',
  ' left hand',
  'tri hand',
  'head',
  'Bip01 Head',
];

const skeletonOf = (nodes) => ({ nodes: new Map(nodes.map(([ref, name, parent]) => [ref, { name, parent }])) });
const sorted = (set) => [...set].sort();

/** The answers of the vampire head, the werewolf head and the vampire row of playerBodyRows. */
export function recordHeadAnswers(fns, inputs) {
  const { vampireHeadRecord, werewolfHeadRows, playerBodyRows } = fns;
  const idOf = (record) => (record ? record.id : null);
  const rowsOf = (rows) => rows.map((row) => [row.slot, idOf(row.record), row.verdict]);
  const headRows = (rows) => rows.map((row) => [row.slot, idOf(row.record)]);
  const out = { real: {}, synthetic: {} };

  const races = [...inputs.races, inputs.races[0]?.toUpperCase(), '', undefined];
  for (const race of races) {
    for (const female of [false, true]) {
      const key = `${race}|${female ? 'f' : 'm'}`;
      const beast = BEAST_RACES.has(String(race || '').toLowerCase());
      out.real[key] = {
        vampire: idOf(vampireHeadRecord(inputs.parts, race, female)),
        rows: [false, true].map((vampire) =>
          rowsOf(playerBodyRows(inputs.parts, race, female, { beast, faceIndex: 0, vampire })),
        ),
      };
    }
  }
  out.real.werewolf = headRows(werewolfHeadRows(inputs.parts));
  out.real.werewolfNone = [
    headRows(werewolfHeadRows(null)),
    headRows(werewolfHeadRows(undefined)),
    headRows(werewolfHeadRows([])),
  ];

  out.synthetic.lists = syntheticLists().map((list) => ({
    werewolf: headRows(werewolfHeadRows(list)),
    vampires: SYNTHETIC_RACES.flatMap((race) =>
      [false, true].map((female) => idOf(vampireHeadRecord(list, race.toUpperCase(), female))),
    ),
  }));
  return out;
}

/** The answers of the blend mask and the shape filter. */
export function recordBoneAnswers(fns, inputs) {
  const { blendMaskBones, shapeMatchesBone } = fns;
  const out = { trees: {}, shapes: {} };

  for (const [id, nodes] of Object.entries(inputs.skeletons)) {
    const skeleton = skeletonOf(nodes);
    out.trees[id] = {
      default: sorted(blendMaskBones(skeleton)),
      roots: MASK_ROOTS.map((root) => sorted(blendMaskBones(skeleton, root))),
    };
  }
  out.trees.synthetic = syntheticTrees().map((tree) => {
    const skeleton = skeletonOf(tree.nodes);
    return tree.roots.map((root) => sorted(blendMaskBones(skeleton, root)));
  });
  out.trees.edge = [
    sorted(blendMaskBones(null)),
    sorted(blendMaskBones(undefined, 'bip01')),
    sorted(blendMaskBones({})),
    sorted(blendMaskBones({ nodes: new Map() })),
  ];

  // Every retail shape name against every retail bone name: the pairs that match, by index.
  out.shapes.retail = [];
  inputs.shapeNames.forEach((shape, shapeIndex) => {
    inputs.boneNames.forEach((bone, boneIndex) => {
      if (shapeMatchesBone(shape, bone)) out.shapes.retail.push([shapeIndex, boneIndex]);
    });
  });
  out.shapes.hand = HAND_SHAPES.map((shape) => HAND_BONES.map((bone) => shapeMatchesBone(shape, bone)));
  out.shapes.noBone = HAND_SHAPES.map((shape) => shapeMatchesBone(shape, undefined));
  return out;
}

/** Everything the rules answer for the inputs, in a plain shape that survives JSON. */
export function recordAnswers(fns, inputs) {
  return { ...recordHeadAnswers(fns, inputs), ...recordBoneAnswers(fns, inputs) };
}
