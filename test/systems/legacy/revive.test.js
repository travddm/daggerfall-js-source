// REVIVE - A DEATH TAKEN BACK. The law (src/systems/legacy/revived.js): a death taken back is stamped
// `revived: [diedAt]`, and every copy that meets the stamp drops THAT death with its remains row and its Succession.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revivedOf, stampRevived, dropRevived, takeRevived } from '../../../src/systems/legacy/revived.js';
import { mergeFacts } from '../../../src/systems/legacy/store.js';
import { mergeLines } from '../../../src/systems/legacy/realmLine.js';
import { readFamily } from '../../../src/systems/legacy/family.js';
import { mergeFamily } from '../../../src/scenes/legacyHost.js';

const F = `r${'f'.repeat(20)}`, H = `r${'e'.repeat(20)}`;
const LID = 'fam-abc-abcdef';
const DIED_AT = 999;

/** The line as the device writes it: Ysolde (F) the founder; dead of her years in Wayrest; then her heir Tlist (H). */
const fam = (rev, { died = false, heir = false, revived = false } = {}) => ({
  v: 1, id: LID, rev, surname: 'Hlaalu', model: 'enduring', nextId: heir ? 2 : 1, currentId: heir ? 1 : 0,
  people: [
    { id: 0, kind: 'member', given: 'Ysolde', characterId: F, parents: [], children: heir ? [1] : [], toll: 50, born: 1,
      ...(died ? { died: { at: DIED_AT, cause: 'years', place: { mode: 'dungeon', region: 'Wayrest', loc: 'Wayrest' }, by: null } } : {}),
      ...(revived ? { revived: [DIED_AT] } : {}) },
    ...(heir ? [{ id: 1, kind: 'member', given: 'Tlist', characterId: H, parents: [0], children: [], born: 1000 }] : []),
  ],
  remains: died ? [{ id: 'r0', of: 0, name: 'Ysolde Hlaalu', items: [], state: 'lying', by: null, at: DIED_AT }] : [],
  pending: died && !heir ? { fallenId: 0, at: DIED_AT, estate: 3000, bequest: [] } : null,
  houses: [{ regionIndex: 17, mapId: 4242, buildingKey: 7, location: 'Wayrest', by: heir && died ? 1 : 0, ...(heir && died ? { from: 0 } : {}) }],
});

// ── THE LAW ─────────────────────────────────────────────────────────────

test('REVIVE: a stamp drops THAT death - its remains row and its Succession with it - and no other: a later death, another member\'s, another line\'s remains stand (mutants: every death dropped; the remains kept; the Succession kept)', () => {
  const f = fam(3, { died: true });
  f.people.push({ id: 5, kind: 'member', given: 'Old', died: { at: 10, cause: 'years' }, parents: [], children: [] });
  f.remains.push({ id: 'r5', of: 5, at: 10, state: 'lying' });
  assert.equal(dropRevived(f), false, 'nothing stamped, nothing dropped');
  stampRevived(f.people[0], DIED_AT);
  stampRevived(f.people[0], DIED_AT);
  assert.deepEqual(revivedOf(f.people[0]), [DIED_AT], 'a stamp twice is one stamp');
  assert.equal(dropRevived(f), true);
  assert.equal(f.people[0].died, null);
  assert.deepEqual(f.remains.map((r) => r.id), ['r5'], 'her remains go, another\'s stay');
  assert.equal(f.pending, null);
  assert.ok(f.people[1].died, 'another member\'s death stands');
  const later = fam(3, { died: true, revived: true });
  later.people[0].died.at = DIED_AT + 500;
  later.remains[0].at = DIED_AT + 500; later.pending.at = DIED_AT + 500;
  assert.equal(dropRevived(later), false, 'a LATER death is another `at`, and stands');
  assert.ok(later.people[0].died && later.remains.length === 1 && later.pending);
});

test('REVIVE: every merge hears the stamp, whichever copy carries it and whichever is the base - a stale copy\'s death, remains and Succession are never taken back in (mutants: mergeFacts deaf; mergeFamily deaf with the store the base; readFamily drops the stamp)', () => {
  const stamped = fam(150, { heir: true, revived: true });
  const stale = fam(3, { died: true, heir: true });
  // the device's pull, both rev orders (realmLine.js mergeLines)
  for (const [a, b] of [[stale, stamped], [stamped, stale]]) {
    const kept = mergeLines(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    assert.equal(kept.people[0].died, null, 'the pull killed her again');
    assert.deepEqual(revivedOf(kept.people[0]), [DIED_AT]);
    assert.equal(kept.remains.length, 0);
  }
  // mergeFacts straight: the stamped copy the base, the stale one taken in
  const m = readFamily(JSON.parse(JSON.stringify(stamped)));
  mergeFacts(m, readFamily(JSON.parse(JSON.stringify(stale))));
  assert.equal(m.people[0].died, null);
  assert.equal(m.pending ?? null, null, 'the stale copy\'s Succession was taken in');
  // a stale STORE the base (the higher rev), the revived member's own save stamped: loading her plays her
  const store = readFamily(fam(200, { died: true, heir: true }));
  const save = readFamily(fam(1, { revived: true }));
  const loaded = mergeFamily(store, save, F);
  assert.equal(loaded.people.find((p) => p.characterId === F).died, null, 'her own save loaded her as the past');
  assert.deepEqual(readFamily(stamped).people[0].revived, [DIED_AT], 'the family reader dropped the stamp');
  assert.equal(takeRevived(null, stamped), false);
});

