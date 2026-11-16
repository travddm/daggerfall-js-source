// @ts-check
// START: THE WORLD'S START - where a new character's story begins, in the open world's host (src/scenes/fishHost.js is the
// shape: a module the host wires, owning its state).
//
// The boot of a new game stands the classic start (world.js's U31 start cell, Privateer's Hold), the character is made over
// it, and their quest starts there (_STARTIB, as DFU's StartGameBehaviour starts _BRISIEN there). A character the boot stood
// anywhere else - a family's heir at its seat (LEGACY1), a dev boot outside the classic start - is handed the commission at
// once (HAND_START_QUEST).
// `then(questName)` is the host's own OnStartGame (world.js questInitAtGameStart: the quests, the welcome tour).
import { BAY_START_QUEST, HAND_START_QUEST, MAIN_QUEST_OPENER, isStartQuestName } from '../systems/starts/starts.js';
import { gameStartQuests } from './quest/questBridge.js';   // AUDIT STARTS W5: a story never begun, begun at its load
import { t } from '../systems/textManager.js';

/** The boot's world is waited on this often, this many times (a start past the Bay's own wait, bootStartHost.js; a birth
 *  online's, realmBirth). */
export const START_READY_MS = 250;
export const START_READY_TRIES = 240;

export const STARTS_TEXT = Object.freeze({
  /** A start past the Bay that found no place to stand in. */
  get noSite() { return t('start.noSite', 'No way to that province could be found. Your story begins in the Iliac Bay.'); },
});

/**
 * @param {{ params: URLSearchParams, machine: () => any }} host
 *   `params` - the boot's address (`classic`: the boot stood Privateer's Hold); `machine` - the quest machine
 */
export function createStartsHost(host) {
  const { params, machine } = host;
  /** The Hold's start is Privateer's Hold's: a character the boot stood anywhere else is handed the commission. */
  const bayQuest = () => (params.has('classic') ? BAY_START_QUEST : HAND_START_QUEST);

  /** Settled once the story has begun (`then` has run) - what a birth online waits on before its first save (world.js
   *  realmBirth: the realm's first checkpoint is the character where their story begins, its quest running). */
  /** @type {(v?: any) => void} */
  let settle = () => {};
  const settled = new Promise((r) => { settle = r; });
  let begun = false;
  /** Begin the story, then `then(questName)`. Once a character. */
  function begin(then) {
    if (begun) return;
    begun = true;
    try { then(bayQuest()); } finally { settle(); }
  }

  /** AUDIT STARTS W5: a load restored the machine (world.js, its two load doors). A character saved before their story
   *  began holds no story at all: no start, no _BRISIEN, nothing of the main story ever begun (quest/machine.js
   *  storyStarted: a new character's curse is among it from the first tick). Loaded, it is handed the commission (the curse
   *  beside it, as every new game's), never left without a way into the story. A save from before the story was kept says
   *  nothing of it (storyLegacy) and is left alone. Answers true: the game's start is the save's now (world.js _questStarted). */
  function restored() {
    const m = machine?.();
    const started = !m || m.storyLegacy || (m.storyStarted?.size ?? 0) > 0
      || [...(m.quests?.values?.() ?? [])].some((q) => isStartQuestName(q?.questName) || String(q?.questName ?? '').toUpperCase() === MAIN_QUEST_OPENER);
    if (!started) for (const name of gameStartQuests(HAND_START_QUEST)) m.startQuestByName(name);
    return true;
  }

  return { begin, settled, restored };
}
