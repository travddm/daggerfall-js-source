// @ts-check
// NO-MENTORING (decision #70): the Party tab's line and switch for the leader's "no mentoring" (the hub's
// party.mentoring.off and .on acts; the party view's `nm`). Every member reads the line while it stands; the leader alone
// gets the switch. Its own file keeps ui/socialPanel.js from growing.
import { t } from '../systems/textManager.js';

export const noMentoringText = () => t('social.party.noMentoring', 'No mentoring: everyone fights at their own level.');
export const mentoringOffText = () => t('social.party.mentoringOff', 'No mentoring');
export const mentoringOnText = () => t('social.party.mentoringOn', 'Allow mentoring');

/** The line under the mentor note, as a list of nodes: one while no mentoring stands, none otherwise.
 *  @param {(tag: string, cls: string, text?: string) => any} el @param {any} party */
export const noMentoringLines = (el, party) => (party?.nm === 1 ? [el('div', 'dfsocial-empty dfsocial-nomentor', noMentoringText())] : []);

/** The leader's switch, as a list of buttons: none for a member.
 *  @param {(label: string, o: any) => any} btn @param {any} party @param {boolean} leads @param {(a: any) => any} act */
export function mentoringSwitch(btn, party, leads, act) {
  if (!leads) return [];
  const off = party?.nm === 1;
  return [btn(off ? mentoringOnText() : mentoringOffText(), { run: () => act({ k: off ? 'party.mentoring.on' : 'party.mentoring.off' }) })];
}
