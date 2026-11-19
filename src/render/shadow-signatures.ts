// The static signature's fold, and the lo tier's lamps' signatures (render/shadowPass.js _renderLo), all from one walk
// of the frame's records. A walk per lamp filtered every record and batch again for each lamp. The answers are the
// same: a lamp's place and far depend only on its own slot, which no other lamp's step changes, and the faces drawn
// between two lamps change nothing the walk reads.

/** Are two spheres touching: a record's against a lantern's reach. */
export function spheresTouch(
  ax: number,
  ay: number,
  az: number,
  ar: number,
  bx: number,
  by: number,
  bz: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  const r = ar + br;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/** A 32-bit fold for the static signature. It is order-independent (a sum and a rotate-xor), so the hosts' draw
 *  order, which the culling shuffles, cannot change it. */
export function foldSignature(h: number, v: number): number {
  const x = ((v | 0) * 0x9e3779b1) | 0;
  return (h + ((x << 13) | (x >>> 19))) | 0;
}

/** The walk that folds every caster's signature: `casters` holds (x, y, z, far) per caster, `out` (hash, count). */
export type SignatureWalk = (casters: Float64Array, casterCount: number, out: Int32Array) => void;

export type LoLampsInput = {
  /** The frame's lights: x, y, z and range for each. */
  lights: ArrayLike<number>;
  lightCount: number;
  /** Each light's lo slot, or -1. */
  slotOf: ArrayLike<number>;
  /** Whether a light reads its full map this frame: it asks for no lo signature. */
  readsFullMap: (light: number) => boolean;
  /** Each slot's light as its map was drawn: x, y, z and far. */
  slotLight: ArrayLike<number>;
  slotBuilt: ArrayLike<number>;
  walk: SignatureWalk;
};

export class LoLampSignatures {
  private readonly casters: Float64Array;
  private readonly signatures: Int32Array;
  private readonly indexOfLight: Int32Array;
  private readonly heldFar: (held: number, range: number) => number;
  private readonly farFor: (range: number) => number;

  /** `heldFar` and `farFor` are shadowPass.js's heldShadowFar and shadowFarFor, the far the lamp's map is drawn with. */
  constructor(capacity: number, heldFar: (held: number, range: number) => number, farFor: (range: number) => number) {
    this.casters = new Float64Array(4 * capacity);
    this.signatures = new Int32Array(2 * capacity);
    this.indexOfLight = new Int32Array(capacity);
    this.heldFar = heldFar;
    this.farFor = farFor;
  }

  /** Every lamp with a lo slot that does not read its full map: its place and far, then one walk for all of them. */
  gather(input: LoLampsInput): void {
    const { lights, slotLight } = input;
    let asked = 0;
    for (let light = 0; light < input.lightCount; light++) {
      this.indexOfLight[light] = -1;
      const slot = input.slotOf[light];
      if (slot < 0 || input.readsFullMap(light)) continue;
      const o = slot * 4;
      const x = lights[light * 4];
      const y = lights[light * 4 + 1];
      const z = lights[light * 4 + 2];
      const range = lights[light * 4 + 3];
      // The same test and far as _renderLo's: a map drawn at this place keeps its far across a flicker of the range.
      const same = input.slotBuilt[slot] && slotLight[o] === x && slotLight[o + 1] === y && slotLight[o + 2] === z;
      this.casters[asked * 4] = x;
      this.casters[asked * 4 + 1] = y;
      this.casters[asked * 4 + 2] = z;
      this.casters[asked * 4 + 3] = same ? this.heldFar(slotLight[o + 3], range) : this.farFor(range);
      this.indexOfLight[light] = asked;
      asked++;
    }
    if (asked > 0) input.walk(this.casters, asked, this.signatures);
  }

  /** A gathered light's signature hash. */
  hash(light: number): number {
    return this.signatures[this.indexOfLight[light] * 2];
  }

  /** A gathered light's signature count. */
  count(light: number): number {
    return this.signatures[this.indexOfLight[light] * 2 + 1];
  }
}
