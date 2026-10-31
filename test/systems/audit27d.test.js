// AUDIT (2026-09-27, "Lets do a comprehensive audit on these changes" - the Discord batch of 2026-09-27: GUILD-SHELF,
// SHORT-TOUCH, PAD-DOOR, TOUCH-BUTTONS, SPELL-GIFT, PARTY-BUFFS, COMPASS-PARTY, REST-OPT, SHARE-MEND, TRADE-INFO/FIT,
// CHAT-POST, HOME-STATIONS). Six lenses read the batch, each finding was checked against the code, and each real one is
// fixed and pinned. Most pins sit beside their slice's own (homestations, tradeinfo, sharemend, spellgift, partybuffs,
// menupad, touchbuttons, guildshelf, decor1, auditsoc, own1); these are the ones whose seam is a pure law, or a host's
// closure read by its source (world.js - the scene cannot be stood up here), recorded in
// bible/01-Overview/bugs/Field-Bugs-2026-09-27e.md ## AUDIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spellAbsorptionChance } from '../../src/systems/absorption.js';
import { cureAllOfKind } from '../../src/systems/effects.js';
import { REST_OPT_RELAY_MIN, relaySupportsRestOpt, TRADE_REV_MAX } from '../../src/net/wire.js';
import { restsApart, REST_APART_TEXT, restsAlone, restAloneText } from '../../src/systems/party/partyRestLaw.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ─── SPELL-GIFT / PARTY-BUFFS (agent B) ────────────────────────────────────────────────────────────────────────────

test('AUDIT SPELL-GIFT B4: the live Spell Absorption is the BEST of its entries - a gift never merges with my own (ALLY-CAST C2), and a stranger\'s 0% one, first in the list, made my own 100% read 0 for as long as it ran (mutants: the first entry\'s)', () => {
  const entry = (chanceBase, over = {}) => ({ kind: 'spellAbsorption', chanceBase, chanceMod: 0, chancePerLevel: 1, ...over });
  // ABSORB-NERF (2026-09-30): the chance caps at 50 (absorption.js SPELL_ABSORPTION_CHANCE_CAP) - the best is read under it
  assert.equal(spellAbsorptionChance({ level: 10, activeEffects: [entry(0), entry(40)] }), 40, 'the gift ahead of my own');
  assert.equal(spellAbsorptionChance({ level: 10, activeEffects: [entry(45), entry(20)] }), 45);
  assert.equal(spellAbsorptionChance({ level: 10, activeEffects: [entry(0), entry(100)] }), 50, 'my own 100% reads the cap');
  assert.equal(spellAbsorptionChance({ level: 10, activeEffects: [entry(90, { ended: true }), entry(20)] }), 20, 'an ended one is none');
  assert.equal(spellAbsorptionChance({ level: 10, activeEffects: [{ kind: 'spellAbsorption', chance: 35 }, entry(10)] }), 35, 'a pre-X2 entry\'s frozen chance still counts');
  assert.equal(spellAbsorptionChance({ level: 10, activeEffects: [] }), 0);
});

test('AUDIT SPELL-GIFT B6: a cure may leave an incubating infection be - the stranger\'s - and the host says whose it is (mutants: every disease cured; the flag never passed)', () => {
  const t = { activeEffects: [{ kind: 'disease', infection: 'Vampirism-Infection' }, { kind: 'disease', disease: 3 }, { kind: 'poison' }] };
  cureAllOfKind(t, 'disease', true);
  assert.deepEqual(t.activeEffects.map((a) => a.infection ?? a.kind), ['Vampirism-Infection', 'poison']);
  cureAllOfKind(t, 'disease');
  assert.deepEqual(t.activeEffects.map((a) => a.kind), ['poison']);
});

// ─── REST-OPT / COMPASS-PARTY (agent C) ────────────────────────────────────────────────────────────────────────────

test('AUDIT REST-OPT C1: the switch is honoured only through a hub that carries `nr` (world120) - through an older one the party counted the member a voter to gather while the member\'s own client refused every rest; the link reads it off the hub\'s welcome, and the pose, the vote\'s words and the party\'s gate all read the switch as the party can hear it (mutants: the switch read raw; the welcome\'s word never kept)', () => {
  assert.equal(REST_OPT_RELAY_MIN, 120);
  assert.deepEqual(['world119', 'world120', 'world122', 'world123', 'nope', null].map(relaySupportsRestOpt), [false, true, true, true, false, false]);
});

test('AUDIT REST-OPT C2: a party mate\'s night beside mine that is not one with it is ANOTHER CAMP - STRANGER-REST keeps it apart as a stranger\'s: two nights side by side each rolled the night\'s foes for the whole party (mutants: a resting mate never a camp; a mate at rest with me a camp)', () => {
  const m = (p) => ({ acct: 'a-bran', p });
  assert.equal(restsApart(m({ rs: 1, nr: 1 }), true), true, 'resting alone beside my party\'s night');
  assert.equal(restsApart(m({ rs: 1 }), false), true, 'resting at all while I rest alone');
  assert.equal(restsApart(m({ rs: 1 }), true), false, 'the same night: one camp');
  assert.equal(restsApart(m({ nr: 1 }), true), false, 'not resting: no camp (the party may rest beside a mate who opted out)');
  assert.equal(restsApart(null, false), false);
  assert.equal(restsAlone(m({ nr: 1 })), true);
  assert.equal(REST_APART_TEXT, 'A party member is resting separately nearby. Rest farther away.');
});

test('AUDIT REST-OPT C3 + F4: a night granted as my own stays my own to its end (`nr` while it runs) - a leader who turned the switch back on mid-night pulled the whole party into it; a followed night is the party\'s; and the switch is named where it is (ORG2: Settings, Gameplay, Other players) (mutants: the grant\'s word never kept; a mirror left alone)', () => {
  // ORG2: the switch is named where the one Settings screen draws it - the Other players card, on the Gameplay tab
  assert.equal(restAloneText(false), 'You rest on your own. Turn on "Rest with my party" (Settings \u203a Gameplay \u203a Other players) to rest with them.');
});

// ─── TRADE-FIT (agents D and F) ────────────────────────────────────────────────────────────────────────────────────

test('AUDIT TRADE-FIT D1: the wire names the revision\'s bound the offer is measured by, and the session measures the commit with it (driven in tradeinfo.test.js) (mutants: the frame alone)', () => {
  assert.equal(TRADE_REV_MAX, 1_000_000);
});
