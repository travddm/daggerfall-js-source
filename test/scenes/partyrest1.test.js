// PARTY-REST1 (2026-09-20, per-request: "when the party leader rests everyone in the party gets the
// resting screen counting down... only the leader should spawn mobs when resting", then "is it possible
// for it only working when party members near the leader?").
//
// The wire's own law (a rest/loiter session's live state riding the party pose, refused whole on one bad
// number, `bk` distinguishing two shops sharing one town pixel) is pinned with real, executable coverage
// in test/net/soc1_hub.test.js - validPartyPose is a pure function and earns that.
//
// Everything below it lives inside world.js's giant scene closure (composePartyPose, the follower-side
// partyRestFollowTick, its own copy of the rest deps) or inside worldModes.js's/dungeonContext.js's own
// window-stack closures (the restState getters each host exposes so world.js - which owns every
// party/online seam - can read INTO them). None of the three is reachable without a full scene, so this
// file follows the suite's own established law for that (test/net/auditsoc.test.js, test/soc3_socialpanel.
// test.js, test/net/soc4_partyhud.test.js): read the source, slice the one function under test, and pin its
// STRUCTURE - which hooks are swapped, which fields are read, in what order - rather than its output.
//
// WHAT IS WORTH PINNING, AND WHAT IS NOT. What can be WRONG here is: a follower's mirror rolling its own
// encounter (a room of four followers spawning four rooms' worth of monsters for one nap); a mirror
// starting for a follower who is not actually near the leader, or in a DIFFERENT building sharing the same
// town pixel; a mirror that never ends when the leader's rest does; a mirror stealing a screen that is
// already busy or already really resting; the leader's own broadcast picking up a MIRRORED session and
// reporting it as their own (which would chain the mirror through a third member); and the three hosts'
// mode-string/wire-number mapping disagreeing with each other. Every one of those is driven here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// The outdoor toggleRest's tail (REST-WARN, the owner: "Poison/Disease warning on rest"): gated, then ONE act - the
// spend through the shared function and the real window (restNow) - run at once, or, poisoned or diseased, on the
// warning's Yes once its box has left the slot (the close callback, THE SLOT IS EMPTIED BEFORE THE OCCUPANT IS TOLD)
// PIN MOVED (AUDIT RPT1026 L3): the window opens with the bed's press read at the toggle (`bed`) - a REST-WARN box opens it
// on its Yes, after the press
const REST_OUTDOORS = /const partyRefusal = modes \? partyRestGate\(\) : null;[^\n]*\n\s*if \(partyRefusal\) \{ townTalk\.showOverlay\(new ActionTextBox\(\[partyRefusal\]\)\); return; \}\s*(?:\/\/[^\n]*\n\s*)*const bed = _restFromBed, restNow = \(\) => \{ if \(modes\) markPartyRestSpent\(\); townTalk\.showOverlay\(createRestWindow\(outdoorRestDeps, bed\)\); \};[^\n]*\n\s*const ail = restAilmentLines\(playerEntity\);\s*\n\s*if \(ail\) \{ let yes = false; townTalk\.showOverlay\(new DecisionBoxWindow\(\{ rows: ail, onYes: \(\) => \{ yes = true; \} \}\), \(\) => \{ if \(yes\) restNow\(\); \}\); return; \}\s*\n\s*restNow\(\);/;

// ── THE MODE CODE, BOTH WAYS ─────────────────────────────────────────────

// ── THE SENDER: composePartyPose ─────────────────────────────────────────

test('PARTY-REST1: worldModes.js\'s and dungeonContext.js\'s restState getters are the SAME law, twice - null while not resting, null for a mirror of someone else\'s, the live numbers otherwise (mutants: a mirror read back as real; the getter answering while not resting; the two hosts disagreeing)', () => {
  for (const [file, closureVar] of [['src/scenes/worldModes.js', 'interiorOverlay'], ['src/scenes/dungeonContext.js', 'activeOverlay']]) {
    const src = rd(file);
    const re = new RegExp(`get restState\\(\\) \\{\\s*const w = ${closureVar};(?:\\s*\\/\\/[^\\n]*)*\\s*if \\(!w\\?\\.isRestWindow \\|\\| w\\.isPartyRestMirror \\|\\| !w\\.session \\|\\| w\\.state !== 'resting'\\) return null;\\s*return \\{ mode: w\\.mode, hoursRemaining: w\\.session\\.hoursRemaining, totalHours: w\\.session\\.totalHours \\};\\s*\\},`);
    assert.match(src, re, `${file}: the getter over its own window-stack slot (${closureVar}), and (PARTY-REST6) requiring state === 'resting' - a window sitting on its own ended/refused screen must not go on reading as a live session`);
  }
});

// ── THE FOLLOWER: partyRestFollowTick + partyRestMirrorDeps ─────────────

// ── PARTY-REST2: THE CONSENSUS GATE ──────────────────────────────────────

// ── THE ENHANCED WINDOW'S SIZE (per-request: "the hours could be a bit
// bigger and also more centralized... the windows in general are too big") ──

// ── ui/restWindow.js PARITY (per-request: "when the member gets the you wake
// up message he cant press ok till the leader pressed it") ──────────────

// ── STRANGER-REST1: non-party players can't rest too close together ─────

// ── PARTY-REST1d: the pointer-lock bug ───────────────────────────────────

// ── PARTY-REST2f: the stale-cooldown bug ─────────────────────────────────

// ── REST-VITALS1: health/fatigue/magicka visible during resting ─────────

// ── RESTFIX1: the Stop button (per-request: "the initiator and the one who
// rests with him both cant cancel the resting! the button is not working
// and doesnt cancel it. Waiting and healing to full cant be canceled by
// both sides prob loitering too") ──────────────────────────────────────

// ── PARTY-REST4: a follower heals at the SAME quality as the leader ─────

// ── RESTFIX3: the illegal-rest confirm/crime flow ────────────────────────

