// FIELD BUGS 2026-09-30 (CHOP-WAIT) - "Hardlocked in woodcutting animation after game Crash": "Was choppin wood for money
// and some quests when the game crashed and now im stuck in an endless loop of logging in, been stuck on the treecutting
// animation and it locks up all my controls til it crashes again."
//
// Online the Wood-Axe's ChopWoodQuest raises time by 1:30, which is Foraging's wait page ("Chop and Gather Wood...", no
// Escape - scenes/foragingWait.js, FORAGE4), and every quest box is held behind it; the held boxes ride the save (AUDIT
// 28 F6). The page's end released them, and a released box is the host's showQuestBox, whose first question is the
// wait's `holds()` - true while any box is still held. With two boxes behind the page (two chops, each quest's find) the
// first went back behind the second and the second behind the first, for ever, in one frame: the tab hung. The save
// kept the record, so every login reopened the page and hung again when it ran out. A box the release shows is shown
// now, and one release runs only the boxes held when it began.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { createForagingWait } from '../../../src/scenes/foragingWait.js';
import { tokensToRows } from '../../../src/scenes/quest/questBridge.js';
import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { loadQuestTables } from '../../../src/systems/quest/tables.js';
import { questActionsExtensionTemplates } from '../../../src/systems/quest/questActionsExtension.js';
import { snapshotPlayer, restorePlayer } from '../../../src/systems/save/save.js';
import { FATIGUE_MULTIPLIER } from '../../../src/systems/statMods.js';

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

/** Past this many asks of the wait the host's `holds()` throws: the old release asked for ever, and a pin must end. */
const ASKS_MAX = 1000;

/** The host's slot as townTalk keeps it: a window that ends stays in the slot until the next frame drains it. */
function slot() {
  const s = { win: null };
  s.show = (w) => { const out = s.win; s.win = w; if (out && out !== w && !out.done) out.dispose?.(); };
  s.active = () => !!s.win;
  s.drain = () => { if (s.win?.done) s.win = null; };
  return s;
}

const T = new URL('../../../vendor/dfu-quests/Tables/', import.meta.url);
loadQuestTables(Object.fromEntries(readdirSync(T).map((f) => [f.replace(/\.txt$/, ''), readFileSync(new URL(f, T), 'utf8')])));
const CHOP = rd('vendor/foraging/Quests/ChopWoodQuest.txt').split(/\r?\n/);
const chopper = () => ({
  name: 'Tester', gender: 'male', level: 5, careerIndex: 0, health: 50, maxHealth: 100, magicka: 10, maxMagicka: 50,
  fatigue: 105 * FATIGUE_MULTIPLIER, stats: { intelligence: 62, strength: 55, agility: 50, endurance: 50, luck: 45, willpower: 50, personality: 50, speed: 50 },
  skills: [], skillUses: [], career: {}, items: [], wagonItems: [], spells: [], activeEffects: [], foragingWait: null,
});
/** The real quest machine over the host - the find's line through the host's own popup door (tokensToRows, showQuestBox). */
function machine(entity, H) {
  const m = new QuestMachine({
    nowSeconds: () => 1000000, sharedClock: () => true, playerEntity: entity, raiseTime: () => {}, waitOnline: (sec, q) => H.wait.add(sec, q?.displayName ?? null),
    getQuestSourceLines: () => null, giveItemToPlayer: () => {}, addGold: () => {}, addHUDText: () => {},
    showPopup: (_q, tokens) => { const rows = tokensToRows(tokens); if (rows.length) H.h.showQuestBox({ rows }); },
    releaseQuestItem: () => {}, makeHeldQuestItemsPermanent: () => {}, getGuild: () => null, regionPriceAdjustment: () => 0,
  });
  for (const a of questActionsExtensionTemplates()) m.registerAction(a);
  return m;
}
/** A Wood-Axe use per roll, run through: 0.99 finds an Ichor, 0.85 a Map (Luck 45, the quest's even chance). */
function chop(m, rolls) {
  const ow = console.warn, ol = console.log; console.warn = () => {}; console.log = () => {};
  try {
    for (const r of rolls) m.scheduleQuest(CHOP, 0, { rolls: () => r });
    for (let i = 0; i < 8; i++) m.tick();
  } finally { console.warn = ow; console.log = ol; }
}
const find = (what) => ({ box: { rows: ['While chopping and gathering wood,', `you chanced upon a ${what}`, 'that someone must have lost or discarded.'] } });
const line = (what) => `you chanced upon a ${what}`;
/** The character through the save and back, as a checkpoint and a login carry it (systems/save/save.js ENTITY_FIELDS). */
function relog(entity) {
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(entity, { position: [0, 0, 0], classicMinutes: 0, locationKey: 'world' })));
  const loaded = chopper();
  restorePlayer(loaded, snap, new Map());
  return loaded;
}

test('CHOP-WAIT: one release runs the boxes held when it began - a box held again while they are shown waits for the next frame (mutants: a release without end)', () => {
  const entity = { foragingWait: null };
  const wait = createForagingWait({ entity, online: () => true });
  let ran = 0;
  const again = () => { ran++; if (ran < 50) wait.hold(again); };
  wait.hold(again);
  wait.tick();
  assert.equal(ran, 1, 'once this frame, not fifty');
  wait.tick();
  assert.equal(ran, 2, 'and once the next');
});
