// SEA-VAULTS: the vault halls' foes (systems/sea/vaultFoes.js) - the low tiers swapped for the ring's high tier, a water
// marker kept a water foe, the human classes kept, and the pick pure so every client builds the same hall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaultFoes, vaultKeeps, VAULT_FOES } from '../../../src/systems/sea/vaultFoes.js';

const layout = [
  { mobileType: 0 },
  { mobileType: 3 },
  { mobileType: 11 },
  { mobileType: 131 },
  { mobileType: 32 },
  { mobileType: 17 },
];

test("a vault's foes: the low tiers swapped for the ring's high tier, a water marker for a water foe, the human classes and the high tiers kept", () => {
  const shallows = vaultFoes(layout, 1, 7428544);
  const abyss = vaultFoes(layout, 4, 7428544);
  for (const list of [shallows, abyss])
    for (const e of list) assert.ok(vaultKeeps(e.mobileType), `no low tier: ${e.mobileType}`);
  assert.ok(VAULT_FOES.water.includes(shallows[2].mobileType), 'mobileType 11 is a water marker: it keeps a water foe');
  assert.equal(shallows[3].mobileType, 131, 'a human class is kept');
  assert.equal(shallows[4].mobileType, 32, 'a high tier is kept');
  assert.equal(shallows[3].vaultSwapped, undefined, 'a kept foe is not marked swapped');
  const swapped = abyss.filter((e) => e.vaultSwapped && !VAULT_FOES.water.includes(e.mobileType));
  assert.ok(swapped.length > 0, 'something was swapped');
  for (const e of swapped) assert.ok(VAULT_FOES[4].includes(e.mobileType), "the Abyss draws the Abyss's tier");
  for (const e of shallows.filter((x) => x.vaultSwapped && !VAULT_FOES.water.includes(x.mobileType)))
    assert.ok(VAULT_FOES[1].includes(e.mobileType), 'the Shallows draw theirs');
});

test("the pick is pure by the vault's id: the same vault, the same foes on every client; another vault, another draw; the input is not changed", () => {
  const frozen = layout.map((e) => ({ ...e }));
  const once = vaultFoes(layout, 3, 7428544);
  assert.deepEqual(once, vaultFoes(layout, 3, 7428544));
  assert.deepEqual(layout, frozen, "the layout's records are copied, never edited");
  const other = vaultFoes(
    Array.from({ length: 40 }, () => ({ mobileType: 0 })),
    3,
    99,
  );
  const same = vaultFoes(
    Array.from({ length: 40 }, () => ({ mobileType: 0 })),
    3,
    7428544,
  );
  assert.notDeepEqual(
    other.map((e) => e.mobileType),
    same.map((e) => e.mobileType),
    'another vault draws other foes',
  );
  assert.deepEqual(vaultFoes(null, 1, 1), [], 'no layout, no foes');
});

test('a ring out of range is clamped to the nearest tier', () => {
  const low = vaultFoes([{ mobileType: 0 }], 0, 5)[0].mobileType;
  const one = vaultFoes([{ mobileType: 0 }], 1, 5)[0].mobileType;
  const high = vaultFoes([{ mobileType: 0 }], 9, 5)[0].mobileType;
  const four = vaultFoes([{ mobileType: 0 }], 4, 5)[0].mobileType;
  assert.equal(low, one, 'ring 0 reads as the Shallows');
  assert.equal(high, four, 'a ring past the four reads as the Abyss');
});
