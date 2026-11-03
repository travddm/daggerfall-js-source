// THE REGISTRY OF PSEUDO-ARCHIVES (world/pseudoArchives.js): no two entries overlap (the refusal AUDIT SD IV R6's
// collision wanted), every `*ARCHIVE*` constant past TEXTURE.511 in src/ is registered at its own value and owner and
// every registered constant still stands in its owner (swept both ways over the source), every string archive key the
// same, and the free-number pick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PSEUDO_ARCHIVES, PSEUDO_ARCHIVE_KEYS, PSEUDO_ARCHIVE_FLOOR,
  pseudoArchiveCollisions, pseudoArchiveOwner, pseudoArchiveFree,
} from '../../src/world/pseudoArchives.js';
import { LAST_CLASSIC_TEXTURE_ARCHIVE } from '../../src/scenes/dataPipeline.js';

const SRC = new URL('../../src/', import.meta.url).pathname;
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (f.endsWith('.js')) out.push(p); }
  return out;
}
/** Every `const NAME = <number>` and `const NAME = '<string>'` whose name says ARCHIVE (or an art key) in src/ - the sweep. */
function sweep() {
  const nums = [], keys = [];
  for (const p of walk(SRC)) {
    const rel = p.slice(SRC.length), text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/(?:export )?const ([A-Z0-9_]*ARCHIVE[A-Z0-9_]*) *= *([0-9_]+)\b/g)) {
      const v = Number(m[2].replace(/_/g, ''));
      if (v > PSEUDO_ARCHIVE_FLOOR && !/_MAX$|_MIN$/.test(m[1])) nums.push({ owner: rel, name: m[1], value: v });
    }
    for (const m of text.matchAll(/(?:export )?const ([A-Z0-9_]*(?:ARCHIVE|ART_KEY)[A-Z0-9_]*) *= *'([^']+)'/g)) if (m[2].length > 1) keys.push({ owner: rel, name: m[1], value: m[2] });
  }
  return { nums, keys };
}

test('EG-G2 THE REGISTRY (section 11.6): no two numbered pseudo-archives overlap; each lies past TEXTURE.511 (the floor is the data pipeline\'s own); the refusal finds a collision put in; the owner of a number and of a string key; the first free block past a number (mutants: an overlap unrefused; the floor moved; a free pick landing on a taken number)', () => {
  assert.equal(PSEUDO_ARCHIVE_FLOOR, LAST_CLASSIC_TEXTURE_ARCHIVE, 'the floor is Daggerfall\'s last texture archive');
  assert.deepEqual(pseudoArchiveCollisions(), [], 'no two entries overlap');
  for (const e of PSEUDO_ARCHIVES) { assert.ok(e.from > PSEUDO_ARCHIVE_FLOOR && e.to >= e.from, `${e.name}: past TEXTURE.511`); assert.ok(['port', 'mod', 'data', 'synthetic'].includes(e.kind)); }
  assert.equal(new Set(PSEUDO_ARCHIVE_KEYS.map((k) => k.key)).size, PSEUDO_ARCHIVE_KEYS.length, 'every string key once');
  // the refusal works: the large boat back on the Hour's number (AUDIT SD IV R6)
  const bad = [...PSEUDO_ARCHIVES, { from: 38151, to: 38151, owner: 'world/ships/largeBoatArt.js', name: 'LARGE_BOAT_ARCHIVE', kind: 'port', what: '' }];
  assert.deepEqual(pseudoArchiveCollisions(bad), [['SD_REALM_ARCHIVE:38151', 'LARGE_BOAT_ARCHIVE:38151']]);
  assert.deepEqual(pseudoArchiveCollisions([{ from: 10, to: 20, name: 'a' }, { from: 20, to: 25, name: 'b' }]).length, 1, 'a shared end is an overlap');
  assert.deepEqual(pseudoArchiveCollisions([{ from: 10, to: 20, name: 'a' }, { from: 21, to: 25, name: 'b' }]), [], 'touching is not');
  assert.equal(pseudoArchiveOwner(38151).name, 'SD_REALM_ARCHIVE');
  assert.equal(pseudoArchiveOwner(112370).name, 'ARCHIVE_FOOT', 'a block holds its middle');
  assert.equal(pseudoArchiveOwner('hcc').owner, 'scenes/horseCartPool.js');
  assert.equal(pseudoArchiveOwner(38194), null, 'a free number has no owner');
  assert.equal(pseudoArchiveFree(38150), 38150, 'a free number is its own pick');
  assert.equal(pseudoArchiveFree(38151), 38152, 'past the Hour\'s');
  assert.equal(pseudoArchiveFree(38231, 8), 38233, 'eight free after the harbour\'s and the lamp\'s');
  assert.equal(pseudoArchiveFree(38281, 18), 38303, "past the Witches' Festival's pictures (38291) and the Starfall's crater and Starglass (38301, 38302)");
  assert.equal(pseudoArchiveOwner(pseudoArchiveFree(1)), null);
});

test('EG-G2 THE REGISTRY, SWEPT BOTH WAYS: every `*ARCHIVE*` number past TEXTURE.511 in src/ is registered at its own value under its own owner, and every string archive key; every registered constant stands in its owner at the registry\'s value (mutants: a constant moved and the registry not; an entry naming a constant its owner lost)', () => {
  const { nums, keys } = sweep();
  assert.ok(nums.length >= 25 && keys.length >= 5, `${nums.length} numbers and ${keys.length} keys swept`);
  for (const n of nums) {
    const e = PSEUDO_ARCHIVES.find((q) => q.owner === n.owner && q.name === n.name);
    assert.ok(e, `${n.owner} ${n.name} = ${n.value} is registered`);
    assert.equal(e.from, n.value, `${n.name}: the registry's number is its owner's`);
  }
  for (const k of keys) {
    const e = PSEUDO_ARCHIVE_KEYS.find((q) => q.owner === k.owner && q.name === k.name);
    assert.ok(e, `${k.owner} ${k.name} = '${k.value}' is registered`);
    assert.equal(e.key, k.value);
  }
  // both ways: each registered entry is a constant its owner holds
  for (const e of PSEUDO_ARCHIVES) assert.ok(nums.some((n) => n.owner === e.owner && n.name === e.name && n.value === e.from), `${e.owner} still holds ${e.name} = ${e.from}`);
  for (const e of PSEUDO_ARCHIVE_KEYS) assert.ok(keys.some((k) => k.owner === e.owner && k.name === e.name && k.value === e.key), `${e.owner} still holds ${e.name}`);
});
