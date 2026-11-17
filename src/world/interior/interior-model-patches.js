// @ts-check
// The model patches of the Close interior gaps row (systems/interior-seams-row.ts), applied where the data pipeline
// builds a model (scenes/dataPipeline.js). The row is read once, the first time a model is built: a model is built once
// and kept, so a change takes effect at the next start. A JavaScript module: it reads the preferences, which the Node
// type pass (tsconfig.node.json) does not check.
import { getPref } from '../../systems/uiPrefs.js';
import { INTERIOR_SEAMS_PREF, interiorSeamsOn } from '../../systems/interior-seams-row.ts';
import { extendKitWallEnds } from './kit-wall-ends.ts';

/** @type {boolean | null} */
let closing = null;

/**
 * The model as it is drawn: with the row on, a kit wall reaching its floor and ceiling; any other model as it was.
 * Doors are fitted one by one, to their own doorway (door-frame-fit.ts).
 * @template {import('./kit-wall-ends.ts').DfMesh} M
 * @param {number} modelId
 * @param {M} mesh
 * @returns {M}
 */
export function interiorModelMesh(modelId, mesh) {
  closing ??= interiorSeamsOn(getPref(INTERIOR_SEAMS_PREF));
  return closing ? extendKitWallEnds(modelId, mesh) : mesh;
}

/** Forgets the row's reading, so the next model built reads it again (tests). */
export function _resetInteriorModelPatches() {
  closing = null;
}
