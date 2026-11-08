// @ts-check
// SIEGE-REF - A SIEGE'S ROOM, ITS BATTLE AND ITS TOURNEY
// (Seats-Arc 6.2).
//
// A siege is one battle a seat a week, in a room of its own (`siege:<seat key>:<seat week>`). This file holds the
// battle's state and its pure rules: the waves and the places on each side, the field and its works (the gatehouse and
// the ram), the banners and the Throne, the guards and the revolt, the forfeit and the final tally, and the Royal Tourney's
// room, bouts and ladder.
//
// The REFEREE CORE moved to net/pvp/pvpRef.js: a fighter's vitality, a blow's bucket (DFU's damage tables), a cast, a harm
// and a step. This file imports it and re-exports every name, so a caller may keep importing it from here. The relay
// bundles every byte it imports (test/net/relayversion.test.js), so both files are leaves.
//
// Pure: no clock (every `now` an argument), no DOM, no network.

import { SIEGE_UNITS_PER_M, ROYAL_RING } from '../pvp/pvpRef.js';
export { SIEGE_VITALITY, siegeVitality, SIEGE_UNITS_PER_M, SIEGE_REACH, SIEGE_HIT, SIEGE_BLOWS_HZ, SIEGE_CASTS, SIEGE_HARM, SIEGE_SPEED, SIEGE_WEAPONS, SIEGE_WEAPON_MAX, SIEGE_MATERIAL_MOD, SIEGE_FIST_MAX, SIEGE_BONUS, SIEGE_BONUS_MAX, SIEGE_CRIT_MAX, siegeBlowMax, armsTop, ARMS_TOP_MAX, armsOk, armsOf, siegeIsBow, SIEGE_HAND_SLOTS, siegeHeld, newFighter, harmRoom, refereeBlow, refereeCast, SIEGE_STEP_WINDOW_MS, refereeStep, ROYAL_RING } from '../pvp/pvpRef.js';   // the referee core moved to net/pvp/pvpRef.js; the names stay importable from here

/** A siege's room: `siege:<seat key>:<seat week>` - one a battle (Seats-Arc 6.2). */
export const SIEGE_ROOM = /^siege:(0|[1-9]\d{0,9}):(0|[1-9]\d{0,5})$/;
export const siegeRoomKey = (key, week) => `siege:${key}:${week}`;
export const isSiegeRoom = (k) => SIEGE_ROOM.test(String(k ?? ''));
/** A siege room's seat and week, or null. */
export function siegeOfRoom(k) {
  const m = SIEGE_ROOM.exec(String(k ?? ''));
  return m ? { key: Number(m[1]), week: Number(m[2]) } : null;
}

/** THE WAVES (6.2): a fallen fighter rises at its side's next wave - every 20 s at a palace seat, 30 at a crown - with
 *  3 s that no blow touches. */
export const SIEGE_WAVE_MS = Object.freeze({ palace: 20000, crown: 30000 });
export const SIEGE_PROTECT_MS = 3000;
/** The most fighters a siege's room keeps (6.4: a crown's 20 a side and its 4 sellswords a side). */
export const SIEGE_FIGHTERS_MAX = 48;

/** The next wave after `now` (6.2): its boundary on the room's own clock - every `waveMs` from the epoch. */
export const siegeNextWave = (now, waveMs) => (Math.floor(now / waveMs) + 1) * waveMs;
/** A fallen fighter's rise at its wave: whole again, and SIEGE_PROTECT_MS no blow touches. Answers whether it rose. */
export function siegeRise(f, now) {
  if (!f.down || now < f.upAt) return false;
  f.down = false; f.hp = f.max; f.safeTo = now + SIEGE_PROTECT_MS; f.casts = []; f.heals = [];
  return true;
}

// ═════════════════════════════════════════════════════════════════════
// SEAT2a - THE BATTLEFIELD (Seats-Arc 6.2, 6.5, 6.7, 6.8):
// the banners and the Throne, the clock, the no-shows, the result and who
// earned Honours. Pure, as the referee above: every `now` an argument.
// ═════════════════════════════════════════════════════════════════════

/** A BANNER (6.2): stand within 8 m with no living enemy there - 20 seconds raises it; a contested point freezes; an
 *  abandoned half-raised banner falls back at 1 second a second. */
export const SIEGE_BANNER = Object.freeze({ radiusM: 8, raiseS: 20, decayPerS: 1 });
/** THE THRONE (6.2): open to the attackers while they hold 2 of a palace's 3 banners (3 of a crown's 4 - the banners
 *  alone open it); held uncontested 120 seconds at a palace, 180 at a crown, takes the seat; its progress decays 1 second
 *  a second while it is not held. */
export const SIEGE_THRONE = Object.freeze({ palace: Object.freeze({ banners: 2, holdS: 120 }), crown: Object.freeze({ banners: 3, holdS: 180 }), decayPerS: 1 });
/** How long a battle runs, ms (6.2, 6.7 - net/townSeatLaw.js BATTLE_LENGTH_MS, pinned equal: the relay bundles this leaf). */
export const SIEGE_LENGTH_MS = Object.freeze({ palace: 30 * 60_000, crown: 45 * 60_000, tourney: 20 * 60_000 });
/** No attacker in the room 10 minutes after the start: a forfeit (6.5). */
export const SIEGE_FORFEIT_MS = 10 * 60_000;
/** Spectators a siege's room admits (6.6). */
export const SIEGE_SPECTATORS_MAX = 60;
/** The battle's beat on the room's alarm, ms. */
export const SIEGE_TICK_MS = 1000;
/** A battlefield's banner points, in order: a palace's three, a crown's four (6.2). */
export const SIEGE_BANNER_NAMES = Object.freeze(['Gate', 'Market', 'Temple', 'Palace']);
export const siegeBannerCount = (tier) => (tier === 'crown' ? 4 : 3);
/** A battle's sides, and a spectator's word on a pass. */
export const SIEGE_SIDES = Object.freeze(['attack', 'defend']);

/** THE FIELD a pass carries (net/identityToken.js's `siege` order `sf`): the banners' points, the Throne's, the two
 *  camps' - each `[x, z]` in the room's units. `{ banners, throne, camps: { attack, defend } }`, or null. */
export function fieldOf(sf, tier, kind = 'siege') {
  if (kind === 'royal') return royalFieldOf(sf);   // CROWN1 part two: a Royal Tourney's field is its ring
  const n = siegeBannerCount(tier);
  if (!Array.isArray(sf) || sf.length !== n + 3) return null;
  if (!sf.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e9))) return null;
  return { banners: sf.slice(0, n).map((p) => [p[0], p[1]]), throne: [sf[n][0], sf[n][1]], camps: { attack: [sf[n + 1][0], sf[n + 1][1]], defend: [sf[n + 2][0], sf[n + 2][1]] } };
}

/** A NEW BATTLE: a siege's banners start the holder's (`defend`), a Tourney's no one's. CROWN1 part two: a Royal
 *  Tourney's ladder, open from `startMs` to `endMs` (its pass's week). */
export function newBattle({ kind, tier, startMs, field, endMs = 0 }) {
  if (kind === 'royal') return newRoyal({ startMs, endMs, field });
  const length = kind === 'tourney' ? SIEGE_LENGTH_MS.tourney : (SIEGE_LENGTH_MS[tier] ?? SIEGE_LENGTH_MS.palace);
  return {
    kind, tier, startMs, endMs: startMs + length, field,
    banners: field.banners.map(() => ({ side: kind === 'tourney' ? null : 'defend', raise: 0, by: null })),
    throne: 0, raised: false, attackSeen: false, defendSeen: false, at: startMs, result: null,
    reached: false,   // AUDIT-SEATS T1: whether the attackers ever stood alone at the open Throne (battleStep)
    ground: null,
  };
}
const flat = (p, q) => Math.hypot((p.x - q[0]) / SIEGE_UNITS_PER_M, (p.z - q[1]) / SIEGE_UNITS_PER_M);
/** AUDIT-SEATS R1: how far above or below THE FIELD'S GROUND a fighter may stand and still stand at a point, metres - the
 *  banner's own 8 m, so a point is a sphere about its ground, never a column to the sky. */
export const SIEGE_HEIGHT_M = 8;
export { siegeGround, anchoredGround, SIEGE_MAGICKA, SIEGE_GROUND_DRIFT_UNITS } from '../pvp/pvpCaps.js';   // the ground the clients' heights give, held near its first; the casts' magicka
import { anchoredGround, siegeGround } from '../pvp/pvpCaps.js';
/** AUDIT SEATS-3 B1: how far `p` stands above or below the field's `ground` (both in the room's units), metres - 0 where
 *  either is unknown (no ground judges no height). */
export const siegeOffGround = (ground, p) => (ground == null || !Number.isFinite(ground) || !Number.isFinite(p?.y) ? 0 : Math.abs(p.y - ground) / SIEGE_UNITS_PER_M);
/** AUDIT SEATS-3 B1: THE GROUND A FIGHTER (`sub`) IS HELD TO in battle `b`, in the room's units, or null for none - a
 *  siege's the field's (`b.ground`, siegeGround's at the last beat); a Royal Tourney's the bout's (`bout.y`, its marks'
 *  height - royalMarks) for the bout's two alone, a contender outside a bout held to none (it strikes nobody). */
export function siegeGroundOf(b, sub) {
  if (!b) return null;
  if (b.kind === 'royal') return b.bout && (b.bout.a === sub || b.bout.b === sub) && Number.isFinite(b.bout.y) ? b.bout.y : null;
  return Number.isFinite(b.ground) ? b.ground : null;
}
/**
 * AUDIT SEATS-3 B1: A STEP'S HEIGHT JUDGED - `next` kept within SIEGE_HEIGHT_M of the field's `ground`, or nearer it than
 * `last` (a fighter the ground left behind walks back to it, never further off); a first pose, or no ground, is kept.
 * refereeStep prices a climb as a run and a fall as nothing, and the ground was judged at a point alone - so a defender
 * climbed 45 m out of its attackers' reach, where every one of its own shafts did, a Tourney's
 * contender rose 30 m out of its rival's reach, and a fighter sunk 100 m under the field stood where nothing struck it.
 */
export const siegeStepLevel = (ground, last, next) => {
  const off = siegeOffGround(ground, next);
  return off <= SIEGE_HEIGHT_M || !last || off < siegeOffGround(ground, last);
};
/** The standing fighters of each side within a point's radius - AUDIT-SEATS R1: and within SIEGE_HEIGHT_M of the field's
 *  `ground` (siegeGround; null judges no height). */
function presentAt(fighters, point, ground = null) {
  let attack = 0, defend = 0;
  for (const f of fighters) {
    if (f.down || !f.pose || !f.here) continue;
    if (flat(f.pose, point) > SIEGE_BANNER.radiusM) continue;
    if (ground != null && Math.abs(f.pose.y - ground) / SIEGE_UNITS_PER_M > SIEGE_HEIGHT_M) continue;   // AUDIT-SEATS R1: above or below the field
    if (f.side === 'attack') attack++; else if (f.side === 'defend') defend++;
  }
  return { attack, defend };
}

/** THE WAVE A SIDE RISES ON (6.2): a palace's 20 seconds, a crown's 30, either side's. */
export function siegeWaveMs(b, side) {
  return SIEGE_WAVE_MS[b?.tier] ?? SIEGE_WAVE_MS.palace;
}

/**
 * ONE BEAT OF THE BATTLE (6.2, 6.5): `fighters` every fighter's `{ side, pose, down, here }` (`here` its socket in the
 * room), the battle moved on to `nowMs`. Each banner raised by the side alone at it (twenty seconds; the other side's
 * half-raise begun again), frozen while both stand there, falling back a second a second when left; a siege's Throne,
 * open while the attackers hold enough banners, raised by attackers alone at it and falling back otherwise - held its
 * time, the seat is taken. The clock: at its end a siege is the holder's, a Tourney the side with more banners' (a dead
 * heat `tie` - the service reads the higher influence). No attacker in a siege's room by ten minutes past the start: a
 * forfeit (`absent` when no defender came either - the holder keeps it, nothing more; DECIDED: 6.5's no-shows are a
 * siege's - a Tourney's absent contender simply holds no banners at its end). Each fighter in the room is credited its
 * seconds there (`stood`, Honours' half). Answers the beat's events (`{ k: 'banner', i, side }`, `{ k: 'end', result }`);
 * the battle's `result` once ended.
 */
export function battleStep(b, fighters, nowMs) {
  if (b.result || nowMs < b.startMs) return [];
  const dt = Math.max(0, Math.min(nowMs - Math.max(b.at, b.startMs), 5 * SIEGE_TICK_MS)) / 1000;
  b.at = nowMs;
  const out = [];
  for (const f of fighters) {
    if (!f.here || (f.side !== 'attack' && f.side !== 'defend')) continue;
    f.stood = (f.stood ?? 0) + dt;   // Honours' half (6.8): its seconds in the room since the start
    if (f.side === 'attack') b.attackSeen = true; else b.defendSeen = true;
  }
  const ground = anchoredGround(b, siegeGround(fighters));   // AUDIT-SEATS R1: the field's ground, this beat, held near its first
  b.ground = ground;   // kept for the ground a fighter is held to between beats (siegeGroundOf)
  b.banners.forEach((bn, i) => {
    const p = presentAt(fighters, b.field.banners[i], ground);
    const alone = p.attack && !p.defend ? 'attack' : p.defend && !p.attack ? 'defend' : null;
    if (p.attack && p.defend) return;   // contested: frozen
    if (alone && bn.side !== alone) {
      if (bn.by !== alone) { bn.by = alone; bn.raise = 0; }
      bn.raise += dt;
      if (bn.raise >= SIEGE_BANNER.raiseS) {
        bn.side = alone; bn.raise = 0; bn.by = null;
        if (alone === 'attack') b.raised = true;
        out.push({ k: 'banner', i, side: alone });
      }
      return;
    }
    bn.raise = Math.max(0, bn.raise - SIEGE_BANNER.decayPerS * dt);
    if (!bn.raise) bn.by = null;
  });
  if (b.kind === 'siege') {
    const rule = SIEGE_THRONE[b.tier] ?? SIEGE_THRONE.palace;
    const open = b.banners.filter((bn) => bn.side === 'attack').length >= rule.banners;
    const p = presentAt(fighters, b.field.throne, ground);
    if (open && p.attack && !p.defend) b.throne += dt;
    else if (!(open && p.attack && p.defend)) b.throne = Math.max(0, b.throne - SIEGE_THRONE.decayPerS * dt);
    // AUDIT-SEATS T1 (7.3: "A siege held only after the Throne was reached: -5"; 9.2: "The Throne was never reached"):
    // REACHED once its progress was ever above nought - the attackers stood alone at the open Throne for a beat; kept
    // for good (`th` on every receipt - net/siege/siegeReceipt.js), never undone by the decay
    if (b.throne > 0) b.reached = true;
    if (b.throne >= rule.holdS) return end(b, 'attack', out);
  }
  if (b.kind === 'siege' && !b.attackSeen && nowMs >= b.startMs + SIEGE_FORFEIT_MS) return end(b, b.defendSeen ? 'forfeit' : 'absent', out);
  if (nowMs >= b.endMs) {
    if (b.kind === 'siege') return end(b, 'defend', out);
    const a = b.banners.filter((bn) => bn.side === 'attack').length, d = b.banners.filter((bn) => bn.side === 'defend').length;
    return end(b, a > d ? 'attack' : d > a ? 'defend' : 'tie', out);
  }
  return out;
}
function end(b, result, out) {
  b.result = result;
  out.push({ k: 'end', result });
  return out;
}

/** HONOURS (6.8): "Every fighter who stood half the siege or felled a foe" - `stood` its seconds in the room standing,
 *  `felled` how many it brought down, against the battle's own run (`b.at` its end, from its start). */
export const honoured = (f, b) => ((f.felled ?? 0) > 0 || (f.stood ?? 0) * 1000 >= (Math.max(b.at, b.startMs) - b.startMs) / 2);

/** The room's door opens this long before the battle is joined - the sides gather at their camps (6.4: signing closes
 *  ten minutes before the start; DECIDED here: the door opens as it closes). */
export const SIEGE_OPENS_MS = 10 * 60_000;
/** A side's camp as a pose (6.2: the fallen rise there, a fighter enters there) - the height and facing kept from `was`,
 *  the ground's to settle. */
export const siegeCampPose = (b, side, was) => {
  const c = b.field.camps[side];
  return { x: c[0], y: Number.isFinite(was?.y) ? was.y : 0, z: c[1], yaw: Number.isFinite(was?.yaw) ? was.yaw : 0, pitch: 0 };
};

// ─── AUDIT-SEATS T3: A DISCONNECTED FIGHTER'S PLACE (Seats-Arc 16: "their place on the roster is kept 5 minutes; they
// return at their camp with the next wave. After 5 minutes a signed-up substitute may take the place"; 6.4) ───

/** A SIDE'S PLACES in the field - ten at a palace, twenty at a crown, its Sellswords within them (net/townSeatLaw.js
 *  SIEGE_SIDE_MAX, pinned equal: the service's roster counts no more) - and how long a fighter gone keeps its own. */
export const SIEGE_PLACES = Object.freeze({ palace: 10, crown: 20 });
export const SIEGE_PLACE_KEPT_MS = 5 * 60_000;
/** Whether a fighter holds its side's place at `now`: `here` (a socket in the room), or gone (`f.goneAt`, stamped by the
 *  relay at the leave it sees) less than SIEGE_PLACE_KEPT_MS. A fighter gone with no stamp is held. */
export const siegeHoldsPlace = (f, here, now) => here || !Number.isFinite(f?.goneAt) || now - f.goneAt < SIEGE_PLACE_KEPT_MS;
/** Whether `side` has a place free at `now` for an account that holds none: `fighters` the room's (`{ [sub]: f }`),
 *  `here(sub)` whether a socket of that account is in the room, `except` the account asking (its own place is not in
 *  the count - a fighter back inside its five minutes has one). */
export function siegePlaceFree(fighters, side, tier, here, now, except = null) {
  let held = 0;
  for (const [sub, f] of Object.entries(fighters ?? {})) if (sub !== except && f?.side === side && siegeHoldsPlace(f, here(sub), now)) held++;
  return held < (SIEGE_PLACES[tier] ?? SIEGE_PLACES.palace);
}
/**
 * A FIGHTER BACK FROM A DROP (its `in` after a leave): at its side's camp - and, the battle joined and not over, down
 * until its side's next wave, when it rises whole and protected as any fallen fighter does (siegeRise; a fighter that
 * fell before it dropped keeps its own wave). Before the start it simply stands at its camp; after the end nothing moves
 * (it came for its receipt). So a drop is never a way out of a fall: the place is kept, the ground is not. Answers
 * whether it waits for a wave (`f.upAt`).
 */
export function siegeReturn(b, f, now) {
  delete f.goneAt;
  if (!b || b.result || (f.side !== 'attack' && f.side !== 'defend')) return false;
  f.pose = siegeCampPose(b, f.side, f.pose); f.poseAt = now;
  if (now < b.startMs || f.down) return false;
  f.down = true;
  f.upAt = siegeNextWave(now, siegeWaveMs(b, f.side));
  return true;
}
const sideCode = (s) => (s === 'attack' ? 1 : s === 'defend' ? 2 : 0);
/**
 * THE FIELD'S FRAME (the relay's `f`, each second): `b` each banner `[held, its raise in whole seconds, by whom]` (0 no
 * one, 1 the attackers, 2 the defenders), `th` the Throne's whole seconds, `s` and `e` the battle's start and end (ms),
 * `n` who is in - `[attackers, defenders, spectators]`.
 */
export const siegeFieldFrame = (b, n) => ({
  k: 'f', b: b.banners.map((bn) => [sideCode(bn.side), Math.floor(bn.raise), sideCode(bn.by)]), th: Math.min(Math.floor(b.throne), (SIEGE_THRONE[b.tier] ?? SIEGE_THRONE.palace).holdS), s: b.startMs, e: b.endMs, n,   // AUDIT SEATS-2 R3: the Throne's seconds held to its hold - a late beat past it never outruns the wire's bound
});
/** The battle's next beat after `now`: a second on, or sooner where its start, a siege's forfeit mark or its end falls
 *  first - so a battle ends on its own clock, never a beat late. */
export function siegeNextBeat(b, now) {
  let next = now + SIEGE_TICK_MS;
  const marks = [b.startMs, b.endMs];
  if (b.kind === 'siege' && !b.attackSeen) marks.push(b.startMs + SIEGE_FORFEIT_MS);
  for (const m of marks) if (m > now && m < next) next = m;
  return next;
}

// ═════════════════════════════════════════════════════════════════════
// CROWN1 part two - THE ROYAL TOURNEY (Seats-Arc 7.6): "a duel ladder all week
// in the crown's city, at the castle's entrance square: DUEL1's ring, but
// every blow refereed by PVP-REF in a siege:-shaped room - a
// defender-resolved duel cannot award a title - the relay keeping the
// ladder". Its room is `royal:<crown seat key>:<seat week>` (DECIDED: not
// `siege:` itself - a crown's siege and its Royal Tourney may fall in the
// same week), open the whole week its Edict rules, by the service's pass
// (`sn` 'royal': a contender `duel`, or a spectator). One bout at a time in
// the ring: a contender challenges another, the other accepts, both are
// set on their marks whole, and after DUEL1's countdown only the two may
// strike each other - the referee above judging every blow, the ring held
// by the step (a bout's fighter past its edge pulled back). A fall ends the
// bout; DUEL1's longest a draw; a bout's fighter gone from the room loses.
// The winner is handed a signed receipt (net/siege/siegeReceipt.js `t1`), the
// ladder counts it - the same two at most ROYAL_PAIR_DAY_MAX a UTC day,
// as the service counts the receipts it is given (the champion is the
// service's to name, at the Turning). Pure, as above.
// ═════════════════════════════════════════════════════════════════════

/** A Royal Tourney's room - one a crown a week. */
export const ROYAL_ROOM = /^royal:(0|[1-9]\d{0,9}):(0|[1-9]\d{0,5})$/;
export const royalRoomKey = (key, week) => `royal:${key}:${week}`;
export const isRoyalRoom = (k) => ROYAL_ROOM.test(String(k ?? ''));
/** A room the referee keeps: a siege's, or a Royal Tourney's. */
export const isBattleRoom = (k) => isSiegeRoom(k) || isRoyalRoom(k);
/** A battle room's kind, seat and week - `{ kind: 'siege' | 'royal', key, week }` - or null. */
export function battleOfRoom(k) {
  const s = siegeOfRoom(k);
  if (s) return { kind: 'siege', ...s };
  const m = ROYAL_ROOM.exec(String(k ?? ''));
  return m ? { kind: 'royal', key: Number(m[1]), week: Number(m[2]) } : null;
}
/** DECIDED: the same two contenders' bouts count at most this many a UTC day - a rematch or two, never a farm (the
 *  service's own count, net/townSeatLaw.js ROYAL_PAIR_DAY, pinned equal). */
export const ROYAL_PAIR_DAY_MAX = 3;
/** The ladder's rows the room says. */
export const ROYAL_LADDER_SHOWN = 10;
/** A winner's receipts the room keeps for its reconnect, newest last. */
export const ROYAL_RC_KEEP = 20;

/** A Royal Tourney's field as its pass carries it: the ring's centre, one point - `{ ring: [x, z] }`, or null. */
export function royalFieldOf(sf) {
  if (!Array.isArray(sf) || sf.length !== 1) return null;
  const p = sf[0];
  if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e9)) return null;
  return { ring: [p[0], p[1]] };
}
/** A NEW ROYAL TOURNEY: no bout, an empty ladder. */
export const newRoyal = ({ startMs, endMs, field }) => ({
  kind: 'royal', tier: 'crown', startMs, endMs, field, bout: null, n: 0, ladder: {}, pairs: {}, asks: {}, at: startMs, result: null,
});
const utcDayOf = (ms) => Math.floor(ms / 86_400_000);
const pairOf = (x, y, ms) => `${x < y ? x : y}|${x < y ? y : x}|${utcDayOf(ms)}`;
/** A CHALLENGE: `from` asks `to` (account subjects) - it stands ROYAL_RING.askMs. A reason it may not, or null. */
export function royalAsk(b, from, to, now) {
  if (b?.kind !== 'royal' || b.result || now < b.startMs || now >= b.endMs) return 'the tourney is not open';
  if (!from || !to || from === to) return 'no such contender';
  if (b.bout && [b.bout.a, b.bout.b].some((x) => x === from || x === to)) return 'a bout is on';
  b.asks[from] = { to, at: now };
  return null;
}
/** AN ACCEPT: `by` takes `from`'s standing challenge, and the bout begins - after the countdown, to DUEL1's longest (never
 *  past the week). One at a time: refused while the ring holds another. `{ bout }` or `{ no }`. */
export function royalAccept(b, by, from, now) {
  if (b?.kind !== 'royal' || b.result || now >= b.endMs - ROYAL_RING.countdownMs) return { no: 'the tourney is not open' };
  const ask = b.asks[from];
  if (!ask || ask.to !== by || now - ask.at > ROYAL_RING.askMs) return { no: 'no such challenge' };
  if (b.bout) return { no: 'the ring is taken' };
  delete b.asks[from];
  b.n += 1;
  const startMs = now + ROYAL_RING.countdownMs;
  b.bout = { n: b.n, a: from, b: by, startMs, endMs: Math.min(b.endMs, startMs + ROYAL_RING.boutMs), gone: {} };
  return { bout: b.bout };
}
/** The bout's two marks as poses - the challenger's west of the centre, the other's east, each facing it (the height
 *  kept from `was`, the ground's to settle). AUDIT SEATS-3 B1: and the bout's ground recorded (`bout.y`, the marks'
 *  middle height - siegeGroundOf), each step and blow of its two held within SIEGE_HEIGHT_M of it. */
export function royalMarks(b, wasA, wasB) {
  const [x, z] = b.field.ring, d = ROYAL_RING.markM * SIEGE_UNITS_PER_M;
  const at = (dx, was, yaw) => ({ x: x + dx, y: Number.isFinite(was?.y) ? was.y : 0, z, yaw, pitch: 0 });
  const marks = [at(-d, wasA, Math.PI / 2), at(d, wasB, -Math.PI / 2)];
  if (b.bout) b.bout.y = (marks[0].y + marks[1].y) / 2;   // AUDIT SEATS-3 B1
  return marks;
}
/** AUDIT SEATS-3 B1: whether a bout's two stand level enough to meet - within SIEGE_HEIGHT_M of each other's height (an
 *  unknown height level), so neither starts a bout from where its marks' ground leaves the other out of reach. */
export const royalLevel = (p, q) => !Number.isFinite(p?.y) || !Number.isFinite(q?.y) || Math.abs(p.y - q.y) / SIEGE_UNITS_PER_M <= SIEGE_HEIGHT_M;
/** Whether `by` may strike `to` now: the running bout's two, its countdown run. */
export const royalMayStrike = (b, by, to, now) => !!b?.bout && now >= b.bout.startMs && now < b.bout.endMs
  && ((b.bout.a === by && b.bout.b === to) || (b.bout.b === by && b.bout.a === to));
/** Whether a bout's fighter may step to `p` - within the ring and its slack; anyone else anywhere. */
export function royalStepOk(b, sub, p) {
  if (!b?.bout || (b.bout.a !== sub && b.bout.b !== sub) || !p) return true;
  return Math.hypot((p.x - b.field.ring[0]) / SIEGE_UNITS_PER_M, (p.z - b.field.ring[1]) / SIEGE_UNITS_PER_M) <= ROYAL_RING.radiusM + ROYAL_RING.outSlackM;
}
/** A BOUT ENDED - `winner` its subject, or null for a draw: the ladder's win and loss, where the same two have not met
 *  ROYAL_PAIR_DAY_MAX times today (`counted`). `{ n, w, l, a, b, counted }` (`w`, `l` null in a draw), or null. */
export function royalEnd(b, winner, now) {
  const bt = b?.bout;
  if (!bt) return null;
  b.bout = null;
  const loser = winner === bt.a ? bt.b : winner === bt.b ? bt.a : null;
  let counted = false;
  if (loser) {
    const k = pairOf(bt.a, bt.b, now);
    counted = (b.pairs[k] ?? 0) < ROYAL_PAIR_DAY_MAX;
    if (counted) {
      b.pairs[k] = (b.pairs[k] ?? 0) + 1;
      (b.ladder[winner] ??= { w: 0, l: 0 }).w++;
      (b.ladder[loser] ??= { w: 0, l: 0 }).l++;
      (b.wonAt ??= {})[winner] = now;   // AUDIT-SEATS R10: its last counted win, on the room's clock (royalLadder's tie)
    }
  }
  return { n: bt.n, w: loser ? winner : null, l: loser, a: bt.a, b: bt.b, counted };
}
/** ONE BEAT OF A ROYAL TOURNEY: the lapsed asks forgotten; a bout past its time a draw; a bout's fighter gone from the room
 *  (`here(sub)` false) ROYAL_RING.goneMs loses it; at the week's end any bout a draw and the tourney over. Answers its
 *  events - `{ k: 'bout', ...royalEnd }`, `{ k: 'end', result: 'over' }`. */
export function royalStep(b, here, now) {
  if (b?.kind !== 'royal' || b.result) return [];
  const out = [];
  for (const [k, a] of Object.entries(b.asks)) if (now - a.at > ROYAL_RING.askMs) delete b.asks[k];
  const bt = b.bout;
  if (bt && now >= bt.endMs) out.push({ k: 'bout', ...royalEnd(b, null, now) });
  else if (bt) {
    for (const who of [bt.a, bt.b]) {
      if (here(who)) { delete bt.gone[who]; continue; }
      bt.gone[who] ??= now;
      if (now - bt.gone[who] >= ROYAL_RING.goneMs) { out.push({ k: 'bout', ...royalEnd(b, who === bt.a ? bt.b : bt.a, now) }); break; }
    }
  }
  if (now >= b.endMs) {
    if (b.bout) out.push({ k: 'bout', ...royalEnd(b, null, now) });
    b.result = 'over';
    out.push({ k: 'end', result: 'over' });
  }
  b.at = now;
  return out;
}
/** THE LADDER as the room says it: `[subject, wins, losses]`, the most wins first, then the fewest losses - AUDIT-SEATS
 *  R10: then the EARLIER last win, then the account: the service's champion rule (net/townSeatLaw.js royalStandings),
 *  so the room's first row is the one the Turning crowns. The tie went to the account alone, and with b winning first
 *  and a later the room showed a over b while the service crowned b. The last win is `b.wonAt` (royalEnd - the ladder's
 *  rows keep their `{ w, l }`); a contender with none (losses alone) reads 0, as the service's does. */
export const royalLadder = (b) => Object.entries(b?.ladder ?? {})
  .sort(([x, p], [y, q]) => q.w - p.w || p.l - q.l || (b.wonAt?.[x] ?? 0) - (b.wonAt?.[y] ?? 0) || (x < y ? -1 : 1)).slice(0, ROYAL_LADDER_SHOWN).map(([sub, r]) => [sub, r.w, r.l]);
/**
 * AUDIT-SEATS R5: THE CONTENDERS' RECORDS PRUNED - a contender whose socket is gone (`here(sub)` false) and who holds
 * nothing of the tourney (no ladder row, not in the bout, no challenge standing from or to it) is forgotten. Its record
 * is a whole fighter at its Renown (every bout ends both whole), so one that comes back is made again the same. The
 * field's bound was a count of records never deleted - forty-eight contenders entering on a Monday and leaving held the
 * ring shut to everyone until the Turning; the room's bound is now the contenders IN it (the relay's), and this keeps the
 * records it stores to the ones that mean something. Answers how many went.
 */
export function royalPrune(b, fighters, here) {
  let n = 0;
  const asked = new Set(Object.values(b?.asks ?? {}).map((a) => a.to));
  for (const sub of Object.keys(fighters ?? {})) {
    if (here(sub) || b?.ladder?.[sub] || b?.bout?.a === sub || b?.bout?.b === sub || b?.asks?.[sub] || asked.has(sub)) continue;
    delete fighters[sub];
    n++;
  }
  return n;
}
/** A Royal Tourney's next beat: each second while a bout is on (its draw, a fighter gone), else at the week's end. */
export function royalNextBeat(b, now) {
  if (b.bout) return Math.min(now + SIEGE_TICK_MS, Math.max(now + 1, b.bout.endMs));
  return Math.max(now + 1, b.endMs);
}
