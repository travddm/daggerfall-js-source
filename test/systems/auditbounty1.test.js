// AUDIT BOUNTY1 - the bounty boards and the online death penalty, taken in from the two archives Mac handed over and read
// line by line against this tree (`06-Systems/Bounty-Boards.md` 9, the integration's findings). B1-B4 are one pin
// per finding paid, each failing on the archive's own code; B5 pins the wiring the findings rest on. Host slices are MOUNTED from comment-stripped source where they can be
// run (the suite's precedent: auditpscale1's camp stand), matched where they are wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partyGroupMembers } from '../../src/systems/party/partyScale.js';
import { PACK_SPACING, PACK_ALERT_RADIUS } from '../../src/systems/campEncounters.js';
import { BOUNTY_MIN_PX, BOUNTY_MAX_PX, bountyItemRule } from '../../src/systems/bounty/bountyBoard.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const mount = (src, scope, tail) => { const k = Object.keys(scope); return new Function(...k, `${src}\n${tail}`)(...k.map((x) => scope[x])); };
/** The balanced `open`..`close` run starting at the first `open` at or after `from`. */
function balanced(text, from, open = '(', close = ')') {
  let depth = 0;
  for (let i = text.indexOf(open, from); i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(from, i + 1);
  }
  throw new Error('unbalanced');
}

test('AUDIT BOUNTY1 B3: the archive\'s words that no longer said the law - the ring and the blue - read as the constants do', () => {
  assert.deepEqual([BOUNTY_MIN_PX, BOUNTY_MAX_PX], [4, 10]);
  assert.equal(bountyItemRule(4).magicChance, 0.5, 'blue from level 4');
});

test('AUDIT BOUNTY1 B4: the relay pins in the tests that hold the relay version stand on the current version', () => {
  for (const f of ['test/net/soc1_hub.test.js', 'test/systems/allycast.test.js', 'test/net/guild1c.test.js', 'test/net/renown1.test.js']) {
    const t = read(f);
    assert.ok(t.includes("RELAY_VERSION, 'world285'"), `${f}: the pin is on world281`);
  }
});

