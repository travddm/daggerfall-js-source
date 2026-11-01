// @ts-check
// LEVEL-PLUS - THE ENHANCED PLUS FACE of a one-time question of making a character (Project Legacy's model).
//
// The question itself - its options, its cursor, its one answer - stays ui/choiceScreen.js's ChoiceScreen,
// the window every chargen host already holds in its one overlay slot. This is only its FACE on the Enhanced Plus
// skin: the Plus window (the rest window's shell - `px-home px-over`, a `px-win` with its four corner gems, a
// `px-body` holding one `.card`) instead of text over a dim, so the Plus theme's stone and colour dress it like every
// other window of the skin. The classic skin keeps the canvas screen, untouched.
//
// THE FACE IS DRAWN, NOT OWNED - the yes/no card's law (ui/yesNoBox.js): the screen's draw() calls drawChoiceFace
// every frame, the face mirrors the screen's cursor and locks, and a draw watchdog takes it down when the draws stop
// (a host gone without closing it). Its buttons answer THROUGH the screen (`click`-equivalent: pick and answer), so
// the fire-once latch stays the screen's alone. Keys still reach the screen through the host's overlay seam, as they
// always have; the face adds none of its own.

import { injectEnhancedStyle, injectEnhancedFonts } from './enhancedStyle.js';
import { armDrawWatchdog, disarmDraw } from '../drawWatchdog.js';

export const CHOICE_FACE_ID = 'enhanced-leveling';
/** The face leaves when its draws stop (the yes/no card's 400 ms). */
export const CHOICE_FACE_WATCHDOG_MS = 400;

let face = null; // { owner, root, opts: [{ node, id }], key }
let watchdog = null;
let schedule = (fn, ms) => (typeof setTimeout === 'function' ? setTimeout(fn, ms) : null);
let cancel = (t) => {
  if (t != null && typeof clearTimeout === 'function') clearTimeout(t);
};
export function _setChoiceFaceClockForTests(s, c) {
  schedule = s ?? schedule;
  cancel = c ?? cancel;
}

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function buildFace(doc, owner) {
  injectEnhancedStyle(doc);
  injectEnhancedFonts(doc);
  const shell = el(doc, 'div', 'px-home px-over lvl-shell');
  shell.id = CHOICE_FACE_ID;
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-labelledby', `${CHOICE_FACE_ID}-title`);
  // LEGACY-CHOICE: three answers (Project Legacy's online popup) widen the window to stand them side by side
  const win = el(doc, 'div', owner.options.length >= 3 ? 'px-win lvl-win lvl-three' : 'px-win lvl-win');
  for (const c of ['tl', 'tr', 'bl', 'br']) win.append(el(doc, 'span', `px-gem px-corner px-${c}`));
  const body = el(doc, 'div', 'px-body');
  const card = el(doc, 'div', 'card lvl-card');
  const words = owner.faceText; // the question's own words on the face
  const tags = owner.faceTags ?? {};
  const eyebrow = el(doc, 'div', 'lvl-eyebrow', words.eyebrow);
  const title = el(doc, 'h2', 'lvl-title', words.title);
  title.id = `${CHOICE_FACE_ID}-title`;
  const lead = el(doc, 'p', 'lvl-lead', words.lead);
  const list = el(doc, 'div', 'lvl-opts');
  list.setAttribute('role', 'radiogroup');
  const opts = owner.options.map((opt, i) => {
    const node = el(doc, 'button', 'lvl-opt');
    node.type = 'button';
    node.setAttribute('role', 'radio');
    node.dataset.id = opt.id;
    const head = el(doc, 'div', 'lvl-opt-head');
    head.append(
      el(doc, 'span', 'lvl-key', String(i + 1)),
      el(doc, 'span', 'lvl-opt-title', opt.title),
      el(doc, 'span', 'lvl-tag', tags[opt.id] ?? ''),
    );
    const lines = el(doc, 'p', 'lvl-opt-body', opt.lines.join(' '));
    const foot = el(doc, 'div', 'lvl-opt-foot');
    foot.append(opt.locked ? el(doc, 'span', 'lvl-lock', opt.lockNote) : el(doc, 'span', 'lvl-pick', words.pick));
    node.append(head, lines, foot);
    if (opt.locked) {
      node.disabled = true;
      node.setAttribute('aria-disabled', 'true');
    }
    node.onpointerenter = () => owner.hoverIndex(i);
    node.onclick = () => owner.pickIndex(i);
    list.append(node);
    return { node, id: opt.id };
  });
  const hint = el(doc, 'div', 'lvl-hint', words.hint);
  card.append(eyebrow, title, lead, list, hint);
  body.append(card);
  win.append(body);
  shell.append(win);
  doc.body.append(shell);
  return { owner, root: shell, opts, key: null };
}

/** One frame of the face for `owner` (a ChoiceScreen). Returns the root, or null off a document. */
export function drawChoiceFace(owner, doc = typeof document === 'undefined' ? null : document) {
  if (!doc) return null;
  if (face && face.owner !== owner) releaseChoiceFace(face.owner);
  if (!face) face = buildFace(doc, owner);
  disarmDraw(watchdog);
  watchdog = armDrawWatchdog(
    CHOICE_FACE_WATCHDOG_MS,
    () => {
      if (face?.owner === owner) releaseChoiceFace(owner);
    },
    { schedule, cancel },
  );
  const key = String(owner.cursor);
  if (face.key !== key) {
    face.key = key;
    face.opts.forEach(({ node }, i) => {
      const on = i === owner.cursor;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  return face.root;
}

/** The question answered (or its draws stopped): the face goes. A no-op for a screen whose face is not the one up. */
export function releaseChoiceFace(owner) {
  if (!face || face.owner !== owner) return;
  disarmDraw(watchdog);
  watchdog = null;
  try {
    face.root.remove();
  } catch {
    /* already gone */
  }
  face = null;
}
/** Whose face is up (tests). */
export const choiceFaceOwner = () => face?.owner ?? null;
