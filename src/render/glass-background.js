// @ts-check
// The interior frame's background when real windows show the outside (render/realWindows.js): the view out and its sky,
// painted before the room on the panes the last watched frame kept, and on nothing else. The room's draw then cuts the
// same glass texels, so the street shows through the glass alone. A slit between two of the room's models is not glass:
// it keeps the interior's black clear, as Daggerfall Unity draws it, where a background over the whole rectangle would
// show the sky or the street through it as a bright line.

import { VIEW_BG_VS, VIEW_BG_FS, GLASS_NONE } from './realWindows.js';

/**
 * A sub-mesh the last watched frame met: its geometry for the view out's pane depth, and what the background reads to
 * paint it - whether it is glass, whether its picture is a cutout, and the picture its cut is read from.
 * @typedef {{ vao: any, start: number, count: number, m: Float32Array, glass: boolean, cut: boolean, texture: any }} Pane
 */

/** A pane slot, filled each watched frame (renderer._rwWatch). @returns {Pane} */
export function newPane() {
  return { vao: null, start: 0, count: 0, m: new Float32Array(16), glass: false, cut: false, texture: null };
}

/**
 * Records on `pane` what the background needs of the sub-mesh: the glass mask on its emission unit when it is glass,
 * else its own picture when it is a cutout.
 * @param {Pane} pane
 * @param {{ _evWin?: number, _evEmis?: any, _evTex?: any }} subMesh the sub-mesh as the renderer's draw resolved it
 * @param {boolean} holes whether its picture is a cutout
 */
export function keepPaneKind(pane, subMesh, holes) {
  pane.glass = (subMesh._evWin ?? GLASS_NONE) !== GLASS_NONE;
  pane.cut = holes && !pane.glass;
  pane.texture = pane.glass ? subMesh._evEmis : subMesh._evTex;
}

/**
 * The background's program and its uniforms, built on the first interior that wants it.
 * @param {any} renderer
 */
export function glassBackgroundProgram(renderer) {
  const program = renderer._buildProgram(VIEW_BG_VS, VIEW_BG_FS);
  const gl = renderer.gl;
  /** @param {string} name */
  const uniform = (name) => gl.getUniformLocation(program, name);
  return {
    p: program,
    rect: uniform('uRect'),
    rectPx: uniform('uRectPx'),
    view: uniform('uView'),
    pane: uniform('uPane'),
    paneGlass: uniform('uPaneGlass'),
    paneCut: uniform('uPaneCut'),
    scale: uniform('uViewScale'),
    has: uniform('uHasView'),
    rayX: uniform('uRayX'),
    rayY: uniform('uRayY'),
    rayZ: uniform('uRayZ'),
    zenith: uniform('uZenith'),
    horizon: uniform('uHorizon'),
    proj: uniform('uProj'),
    camera: uniform('uCamera'),
    model: uniform('uModel'),
  };
}

/**
 * Paints the background on each kept pane, with the program in use and the view out on unit 0: a pane's glass texels
 * while the street is cut through them, and a cutout picture's holes always. Back faces stay culled, as the room's
 * own draw culls them.
 * @param {any} renderer
 * @param {ReturnType<typeof glassBackgroundProgram>} program
 * @param {{ street: boolean, rectPx: ArrayLike<number> }} frame whether the street is in the view out, and the
 *   rectangle in window pixels the mesh shader cuts by
 */
export function paintGlassBackground(renderer, program, { street, rectPx }) {
  renderer._close2D(); // every drawer hands the 2D baseline back itself
  const gl = renderer.gl;
  gl.uniform1i(program.pane, 1);
  gl.uniform4f(program.rectPx, rectPx[0], rectPx[1], rectPx[2], rectPx[3]);
  gl.uniformMatrix4fv(program.proj, false, renderer._proj);
  gl.uniformMatrix4fv(program.camera, false, renderer._view);
  for (let i = 0; i < renderer._rwPaneN; i++) {
    /** @type {Pane} */
    const pane = renderer._rwPanes[i];
    const paintsGlass = street && pane.glass;
    if (!paintsGlass && !pane.cut) continue;
    if (!pane.texture || !gl.isVertexArray(pane.vao)) continue;
    gl.uniform1f(program.paneGlass, paintsGlass ? 1 : 0);
    gl.uniform1f(program.paneCut, pane.cut ? 1 : 0);
    gl.uniformMatrix4fv(program.model, false, pane.m);
    renderer._bindEmission(pane.texture); // unit 1, through its shadow, so the room's next draw binds its own again
    renderer._bindVao(pane.vao);
    gl.drawElements(gl.TRIANGLES, pane.count, gl.UNSIGNED_INT, pane.start * 4);
    renderer.stats.draws++;
  }
}
