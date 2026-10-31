// @ts-check
// AUDIT WORLD-EVENTS L1-1, L1-4 (bible/01-Overview/audits/Audit-World-Events.md): MY RESURRECT, SAID TO THE ROOM THAT
// KEEPS THE DEATH. A made level's room records a raise itself - the Hour's realm (net/superDungeon/sdLaw.js
// sdMayRaise) - so a body rises there only
// when a living friend's spell was cast at it; anywhere else this says nothing, and the party pose's call (systems/
// resurrect.js `rz`) is the raise, the fallen's own page deciding. The world host calls it from its Resurrect's door
// (scenes/world.js raiseFallenDoor).
import { isSdRoom } from './superDungeon/sdLaw.js';

/** The raise of account `to` said down my socket to the room I stand in, when it keeps its deaths. Answers whether a word
 *  went. @param {any} online the session (net/online.js) @param {string} to */
export function sendRaiseWord(online, to) {
  const room = online?.room;
  if (!room || typeof to !== 'string' || !to) return false;
  if (isSdRoom(room)) return !!online.sendSdRaise?.(to);
  return false;
}
