// DISC24-A.
//
// THE BUG: DFU's class description is a MODAL box over the list (CreateCharClassSelect.cs :70-96) - the selection under
// it cannot move. The enhanced skin lays the list BESIDE the box, so a single click moved `classListIndex` (the header and
// "Play as a" read it) while `classConfirm` (the text) stayed the old row's - and Yes adopted `classListIndex`, so the
// player was given the class on the button, not the one they had read. The box belongs to the row it was opened on now.
//
// Driven through the real flow (ui/chargen.js ChargenFlow) and the real enhanced class stage against a fake document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ChargenFlow } from '../../src/ui/chargen.js';
import { DOUBLE_CLICK_DELAY_MS } from '../../src/ui/chargenArt.js';
import { SKILLS } from '../../src/systems/skills.js';

const career = (name) => ({
  name, hitPointsPerLevel: 8, advancementMultiplier: 1,
  strength: 40, intelligence: 60, willpower: 72, agility: 48, endurance: 52, personality: 55, speed: 48, luck: 57,
  primarySkills: [SKILLS.Mysticism, SKILLS.Alteration, SKILLS.Thaumaturgy],
  majorSkills: [SKILLS.Illusion, SKILLS.Destruction, SKILLS.Restoration],
  minorSkills: [SKILLS.Medical, SKILLS.ShortBlade, SKILLS.BluntWeapon, SKILLS.Dragonish, SKILLS.Daedric, SKILLS.Dodging],
});
const CAREERS = ['Mage', 'Spellsword', 'Battlemage', 'Nightblade'].map((n) => ({ name: n, career: career(n) }));
function atClass() {
  const f = new ChargenFlow(CAREERS, () => 0);
  f.input('confirm'); f.input('char:m'); f.input('confirm');   // race -> gender -> method -> class
  f.describeClass = (i) => [{ text: `About the ${CAREERS[i].name}`, center: false }];
  return f;
}
const double = (f, i, t) => { f.clickClassRow(i, t); f.clickClassRow(i, t + 1); };

test('DISC24-A: a single click on ANOTHER row closes the open description - the box is the row it was opened on', () => {
  const f = atClass();
  double(f, 3, 1000);   // read the Nightblade
  assert.equal(f.classConfirm[0].text, 'About the Nightblade');
  f.clickClassRow(1, 5000);   // Quest's single click on the Spellsword
  assert.equal(f.classListIndex, 1, 'the list follows the click');
  assert.equal(f.classConfirm, null, 'and the Nightblade\'s text is not left under the Spellsword\'s name (DFU\'s No)');
  assert.equal(f.state, 'class', 'nothing picked');
  // the new row is read as any row is - a double click
  f.clickClassRow(1, 5000 + DOUBLE_CLICK_DELAY_MS - 1);
  assert.equal(f.classConfirm[0].text, 'About the Spellsword');
});

test('DISC24-A: Yes gives the class that was READ - never a row clicked after it', () => {
  const f = atClass();
  double(f, 3, 1000);
  f.clickClassRow(3, 5000);   // a click on the SAME row leaves the box as it is
  assert.equal(f.classConfirm[0].text, 'About the Nightblade');
  f.applyHit({ setClass: 0 });   // the pointer path's selection door too
  assert.equal(f.classConfirm, null);
  double(f, 2, 9000);
  f.applyHit({ confirmClass: true });
  assert.equal(f.career.name, 'Battlemage', 'the class whose words were on the screen');
});

