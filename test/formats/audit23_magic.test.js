// AUDIT 23 fix pins, wave 3: the magic cluster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSpellsStd, SPELL_RECORD_SIZE } from '../../src/formats/spellsStd.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** One synthetic 89-byte SPELLS.STD record. */
const record = ({ index, e0type, e0sub }) => {
  const b = new Uint8Array(SPELL_RECORD_SIZE);
  const v = new DataView(b.buffer);
  v.setInt8(0, e0type); v.setInt8(1, e0sub);
  v.setInt8(2, -1); v.setInt8(3, -1); v.setInt8(4, -1); v.setInt8(5, -1);
  b[73] = index;
  return b;
};

test('AUDIT 23 magic-1: the classic Free Action patch - spell 10 (3,2) reads as (26,-1)', () => {
  // EntityEffectBroker.cs:892-900: "Fix bad Free Action spell data
  // from SPELLS.STD at runtime" - index 10, effect 0 only, and only
  // when the bytes really say Cure Paralyzation.
  const bytes = new Uint8Array(3 * SPELL_RECORD_SIZE);
  bytes.set(record({ index: 10, e0type: 3, e0sub: 2 }), 0);
  bytes.set(record({ index: 11, e0type: 3, e0sub: 2 }), SPELL_RECORD_SIZE);      // another spell with the same bytes: untouched
  bytes.set(record({ index: 10, e0type: 5, e0sub: 1 }), 2 * SPELL_RECORD_SIZE); // index 10 with DIFFERENT bytes: untouched
  const spells = readSpellsStd(bytes);
  assert.equal(spells[0].effects[0].type, 26);
  assert.equal(spells[0].effects[0].subType, -1);
  assert.deepEqual([spells[1].effects[0].type, spells[1].effects[0].subType], [3, 2]);
  assert.deepEqual([spells[2].effects[0].type, spells[2].effects[0].subType], [5, 1]);
});

test('AUDIT 23 magic-1: the real SPELLS.STD spell 10 is Free Action after the patch', (t) => {
  if (!process.env.ARENA2_PATH) return t.skip('ARENA2_PATH not set');
  const spells = readSpellsStd(new Uint8Array(readFileSync(join(process.env.ARENA2_PATH, 'SPELLS.STD'))));
  const ten = spells.find((s) => s.index === 10);
  assert.equal(ten.name, 'Free Action');
  assert.equal(ten.effects[0].type, 26);
  assert.equal(ten.effects[0].subType, -1);
});

