import { createHash } from 'node:crypto';
import { exactJson } from './nif-material-sweep.mjs';

// A fixed set of inputs for the body-part attach table (PART_BONES in src/formats/morrowind/mwNpc.js, built by
// src/formats/morrowind/mw-body-part-bones.ts) and the way its answers are recorded. mw-body-part-bones.test.ts runs
// the current code over these inputs and compares with the recording in test/fixtures/mw/npc-bones-parity.json, which
// was made from the implementation it replaced.
//
// The inputs are every body-part slot name the ESM reader knows and, with the game files, every NPC_ record of
// Morrowind.esm, Tribunal.esm and Bloodmoon.esm read in that order as one load. The answers are the table itself and,
// for each NPC_, one short digest of the assembled body (the slot, body id, model and attach bones of every part, the
// skeleton file and the missing parts).

const digestOf = (value) => createHash('sha256').update(exactJson(value)).digest('hex').slice(0, 8);

/** The table as a list of [slot, bones] rows, in the order the table holds them. */
export const tableRows = (partBones) => Object.entries(partBones).map(([slot, bones]) => [slot, [...bones]]);

/** What the assembler answers for one NPC_, as a digest; a record it refuses digests the message. */
function digestOfNpc({ parseEsm, assembleNpc, indexSkins }, esm, skins, id) {
  try {
    const { animFile, parts, missing } = assembleNpc(esm, id, skins);
    return digestOf({ animFile, missing, parts: parts.map(({ slot, bodyId, model, attachBones }) => [slot, bodyId, model, attachBones]) });
  } catch (error) {
    return `error:${digestOf(String(error.message))}`;
  }
}

/** Every NPC_ of the three .esm files read as one load: the count, the ids and one digest each. */
export function recordNpcs({ dataPath, fs, path, modules }) {
  const { parseEsm, indexSkins } = modules;
  const files = ['Morrowind.esm', 'Tribunal.esm', 'Bloodmoon.esm'].map((name) => fs.readFileSync(path.join(dataPath, name)));
  const bytes = new Uint8Array(files.reduce((sum, file) => sum + file.byteLength, 0));
  let at = 0;
  for (const file of files) {
    bytes.set(file, at);
    at += file.byteLength;
  }
  const esm = parseEsm(bytes);
  const skins = indexSkins(esm.bodies);
  const ids = [...esm.npcs.keys()].sort();
  return { ids, digests: ids.map((id) => digestOfNpc(modules, esm, skins, id)) };
}
