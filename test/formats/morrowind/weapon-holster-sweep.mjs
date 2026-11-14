import { createHash } from 'node:crypto';

// A fixed set of inputs for the holster rules (src/systems/weapon-holster.ts and its wiring: which skeleton
// bone each weapon type sheathes on, where the scabbard and quiver pieces come from, when a holster piece is hidden),
// and the way their answers are recorded. weapon-holster.test.ts runs the current code over these inputs and compares
// with the recording in test/fixtures/mw/weapon-holster-parity.json, which was made from the implementation it
// replaced.
//
// The inputs are:
//   - every weapon record of Morrowind.esm, Tribunal.esm and Bloodmoon.esm (id, model, type), kept in the recording so
//     that the test does not need the game files,
//   - the vendored scabbard meshes, read by the test itself,
//   - for each weapon: its model spelled with forward and with back slashes, a skeleton that has every bone or none,
//     scabbards found or not found, no ammunition, matching ammunition, ammunition of another kind, and stack sizes
//     from 0 to the largest safe integer,
//   - for each vendored scabbard: files that will not parse, whose sheath node is missing, a shape, or has no
//     children, and that have no ammunition node.
// Every answer is recorded as one short digest.

/** JSON that keeps Infinity and NaN, which plain JSON turns into null, and turns byte arrays into a fingerprint. */
export const exactJson = (value) =>
  JSON.stringify(value, (_key, inner) => {
    if (typeof inner === 'number' && !Number.isFinite(inner)) return `number:${inner}`;
    if (inner === undefined) return 'undefined';
    if (inner instanceof Uint8Array) return fingerprint(inner);
    if (inner instanceof Float32Array) return { float32: Array.from(inner) };
    return inner;
  });

function fingerprint(bytes) {
  return `bytes:${bytes.byteLength}:${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}`;
}

const digestOf = (value) => createHash('sha256').update(exactJson(value)).digest('hex').slice(0, 12);

const ARCHIVES = ['Morrowind', 'Tribunal', 'Bloodmoon'];

/** The weapon records of the three master files. */
export function readWeapons({ dataPath, fs, path, modules }) {
  const out = [];
  for (const name of ARCHIVES) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.esm`)));
    for (const weapon of modules.weaponRecords(bytes))
      out.push({ id: weapon.id, model: weapon.model, type: weapon.type });
  }
  return out;
}

/** The vendored scabbard meshes by canonical path: the files of Meshes/w in the vendored folder that holds them. */
export function readVendored({ fs, path, root }) {
  const vendorDir = path.join(root, 'vendor');
  const holder = fs.readdirSync(vendorDir).find((name) => {
    try {
      return fs.readdirSync(path.join(vendorDir, name, 'Data Files/Meshes/w')).some((file) => file.endsWith('_sh.nif'));
    } catch {
      return false;
    }
  });
  const meshDir = path.join(vendorDir, holder, 'Data Files/Meshes/w');
  const files = new Map();
  for (const file of fs.readdirSync(meshDir).sort()) {
    files.set(`meshes/w/${file}`, new Uint8Array(fs.readFileSync(path.join(meshDir, file))));
  }
  return files;
}

const WEAPON_BYTES = new Uint8Array([9, 9, 9]);
const AMMO_BYTES = new Uint8Array([7, 7]);

/** The archive the resolver reads: the vendored meshes by canonical path. */
function findIn(files) {
  const normal = (path) => String(path).replace(/\\/g, '/').toLowerCase();
  const archive = { has: (path) => files.has(normal(path)), get: (path) => files.get(normal(path)) };
  return (path) => (archive.has(path) ? archive : null);
}

/** A parseNif that remembers what it parsed: the same scabbard is parsed again for every case. */
function cachedParser(parseNif) {
  const cache = new Map();
  return (bytes) => {
    const key = fingerprint(bytes);
    if (!cache.has(key)) cache.set(key, parseNif(bytes));
    return cache.get(key);
  };
}

const lower = (value) => String(value?.name ?? '').toLowerCase();

/** Variants of a parsed scabbard: the sheath node renamed, turned into a shape, emptied; the ammunition node renamed. */
const MODES = {
  plain: (nif) => nif,
  sheathRenamed: (nif) => ({
    ...nif,
    records: nif.records.map((record) => (lower(record) === 'bip01 weapon' ? { ...record, name: 'Blade' } : record)),
  }),
  sheathIsShape: (nif) => ({
    ...nif,
    records: nif.records.map((record) =>
      lower(record) === 'bip01 weapon' ? { ...record, type: 'NiTriShape' } : record,
    ),
  }),
  sheathEmptied: (nif) => ({
    ...nif,
    records: nif.records.map((record) => (lower(record) === 'bip01 weapon' ? { ...record, children: [] } : record)),
  }),
  ammoRenamed: (nif) => ({
    ...nif,
    records: nif.records.map((record) => (lower(record) === 'bip01 ammo' ? { ...record, name: 'Quiver' } : record)),
  }),
};

const AMMO_FOR = (modules, type) => {
  const T = modules.MW_WEAPON_TYPE;
  if (type === T.MarksmanBow) return T.Arrow;
  if (type === T.MarksmanCrossbow) return T.Bolt;
  return type;
};

const STACKS = [0, 1, 5, Number.MAX_SAFE_INTEGER, -1, 2.7, Number.NaN];

/** Record every digest of the holster resolver over the weapons and the vendored files. */
export function recordResolver({ sheathing, modules, parseNif, weapons, files }) {
  const T = modules.MW_WEAPON_TYPE;
  const parse = cachedParser(parseNif);
  const find = findIn(files);
  const none = () => null;
  const hasAll = () => true;
  const hasNone = () => false;
  const result = { perWeapon: [], perScabbard: [], branches: {} };
  const tally = (info) => {
    const key = !info
      ? 'null'
      : info.reason
        ? 'no bone'
        : info.scabbard === null
          ? 'bare'
          : info.weaponNode === false
            ? 'whole'
            : info.weaponNodeEmpty
              ? 'emptyNode'
              : 'withNode';
    result.branches[key] = (result.branches[key] ?? 0) + 1;
  };

  for (const weapon of weapons) {
    const row = [];
    for (const spelling of ['slash', 'backslash']) {
      const model = spelling === 'slash' ? weapon.model : weapon.model.replace(/\//g, '\\');
      const answers = [];
      for (const hasBone of [hasAll, hasNone]) {
        for (const finder of [find, none]) {
          const ammos = [
            null,
            { bytes: AMMO_BYTES, type: AMMO_FOR(modules, weapon.type) },
            { bytes: AMMO_BYTES, type: T.Arrow === AMMO_FOR(modules, weapon.type) ? T.Bolt : T.Arrow },
            { bytes: null, type: AMMO_FOR(modules, weapon.type) },
          ];
          for (const ammo of ammos) {
            for (const ammoCount of STACKS) {
              const answer = sheathing.resolveHolsterParts({
                mwType: weapon.type,
                weaponModel: model,
                weaponBytes: WEAPON_BYTES,
                ammo,
                ammoCount,
                find: finder,
                hasBone,
                parseNif: parse,
              });
              tally(answer.info);
              answers.push(answer);
            }
          }
        }
      }
      row.push(digestOf(answers));
    }
    result.perWeapon.push(row);
  }

  const scabbards = [...files.keys()].filter((path) => path.endsWith('_sh.nif'));
  const types = [T.LongBladeOneHand, T.MarksmanBow, T.MarksmanCrossbow, T.MarksmanThrown, T.AxeOneHand];
  for (const path of scabbards) {
    const model = path.slice('meshes/'.length).replace(/_sh\.nif$/, '.nif');
    const answers = [];
    for (const [modeName, mode] of [...Object.entries(MODES), ['throws', null]]) {
      const parser = mode
        ? (bytes) => mode(parse(bytes))
        : () => {
            throw new Error('NIF: unreadable');
          };
      for (const type of types) {
        for (const ammoCount of [0, 3, Number.MAX_SAFE_INTEGER]) {
          const answer = sheathing.resolveHolsterParts({
            mwType: type,
            weaponModel: model,
            weaponBytes: WEAPON_BYTES,
            ammo: { bytes: AMMO_BYTES, type: AMMO_FOR(modules, type) },
            ammoCount,
            find,
            hasBone: hasAll,
            parseNif: parser,
          });
          tally(answer.info);
          answers.push([modeName, answer]);
        }
      }
    }
    result.perScabbard.push([path, digestOf(answers)]);
  }
  return result;
}

/** Record the small functions and tables over fixed grids of inputs. */
export function recordSmall({ sheathing, modules }) {
  const T = modules.MW_WEAPON_TYPE;
  const paths = [
    'meshes/w/w_saber.nif',
    'meshes/w.dir/noext',
    '',
    null,
    undefined,
    'meshes/w/w_saber',
    'MESHES\\W\\W_Saber.NIF',
    'saber',
    'x/y',
    '.',
    'a.b/c',
    'a.b',
    '.nif',
    'x/.nif',
    'meshes/xbase_anim.nif',
    'Meshes\\xbase_anim_female.NIF',
    'xbase_anim.nif',
    'meshes/a.b.c.nif',
    'animations/x.nif',
  ];
  const archives = [
    { list: () => ['Animations/xbase_anim/xbase_anim_sh.nif', 'animations/xbase_anim/readme.txt', 'meshes/x.nif'] },
    {
      names: [
        'animations/xbase_anim/other.NIF',
        'Animations\\xbase_anim\\back.nif',
        'animations/xbase_anim_female/f.nif',
      ],
    },
    { names: ['animations/xbase_anim/xbase_anim_sh.nif', 'animations/xbase_anim_female/g.nif'] },
    {},
    { list: () => [] },
  ];
  const slots = ['holster', 'sheath', 'quiver', 'weapon', '', null];
  const flags = [true, false, 1, 0, null, undefined];
  const small = {
    sheathingBone: Object.fromEntries(Object.entries(sheathing.SHEATHING_BONE)),
    names: [sheathing.SHEATH_WEAPON_NODE, sheathing.SHEATH_AMMO_NODE, [...sheathing.HOLSTER_SLOTS]],
    frozen: [Object.isFrozen(sheathing.SHEATHING_BONE), Object.isFrozen(sheathing.HOLSTER_SLOTS)],
    sheathedMeshPath: paths.map((path) => sheathing.sheathedMeshPath(path)),
    animationsDirOf: paths.map((path) => sheathing.animationsDirOf(path)),
    vendoredDataPath: [
      ...paths,
      'vendor/other-mod/Data Files/Meshes/w/x_sh.nif',
      'C:\\a\\Data Files\\Meshes\\W\\Y.NIF',
      'plain/x.nif',
    ].map((path) => (path == null ? null : sheathing.vendoredDataPath(path))),
    holsters: Array.from({ length: 22 }, (_, at) => [at - 6, sheathing.holsters(at - 6)]),
    holsterPartPaths: [
      { weaponModel: 'w\\w_saber.nif' },
      { weaponModel: 'w/x.nif' },
      { weaponModel: null },
      { weaponModel: '' },
      { weaponModel: undefined },
    ].map((entry) => sheathing.holsterPartPaths(entry)),
    boneSourcesFor: [
      ['meshes/xbase_anim.nif', 'meshes/xbase_anim.nif'],
      ['meshes/xbase_anim.nif', 'meshes/xbase_anim_female.nif'],
      ['meshes/xbase_anim.nif', 'meshes/base_anim.nif'],
      ['Meshes\\xbase_anim.nif', 'meshes/xbase_anim_female.nif'],
      [null, null],
    ].flatMap(([base, skeleton]) => [
      sheathing.boneSourcesFor(base, skeleton, archives),
      sheathing.boneSourcesFor(base, skeleton, [...archives].reverse()),
      sheathing.boneSourcesFor(base, skeleton, undefined),
      sheathing.boneSourcesFor(base, skeleton, null),
    ]),
    holsterHidden: [],
    types: Object.keys(T),
  };
  for (const slot of slots) {
    for (const shown of flags) {
      for (const arrowShown of flags) {
        for (const tag of [null, undefined, { i: 6, n: 7 }, { i: 5, n: 7 }, { i: 0, n: 1 }, { i: 0, n: 0 }]) {
          small.holsterHidden.push(sheathing.holsterHidden(slot, shown, { arrowShown, tag }));
        }
      }
      small.holsterHidden.push(sheathing.holsterHidden(slot, shown));
    }
  }
  return small;
}
