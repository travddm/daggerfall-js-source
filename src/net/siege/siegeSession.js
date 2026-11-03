// @ts-check
// SEAT2a part four: A SIEGE AS
// THIS CLIENT FIGHTS IT (6.2-6.8, 19) - entered from the board's Seat tab while the
// battle's door is open: the field this game derived from the town (systems/siegeField.js) sent for a pass (the service
// settles the field on an attacker's and a defender's agreeing - until then it asks again, said in words), then the
// battle's own room joined (`siege:<key>:<week>`, a fresh pass on every hello - net/online.js mintSiegePass), `in` said
// once a socket is open; the room's words folded (net/siege/siegeLink.js) and drawn (ui/siegeHud.js); a step refused or a rise
// at the camp moves the player there; a blow on a foe sent to the referee; at the end this fighter's receipt kept and
// carried to the service (net/siege/siegeClaims.js), its Honours on the card. Left at the window's close or by the player -
// the world's own room is joined again.
//
// The world is handed in (`online`, the book's two calls, the HUD, the clock, `movePlayer`), so the pins drive it with
// fakes. Not a DFU member. Ledger A (EVERY PALACE A SEAT's row).
//
// AUDIT-SEATS: C1 - A BATTLE IS LEFT: by the player (the HUD's Leave, the result card's Close, the chat's
// `/leave` - scenes/world.js), when the player has been away from the seat's town BATTLE_AWAY_MS (`here`), when the
// battle's socket is closed for good, and at the window's close; the HUD is drawn only while the player stands in the
// battle's room (a building's room is not the field). C2 - the one mint slot (net/online.js mintSiegePass) is cleared
// only while it is this session's own. C3 - an unsettled field is said ONCE and asked again on a backing-off wait (5 s,
// 10, 20, 40, then every 60 s), so the service's hourly bound on passes is never reached. C7 - every settling answer to
// this fighter's receipt reaches the card (a refusal in words), so it never stands on "claim it".
import { siegeRoomKey } from './siegeRef.js';
import { foldSiege, siegeHudModel, siegeClaimRefusal, SIEGE_STATE_EMPTY, fightArmed } from './siegeLink.js';   // HERALDRY-SHOWN: fightArmed, the HUD's two sides' heraldry
import { readSiegeReceipt } from './siegeReceipt.js';

/** How long an unsettled field waits before the pass is asked again, ms - the first wait. */
export const SIEGE_PASS_RETRY_MS = 5000;
/** AUDIT-SEATS C3: the longest wait - each doubles from the first to this (a Royal Tourney's ring's too). */
export const PASS_RETRY_MAX_MS = 60_000;
/** AUDIT-SEATS C3: the wait before the `n`th ask again (1 the first): 5 s, 10, 20, 40, then 60 for good. */
export const passRetryMs = (n, first = SIEGE_PASS_RETRY_MS) => Math.min(PASS_RETRY_MAX_MS, first * 2 ** Math.max(0, n - 1));
/** AUDIT-SEATS C1: how long the player may be away from the seat's town before the battle is left, ms - a door, a load's
 *  frames or a step past the town's edge is no leaving. */
export const BATTLE_AWAY_MS = 5000;
/** AUDIT-SEATS C1: the chat's word that leaves a battle or a Royal Tourney (scenes/world.js) - `/leave`. */
export const isBattleLeaveCommand = (text) => /^\/leave$/i.test(String(text ?? '').trim());
/** AUDIT-SEATS C1: what the chat says to a `/leave` with nothing entered. */
export const BATTLE_NONE_TEXT = 'You are in no battle and no Royal Tourney.';
/** The words. */
export const SIEGE_SESSION_TEXT = Object.freeze({
  notHere: (town) => `Go to ${town} to fight for it. The battle is fought in the town itself.`,
  entered: (side) => (side === 'watch' ? 'You are watching the battle as a spectator.' : `You fight for the ${side === 'attack' ? 'attackers' : 'defenders'}. Make for your camp's banner.`),
  left: 'You have left the battle.',
  refused: (why) => `The battle would not have you: ${why}`,
  away: (town) => `You have left ${town}, and the battle with it.`,   // AUDIT-SEATS C1
  closed: 'The connection to the battle closed. You have left it.',   // AUDIT-SEATS C1: its socket closed for good
});

/**
 * THE SESSION. `online` (net/online.js), `pass(seat, field)` and `claim(receipt)` the book's (net/townSeatBook.js
 * siegePass, claimSiege), `claims` (net/siege/siegeClaims.js, or null), `hud` (ui/siegeHud.js createSiegeHud, or null),
 * `nowMs()` (AUDIT-SEATS C6: the relay's clock - the pass's window is the relay's), `movePlayer(pose)` (a wire pose:
 * natives on x and z), `say(text)`; AUDIT-SEATS C1: `here(seat)` whether the player
 * is still at the seat's town.
 * @param {{ online: any, pass: (seat: any, field: any) => Promise<any>, claims?: any, hud?: any, nowMs?: () => number,
 *   movePlayer?: (p: any) => void, say?: (t: string) => void, here?: (seat: any) => boolean }} deps
 */
export function createSiegeSession({ online, pass, claims = null, hud = null, nowMs = () => Date.now(), movePlayer = () => {}, say = () => {}, here = () => true }) {
  /** @type {null | { seat: any, battle: any, field: any, room: string, side: string, window: number, sentIn: boolean, state: any, retryAt: number, joined: boolean, honours: any, tries: number, mint: any, awayAt: number|null }} */
  let s = null;
  async function ask() {
    if (!s) return;
    const at = s;
    const r = await pass(s.seat, s.field);
    if (s !== at) return;   // AUDIT-SEATS C1: left, or entered afresh, while it was asked
    if (!r?.ok) {
      // AUDIT-SEATS C3: said once, asked again on a backing-off wait
      if (r?.error === 'field-unsettled') { s.tries++; s.retryAt = nowMs() + passRetryMs(s.tries); if (s.tries === 1) say(r.text); return; }
      say(SIEGE_SESSION_TEXT.refused(r?.text ?? 'it is not open'));
      api.leave({ quiet: true });
      return;
    }
    s.side = r.side; s.window = Number(r.window) * 1000;
    s.room = siegeRoomKey(s.seat.key, r.week);
    // AUDIT-SEATS C2: this session's own mint, kept, so a leave clears the slot only while it is still this one's
    s.mint = async () => { const again = await pass(at.seat, at.field); return again?.ok ? again.pass : null; };
    online.mintSiegePass = s.mint;
    s.joined = true;
    say(SIEGE_SESSION_TEXT.entered(r.side));
  }
  const api = {
    /** The room the world must stand in while a battle is entered, else null (scenes/world.js keeps its own then). */
    room: () => (s?.joined ? s.room : null),
    active: () => !!s,
    side: () => s?.side ?? null,
    /** Enter `seat`'s battle - `battle` the Seat tab's (its kind, tier and two guilds), `field` the pass's `sf` this game
     *  derived (null: the player is not in the town). */
    enter(seat, battle, field) {
      if (!field) { say(SIEGE_SESSION_TEXT.notHere(seat?.name ?? 'the town')); return false; }
      if (s?.mint && online.mintSiegePass === s.mint) online.mintSiegePass = null;   // AUDIT-SEATS C2: entered afresh - the old pass's mint goes
      s = { seat, battle: fightArmed(battle, seat), field, room: '', side: 'watch', window: 0, sentIn: false, state: SIEGE_STATE_EMPTY, retryAt: 0, joined: false, honours: undefined, tries: 0, mint: null, awayAt: null };
      ask();
      return true;
    },
    /** Leave it (`quiet`: no word; `words` another word than the plain one) - the world's room is the world's again.
     *  AUDIT-SEATS C1: true when there was a battle to leave. @param {{ quiet?: boolean, words?: string }} [o] */
    leave({ quiet = false, words = SIEGE_SESSION_TEXT.left } = {}) {
      if (!s) return false;
      const mint = s.mint;
      s = null;
      if (mint && online.mintSiegePass === mint) online.mintSiegePass = null;   // AUDIT-SEATS C2: another battle's mint is not this one's to clear
      hud?.hide();
      if (!quiet) say(words);
      return true;
    },
    /** A word from the battle's room (net/online.js onSiege). */
    onSiege(g, room) {
      if (!s || room !== s.room) return;
      s.state = foldSiege(s.state, g, nowMs());
      if (g.k === 'back') movePlayer(g.p);
      if (g.k === 'up' && g.id === online.id && g.p) movePlayer(g.p);
      if (g.k === 'no') say(g.m);
      if (g.k === 'end' && g.rc && readSiegeReceipt(g.rc) && claims) {
        claims.keep(g.rc);
        claims.offer({ force: true });
      }
    },
    /** The service's answer to this fighter's claim (net/siege/siegeClaims.js onClaimed) - its Honours on the card. AUDIT-SEATS
     *  C7: every settling answer - a refusal's words in the Honours' place (net/siege/siegeLink.js siegeClaimRefusal) - and only
     *  this battle's own receipt's (`receipt`: an older battle's, settling now, is not this card's). */
    claimed(answer, receipt = null) {
      if (!s || (receipt != null && s.state.receipt != null && receipt !== s.state.receipt)) return;
      s.honours = answer?.ok === false ? siegeClaimRefusal(answer) : (answer?.data?.honours ?? answer?.honours ?? null);
    },
    /** Each frame: the pass asked again while the field settles, `in` said once on an open socket, the HUD drawn, the
     *  battle left when its window has closed. AUDIT-SEATS C1: and left once the player has been away from the seat's
     *  town BATTLE_AWAY_MS, or its socket has closed for good; the HUD drawn only in the battle's own room. */
    tick() {
      if (!s) return;
      const now = nowMs();
      if (here(s.seat)) s.awayAt = null;
      else if (s.awayAt == null) s.awayAt = now;
      else if (now - s.awayAt >= BATTLE_AWAY_MS) { api.leave({ words: SIEGE_SESSION_TEXT.away(s.seat?.name ?? 'the town') }); return; }
      if (!s.joined) { if (s.retryAt && now >= s.retryAt) { s.retryAt = 0; ask(); } return; }
      if (s.window && now >= s.window) { api.leave(); return; }
      if (online.room !== s.room) { s.sentIn = false; hud?.hide(); return; }
      if (online.terminal) { api.leave({ words: SIEGE_SESSION_TEXT.closed }); return; }
      const open = online.status === 'open';
      if (!open) s.sentIn = false;
      else if (!s.sentIn) s.sentIn = online.sendSiege({ k: 'in' });
      hud?.update(siegeHudModel(s.state, { seat: s.seat?.name, kind: s.battle?.kind, tier: s.battle?.tier, attacker: s.battle?.attackerGuild, defender: s.battle?.defenderGuild }, online.id, now,
        { watching: s.side === 'watch', honours: s.honours, claimable: !!s.state.receipt && s.honours === undefined }));
    },
    /** Whether a peer is this fighter's foe (a fighter of the other side). */
    isFoe(id) {
      if (!s || s.side === 'watch') return false;
      const f = s.state.roll[id];
      return !!f && !!f.side && f.side !== s.side && !f.down;
    },
    /** The peers this fighter may strike. */
    foes() { return s && s.side !== 'watch' ? Object.keys(s.state.roll).filter((id) => api.isFoe(id)) : []; },
    /** AUDIT-SEATS G5: the side-mates standing this fighter may heal (not itself - a self-heal is the save's own). */
    mates() { return s && s.side !== 'watch' ? Object.keys(s.state.roll).filter((id) => id !== online.id && s.state.roll[id].side === s.side && !s.state.roll[id].down) : []; },
    /** A blow on a foe, to the referee (net/wire.js validSiegeIn's `blow`). True when it left. */
    blow(to, { w, m, d, r }) { return !!s && api.isFoe(to) && online.sendSiege({ k: 'blow', to, w, m, d, r }); },
    /** A cast on a peer - a harmful one on a foe, a heal on a side-mate. */
    cast(to, d, heal = false) {
      if (!s || s.side === 'watch') return false;
      const f = s.state.roll[to];
      if (!f || (heal ? f.side !== s.side : !api.isFoe(to))) return false;
      return online.sendSiege({ k: 'cast', to, d, h: heal ? 1 : 0 });
    },
    /** This fighter has fallen (it waits for its wave). */
    down: () => !!s && !!s.state.roll[online.id]?.down,
    /** The state, for the pins. */
    get state() { return s?.state ?? null; },
  };
  return api;
}
