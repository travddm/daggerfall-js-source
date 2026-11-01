// AUDIT CARDS-5 lane C's aside: two books are two keys on the hotbar (systems/quickslots.js quickslotKey -
// a book's own text), and a book slotted under the old bare key is found again by its title.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('AUDIT CARDS-5 C3 (lane C\'s aside): two books are two keys on the bar, and a book slotted under the old bare key is found again by its title', async () => {
  const q = await import('../../../src/systems/quickslots.js');
  const { itemLongName } = await import('../../../src/systems/item/itemInfo.js');
  const book = (message) => ({ group: 'Books', templateIndex: 277, name: 'Book', message, stackCount: 1 });
  const other = book(7), doors = book(417);   // 417: a port book, titled without the game's data
  assert.notEqual(q.quickslotKey(other), q.quickslotKey(doors), 'a book is keyed by its text');
  assert.equal(q.quickslotKey({ group: 'Books', templateIndex: 277 }), 'Books|277|||||||', 'a record with no text keeps the bare key');
  const title = itemLongName(doors);
  assert.notEqual(title, itemLongName(other));
  const old = q.quickslotKey({ ...doors, message: undefined });
  q.restoreQuickslotSaveData({ hotbar: [{ type: 'item', kind: 'use', key: old, name: title }] });
  const view = q.hotbarView({ items: [other, doors] });
  assert.equal(view[0].item, doors, 'the titled book, not the first book in the pack');
  assert.equal(q.quickslotSaveData().hotbar[0].key, q.quickslotKey(doors), 'and saved under its new key');
  q.restoreQuickslotSaveData({ hotbar: [{ type: 'item', kind: 'use', key: old, name: 'A Title Not Carried' }] });
  assert.equal(q.hotbarView({ items: [other, doors] })[0].ghost, true, 'a title not carried stays a ghost');
  q.clearQuickslots();
});
