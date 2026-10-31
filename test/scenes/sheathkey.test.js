// THE Z KEY IN A DUNGEON (2026-08-27, Mac's report: "cannot
// sheath/unsheath in dungeons").
//
// ReadyWeapon is polled by every host's frame on an edge
// (WeaponManager.Update:284 - not GameManager's dispatch chain). U45
// gave routeAction a ReadyWeapon arm for the large HUD's sheath panel,
// and from that commit the keyboard reached the same arm through
// routeKey in the two dungeon contexts (the only ctxs carrying
// toggleSheath): one press, two toggles, net nothing. These pins hold
// the keyboard OFF the polled action and the panel ON it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeKey, routeAction, POLLED_ACTIONS, setBindings } from '../../src/ui/input.js';
import { createBindings, resetDefaults } from '../../src/systems/inputActions.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

function dungeonLikeCtx() {
  let sheathed = true;
  return {
    uiOverlayActive: false,
    toggleSheath: () => { sheathed = !sheathed; },
    get sheathed() { return sheathed; },
  };
}

test('SHEATH: a Z press through the keyboard dispatch does NOT toggle - the frame poll owns it', () => {
  const b = createBindings(); resetDefaults(b); setBindings(b);
  const ctx = dungeonLikeCtx();
  // What the dungeon hosts do on keydown, then on the frame's edge.
  const consumed = routeKey({ code: 'KeyZ', key: 'z' }, ctx);
  assert.equal(consumed, false, 'routeKey declines the polled action (no preventDefault, nothing fired)');
  assert.equal(ctx.sheathed, true, 'keydown left the weapon alone');
  // The frame's edge, as every host runs it: one toggle per press.
  ctx.toggleSheath();
  assert.equal(ctx.sheathed, false, 'ONE press drew the weapon');
  setBindings(null);
});

test('SHEATH: the large HUD panel still reaches the door through routeAction', () => {
  const ctx = dungeonLikeCtx();
  assert.equal(routeAction('ReadyWeapon', ctx), true);
  assert.equal(ctx.sheathed, false, 'the panel toggled it once');
  // AUDIT 58 (f2/hosts): and the arm is HONEST about a ctx without the
  // door - it reports false, which is the whole reason a host missing
  // toggleSheath was silent rather than broken. This half of the pin
  // was the vacuous one: it drove the arm against dungeonLikeCtx()
  // alone, the one shape that already carried the door.
  assert.equal(routeAction('ReadyWeapon', { uiOverlayActive: false }), false,
    'no door on the ctx, no answer - the panel click is consumed by the BAR and nothing happens');
  assert.ok(POLLED_ACTIONS.has('ReadyWeapon'));
  // a12 MOVED THIS PIN, deliberately: SwitchHand is the second polled
  // action the comment invited. WeaponManager.Update reads it at :272,
  // one line above the equip-countdown block and two below ReadyWeapon
  // - the same frame, the same "not GameManager's chain" - and no
  // routeAction arm answers it, so routeKey must decline it too.
  assert.ok(POLLED_ACTIONS.has('SwitchHand'));
  // QS6 joined three more, and the reason is the same one twice over: a key
  // whose HOLD means something cannot be answered on its down edge, so the
  // frame's machine owns it and the keyboard dispatch declines. (The comment
  // above invited the third here rather than in a host; it arrived with two
  // siblings.) They are named, not counted loosely, so a fourth joins here too.
  assert.deepEqual([...POLLED_ACTIONS], ['ReadyWeapon', 'SwitchHand', 'QuickUse1', 'QuickUse2', 'QuickSpell']);
  assert.equal(POLLED_ACTIONS.size, 5, 'five polled actions; a sixth joins here, not in a host');
  assert.equal(routeAction('SwitchHand', ctx), false, 'no panel door - the frame poll is the only one');
});

// WEAPON-VIS2 (a player's report, 2026-09-16: "equipped, no crash,
// still invisible after 10 minutes idle" - a live toggleSheathCalls
// counter caught it climbing by exactly 2 for one press). AUDIT 58
// above gave world.js and exterior.js's hudCtx a toggleSheath door for
// the large HUD's panel - but unlike the two dungeon hosts, NEITHER of
// these two routes its keydown ladder through routeKey (both say so in
// their own comments: "This host runs its own ladder and never calls
// routeKey" / "these two outdoor hosts - which route their own keys").
// Their ladders end in a fall-through tail that calls routeAction
// DIRECTLY for whatever hudCtx answers - routeKey's POLLED_ACTIONS
// decline never stood between that tail and 'ReadyWeapon', so the door
// AUDIT 58 opened for a mouse click reopened the double-fire for the
// keyboard above ground and outdoors: one Z press, drawn then sheathed
// straight back, net nothing, forever. Same exclusion, same law,
// closed at the actual place the exclusion was missing.
test('SHEATH: the two outdoor fall-through tails decline POLLED_ACTIONS too - AUDIT 58\u2019s panel door did not silently reopen the double-fire it fixed once already', () => {
  for (const f of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const src = read(f);
    assert.match(src, /if \(POLLED_ACTIONS\.has\(act\)\) \{[^}]*\}\s*else if \(e\.repeat\) \{ e\.preventDefault\(\); return true; \}[^\n]*\n\s*else if \(routeAction\(act, hudCtx\)\) \{ e\.preventDefault\(\); return true; \}/,   // AUDIT KB1: and the repeat eaten between them - the press edge alone
      `${f}: the fall-through tail declines a polled action before it ever reaches routeAction, exactly as routeKey does`);
    // AUDIT MW-TORCH: the poll is now the ONLY door for Z in these two
    // hosts - so its presence is pinned beside the decline.
    assert.match(src, /if \(pressed\(latch\.edge, keys, 'ReadyWeapon'\)\) weaponRig\.readyWeapon\(\);/, `${f}: the frame's edge poll stands`);
  }
});
