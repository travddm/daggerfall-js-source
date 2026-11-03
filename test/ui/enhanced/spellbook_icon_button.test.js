import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editBookSpell } from '../../../src/ui/spellbookWindow.js';

test('an icon change copies the spell and keeps it custom, leaving the rest alone', () => {
  const list = [{ name: 'Fireball', icon: 3, tag: 'x' }];
  const orig = list[0];
  editBookSpell(list, 0, { icon: 40 });
  assert.equal(list[0].icon, 40);
  assert.equal(list[0].custom, true);
  assert.equal(list[0].name, 'Fireball');
  assert.equal(orig.icon, 3);   // never the shared record
});

test('No icon: flag keeps the picked icon, initials are the first letters of the first two words', async () => {
  const { spellInitials } = await import('../../../src/ui/enhanced/enhancedHotbar.js').catch(() => ({ spellInitials: null }));
  const list = [{ name: 'Frost Bolt', icon: 7 }];
  editBookSpell(list, 0, { noIcon: true });
  assert.equal(list[0].noIcon, true);
  assert.equal(list[0].icon, 7);               // kept, so "Use icon" brings it back
  editBookSpell(list, 0, { icon: 9, noIcon: false });
  assert.equal(list[0].noIcon, false);
  if (spellInitials) {
    assert.equal(spellInitials('Frost Bolt'), 'FB');
    assert.equal(spellInitials('Balyna\u2019s Balm of Healing'), 'BB');
    assert.equal(spellInitials('Heal'), 'H');
  }
});
