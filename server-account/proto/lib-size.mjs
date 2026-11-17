import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
for (const e of process.argv.slice(2)) {
  const r = await build({ entryPoints: [e], bundle: true, write: false, minify: true, format: 'esm', platform: 'neutral', conditions: ['workerd', 'worker', 'browser'], mainFields: ['browser', 'module', 'main'], external: ['node:*', 'cloudflare:*', 'pg'], logLevel: 'error' });
  const b = r.outputFiles[0].contents;
  console.log(e.split('/').pop(), (b.length / 1024).toFixed(1), 'KiB min,', (gzipSync(b).length / 1024).toFixed(1), 'KiB gzip');
}
