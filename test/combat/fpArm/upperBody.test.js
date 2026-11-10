// The arm's upper body (src/combat/fpArm/upperBody.js) is compared with a recording of the code that was moved out of
// createFpArm unchanged (test/fixtures/mw/upperBodyParity.json): createFpArm driven at 1/60 s on the retail files through
// every earlier script and the upper-body scripts (upperBodySweep.mjs), its whole state each tick. Needs MW_DATA_PATH;
// skips without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFpArm } from '../../../src/combat/fpArm.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { readRetailDeps } from '../fpAnimStateSweep.mjs';
import { recordUpperScripts } from './upperBodySweep.mjs';

const FIXTURE = new URL('../../fixtures/mw/upperBodyParity.json', import.meta.url);
const dataPath = process.env.MW_DATA_PATH;

test(
  'upper body, arm driven at 1/60 s on the retail files: every tick as recorded',
  { skip: !dataPath, timeout: 400000 },
  async () => {
    const log = console.log;
    const warn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    let now;
    try {
      now = JSON.parse(
        JSON.stringify(await recordUpperScripts({ createFpArm, deps: readRetailDeps({ dataPath, fs, MwBsaFile }) })),
      );
    } finally {
      console.log = log;
      console.warn = warn;
    }
    if (process.env.RECORD_PARITY === '1') {
      fs.writeFileSync(FIXTURE, JSON.stringify(now));
      return;
    }
    const before = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    assert.deepEqual(Object.keys(now), Object.keys(before));
    for (const id of Object.keys(before)) {
      assert.equal(now[id].length, before[id].length, `${id}: tick count`);
      for (let i = 0; i < before[id].length; i++) assert.deepEqual(now[id][i], before[id][i], `${id}: tick ${i}`);
    }
  },
);
