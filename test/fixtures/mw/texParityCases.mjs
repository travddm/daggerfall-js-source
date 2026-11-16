// Deterministic inputs for mwTexture.js: path lookups, actor model paths, wrap modes, and TGA/BMP/DDS decoding.
// `buildCases()` returns the same list every run. Each case's `run(module)` returns a short string that records the
// module's answer (a JSON string, or a digest for pixel data), so two implementations can be compared case by case.
// `mwTexture.golden.json` holds the answers of the module that this module replaced.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXTURE_DDS = new URL('./fixture.dds', import.meta.url);

function makeRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const int = (n) => Math.floor(next() * n);
  const bytes = (n) => Uint8Array.from({ length: Math.max(0, n) }, () => int(256));
  return { next, int, bytes };
}

const digestImage = (image) => {
  const hash = createHash('sha256');
  for (const mip of image.mips) {
    hash.update(`${mip.width}x${mip.height}:`);
    hash.update(mip.rgba);
  }
  return `${image.width}x${image.height}/${image.mips.length}/${hash.digest('hex').slice(0, 24)}`;
};

const attempt = (fn) => {
  try {
    return fn();
  } catch {
    return 'throws';
  }
};

const COMPONENTS = ['textures', 'Textures', 'bookart', 'BookArt', 'a', 'tx_a', 'deep', 'x', 'D:', 'Data Files', '', 'foo.bar'];
const EXTENSIONS = ['.tga', '.TGA', '.dds', '.bmp', '', '.', '.a.b'];
const SEPARATORS = ['/', '\\', '//', '\\\\', '/\\'];

function pathCases(rnd, count) {
  const name = () => {
    let s = rnd.int(5) === 0 ? SEPARATORS[rnd.int(5)] : '';
    const parts = 1 + rnd.int(5);
    for (let i = 0; i < parts; i++) {
      s += COMPONENTS[rnd.int(COMPONENTS.length)];
      if (i < parts - 1) s += SEPARATORS[rnd.int(5)];
    }
    return s + EXTENSIONS[rnd.int(EXTENSIONS.length)];
  };
  const cases = [];
  for (let i = 0; i < count; i++) {
    const given = name();
    const other = Array.from({ length: 6 }, name);
    const pickMask = rnd.int(1 << 12);
    const dir = ['textures', 'bookart', 'a'][rnd.int(3)];
    // The archive holds some of the names the lookup will probe, so every rung of the ladder is reached.
    cases.push({
      label: `texture path ${JSON.stringify(given)}`,
      run: (m) => {
        const probes = [];
        const known = new Set(other.map(m.normalizeVfsPath));
        m.correctTexturePath(given, (p) => { probes.push(p); return false; });
        probes.forEach((p, k) => { if (pickMask & (1 << k)) known.add(p); });
        const seen = [];
        const found = m.correctTexturePath(given, (p) => { seen.push(p); return known.has(p); });
        const normal = m.normalizeVfsPath(given);
        return JSON.stringify([found, seen, normal, m.findDirectory(normal, dir), m.changeExtension(given, 'dds'),
          m.correctResourcePath(['meshes', 'textures'], given, (p) => known.has(p), 'kf')]);
      },
    });
  }
  return cases;
}

function actorCases(rnd, count) {
  const paths = ['meshes/base_anim.nif', 'meshes/Base_Anim.NIF', 'a/B/c.1st.nif', 'c', 'dir/', '/x.nif', 'a\\b.nif', 'a/b/c.dat', 'c.nif', 'x.nif'];
  const archives = [[], ['meshes/xbase_anim.kf'], ['meshes/xBase_Anim.kf'], ['a/B/xc.1st.kf'], ['xc'], ['dir/x'], ['/xx.kf'], ['a\\xb.kf'], ['a/b/xc.dat'], ['xc.kf'], ['xx.kf']];
  const cases = [];
  for (const given of paths) {
    for (const held of archives) {
      cases.push({
        label: `actor model ${given} with ${held}`,
        run: (m) => {
          const probes = [];
          const result = m.correctActorModelPath(given, (p) => { probes.push(p); return held.includes(p); });
          return JSON.stringify([result, probes]);
        },
      });
    }
  }
  for (let i = 0; i < count; i++) {
    const stem = COMPONENTS[rnd.int(COMPONENTS.length)];
    const given = `${stem}${SEPARATORS[0]}${COMPONENTS[rnd.int(COMPONENTS.length)]}${['.nif', '.NIF', '.dat', ''][rnd.int(4)]}`;
    const holdsProbe = rnd.int(2) === 0;
    cases.push({
      label: `actor model ${given}`,
      run: (m) => {
        const wanted = [];
        m.correctActorModelPath(given, (p) => { wanted.push(p); return false; });
        const held = new Set(holdsProbe ? wanted : []);
        return JSON.stringify([m.correctActorModelPath(given, (p) => held.has(p)), wanted]);
      },
    });
  }
  return cases;
}

function tgaFile({ idLength = 0, mapType = 0, type, mapFirst = 0, mapLength = 0, mapDepth = 0, width, height, depth, descriptor = 0, map = new Uint8Array(0), body }) {
  const out = new Uint8Array(18 + idLength + map.length + body.length);
  out.set([idLength, mapType, type, mapFirst & 255, mapFirst >> 8, mapLength & 255, mapLength >> 8, mapDepth, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, depth, descriptor]);
  out.set(map, 18 + idLength);
  out.set(body, 18 + idLength + map.length);
  return out;
}

function tgaCases(rnd, count) {
  const cases = [];
  for (let i = 0; i < count; i++) {
    const type = [1, 2, 3, 9, 10, 11, 0, 4, 32][rnd.int(9)];
    const kind = type >= 9 ? type - 8 : type;
    const depth = [8, 15, 16, 24, 32, 1, 12][rnd.int(7)];
    const width = 1 + rnd.int(5);
    const height = 1 + rnd.int(5);
    const mapDepth = [15, 16, 24, 32, 8][rnd.int(5)];
    const mapLength = kind === 1 ? 1 + rnd.int(5) : rnd.int(2) ? 0 : 2;
    const mapType = kind === 1 ? (rnd.int(10) ? 1 : 0) : rnd.int(8) === 0 ? 1 : 0;
    const bytesPerPixel = (depth + 7) >> 3;
    let body;
    if (type >= 9) {
      const packets = [];
      for (let left = width * height; left > 0;) {
        const run = Math.min(left, 1 + rnd.int(4));
        if (rnd.int(2)) packets.push(Uint8Array.of(0x80 | (run - 1)), rnd.bytes(bytesPerPixel));
        else packets.push(Uint8Array.of(run - 1), rnd.bytes(bytesPerPixel * run));
        left -= run;
      }
      if (rnd.int(20) === 0) packets.pop();
      body = Uint8Array.from(packets.flatMap((p) => [...p]));
      if (rnd.int(10) === 0) body = body.subarray(0, rnd.int(body.length + 1));
    } else {
      body = rnd.bytes(width * height * bytesPerPixel - (rnd.int(6) === 0 ? rnd.int(3) : 0));
      // Palette indices stay inside the colour map most of the time.
      if (kind === 1) for (let k = 0; k < body.length; k += bytesPerPixel) if (rnd.int(10)) { body[k] = rnd.int(mapLength); if (bytesPerPixel === 2) body[k + 1] = 0; }
    }
    const header = {
      type, width, height, depth, mapType, mapLength, mapDepth,
      mapFirst: rnd.int(3) === 0 ? rnd.int(3) : 0,
      idLength: rnd.int(4) === 0 ? rnd.int(5) : 0,
      descriptor: [0, 0x20, 0x10, 0x30, 0x08, 0x28, 0x38, 0x0f, 0x2f][rnd.int(9)],
      map: rnd.bytes(mapLength * ((mapDepth + 7) >> 3)),
    };
    const bytes = tgaFile({ ...header, body });
    cases.push({
      label: `tga type ${type} ${depth}bpp ${width}x${height} desc ${header.descriptor.toString(16)}`,
      run: (m) => attempt(() => digestImage(m.decodeTga(bytes))),
    });
  }
  return cases;
}

function bmpFile({ width, height, bits, compression = 0, colours = 0, table = new Uint8Array(0), shortBy = 0 }) {
  const stride = (((width * bits) + 31) >> 5) << 2;
  const pixelOffset = 14 + 40 + table.length;
  const out = new Uint8Array(pixelOffset + stride * Math.abs(height) - shortBy);
  out.set([0x42, 0x4d]);
  const view = new DataView(out.buffer);
  view.setUint32(10, pixelOffset, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, bits, true);
  view.setUint32(30, compression, true);
  view.setUint32(46, colours, true);
  out.set(table, 54);
  return out;
}

function bmpCases(rnd, count) {
  const cases = [];
  for (let i = 0; i < count; i++) {
    const bits = [1, 4, 8, 16, 24, 32, 2][rnd.int(7)];
    const width = 1 + rnd.int(9);
    const height = (rnd.int(2) ? 1 : -1) * (1 + rnd.int(4));
    const colours = bits <= 8 ? [0, 0, 1, 2, 5, 300][rnd.int(6)] : 0;
    const entries = bits <= 8 ? colours || 1 << bits : 0;
    const bytes = bmpFile({
      width, height, bits, colours,
      compression: rnd.int(15) === 0 ? 3 : 0,
      table: bits <= 8 ? rnd.bytes(Math.min(entries, 256) * 4) : undefined,
      shortBy: rnd.int(10) === 0 ? 2 : 0,
    });
    for (let k = 54 + (bits <= 8 ? Math.min(entries, 256) * 4 : 0); k < bytes.length; k++) bytes[k] = rnd.int(256);
    const input = rnd.int(12) === 0 ? bytes.subarray(0, rnd.int(bytes.length)) : bytes;
    cases.push({
      label: `bmp ${bits}bpp ${width}x${height}`,
      run: (m) => attempt(() => digestImage(m.decodeBmp(input))),
    });
  }
  return cases;
}

function routerCases() {
  const dds = new Uint8Array(readFileSync(FIXTURE_DDS));
  const names = ['a.dds', 'A.DDS', 'a.tga', 'a.targa', 'a.TARGA', 'a.bmp', 'a.gif', 'a', 'a.b.dds', 'dir.x/a'];
  const options = [undefined, {}, { levels: 1 }, { levels: 0 }, { levels: 99 }];
  const cases = [];
  for (const name of names) {
    for (const option of options) {
      cases.push({
        label: `route ${name} ${JSON.stringify(option)}`,
        run: (m) => attempt(() => digestImage(m.decodeTextureImage(name, dds, option))),
      });
    }
  }
  return cases;
}

function constantCases() {
  const cases = [{
    label: 'constants and exports',
    run: (m) => JSON.stringify([m.GL_REPEAT, m.GL_CLAMP_TO_EDGE, m.TEXTURE_TOP_LEVEL, m.TEXTURE_EXT, Object.keys(m).sort()]),
  }, {
    label: 'warning image',
    run: (m) => digestImage(m.warningImage()),
  }];
  for (const mode of [0, 1, 2, 3, 4, 7, -1, undefined]) cases.push({ label: `wrap ${mode}`, run: (m) => JSON.stringify(m.wrapModes(mode)) });
  return cases;
}

export function buildCases() {
  const rnd = makeRandom(20261031);
  return [
    ...constantCases(),
    ...pathCases(rnd, 1500),
    ...actorCases(rnd, 150),
    ...tgaCases(rnd, 1500),
    ...bmpCases(rnd, 800),
    ...routerCases(),
  ];
}
