// @ts-check
// ═══════════════════════════════════════════════════════════════════
// SEAT-HALL and CROWN-HALL, moved out of bootWorld (HOST-SPLIT): A SEAT'S HALLS AS THE MODES
// HOST ASKS THEM (scenes/worldModes.js seatHallsFrame, crownHere) - a
// palace seat's Charter Room, a crown's throne room.
//
// A crown's throne room stands its holder's banners, roster board and vault chest in the
// public castle, as CROWN-HALL built it, and in NO instance of it: a quest's private castle
// is a different room, and the holder's pieces do not stand in it.
//
// deps: seatHere(mapId) - the seat a location is, dressed in its holder
// (world.js, off the seats' book); guild() - this character's guild as its
// book last read it (net/guild/guildBook.js `guild`: its id and rank).
// ═══════════════════════════════════════════════════════════════════
import { seatHallOf, seatBannerOf } from '../net/townSeatLaw.js';
import { hallMay } from '../net/hallLaw.js';   // SEAT-HALL: a palace's keepers are a hall's

/** @param {{ seatHere: (mapId: number) => any, guild: () => any }} deps */
export function createSeatHallHost({ seatHere, guild }) {
  return {
    /** SEAT-HALL: a palace seat's Charter Room, as its visitor stands in it - `{ key, name, member, keeper }`, or null. */
    here(mapId) {
      const seat = seatHere(mapId);
      const g = seat?.tier === 'palace' ? seat.holder?.guild ?? null : null;
      if (!g?.id) return null;
      const mine = guild();
      const member = seatHallOf(seat, mine?.id ?? null);
      return { key: seat.key, name: g.name ?? '', member, keeper: member && hallMay(Number(mine?.rank), 'decorate') };
    },
    /**
     * CROWN-HALL (7.2: "Crown: the castle is the hall"): a crown seat's castle, as its visitor stands in it - `{ key, name,
     * member, heraldry }` (the holder's guild's name; whether this character is of it; its banner), or null: no crown
     * here, none held, the seats shut to this account - or an instance (`instance`, the room's `{ owner, epoch }`): the
     * castle's public room alone is dressed.
     */
    crown(mapId, instance = null) {
      const seat = seatHere(mapId);
      const g = seat?.tier === 'crown' ? seat.holder?.guild ?? null : null;
      if (!g?.id) return null;
      if (instance) return null;
      return { key: seat.key, name: g.name ?? '', member: seatHallOf(seat, guild()?.id ?? null), heraldry: seatBannerOf(seat) };
    },
  };
}
