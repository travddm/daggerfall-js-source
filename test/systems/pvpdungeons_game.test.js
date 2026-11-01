// The owner's game changes: the pure laws under them - Heal Curse, the rest's warning, the hands swapped, Gothway Garden's
// side boards, the dungeons' respawn and the spellbook kept (KEEP-SPELLBOOK).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startInfection, INFECTION, liveInfections } from '../../src/systems/infection.js';
import { curseOf, healCurseOffer, healCursePaid, healCursePrice, HEAL_CURSE_BASE } from '../../src/systems/healCurse.js';
import { restAilmentLines } from '../../src/systems/rest/restWarning.js';
import { readFileSync } from 'node:fs';
import { equipItem, swapHands, canSwapHands, equipTableOf, EQUIP_SLOTS } from '../../src/systems/equip.js';
import { gothwayNorthSpots, isGothwayGarden } from '../../src/systems/gothwayBoards.js';
import { planStore, REFUSAL, isKeptSpellbook } from '../../src/systems/item/itemTransfer.js';   // KEEP-SPELLBOOK
import { shiftDrop } from '../../src/systems/physicalItems.js';
import { setLocked } from '../../src/systems/item/itemLock.js';
import { assignStartingGear } from '../../src/systems/startingGear.js';
import { NativeTradeWindow } from '../../src/ui/native/nativeTrade.js';
import { mountEnhancedTrade } from '../../src/ui/enhanced/enhancedTrade.js';
import { tabAccepts } from '../../src/ui/native/nativeInventory.js';
import { withDom } from '../invdrag.mjs';

test('HEAL-CURSE: the curse in the blood lifted for the temple\'s price, the turn cancelled; nothing to lift, no offer; short of gold, nothing taken', () => {
  const e = { name: 'T', isPlayer: true, level: 5, goldPieces: 20000, activeEffects: [], items: [] };
  assert.equal(healCurseOffer(e).kind, 'none');
  startInfection(e, INFECTION.Werewolf, { day: 3 });
  e.timeToBecomeVampireOrWerebeast = 5;
  assert.deepEqual(curseOf(e), { vampire: false, were: false, blood: 1 });
  const cost = healCursePrice({ priceAdjustment: 1000, quality: 10 });
  assert.equal(cost, HEAL_CURSE_BASE, 'an average temple asks the base');
  const poor = { ...e, goldPieces: 10, activeEffects: e.activeEffects };
  assert.equal(healCursePaid(poor, { priceAdjustment: 1000, quality: 10 }).kind, 'notEnoughGold');
  assert.equal(liveInfections(poor).length, 1, 'nothing lifted on credit');
  const r = healCursePaid(e, { priceAdjustment: 1000, quality: 10 });
  assert.equal(r.kind, 'lifted');
  assert.equal(e.goldPieces, 20000 - cost);
  assert.equal(liveInfections(e).length, 0, 'the blood clean');
  assert.equal(e.timeToBecomeVampireOrWerebeast, 0, 'the turn cancelled');
  assert.ok(healCursePrice({ priceAdjustment: 1000, quality: 20 }) < healCursePrice({ priceAdjustment: 1000, quality: 0 }), 'a finer temple asks less');
});

test('REST-WARN: poisoned, diseased or both, the rest asks first and says which; a curse in the blood is not a disease here; well, nothing', () => {
  assert.equal(restAilmentLines({ activeEffects: [] }), null);
  assert.match(restAilmentLines({ activeEffects: [{ kind: 'poison' }] })[0], /^You are poisoned\.$/);
  assert.match(restAilmentLines({ activeEffects: [{ kind: 'disease' }] })[0], /^You are diseased\.$/);
  assert.match(restAilmentLines({ activeEffects: [{ kind: 'poison' }, { kind: 'disease' }] })[0], /poisoned and diseased/);
  assert.equal(restAilmentLines({ activeEffects: [{ kind: 'disease', infection: 'Werewolf-Infection' }] }), null);
  assert.equal(restAilmentLines({ activeEffects: [{ kind: 'poison', ended: true }] }), null);
  assert.deepEqual(restAilmentLines({ activeEffects: [{ kind: 'poison' }] }), ['You are poisoned.', 'Resting will not cure it.', 'Rest anyway?']);
});

test('REST-WARN in THE FOUR HOSTS: the street\'s, a building\'s, a dungeon\'s and the fixed city\'s rest each ask before the window - its Yes the one way to it, nothing ailing the window at once', () => {
  const asks = /(?:const|, ) ?restNow = \(\) => [\s\S]{0,300}?createRestWindow\([^\n]*\n(?:[^\n]*\n){0,2}?\s*const ail = restAilmentLines\(playerEntity\);\s*\n\s*if \(ail\) \{[^\n]*new DecisionBoxWindow\(\{ rows: ail,[^\n]*return; \}\s*\n\s*restNow\(\);/;
  for (const host of ['world.js', 'worldModes.js', 'dungeonContext.js', 'exterior.js']) {
    const src = readFileSync(new URL(`../../src/scenes/${host}`, import.meta.url), 'utf8');
    assert.match(src, asks, `${host}: the rest asks first (exterior.js - the fixed city - was the host left out)`);
    assert.match(src, /import \{ restAilmentLines \} from '\.\.\/systems\/rest\/restWarning\.js';/, `${host}: the one law`);
  }
});

test('SWAP-HANDS: two one-handers trade hands; one crosses to the empty hand; a shield never leaves the left, a two-hander never the right', () => {
  const e = { items: [] };
  const mk = (t, name, group = 'Weapons') => { const it = { group, templateIndex: t, name, stackCount: 1 }; e.items.push(it); return it; };
  const dagger = mk(113, 'Dagger'), sword = mk(114, 'Shortsword');
  equipItem(e, dagger); equipItem(e, sword);
  const s = equipTableOf(e);
  assert.deepEqual([s[EQUIP_SLOTS.RightHand]?.name, s[EQUIP_SLOTS.LeftHand]?.name], ['Dagger', 'Shortsword']);
  assert.deepEqual(swapHands(e), { ok: true });
  assert.deepEqual([s[EQUIP_SLOTS.RightHand]?.name, s[EQUIP_SLOTS.LeftHand]?.name], ['Shortsword', 'Dagger']);
  assert.equal(s[EQUIP_SLOTS.RightHand].equipSlot, EQUIP_SLOTS.RightHand, 'each piece knows its new hand');
  s[EQUIP_SLOTS.LeftHand] = null; dagger.equipSlot = null;
  assert.deepEqual(swapHands(e), { ok: true });
  assert.deepEqual([s[EQUIP_SLOTS.RightHand]?.name ?? null, s[EQUIP_SLOTS.LeftHand]?.name], [null, 'Shortsword'], 'into the empty hand');
  const empty = { items: [] };
  assert.equal(canSwapHands(empty).ok, false, 'empty hands');
  const k = { items: [] };
  const shield = { group: 'Armor', templateIndex: 111, name: 'Kite Shield', stackCount: 1 }, blade = { group: 'Weapons', templateIndex: 114, name: 'Shortsword', stackCount: 1 };
  k.items.push(shield, blade); equipItem(k, blade); equipItem(k, shield);
  const ks = equipTableOf(k);
  assert.equal(ks[EQUIP_SLOTS.LeftHand]?.name, 'Kite Shield');
  assert.equal(swapHands(k).ok, false, 'a shield never leaves the left');
  assert.equal(ks[EQUIP_SLOTS.LeftHand]?.name, 'Kite Shield', 'and nothing moved');
  const t2 = { items: [] };
  const claymore = { group: 'Weapons', templateIndex: 119, name: 'Two-hander', stackCount: 1 };
  t2.items.push(claymore);
  const r2 = equipItem(t2, claymore);
  if (equipTableOf(t2)[EQUIP_SLOTS.RightHand] === claymore && canSwapHands(t2).ok === false) assert.match(canSwapHands(t2).why, /right hand/);
});

test('GOTHWAY-BOARDS: Gothway Garden alone; two boards at the NORTH entrance, one each side of the road in, inside the border, facing north; never in a wall', () => {
  assert.equal(isGothwayGarden('Gothway Garden'), true);
  assert.equal(isGothwayGarden(' gothway garden '), true);
  assert.equal(isGothwayGarden('Daggerfall'), false);
  const W = 256, H = 256, cell = 1.6;
  // a road down the middle (x 124..131) and another road off to the west; buildings either side of the middle one
  const grid = (gx, gy) => ((gx >= 124 && gx <= 131) || (gx >= 20 && gx <= 23) ? 15 : (gx > 116 && gx < 124) || (gx > 131 && gx < 139) ? 0 : 7);
  const [w, e] = gothwayNorthSpots(grid, W, H, cell);
  assert.deepEqual([w.side, e.side], ['west', 'east']);
  assert.ok(w.x < 124 * cell + cell && e.x > 131 * cell, 'either side of the middle road (the way in), not the far one');
  assert.ok(w.z > (H - 8) * cell && w.z < H * cell, 'inside the north border');
  for (const s of [w, e]) assert.notEqual(grid(Math.floor(s.x / cell), Math.floor(s.z / cell)), 0, 'never inside a wall');
  assert.equal(w.yawDeg, 0, 'facing north, at whoever arrives');
  assert.equal(gothwayNorthSpots(() => 0, W, H, cell), null, 'no way in: no boards');
});

import { dungeonRespawnMs, dungeonRespawnDue, DUNGEON_RESPAWN_MS, ELITE_DUNGEON_RESPAWN_MS } from '../../src/systems/dungeon/dungeonRespawn.js';
test('DUNGEON-RESPAWN: a normal dungeon 20 minutes, an elite 40, each on its own clock; a Super dungeon keeps WORLD8\'s - half an hour since RESPAWN-30', () => {
  assert.equal(dungeonRespawnMs({}), 20 * 60_000);
  assert.equal(dungeonRespawnMs({ elite: true }), 40 * 60_000);
  assert.equal(dungeonRespawnMs({ superTier: true }), 30 * 60_000);
  const t = 1e12;
  assert.equal(dungeonRespawnDue(t, t + DUNGEON_RESPAWN_MS - 1, DUNGEON_RESPAWN_MS), false);
  assert.equal(dungeonRespawnDue(t, t + DUNGEON_RESPAWN_MS, DUNGEON_RESPAWN_MS), true, 'twenty minutes after it fell, whoever came and went');
  assert.equal(dungeonRespawnDue(t, t + ELITE_DUNGEON_RESPAWN_MS - 1, ELITE_DUNGEON_RESPAWN_MS), false);
  assert.equal(dungeonRespawnDue(t, null, DUNGEON_RESPAWN_MS), false, 'offline: nothing respawns');
});

// WILD-KEEPOUT (Wrothgaria kept out of the zone, its west border moved east) RETIRED with the Wrothgarian zone (WW-C2,
// WW-C): Cyrodiil's zone is the province whole.

// ── KEEP-SPELLBOOK ──

/** A new character's spellbook, off the producer that hands it over (startingGear.js, the bag's first piece). */
const newSpellbook = () => {
  const e = { items: [] };
  assignStartingGear(e, { rolls: () => 0, torchesFromItems: false });
  const book = e.items.find((it) => it.group === 'MiscItems' && it.templateIndex === 132);
  assert.ok(book, 'the producer hands over a spellbook');
  return { e, book };
};

test('KEEP-SPELLBOOK the law: the spellbook never leaves the pack - not to the ground, a pile, a body or a chest, not by the shift-drop, not even asked dry - and the own wagon still takes it; a quest\'s book is the quest\'s, and the rest of the bag goes as ever (mutants: the store rung gone, the wagon refused, the shift-drop unguarded, the quest\'s book kept)', () => {
  const { e, book } = newSpellbook();
  assert.equal(REFUSAL.spellbook.text, 'Your spellbook never leaves you.', 'the words, as prose');
  assert.equal(planStore(book, { remote: [] }).refusal, REFUSAL.spellbook, 'the ground, a pile, a body, a chest');
  assert.equal(planStore(book, { remote: [], dryRun: true }).refusal, REFUSAL.spellbook, 'a view asking whether to draw the button');
  assert.equal(planStore(book, { remote: [], usingWagon: true }).ok, true, 'the wagon is still mine');
  let dropped = null;
  const r = shiftDrop(book, { items: e.items, entity: e, drop: (list) => { dropped = list; } });
  assert.equal(r.refusal?.text, REFUSAL.spellbook.text, 'the shift-drop says why');
  assert.ok(e.items.includes(book) && dropped === null, 'and the book stays in the pack');
  setLocked(book, true);
  assert.equal(shiftDrop(book, { items: e.items, entity: e, drop: () => {} }).refusal?.text, REFUSAL.spellbook.text,
    'a locked book says its own reason, not "unlock it first" - unlocking it would not let it go');
  setLocked(book, false);
  const quests = { ...book, questItem: true };
  assert.equal(isKeptSpellbook(quests), false, 'a quest\'s book is not the character\'s');
  assert.notEqual(planStore(quests, { remote: [], dryRun: true }).refusal, REFUSAL.spellbook);
  const shirt = e.items.find((it) => it !== book && it.group === 'MensClothing');
  assert.equal(planStore(shirt, { remote: [] }).ok, true, 'a shirt drops as ever');
});

const SB_ICONS = { getTexture: async () => ({ recordCount: 0 }), uploadRecord: () => {}, textures: new Map() };
const sbHooks = (mode, bag) => ({
  mode, shelfItems: () => [], packItems: () => bag, entity: { items: bag }, accepts: () => true, enchanted: () => true,
  priceCtx: () => ({ quality: 10, skills: { mercantile: 50, personality: 50 } }), gold: () => 1000,
  rows: (id) => [{ text: `#${id}`, center: true }], weight: () => ({ carriedWeightKg: 0, maxEncumbranceKg: 1e9 }),
  commit: () => {}, icons: SB_ICONS,
});
const SB_PAGES = Object.freeze({ weapons: 'Weapons & Armor', magic: 'Magic Items', clothing: 'Clothing & Misc', ingredients: 'Ingredients' });
const sbPageOf = (item) => Object.keys(SB_PAGES).find((t) => tabAccepts(item, t));

test('KEEP-SPELLBOOK the counters: the classic counter\'s Sell and Sell Magic refuse the spellbook in words and keep it, a shirt sells; the enhanced counter the same, quoting it no price (mutants: the classic counter sells it; the enhanced counter sells it; the enhanced counter quotes it)', () => {
  for (const mode of ['Sell', 'SellMagic']) {
    const { e, book } = newSpellbook();
    const bag = e.items;
    const shirt = bag.find((it) => it !== book && it.group === 'MensClothing');
    const pick = (it) => {
      const w = new NativeTradeWindow(sbHooks(mode, bag));
      w.tab = sbPageOf(it);
      const at = w.localList().indexOf(it);
      assert.ok(at >= 0, `${mode}: ${it.name} is on the counter's list`);
      w._pickLocal(at);
      return { said: w.box?.rows?.[0]?.text ?? null, staged: w.staged.includes(it) };
    };
    assert.deepEqual(pick(book), { said: REFUSAL.spellbook.text, staged: false }, `${mode}: the classic counter refuses it in words`);
    assert.ok(bag.includes(book), `${mode}: it stays in the pack`);
    if (mode === 'Sell') assert.equal(pick(shirt).staged, true, 'a shirt sells');
  }
  const textOf = (n) => `${n.textContent ?? ''}${(n.children ?? []).map(textOf).join('')}`;
  for (const mode of ['Sell', 'SellMagic']) {
    const { e, book } = newSpellbook();
    const bag = e.items;
    withDom((dom) => {
      const host = dom.mk('div');
      dom.body.append(host);
      const view = mountEnhancedTrade(host, { ...sbHooks(mode, bag), gold: () => 100000 });
      try {
        host.querySelectorAll('.packtab').find((b) => b.textContent === SB_PAGES[sbPageOf(book)]).onclick();
        const row = host.querySelectorAll('.itemrow').find((r) => textOf(r).includes(book.name));
        assert.ok(row, `${mode}: the spellbook is on the counter's list`);
        row.onclick({ timeStamp: 5000 });
        assert.doesNotMatch(textOf(host), /Sell for/, `${mode}: no price quoted for a sale the counter refuses`);
        host.querySelectorAll('.act.primary').find((b) => b.textContent === 'Sell').onclick();
        assert.ok(bag.includes(book), `${mode}: the enhanced counter keeps it in the pack`);
        assert.deepEqual(host.querySelectorAll('.px-note').map((n) => n.textContent), [REFUSAL.spellbook.text], `${mode}: and says why`);
      } finally { view.unmount(); }
    });
  }
});
