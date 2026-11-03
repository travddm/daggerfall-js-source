// @ts-check
// CHARACTER MODES: THE MODE QUESTION - put by the chargen door after the wizard (systems/chargenSession.js
// withChargenQuestions), on the one-time question screen (ui/choiceScreen.js ChoiceScreen). Five answers, Classic first
// and marked Recommended, each with one line of pros and one of cons (docs/systems/character-modes.md, section 6). The
// mode is fixed at creation: it can be loosened later, never tightened. An answer is offered only while the mod's settings
// (and, online, the server's profile) offer it (systems/characterModes.js, net/modeLaw.js creatableModes).
import { ChoiceScreen } from './choiceScreen.js';
import { creatableModes } from '../net/modeLaw.js';
import { offeredModes } from '../systems/characterModes.js';

export const MODE_TEXT = Object.freeze({
  title: 'HOW WILL YOU PLAY?',
  lines: Object.freeze(['Your mode is fixed at creation.', 'It can be loosened later, never tightened.']),
});
export const MODE_FACE = Object.freeze({
  eyebrow: 'A new character',
  title: 'How will you play?',
  lead: 'Your mode is fixed at creation. It can be loosened later, never tightened. Death and trade rules apply online.',
  pick: 'Choose',
  hint: (n) => `Click one · up/down and Enter · 1 to ${n}`,
  listLines: true,
});
/** Each answer's short tag on the Plus face. */
export const MODE_TAGS = Object.freeze({
  classic: 'Recommended',
  hardcore: 'Permadeath',
  legacy: 'Family',
  ironman: 'No trading',
  hardcore_ironman: 'Permadeath · No trading',
});

/** Lines are the pros then the cons, one line each: the classic face fits five answers of two lines (compact screen). */
const CARDS = Object.freeze({
  classic: {
    title: 'Classic (recommended)',
    lines: ["+ Daggerfall's rules; online a death costs 10% gold", '- Nothing is at stake'],
  },
  hardcore: {
    title: 'Hardcore',
    lines: ['+ A death means something; Hall of the Fallen', '- Online a death is final: all is lost'],
  },
  legacy: {
    title: 'Legacy',
    lines: ['+ A family; heirs carry your line on', '- Bloodline deaths are final; Enduring costs years'],
  },
  ironman: {
    title: 'Ironman',
    lines: ['+ Self-reliance; an Ironman badge', '- No player trade, parties or shared dungeons'],
  },
  hardcore_ironman: {
    title: 'Hardcore Ironman',
    lines: ['+ The hardest road; a badge', '- Everything in Hardcore and Ironman'],
  },
});

/** The answers the screen offers. */
export function characterModeOptions({ offered = offeredModes() } = {}) {
  return Object.freeze(
    creatableModes(offered).map((id) =>
      Object.freeze({
        id,
        title: CARDS[id].title,
        locked: false,
        lockNote: null,
        lines: Object.freeze([...CARDS[id].lines]),
      }),
    ),
  );
}

/** The question, answering `onAnswer(mode)` once. */
export function characterModeScreen(/** @type {(mode: string) => void} */ onAnswer, { offered = offeredModes() } = {}) {
  const options = characterModeOptions({ offered });
  return new ChoiceScreen(onAnswer, {
    options,
    text: MODE_TEXT,
    faceText: { ...MODE_FACE, hint: MODE_FACE.hint(options.length) },
    faceTags: MODE_TAGS,
    compact: true,
  });
}
