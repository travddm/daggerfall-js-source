// The NIF material rules (src/formats/morrowind/nif-material.ts) were rewritten from nif.xml and fixed-function
// lighting, without the third-party source they had been ported from. These tests run the current code over the
// inputs of nif-material-sweep.mjs and compare with a recording of the implementation it replaced
// (test/fixtures/mw/nif-material-parity.json): 132,408 ordered property chains from a pool of 35 properties, the
// geometry-name, selector-node, marker-flag and per-vertex colour rules over lists of inputs, and, with the game
// files, every NIF of the three archives flattened.
//
// The recording came from mwNifMesh.js at commit 9c53dece6e: run recordChains, recordSmall, recordPerVertex and
// recordRetail from nif-material-sweep.mjs over that file. No third-party engine source was read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as material from '../../../src/formats/morrowind/nif-material.ts';
import {
  CHAIN_NIF,
  exactJson,
  propertyPool,
  recordChains,
  recordPerVertex,
  recordRetail,
  recordSmall,
} from './nif-material-sweep.mjs';

// What the recording keeps: Infinity, NaN and undefined survive the round trip through JSON.
const kept = (value: unknown) => JSON.parse(exactJson(value));

// Loaded by a computed path: these modules reach src/net, whose crypto types the Node type pass does not have.
const load = (path: string) => import(new URL(`../../../src/${path}`, import.meta.url).href);
const mesh = await load('formats/morrowind/mwNifMesh.js');
const { MwBsaFile } = await load('formats/morrowind/mwBsaFile.js');
const { parseNif, deref, TEX_SLOT } = await load('formats/morrowind/mwNifFile.js');

const { recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/nif-material-parity.json', import.meta.url), 'utf8'),
);
const modules = { ...mesh, MwBsaFile, parseNif };

test('material: every chain of properties resolves as recorded, with and without vertex colours', () => {
  const now = recordChains({ modules });
  assert.equal(now.chains, recorded.chains.chains);
  assert.deepEqual(kept(now.heads), recorded.chains.heads);
  assert.deepEqual(kept(now.tally), recorded.chains.tally);
});

test('material: the named chains and the malformed records answer as recorded', () => {
  const now = recordChains({ modules });
  assert.deepEqual(kept(now.named), recorded.chains.named);
  assert.deepEqual(kept(now.malformed), recorded.chains.malformed);
});

test('material: the recording reaches the cases the rules turn on', () => {
  const kinds = Object.keys(recorded.chains.tally);
  for (const kind of ['mode 0', 'mode 1', 'mode 2', 'mode 0 dark', 'mode 1 dark', 'mode 0 two-sided', 'mode 0 blend']) {
    assert.ok(kinds.includes(kind), kind);
  }
});

test('material: the tables, the name skip list, the selector nodes and the marker flag answer as recorded', () => {
  assert.deepEqual(kept(recordSmall({ modules })), recorded.small);
});

test('material: the per-vertex colour rules answer as recorded', () => {
  assert.deepEqual(kept(recordPerVertex({ modules })), recorded.perVertex);
});

test('the base texture is slot 0 of the texturing property', () => {
  assert.equal(TEX_SLOT.base, 0);
});

test('a surface with no property is white, opaque and drawn one-sided', () => {
  const plain = mesh.resolveMaterial(CHAIN_NIF, [], false);
  assert.deepEqual(plain.diffuse, [1, 1, 1]);
  assert.deepEqual(plain.ambient, [1, 1, 1]);
  assert.deepEqual(plain.emissive, [0, 0, 0]);
  assert.equal(plain.glossiness, 0);
  assert.equal(plain.alphaBlend, false);
  assert.equal(plain.depthTest, true);
  assert.equal(plain.twoSided, false);
  assert.equal(plain.vertexColorMode, material.VERTEX_COLOR_MODE.None);
  assert.equal(mesh.resolveMaterial(CHAIN_NIF, [], true).vertexColorMode, material.VERTEX_COLOR_MODE.AmbientAndDiffuse);
});

test('a lighting mode outlives the property that set it, so an ancestor that lights by emission blacks the surface out', () => {
  const lightsByEmission = {
    type: 'NiVertexColorProperty',
    vertexMode: material.VERT_MODE.SrcAmbDif,
    lightingMode: material.LIGHT_MODE.Emissive,
  };
  const takesEmission = {
    type: 'NiVertexColorProperty',
    vertexMode: material.VERT_MODE.SrcEmissive,
    lightingMode: material.LIGHT_MODE.EmiAmbDif,
  };
  const resolved = mesh.resolveMaterial(CHAIN_NIF, [lightsByEmission, takesEmission], true);
  assert.equal(resolved.vertexColorMode, material.VERTEX_COLOR_MODE.Emission);
  assert.deepEqual(resolved.diffuse, [0, 0, 0]);
  assert.deepEqual(resolved.ambient, [0, 0, 0]);
});

test('a mode that wants vertex colours on a mesh without any draws the plain colour', () => {
  const takesEmission = { type: 'NiVertexColorProperty', vertexMode: material.VERT_MODE.SrcEmissive, lightingMode: 1 };
  const resolved = mesh.resolveMaterial(CHAIN_NIF, [takesEmission], false);
  assert.deepEqual(resolved.emissive, [1, 1, 1]);
  assert.equal(resolved.vertexColorMode, material.VERTEX_COLOR_MODE.None);
});

test('a nearer alpha property with blending off removes the blend an ancestor turned on', () => {
  const on = { type: 'NiAlphaProperty', flags: 0x00ed, threshold: 0 };
  const off = { type: 'NiAlphaProperty', flags: 0x0000, threshold: 0 };
  assert.equal(mesh.resolveMaterial(CHAIN_NIF, [on], false).alphaBlend, true);
  assert.equal(mesh.resolveMaterial(CHAIN_NIF, [on, off], false).alphaBlend, false);
});

test('shadow shapes never draw and editor markers draw out only when the root says so', () => {
  assert.equal(material.skipGeometryName('Tri Shadow', false), true);
  assert.equal(material.skipGeometryName('shadow plane', false), true);
  assert.equal(material.skipGeometryName('Tri EditorMarker01', false), false);
  assert.equal(material.skipGeometryName('Tri EditorMarker01', true), true);
  assert.equal(material.skipGeometryName('', true), false);
});

test('a vertex colour replaces the diffuse and the emission where the mode names it', () => {
  const colours = [0.1, 0.2, 0.3, 1];
  const diffuse = { vertexColorMode: material.VERTEX_COLOR_MODE.Diffuse, diffuse: [1, 0, 0], emissive: [0, 1, 0] };
  assert.deepEqual(material.diffuseAt(diffuse, colours, 0), [0.1, 0.2, 0.3]);
  assert.deepEqual(material.emissiveAt(diffuse, colours, 0), [0, 1, 0]);
  const emission = { ...diffuse, vertexColorMode: material.VERTEX_COLOR_MODE.Emission };
  assert.deepEqual(material.diffuseAt(emission, colours, 0), [1, 0, 0]);
  assert.deepEqual(material.emissiveAt(emission, colours, 0), [0.1, 0.2, 0.3]);
  assert.deepEqual(material.emissiveAt(undefined, colours, 0), [0, 0, 0]);
});

test('the pool the chains are built from has 35 properties', () => {
  assert.equal(propertyPool().length, 35);
});

test('a file whose only record is a bare texture holds no scene, so it flattens to nothing', () => {
  const texture = { type: 'NiPixelData', pixelFormat: 0, bitsPerPixel: 24, mipmaps: [], pixels: new Uint8Array(0) };
  const textureOnly = { version: 0x04000002, records: [texture], roots: [0] };
  assert.deepEqual(mesh.flattenNif(textureOnly), []);
});

const dataPath = process.env.MW_DATA_PATH;
const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.bsa`);
const present = !!dataPath && archives.every((name) => existsSync(join(dataPath, name)));

test('every NIF of the retail archives flattens as recorded', { skip: !present }, () => {
  const live = recordRetail({ dataPath, fs: { readFileSync }, path: { join }, modules });
  for (const name of Object.keys(recorded.retail)) {
    assert.equal(live[name].names, recorded.retail[name].names, `${name}: file count`);
    const first = live[name].digests.findIndex(
      (digest: string, at: number) => digest !== recorded.retail[name].digests[at],
    );
    assert.equal(first, -1, first < 0 ? '' : `${name}: ${live[name].list[first]}`);
  }
});

test(
  'the two crystal files of the first archive are one bare texture each and flatten to nothing',
  { skip: !present },
  () => {
    const archive = new MwBsaFile(new Uint8Array(readFileSync(join(dataPath as string, 'Morrowind.bsa'))));
    for (const file of ['meshes/i/tx_crystal_02.nif', 'meshes/i/tx_crystal_03.nif']) {
      const nif = parseNif(archive.get(file).slice());
      assert.deepEqual(
        nif.records.map((record: { type: string }) => record.type),
        ['NiPixelData'],
        file,
      );
      assert.deepEqual(mesh.flattenNif(nif), [], file);
    }
  },
);
