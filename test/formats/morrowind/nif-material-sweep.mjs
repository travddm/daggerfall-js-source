import { createHash } from 'node:crypto';

// A fixed set of inputs for the NIF material rules (src/formats/morrowind/nif-material.ts, reached through
// mwNifMesh.js) and the way their answers are recorded. nif-material.test.ts runs the current code over these inputs
// and compares with the recording in test/fixtures/mw/nif-material-parity.json, which was made from the
// implementation it replaced.
//
// The inputs are:
//   - every ordered chain of up to three properties drawn from a pool of 35 (the material, texturing, alpha,
//     depth-buffer, vertex-colour and stencil records, in the values that matter), with and without vertex colours,
//     and a handful of malformed records. The recording keeps one digest per chain head and a tally of what the
//     chains resolve to; a few chains are kept in full,
//   - a list of geometry names against the marker flag, selector nodes of every kind, extra-data chains, and
//     materials against colour arrays for the two per-vertex colour rules,
//   - with the game files, every NIF of Morrowind.bsa, Tribunal.bsa and Bloodmoon.bsa, flattened: one digest of the
//     batch names, counts and materials per file.

/** JSON that keeps Infinity and NaN, which plain JSON turns into null, and writes typed arrays as arrays. */
export const exactJson = (value) =>
  JSON.stringify(value, (_key, inner) => {
    if (typeof inner === 'number' && !Number.isFinite(inner)) return `number:${inner}`;
    if (inner === undefined) return 'undefined';
    if (ArrayBuffer.isView(inner)) return Array.from(inner);
    return inner;
  });

const digestOf = (value) => createHash('sha256').update(exactJson(value)).digest('hex').slice(0, 12);

/** The records the chains refer to: texture sources an external file, one with no file name, one built in. */
export const CHAIN_NIF = {
  records: [
    { type: 'NiSourceTexture', external: true, fileName: 'tx_a.dds' },
    { type: 'NiSourceTexture', external: true, fileName: '' },
    { type: 'NiSourceTexture', external: false, fileName: 'inner.dds' },
  ],
};

const material = (name, diffuse, ambient, emissive, alpha) => ({
  type: 'NiMaterialProperty',
  name,
  diffuse,
  ambient,
  emissive,
  alpha,
});
const texturing = (base) => ({ type: 'NiTexturingProperty', textures: [base, null, null] });
const alpha = (flags, threshold) => ({ type: 'NiAlphaProperty', flags, threshold });
const depth = (flags) => ({ type: 'NiZBufferProperty', flags });
const vertexColour = (vertexMode, lightingMode) => ({ type: 'NiVertexColorProperty', vertexMode, lightingMode });
const stencil = (drawMode) => ({ type: 'NiStencilProperty', drawMode });

/** The 35 records the chains are built from. */
export function propertyPool() {
  const pool = [
    material('glow', [0.5, 0.6, 0.7], [0.1, 0.2, 0.3], [0.4, 0, 0.8], 0.5),
    material('', [0, 1, 0], [1, 0, 0], [0, 0, 0], 1),
    texturing({ source: 0, clampMode: 1 }),
    texturing({ source: 1, clampMode: 2 }),
    texturing({ source: 2, clampMode: 0 }),
    texturing(null),
  ];
  for (const [flags, threshold] of [
    [0x0000, 0],
    [0x0001, 0],
    [0x00ed, 128],
    [0x0200, 90],
    [0x12ed, 255],
    [0x0abc, 7],
    [0xffff, 1],
  ]) {
    pool.push(alpha(flags, threshold));
  }
  for (const flags of [0, 1, 2, 3]) pool.push(depth(flags));
  for (const vertexMode of [0, 1, 2, 3]) {
    for (const lightingMode of [0, 1, 2]) pool.push(vertexColour(vertexMode, lightingMode));
  }
  for (const drawMode of [0, 1, 2, 3, 4]) pool.push(stencil(drawMode));
  pool.push({ type: 'NiSpecularProperty', flags: 1 });
  return pool;
}

// The words of a built-in error name the variable it read, which the code is free to rename: only the kind is kept,
// and the text of the one error the file reader itself throws.
const describeError = (error) => (error.message.startsWith('NIF:') ? `${error.name}: ${error.message}` : error.name);

const settle = (call) => {
  try {
    return call();
  } catch (error) {
    return { threw: describeError(error) };
  }
};

/** What a resolved material is, in a few words, for the tally. */
function shapeOf(resolved) {
  const dark = resolved.diffuse.every((channel) => channel === 0) && resolved.ambient.every((channel) => channel === 0);
  return `mode ${resolved.vertexColorMode}${dark ? ' dark' : ''}${resolved.twoSided ? ' two-sided' : ''}${
    resolved.alphaBlend ? ' blend' : ''
  }`;
}

/** The material chains: one digest per head and colour setting, a tally, and a few chains in full. */
export function recordChains({ modules }) {
  const { resolveMaterial } = modules;
  const pool = propertyPool();
  const byHead = {};
  const tally = {};
  let count = 0;
  const run = (chain, colours) => {
    const resolved =
      colours === undefined ? resolveMaterial(CHAIN_NIF, chain) : resolveMaterial(CHAIN_NIF, chain, colours);
    return resolved;
  };
  const note = (head, chain, colours) => {
    const resolved = run(chain, colours);
    const key = `${head}|${colours}`;
    const entry = (byHead[key] ??= createHash('sha256'));
    entry.update(exactJson(resolved));
    const label = shapeOf(resolved);
    tally[label] = (tally[label] ?? 0) + 1;
    count += 1;
  };
  for (const colours of [false, true, undefined]) {
    note('empty', [], colours);
    pool.forEach((first, headIndex) => {
      note(headIndex, [first], colours);
      for (const second of pool) {
        note(headIndex, [first, second], colours);
        for (const third of pool) note(headIndex, [first, second, third], colours);
      }
    });
  }
  const heads = Object.fromEntries(Object.entries(byHead).map(([key, hash]) => [key, hash.digest('hex').slice(0, 12)]));
  const [glow, plain, base, noSource, internal, noBase] = pool;
  const named = {
    empty: run([], false),
    emptyColoured: run([], true),
    glowPlain: run([glow], false),
    glowBase: run([glow, base], true),
    sourceWithoutFile: run([noSource], false),
    internalSource: run([internal], false),
    noBase: run([noBase], false),
    plainStencil: run([plain, stencil(3)], true),
    ancestorBlackout: run([vertexColour(2, 0), vertexColour(1, 1)], true),
    ancestorBlackoutBare: run([vertexColour(2, 0), vertexColour(1, 1)], false),
    emissiveNoColours: run([vertexColour(1, 1)], false),
    clockwise: run([stencil(2)], false),
    alphaTest: run([alpha(0x12ed, 255)], false),
  };
  const malformed = {
    noDiffuse: settle(() => resolveMaterial(CHAIN_NIF, [{ type: 'NiMaterialProperty', name: 'x' }], true)),
    noTextures: settle(() => resolveMaterial(CHAIN_NIF, [{ type: 'NiTexturingProperty' }], false)),
    danglingSource: settle(() => resolveMaterial(CHAIN_NIF, [texturing({ source: 99, clampMode: 1 })], false)),
    absentSource: settle(() => resolveMaterial(CHAIN_NIF, [texturing({ source: -1, clampMode: 1 })], false)),
    noModes: settle(() => resolveMaterial(CHAIN_NIF, [{ type: 'NiVertexColorProperty' }], true)),
    noType: settle(() => resolveMaterial(CHAIN_NIF, [{}], true)),
    noList: settle(() => resolveMaterial(CHAIN_NIF, undefined, true)),
    nameNull: resolveMaterial(CHAIN_NIF, [{ ...material(null, [1, 1, 1], [1, 1, 1], [0, 0, 0], 1) }], false).name,
    colourTruthy: resolveMaterial(CHAIN_NIF, [], 1).vertexColorMode,
    colourEmptyString: resolveMaterial(CHAIN_NIF, [], '').vertexColorMode,
  };
  return { chains: count, heads, tally, named, malformed };
}

/** The tables and the small rules. */
export function recordSmall({ modules }) {
  const { VERTEX_COLOR_MODE, VERT_MODE, LIGHT_MODE, DRAW_MODE, skipGeometryName, selectedChild, hasMarkerFlag } =
    modules;
  const names = [
    '',
    null,
    undefined,
    123,
    'Shadow',
    'shadow plane',
    'SHADOWFOOT',
    'Tri Shadow',
    'tri shadow x',
    'TRI SHADOW',
    'Tri EditorMarker',
    'tri editormarker01',
    'Tri EditorMarker',
    'tri editormarke',
    ' shadow',
    'xshadow',
    'tri  shadow',
    'tri_shadow',
    'Keep',
    'sha',
    'tri',
    'tri e',
    'Shädow',
    'ŞHADOW',
  ];
  const skip = {};
  for (const name of names) {
    skip[String(name)] = [true, false, undefined].map((markers) => skipGeometryName(name, markers));
  }
  const lod = (levels) => ({ type: 'NiLODNode', lodLevels: levels });
  const selectors = [
    lod([{ near: 0, far: 100 }]),
    lod([{ near: 100, far: 500 }]),
    lod([
      { near: 100, far: 500 },
      { near: 0, far: 100 },
    ]),
    lod([
      { near: -5, far: 0 },
      { near: -1, far: 10 },
    ]),
    lod([{ near: 0, far: 0 }]),
    lod([{ near: -1, far: 1e-9 }]),
    lod([{ near: Number.NaN, far: 5 }]),
    lod([]),
    lod(undefined),
    lod(null),
    lod('x'),
    { type: 'NiSwitchNode', index: 0 },
    { type: 'NiSwitchNode', index: 3 },
    { type: 'NiSwitchNode', index: -1 },
    { type: 'NiSwitchNode', index: 1.5 },
    { type: 'NiSwitchNode', index: '2' },
    { type: 'NiSwitchNode' },
    { type: 'NiSwitchNode', index: null },
    { type: 'NiNode' },
    { type: 'NiSortAdjustNode', index: 4 },
    { type: 'NiCollisionSwitch', index: 4 },
    {},
  ];
  const selected = selectors.map((rec) => settle(() => selectedChild(rec)));
  const extraChain = (chain) => ({
    records: chain.map((entry, at) => ({ ...entry, next: at + 1 < chain.length ? at + 1 : -1 })),
  });
  const marked = [
    [{ type: 'NiStringExtraData', string: 'MRK' }],
    [{ type: 'NiStringExtraData', string: 'mrk' }],
    [{ type: 'NiStringExtraData', string: 'MRK ' }],
    [{ type: 'NiTextKeyExtraData', string: 'MRK' }],
    [
      { type: 'NiStringExtraData', string: 'x' },
      { type: 'NiStringExtraData', string: 'MRK' },
    ],
    [
      { type: 'NiStringExtraData', string: 'x' },
      { type: 'NiStringExtraData', string: 'y' },
    ],
    [{ type: 'NiStringExtraData', string: 'MRK', next: undefined }],
    [],
  ];
  const flags = marked.map((chain) => {
    const nif = extraChain(chain);
    return [hasMarkerFlag(nif, { extra: chain.length ? 0 : -1 }), hasMarkerFlag(nif, null), hasMarkerFlag(nif, {})];
  });
  return {
    tables: { VERTEX_COLOR_MODE, VERT_MODE, LIGHT_MODE, DRAW_MODE },
    skip,
    selected,
    flags,
  };
}

/** The two per-vertex colour rules over a spread of materials and colour arrays. */
export function recordPerVertex({ modules }) {
  const { VERTEX_COLOR_MODE, diffuseAt, emissiveAt } = modules;
  const colours = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  const materials = [
    undefined,
    null,
    {},
    { diffuse: [0.9, 0.8, 0.7] },
    { diffuse: [0.9, 0.8, 0.7], emissive: [0.2, 0.3, 0.4] },
    { emissive: [0.2, 0.3, 0.4] },
  ];
  for (const mode of [...Object.values(VERTEX_COLOR_MODE), 6, -1]) {
    materials.push({ vertexColorMode: mode, diffuse: [1, 0, 0], emissive: [0, 0.5, 0] });
  }
  const out = [];
  for (const mat of materials) {
    for (const palette of [colours, null, undefined]) {
      for (const at of [0, 1]) {
        out.push([settle(() => diffuseAt(mat, palette, at)), settle(() => emissiveAt(mat, palette, at))]);
      }
    }
  }
  return out;
}

/** Every NIF of the three archives, flattened: one digest per file, in the sorted order of its archive's names. */
export function recordRetail({ dataPath, fs, path, modules }) {
  const { MwBsaFile, parseNif, flattenNif } = modules;
  const perArchive = {};
  for (const name of ['Morrowind', 'Tribunal', 'Bloodmoon']) {
    const archive = new MwBsaFile(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.bsa`))));
    const files = archive
      .list()
      .filter((file) => file.endsWith('.nif'))
      .sort();
    const digests = [];
    const names = [];
    for (const file of files) {
      names.push(file);
      let nif;
      try {
        nif = parseNif(archive.get(file).slice());
      } catch {
        digests.push('unparsed');
        continue;
      }
      let batches;
      try {
        batches = flattenNif(nif);
      } catch (error) {
        digests.push(`throws: ${describeError(error)}`);
        continue;
      }
      digests.push(
        digestOf(
          batches.map((batch) => [
            batch.name,
            batch.skinned,
            batch.indices.length,
            batch.positions.length,
            batch.animFlags,
            batch.parentRef,
            batch.material,
          ]),
        ).slice(0, 8),
      );
    }
    perArchive[name] = { names: names.length, digests };
    perArchive[name].list = names;
  }
  return perArchive;
}
