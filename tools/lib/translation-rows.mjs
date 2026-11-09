// The row law the translation tools share (tools/l10nReview.mjs, tools/l10nCoverage.mjs): which placeholders a
// translation must keep, and who owns a row of `locales/<tag>/Port_Strings.csv`. Moved whole out of the removed machine
// translation pipeline (decision 116 (12)); the tools no longer draft rows, so every row is a person's.
import { createHash } from 'node:crypto';
import { parseMessage } from '../../src/systems/textManager.js';

// ─── the placeholders a draft must keep ────────────────────────────────────────────────────────────────────────────
/** The ICU arguments a pattern names, once each, sorted. Throws on a pattern parseMessage cannot read. */
function icuArguments(pattern) {
  const out = new Set();
  const walk = (nodes) => {
    for (const n of nodes)
      if (typeof n === 'object' && n.arg) {
        out.add(n.arg);
        if (n.options) for (const b of n.options.values()) walk(b);
      }
  };
  walk(parseMessage(pattern));
  return [...out].sort();
}
// Daggerfall's: a %macro (%s, %loc, %di, %1bs), a [/markup] tag, a {0} argument, a quest symbol (_x_, =x_, __x_, ___x_).
const DFU_TOKEN = /%[a-zA-Z0-9]+|\[\/[^\]]*\]|\{\d+\}|(?:={1,2}|_{1,3})[A-Za-z][A-Za-z0-9]*_/g;
/** The tokens a value must carry through translation, as a sorted multiset (a list with repeats). */
export function protectedTokens(value, kind) {
  const s = String(value ?? '');
  if (kind === 'icu') return icuArguments(s);
  return (s.match(DFU_TOKEN) ?? []).sort();
}

/** Whether `draft` keeps everything `english` must keep. Answers the problems (empty when it does). */
export function checkDraft(english, draft, kind) {
  const problems = [];
  if (typeof draft !== 'string' || !draft.trim()) return ['no text'];
  let want, got;
  try {
    want = protectedTokens(english, kind);
  } catch (err) {
    return [`the English does not read: ${err.message}`];
  }
  try {
    got = protectedTokens(draft, kind);
  } catch (err) {
    return [`does not read as a pattern: ${err.message}`];
  }
  const missing = [...want],
    extra = [];
  for (const t of got) {
    const i = missing.indexOf(t);
    if (i >= 0) missing.splice(i, 1);
    else extra.push(t);
  }
  if (missing.length) problems.push(`missing ${missing.join(' ')}`);
  if (extra.length) problems.push(`not in the English: ${extra.join(' ')}`);
  if (/^[\r\n]|[\r\n]$/.test(draft)) problems.push('begins or ends with a line break');
  return problems;
}

// ─── the rows owed ─────────────────────────────────────────────────────────────────────────────────────────────────
export const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

/**
 * What a run owes, given the English rows, the language's rows and its meta. Every English key is one of:
 * `draft` (no row, a machine row whose English changed, or every machine row under `retranslate`), `human` (a row a
 * person wrote or edited - kept; `stale` when its English changed since), or `done`.
 * @returns {{ draft: string[], human: string[], stale: string[], done: string[], meta: object }} the meta with every
 *   person's edit marked
 */
export function planRun(english, rows, meta = {}, { retranslate = false } = {}) {
  const out = { draft: [], human: [], stale: [], done: [], meta: { ...meta } };
  for (const [key, en] of english) {
    const have = rows.get(key);
    const m = meta[key];
    if (have === undefined) {
      out.draft.push(key);
      continue;
    }
    const byPerson = m ? m.by === 'human' || hash(have) !== m.tr : true; // a row the pipeline never wrote is a person's
    if (byPerson) {
      out.human.push(key);
      if (m && m.en !== hash(en)) out.stale.push(key);
      out.meta[key] = { en: m?.en ?? hash(en), tr: hash(have), by: 'human' };
      continue;
    }
    if (retranslate || m.en !== hash(en)) out.draft.push(key);
    else out.done.push(key);
  }
  return out;
}
