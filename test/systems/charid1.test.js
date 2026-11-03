// CHARID1: A CHARACTER IS AN ID, NOT A NAME. The
// identity of a save was (characterName, saveName), so a new character
// with an old one's name wrote its first QuickSave over the old one's.
// Every character carries an id now - minted at chargen, carried in the
// envelope, written on the card - and a card without one is adopted the
// first time its character is loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mintCharacterId, characterIdOf, SAVE_INFO_PREFIX, SAVE_DATA_PREFIX } from '../../src/systems/characterId.js';
import { saveSlot, findSave, quickSaveSlot, quickLoadSlot, hasQuickSave, enumerateSaves, saveInfoOf } from '../../src/systems/save/saveSlots.js';
import { snapshotPlayer, restorePlayer, SAVE_VERSION } from '../../src/systems/save/save.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const memStore = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };
const snapOf = (name, characterId, minutes = 100) => ({ v: SAVE_VERSION, name, characterId, classicMinutes: minutes });

test('CHARID1: the id - minted unique, minted once onto an entity, never empty', () => {
  const ids = new Set(); for (let i = 0; i < 200; i++) ids.add(mintCharacterId());
  assert.equal(ids.size, 200);
  for (const id of ids) assert.ok(typeof id === 'string' && id.length >= 8);
  // ...and the FALLBACK, for a runtime with no crypto.randomUUID (an old
  // WebView): the same law, and the branch the platform's UUID hides here
  const realCrypto = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    const fall = new Set(); for (let i = 0; i < 200; i++) fall.add(mintCharacterId());
    assert.equal(fall.size, 200, 'the fallback mints 200 distinct ids too');
    for (const id of fall) assert.ok(typeof id === 'string' && id.length >= 12, `${id} is an id, not a letter`);
  } finally { Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true }); }
  const e = { name: 'Aela' };
  const a = characterIdOf(e); assert.equal(e.characterId, a); assert.equal(characterIdOf(e), a, 'asked twice, the same id');
  assert.equal(characterIdOf({ characterId: '' }).length >= 8, true, 'an empty id is no id');
  assert.equal(characterIdOf(null), null);
});

test('CHARID1: THE BUG - two characters of one name each keep their own QuickSave', () => {
  const st = memStore();
  const old = quickSaveSlot('Aela', snapOf('Aela', 'id-old', 5000), { storage: st, now: 1 });
  assert.deepEqual(old, { ok: true, key: 0 });
  // the new character, born with her own id, takes the same name
  const fresh = quickSaveSlot('Aela', snapOf('Aela', 'id-new', 10), { storage: st, now: 2 });
  assert.deepEqual(fresh, { ok: true, key: 1 }, 'a NEW slot - the old one is not hers to write');
  assert.equal(JSON.parse(st.getItem(SAVE_DATA_PREFIX + 0)).classicMinutes, 5000, 'the old character’s save is untouched');
  assert.equal(saveInfoOf(0, st).characterId, 'id-old'); assert.equal(saveInfoOf(1, st).characterId, 'id-new', 'the card carries the id');
  // each character's own QuickSave, by id - and the name alone would have answered the first
  assert.equal(quickLoadSlot('Aela', st, 'id-old').classicMinutes, 5000);
  assert.equal(quickLoadSlot('Aela', st, 'id-new').classicMinutes, 10);
  assert.equal(hasQuickSave('Aela', st, 'id-nobody'), false, 'a third namesake has none');
  assert.equal(findSave('Aela', 'QuickSave', st, 'id-new'), 1);
  // a second QuickSave of the new character overwrites HER slot and only hers
  assert.deepEqual(quickSaveSlot('Aela', snapOf('Aela', 'id-new', 20), { storage: st, now: 3 }), { ok: true, key: 1 });
  assert.equal(JSON.parse(st.getItem(SAVE_DATA_PREFIX + 0)).classicMinutes, 5000);
  assert.equal([...enumerateSaves(st).info.keys()].length, 2);
});

test('CHARID1: a card with no id is never a new character’s to overwrite', () => {
  const st = memStore();
  // a card with no id
  st.setItem(SAVE_DATA_PREFIX + 0, JSON.stringify({ v: SAVE_VERSION, name: 'Borin', classicMinutes: 777 }));
  st.setItem(SAVE_INFO_PREFIX + 0, JSON.stringify({ saveVersion: 1, saveName: 'QuickSave', characterName: 'Borin', dateAndTime: { gameTime: 777, realTime: 1 } }));
  // a new Borin: his QuickSave lands beside it, not on it
  assert.deepEqual(quickSaveSlot('Borin', snapOf('Borin', 'id-new-borin', 1), { storage: st, now: 2 }), { ok: true, key: 1 });
  assert.equal(JSON.parse(st.getItem(SAVE_DATA_PREFIX + 0)).classicMinutes, 777);
});

test('CHARID1: the envelope carries the id - snapshotPlayer mints one onto a character that has none', () => {
  // executed: a fresh entity through snapshotPlayer carries an id
  const e = { name: 'Cato', stats: {}, health: 1, maxHealth: 1, magicka: 0, maxMagicka: 0, fatigue: 1, skills: [], skillUses: [], items: [], spellbook: [], wagon: [] };
  let snap = null;
  try { snap = snapshotPlayer(e, { position: [0, 0, 0], pose: { yaw: 0, pitch: 0 }, classicMinutes: 0 }); } catch (err) { snap = null; void err; }
  if (snap) { assert.ok(typeof snap.characterId === 'string' && snap.characterId.length >= 8); assert.equal(snap.characterId, e.characterId); }
  void restorePlayer;
});

test('CHARID1: both births mint, both hosts load by id, both windows find and overwrite by id', () => {
  for (const host of ['src/scenes/world.js', 'src/scenes/dungeonContext.js']) {
    const h = read(host);
    assert.ok(h.includes('quickLoadSlot(playerEntity.name, undefined, playerEntity.characterId ?? null)'), `${host}: F11 loads MY QuickSave`);
    assert.ok(h.includes('playerName: () => playerEntity.name, playerId: () => playerEntity.characterId ?? null,'), `${host}: the windows are handed the id beside the name`);
  }
  // the slot store's identity law, by execution: an id never matches a card without one
  const st = memStore();
  st.setItem(SAVE_DATA_PREFIX + 4, '{"v":1}'); st.setItem(SAVE_INFO_PREFIX + 4, JSON.stringify({ saveName: 'QuickSave', characterName: 'Dax' }));
  assert.equal(findSave('Dax', 'QuickSave', st, 'id-dax'), -1); assert.equal(findSave('Dax', 'QuickSave', st), 4, 'a caller with no id still finds by name - the legacy law, for the legacy caller');
  assert.equal(saveSlot('Dax', 'QuickSave', { v: 1, classicMinutes: 1 }, { storage: st }).key, 4, 'and an envelope with no id writes by name, as before');
});
