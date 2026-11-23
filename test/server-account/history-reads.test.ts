// A source sweep over the account service: request-path SQL must not read a history table to decide a change. A cap,
// a balance or a gate reads current state (a counter in act_counts, a column on the row it describes), so a server
// can keep history for a short window or not at all. history-reads-allowed.json lists the reads that already exist.
// Work that moves a read to current state removes its entry, and a new entry needs a reviewer's agreement that the
// read is the act's own batch, a once-only key lookup, or a display page.
//
// What the sweep cannot see: a table named through a template value (`FROM ${table}`), and reads in cron.js, whose
// scheduled jobs are not request paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVICE_ROOT = fileURLToPath(new URL('../../server-account/src/', import.meta.url));
const ALLOWED_PATH = fileURLToPath(new URL('./history-reads-allowed.json', import.meta.url));
const SCHEDULED_ONLY_FILES = new Set(['cron.js']);
const GENERATED_FILES = new Set(['database-types.ts']);

/** Tables that record past acts. A read of one on a request path depends on history being kept. */
const HISTORY_TABLES = new Set([
  'arena_pve',
  'arena_pvp',
  'broker_sales',
  'crew_signed',
  'duel_results',
  'fest_sales',
  'gate_kills',
  'guild_contract_pays',
  'guild_ledger',
  'guild_writ_fills',
  'hunt_clears',
  'item_census',
  'item_dupes',
  'item_uids',
  'market_fills',
  'market_patron_sales',
  'market_sales',
  'marks_ledger',
  'motherlode_strikes',
  'node_harvests',
  'npc_chapter_merit',
  'npc_receipt_credits',
  'prof_brews',
  'prof_crafts',
  'prof_smelts',
  'raid_cleanses',
  'serpent_kills',
  'staff_audit',
  'stars_held',
  'town_seat_bouts',
  'town_seat_history',
]);

/** One read of a history table: the file, the table and the SQL from the table's name on, cut short. */
type HistoryRead = { file: string; table: string; sql: string };

const ANCHOR_LENGTH = 70;

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(js|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** The SQL that follows a table's name, up to the end of its string, as one line. */
function anchorAt(text: string, start: number): string {
  const rest = text.slice(start, start + 200);
  // A string ends at a backtick, or at a quote that JavaScript code follows. A quote inside the SQL ('gate') does not.
  const end = rest.search(/`|['"]\s*[),.;+]/);
  const sql = end === -1 ? rest : rest.slice(0, end);
  return sql.replace(/\s+/g, ' ').trim().slice(0, ANCHOR_LENGTH);
}

/** The history reads in one file's text. */
function readsIn(file: string, source: string): HistoryRead[] {
  const text = withoutComments(source);
  const reads: HistoryRead[] = [];
  // A DELETE names its table after FROM but reads nothing from it.
  const tableReference = /(?<!DELETE\s+)\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\b/gi;
  for (const match of text.matchAll(tableReference)) {
    const table = match[1];
    if (!HISTORY_TABLES.has(table)) continue;
    const tableStart = match.index + match[0].length - table.length;
    reads.push({ file, table, sql: anchorAt(text, tableStart) });
  }
  return reads;
}

function historyReads(): HistoryRead[] {
  const reads: HistoryRead[] = [];
  for (const full of sourceFiles(SERVICE_ROOT)) {
    const file = path.relative(SERVICE_ROOT, full).split(path.sep).join('/');
    if (SCHEDULED_ONLY_FILES.has(file) || GENERATED_FILES.has(file)) continue;
    reads.push(...readsIn(file, readFileSync(full, 'utf8')));
  }
  return reads.sort(compareReads);
}

function compareReads(a: HistoryRead, b: HistoryRead): number {
  return `${a.file}\n${a.sql}`.localeCompare(`${b.file}\n${b.sql}`);
}

/** The entries of `list` that `other` lacks, counting repeats. */
function missingFrom(list: HistoryRead[], other: HistoryRead[]): HistoryRead[] {
  const remaining = other.map((read) => JSON.stringify(read));
  const missing: HistoryRead[] = [];
  for (const read of list) {
    const at = remaining.indexOf(JSON.stringify(read));
    if (at === -1) missing.push(read);
    else remaining.splice(at, 1);
  }
  return missing;
}

test('request-path SQL reads a history table only at a site on the allowed list', () => {
  const found = historyReads();
  if (process.env.UPDATE_HISTORY_READS === '1') {
    writeFileSync(ALLOWED_PATH, `${JSON.stringify(found, null, 2)}\n`);
  }
  const allowed = JSON.parse(readFileSync(ALLOWED_PATH, 'utf8')) as HistoryRead[];
  const added = missingFrom(found, allowed);
  const gone = missingFrom(allowed, found);
  assert.deepEqual(
    added,
    [],
    "a new read of a history table: read a counter or a state column instead. A read of the act's own batch, a " +
      'once-only key or a display page may be added to history-reads-allowed.json.',
  );
  assert.deepEqual(gone, [], 'an allowed read is gone: remove it from history-reads-allowed.json');
});

test('the sweep sees a history read, skips a delete, a comment and a table that is not history', () => {
  const sample = [
    "db.prepare('SELECT amount FROM marks_ledger WHERE actor = ?')",
    "db.prepare('DELETE FROM marks_ledger WHERE seq = ?')",
    "db.prepare('SELECT balance FROM marks WHERE account = ?')",
    '// a note on the history: SELECT 1 FROM gate_kills',
    '`SELECT 1 FROM guilds g JOIN gate_kills k ON k.account = g.id`',
  ].join('\n');
  assert.deepEqual(readsIn('sample.js', sample), [
    { file: 'sample.js', table: 'marks_ledger', sql: 'marks_ledger WHERE actor = ?' },
    { file: 'sample.js', table: 'gate_kills', sql: 'gate_kills k ON k.account = g.id' },
  ]);
});
