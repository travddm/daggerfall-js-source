// @ts-check
// REVENANT-PAGE (2026-10-02, Mac: "Definitely finish this with love. Any new UI elements need to be enhanced UI plus"):
// THE REVENANTS PAGE on the Enhanced pause menu's Holdings rail (ui/enhanced/enhancedMenu.js pauseHoldings; HOLDINGS moved it off
// the Stats rail, 2026-10-03) - every foe that has earned
// the character's name (systems/revenant/revenant.js), the living first, strongest first: its portrait in a sunk well with its
// rank on a chip, its name and what it is, what it has done to you, when it will come, and its deeds in order; then
// the FALLEN, greyed and struck through, with the day each fell. A character with none is told how one is made.
//
// Dressed by the stone-and-brass kit's roles (ui/enhanced/enhancedFrame.js FRAME_ROLES: a row a tile, the portrait a well, the
// rank a chip) - this sheet writes geometry and the words' colours alone, as the stats card's does.

import { revenantsFor, revenantOn, revenantHeld, revenantPortrait, revenantRankNumeral, REVENANT_MAX } from '../../systems/revenant/revenant.js';
import { revenantRenownMin, revenantAnyFoe } from '../../systems/revenant/revenantsOn.js';
import { t } from '../../systems/textManager.js';
import { ownMinutes } from '../../systems/worldTick.js';
import { requestFittedIcon, fittedImg } from '../textureCanvas.js';
import { PERSONALITIES } from '../../systems/revenant/revenantPersonality.js';   // REVENANT-VOICE: who each is

export const REVENANT_PAGE_SECTIONS = Object.freeze([['revenants', 'Revenants']]);
export const REVENANT_PAGE_STYLE_ID = 'revenant-page-css';
const FACE_BOX = 56;
let _icon = (p, onReady) => requestFittedIcon(p.archive, p.record, { box: FACE_BOX, dpr: Number(globalThis.devicePixelRatio) || 1, cap: 8, onReady });
/** Tests: the portrait source. */
export function _setRevenantPageIconForTests(fn) { _icon = fn ?? ((p, onReady) => requestFittedIcon(p.archive, p.record, { box: FACE_BOX, dpr: Number(globalThis.devicePixelRatio) || 1, cap: 8, onReady })); }

/** The rail shows the page while revenants are made (the loot-rarity row), or while any is remembered. */
/** Who the note says will come back for you: "A foe", "An elite or champion" - after "From Renown 10, " when held. */
function nemesisWords() {
  const who = revenantAnyFoe() ? t('rvn.page.anyFoe', 'a foe') : t('rvn.page.elites', 'an elite or champion');
  return revenantHeld() ? t('rvn.page.fromRenown', 'From Renown {n}, {who}', { n: revenantRenownMin(), who }) : who.charAt(0).toUpperCase() + who.slice(1);
}
export const revenantPageShown = (player = null) => revenantOn() || revenantsFor(player).length > 0;

export const REVENANT_PAGE_CSS = `
.px-sys .rvn-list { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 10px; }
.px-sys .rvn-row { display: grid; grid-template-columns: ${FACE_BOX + 8}px 1fr; gap: 10px; padding: 7px 10px 8px 7px;
  border-width: 2px; border-style: solid; box-sizing: border-box; text-align: left; }
.px-sys .rvn-face { position: relative; box-sizing: border-box; width: ${FACE_BOX + 8}px; height: ${FACE_BOX + 8}px; border-width: 2px;
  border-style: solid; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; }
.px-sys .rvn-face img.fit { image-rendering: pixelated; }
.px-sys .rvn-face .rvn-glyph { margin: auto; font-size: 24px; color: #8b8578; }
.px-sys .rvn-rank { position: absolute; right: 2px; bottom: 2px; z-index: 1; min-width: 18px; padding: 0 3px; box-sizing: border-box;
  border-width: 1px; border-style: solid; font-size: 10px; line-height: 1.3; text-align: center; color: #f3cf86; }
.px-sys .rvn-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.px-sys .rvn-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.px-sys .rvn-name { font-size: 15px; color: #f3cf86; overflow-wrap: anywhere; }
.px-sys .rvn-when { flex: none; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #d0604f; }
.px-sys .rvn-when.is-waiting { color: #b8b0a0; }
.px-sys .rvn-when.is-out { color: #e0a54a; }
.px-sys .rvn-sub { font-size: 11px; color: #8b8578; }
.px-sys .rvn-mood { display: inline-block; margin-right: 6px; padding: 0 5px; border-width: 1px; border-style: solid; font-size: 9px; line-height: 1.5; letter-spacing: 0.12em; text-transform: uppercase; color: #e9c46a; vertical-align: 1px; }
.px-sys .rvn-blurb { font-size: 11px; font-style: italic; color: #b8b0a0; }
.px-sys .rvn-deeds { font-size: 12px; color: #e9e4d9; }
.px-sys .rvn-come { font-size: 12px; color: #b8b0a0; }
.px-sys .rvn-history { margin: 3px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 10px; color: #8b8578; }
.px-sys .rvn-history li::before { content: '\\25C6 '; color: #c08a3e; }
.px-sys .rvn-row.is-fallen .rvn-face img { filter: grayscale(1) brightness(0.6); }
.px-sys .rvn-row.is-fallen .rvn-face::before { content: ''; position: absolute; left: -10%; right: -10%; top: 50%; z-index: 1;
  border-top: 3px solid #8c3a32; transform: rotate(-38deg); }
.px-sys .rvn-row.is-fallen .rvn-name { color: #b8b0a0; text-decoration: line-through; text-decoration-color: #8c3a32; }
:root[data-plus-theme="stone"] .px-sys .rvn-sub, :root[data-plus-theme="stone"] .px-sys .rvn-history { color: #e2d9c4; }
:root[data-plus-theme="stone"] .px-sys .rvn-come { color: #efe8d8; }
`;

function ensureStyle(doc) {
  if (!doc?.getElementById || doc.getElementById(REVENANT_PAGE_STYLE_ID)) return;
  const st = doc.createElement('style');
  st.id = REVENANT_PAGE_STYLE_ID;
  st.textContent = REVENANT_PAGE_CSS;
  (doc.head ?? doc.body)?.append(st);
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** How long ago a minute was, in the words a journal uses. */
export function agoWords(minute, now) {
  const days = Math.floor(Math.max(0, now - minute) / 1440);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
/** When a living revenant will come, in words: out in the world now, due (any road), or in so long. */
export function comeWords(r, now, held = revenantHeld()) {
  if (r.out) return { tag: 'Abroad', cls: 'is-out', line: 'Out in the world, looking for you.' };
  if (held) return { tag: 'Held', cls: 'is-waiting', line: `It will not come for you before Renown ${revenantRenownMin()}.` };
  const left = r.dueAt - now;
  if (left <= 0) return { tag: 'Hunting', cls: '', line: 'Hunting you. It may appear on any road.' };
  const days = Math.round(left / 1440);
  return { tag: 'Biding', cls: 'is-waiting', line: days >= 1 ? `It will come for you in about ${plural(days, 'day')}.` : `It will come for you within the day.` };
}
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
/** What it has done to you. */
export function deedWords(r) {
  const parts = [];
  if (r.kills) parts.push(`killed you ${times(r.kills)}`);
  if (r.escapes) parts.push(`escaped you ${times(r.escapes)}`);
  if (r.returns) parts.push(`came back ${times(r.returns)}`);
  const s = parts.join(', ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) + '.' : '';
}
const DEED_WORDS = Object.freeze({ slew: 'killed you', fled: 'escaped', returned: 'came back', fell: 'fell', yielded: 'yielded', executed: 'executed', spared: 'spared', released: 'released' });
/** REVENANT-FATE: how a fallen one ended, in the page's words. */
const FATE_WORDS = Object.freeze({ executed: 'Executed', released: 'Released' });

function face(el, r) {
  const f = el('div', 'rvn-face');
  f.setAttribute('aria-hidden', 'true');
  const p = revenantPortrait(r);
  const put = (pic) => {
    if (!pic?.src) return false;
    f.querySelector?.('.rvn-glyph')?.remove();
    f.insertBefore(fittedImg(pic), f.firstChild ?? null);
    return true;
  };
  let shown = false;
  if (p) {
    const ask = (onReady) => _icon(p, onReady);
    try { shown = put(ask(() => { if (f.isConnected !== false) { try { put(ask(null)); } catch { /* the glyph stands */ } } })); } catch { shown = false; }
  }
  if (!shown) f.append(el('span', 'rvn-glyph', '☠'));
  if (r.rank > 0) f.append(el('span', 'rvn-rank', revenantRankNumeral(r.rank)));
  return f;
}

function row(el, r, now, kindName) {
  const fallen = !!r.defeated;
  const item = el('div', `rvn-row${fallen ? ' is-fallen' : ''}`);
  const text = el('div', 'rvn-text');
  const head = el('div', 'rvn-head');
  head.append(el('span', 'rvn-name', r.name));
  const come = fallen || r.sworn ? null : comeWords(r, now);
  if (come) head.append(el('span', `rvn-when ${come.cls}`.trim(), come.tag));
  else if (r.sworn) head.append(el('span', 'rvn-when is-waiting', 'Sworn'));   // REVENANT-COMPANION
  const trait = typeof r.trait === 'string' && r.trait ? r.trait.charAt(0).toUpperCase() + r.trait.slice(1) : null;
  const sub = el('span', 'rvn-sub', [`Rank ${revenantRankNumeral(r.rank)}`, kindName(r.mobileType), trait, r.elite ? 'Elite' : null].filter(Boolean).join(' · '));
  const P = PERSONALITIES[r.personality];
  if (P) sub.insertBefore(el('span', 'rvn-mood', P.label), sub.firstChild ?? null);   // REVENANT-VOICE: who it is
  text.append(head, sub);
  if (P) text.append(el('span', 'rvn-blurb', P.blurb));
  if (r.sworn) {   // REVENANT-COMPANION: it walks with the player now - the Companions page keeps it
    const st = r.companion?.state ?? 'with';
    text.append(el('span', 'rvn-come', st === 'with' ? 'Sworn to you - at your side.' : st === 'resting' ? 'Sworn to you - recovering from a fall.' : 'Sworn to you - away, waiting for your call.'));
    item.append(face(el, r), text);
    return item;
  }
  const deeds = deedWords(r);
  if (deeds) text.append(el('span', 'rvn-deeds', deeds));
  text.append(el('span', 'rvn-come', fallen ? `${FATE_WORDS[r.fate] ?? 'Fell'} ${agoWords(r.defeatedAt ?? now, now)}.` : come.line));
  const hist = (r.history ?? []).slice(-5);
  if (hist.length) {
    const ul = el('ul', 'rvn-history');
    for (const d of hist) ul.append(el('li', '', `${DEED_WORDS[d.deed] ?? d.deed}, ${agoWords(d.at, now)}`));
    text.append(ul);
  }
  item.append(face(el, r), text);
  return item;
}

/**
 * THE PAGE (ui/enhancedMenu.js pauseStats' dispatch): `detail` the rail's detail pane, `kit` the menu's own makers
 * ({ el, divider }) and the player whose revenants these are.
 */
export function drawRevenantsPage(detail, rerender, { el, divider, player = null, kindName = (t) => String(t) } = /** @type {any} */ ({})) {
  ensureStyle(typeof document === 'undefined' ? null : document);
  const now = Math.floor(ownMinutes());
  const all = revenantsFor(player);
  const living = all.filter((r) => !r.defeated && !r.sworn).sort((a, b) => b.rank - a.rank || a.dueAt - b.dueAt);
  const sworn = all.filter((r) => r.sworn && !r.defeated).sort((a, b) => b.rank - a.rank);   // REVENANT-COMPANION
  const fallen = all.filter((r) => r.defeated).sort((a, b) => (b.defeatedAt ?? 0) - (a.defeatedAt ?? 0));
  detail.append(divider(`Revenants (${living.length} of ${REVENANT_MAX})`));
  if (!living.length) {
    detail.append(el('p', 'px-note', revenantOn()
      ? `${all.length ? 'None hunts you now.' : 'No foe has earned your name yet.'} ${nemesisWords()} that kills you, or breaks, runs and gets away, will remember you and come back for you.`   // AUDIT (2026-10-02): the sworn and the fallen below are revenants too
      : t('rvn.page.off', 'Revenants are off.')));
  } else {
    const list = el('div', 'rvn-list');
    for (const r of living) list.append(row(el, r, now, kindName));
    detail.append(list);
  }
  if (sworn.length) {
    detail.append(divider('Sworn to you'));
    const list = el('div', 'rvn-list');
    for (const r of sworn) list.append(row(el, r, now, kindName));
    detail.append(list);
  }
  if (fallen.length) {
    detail.append(divider('Fallen'));
    const list = el('div', 'rvn-list');
    for (const r of fallen) list.append(row(el, r, now, kindName));
    detail.append(list);
  }
}
