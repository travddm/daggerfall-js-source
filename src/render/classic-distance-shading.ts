// Classic distance shading: up to two fades over the drawn world, before the present.
//
// To fog colour (the row). The original game darkened and fogged by distance through 64-step palette remap tables:
// the far a surface, the further its colours were moved toward the table's fade colour. This fade gives the same 64
// steps to the full-colour image, toward the scene's own fog colour, so a mod's coloured fog (Better Ambience gives
// dungeons a brown one) tints the far view. Departures from the original game, recorded here and in the row's note:
//   - The step is picked per pixel from the depth buffer. The original game picked one row per flat, or per surface
//     from its centre point.
//   - The colour moves by a linear blend, not through the palette tables, which would need a palettized picture.
//   - The fade colour is the scene's fog colour: an agreed design, so a coloured fog stays coloured.
//
// Color Boost's dungeon falloff (Daggerfall Unity's Effects/ColorBoostDungeonFalloff, read by
// systems/distance-shading-setting.ts). DFU's own arithmetic (ColorBoost.shader): in dungeons only, each pixel moves
// toward black by min(eye depth / 90 m, 1) x falloff, smoothly, not in steps. It takes the place of a "to black" row:
// a DFU settings file means the same here.
//
// The pass costs nothing while both are off: the renderer builds it on the first shaded frame, so no program, buffer
// or framebuffer of it exists before. It is a leaf: it is handed the renderer's program builder and imports nothing of
// it. The vertex stage is the retro pass's full-screen one.
import SHADE_VERTEX from './retro-pass.vert?raw';
import SHADE_FRAGMENT from './classic-distance-shading.frag?raw';

export const SHADE_VS: string = SHADE_VERTEX;
export const SHADE_FS: string = SHADE_FRAGMENT;

/** The original game's remap tables have 64 rows. */
export const CLASSIC_SHADE_STEPS = 64;

/** Under a black fog (a dungeon under DFU's own fog, or a building): the distance in metres at which the last step is
 *  reached. In the original game dungeons fall to dark after about that distance (Daggerfall Unity 0.13 Rendering
 *  Update, parts 2 and 3); the range is not measured on the original game yet. */
export const CLASSIC_DARK_RANGE_M = 30;

/** DFU's Color Boost reaches its full dungeon falloff at this eye depth, in metres (ColorBoost.shader). */
export const DUNGEON_FALLOFF_DEPTH_M = 90;

/** An exponential fog leaves 5% of the colour at 3 / density. */
const EXP_FOG_FULL = 3;

/** A building's fog: DFU's interior fog, exponential 0.001 and black (scenes/interior.js). A dungeon's never is. */
const INTERIOR_FOG_DENSITY = 0.001;

/** What the setting source asks for this frame (systems/distance-shading-setting.ts); null while both are off. */
export type ShadeChoice = {
  /** The row's To fog colour. */
  readonly fogColour: boolean;
  /** ColorBoostDungeonFalloff, 0 to 8; 0 is off. */
  readonly falloff: number;
};

/** The fog the renderer was given for the frame, as setFog stores it. */
export type SceneFog = {
  /** 0 off, 1 linear, 2 exp, 3 exp2 (Renderer.setFog). */
  readonly mode: number;
  readonly density: number;
  /** Linear fog's end distance, in metres. */
  readonly end: number;
  readonly color: ArrayLike<number>;
};

const isBlack = (color: ArrayLike<number>): boolean => color[0] === 0 && color[1] === 0 && color[2] === 0;

/** How many steps a surface at `distance` metres is moved toward the fade colour: 0 (untouched, near the player) to
 *  63 (all the way). The original game's row 63 is its untouched row and row 0 its full fade; this counts the other way. */
export function shadeStep(distance: number, range: number): number {
  if (!(distance > 0) || !(range > 0)) return 0;
  return Math.min(CLASSIC_SHADE_STEPS - 1, Math.floor((distance / range) * CLASSIC_SHADE_STEPS));
}

/** The share of the fade colour at a step, 0 to 1. */
export function shadeAmount(step: number): number {
  return step / (CLASSIC_SHADE_STEPS - 1);
}

/** The distance at which the last step is reached for a scene's fog, or null when the scene has no fog to fade to. */
export function shadeRange(fog: SceneFog): number | null {
  if (fog.mode === 0) return null;
  if (isBlack(fog.color)) return CLASSIC_DARK_RANGE_M;
  if (fog.mode === 1) return fog.end > 0 ? fog.end : null;
  return fog.density > 0 ? EXP_FOG_FULL / fog.density : null;
}

/** The last step's colour and distance for the fog-colour fade, or null when the scene has no fog to fade to. */
export type ShadeFade = { readonly range: number; readonly color: ArrayLike<number> };

export function shadeFade(fog: SceneFog): ShadeFade | null {
  const range = shadeRange(fog);
  return range === null ? null : { range, color: fog.color };
}

/** Whether a frame is a dungeon's or a building's, by its clear colour: those clear to opaque black (INTERIOR_CLEAR,
 *  as DFU's CameraClearManager), the exterior to the sky, and the real windows' view out to transparent black. */
export function clearsIndoors(clear: ArrayLike<number>): boolean {
  return clear[0] === 0 && clear[1] === 0 && clear[2] === 0 && clear[3] === 1;
}

/** Whether a frame is a dungeon's: indoors, and not under a building's fog. The world host alone knows the mode, so the
 *  pass reads it from the clear colour and the fog it was already given. */
export function inDungeon(clear: ArrayLike<number>, fog: SceneFog): boolean {
  const buildingFog = fog.mode === 2 && fog.density === INTERIOR_FOG_DENSITY && isBlack(fog.color);
  return clearsIndoors(clear) && !buildingFog;
}

/** DFU's falloff at an eye depth: the share of the way to black, 0 to 1. */
export function dungeonFalloffAmount(depth: number, falloff: number): number {
  if (!(depth > 0) || !(falloff > 0)) return 0;
  return Math.min(1, 0.999 * Math.min(1, depth / DUNGEON_FALLOFF_DEPTH_M) * falloff);
}

type ProgramBuilder = (vs: string, fs: string) => WebGLProgram;

type ShadeProgram = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uSize: WebGLUniformLocation | null;
  uProj: WebGLUniformLocation | null;
  uMode: WebGLUniformLocation | null;
  uRange: WebGLUniformLocation | null;
  uFade: WebGLUniformLocation | null;
  uFalloff: WebGLUniformLocation | null;
};

/** One shaded frame: the image to shade in place and the frame's depth, both `width` x `height`. */
export type ShadeFrame = {
  readonly color: WebGLTexture;
  readonly depth: WebGLTexture;
  readonly width: number;
  readonly height: number;
  /** The world's projection (column-major, as mat4.js perspective builds it). */
  readonly proj: ArrayLike<number>;
  readonly fog: SceneFog;
  /** The frame's clear colour (Renderer.setClearColor), which tells an indoor frame from the outdoors. */
  readonly clear: ArrayLike<number>;
  readonly target: ShadeChoice;
};

/** The two fades a frame gets, in order; empty when neither applies. */
export function shadeDraws(
  frame: Pick<ShadeFrame, 'fog' | 'clear' | 'target'>,
): Array<{ mode: 0; fade: ShadeFade } | { mode: 1; falloff: number }> {
  const draws: Array<{ mode: 0; fade: ShadeFade } | { mode: 1; falloff: number }> = [];
  const fade = frame.target.fogColour ? shadeFade(frame.fog) : null;
  if (fade) draws.push({ mode: 0, fade });
  if (frame.target.falloff > 0 && inDungeon(frame.clear, frame.fog))
    draws.push({ mode: 1, falloff: frame.target.falloff });
  return draws;
}

export class DistanceShadePass {
  private readonly gl: WebGL2RenderingContext;
  private readonly build: ProgramBuilder;
  private shade: ShadeProgram | null = null;
  private failed = false;
  /** A framebuffer over the image's colour alone: the depth is read, so it may not be attached. */
  private target: { fbo: WebGLFramebuffer; color: WebGLTexture } | null = null;

  constructor(gl: WebGL2RenderingContext, options: { build: ProgramBuilder }) {
    this.gl = gl;
    this.build = options.build;
  }

  private program(): ShadeProgram | null {
    if (this.shade || this.failed) return this.shade;
    const gl = this.gl;
    try {
      const program = this.build(SHADE_VS, SHADE_FS);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, 'uDepth'), 1);
      this.shade = {
        program,
        vao,
        uSize: gl.getUniformLocation(program, 'uSize'),
        uProj: gl.getUniformLocation(program, 'uProj'),
        uMode: gl.getUniformLocation(program, 'uMode'),
        uRange: gl.getUniformLocation(program, 'uRange'),
        uFade: gl.getUniformLocation(program, 'uFade'),
        uFalloff: gl.getUniformLocation(program, 'uFalloff'),
      };
    } catch (error) {
      this.failed = true;
      console.warn('[shade] the distance shading program would not build - drawing without it:', error);
    }
    return this.shade;
  }

  private framebufferFor(color: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    if (this.target?.color === color) return this.target.fbo;
    if (this.target) gl.deleteFramebuffer(this.target.fbo);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    this.target = { fbo, color };
    return fbo;
  }

  /** Shades the image in place. Leaves the image's framebuffer bound, the depth unbound from unit 1 with TEXTURE0
   *  active, and the draw-state baseline (depth test, depth writes and culling on, blending off); the present that
   *  follows binds its own. Returns false when no fade applies to the frame or the program would not build. */
  draw(frame: ShadeFrame): boolean {
    const draws = shadeDraws(frame);
    if (draws.length === 0 || !(frame.width > 0) || !(frame.height > 0)) return false;
    const shade = this.program();
    if (!shade) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferFor(frame.color));
    gl.viewport(0, 0, frame.width, frame.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    // The image's alpha is kept: the present may carry it to the canvas.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.useProgram(shade.program);
    gl.bindVertexArray(shade.vao);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, frame.depth);
    const proj = frame.proj;
    gl.uniform2f(shade.uSize, frame.width, frame.height);
    gl.uniform4f(shade.uProj, Math.abs(proj[0]), proj[5], proj[10], proj[14]);
    for (const draw of draws) {
      gl.uniform1i(shade.uMode, draw.mode);
      if (draw.mode === 0) {
        gl.uniform1f(shade.uRange, draw.fade.range);
        gl.uniform3f(shade.uFade, draw.fade.color[0], draw.fade.color[1], draw.fade.color[2]);
      } else {
        gl.uniform1f(shade.uFalloff, draw.falloff);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    return true;
  }

  /** Frees the framebuffer it holds over the image (the image itself is the retro pass's). */
  dropTarget(): void {
    if (this.target) this.gl.deleteFramebuffer(this.target.fbo);
    this.target = null;
  }
}
