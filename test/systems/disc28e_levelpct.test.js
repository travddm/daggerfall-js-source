// LEVEL-PCT. GrimoireUI is the classic skin under an art pack, so its Level box is the classic sheet's
// (ui/charsheet.js _showLevel), and that box prints DFU's skill-sum fraction in DFU's own precision: `float currentLevel`
// is a single, and in a double two spans in fifteen read a point off what DFU's box reads. The Ascension's crown reads
// the same sum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CharSheet, CHARSHEET_RECTS, levelProgressPercent } from '../../src/ui/charsheet.js';
import { levelProgress, viewOnlyScreen, levelUpFrame, LANE_OGHMA } from '../../src/ui/levelUp/levelUpView.js';
import { createCharSheetWindow } from '../../src/ui/charSheetDoor.js';
import { SPECIAL_ARTIFACT_HANDLERS, ARTIFACTS } from '../../src/systems/artifactEffects.js';
import { createCharacter } from '../../src/systems/chargen.js';
import { raiseSkills, skillUsesForAdvancement, SKILL_ADVANCEMENT_MULTIPLIER } from '../../src/systems/advancement.js';
import { SKILLS } from '../../src/systems/skills.js';
import { CLASSIC_GAME_START_TIME as T0 } from '../../src/systems/gameDate.js';
import { codeHasOnce } from '../codeOnly.mjs';

const seq = (...v) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)];
};
const career = {
  name: 'W',
  hitPointsPerLevel: 12,
  advancementMultiplier: 1.0,
  strength: 60,
  intelligence: 40,
  willpower: 45,
  agility: 55,
  endurance: 60,
  personality: 40,
  speed: 50,
  luck: 50,
  primarySkills: [SKILLS.LongBlade, SKILLS.Axe, SKILLS.CriticalStrike],
  majorSkills: [SKILLS.BluntWeapon, SKILLS.Dodging, SKILLS.Jumping],
  minorSkills: [SKILLS.ShortBlade, SKILLS.Archery, SKILLS.Running, SKILLS.Swimming, SKILLS.Climbing, SKILLS.Medical],
};
// A character minted, then one skill pass raising a primary (the sum +1) and two misc skills (the sum untouched): the
// sum one past its anchor, which DFU's arithmetic reads as 93%.
function played() {
  const p = { isPlayer: true, reflexes: 2, items: [] };
  createCharacter(p, career, 16, { rolls: seq(0) });
  const skills = [SKILLS.Etiquette, SKILLS.Backstabbing, SKILLS.LongBlade];
  for (const s of skills)
    p.skillUses[s] = skillUsesForAdvancement(p.skills[s], SKILL_ADVANCEMENT_MULTIPLIER[s], 1.0, p.level);
  assert.deepEqual(
    raiseSkills(p, T0 + 361, seq(0), () => {}),
    skills,
    'one pass raises all three',
  );
  return p;
}
const box = (entity) => {
  const w = new CharSheet(entity, {});
  const [x, y, ww, h] = CHARSHEET_RECTS.level;
  w.click(x + ww / 2, y + h / 2);
  return w.child.lines;
};

test('LEVEL-PCT: the sum moves one for a pass that raises a primary and two misc skills, and the box and the Ascension both read it', () => {
  const c = played();
  assert.equal(c.currentLevelUpSkillSum - c.startingLevelUpSkillSum, 1);
  assert.deepEqual(box(c), ['Progress made to the next level: 93%']);
  assert.deepEqual(levelProgress(c, viewOnlyScreen(c)), { now: 14, max: 15, label: 'Skill progress to next level' });
});

test('LEVEL-PCT: the Oghma Infinium window reads the sum too', () => {
  const c = played();
  SPECIAL_ARTIFACT_HANDLERS.get(ARTIFACTS.OghmaInfinium).used({ entity: c, ctx: {} });
  const frame = levelUpFrame(c, createCharSheetWindow({ entity: c }));
  assert.equal(frame.lane, LANE_OGHMA, 'the book window');
  assert.deepEqual(frame.progress, { now: 14, max: 15, label: 'Skill progress to next level' });
});

test("LEVEL-PCT: the classic box is LevelButton_OnMouseClick in DFU's own precision (`float currentLevel`, a single)", () => {
  // (current - starting + 28) / 15f, its fraction truncated to a percent - the values DFU's single-precision
  // arithmetic prints over a level's fifteen spans (the sum never falls below its start, so 28 to 42). A double reads
  // 36 as 39 and 39 as 60; DFU prints 40 and 59 (AUDIT 28e: the first pin's window began at 26, and its example, 27,
  // is a span no character reaches).
  const dfu = [86, 93, 0, 6, 13, 20, 26, 33, 40, 46, 53, 59, 66, 73, 79];
  const port = dfu.map((_, i) =>
    levelProgressPercent({ startingLevelUpSkillSum: 100, currentLevelUpSkillSum: 100 + i }),
  );
  assert.deepEqual(port, dfu);
});
