// What a NIF shape looks like once its properties are applied: the surface colours, the base texture, the blend and
// the depth state, and whether a face is drawn from both sides. Nothing here touches GL or reads a file.
//
// The rules are written from nif.xml (NiMaterialProperty, NiTexturingProperty, NiAlphaProperty, NiZBufferProperty,
// NiVertexColorProperty, NiStencilProperty) and from fixed-function lighting: a surface is lit by an ambient, a
// diffuse and an emissive colour, and a per-vertex colour may stand in for one or two of them. The recorded answers of
// the earlier code (test/formats/morrowind/nif-material.test.ts) pin every choice the format leaves open.
//
// mwNifMesh.js walks the scene and calls resolveMaterial for each shape with the properties on the way down.

/** The ways a vertex-colour array can feed a surface. The numbers are this renderer's own labels. */
export const VERTEX_COLOR_MODE = Object.freeze({
  None: 0,
  Emission: 1,
  AmbientAndDiffuse: 2,
  Ambient: 3,
  Diffuse: 4,
  Specular: 5,
});

/** NiVertexColorProperty's vertex mode: which lighting term the vertex colours replace. */
export const VERT_MODE = Object.freeze({ SrcIgnore: 0, SrcEmissive: 1, SrcAmbDif: 2 });
/** NiVertexColorProperty's lighting mode: emissive only, or emissive plus ambient and diffuse. */
export const LIGHT_MODE = Object.freeze({ Emissive: 0, EmiAmbDif: 1 });
/** NiStencilProperty's draw mode: which faces are drawn. */
export const DRAW_MODE = Object.freeze({ Default: 0, CounterClockwise: 1, Clockwise: 2, Both: 3 });

/** The slot of NiTexturingProperty that holds the base texture (nif.xml: Base Texture is the first slot). */
const BASE_TEXTURE_SLOT = 0;

/** NiAlphaProperty's flags (nif.xml): bit 0 blends, bits 1 to 4 and 5 to 8 pick the two blend factors, bit 9 tests. */
const ALPHA_BLEND_BIT = 0x0001;
const ALPHA_TEST_BIT = 0x0200;
const BLEND_FACTOR_MASK = 0xf;
const SOURCE_FACTOR_SHIFT = 1;
const DESTINATION_FACTOR_SHIFT = 5;
/** nif.xml's AlphaFunction values for source alpha and one minus source alpha: the pair a surface blends with. */
const SOURCE_ALPHA = 6;
const ONE_MINUS_SOURCE_ALPHA = 7;

/** NiZBufferProperty's flags: bit 0 tests against the depth buffer, bit 1 writes to it. */
const DEPTH_TEST_BIT = 0x1;
const DEPTH_WRITE_BIT = 0x2;

/** The texture wrap value a surface has when its file names none (nif.xml's default: wrap in both directions). */
const WRAP_BOTH = 3;

/** A property record as the NIF reader parses it: the type name decides which fields it carries. */
export interface PropertyRecord {
  type: string;
}

interface MaterialFields {
  name: string | null;
  diffuse: number[];
  ambient: number[];
  emissive: number[];
  alpha: number;
}

interface TextureSlot {
  source: number;
  clampMode: number;
}

interface TexturingFields {
  textures: (TextureSlot | null | undefined)[];
}

interface AlphaFields {
  flags: number;
  threshold: number;
}

interface DepthFields {
  flags: number;
}

interface VertexColourFields {
  vertexMode: number;
  lightingMode: number;
}

interface StencilFields {
  drawMode: number;
}

/** A texture source record: a file named outside the NIF, or picture data inside it. */
export interface TextureSource {
  external?: boolean;
  fileName?: string;
}

/** What the scene walk reads out of a parsed file: the record a reference points at, or null for no reference. */
export type SourceReader<Nif> = (nif: Nif, ref: number) => TextureSource | null;

export interface ResolvedMaterial {
  name: string | null;
  diffuse: number[];
  ambient: number[];
  emissive: number[];
  glossiness: number;
  alpha: number;
  textureFile: string | null;
  clampMode: number;
  alphaBlend: boolean;
  alphaTest: boolean;
  alphaThreshold: number;
  srcBlend: number;
  dstBlend: number;
  depthTest: boolean;
  depthWrite: boolean;
  vertexColorMode: number;
  twoSided: boolean;
  clockwise: boolean;
}

/** A surface before any property is applied. White ambient and diffuse are the format's colours, not GL's defaults. */
function defaultMaterial(hasVertexColors: boolean): ResolvedMaterial {
  return {
    name: null,
    diffuse: [1, 1, 1],
    ambient: [1, 1, 1],
    emissive: [0, 0, 0],
    // Morrowind's renderer ignores the specular colour and the glossiness that the files carry, so neither is kept.
    glossiness: 0,
    alpha: 1,
    textureFile: null,
    clampMode: WRAP_BOTH,
    // Blending is off until a property turns it on; the factors are the ordinary source-alpha pair for when it does.
    alphaBlend: false,
    alphaTest: false,
    alphaThreshold: 0,
    srcBlend: SOURCE_ALPHA,
    dstBlend: ONE_MINUS_SOURCE_ALPHA,
    depthTest: true,
    depthWrite: true,
    // A mesh that carries vertex colours shows them, as ambient and diffuse, unless a property says otherwise.
    vertexColorMode: hasVertexColors ? VERTEX_COLOR_MODE.AmbientAndDiffuse : VERTEX_COLOR_MODE.None,
    // Only the Both draw mode draws the back of a face; the default draws the front with the back culled.
    twoSided: false,
    clockwise: false,
  };
}

function applyMaterial(out: ResolvedMaterial, record: MaterialFields): void {
  out.name = record.name || null;
  out.diffuse = record.diffuse.slice();
  out.ambient = record.ambient.slice();
  out.emissive = record.emissive.slice();
  // The material's alpha is the surface's alpha; the colours carry none of their own.
  out.alpha = record.alpha;
}

function applyTexturing<Nif>(
  out: ResolvedMaterial,
  record: TexturingFields,
  nif: Nif,
  readSource: SourceReader<Nif>,
): void {
  const base = record.textures[BASE_TEXTURE_SLOT];
  if (!base) return;
  const source = readSource(nif, base.source);
  // A texture built into the file has no name to load it by, so such a base texture leaves the surface plain.
  if (source && source.external && source.fileName) {
    out.textureFile = source.fileName;
    out.clampMode = base.clampMode;
  }
}

function applyAlpha(out: ResolvedMaterial, record: AlphaFields): void {
  // Blending and testing are separate switches, so a nearer property that turns blending off also removes the blend
  // an ancestor's property had turned on.
  out.alphaBlend = (record.flags & ALPHA_BLEND_BIT) !== 0;
  out.alphaTest = (record.flags & ALPHA_TEST_BIT) !== 0;
  out.alphaThreshold = record.threshold;
  // The factors stay as the file's AlphaFunction indices: the renderer maps them to its own blend names.
  out.srcBlend = (record.flags >> SOURCE_FACTOR_SHIFT) & BLEND_FACTOR_MASK;
  out.dstBlend = (record.flags >> DESTINATION_FACTOR_SHIFT) & BLEND_FACTOR_MASK;
}

function applyDepth(out: ResolvedMaterial, record: DepthFields): void {
  out.depthTest = (record.flags & DEPTH_TEST_BIT) !== 0;
  out.depthWrite = (record.flags & DEPTH_WRITE_BIT) !== 0;
}

function applyStencil(out: ResolvedMaterial, record: StencilFields): void {
  // The draw mode counts even when the property's stencil test is switched off.
  out.clockwise = record.drawMode === DRAW_MODE.Clockwise;
  out.twoSided = record.drawMode === DRAW_MODE.Both;
}

/**
 * Applies a vertex-colour property and returns the lighting mode now in force. Only a property that takes ambient and
 * diffuse from the vertices sets a lighting mode; the other two vertex modes leave the earlier one alone.
 */
function applyVertexColour(out: ResolvedMaterial, record: VertexColourFields, lightingMode: number): number {
  if (record.vertexMode === VERT_MODE.SrcIgnore) {
    out.vertexColorMode = VERTEX_COLOR_MODE.None;
  } else if (record.vertexMode === VERT_MODE.SrcEmissive) {
    out.vertexColorMode = VERTEX_COLOR_MODE.Emission;
  } else if (record.vertexMode === VERT_MODE.SrcAmbDif) {
    out.vertexColorMode =
      record.lightingMode === LIGHT_MODE.Emissive ? VERTEX_COLOR_MODE.None : VERTEX_COLOR_MODE.AmbientAndDiffuse;
    return record.lightingMode;
  }
  return lightingMode;
}

/**
 * The surface a shape has, from the properties on the way down to it.
 *
 * The properties are an ordered list, the root's first and the shape's own last, and a nearer property of a type wins
 * over an ancestor's. A map keyed by type would lose one rule: the lighting mode outlives the property that set it, so
 * an ancestor that lights by emission only still blacks the surface out after a nearer property picks another vertex
 * mode.
 *
 * `hasVertexColors` says whether the shape carries a colour array. It sets the default colour mode, and it undoes the
 * mode again at the end when the array is not there.
 */
export function resolveMaterial<Nif>(
  nif: Nif,
  props: readonly PropertyRecord[],
  hasVertexColors: boolean,
  readSource: SourceReader<Nif>,
): ResolvedMaterial {
  const out = defaultMaterial(hasVertexColors);
  let lightingMode: number = LIGHT_MODE.EmiAmbDif;
  for (const prop of props) {
    switch (prop.type) {
      case 'NiMaterialProperty':
        applyMaterial(out, prop as PropertyRecord & MaterialFields);
        break;
      case 'NiTexturingProperty':
        applyTexturing(out, prop as PropertyRecord & TexturingFields, nif, readSource);
        break;
      case 'NiAlphaProperty':
        applyAlpha(out, prop as PropertyRecord & AlphaFields);
        break;
      case 'NiZBufferProperty':
        applyDepth(out, prop as PropertyRecord & DepthFields);
        break;
      case 'NiVertexColorProperty':
        lightingMode = applyVertexColour(out, prop as PropertyRecord & VertexColourFields, lightingMode);
        break;
      case 'NiStencilProperty':
        applyStencil(out, prop as PropertyRecord & StencilFields);
        break;
      default:
        break;
    }
  }
  if (lightingMode === LIGHT_MODE.Emissive) {
    // Lit by emission alone: the surface takes no ambient or diffuse light.
    out.diffuse = [0, 0, 0];
    out.ambient = [0, 0, 0];
  }
  if (!hasVertexColors) {
    // A mode that asks for vertex colours on a mesh that has none draws the plain colour instead: the channel the mode
    // names turns white, never black, and the mode goes.
    if (out.vertexColorMode === VERTEX_COLOR_MODE.AmbientAndDiffuse) {
      out.diffuse = [1, 1, 1];
      out.ambient = [1, 1, 1];
    } else if (out.vertexColorMode === VERTEX_COLOR_MODE.Emission) {
      out.emissive = [1, 1, 1];
    }
    out.vertexColorMode = VERTEX_COLOR_MODE.None;
  }
  return out;
}

/** The colour array and material fields the two per-vertex rules read. */
interface VertexSurface {
  vertexColorMode?: number;
  diffuse?: number[];
  emissive?: number[];
}

/**
 * The diffuse colour of one vertex. A vertex colour replaces the material's diffuse colour where the mode names it; it
 * does not multiply it, so multiplying would tint every surface twice.
 */
export function diffuseAt(
  material: VertexSurface | null | undefined,
  colors: ArrayLike<number> | null | undefined,
  index: number,
): number[] {
  const mode = material ? material.vertexColorMode : VERTEX_COLOR_MODE.None;
  if (colors && (mode === VERTEX_COLOR_MODE.AmbientAndDiffuse || mode === VERTEX_COLOR_MODE.Diffuse)) {
    return [colors[index * 4], colors[index * 4 + 1], colors[index * 4 + 2]];
  }
  return material ? (material.diffuse as number[]) : [1, 1, 1];
}

/**
 * The emissive colour of one vertex: the vertex colour where the mode makes it the emission, the material's own
 * emissive colour otherwise. A material with none reads as no emission, because a missing glow must not stop a draw.
 */
export function emissiveAt(
  material: VertexSurface | null | undefined,
  colors: ArrayLike<number> | null | undefined,
  index: number,
): number[] {
  const mode = material ? material.vertexColorMode : VERTEX_COLOR_MODE.None;
  if (colors && mode === VERTEX_COLOR_MODE.Emission) {
    return [colors[index * 4], colors[index * 4 + 1], colors[index * 4 + 2]];
  }
  return material?.emissive ?? [0, 0, 0];
}

const startsWithIgnoringCase = (name: unknown, prefix: string): boolean =>
  String(name || '')
    .toLowerCase()
    .startsWith(prefix);

/**
 * Whether a shape is left out by its name. Shapes named for a shadow ("shadow...", "tri shadow...") are the game's
 * shadow-casting stand-ins and never show, whatever the file says; drawing them puts a black slab under the model.
 * Editor markers ("tri editormarker...") are skipped only when the file's root carries the marker flag.
 */
export function skipGeometryName(name: unknown, hasMarkers: boolean): boolean {
  if (hasMarkers && startsWithIgnoringCase(name, 'tri editormarker')) return true;
  return startsWithIgnoringCase(name, 'shadow') || startsWithIgnoringCase(name, 'tri shadow');
}
