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

test('AUDIT BOUNTY1 B4: the relay pins say who moved it - BOUNTY1 + AUDIT 28 (world131 since MERGE 2; world125 at the merge of main; world122 and world123 on the branch), then REALM-DOOR (world130); STRIKE-SHARED moved it on after (world132), SOFTCAP1 after it (world133), PARTY-MAP after SOFTCAP1 (world134), WB9 after PARTY-MAP (world135), GATE-UX after WB9 (world136), KEPT-KILL after GATE-UX (world137), HERALD after KEPT-KILL (world138), LOOT7 after HERALD (world139), WB11 after LOOT7 (world140), CLIMB5 and CLIMB6 after WB11 (world141), FRIENDS-SYNC after CLIMB5 and CLIMB6 (world142), ELITE FOES after FRIENDS-SYNC (world143), SEAT1b after ELITE FOES (world144), SEAT1c after SEAT1b (world145), PVP-REF after SEAT1c (world146), SEAT2a after PVP-REF (world147), CROWN1 part two after SEAT2a (world148), SEASON1 part two, the banner ribbon after CROWN1 part two (world149), SEAT2b part two (b) after the banner ribbon (world150), and WB12 after SEAT2b part two (b) (world151), REVENANT-WIRE after WB12 (world152), and ARENA4 after BROKER-CAGE (world155 - world142 on its branch, renumbered past main\'s FRIENDS-SYNC to BROKER-CAGE at the merge), and HOTFIX 1003f after ARENA4 (world156), and AEGIS after the DFO integration\'s world157-world159 (world160), GUILD2 after AEGIS (world161) and PRIMARCH after GUILD2 (world162), and SUNBABY1 after PRIMARCH (world163)', () => {
  for (const f of ['test/net/soc1_hub.test.js', 'test/systems/allycast.test.js', 'test/net/guild1c.test.js', 'test/net/renown1.test.js']) {
    const t = read(f);
    assert.ok(t.includes("RELAY_VERSION, 'world281'"), `${f}: the pin is on world211`);
    assert.ok(/CHAP4c moved it on last \(world183[^\n]*CARDS10 moved it on \(world182[^\n]*TV-BEYOND moved it on \(world181[^\n]*TAVERN-TABLES moved it on \(world180[^\n]*HOURS-FIRST moved it on \(world179[^\n]*TAVERN CARDS moved it on \(world178[^\n]*THE WROTHGARIAN ZONE moved it on \(world177[^\n]*SUPER-DUNGEONS moved it on \(world176[^\n]*TEXT-F1 moved it on \(world175[^\n]*LEGACY7 moved it on \(world174[^\n]*SERPENT3 moved it on \(world173[^\n]*WATCH-FIX moved it on \(world172[^\n]*CRYSTAL-FIST moved it on \(world171[^\n]*FEUD moved it on \(world170[^\n]*AUDIT ARENA-LADDER moved it on \(world169[^\n]*SERAPH-WINGS moved it on \(world168[^\n]*SHADOW-CLOAK moved it on \(world167[^\n]*SERPENT2 moved it on \(world166[^\n]*SERPENT1 moved it on \(world165[^\n]*PARTY-LEAD moved it on \(world164[^\n]*SUNBABY1 moved it on \(world163[^\n]*PRIMARCH moved it on \(world162[^\n]*GUILD2 moved it on \(world161[^\n]*AEGIS moved it on \(world160[^\n]*ARENA4 moved it on \(world155[^\n]*BROKER-CAGE moved it on \(world154[^\n]*REVENANT-WIRE moved it on \(world153[^\n]*GLYPH-WEAR moved it on \(world152[^\n]*WB12 moved it on \(world151[^\n]*SEAT2b part two \(b\) moved it on \(world150[^\n]*SEASON1 part two, the banner ribbon moved it on \(world149[^\n]*CROWN1 part two moved it on \(world148[^\n]*SEAT2a moved it on \(world147[^\n]*PVP-REF moved it on \(world146[^\n]*SEAT1c moved it on \(world145[^\n]*SEAT1b moved it on \(world144[^\n]*ELITE FOES moved it on \(world143[^\n]*FRIENDS-SYNC moved it on \(world142[^\n]*CLIMB5 and CLIMB6 moved it on \(world141[^\n]*WB11 moved it on \(world140[^\n]*LOOT7 moved it on \(world139[^\n]*HERALD moved it on \(world138[^\n]*KEPT-KILL moved it on \(world137[^\n]*GATE-UX moved it on \(world136[^\n]*WB9 moved it on \(world135[^\n]*PARTY-MAP moved it on \(world134[^\n]*SOFTCAP1 moved it on \(world133[^\n]*STRIKE-SHARED moved it on \(world132[^\n]*MERGE 2 moved it on \(world131: the professions branch, BOUNTY1 \+ AUDIT 28[^\n]*REALM-DOOR moved it on \(world130/.test(t), `${f}: crediting BOUNTY1 + AUDIT 28, then REALM-DOOR`);
    assert.ok(!/world13[01][^\n]*REALM-DOOR moved it on last/.test(t), `${f}: and does not still credit REALM-DOOR with the move`);
  }
});

