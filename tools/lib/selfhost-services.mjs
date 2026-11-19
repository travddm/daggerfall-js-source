// Stands the load harness's two services from the self-host kit (selfhost/) in place of two `wrangler dev` processes.
// selfhost/generate.ts bundles both Workers and writes dfo.capnp, as the kit's image build does, and one workerd process
// serves both with the kit's D1 and R2 shims. The account entry is the harness's own (tools/loadAccountEntry.mjs), so
// the run reads the same metrics points and statement counts as a wrangler run. The service's clock is fired through
// the cron door, as the kit's cron sidecar fires it.
//
// The kit is installed apart from the repository's own packages (`npm ci --prefix selfhost`), so nothing here imports
// it: generate.ts runs as a child process, and the workerd binary is found through the kit's own package.
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { BOOT_POLL_MS, healthy, portHeld, sleep, startProcess, stopDev, timedRequest } from './load-services.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELFHOST = join(ROOT, 'selfhost');
const run = promisify(execFile);

/** The cron door's path and secret header, as server-account/src/cron-triggers.ts declares them. */
export const CRON_DOOR_PATH = '/__cron';
export const CRON_SECRET_HEADER = 'x-cron-secret';

/**
 * Secrets the kit reads from the environment that a wrangler run of the harness does not set. They are removed from
 * the workerd process's environment, so both runtimes serve the same configuration: a key left in the shell (an
 * Anthropic key, say) would turn on a feature in one run only.
 */
export const UNSET_FOR_PARITY = Object.freeze([
  'GATE_SIGNING_KEY',
  'GATE_PUBLIC_KEY',
  'OPERATOR_SECRET',
  'ANTHROPIC_API_KEY',
  'STAFF_ANALYTICS_ACCOUNT',
  'STAFF_ANALYTICS_TOKEN',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
]);

/**
 * The kit's pinned workerd: `{ bin, version }`. Throws, naming the install step, when the kit is not installed.
 * @returns {{ bin: string, version: string }}
 */
export function kitWorkerd(selfhostDir = SELFHOST) {
  const pkg = join(selfhostDir, 'node_modules', 'workerd', 'package.json');
  if (!existsSync(pkg))
    throw new Error(`the self-host kit is not installed: run \`npm ci --prefix selfhost\` (no ${pkg})`);
  // The package's main exports the path of the binary for this platform.
  const workerd = createRequire(join(selfhostDir, 'package.json'))('workerd');
  return { bin: workerd.default, version: workerd.version };
}

/**
 * The environment the workerd process runs with: this process's own, the kit's secrets for a parity run removed, and
 * the run's keys. The relay's account service address is empty, as server/wrangler.toml leaves it for a wrangler run.
 */
export function workerdEnv(base, { privateKey, publicKey, cronSecret }) {
  const env = { ...base };
  for (const name of UNSET_FOR_PARITY) delete env[name];
  return {
    ...env,
    IDENTITY_PRIVATE_KEY: privateKey,
    IDENTITY_PUBLIC_KEY: publicKey,
    CRON_SECRET: cronSecret,
    ACCOUNT_SERVICE_URL: '',
  };
}

/** The arguments selfhost/generate.ts is run with: the run's own build and data directories, ports and account entry. */
export function generateArgs({ out, data, accountPort, relayPort }) {
  return [
    join(SELFHOST, 'generate.ts'),
    '--out',
    out,
    '--data',
    data,
    '--relay-address',
    `127.0.0.1:${relayPort}`,
    '--accounts-address',
    `127.0.0.1:${accountPort}`,
    '--accounts-entry',
    join(ROOT, 'tools', 'loadAccountEntry.mjs'),
  ];
}

/**
 * Stands both services under the kit's workerd. Answers the same shape as standServices (tools/lib/load-services.mjs):
 * the ports, `restartRelay`, `fireCron`, `roots` (the process ids the run's sampler follows), `bootMs` and the runtime.
 *
 * One process serves both Workers, so the storm's restart restarts the account service too. That is what a deploy of
 * the kit does (selfhost/README.md, Limits).
 */
export async function standSelfhost(o, state) {
  const accountPort = o.port;
  const relayPort = o.port + 1;
  for (const port of [accountPort, relayPort]) {
    if (await portHeld(port))
      throw new Error(`something already holds 127.0.0.1:${port} - stop it (an orphaned workerd), or pass --port`);
  }
  const { bin, version } = kitWorkerd();

  console.log('== a throwaway signing pair and cron secret (never written into the repository)');
  const { stdout } = await run(process.execPath, [join(ROOT, 'tools/mintIdentityKeys.mjs'), '--pipe']);
  const [privateKey, publicKey] = stdout.split('\n');
  const env = workerdEnv(process.env, { privateKey, publicKey, cronSecret: randomBytes(32).toString('base64url') });

  console.log(`== the self-host kit's build: both Workers bundled, dfo.capnp written (workerd ${version})`);
  const out = join(state, 'selfhost-build');
  const data = join(state, 'selfhost-data');
  mkdirSync(data, { recursive: true });
  const generateStart = performance.now();
  await run(process.execPath, generateArgs({ out, data, accountPort, relayPort }), {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
  });
  const generateMs = performance.now() - generateStart;

  const start = () =>
    startProcess(bin, ['serve', join(out, 'dfo.capnp'), '--experimental'], { cwd: ROOT, env }, 'workerd');
  const bootBoth = async (svc) => {
    const bootStart = performance.now();
    svc.process = start();
    if (!(await healthy(accountPort, '/v1/health', 180, BOOT_POLL_MS)))
      throw new Error(`the account service never answered:\n${svc.process.log.slice(-2000)}`);
    if (!(await healthy(relayPort, '/health', 180, BOOT_POLL_MS)))
      throw new Error(`the relay never answered:\n${svc.process.log.slice(-2000)}`);
    return performance.now() - bootStart;
  };

  console.log('== booting both Workers in one workerd');
  const svc = {
    runtime: 'selfhost',
    workerd: version,
    accountPort,
    relayPort,
    process: null,
    generateMs,
    bootMs: null,
    roots: () => [svc.process.pid],
    fireCron: (cron) =>
      timedRequest(
        {
          port: accountPort,
          path: CRON_DOOR_PATH,
          method: 'POST',
          headers: { 'content-type': 'application/json', [CRON_SECRET_HEADER]: env.CRON_SECRET },
          body: JSON.stringify({ cron }),
        },
        cron,
      ),
    restartRelay: async () => {
      stopDev(svc.process);
      for (let i = 0; i < 40 && ((await portHeld(relayPort)) || (await portHeld(accountPort))); i++) await sleep(250);
      try {
        svc.restartMs = await bootBoth(svc);
        return true;
      } catch {
        return false;
      }
    },
  };
  svc.bootMs = await bootBoth(svc);
  return svc;
}
