// How the load harness stands its two services and stops them: wrangler dev for each Worker, the account
// database's migrations, the service's clock fired through wrangler's scheduled route, and the account service's
// kept points read back. tools/loadHarness.mjs drives the fleet against what this module starts.
import { spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';

import { wranglerCommand, devSpawnOptions, killTree } from './wranglerLaunch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = promisify(execFile);
// ═══ THE TOOLCHAIN ═════════════════════════════════════════════════════════════════════════════════════════════════

const localWrangler = join(ROOT, 'server/node_modules/.bin/wrangler');
const WRANGLER_BIN = process.env.WRANGLER_BIN || (existsSync(localWrangler) ? localWrangler : '');
const wrangler = (args) => wranglerCommand(args, { bin: WRANGLER_BIN });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Is anything answering (or holding) a local port? Only a refused connection says no - an orphaned workerd accepts and
 *  never answers (tools/accountProbe.mjs's lesson). */
export async function portHeld(port) {
  return new Promise((resolve) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (r) => { r.resume(); resolve(true); });
    req.on('timeout', () => { req.destroy(); resolve(true); });
    req.on('error', (e) => resolve(!/ECONNREFUSED/.test(String(e?.code ?? e?.message ?? e))));
    req.end();
  });
}

export async function healthy(port, path, waitS) {
  for (let i = 0; i < waitS; i++) {
    const ok = await new Promise((resolve) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, timeout: 1500 }, (r) => { r.resume(); resolve(r.statusCode === 200); });
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
      req.end();
    });
    if (ok) return true;
    await sleep(1000);
  }
  return false;
}

/** The processes this run started, each killed whole (npx -> wrangler -> workerd: the grandchild holds the port), on the
 *  way out and on a signal - its own group off Windows, its tree on it (tools/lib/wranglerLaunch.mjs). */
const started = new Set();
function startDev(cwd, args, label) {
  const [bin, a] = wrangler(args);
  const p = spawn(bin, a, devSpawnOptions({ cwd, stdio: ['ignore', 'pipe', 'pipe'] }));
  p.label = label; p.log = '';
  const keep = (d) => { p.log = (p.log + d).slice(-20_000); };
  p.stdout.on('data', keep); p.stderr.on('data', keep);
  started.add(p);
  return p;
}
function stopDev(p) {
  if (!p) return;
  started.delete(p);
  try { killTree(p.pid, 'SIGKILL'); } catch { /* already gone */ }
}
export const stopAll = () => { for (const p of [...started]) stopDev(p); };

/** The pids listening on a local port, for a process that outlived its tree's kill (a workerd that left the group). */
function listeners(port) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
      return [...new Set(out.split('\n').filter((l) => l.includes(`127.0.0.1:${port} `) && /LISTENING/.test(l)).map((l) => l.trim().split(/\s+/).pop()))];
    }
    return execFileSync('lsof', ['-t', '-i', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch { return []; }
}
function killListeners(port) {
  for (const pid of listeners(port)) { try { killTree(Number(pid), 'SIGKILL'); } catch { /* gone */ } }
}

/** Stop what this run started, then wait - bounded - until the ports are free, so a restart does not meet the first
 *  start's leftover workerd on them. A port still held at the half way mark has a holder that outlived the kill (the
 *  ports are this run's own): its listener is killed too. Returns whether the ports are free. */
export async function stopAndFree(ports, { stop = stopAll, held = portHeld, wait = sleep, killHolder = killListeners, timeoutMs = 20_000, stepMs = 250 } = {}) {
  stop();
  let killed = false;
  for (let waited = 0; waited < timeoutMs; waited += stepMs) {
    const busy = [];
    for (const port of ports) if (await held(port)) busy.push(port);
    if (!busy.length) return true;
    if (!killed && waited >= timeoutMs / 2) { killed = true; for (const port of busy) killHolder(port); }
    await wait(stepMs);
  }
  return false;
}

/** standServices, once more when the first start fails (wrangler's dev server now and then dies while it boots): the
 *  first start is stopped and its ports freed before the second begins. */
export async function standServicesRetrying(o, state, { stand = standServices, free = stopAndFree, log = console.log } = {}) {
  try {
    return await stand(o, state);
  } catch (e) {
    log(`   the services did not start, once more: ${String(e?.message).slice(0, 200)}`);
    if (!(await free([o.port, o.port + 1]))) throw new Error(`the first start's ports stayed held: ${String(e?.message).slice(0, 200)}`);
    return stand(o, state);
  }
}

// ═══ THE SERVICES ══════════════════════════════════════════════════════════════════════════════════════════════════

export async function standServices(o, state) {
  const accountPort = o.port, relayPort = o.port + 1;
  for (const port of [accountPort, relayPort]) {
    if (await portHeld(port)) throw new Error(`something already holds 127.0.0.1:${port} - stop it (an orphaned workerd: \`ps aux | grep workerd\`), or pass --port`);
  }
  console.log('== a throwaway signing pair (never written into the repository)');
  const { stdout } = await run(process.execPath, [join(ROOT, 'tools/mintIdentityKeys.mjs'), '--pipe']);
  const [priv, pub] = stdout.split('\n');
  const acctEnv = join(state, 'account.env');
  writeFileSync(acctEnv, `IDENTITY_PRIVATE_KEY=${priv}\nIDENTITY_PUBLIC_KEY=${pub}\n`, { mode: 0o600 });
  const relayEnv = join(state, 'relay.env');
  writeFileSync(relayEnv, `IDENTITY_PUBLIC_KEY=${pub}\n`, { mode: 0o600 });

  console.log('== the account database: every migration, through wrangler\'s ledger');
  const [mb, ma] = wrangler(['d1', 'migrations', 'apply', 'daggerfall-accounts', '--local', '--persist-to', state]);
  await run(mb, ma, { cwd: join(ROOT, 'server-account'), timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });

  const account = () => startDev(join(ROOT, 'server-account'), ['dev', join(ROOT, 'tools/loadAccountEntry.mjs'),
    '--config', join(ROOT, 'server-account/wrangler.toml'), '--local', '--persist-to', state, '--port', String(accountPort),
    '--ip', '127.0.0.1', '--inspector-port', String(accountPort + 100), '--env-file', acctEnv, '--test-scheduled'], 'account');
  const relay = () => startDev(join(ROOT, 'server'), ['dev', '--config', join(ROOT, 'server/wrangler.toml'), '--local',
    '--persist-to', state, '--port', String(relayPort), '--ip', '127.0.0.1', '--inspector-port', String(relayPort + 100), '--env-file', relayEnv], 'relay');
  console.log('== booting both Workers in workerd');
  const svc = { accountPort, relayPort, account: account(), relay: relay(), restartRelay: null };
  if (!(await healthy(accountPort, '/v1/health', 180))) throw new Error(`the account service never answered:\n${svc.account.log.slice(-2000)}`);
  // AUDIT SCALE C11: the private half read and the service up - it leaves the disk now, not at the run's end (the relay's
  // file holds the public half alone, and the storm restarts only the relay)
  rmSync(acctEnv, { force: true });
  if (!(await healthy(relayPort, '/health', 180))) throw new Error(`the relay never answered:\n${svc.relay.log.slice(-2000)}`);
  svc.restartRelay = async () => {
    stopDev(svc.relay);
    for (let i = 0; i < 20 && (await portHeld(relayPort)); i++) await sleep(250);
    svc.relay = relay();
    return healthy(relayPort, '/health', 180);
  };
  return svc;
}

/** THE SERVICE'S OWN CLOCK (SCALE4b, server-account/src/cron.js), fired as the deploy fires it: the minute's list every
 *  minute of play and the hour's once as play begins - `wrangler dev --test-scheduled` answers /__scheduled. Its
 *  statements ride the service's own points (`cron:<job>`), counted with the rest. The two strings are cron.js's
 *  CRON_MINUTE and CRON_HOUR (test/net/scale3.test.js holds them together); a tree whose service keeps no clock (before
 *  SCALE4b) answers the firing with nothing, so one harness measures either. */
export const FIRE_MINUTE = '* * * * *';
export const FIRE_HOUR = '41 * * * *';
export async function fireCron(port, cron) {
  return new Promise((resolve) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: `/__scheduled?cron=${encodeURIComponent(cron)}`, timeout: 60_000 }, (r) => { r.resume(); r.on('end', resolve); });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.end();
  });
}

/** The account service's kept points and statements since the last read (tools/loadAccountEntry.mjs) - every read
 *  drains them, so each fold is of what is new. */
export async function serviceStats(port) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/__load/stats', timeout: 30_000 }, (r) => {
      const parts = [];
      r.on('data', (d) => parts.push(d));
      r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}
