// The arm's animation slots below the upper body (src/combat/fpArm/animSlots.js) are compared with a recording of the
// code that was moved out of createFpArm unchanged (test/fixtures/mw/animSlotsParity.json): createFpArm driven at
// 1/60 s on the retail files through the 10a scripts and the slot scripts (animSlotsSweep.mjs), every slot of every
// tick. Needs MW_DATA_PATH; skips without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFpArm } from '../../../src/combat/fpArm.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { readRetailDeps } from '../fpAnimStateSweep.mjs';
import { recordSlotScripts } from './animSlotsSweep.mjs';

const FIXTURE = new URL('../../fixtures/mw/animSlotsParity.json', import.meta.url);
const dataPath = process.env.MW_DATA_PATH;

test(
  'animation slots, arm driven at 1/60 s on the retail files: every tick as recorded',
  { skip: !dataPath, timeout: 300000 },
  async () => {
    const log = console.log;
    console.log = () => {};
    let now;
    try {
      now = JSON.parse(
        JSON.stringify(await recordSlotScripts({ createFpArm, deps: readRetailDeps({ dataPath, fs, MwBsaFile }) })),
      );
    } finally {
      console.log = log;
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
