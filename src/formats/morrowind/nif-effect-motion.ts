// The small motion rules of an effect mesh: which way a billboard node turns to the camera, how a UV controller moves
// the texture coordinates, which picture of a flipbook is showing, and whether a visibility controller shows the node.
// Nothing here touches GL or reads a file.
//
// The rules come from nif.xml (NiBillboardNode's billboard modes, NiUVData's four key groups, NiFlipController's
// delta and source list, NiVisData's boolean keys) and from the usual camera-facing constructions of real-time
// graphics: a cylindrical billboard turns about its vertical axis only, a screen-aligned billboard lays its axes on the
// camera's. The recorded answers of the earlier code (test/formats/morrowind/nif-effect-motion.test.ts) pin every
// choice the format leaves open.
//
// mwVfx.js reads a file into nodes and shapes and calls these rules on every frame.

/** NiBillboardNode's modes, read off a node's flags as `(flags >> 5) & 3` in a 4.0.0.2 file. */
export const BILLBOARD_MODE = Object.freeze({
  AlwaysFaceCamera: 0,
  RotateAboutUp: 1,
  RigidFaceCamera: 2,
  AlwaysFaceCenter: 3,
});

type Vector = readonly [number, number, number];
/** Three numbers in any array. */
type Triple = ArrayLike<number>;
/** Nine numbers, row-major, acting on column vectors. */
type Matrix = ArrayLike<number>;

/** A horizontal distance (in the node's own units) below which a node counts as being on the camera's vertical line. */
const SIDEWAYS_EPSILON = 1e-12;
/** The size of the vertical axis' share in the screen plane below which the camera counts as looking along it. */
const VERTICAL_SHARE_EPSILON = 1e-6;

const cross = (a: Triple, b: Triple): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** The vector scaled to length one; a vector of length zero stays zero. */
function unit(vector: Triple): Vector {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length > 0 ? [vector[0] / length, vector[1] / length, vector[2] / length] : [0, 0, 0];
}

/** The transpose of the matrix applied to the vector: for a rotation, the vector in the rotated frame. */
function intoFrame(matrix: Matrix, vector: Triple): Vector {
  return [
    matrix[0] * vector[0] + matrix[3] * vector[1] + matrix[6] * vector[2],
    matrix[1] * vector[0] + matrix[4] * vector[1] + matrix[7] * vector[2],
    matrix[2] * vector[0] + matrix[5] * vector[1] + matrix[8] * vector[2],
  ];
}

/** The matrix whose columns are the three vectors. */
const withColumns = (x: Vector, y: Vector, z: Vector): Float32Array =>
  Float32Array.from([x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);

/** The product `first * second` of two row-major 3x3 matrices. */
function product(first: Matrix, second: Matrix): Float32Array {
  const out = new Float32Array(9);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      out[row * 3 + column] =
        first[row * 3] * second[column] +
        first[row * 3 + 1] * second[3 + column] +
        first[row * 3 + 2] * second[6 + column];
    }
  }
  return out;
}

/** A cylindrical billboard: a turn about the node's own up axis (Y) that brings its +Z axis to face the eye. */
function turnAboutUp(toEye: Vector): Float32Array | null {
  const [x, , z] = toEye;
  const sideways = Math.hypot(x, z);
  if (!(sideways > SIDEWAYS_EPSILON)) return null;
  const sin = x / sideways;
  const cos = z / sideways;
  return withColumns([cos, 0, -sin], [0, 1, 0], [sin, 0, cos]);
}

/**
 * A screen-aligned billboard: the node faces back along the view direction, and its up axis is the node's own Y axis
 * as far as the screen plane shows it, so the picture never rolls. Looking straight along Y leaves no such direction,
 * and the node keeps its authored rotation.
 */
function faceCamera(forward: Vector): Float32Array | null {
  const vertical = Math.hypot(forward[0], forward[2]);
  if (!(vertical > VERTICAL_SHARE_EPSILON)) return null;
  // Y is (0, 1, 0) with its share along the view direction removed, scaled to length one.
  const up: Vector = [(-forward[1] * forward[0]) / vertical, vertical, (-forward[1] * forward[2]) / vertical];
  const back: Vector = [-forward[0], -forward[1], -forward[2]];
  return withColumns(cross(up, back), up, back);
}

/**
 * The rotation a billboard node takes this frame, as the 3x3 its local transform uses. `base` is the node's own
 * rotation (the keyed one where it has keys); `eye`, `look` and `up` are the camera's position and axes in the node's
 * parent space; `translation` is the node's own. A frame the construction cannot use leaves the file's rotation alone.
 *
 * Every mode but "rotate about up" lays the node on the camera's frame; "always face camera" then removes the roll.
 * The two "face center" modes have no meaning for a node that has no centre of its own, so they take the rigid frame.
 */
export function billboardRotation(
  mode: number,
  base: Matrix,
  translation: Triple,
  eye: Triple,
  look: Triple,
  up: Triple,
): Float32Array {
  let facing: Float32Array | null;
  if (mode === BILLBOARD_MODE.RotateAboutUp) {
    const toEye = intoFrame(base, [eye[0] - translation[0], eye[1] - translation[1], eye[2] - translation[2]]);
    facing = turnAboutUp(toEye);
  } else {
    const forward = unit(intoFrame(base, look));
    const right = unit(cross(intoFrame(base, up), forward));
    const above = unit(cross(forward, right));
    if (mode === BILLBOARD_MODE.AlwaysFaceCamera) {
      facing = right[0] === 0 && right[1] === 0 && right[2] === 0 ? null : faceCamera(forward);
    } else {
      facing = withColumns(right, above, forward);
    }
  }
  return facing ? product(base, facing) : Float32Array.from(base);
}

/** NiUVData's four key groups at one moment: the offsets, then the scales. */
export interface UvTransform {
  uTrans?: number;
  vTrans?: number;
  uScale?: number;
  vScale?: number;
}

const PICTURE_CENTRE = 0.5;

/**
 * The texture coordinate (u, v) after a UV controller: scaled about the middle of the picture, then moved by the
 * offset. A U offset moves the picture the other way along U, so it is subtracted; a V offset is added.
 */
export function uvAt(u: number, v: number, transform: UvTransform): [number, number] {
  const { uTrans = 0, vTrans = 0, uScale = 1, vScale = 1 } = transform;
  const scaledU = PICTURE_CENTRE + (u - PICTURE_CENTRE) * uScale;
  const scaledV = PICTURE_CENTRE + (v - PICTURE_CENTRE) * vScale;
  return [scaledU - uTrans, scaledV + vTrans];
}

/**
 * The picture of a flipbook that is showing: one slot per `step` seconds, counted from zero and wrapping at the number
 * of pictures. No pictures gives -1. A step of zero holds the first picture. Time before zero wraps the other way.
 */
export function flipIndex(time: number, step: number | undefined, count: number | undefined): number {
  if (count === undefined || !(count > 0)) return -1;
  if (!step) return 0;
  const slot = Math.trunc(time / step) % count;
  return slot < 0 ? slot + count : slot;
}

/** One key of NiVisData: a time and whether the node shows from that time on. */
export interface VisibilityKey {
  time: number;
  value: unknown;
}

/**
 * Whether a visibility controller shows its node at `time`: the value of the last key at or before it. Before the first
 * key the first key's value holds, and a node with no keys is shown.
 */
export function visAt(keys: readonly VisibilityKey[] | null | undefined, time: number): boolean {
  if (!keys || !keys.length) return true;
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (time < keys[middle].time) high = middle;
    else low = middle + 1;
  }
  return !!keys[Math.max(0, low - 1)].value;
}
