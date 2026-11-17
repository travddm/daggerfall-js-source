// Bundles the account service as selfhost/generate.ts does and prints raw, minified and gzip sizes.
// Usage: node server-account/proto/bundleSize.mjs [label]
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';

const common = {
  entryPoints: ['server-account/src/index.js'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  conditions: ['workerd', 'worker', 'browser'],
  mainFields: ['browser', 'module', 'main'],
  external: ['cloudflare:*', 'node:*'],
  loader: { '.json': 'json' },
  logLevel: 'error',
  metafile: true,
};
const plain = await build(common);
const mini = await build({ ...common, minify: true });
const bytes = (r) => r.outputFiles[0].contents;
const kb = (n) => (n / 1024).toFixed(1);
const lib = (meta) => {
  const by = {};
  for (const [path, info] of Object.entries(meta.outputs[Object.keys(meta.outputs)[0]].inputs)) {
    const m = path.match(/node_modules[\/]((?:@[^\/]+[\/])?[^\/]+)/);
    if (m) by[m[1]] = (by[m[1]] ?? 0) + info.bytesInOutput;
  }
  return Object.entries(by).map(([k, v]) => `${k} ${kb(v)} KiB`).join(', ') || 'none';
};
console.log(`${process.argv[2] ?? 'bundle'}: raw ${kb(bytes(plain).length)} KiB, minified ${kb(bytes(mini).length)} KiB, minified+gzip ${kb(gzipSync(bytes(mini)).length)} KiB; node_modules in minified: ${lib(mini.metafile)}`);
