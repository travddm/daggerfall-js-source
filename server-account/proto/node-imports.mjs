// Study prototype: the bare `node:` and `cloudflare:` imports left in the service bundle (workerd must provide each).
import { build } from 'esbuild';
const r = await build({ entryPoints: ['server-account/src/index.js'], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', conditions: ['workerd', 'worker', 'browser'], mainFields: ['browser', 'module', 'main'], external: ['cloudflare:*', 'node:*'], loader: { '.json': 'json' }, logLevel: 'error' });
const text = r.outputFiles[0].text;
console.log([...new Set(text.match(/from\s*["'](node|cloudflare):[^"']+["']|import\(["'](node|cloudflare):[^"']+["']\)/g) ?? [])].join('\n') || 'none');
