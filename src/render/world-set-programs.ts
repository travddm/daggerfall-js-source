// The world set's programs: the five sources a set is built from (render/renderer.js _buildWorldSet), so the
// renderer can start them together and the boot can start a set before its host asks for it
// (render/boot-programs.ts), and the character shader's skinned face normal those sources include.
import { setFragment } from './sharp-world-sets.ts';

/** A world set's fragment sources: the classic set's, or a lighting lane's (EL_LANE). */
export type WorldSetSource = {
  readonly sharp?: boolean;
  readonly meshFs: string;
  readonly charFs: string;
  readonly bbVs?: unknown;
  readonly bbFs: string;
  readonly terrainFs: string;
  readonly decalFs?: string;
};

/** The renderer's own vertex shaders and its classic decal shader (render/renderer.js WORLD_SET_SHADERS). */
export type WorldSetShaders = {
  readonly mesh: string;
  readonly charSkin: string;
  readonly billboard: (extension?: unknown) => string;
  readonly terrain: string;
  readonly decal: string;
  readonly decalFs: string;
};

/** The five programs of a world set, [vertex, fragment] each, as _buildWorldSet builds them: mesh, character,
 *  billboard, terrain and decal. */
export function worldSetPrograms(src: WorldSetSource, shaders: WorldSetShaders): Array<[string, string]> {
  const fs = (source: string): string => setFragment(src, source);
  return [
    [shaders.mesh, fs(src.meshFs)],
    [shaders.charSkin, skinFaceFs(fs(src.charFs))],
    [shaders.billboard(src.bbVs), fs(src.bbFs)],
    [shaders.terrain, fs(src.terrainFs)],
    [shaders.decal, fs(src.decalFs ?? shaders.decalFs)],
  ];
}

/**
 * MWNPC1: A LANE'S CHARACTER FRAGMENT SHADER, TAUGHT THE SKINNED BODY'S FACE NORMAL. packFpArm writes each
 * triangle's normal as the cross product of its POSED corners (times the mirror's flip), and the vertex shader
 * cannot know a triangle's other corners. The fragment can: vRel is linear across its triangle, so
 * cross(dFdx(vRel), dFdy(vRel)) is that triangle's plane normal exactly - its SIGN set by the triangle's winding on
 * the screen, which gl_FrontFacing reports against the renderer's front face (CW - the projection mirrors x). For a
 * corner winding a, b, c counter-clockwise on the screen, cross(b - a, c - a) = 2 x area x the derivatives' cross,
 * whatever the lens does, so `ccw ? d : -d` IS the posed corners' cross in the world's axes.
 *
 * The CPU path then drew mat3(uModel) x n_model, and the world cross is cof(M) x n_model = det(M) M^-T n_model - so
 * n_model = M^T n_world / det(M), and the CPU's normal is sign(det M) x M M^T x n_world. `uSkinNrm` is exactly that
 * matrix (drawCharacter, per draw) and `uSkinFlip` the range's mirror (rigid left-side parts, packFpArm's `flip`):
 * with them the skinned body is lit as the packed one was, a race's unequal weight and height included.
 *
 * The edit is to the SOURCE, once per lane set: the vNormal input becomes a global the top of main() fills -
 * before any discard, so the derivatives run in uniform control flow - and every line after reads it as it read
 * the input. A lane without exactly one `in vec3 vNormal;` and one `void main() {` throws: a silent no-op here is a
 * body lit by a zero normal.
 */
export function skinFaceFs(fs: string): string {
  const decl = 'in vec3 vNormal;';
  const main = 'void main() {';
  const n = (needle: string): number => fs.split(needle).length - 1;
  if (n(decl) !== 1 || n(main) !== 1) {
    throw new Error(
      `MWNPC1: a character fragment shader needs one "${decl}" and one "${main}" (has ${n(decl)} and ${n(main)})`,
    );
  }
  return fs.replace(decl, SKIN_FACE_DECL).replace(main, `${main}\n  vNormal = charFaceNormal();`);
}
const SKIN_FACE_DECL = `in vec3 vNormalV;
in vec3 vRel;
uniform float uSkin;
uniform mat3 uSkinNrm;
uniform float uSkinFlip;
uniform float uFrontCW;
vec3 vNormal;
vec3 charFaceNormal() {
  vec3 d = cross(dFdx(vRel), dFdy(vRel));
  if (uSkin < 0.5) return vNormalV;
  if (dot(vNormalV, vNormalV) > 1e-20) return vNormalV;
  bool ccw = gl_FrontFacing != (uFrontCW > 0.5);
  vec3 nw = ccw ? d : -d;
  if (dot(nw, nw) < 1e-36) return vec3(0.0, 1.0, 0.0);
  return normalize(uSkinFlip * (uSkinNrm * nw));
}`;
