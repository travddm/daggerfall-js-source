// @ts-check
// What a mindless revenant does at a moment, as the narrator tells it. The walking dead and the atronachs never speak,
// as a beast never does, but a beast's manner (a yip, a snarl, its scent) does not fit a skeleton or a golem.
import { t } from '../textManager.js';
import { PERSONALITIES, isPersonality, beastBody } from './revenantPersonality.js';

/** @typedef {import('./revenantPersonality.js').PersonalityId} PersonalityId */
/** @typedef {import('./revenantPersonality.js').VoiceEvent} VoiceEvent */

/** The kinds that never speak and are no animal: the skeletal warrior, the zombie and the four atronachs. */
export const MINDLESS_KINDS = Object.freeze(new Set([15, 17, 35, 36, 37, 38]));

/** A manner for each temperament that names no animal sound. Temperaments whose beast manner already fits keep it. */
const mindlessManner = (personality) => {
  switch (personality) {
    case 'brutal':
      return t('revenant.mindless.manner.brutal', 'with a grinding lurch');
    case 'witty':
      return t('revenant.mindless.manner.witty', 'with an almost knowing tilt of its head');
    case 'humorous':
      return t('revenant.mindless.manner.humorous', 'with a jaunty, jerking step');
    case 'zealous':
      return t('revenant.mindless.manner.zealous', 'with a fixed, burning stare');
    case 'unhinged':
      return t('revenant.mindless.manner.unhinged', 'with wild, jerking limbs');
    case 'craven':
      return t('revenant.mindless.manner.craven', 'with a halting, shuffling step');
    case 'weary':
      return t('revenant.mindless.manner.weary', 'with a slow, grinding creak');
    default:
      return PERSONALITIES[personality].manner;
  }
};

/** The moments whose beast line speaks of taste, scent or an animal's gait. `{manner}` is the temperament's. */
const mindlessMoment = (event) => {
  switch (event) {
    case 'taunt_slew':
      return t('revenant.mindless.tauntSlew', 'Turns on you {manner}. It remembers killing you.');
    case 'taunt_fled':
      return t('revenant.mindless.tauntFled', 'Turns on you {manner}, scarred. It remembers you.');
    case 'rise':
      return t('revenant.mindless.rise', 'Somewhere out there it waits {manner}. It remembers you.');
    case 'dismiss':
      return t('revenant.mindless.dismiss', 'Steps back through the portal {manner}.');
    case 'deserted':
      return t('revenant.mindless.deserted', 'Walks away through its portal {manner}.');
    case 'devoted_warn':
      return t('revenant.mindless.devotedWarn', 'Turns {manner} - behind you!');
    default:
      return null;
  }
};

/**
 * What a mindless revenant does at a moment, in its temperament: the narrator's sentence.
 * @param {string} personality
 * @param {VoiceEvent | string} event
 * @returns {string}
 */
export function mindlessBody(personality, event) {
  const manner = mindlessManner(isPersonality(personality) ? personality : 'brutal');
  const moment = mindlessMoment(event);
  return moment ? moment.replace('{manner}', manner) : beastBody(personality, event, manner);
}
