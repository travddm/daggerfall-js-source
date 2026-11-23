// Samples the memory and CPU time of the processes a load run started, so the two runtimes the harness can stand
// (wrangler dev, or the self-host kit's workerd) are measured by one method. A sample covers every process under the
// run's roots: wrangler's node processes and their workerd children, or the kit's one workerd.
//
// Memory is the working set on Windows (typeperf's Process counters) and the resident set elsewhere (ps). CPU time is
// read at marks, not sampled: tasklist reports it to the second on Windows, and ps's `times` to the second elsewhere.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * @typedef {{ pid: number, ppid: number, name: string, workingSet: number, privateBytes: number | null,
 *   peakWorkingSet: number | null, ageS: number | null }} ProcessRow
 * One process in a snapshot. Bytes. `privateBytes`, `peakWorkingSet` and `ageS` (seconds since it started) are
 * Windows-only.
 */

const COUNTERS = [
  'ID Process',
  'Creating Process ID',
  'Elapsed Time',
  'Working Set',
  'Working Set - Private',
  'Working Set Peak',
];

/** Splits one CSV line of quoted fields, as typeperf and tasklist write them. */
export function csvFields(line) {
  const out = [];
  const re = /"((?:[^"]|"")*)"/g;
  for (let m = re.exec(line); m; m = re.exec(line)) out.push(m[1].replaceAll('""', '"'));
  return out;
}

/**
 * Reads typeperf's CSV for COUNTERS over `\Process(*)`: one row per process instance. The `_Total` and `Idle`
 * instances are not processes and are left out.
 * @returns {ProcessRow[]}
 */
export function parseTypeperf(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.startsWith('"'));
  if (lines.length < 2) return [];
  const header = csvFields(lines[0]);
  const values = csvFields(lines[1]);
  /** @type {Map<string, Record<string, number>>} */
  const byInstance = new Map();
  header.forEach((column, i) => {
    const m = /\\Process\((.+)\)\\(.+)$/.exec(column);
    if (!m) return;
    const [, instance, counter] = m;
    if (instance === '_Total' || instance === 'Idle') return;
    const row = byInstance.get(instance) ?? {};
    row[counter] = Number(values[i]);
    byInstance.set(instance, row);
  });
  const rows = [];
  for (const [instance, c] of byInstance) {
    if (!Number.isFinite(c['ID Process'])) continue;
    rows.push({
      pid: c['ID Process'],
      ppid: c['Creating Process ID'],
      name: instance.replace(/#\d+$/, ''),
      workingSet: c['Working Set'],
      privateBytes: c['Working Set - Private'] ?? null,
      peakWorkingSet: c['Working Set Peak'] ?? null,
      ageS: c['Elapsed Time'] ?? null,
    });
  }
  return rows;
}

/** Reads `ps -A -o pid=,ppid=,rss=,comm=` (rss in KiB). @returns {ProcessRow[]} */
export function parsePs(text) {
  return text
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length >= 4)
    .map(([pid, ppid, rss, ...name]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      name: name.join(' '),
      workingSet: Number(rss) * 1024,
      privateBytes: null,
      peakWorkingSet: null,
      ageS: null,
    }));
}

/** The rows under `roots`, the roots included, by parent links. Windows reuses a dead process's id, and a process
 *  keeps naming the parent that created it, so a child older than its parent is another process's and is left out. */
export function treeOf(rows, roots) {
  const children = new Map();
  for (const r of rows) children.set(r.ppid, [...(children.get(r.ppid) ?? []), r]);
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const out = [];
  const seen = new Set();
  const queue = roots.map((pid) => byPid.get(pid)).filter(Boolean);
  while (queue.length) {
    const r = queue.shift();
    if (seen.has(r.pid)) continue;
    seen.add(r.pid);
    out.push(r);
    // A pid of 0 or a process its own parent would loop.
    for (const c of children.get(r.pid) ?? []) {
      const older = c.ageS != null && r.ageS != null && c.ageS > r.ageS;
      if (c.pid !== r.pid && !older) queue.push(c);
    }
  }
  return out;
}

/** Seconds from tasklist's "CPU Time" (h:mm:ss) or ps's `times` (a whole number of seconds). */
export function cpuSecondsOf(text) {
  const parts = String(text).trim().split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((total, p) => total * 60 + p, 0);
}

/** Reads `tasklist /V /FO CSV`: pid -> CPU seconds. */
export function parseTasklistCpu(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.startsWith('"'));
  const header = csvFields(lines[0] ?? '');
  const pidAt = header.indexOf('PID');
  const cpuAt = header.indexOf('CPU Time');
  const out = new Map();
  if (pidAt < 0 || cpuAt < 0) return out;
  for (const line of lines.slice(1)) {
    const f = csvFields(line);
    out.set(Number(f[pidAt]), cpuSecondsOf(f[cpuAt]));
  }
  return out;
}

/** Every process on the machine, with its memory. @returns {Promise<ProcessRow[]>} */
export async function snapshot(platform = process.platform) {
  if (platform === 'win32') {
    const args = [...COUNTERS.map((c) => `\\Process(*)\\${c}`), '-sc', '1'];
    const { stdout } = await run('typeperf', args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return parseTypeperf(stdout);
  }
  const { stdout } = await run('ps', ['-A', '-o', 'pid=,ppid=,rss=,comm=']);
  return parsePs(stdout);
}

/** pid -> CPU seconds for `pids`. */
export async function cpuSeconds(pids, platform = process.platform) {
  if (!pids.length) return new Map();
  if (platform === 'win32') {
    // One process a call: /V over every process reads every window title and takes seconds.
    const out = new Map();
    for (const pid of pids) {
      const { stdout } = await run('tasklist', ['/V', '/FO', 'CSV', '/FI', `PID eq ${pid}`], { windowsHide: true });
      out.set(pid, parseTasklistCpu(stdout).get(pid) ?? null);
    }
    return out;
  }
  const { stdout } = await run('ps', ['-o', 'pid=,times=', '-p', pids.join(',')]);
  return new Map(
    stdout
      .trim()
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .map(([pid, t]) => [Number(pid), cpuSecondsOf(t)]),
  );
}

const MB = 1024 * 1024;
const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

/**
 * @typedef {{ t: number, phase: string, pids: number[], total: number, workerd: number, peakSum: number | null }} Sample
 * One sample of the run's processes: their working sets summed (`total`), the workerd processes' alone (`workerd`),
 * and the sum of each process's own lifetime peak where the platform reports it.
 */

/** Folds one snapshot into a Sample of the processes under `roots`. */
export function sampleOf(rows, roots, phase, t) {
  const tree = treeOf(rows, roots);
  const sum = (pick) => tree.reduce((a, r) => a + (pick(r) ?? 0), 0);
  const peaks = tree.map((r) => r.peakWorkingSet);
  return {
    t,
    phase,
    pids: tree.map((r) => r.pid),
    total: sum((r) => r.workingSet),
    workerd: tree.filter((r) => /^workerd/i.test(r.name)).reduce((a, r) => a + r.workingSet, 0),
    peakSum: peaks.every((p) => p != null) && peaks.length ? peaks.reduce((a, p) => a + p, 0) : null,
  };
}

/**
 * Memory by phase, in MB: the median and the largest sample of the whole tree and of its workerd processes alone, and
 * at the last sample the sum of every process's own peak (its peak since it started, boot included).
 */
export function summarise(samples) {
  const phases = {};
  for (const phase of new Set(samples.map((s) => s.phase))) {
    const of = samples.filter((s) => s.phase === phase);
    phases[phase] = {
      samples: of.length,
      medianMB: median(of.map((s) => s.total)) / MB,
      maxMB: Math.max(...of.map((s) => s.total)) / MB,
      workerdMedianMB: median(of.map((s) => s.workerd)) / MB,
      workerdMaxMB: Math.max(...of.map((s) => s.workerd)) / MB,
    };
  }
  const last = samples.at(-1);
  return { phases, lifetimePeakSumMB: last?.peakSum != null ? last.peakSum / MB : null };
}

/**
 * Samples the processes under `roots()` every `everyMs` until stopped. `phase(name)` labels the samples that follow;
 * `cpu()` reads the tree's CPU seconds now. A sample that fails (typeperf busy) is skipped, never fatal to the run.
 */
export function createSampler({
  roots,
  everyMs = 5000,
  take = snapshot,
  readCpu = cpuSeconds,
  now = () => Date.now(),
}) {
  /** @type {Sample[]} */
  const samples = [];
  let phase = 'boot';
  let timer = null;
  let busy = false;
  let lastTree = [];
  const once = async () => {
    if (busy) return;
    busy = true;
    try {
      const s = sampleOf(await take(), roots(), phase, now());
      lastTree = s.pids;
      samples.push(s);
    } catch {
      // the next tick tries again
    } finally {
      busy = false;
    }
  };
  return {
    samples,
    once,
    start() {
      timer = setInterval(once, everyMs);
      return once();
    },
    phase(name) {
      phase = name;
    },
    /** The tree's pids and CPU seconds (null where a process's time could not be read). */
    async cpu() {
      await once();
      const pids = lastTree;
      const byPid = await readCpu(pids);
      const values = [...byPid.values()];
      return { pids, seconds: values.every((v) => v != null) ? values.reduce((a, v) => a + v, 0) : null };
    },
    stop() {
      clearInterval(timer);
      return summarise(samples);
    },
  };
}

/** The share of one core the tree used between two cpu() marks, or null when the tree changed between them (a restart
 *  loses the CPU time of the process it stopped). */
export function cpuShare(from, to, wallMs) {
  if (from.seconds == null || to.seconds == null) return null;
  if (from.pids.length !== to.pids.length || from.pids.some((p) => !to.pids.includes(p))) return null;
  return (to.seconds - from.seconds) / (wallMs / 1000);
}
