// A port block's name by its index (getNewDFBlockName) answers what a scan of the registered blocks in registration
// order answers: the first name with that index, then a block family's name, then a mod's new block.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerPortBlock,
  registerPortBlockOf,
  registerPortBlockFamily,
  getNewDFBlockName,
  _resetWorldDataReplacement,
} from '../../../src/formats/worldData/worldDataReplacement.js';

type Registration = { name: string; index: number };

/** The answer a linear scan in registration order gives: a Map keeps a re-registered name in its first place. */
function scanAnswer(registrations: Registration[], index: number): string | null {
  const byName = new Map<string, number>();
  for (const r of registrations) byName.set(r.name, r.index);
  for (const [name, blockIndex] of byName) if (blockIndex === index) return name;
  return null;
}

const block = { Name: 'X', RmbBlock: null };

beforeEach(() => _resetWorldDataReplacement());

test('the first registered name with an index answers, as a scan does', () => {
  const registrations: Registration[] = [
    { name: 'A.RMB', index: 900001 },
    { name: 'B.RMB', index: 900002 },
    { name: 'C.RMB', index: 900001 },
    { name: 'D.RMB', index: 900003 },
  ];
  for (const r of registrations) registerPortBlock(r.name, block, r.index);
  for (const index of [900001, 900002, 900003, 900004, 0]) {
    assert.equal(getNewDFBlockName(index), scanAnswer(registrations, index), `index ${index}`);
  }
  assert.equal(getNewDFBlockName(900001), 'A.RMB');
});

test('a registration after a lookup is seen by the next lookup', () => {
  registerPortBlock('A.RMB', block, 900010);
  assert.equal(getNewDFBlockName(900011), null);
  registerPortBlockOf('B.RMB', () => null, 900011);
  assert.equal(getNewDFBlockName(900011), 'B.RMB');
});

test('a name registered again with a new index keeps its first place and answers the new index only', () => {
  const registrations: Registration[] = [
    { name: 'A.RMB', index: 900020 },
    { name: 'B.RMB', index: 900021 },
  ];
  for (const r of registrations) registerPortBlock(r.name, block, r.index);
  assert.equal(getNewDFBlockName(900020), 'A.RMB');
  registrations.push({ name: 'A.RMB', index: 900021 });
  registerPortBlock('A.RMB', block, 900021);
  for (const index of [900020, 900021]) {
    assert.equal(getNewDFBlockName(index), scanAnswer(registrations, index), `index ${index}`);
  }
  assert.equal(getNewDFBlockName(900021), 'A.RMB');
});

test('an index no port block holds falls to the block families', () => {
  registerPortBlock('A.RMB', block, 900030);
  registerPortBlockFamily({
    indexOf: (name: string) => (name === 'FAM.RMB' ? 900031 : -1),
    nameOf: (index: number) => (index === 900031 || index === 900030 ? 'FAM.RMB' : null),
    make: () => null,
  });
  assert.equal(getNewDFBlockName(900030), 'A.RMB');
  assert.equal(getNewDFBlockName(900031), 'FAM.RMB');
});

test('a reset with the assets forgets the port blocks', () => {
  registerPortBlock('A.RMB', block, 900040);
  assert.equal(getNewDFBlockName(900040), 'A.RMB');
  _resetWorldDataReplacement();
  assert.equal(getNewDFBlockName(900040), null);
});
