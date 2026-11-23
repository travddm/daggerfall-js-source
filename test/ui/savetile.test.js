// TILE1/TILE2 — THE SAVE TILE, PINNED WHERE IT THINKS.
//
//
// node cannot draw a tile, and test/ui/enhanced/enhancedChargen.test.js settled
// what that means here: pin the part that does arithmetic and MEASURE
// the drawn surface in a real browser (tools/saveTileProbe.mjs, 18
// checks, `npm run savetile`). The browser half is where the two real
// faults came from - `.tile` was already the inventory item icon's
// class, and a long slot name ran into a long character name - and
// neither is a thing a source sweep could see.
//
// What is here is what a node test can actually hold: the tile's own
// arithmetic, the fact that ONE tile now serves THREE panes, and the
// seams that make the whole thing drivable at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { saveTile, agoText, tileLine, tileWhen, initialOf, CLOUD_STATES, cloudStateOf, saveFromCard, newerBackup } from '../../src/ui/saveTile.js';
import { dateFromClassicMinutes, dateString } from '../../src/systems/gameDate.js';   // ACC2c: the two calls a LOCAL tile's date comes from, handed to the card's conversion so there is one reading of `gameTime`

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** A Document that does exactly what the tile asks of one - no more,
 *  because a stub that offers more than a Document does lets a call
 *  pass here and fail in a browser. */
function fakeDoc() {
  const make = (tag) => {
    const n = {
      tagName: tag.toUpperCase(), className: '', textContent: '', type: '', disabled: false,
      childNodes: [], onclick: null,
      append(...kids) { for (const k of kids) { k.parent = n; this.childNodes.push(k); } },
      remove() { const i = this.parent?.childNodes.indexOf(this); if (i >= 0) this.parent.childNodes.splice(i, 1); },
    };
    return n;
  };
  return { createElement: make };
}
const walk = (n, out = []) => { out.push(n); for (const k of n.childNodes ?? []) walk(k, out); return out; };
const byClass = (n, cls) => walk(n).filter((x) => String(x.className).split(' ').includes(cls));
const text = (n, cls) => byClass(n, cls)[0]?.textContent ?? null;

const SAVE = {
  name: 'Nystul', race: 'Breton', career: 'Battlemage', level: 12,
  health: 84, maxHealth: 120, gold: 14230,
  when: '17th of Hearthfire, 3E 405', hour: '21:40', saveName: 'QuickSave',
};

test('TILE1: the tile carries FACTS ABOUT A CHARACTER and no prose', () => {
  const t = saveTile(fakeDoc(), SAVE, { actions: [{ label: 'Load', primary: true }] });
  assert.equal(walk(t).find((n) => n.tagName === 'H3').textContent, 'Nystul');
  assert.equal(text(t, 'svsub'), 'Breton · Battlemage · level 12');
  assert.equal(text(t, 'svwhen'), '17th of Hearthfire, 3E 405 · 21:40');
  assert.equal(text(t, 'svslot'), 'QuickSave');
  const dd = walk(t).filter((n) => n.tagName === 'DD').map((n) => n.textContent);
  assert.deepEqual(dd, ['84 / 120', '14,230']);

});

test('TILE1: a missing field drops out rather than leaving a dangling separator', () => {
  assert.equal(tileLine({ race: 'Nord' }), 'Nord');
  assert.equal(tileLine({ race: 'Nord', level: 3 }), 'Nord · level 3');
  assert.equal(tileLine({ career: 'Bard' }), 'Bard');
  assert.equal(tileLine({}), '');
  assert.equal(tileLine(null), '');
  assert.equal(tileWhen({ when: 'x' }), 'x');
  assert.equal(tileWhen({}), '');
  // ...and a save with nothing on it at all still draws a tile rather
  // than throwing on the pane that lists it.
  const bare = saveTile(fakeDoc(), {}, {});
  assert.equal(walk(bare).find((n) => n.tagName === 'H3').textContent, 'Unnamed');
  assert.equal(saveTile(fakeDoc(), null, {}) && true, true);
});

test('TILE1: a tile with no portrait draws the character\'s INITIAL, and a promise never blocks the tile', async () => {
  const none = saveTile(fakeDoc(), SAVE, {});
  assert.equal(text(none, 'svinitial'), 'N', 'a letter reads as somebody; a hole reads as a broken image');
  assert.equal(initialOf({ name: '  ' }), '?');
  assert.equal(initialOf({}), '?');

  // A CANVAS HANDED IN DIRECTLY replaces the initial at once.
  const art = { tagName: 'CANVAS', className: '', childNodes: [], append() {} };
  const now = saveTile(fakeDoc(), SAVE, { face: art });
  assert.equal(byClass(now, 'svinitial').length, 0);
  assert.ok(walk(now).includes(art));

  // A PROMISE DOES NOT BLOCK THE TILE - the pane is on screen first and
  // the face lands later, because a list that waits on ten CIF reads is
  // a menu that opens late.
  let settle;
  const later = saveTile(fakeDoc(), SAVE, { face: new Promise((r) => { settle = r; }) });
  assert.equal(text(later, 'svinitial'), 'N', 'the tile is drawn before the art');
  settle(art);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(byClass(later, 'svinitial').length, 0, 'and the initial gives way when it lands');

  // A FACE THAT NEVER ARRIVES IS AN ORDINARY TILE, not a rejection that
  // escapes into the pane.
  const failed = saveTile(fakeDoc(), SAVE, { face: Promise.reject(new Error('no CIF')) });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(text(failed, 'svinitial'), 'N');
});

test('TILE2/ACC2: the cloud line, and the state that draws NONE of it', () => {
  // NO ACCOUNT, NO LINE. ACC0's wall is at cloud saves, and a player
  // who has not asked for one is not told about it on every tile.
  for (const cloud of [null, { state: 'off' }, {}]) {
    assert.equal(byClass(saveTile(fakeDoc(), SAVE, { cloud }), 'svcloud').length, 0, JSON.stringify(cloud));
  }
  // ACC2c appended `only` (a save whose ONLY copy is the backup), the same
  // way AUDIT-312 F2 appended `wait`: at the END, so nothing that reads this
  // list positionally moves, and named here so a seventh cannot arrive quietly.
  // FIELD 2026-09-27 appended `newer` (the backup is a later save of this slot) the same way.
  assert.deepEqual(CLOUD_STATES, ['off', 'none', 'saved', 'busy', 'bad', 'wait', 'only', 'newer']);

  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'none' } }), 'svsay'), 'Not backed up');
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'saved' } }), 'svsay'), 'Backed up');
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'saved', when: '2 hours ago' } }), 'svsay'), 'Backed up · 2 hours ago');
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'busy' } }), 'svsay'), 'Backing up…');

  // A REFUSAL IS THE SERVICE'S OWN SENTENCE, handed in: this file owns
  // no words about why a backup failed, which is what stops a second
  // sentence existing for a refusal accountClient.js already explains.
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'bad', why: 'Your cloud backup is full.' } }), 'svsay'), 'Your cloud backup is full.');
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'bad' } }), 'svsay'), 'Could not back up');
  // ...AND THE SAME FOR A WAIT (AUDIT-312 F2), which is a sentence to
  // read rather than a failure or a button.
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'wait', why: 'Load this save once, then it can be backed up.' } }), 'svsay'),
    'Load this save once, then it can be backed up.');
  // a state nobody knows is not a crash and is not "backed up"
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'frobnicated' } }), 'svsay'), 'Not backed up');
});

test('AUDIT-312 F3: the cloud line\'s STATE is decided where a pin can reach it', () => {
  // WHY THIS PIN EXISTS. This arithmetic lived inside
  // `ui/enhanced/enhancedMenu.js` - DOM, a boot, and nothing node can drive - so
  // the audit's mutation campaign put three mutants of it through the
  // WHOLE SUITE and all three survived: an unfinished upload reading as
  // a finished backup, a listing never re-asked after a push, and every
  // character's QuickSave sharing one slot key. Each is a thing a
  // player is told about their own saves.
  const now = 1_758_400_000;
  const card = { bytes: 4096, updatedAt: now - 7200 };

  // NO ACCOUNT, NO LINE - before anything else is asked.
  assert.deepEqual(cloudStateOf({ signedIn: false, characterId: 'c1', card, nowS: now }),
    { state: 'off', when: null, error: null });
  assert.equal(cloudStateOf({}).state, 'off');

  // A LEGACY CARD IS A WAIT, and it carries the WORD - the sentence
  // belongs to accountClient.js's one table.
  assert.deepEqual(cloudStateOf({ signedIn: true, characterId: null, nowS: now }),
    { state: 'wait', when: null, error: 'no-character' });

  // `bytes` STAYS 0 UNTIL THE DATA LANDS. A card alone is an upload
  // that died between the row and the blob, and reading it as a backup
  // is how a player trusts a restore that cannot happen.
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card: { bytes: 0, updatedAt: now }, nowS: now }).state, 'none');
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card: {}, nowS: now }).state, 'none');
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card: null, nowS: now }).state, 'none');

  const saved = cloudStateOf({ signedIn: true, characterId: 'c1', card, nowS: now });
  assert.deepEqual(saved, { state: 'saved', when: '2 hours ago', error: null });

  // BUSY WINS OVER A STALE REFUSAL: a retry in flight is not a failure,
  // and the failure it is retrying is the one still in the latch.
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card, busy: true, error: 'too-large', nowS: now }).state, 'busy');
  assert.deepEqual(cloudStateOf({ signedIn: true, characterId: 'c1', card, error: 'too-large', nowS: now }),
    { state: 'bad', when: null, error: 'too-large' });

});

test('TILE2: how long ago, in words a player reads at a glance', () => {
  const now = 1_758_400_000;
  assert.equal(agoText(now, now), 'just now');
  assert.equal(agoText(now - 89, now), 'just now');
  assert.equal(agoText(now - 120, now), '2 minutes ago');
  // ...and the SINGULAR is reachable. It was not: past the 90-second
  // threshold `Math.round(d / 60)` is never 1, so "1 minute ago" was a
  // branch nothing could ever produce. Found by writing the pin.
  assert.equal(agoText(now - 90, now), '1 minute ago');
  assert.equal(agoText(now - 119, now), '1 minute ago');
  assert.equal(agoText(now - 3600, now), '1 hour ago');
  assert.equal(agoText(now - 7200, now), '2 hours ago');
  assert.equal(agoText(now - 3600 * 23, now), '23 hours ago');
  assert.equal(agoText(now - 86400, now), '1 day ago');
  assert.equal(agoText(now - 86400 * 9, now), '9 days ago');
  // A CLOCK THAT RAN BACKWARDS IS NOT A NEGATIVE AGE. The service's
  // stamp and the browser's clock are two clocks, and they disagree.
  assert.equal(agoText(now + 500, now), 'just now');
  for (const bad of [null, undefined, NaN, '5', {}]) assert.equal(agoText(bad, now), '', String(bad));
});

test('TILE2: a disabled action is not wired, and the actions are the PANE\'S - the tile knows no pane', () => {
  let pressed = 0;
  const t = saveTile(fakeDoc(), SAVE, {
    actions: [
      { label: 'Load', primary: true, onClick: () => { pressed++; } },
      { label: 'Delete', onClick: () => { pressed += 10; } },
      { label: 'Nope', disabled: true, onClick: () => { pressed += 100; } },
    ],
  });
  const buttons = walk(t).filter((n) => n.tagName === 'BUTTON');
  assert.deepEqual(buttons.map((b) => b.textContent), ['Load', 'Delete', 'Nope']);
  assert.equal(buttons[0].className, 'act primary');
  assert.equal(buttons[1].className, 'act');
  assert.equal(buttons[2].disabled, true);
  assert.equal(buttons[2].onclick, null, 'a disabled button carries no handler at all');
  buttons[0].onclick(); buttons[1].onclick();
  assert.equal(pressed, 11);

});

// ── ACC2c: THE SAVE THAT IS ONLY IN THE CLOUD ─────────────────────────────────────────────────────
//
//
// ACC2 built the backup and nothing could read one back. `pullSlot` was
// written, pinned end to end against the real service, and had ZERO
// CALLERS - so a cleared browser or a second device showed an empty
// save list with the player's games sitting in R2 and nothing on screen
// admitting they existed.

test('ACC2c: a cloud card becomes a tile that INVENTS NOTHING - the card is smaller than a save and the tile says less, with no race, class, level, health, gold or portrait, because none of them was ever uploaded (mutants: a stat invented from a field the card does not carry; the date read as anything but classic minutes; the initial taken from the slot name)', () => {
  // THE CARD IS THE SERVICE'S OWN SHAPE. server-account/src/saves.js
  // keeps eleven columns and this is all of them that describe a game.
  const card = {
    characterId: 'ch-7', saveName: 'Before the lich',
    characterName: 'Nystul', gameTime: 523_000, realTime: 1_700_000_000_000,
    dfuVersion: '0.15.4', saveVersion: 1, bytes: 91_233, shotBytes: 4_100,
    createdAt: 1_700_000_000, updatedAt: 1_700_000_900,
  };
  const save = saveFromCard(card, dateFromClassicMinutes, dateString);

  // WHAT IT CARRIES: the two names, and the moment - derived by the
  // same two calls a local tile's date comes from, because `gameTime`
  // IS classic minutes (systems/save/saveSlots.js's SaveInfo typedef says
  // so of the field `pushSlot` copies up).
  assert.equal(save.name, 'Nystul');
  assert.equal(save.saveName, 'Before the lich');
  assert.equal(save.characterId, 'ch-7');
  const d = dateFromClassicMinutes(card.gameTime);
  assert.equal(save.when, dateString(d));
  assert.equal(save.hour, `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`);

  // WHAT IT MUST NOT: every field the upload never carried is ABSENT,
  // not zero and not a dash - a tile that prints `level 0` or
  // `0 / 0` has told a player a fact about a character nobody sent.
  for (const k of ['race', 'career', 'level', 'health', 'maxHealth', 'gold']) {
    assert.equal(save[k], undefined, `${k} was invented - the service never held one`);
  }
  // ...and the TILE degrades on its own, with no special case in the
  // drawing: no sub-line, no stats list, and the well's initial.
  const t = saveTile(fakeDoc(), save, { actions: [{ label: 'Download', primary: true }] });
  assert.equal(tileLine(save), '', 'the sub-line joins nothing');
  assert.equal(byClass(t, 'svsub').length, 0, 'and is never appended');
  assert.equal(walk(t).filter((n) => n.tagName === 'DL').length, 0, 'no stats list at all');
  assert.equal(text(t, 'svinitial'), 'N', 'the well falls back to the CHARACTER\'s initial, not the slot\'s');
  assert.equal(text(t, 'svwhen'), `${save.when} · ${save.hour}`);

  // A CARD FROM AN OLDER BUILD, OR ONE THAT NEVER HAD A DATE, is a
  // tile and not a crash - the same law `SaveInfo` states about its own
  // every-field-optional shape.
  const bare = saveFromCard({ characterId: 'c', saveName: 's' }, dateFromClassicMinutes, dateString);
  assert.equal(bare.name, 'Unnamed');
  assert.equal(bare.when, null);
  assert.equal(bare.hour, null);
  assert.equal(initialOf(bare), 'U');
});

test('ACC2c: `only` is its own cloud state and its own ladder - a card with no save under it cannot be asked the questions the local ladder asks, and the sentence says WHERE the save is rather than that it is safe (mutants: the only-arm folded into the local ladder; `only` saying "Backed up"; a busy or refused download swallowed by it)', () => {
  assert.ok(CLOUD_STATES.includes('only'), 'the state exists');
  const card = { characterId: 'c', saveName: 's', bytes: 900, updatedAt: 1000 };

  // THE LADDER IS WHOLE AND SEPARATE. Every rung of the local one is a
  // question about a local slot - whether it predates CHARID1, whether
  // its upload finished, whether it has been backed up at all - and
  // none is answerable here. So `local: false` answers `only` WITHOUT
  // consulting characterId at all.
  assert.deepEqual(
    cloudStateOf({ signedIn: true, card, local: false, nowS: 1120 }),
    { state: 'only', when: agoText(1000, 1120), error: null });
  assert.equal(
    cloudStateOf({ signedIn: true, card, local: false, characterId: null, nowS: 1120 }).state, 'only',
    'a card with no characterId is still a card - `wait` is a question about a LOCAL slot');

  // ...but the two things that are still true of it are kept: a
  // download in flight, and a refused one carrying the service's own
  // WORD rather than a sentence this file made up.
  assert.equal(cloudStateOf({ signedIn: true, card, local: false, busy: true }).state, 'busy');
  const bad = cloudStateOf({ signedIn: true, card, local: false, error: 'too-large' });
  assert.deepEqual([bad.state, bad.error], ['bad', 'too-large']);

  // NO ACCOUNT IS STILL NO LINE. `off` is the first rung for a reason -
  // ACC0's wall - and `local` may not step in front of it.
  assert.equal(cloudStateOf({ signedIn: false, card, local: false }).state, 'off');

  // AND THE DEFAULT IS LOCAL, so every caller written before this slice
  // reads exactly what it read.
  assert.deepEqual(
    cloudStateOf({ signedIn: true, characterId: 'c', card, nowS: 1120 }),
    { state: 'saved', when: agoText(1000, 1120), error: null });

  // THE SENTENCE. "Backed up" under a tile whose only copy IS the
  // backup tells a player they have two of something they have one of.
  const t = saveTile(fakeDoc(), { name: 'N' }, { cloud: { state: 'only', when: '2 minutes ago', actions: [] } });
  assert.equal(text(t, 'svsay'), 'Only in your backup · 2 minutes ago');
  assert.equal(byClass(t, 'svcloud')[0].className, 'svcloud is-only', 'and it wears its own class, so the skin can colour it apart from a backed-up local save');
  const noWhen = saveTile(fakeDoc(), { name: 'N' }, { cloud: { state: 'only', when: null, actions: [] } });
  assert.equal(text(noWhen, 'svsay'), 'Only in your backup');
});

test('FIELD 2026-09-27 (Masta_Fu): a backup that is a LATER save of this slot is `newer`, not "Backed up" - a different game minute, saved later; the same save, an older one or an unknown minute reads as it always read (mutants: the minute test dropped; the later test dropped or reversed; the state never asked)', () => {
  // HIS CASE: the PC's QuickSave at minute 1000, saved at T; the Mac restored it, played on to minute 2000 and
  // backed that up at T + 1 day. On the PC the backup matched the slot by identity and read "Backed up".
  const T = 1_758_400_000_000, day = 86_400_000;
  const pc = { gameTime: 1000, realTime: T };
  const mac = { bytes: 4096, gameTime: 2000, realTime: T + day, updatedAt: (T + day) / 1000 };
  assert.equal(newerBackup(mac, pc), true);
  const nowS = (T + day) / 1000 + 720;
  assert.deepEqual(cloudStateOf({ signedIn: true, characterId: 'c1', card: mac, localTime: pc, nowS }),
    { state: 'newer', when: '12 minutes ago', error: null }, 'his tile: the Mac\'s backup is ahead');

  // THE SAME SAVE IS NOT NEWER - SP1's identity is the game minute, and a clock that stamped the upload later changes
  // nothing about which game it is (the PC's own backup of its own save).
  assert.equal(newerBackup({ ...mac, gameTime: 1000 }, pc), false);
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card: { ...mac, gameTime: 1000 }, localTime: pc, nowS }).state, 'saved');
  // AN OLDER BACKUP is the ordinary case after playing on: this device's save is the later one by BOTH clocks, and
  // "Back up again" is the right press - it reads as it always did.
  assert.equal(newerBackup({ ...mac, gameTime: 500, realTime: T - day }, pc), false);
  assert.equal(newerBackup({ ...mac, gameTime: 500, realTime: T }, pc), false, 'saved at the same moment is not later');
  // LATER BY EITHER CLOCK (the pre-merge audit 0927b B6): a PC two hours fast reads the Mac's save as the earlier one by
  // the devices' clocks - but the world's minute says it is ahead, and that cannot be skewed
  assert.equal(newerBackup({ ...mac, realTime: T - 3_600_000 }, pc), true, 'a skewed clock: the game minute still names it');
  assert.equal(newerBackup({ ...mac, gameTime: 500 }, pc), true, 'a rolled-back game saved later: the upload over it still asks twice');
  // UNKNOWN IS NOT NEWER: a caller with no local time (every caller before this), or a card with no minute.
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card: mac, nowS }).state, 'saved');
  assert.equal(newerBackup({ bytes: 1, realTime: T + day }, pc), false);
  assert.equal(newerBackup(mac, { realTime: T }), false);
  // ...and the rungs above it still win: a push in flight, a refusal, an unfinished upload.
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card: mac, localTime: pc, busy: true }).state, 'busy');
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card: mac, localTime: pc, error: 'too-large' }).state, 'bad');
  assert.equal(cloudStateOf({ signedIn: true, characterId: 'c1', card: { ...mac, bytes: 0 }, localTime: pc }).state, 'none');

  // THE SENTENCE says which copy is ahead.
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'newer', when: '12 minutes ago' } }), 'svsay'), 'Newer backup · 12 minutes ago');
  assert.equal(text(saveTile(fakeDoc(), SAVE, { cloud: { state: 'newer' } }), 'svsay'), 'Newer backup');
  assert.equal(byClass(saveTile(fakeDoc(), SAVE, { cloud: { state: 'newer' } }), 'svcloud')[0].className, 'svcloud is-newer');
});
