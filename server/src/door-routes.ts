// Where the relay's door joins the Worker and the Room (server/src/index.js): the Worker's plain HTTP paths, and the
// doors between objects that a Room answers before its own.

import { relayFactsAnswer, RELAY_FACT_PATHS } from './relayFacts.ts';
import { cellDoors } from './cellMoves.js';
import { doorRoute, doorInternal } from './relay-door.ts';
import { DOOR_PATH } from '../../src/net/door-law.ts';

/** The Worker's answer for a plain HTTP path (the relay's facts, the door), or null for a path it routes to a room. */
export function plainPathAnswer(url: URL, env: Parameters<typeof doorRoute>[0] & Parameters<typeof relayFactsAnswer>[1]): Promise<Response> | Response | null {
  if (RELAY_FACT_PATHS.includes(url.pathname)) return relayFactsAnswer(url.pathname, env);
  if (url.pathname === DOOR_PATH) return doorRoute(env, url);
  return null;
}

/** A Room's answer for a door between objects (the cell tree's, the relay door's), or null for its own requests.
 *  The Worker forwards only `/room/<key>` from outside, so no page reaches these paths. */
export async function objectDoorAnswer(room: object, path: string, request: Request): Promise<Response | null> {
  return (await cellDoors(room, path, request)) ?? (await doorInternal(room, path, request));
}
