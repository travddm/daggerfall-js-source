// MACRO-6: THE TALK FALLBACK AND THE
// DUNGEON'S NAME.
//   - The Where-is answer records 7269 and 7275-7294 carry %fn/%mn
//     (TalkManagerMCP FemaleName/MaleName) and %hnt2 (DialogHint2, whose
//     LocalBuilding arm is the same building hint as %hnt). The host with
//     no talk engine answered neither, so they printed raw.
//   - "Where am I?" in a capital's castle printed "[object Object]":
//     the host handed specialDungeonName the RECORD ROW where
//     TextProvider.GetText answers `tokens[0].text`, and the name missed
//     GetSpecialDungeonName's `TrimEnd('.')`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandAnswerRecord } from '../../../src/systems/talk/talkSession.js';
import { specialDungeonName } from '../../../src/systems/answerPipeline.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('MACRO-6: the Where-is answer answers %hnt2 and the two names, each occurrence its own call', () => {
  let hints = 0, women = 0, men = 0;
  const out = expandAnswerRecord('%hnt. Ask %fn, or %mn. %hnt2, %fn2 and %mn2 say.', {
    hint: () => `hint${++hints}`, femaleName: () => `Anya${++women}`, maleName: () => `Bors${++men}`,
  });
  assert.equal(out, 'hint1. Ask Anya1, or Bors1. hint2, Anya2 and Bors2 say.',
    'C# calls the handler per macro: two hints are two rolls, two names are two draws');
  // a record with none of them calls nothing - the reveal never rolls
  let called = 0;
  expandAnswerRecord('Go east.', { hint: () => { called++; return ''; } });
  assert.equal(called, 0);
});

test('MACRO-6: GetSpecialDungeonName trims its full stop, and the host reads the ROW’S text', () => {
  const rows = { 475: [{ text: 'Castle Daggerfall.', center: true }] };
  const hostLine = (id) => { const r = rows[id]?.[0]; return r == null ? null : (typeof r === 'string' ? r : r.text ?? null); };
  assert.equal(specialDungeonName('Daggerfall', 'Daggerfall', hostLine), 'Castle Daggerfall');
  assert.equal(specialDungeonName('Menevia', "Lysandus' Tomb.", hostLine), "Lysandus' Tomb", 'every arm trims, as :267 does');
});
