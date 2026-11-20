// The load harness's process sampler (tools/lib/process-sampler.mjs): typeperf and tasklist read, the run's tree found
// by parent links, and memory and CPU folded by phase. The commands themselves are not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  csvFields,
  parseTypeperf,
  parsePs,
  treeOf,
  cpuSecondsOf,
  parseTasklistCpu,
  sampleOf,
  summarise,
  createSampler,
  cpuShare,
} from '../../tools/lib/process-sampler.mjs';

const COUNTERS = [
  'ID Process',
  'Creating Process ID',
  'Elapsed Time',
  'Working Set',
  'Working Set - Private',
  'Working Set Peak',
];
const MB = 1024 * 1024;

/** typeperf's CSV for `instances`: [name, pid, ppid, ageS, workingSetMB]. */
function typeperfCsv(instances) {
  const header = ['(PDH-CSV 4.0)'];
  const values = ['11/19/2026 16:41:27.703'];
  for (const counter of COUNTERS) {
    for (const [name, pid, ppid, age, wsMB] of instances) {
      header.push(`\\\\HOST\\Process(${name})\\${counter}`);
      const v = {
        'ID Process': pid,
        'Creating Process ID': ppid,
        'Elapsed Time': age,
        'Working Set': wsMB * MB,
        'Working Set - Private': (wsMB * MB) / 2,
        'Working Set Peak': wsMB * MB * 2,
      }[counter];
      values.push(v.toFixed(6));
    }
  }
  const line = (fields) => fields.map((f) => `"${f}"`).join(',');
  return ['', line(header), line(values), 'Exiting, please wait...'].join('\r\n');
}

test('csv fields are read with quotes doubled inside them', () => {
  assert.deepEqual(csvFields('"a","b ""c""","",d'), ['a', 'b "c"', '']);
});

test('typeperf rows: one per instance, the #n suffix dropped from the name, _Total and Idle left out', () => {
  const rows = parseTypeperf(
    typeperfCsv([
      ['workerd', 10, 1, 5, 80],
      ['node#1', 11, 1, 9, 300],
      ['_Total', 0, 0, 0, 9000],
      ['Idle', 0, 0, 0, 0],
    ]),
  );
  assert.deepEqual(
    rows.map((r) => [r.name, r.pid, r.ppid, r.ageS, r.workingSet / MB, r.peakWorkingSet / MB]),
    [
      ['workerd', 10, 1, 5, 80, 160],
      ['node', 11, 1, 9, 300, 600],
    ],
  );
});

test('ps rows give the resident set in bytes', () => {
  assert.deepEqual(parsePs(' 10   1  2048 workerd\n'), [
    {
      pid: 10,
      ppid: 1,
      name: 'workerd',
      workingSet: 2048 * 1024,
      privateBytes: null,
      peakWorkingSet: null,
      ageS: null,
    },
  ]);
});

test('the tree follows parent links from the roots and leaves out a child older than its parent (a reused pid)', () => {
  const rows = [
    { pid: 10, ppid: 1, ageS: 60, name: 'node' },
    { pid: 11, ppid: 10, ageS: 50, name: 'node' },
    { pid: 12, ppid: 11, ageS: 40, name: 'workerd' },
    { pid: 13, ppid: 10, ageS: 9000, name: 'msedge' },
    { pid: 14, ppid: 99, ageS: 5, name: 'other' },
  ];
  assert.deepEqual(
    treeOf(rows, [10]).map((r) => r.pid),
    [10, 11, 12],
  );
  assert.deepEqual(treeOf(rows, [404]), []);
});

test('CPU time: h:mm:ss and whole seconds', () => {
  assert.equal(cpuSecondsOf('0:11:54'), 714);
  assert.equal(cpuSecondsOf('125'), 125);
  assert.equal(cpuSecondsOf('n/a'), null);
  const csv =
    '"Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"\r\n"workerd.exe","10","Console","1","80 K","Running","x","0:01:05","N/A"';
  assert.deepEqual([...parseTasklistCpu(csv)], [[10, 65]]);
});

test('a sample sums the tree, the workerd processes alone, and the lifetime peaks', () => {
  const rows = parseTypeperf(
    typeperfCsv([
      ['node', 10, 1, 60, 300],
      ['workerd', 12, 10, 50, 100],
      ['workerd#1', 13, 10, 50, 50],
      ['chrome', 14, 1, 70, 900],
    ]),
  );
  const s = sampleOf(rows, [10], 'play', 7);
  assert.equal(s.total / MB, 450);
  assert.equal(s.workerd / MB, 150);
  assert.equal(s.peakSum / MB, 900);
  assert.deepEqual(s.pids, [10, 12, 13]);
});

test('the summary gives each phase its median and largest sample, and the last sample its peaks', () => {
  const at = (phase, total, workerd) => ({
    t: 0,
    phase,
    pids: [1],
    total: total * MB,
    workerd: workerd * MB,
    peakSum: 999 * MB,
  });
  const m = summarise([at('idle', 100, 80), at('play', 200, 150), at('play', 300, 250), at('play', 250, 200)]);
  assert.deepEqual(m.phases.idle, { samples: 1, medianMB: 100, maxMB: 100, workerdMedianMB: 80, workerdMaxMB: 80 });
  assert.deepEqual(m.phases.play, { samples: 3, medianMB: 250, maxMB: 300, workerdMedianMB: 200, workerdMaxMB: 250 });
  assert.equal(m.lifetimePeakSumMB, 999);
});

test("the sampler labels samples by phase, skips a failed snapshot, and reads the tree's CPU", async () => {
  let fail = false;
  const take = async () => {
    if (fail) throw new Error('typeperf busy');
    return [
      { pid: 5, ppid: 1, ageS: 1, name: 'workerd', workingSet: 10 * MB, privateBytes: null, peakWorkingSet: null },
    ];
  };
  const sampler = createSampler({ roots: () => [5], take, readCpu: async (pids) => new Map(pids.map((p) => [p, 42])) });
  sampler.phase('idle');
  await sampler.once();
  fail = true;
  await sampler.once();
  fail = false;
  sampler.phase('play');
  const cpu = await sampler.cpu();
  assert.deepEqual(cpu, { pids: [5], seconds: 42 });
  assert.deepEqual(
    sampler.samples.map((s) => s.phase),
    ['idle', 'play'],
  );
  assert.equal(sampler.stop().phases.play.medianMB, 10);
});

test('the CPU share is the seconds used over the wall time, and none when the tree changed (a restart)', () => {
  assert.equal(cpuShare({ pids: [1, 2], seconds: 10 }, { pids: [2, 1], seconds: 70 }, 600_000), 0.1);
  assert.equal(cpuShare({ pids: [1], seconds: 10 }, { pids: [3], seconds: 70 }, 600_000), null);
  assert.equal(cpuShare({ pids: [1], seconds: null }, { pids: [1], seconds: 70 }, 600_000), null);
});
