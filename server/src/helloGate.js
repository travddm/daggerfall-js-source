// @ts-check
// THE HELLO GATE OF A ROOM, apart from the Room's own (index.js). A room's hello gate is a bucket of hellos a second.
// Spent before the token is read, a flood of tokenless hellos made every real player's hello 'busy'. So a battle, an arena
// floor, a super dungeon's realm, an instance and a cell or world room spend it after the token, by account
// (Room._battleHelloGate); every other room spends it first, here, and its close says the token is unspent.
import { tokenGate, isCellRoom, isWorldRoom, CLOSE_BUSY, BUSY_TOKEN_UNREAD } from '../../src/net/wire.js';
import { isBattleRoom } from '../../src/net/siege/siegeRef.js';
import { isArenaFloorRoom } from '../../src/net/arena/arenaLaw.js';
import { isSdRoom } from '../../src/net/superDungeon/sdLaw.js';
import { isInstanceRoom } from '../../src/net/instanceRoom.js';
import { busyReason } from '../../src/net/door-law.ts';
import { spendDoorPass } from './relay-door.ts';

/** Each room's count of hellos refused busy, draining at the room's hello rate, so a busy close can tell the refused
 *  how long the refused ahead of them take. Kept apart from the Room, and forgotten with it. */
const busyCounts = new WeakMap();
/** The wait a busy close tells, ms (busyReason bounds it): the refused still ahead, this one included, at `rate` a second.
 *  @param {object} room @param {number} now @param {number} rate */
function busyWait(room, now, rate) {
  const held = busyCounts.get(room) ?? { refused: 0, at: now };
  const ahead = Math.max(0, held.refused - ((now - held.at) * rate) / 1000) + 1;
  busyCounts.set(room, { refused: ahead, at: now });
  return (ahead / rate) * 1000;
}

/** Whether `key`'s hello gate is spent only once the token is verified (the rooms the header names). */
export const spendsAfterToken = (key) =>
  isBattleRoom(key) ||
  isArenaFloorRoom(key) ||
  isSdRoom(key) ||
  isInstanceRoom(key) ||
  isCellRoom(key) ||
  isWorldRoom(key);

/** The gate asked before the token is read, for a room that spends its gate first. Answers whether the hello was refused
 *  (busy, the token unspent).
 *  @param {any} room the Room @param {any} ws @param {string} key @param {number} now */
export function preTokenGate(room, ws, key, now) {
  if (spendsAfterToken(key)) return false;
  const gate = tokenGate(room._hellos, now, room._helloHz(key)); // in memory - see Room._hellos
  room._hellos = gate.bucket;
  if (gate.pass) return false;
  room._refuse(ws, 'busy', CLOSE_BUSY, busyReason(BUSY_TOKEN_UNREAD, busyWait(room, now, room._helloHz(key))));
  return true;
}

/** A cell's or world room's gate, spent once the token is verified: the account's own, then the room's. A hello that
 *  carries a pass from the door (relay-door.ts) spends the pass instead of the room's bucket: the door already paced
 *  it. The other rooms that spend after the token do it at their own admission. Answers whether the hello was refused.
 *  @param {any} room the Room @param {any} ws @param {string} key @param {any} who the verified token @param {any} m the hello @param {number} now */
export async function placeGate(room, ws, key, who, m, now) {
  if (!isCellRoom(key) && !isWorldRoom(key)) return false;
  const passed = await spendDoorPass(room.env, key, m.dp);
  // A side other than 'watch' spends the account's own bucket alone.
  const gate = await room._battleHelloGate(who.subject ?? m.id, passed ? 'door' : 'watch', now);
  if (gate.pass) return false;
  room._refuse(ws, 'busy', CLOSE_BUSY, busyReason('busy', busyWait(room, now, room._helloHz(key))));
  return true;
}
