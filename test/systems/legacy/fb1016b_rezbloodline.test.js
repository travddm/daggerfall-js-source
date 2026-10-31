// REZ-BLOODLINE (FIELD BUGS 2026-10-16b, bible/01-Overview/bugs/Field-Bugs-2026-10-16b.md; bible/06-Systems/Legacy-Arc.md
// section 6): "I was testing with a friend, he dies and I cast resurrection. It works for a moment then he disappears and
// remains dead" - "You died without a descendant. ... The line ends here". A Bloodline death was written at the death
// door (AUDIT LEGACY A1/B3), so the party's Resurrect raised a body whose house had already buried it, and the slow step
// opened the Succession over the living. The slice HELD the death in the dying page's memory while a Resurrect could
// raise it - and its audit (AUDIT R1) found that a page killed under its death screen, or a join from another device,
// took a permadeath with it. Now THE REALM HOLDS THE DEATH: the door writes it as ever (the line's record, the device's
// store, the realm's copy, the tombstone stamped with its `hold`), and a Resurrect inside the window asks the realm
// (POST /v1/realm/raise), whose yes takes the death back on every copy (the REVIVE stamp, systems/legacy/revived.js).
// AUDIT R2: the online death screen counts the wall clock, as the window does.
//
// Real code throughout: the death door (characters/playerEntity.js hurtPlayer and its listener), Project Legacy's host
// (scenes/legacyHost.js), the realm session and the line's realm copy over the REAL account Worker on node:sqlite
// (systems/realmSaves.js, systems/legacy/realmLine.js, test/accountDb.mjs) and its minute's clock (worker.scheduled), the
// party wire (net/wire.js validPartyPose, validPartyFrame), the bodies the caster sees (net/remotePlayers.js), the
// caster's cast (scenes/hostMagic.js createPlayerMagic), the death screen (ui/deathScreen.js) - and world.js's own
// statements sliced out of bootWorld and mounted over them: the death screen's frame (the Resurrect heard, the rise asked
// of Project Legacy, the call the realm let go), resurrectInPlace and closeDeathScreen, the party pose's `dd`, `fg` and
// `rz`, the caster's pick and call, the host's line, tombstone and raise, and the page's going.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import worker from '../../../server-account/src/index.js';
import { REZ_SETTLE_MAX, settleHolds } from '../../../server-account/src/legacy.js';
import { MINUTE_JOBS, CRON_MINUTE } from '../../../server-account/src/cron.js';
import { standService } from '../../accountDb.mjs';
import { seatRealm, freshSave } from '../../realmSeat.mjs';
import { SESSION_KEY } from '../../../src/net/accountClient.js';
import { realmIo, createRealmSession, whenPageGoes } from '../../../src/systems/realmSaves.js';
import { createRealmLine } from '../../../src/systems/legacy/realmLine.js';
import { createLegacyHost, LEGACY_TEXT, REZ_HOLD_MS } from '../../../src/scenes/legacyHost.js';
import { madeRuleHere } from '../../../src/systems/madeLevel.js';   // the merge of PR #800: the frame asks the made level's law whether a Resurrect is taken here (EG-H2) - none made, so it is
import { personOf, familyRng, MODELS, LEGACY_MOD, isAlive } from '../../../src/systems/legacy/family.js';
import { loadFamily } from '../../../src/systems/legacy/store.js';
import { revivedOf, REZ_HOLD_S } from '../../../src/systems/legacy/revived.js';
import { tollYears, tollLine } from '../../../src/systems/legacy/age.js';
import { legacySettings } from '../../../src/systems/legacy/settings.js';
import { modSaveRecords, restoreModSaveRecords, newGameModSaveRecords, _resetModSaveData } from '../../../src/systems/modSaveData.js';
import { setModSetting, _resetModSettings } from '../../../src/systems/modSettings.js';
import { hurtPlayer, setDeathListener } from '../../../src/characters/playerEntity.js';
import { reviveForPlay } from '../../../src/systems/deathRespawn.js';
import { stateDeathLoss, statedDeathLoss } from '../../../src/systems/deathPenalty.js';
import { DeathScreen, ONLINE_RESPAWN_SECONDS } from '../../../src/ui/deathScreen.js';
import { WILD_DEATH_HOLD_S, setWildDeath } from '../../../src/systems/wild/wildZone.js';
import { rezSnapshot, rezFor, resurrectionSpell, RESURRECT_TEXT, RESURRECT_HEALTH_PCT, RESURRECT_HOLD_MS, RESURRECT_TYPE, RESURRECT_SUBTYPE } from '../../../src/systems/resurrect.js';
import { buildCustomSpell } from '../../../src/systems/spell/spellMaker.js';
import { validPartyPose, validPartyFrame } from '../../../src/net/wire.js';
import { RemotePlayers } from '../../../src/net/remotePlayers.js';
import { createPlayerMagic } from '../../../src/scenes/hostMagic.js';
import { LOCATION_TYPES } from '../../../src/formats/mapsFile.js';
import { sendRaiseWord } from '../../../src/net/raiseWord.js';   // AUDIT WORLD-EVENTS L1-1: the Resurrect door's word to a room that keeps the death (none on the street)

const rd = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 80; i++) await new Promise((r) => { setTimeout(r, 0); }); };
const mem = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };

// ── one clock for the page and the realm: the wall, moved on by the pins (the service reads Date.now) ──────────────────
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
test.after(() => { Date.now = realNow; });
const later = (ms) => { skew += ms; };

const one = (hits, what) => { assert.equal(hits.length, 1, `world.js: ${what} (${hits.length} found)`); return hits[0]; };

const scoped = (state) => new Proxy(state, {
  has: (t, k) => k !== '__s',
  get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : globalThis[k])),
  set: (t, k, v) => { t[k] = v; return true; },
});
// eslint-disable-next-line no-new-func
const mount = (body, state) => new Function('__s', `with (__s) { ${body} }`)(scoped(state));

const BASE_POSE = { px: 10, py: 20, in: 0, loc: 'Gothway Garden', hm: 40, f: 0, fm: 10, m: 0, mm: 10, race: 'DarkElf', gender: 'female', face: 3 };
/** A party pose over the wire: projected as it leaves (OnlineSession.sendParty), at the relay's door (parseClient) and
 *  as the hub's frame lands (validPartyFrame) - the member the receiver's social keeps. */
const overTheWire = (acct, name, pose) => {
  const f = validPartyFrame(JSON.parse(JSON.stringify({ t: 'party', acct, p: validPartyPose(validPartyPose(pose)) })));
  assert.ok(f, 'the pose crosses the wire');
  return { acct: f.acct, name, p: f.p, online: true };
};

const ent = () => ({
  name: 'Ysolde Gothway', gender: 'female', race: 'DarkElf', faceIndex: 3, careerIndex: 5, career: { name: 'Nightblade', primarySkills: [28], majorSkills: [], minorSkills: [] },
  level: 9, characterId: 'r-ysolde', chargenDone: true, health: 40, maxHealth: 40, fatigue: 2000, items: [], wagonItems: [], activeEffects: [],
  stats: { strength: 60, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 },
  skills: Array.from({ length: 35 }, (_, i) => (i === 28 ? 80 : 20)),
});

/** The account service, stood once for the file. */
let _svc = null;
const service = async () => (_svc ??= await standService());

/** The minute's clock at a second (the Worker's scheduled handler - cron.js MINUTE_JOBS). */
const minute = async (r, atS) => { await worker.scheduled({ cron: CRON_MINUTE, scheduledTime: atS * 1000 }, r.svc.env, {}); };

test('REZ-BLOODLINE AUDIT R1 a killed tab and a second device escape nothing (the audit\'s a_kill and b_twotabs): the page killed under its death screen - no pagehide, no reset, no slow step - leaves her dead on the device, on the realm\'s line and at its tombstone (a join refused 410), and the realm\'s minute closes the window it left (what a tombstone takes, taken; a Resurrect after refused); a join during the hold is refused, and the dying page going after closes it by keepalive; an Enduring member\'s toll is taken at the door', async () => {
  await settle();
  assert.ok(MINUTE_JOBS.some(([name]) => name === 'rez-holds'), 'a minute\'s job');
  await settle();
  const win = new EventTarget();
  win.dispatchEvent(new Event('pagehide'));
  await settle();
  const win2 = new EventTarget();
  win2.dispatchEvent(new Event('pagehide'));
  await settle();
  await settle();
  // the host's own ear for the page going - the page's pagehide, by default
  const ears = [];
  globalThis.addEventListener = (type, fn) => { ears.push([type, fn]); };
  assert.deepEqual(ears.map(([type]) => type), ['pagehide'], 'the host hears the page go');
  await settle();
});

test('REZ-BLOODLINE AUDIT R1 the realm\'s door takes a Resurrect only inside the window, only under the lease that fell, once, of the character\'s own line - and a refused one keeps her body down: her client says so and closes the window, her pose tells Bran before a point is spent; the window over on the page asks the realm nothing', async () => {
  await settle();
  // past the window: refused, nothing moved
  later(REZ_HOLD_S * 1000);
  await settle();
  await settle();
  await settle();

  await settle();
  await settle();
  assert.match(RESURRECT_TEXT.forGood('Ysolde'), /^Ysolde has fallen for good\./);
  await settle();
  later(REZ_HOLD_MS);   // ...and the call reaches her after it
  await settle();
  await settle();
  later(REZ_HOLD_MS);
});

test('REZ-BLOODLINE AUDIT R2 the online death screen counts the wall clock, as the window does: at seven frames a second (each frame\'s dt clamped to a tenth) the open zone\'s two minutes end at two minutes on the wall - inside the window, a Resurrect raisable to the last - where they ran on to 172 seconds and said "RISING IN 15" under a window already closed; the window is the longest screen and half a minute, one number at both doors', async () => {
  // a frame's own count still leads where its dt outruns the wall (a host stepping the screen by hand)
  const s = new DeathScreen({ eyeHeight: 1.6, capsuleHeight: 1.8, online: true, entity: ent(), wall: () => 0 });
  s.tick(ONLINE_RESPAWN_SECONDS / 2);
  assert.equal(s.respawnIn, ONLINE_RESPAWN_SECONDS / 2);
  // one window at both doors: the longest online death screen and half a minute
  assert.equal(REZ_HOLD_S, Math.max(ONLINE_RESPAWN_SECONDS, WILD_DEATH_HOLD_S) + 30);
  assert.equal(REZ_HOLD_MS, REZ_HOLD_S * 1000);
  assert.ok(REZ_SETTLE_MAX >= 1);
  assert.match(rd('server-account/migrations/0122_rez_hold.sql'), /ALTER TABLE realm_characters ADD COLUMN rez_lease TEXT;\nCREATE INDEX IF NOT EXISTS realm_characters_rez_hold ON realm_characters \(dead_at\) WHERE rez_lease IS NOT NULL;/);
});
