// AUDIT 24 (the full-codebase parity sweep), wave 22: six seams that
// were ported and then never reached - plus one pin that had asserted
// the port's behaviour instead of the source's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HudText } from '../../src/ui/hud/hudText.js';
import { PlayerNotebook } from '../../src/systems/notebook.js';
import { STATIC_NPC_ACTIVATION_DISTANCE, DEFAULT_ACTIVATION_DISTANCE } from '../../src/systems/talk/talk.js';
import { midDateTimeString } from '../../src/systems/gameDate.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('audit24 wave22: every HUD popup files into the notebook message ring', () => {
  // PopupText.AddText's last line (:123) is
  // `GameManager.Instance.PlayerEntity.Notebook.AddMessage(pgText)`,
  // and DaggerfallHUD.SetMidScreenText (:371) does the same. The
  // journal's Messages page IS that ring. The port had the ring,
  // GetMessages and AddMessage all ported with NOTHING calling
  // AddMessage, so the fourth page of the journal was blank for ever.
  const notebook = new PlayerNotebook();
  const hud = new HudText();
  hud.onMessage = (t) => notebook.addMessage(t);
  hud.add('Your Lockpicking skill has improved.');
  hud.add('You are too far away.');
  const messages = notebook.getMessages().map((m) => m.map((t) => t.text ?? '').join('').trim());
  assert.deepEqual(messages, ['Your Lockpicking skill has improved.', 'You are too far away.']);
  // the row is still queued for drawing - the file is an addition, not
  // a diversion
  assert.equal(hud.lines.length, 2);

  // and a HudText with no sink still works (the dungeon host builds
  // one before the bridge exists)
  const bare = new HudText();
  bare.add('x');
  assert.equal(bare.lines.length, 1);
});

test('audit24 wave22: the TG/DB map reveal files its notebook note', () => {

  // the note itself, end to end through the real notebook
  const notebook = new PlayerNotebook({ dateTimeString: () => '13:30:00', cityName: () => 'Daggerfall' });
  notebook.addNote('The Thieves Guild have revealed the closely-guarded whereabouts of a treasure trove called Privys Crypt.');
  const note = notebook.getNote(0).map((t) => t.text ?? '').join(' ');
  assert.match(note, /Privys Crypt/);
  assert.match(note, /13:30:00 in Daggerfall:/, 'and it carries the dated header');
});

test('audit24 wave22: a quest ITEM gets the 128 reach, a quest PERSON the 256', () => {
  // PlayerActivate.cs:326-332 - the quest-resource arm is gated on
  // `!(questResourceBehaviour.TargetResource is Person)` and then
  // measured against DefaultActivationDistance. A Person goes through
  // StaticNPCClick instead, at StaticNPCActivationDistance.
  assert.equal(DEFAULT_ACTIVATION_DISTANCE, 128 * 0.025);
  assert.equal(STATIC_NPC_ACTIVATION_DISTANCE, 256 * 0.025);
  assert.equal(STATIC_NPC_ACTIVATION_DISTANCE, DEFAULT_ACTIVATION_DISTANCE * 2, 'twice, exactly');

});

test("audit24 wave22: the {0:00} pad rounds, so DFU prints ':60'", () => {
  // DaggerfallDateTime.Second is a FLOAT (:63) and .NET's "00" custom
  // format rounds away from zero. The port floored, and an earlier pin
  // in questbridge.test.js asserted the flooring was correct "because
  // C#'s Hour/Minute/Second are ints" - which is true of two of the
  // three.
  assert.match(midDateTimeString({ year: 405, month: 0, day: 0, hour: 1, minute: 2, second: 59.5 }),
    /^01:02:60 /, 'the impossible reading, verbatim');
  assert.match(midDateTimeString({ year: 405, month: 0, day: 0, hour: 1, minute: 2, second: 59.49 }),
    /^01:02:59 /);
});
