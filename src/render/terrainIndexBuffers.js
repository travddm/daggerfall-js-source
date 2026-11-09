// @ts-check
// The terrain's index buffers (render/renderer.js createTerrainSurface). With the slope cut off, every streamed pixel of a
// stride draws one shared index set (world/terrain/terrainSurface.js sharedTerrainIndices), so its buffer is uploaded
// once and kept. With it on, a pixel draws its own cut (terrain-quad-cut.ts) in a buffer the surface owns.
import { sharedTerrainIndices } from '../world/terrain/terrainSurface.js';

/** EV4: one shared index buffer PER INDEX SET, keyed by the array's identity - the shared full-grid set and the strided
 *  far-ring set, and the town's and tools' own. A single-buffer cache once drew every later surface with the FIRST set
 *  ever uploaded, invisibly correct only while exactly one set existed. Per renderer: renderer -> (indices -> entry). */
const setsByRenderer = new WeakMap();

/**
 * The shared buffer of an index set, uploaded on first use.
 * @param {any} renderer the Renderer: its `gl` and `_bindVao`
 * @param {Uint32Array|Uint16Array} indices
 * @returns {{ buffer: WebGLBuffer, count: number }}
 */
export function sharedIndexBuffer(renderer, indices) {
  let sets = setsByRenderer.get(renderer);
  if (!sets) {
    sets = new Map();
    setsByRenderer.set(renderer, sets);
  }
  let entry = sets.get(indices);
  if (entry) return entry;
  const gl = renderer.gl;
  // EV6: this element bind happens OUTSIDE any VAO of its own, and a drawn VAO may still be bound (drawMesh no longer
  // unbinds) - an unguarded bind here would capture this buffer into that VAO.
  renderer._bindVao(null);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  entry = { buffer, count: indices.length };
  sets.set(indices, entry);
  return entry;
}

/**
 * A surface's own index buffer, uploaded into the vertex array bound now (createTerrainSurface's), so it rides that
 * array and is freed with the surface.
 * @param {WebGL2RenderingContext} gl
 * @param {Uint32Array} indices
 * @returns {WebGLBuffer}
 */
export function ownIndexBuffer(gl, indices) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return buffer;
}

/**
 * A streamed pixel's terrain surface: its own index set when the slope cut gave it one, else the fixed cut's shared
 * set at its stride.
 * @param {any} renderer
 * @param {Float32Array} positions
 * @param {Float32Array} normals
 * @param {?Uint32Array} ownIndices the pixel's own set (the slope cut on), or null
 * @param {number} stride
 */
export function createPixelTerrainSurface(renderer, positions, normals, ownIndices, stride) {
  return ownIndices
    ? renderer.createTerrainSurface(positions, normals, ownIndices, { own: true })
    : renderer.createTerrainSurface(positions, normals, sharedTerrainIndices(stride));
}
