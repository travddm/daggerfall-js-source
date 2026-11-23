// Texture lookup and decoding for Morrowind meshes.
//
// Written from the public file-format documentation (Truevision TGA 2.0, Microsoft BMP/DIB, the DDS reader in
// mwDdsFile.js) and from the observable behaviour of Morrowind data. No third-party engine source was used.
//
// Morrowind's archives hold DDS textures, but the meshes inside them still name the original .tga files, so a
// mesh's texture name is a request that has to be resolved against the archive before it can be read.

import { decodeDds } from './mwDdsFile.js';

/**
 * The archive's own spelling of a path: forward slashes, lower case, repeated slashes collapsed, and at most one
 * leading slash removed. Archive indexes are built this way, and a lookup is an exact match.
 */
export function normalizeVfsPath(path) {
  const flat = String(path).replace(/\\/g, '/').toLowerCase().replace(/\/{2,}/g, '/');
  return flat.startsWith('/') ? flat.slice(1) : flat;
}

/**
 * Character offset of the first path component equal to `directory`, or -1. The component must be whole and must
 * not be the last one, because the last component names a file.
 */
export function findDirectory(path, directory) {
  const parts = path.split('/');
  let offset = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === directory) return offset;
    offset += parts[i].length + 1;
  }
  return -1;
}

/**
 * Replace the extension of the file name (the text after the last '.', if that '.' follows the last '/').
 * A name without an extension is returned as it was, with `changed` false.
 */
export function changeExtension(path, ext) {
  const dot = path.lastIndexOf('.');
  if (dot === -1 || dot < path.lastIndexOf('/')) return { path, changed: false };
  return { path: `${path.slice(0, dot + 1)}${ext}`, changed: true };
}

/**
 * Resolve a resource name found in a mesh or record to the path that the archive most likely holds.
 *
 * The name is normalised, then re-rooted at the first of `topLevelDirectories` that appears in it as a whole
 * inner component (everything before that component is dropped, which turns an absolute authoring path into an
 * archive path). A name with no such component gets the first top-level directory as a prefix. The candidates are
 * tried in this order and the first one `exists` accepts wins:
 *   1. the path with its extension changed to `ext`;
 *   2. the path as written (skipped when it has no extension to change);
 *   3. the file name alone under the first top-level directory, with `ext`;
 *   4. the file name alone under the first top-level directory, as written (skipped likewise).
 * When nothing exists, candidate 1 is returned so the caller fails on a name that says what was wanted.
 */
export function correctResourcePath(topLevelDirectories, resPath, exists, ext) {
  let path = normalizeVfsPath(resPath);

  let rooted = false;
  for (const dir of topLevelDirectories) {
    const at = findDirectory(path, dir);
    if (at !== -1) {
      path = path.slice(at);
      rooted = true;
      break;
    }
  }
  if (!rooted) path = `${topLevelDirectories[0]}/${path}`;

  const swapped = changeExtension(path, ext);
  if (exists(swapped.path)) return swapped.path;
  if (swapped.changed && exists(path)) return path;

  const base = path.slice(path.lastIndexOf('/') + 1);
  const flatOriginal = `${topLevelDirectories[0]}/${base}`;
  const flat = changeExtension(flatOriginal, ext);
  if (exists(flat.path)) return flat.path;
  if (flat.changed && exists(flatOriginal)) return flatOriginal;
  return swapped.path;
}

export const TEXTURE_TOP_LEVEL = Object.freeze(['textures', 'bookart']);
export const TEXTURE_EXT = 'dds';

/** The archive path of a texture a mesh names (a name ending in .tga is usually stored as .dds). */
export function correctTexturePath(resPath, exists) {
  return correctResourcePath(TEXTURE_TOP_LEVEL, resPath, exists, TEXTURE_EXT);
}

export const GL_REPEAT = 0x2901;
export const GL_CLAMP_TO_EDGE = 0x812f;

/**
 * WebGL wrap modes for a texturing property's clamp mode. Bit 1 set repeats S and bit 0 set repeats T; a clear
 * bit clamps that axis.
 */
export function wrapModes(clampMode) {
  return {
    wrapS: clampMode & 2 ? GL_REPEAT : GL_CLAMP_TO_EDGE,
    wrapT: clampMode & 1 ? GL_REPEAT : GL_CLAMP_TO_EDGE,
  };
}

/** The image drawn in place of a texture that cannot be loaded: 8x8 opaque magenta, so a gap is visible. */
export function warningImage() {
  const size = 8;
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;
    rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }
  return { width: size, height: size, mips: [{ width: size, height: size, rgba }] };
}

/**
 * The x-form of an actor model: the file name gets an "x" in front and, for a .nif, the animation file with the
 * same stem must exist as .kf. If it does the x-form is returned, otherwise the normalised original path is.
 */
export function correctActorModelPath(rawPath, exists) {
  const resPath = normalizeVfsPath(rawPath);
  const slash = resPath.lastIndexOf('/');
  const dir = resPath.slice(0, slash + 1);
  const name = resPath.slice(slash + 1);
  const xName = `x${name}`;
  const isNif = name.endsWith('.nif');
  const probe = isNif ? `${dir}${xName.slice(0, -4)}.kf` : `${dir}${xName}`;
  return exists(probe) ? `${dir}${xName}` : resPath;
}

function single(width, height, rgba) {
  return { width, height, mips: [{ width, height, rgba }] };
}

/** A 15- or 16-bit 5-5-5 pixel (the top bit is unused) as [r, g, b]. */
function rgb555(lo, hi) {
  const v = lo | (hi << 8);
  const expand = (c) => Math.floor((c * 255) / 31);
  return [expand((v >> 10) & 31), expand((v >> 5) & 31), expand(v & 31)];
}

/**
 * Truevision TGA, types 1/2/3 (colour-mapped, true colour, grey) and their run-length forms 9/10/11.
 * Returns the single mip level as top-row-first RGBA.
 */
export function decodeTga(bytes) {
  if (bytes.length < 18) throw new Error('decodeTga: truncated header');
  const idLength = bytes[0];
  const mapType = bytes[1];
  const type = bytes[2];
  const mapFirst = bytes[3] | (bytes[4] << 8);
  const mapLength = bytes[5] | (bytes[6] << 8);
  const mapDepth = bytes[7];
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const depth = bytes[16];
  const descriptor = bytes[17];
  const rle = type >= 9;
  const kind = rle ? type - 8 : type;
  if (kind !== 1 && kind !== 2 && kind !== 3) throw new Error(`decodeTga: unsupported image type ${type}`);
  if (width === 0 || height === 0) throw new Error('decodeTga: empty image');

  // A truncated file reads as zero bytes past its end, so a damaged texture still draws instead of failing.
  const byteAt = (i) => bytes[i] | 0;
  const bytesPerPixel = (depth + 7) >> 3;
  const mapBytes = (mapDepth + 7) >> 3;
  let at = 18 + idLength;

  // Writes the colour of the entry or pixel that starts at `o` in the colour-map or pixel layout of `size` bytes.
  const colourAt = (o, size, out, p, isMap) => {
    if (size === 1) {
      out[p] = out[p + 1] = out[p + 2] = byteAt(o);
      out[p + 3] = 255;
    } else if (!isMap && kind === 3) {
      out[p] = out[p + 1] = out[p + 2] = byteAt(o);
      out[p + 3] = byteAt(o + 1);
    } else if (size === 2) {
      const [r, g, b] = rgb555(byteAt(o), byteAt(o + 1));
      out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = 255;
    } else {
      out[p] = byteAt(o + 2); out[p + 1] = byteAt(o + 1); out[p + 2] = byteAt(o);
      out[p + 3] = size === 4 ? byteAt(o + 3) : 255;
    }
  };

  let palette = null;
  if (kind === 1) {
    if (mapType !== 1) throw new Error('decodeTga: colour-mapped image without a colour map');
    palette = new Uint8Array((mapFirst + mapLength) * 4);
    if (mapBytes !== 4) for (let i = 0; i < palette.length; i += 4) palette[i + 3] = 255;
    for (let i = 0; i < mapLength; i++) colourAt(at + i * mapBytes, mapBytes, palette, (mapFirst + i) * 4, true);
  }
  if (mapType === 1) at += mapLength * mapBytes;

  const pixelCount = width * height;
  const pixelAt = (o, out, p) => {
    if (kind !== 1) return colourAt(o, bytesPerPixel, out, p, false);
    const index = bytesPerPixel === 2 ? bytes[o] | (bytes[o + 1] << 8) : bytes[o];
    if (index >= 0 && index * 4 < palette.length) out.set(palette.subarray(index * 4, index * 4 + 4), p);
    else out.set([0, 0, 0, mapBytes === 4 ? 0 : 255], p);
  };

  // Pixels in file order, before the row flips below.
  const decoded = new Uint8Array(pixelCount * 4);
  if (!rle) {
    for (let i = 0; i < pixelCount; i++) pixelAt(at + i * bytesPerPixel, decoded, i * 4);
  } else {
    let i = 0;
    // Pixels that the data never reaches stay transparent black.
    while (i < pixelCount && at < bytes.length) {
      const header = byteAt(at++);
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        pixelAt(at, decoded, i * 4);
        at += bytesPerPixel;
        for (let k = 1; k < count && i + k < pixelCount; k++) decoded.copyWithin((i + k) * 4, i * 4, i * 4 + 4);
      } else {
        for (let k = 0; k < count && i + k < pixelCount; k++) pixelAt(at + k * bytesPerPixel, decoded, (i + k) * 4);
        at += count * bytesPerPixel;
      }
      i += count;
    }
  }

  // Bit 5 of the descriptor says the first row is the top one. Bit 4 (right-to-left) is not honoured: no tool
  // writes it and Morrowind's files never set it.
  if ((descriptor & 0x20) !== 0) return single(width, height, decoded);
  const rgba = new Uint8Array(pixelCount * 4);
  for (let y = 0; y < height; y++) {
    rgba.set(decoded.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
  }
  return single(width, height, rgba);
}

/**
 * Windows BMP with a BITMAPINFOHEADER-style header, uncompressed, at 8 bits per pixel (through the colour table
 * that follows the header), 24 bits (BGR) or 32 bits (BGRA). Rows are padded to 4 bytes and a positive height means
 * bottom-up storage. Bytes past the end of a truncated file read as zero. Returns the single mip level as
 * top-row-first RGBA.
 */
export function decodeBmp(bytes) {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error('decodeBmp: not a bitmap');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (compression !== 0 || (bits !== 8 && bits !== 24 && bits !== 32)) throw new Error('decodeBmp: unsupported format');
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  if (width <= 0 || height === 0) throw new Error('decodeBmp: empty image');

  const byteAt = (i) => bytes[i] | 0;
  const tableOffset = 14 + headerSize;
  const stride = (((width * bits) + 31) >> 5) << 2;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = pixelOffset + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      // A pixel past the end of the file is black. For 8 bits the colour table is read straight from the file at
      // the index, whatever the header says about its size.
      let at = row + x * (bits >> 3);
      if (bits === 8) at = bytes[at] === undefined ? Infinity : tableOffset + bytes[at] * 4;
      rgba[p] = byteAt(at + 2); rgba[p + 1] = byteAt(at + 1); rgba[p + 2] = byteAt(at);
      rgba[p + 3] = bits === 32 ? byteAt(at + 3) : 255;
    }
  }
  return single(width, height, rgba);
}

/**
 * Decode a texture file chosen by the extension of `path`: .dds (all mip levels, or the first `levels`), .tga or
 * .targa, .bmp. Any other extension throws.
 */
export function decodeTextureImage(path, bytes, { levels = Infinity } = {}) {
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
  if (ext === 'dds') return decodeDds(bytes, { levels });
  if (ext === 'tga' || ext === 'targa') return decodeTga(bytes);
  if (ext === 'bmp') return decodeBmp(bytes);
  throw new Error(`no decoder for .${ext} (${path})`);
}
