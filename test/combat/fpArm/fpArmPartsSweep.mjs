// Inputs for the first-person arm's carried-part resolution (src/combat/fpArm/fpArmParts.js), and the way its answers
// are recorded.
//
// fpArmParts.test.js runs the resolvers over the retail Morrowind files and compares the answers with
// test/fixtures/mw/fpArmPartsParity.json, which was recorded from the code before its rewrite. The resolvers come from
// the caller, so the same sweep runs against either implementation. Mesh bytes are not recorded: a part is recorded by
// its slot, its bones, the size of its bytes and the transform it takes before the bone.

/** Every skeleton a body can stand on: first and third person; man, woman, beast; and the werewolf. */
export const SKELETONS = [
  'meshes/xbase_anim.1st.nif',
  'meshes/base_anim_female.1st.nif',
  'meshes/base_animkna.1st.nif',
  'meshes/wolf/skin.1st.nif',
  'meshes/base_anim.nif',
  'meshes/base_anim_female.nif',
  'meshes/base_animkna.nif',
  'meshes/wolf/skin.nif',
];

/** Daggerfall's material indices, iron (0) to daedric (9). */
export const MATERIALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const r6 = (value) => (Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : String(value));

function transformOf(pre) {
  if (!pre) return null;
  return { a: Array.from(pre.a ?? [], r6), t: Array.from(pre.t ?? [], r6), s: pre.s === undefined ? null : r6(pre.s) };
}

function partOf(part) {
  return {
    slot: part.slot,
    bones: part.bones,
    size: part.bytes ? part.bytes.length : null,
    pre: transformOf(part.preTransform),
    clipNode: part.preClip ? part.preClip.node : null,
    ammo: !!part.ammo,
    hang: !!part.hang,
  };
}

function weaponAnswer(res) {
  return {
    mwType: res.mwType,
    parts: res.parts.map(partOf),
    weapon: res.weaponInfo,
    arrow: res.arrowInfo,
    notes: res.notes,
  };
}

/** Reads the three archives and the three masters from a Morrowind Data Files folder. */
export function readRetailData({ dataPath, fs, MwBsaFile, weaponRecords, lightRecords }) {
  const names = ['Morrowind', 'Tribunal', 'Bloodmoon'];
  const archives = names.map((name) => new MwBsaFile(new Uint8Array(fs.readFileSync(`${dataPath}/${name}.bsa`))));
  const esms = names.map((name) => new Uint8Array(fs.readFileSync(`${dataPath}/${name}.esm`)));
  return {
    archives,
    allWeapons: esms.flatMap((bytes) => weaponRecords(bytes)),
    allLights: esms.flatMap((bytes) => lightRecords(bytes)),
  };
}

/**
 * Runs every resolver over every input and answers a plain object.
 * `api`: resolveWeaponParts, resolveOffWeaponParts, resolveTorchPart, resolveHipLanternPart, weaponPartPaths,
 * torchPartPaths, archiveHas, LIGHT_ATTITUDE, WEAPONS, MW_WEAPON_TYPE, dfWeaponToMw.
 */
export function recordParts(api, data) {
  const { archives, allWeapons, allLights } = data;
  const find = (path) => archives.find((a) => a.has(path)) ?? null;
  const has = api.archiveHas(archives);
  const templates = Object.entries(api.WEAPONS);
  const out = {
    attitude: transformOf(api.LIGHT_ATTITUDE),
    weapons: {},
    eachBow: {},
    offWeapons: {},
    torches: {},
    lanterns: {},
    paths: {},
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const path of SKELETONS) {
      const skeletonBytes = find(path)?.get(path);
      if (!skeletonBytes) throw new Error(`the archives carry no ${path}`);
      const rows = {};
      for (const [name, templateIndex] of templates) {
        for (const material of MATERIALS) {
          for (const hasAmmo of [false, true]) {
            const weapon = { group: 'Weapons', templateIndex, material };
            const res = api.resolveWeaponParts({ weapon, hasAmmo, allWeapons, find, skeletonBytes, has });
            rows[`${name}:${material}:${hasAmmo ? 'ammo' : 'none'}`] = weaponAnswer(res);
          }
        }
      }
      rows['none'] = weaponAnswer(
        api.resolveWeaponParts({ weapon: null, hasAmmo: true, allWeapons, find, skeletonBytes, has }),
      );
      out.weapons[path] = rows;

      // Every bow record the archives carry, alone with the ammunition, so each bow mesh's own arrow node is used.
      const bows = {};
      const bowTypes = new Set([api.MW_WEAPON_TYPE.MarksmanBow, api.MW_WEAPON_TYPE.MarksmanCrossbow]);
      const ammo = allWeapons.filter((r) => !bowTypes.has(r.type) && r.type >= api.MW_WEAPON_TYPE.Arrow);
      for (const rec of allWeapons.filter((r) => bowTypes.has(r.type))) {
        for (const [name, templateIndex] of templates) {
          const weapon = { group: 'Weapons', templateIndex, material: 0 };
          if (api.dfWeaponToMw(weapon, api.WEAPONS) !== rec.type) continue;
          const res = api.resolveWeaponParts({
            weapon,
            hasAmmo: true,
            allWeapons: [rec, ...ammo],
            find,
            skeletonBytes,
            has,
          });
          bows[`${rec.id}:${name}`] = weaponAnswer(res);
        }
      }
      out.eachBow[path] = bows;

      const off = {};
      for (const [name, templateIndex] of templates) {
        const weapon = { group: 'Weapons', templateIndex, material: 0 };
        const fromBytes = api.resolveOffWeaponParts({ weapon, allWeapons, find, skeletonBytes, has });
        const assembled = api.resolveOffWeaponParts({
          weapon,
          allWeapons,
          find,
          skeletonBytes,
          has,
          hasBone: () => true,
        });
        off[name] = {
          fromBytes: { parts: fromBytes.parts.map(partOf), info: fromBytes.info, notes: fromBytes.notes },
          assembled: { parts: assembled.parts.map(partOf), info: assembled.info, notes: assembled.notes },
        };
      }
      out.offWeapons[path] = off;

      const torch = {};
      for (const lit of [false, true]) {
        const res = api.resolveTorchPart({ torch: lit, allLights, find, skeletonBytes, has });
        torch[lit ? 'lit' : 'unlit'] = { parts: res.parts.map(partOf), info: res.torchInfo, notes: res.notes };
      }
      const noBone = api.resolveTorchPart({ torch: true, allLights, find, skeletonBytes, has, hasBone: () => false });
      torch.noBone = { parts: noBone.parts.map(partOf), info: noBone.torchInfo, notes: noBone.notes };
      out.torches[path] = torch;

      const lantern = api.resolveHipLanternPart({ hipLight: true, allLights, find, skeletonBytes, has });
      out.lanterns[path] = { parts: lantern.parts.map(partOf), info: lantern.hipInfo, notes: lantern.notes };
    }
    for (const [name, templateIndex] of templates) {
      for (const hasAmmo of [false, true]) {
        const weapon = { group: 'Weapons', templateIndex, material: 9 };
        out.paths[`${name}:${hasAmmo ? 'ammo' : 'none'}`] = api.weaponPartPaths({ weapon, hasAmmo, allWeapons, has });
      }
    }
    out.paths.torch = api.torchPartPaths({ torch: true, allLights, has });
  } finally {
    console.warn = warn;
  }
  return out;
}
