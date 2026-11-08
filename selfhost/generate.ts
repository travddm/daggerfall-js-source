// Builds the self-host: bundles the five Workers as wrangler bundles them (esbuild), gathers the account migrations,
// and writes `dfo.capnp` from the two tomls (config/workerd-config.ts). Run from the repository:
//
//   node selfhost/generate.ts [--out selfhost/build] [--data selfhost/data] [--metrics] [--r2 disk|s3]
//                             [--relay-address 127.0.0.1:8787] [--accounts-address 127.0.0.1:8788]
//
// then `workerd serve selfhost/build/dfo.capnp --experimental` (localDisk Durable Object storage and the
// analyticsEngine binding need the flag).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { parse } from 'smol-toml';
import { BUNDLES, cronSchedules, diskNames, workerdConfig, type ConfigOptions } from './config/workerd-config.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: join(HERE, 'build') },
    data: { type: 'string', default: join(HERE, 'data') },
    metrics: { type: 'boolean', default: false },
    r2: { type: 'string', default: 'disk' },
    'relay-address': { type: 'string', default: '127.0.0.1:8787' },
    'accounts-address': { type: 'string', default: '127.0.0.1:8788' },
  },
});
if (values.r2 !== 'disk' && values.r2 !== 's3') throw new Error(`--r2 is disk or s3, not ${values.r2}`);

const out = resolve(values.out);
const options: ConfigOptions = {
  // An absolute path with forward slashes: workerd reads a relative path from its working directory, not the config's.
  dataDir: values.data.startsWith('/') ? values.data : resolve(values.data).split('\\').join('/'),
  metrics: values.metrics,
  r2Backend: values.r2,
  relayAddress: values['relay-address'],
  accountsAddress: values['accounts-address'],
};

const tomlOf = (path: string): Record<string, unknown> => parse(readFileSync(join(ROOT, path), 'utf8'));
const relay = tomlOf('server/wrangler.toml');
const accounts = tomlOf('server-account/wrangler.toml');

mkdirSync(out, { recursive: true });
const entries: Array<[string, string]> = [
  [join(ROOT, 'server/src/index.js'), BUNDLES.relay],
  [join(ROOT, 'server-account/src/index.js'), BUNDLES.accounts],
  [join(HERE, 'd1/worker.ts'), BUNDLES.d1],
  [join(HERE, 'r2/worker.ts'), BUNDLES.r2],
  [join(HERE, 'metrics/sink.ts'), BUNDLES.metricsSink],
];
for (const [entry, file] of entries) {
  await build({
    entryPoints: [entry],
    outfile: join(out, file),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['browser', 'module', 'main'],
    external: ['cloudflare:*', 'node:*'],
    loader: { '.json': 'json' },
    logLevel: 'warning',
  });
}

const migrationsDir = join(ROOT, 'server-account/migrations');
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }));
writeFileSync(join(out, BUNDLES.migrations), JSON.stringify(migrations));
writeFileSync(join(out, 'cron-schedules.txt'), `${cronSchedules(accounts).join('\n')}\n`);
writeFileSync(join(out, 'dfo.capnp'), workerdConfig(relay, accounts, options));

// workerd opens a disk service's directory as it starts and fails on a missing one. In Docker the volume is mounted
// later, so the container's entry makes them there.
if (!values.data.startsWith('/'))
  for (const name of diskNames(options)) mkdirSync(join(options.dataDir, name), { recursive: true });

console.log(
  `wrote ${join(out, 'dfo.capnp')} (data in ${options.dataDir}, metrics ${options.metrics ? 'on' : 'off'}, R2 on ${options.r2Backend})`,
);
