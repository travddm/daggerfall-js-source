// THE OPERATOR'S WAY TO SET A STAFF ROLE - the first Owner and Admin.
//
//   node tools/staffRole.mjs find <handle>                          the account id, when it registered, and its roles
//   node tools/staffRole.mjs set <account id> owner|admin|moderator|none
//   add --local for the local D1 (wrangler dev), --print to show the SQL and run nothing
//
// Run from server-account/ (where wrangler finds wrangler.toml) by someone with deploy access to the Cloudflare account.
// NO HTTP ROUTE GRANTS AN OWNER, and no handle does: a role is a column of the account's row (migration 0002), so the
// account id is what you pass. Find the id with `find`, and check that the account's registration time is the one you
// expect - a name is free to whoever registers it first, so confirm the account is yours before you give it a role.
// Docs: docs/operations/staff-roles.md.
import { ID_RE } from '../src/net/identityToken.js';
import { isMain } from './lib/isMain.mjs';
import { wranglerExec } from './lib/wranglerBindings.mjs';

export const USAGE = [
  'usage: node tools/staffRole.mjs find <handle> [--local]',
  '       node tools/staffRole.mjs set <account id> owner|admin|moderator|none [--local] [--print]',
].join('\n');

/** What each role sets: Owner implies Admin, and a role replaces the one before it. */
export const ROLE_COLUMNS = Object.freeze({
  owner: { staff_owner: 1, staff_admin: 1, staff_mod: 0 },
  admin: { staff_owner: 0, staff_admin: 1, staff_mod: 0 },
  moderator: { staff_owner: 0, staff_admin: 0, staff_mod: 1 },
  none: { staff_owner: 0, staff_admin: 0, staff_mod: 0 },
});

const HANDLE_RE = /^[^\s'";\\]{1,64}$/;

/**
 * The statements one command runs, each a single SQL text with its values written in after a check that they are only
 * what they should be (an id of ID_RE's shape, a role name) - never text from elsewhere.
 * @param {string[]} args the command's words, flags removed
 * @returns {{ sql: string[] } | { error: string }}
 */
export function statementsFor(args) {
  const [cmd, a, b] = args;
  if (cmd === 'find') {
    if (!a || !HANDLE_RE.test(a)) return { error: 'find needs a handle' };
    return {
      sql: [
        `SELECT id, handle, registered_at, staff_owner, staff_admin, staff_mod, staff_suspended FROM players WHERE handle_lc = '${a.toLowerCase()}'`,
      ],
    };
  }
  if (cmd === 'set') {
    if (!a || !ID_RE.test(a)) return { error: 'set needs an account id (run find first)' };
    const cols = Object.hasOwn(ROLE_COLUMNS, String(b))
      ? ROLE_COLUMNS[/** @type {keyof typeof ROLE_COLUMNS} */ (b)]
      : null;
    if (!cols) return { error: 'the role is owner, admin, moderator or none' };
    // a registered account only (a guest holds no handle and so no role), and the row must exist: the UPDATE says how many it moved
    return {
      sql: [
        `UPDATE players SET staff_owner = ${cols.staff_owner}, staff_admin = ${cols.staff_admin}, staff_mod = ${cols.staff_mod} WHERE id = '${a}' AND handle IS NOT NULL`,
        `SELECT id, handle, staff_owner, staff_admin, staff_mod FROM players WHERE id = '${a}'`,
      ],
    };
  }
  return { error: USAGE };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((x) => x === '--local' || x === '--print'));
  const words = argv.filter((x) => !x.startsWith('--'));
  const plan = statementsFor(words);
  if ('error' in plan) {
    console.error(plan.error);
    process.exit(2);
  }
  const exec = wranglerExec(); // WRANGLER names another command; the default is npx wrangler@4, run where server-account/wrangler.toml is
  for (const sql of plan.sql) {
    if (flags.has('--print')) {
      console.log(`${sql};`);
      continue;
    }
    const out = exec([
      'd1',
      'execute',
      'daggerfall-accounts',
      flags.has('--local') ? '--local' : '--remote',
      '--json',
      '--yes',
      '--command',
      sql,
    ]);
    const rows = JSON.parse(out)?.[0]?.results ?? [];
    for (const r of rows) console.log(JSON.stringify(r));
  }
}
