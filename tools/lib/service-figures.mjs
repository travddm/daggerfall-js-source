// The figures a load run gives of the services themselves, beside the fleet's: the runtime and its workerd, the boot,
// the clock's firings, the memory and CPU of the services' processes (tools/lib/process-sampler.mjs), the pooled HTTP
// latency and the storage bindings' probe. tools/loadHarness.mjs gathers them and prints them with its report.
import { createSampler } from './process-sampler.mjs';
import { FIRE_MINUTE, FIRE_HOUR, sleep } from './load-services.mjs';

/** The p-th percentile (0..1) of a list of numbers, or null for none. */
export function percentile(list, p) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}

/** Every /v1 request the bots made, pooled across routes: the HTTP latency the go/no-go compares. */
export function httpLatency(account) {
  const all = [];
  for (const [route, row] of account.byRoute) if (route.startsWith('/v1/')) for (const ms of row.ms) all.push(ms);
  return { p50: percentile(all, 0.5), p95: percentile(all, 0.95), n: all.length };
}

// How the services themselves fared: the runtime, its boot, its clock and, with --sample, its memory and CPU.

/** Idle memory is sampled this long after the boot, before any bot is set up. */
export const IDLE_SAMPLE_MS = 10_000;
let activeSampler = null;
export const stopSampling = () => {
  activeSampler?.stop();
  activeSampler = null;
};

/** A sampler of the services' processes (tools/lib/process-sampler.mjs), its idle phase already taken; with --sample 0,
 *  one that samples nothing and reads no CPU. */
export async function startSampling(o, svc) {
  if (!(o.sample > 0)) return { phase: () => {}, cpu: async () => ({ pids: [], seconds: null }), stop: () => null };
  const sampler = createSampler({ roots: svc.roots, everyMs: o.sample * 1000 });
  activeSampler = sampler;
  sampler.phase('idle');
  await sampler.start();
  await sleep(IDLE_SAMPLE_MS);
  return sampler;
}

/** The services' own figures for the report. `firings` are the clock's (CronFiring, tools/lib/load-services.mjs). */
export function servicesFigures({ svc, firings, memory, cpu }) {
  const fired = firings.filter((f) => f.ok);
  const minute = fired.filter((f) => f.cron === FIRE_MINUTE).map((f) => f.ms);
  return {
    runtime: svc.runtime,
    workerd: svc.workerd,
    bootMs: svc.bootMs,
    generateMs: svc.generateMs ?? null,
    stormRestartMs: svc.restartMs ?? null,
    cron: {
      fired: firings.length,
      failed: firings.length - fired.length,
      minuteP50: percentile(minute, 0.5),
      minuteMax: minute.length ? Math.max(...minute) : null,
      hourMs: fired.find((f) => f.cron === FIRE_HOUR)?.ms ?? null,
    },
    memory,
    cpuShare: cpu,
  };
}

const r1 = (x) => (x == null ? '-' : Math.round(x * 10) / 10);

/** Prints the services' figures under the report. */
export function printServices(s) {
  console.log(`\n== THE SERVICES - ${s.runtime} (workerd ${s.workerd})`);
  console.log(
    `boot to both answering: ${r1(s.bootMs)} ms${s.generateMs != null ? `; the kit's build before it: ${r1(s.generateMs)} ms` : ''}${s.stormRestartMs != null ? `; the storm's restart: ${r1(s.stormRestartMs)} ms` : ''}`,
  );
  console.log(
    `the minute's clock: p50 ${r1(s.cron.minuteP50)} ms, max ${r1(s.cron.minuteMax)} ms; the hour's ${r1(s.cron.hourMs)} ms; ${s.cron.fired} fired, ${s.cron.failed} failed`,
  );
  if (s.memory) {
    for (const [phase, m] of Object.entries(s.memory.phases))
      console.log(
        `memory, ${phase}: median ${r1(m.medianMB)} MB, max ${r1(m.maxMB)} MB (workerd alone: median ${r1(m.workerdMedianMB)}, max ${r1(m.workerdMaxMB)}) over ${m.samples} samples`,
      );
    console.log(`the processes' own lifetime peaks, summed: ${r1(s.memory.lifetimePeakSumMB)} MB`);
  }
  if (s.cpuShare != null) console.log(`CPU over the play: ${r1(s.cpuShare * 100)}% of one core`);
  for (const [when, p] of Object.entries(s.probes ?? {}))
    console.log(`a trip through each binding, ${when} (ms): ${JSON.stringify(p)}`);
}
