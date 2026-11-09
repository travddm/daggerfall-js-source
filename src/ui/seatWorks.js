// @ts-check
// SEAT2b: THE WORKS - the Seat tab's fortifications panel (7.5 the works). Each work the seat may raise, its tier and what
// it does, and for the holder's Guildmaster or an Officer a lever a work - "Raise the Walls to tier 2 (2,000 Marks)" -
// which burns its Marks from the treasury and stands the tier at once. A challenger's Guildmaster or an Officer sees the
// Siege Camp's lever beside the pledge (drawSeatCamp).
//
// Drawn into a host the Seat tab hands it (ui/seatTab.js), its acts through the tab's own one-at-a-time door.
import { FORT_WORKS, fortMayRaise, fortMaxTier, fortCost, fortWorkLine, CAMP_MARKS, CAMP_RAMS } from '../net/fortLaw.js';
import { t } from '../systems/textManager.js';

/** @param {string} tag @param {string|null} [cls] @param {string|null} [text] */
const el = (tag, cls = null, text = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** The panel's fixed words. */
export const SEAT_WORKS_WORDS = Object.freeze({
  get head() { return t('seat.works.head', 'The Works'); },
  get reading() { return t('seat.works.reading', 'Reading the works...'); },
});
/** A lever's words: "Raise the Walls to tier 2 (2,000 Marks)". */
export const fortLeverText = (id, tier) => {
  const w = FORT_WORKS.find((x) => x.id === id);
  const marks = fortCost(id, tier);
  return w && marks != null ? t('seat.works.raise', 'Raise the {work} to tier {tier} ({marks, number} Marks)', { work: w.name, tier, marks }) : '';
};

/**
 * THE PANEL into `host`: `forts` the service's read (`{ works }`, or null while it is read), `seat` `{ tier }`, `port`
 * whether DFU names its town a port (a Harbour's ask), `lever` whether this reader may raise a tier, `onBegin(work)` the
 * lever's act. Returns the buttons drawn, by work (a test reads them).
 * @param {HTMLElement} host
 * @param {{ forts: any, seat: { tier: string }, port?: boolean, lever?: boolean, onBegin?: (work: string) => any, busy?: boolean }} o
 */
export function drawSeatWorks(host, { forts, seat, port = false, lever = false, onBegin = () => {}, busy = false }) {
  const box = el('div', 'notice-seat-works');
  box.append(el('h4', 'notice-seat-head', SEAT_WORKS_WORDS.head));
  /** @type {Record<string, HTMLButtonElement>} */
  const buttons = {};
  if (!forts) {
    box.append(el('p', 'notice-seat-works-line', SEAT_WORKS_WORDS.reading));
    host.append(box);
    return buttons;
  }
  const works = forts.works ?? {};
  const walls = Number(works.walls?.tier ?? 0);
  for (const w of FORT_WORKS) {
    const row = works[w.id] ?? { tier: 0 };
    const may = fortMayRaise(w.id, { tier: seat.tier, coastal: port, walls });
    if (!row.tier && !may) continue;
    box.append(el('p', 'notice-seat-works-line', fortWorkLine(w.id, row, { seatTier: seat.tier })));
    const next = Number(row.tier ?? 0) + 1;
    if (lever && next <= fortMaxTier(w.id) && may) {
      const b = /** @type {HTMLButtonElement} */ (el('button', `act notice-seat-fort-${w.id}`, fortLeverText(w.id, next)));
      b.setAttribute('type', 'button');
      b.disabled = busy;
      b.onclick = (e) => { e?.stopPropagation?.(); return onBegin(w.id); };
      box.append(b);
      buttons[w.id] = b;
    }
  }
  host.append(box);
  return buttons;
}

// ─── THE SIEGE CAMP (4.2) ─────────────────────────────────────────

/** The camp lever's words. */
export const campLeverText = () => t('seat.camp.pitch', 'Pitch a Siege Camp ({marks, number} Marks)', { marks: CAMP_MARKS });
/** What the camp does, said under the lever. */
export const campRuleLine = () => t('seat.camp.rule', 'Pay once from the treasury. If your guild wins the Right of Siege here, the camp brings {rams, number} Rams to the siege where a Gatehouse stands; if it wins none, the Marks are lost.', { rams: CAMP_RAMS });

/**
 * THE CAMP'S PANEL into `host`, for a challenger's Guildmaster or an Officer who pledged this seat: the lever and its rule.
 * Returns the button.
 * @param {HTMLElement} host
 * @param {{ onPitch?: () => any, busy?: boolean }} o
 */
export function drawSeatCamp(host, { onPitch = () => {}, busy = false } = {}) {
  const box = el('div', 'notice-seat-camp');
  box.append(el('p', 'notice-seat-works-line', campRuleLine()));
  const b = /** @type {HTMLButtonElement} */ (el('button', 'act notice-seat-camp-pitch', campLeverText()));
  b.setAttribute('type', 'button');
  b.disabled = busy;
  b.onclick = (e) => { e?.stopPropagation?.(); return onPitch(); };
  box.append(b);
  host.append(box);
  return b;
}
