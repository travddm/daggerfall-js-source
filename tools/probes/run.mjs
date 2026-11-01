// Runs the end-to-end game probes (docs/testing/game-probes.md).
//
//   node tools/probes/run.mjs              every probe, in order
//   node tools/probes/run.mjs save pause   the named probes (the file name without its number)
//
// Needs ARENA2_PATH (tools/fetch-data.sh). PW_CHANNEL=msedge drives the installed Edge on the GPU; without it
// Playwright's Chromium runs on SwiftShader. PROBE_PORT is the first Vite port (default 5260).
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { serve, launchBrowser, ledger } from './lib/harness.mjs';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PROBE_PORT || 5260);

const files = readdirSync(DIR).filter((f) => /^\d\d-.+\.mjs$/.test(f)).sort();
const wanted = process.argv.slice(2);
const chosen = files.filter((f) => !wanted.length || wanted.includes(f.replace(/^\d\d-/, '').replace(/\.mjs$/, '')));
if (wanted.length && chosen.length !== wanted.length) {
  console.error(`unknown probe in [${wanted.join(', ')}]; known: ${files.map((f) => f.replace(/^\d\d-|\.mjs$/g, '')).join(', ')}`);
  process.exit(2);
}

const servers = new Map();
const closers = [];
let browser = null;
const results = [];

const cleanup = async () => {
  try { await browser?.close(); } catch { /* gone */ }
  for (const c of closers) { try { await c(); } catch { /* gone */ } }
};
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(sig, () => { cleanup().finally(() => process.exit(code)); });

try {
  browser = await launchBrowser();
  for (const file of chosen) {
    const mod = await import(pathToFileURL(join(DIR, file)).href);
    const name = mod.name;
    const t0 = Date.now();
    console.log(`\n===== ${name} (${file}) =====`);
    const L = ledger(name);
    // a probe that needs a patched dev server (mod.plugins) gets its own, apart from the others
    const key = mod.plugins ? file : 'plain';
    if (!servers.has(key)) {
      const s = await serve({ port: PORT + servers.size, plugins: mod.plugins ? await mod.plugins() : [] });
      closers.push(s.close);
      servers.set(key, s);
    }
    try {
      await mod.run({ browser, base: servers.get(key).base, ck: L.check });
    } catch (e) {
      L.check('the probe ran to the end', false, `${e?.name}: ${e?.message}`);
      console.log(e?.stack);
    }
    results.push({ name, failed: L.failed(), total: L.rows.length, secs: Math.round((Date.now() - t0) / 1000) });
  }
} finally {
  await cleanup();
}

console.log(`\n${'='.repeat(60)}`);
for (const r of results) console.log(`${r.failed.length ? 'FAIL' : 'PASS'}  ${r.name}  ${r.total - r.failed.length}/${r.total} checks  ${r.secs}s`);
const bad = results.filter((r) => r.failed.length);
for (const r of bad) for (const f of r.failed) console.log(`  [${r.name}] ${f.label}${f.detail ? ` - ${f.detail}` : ''}`);
process.exit(bad.length ? 1 : 0);
