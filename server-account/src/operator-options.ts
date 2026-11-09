// The operator's options: tools a server's operator may want and core play does not need, each off unless the
// operator names it in OPERATOR_OPTIONS (server-account/wrangler.toml), a comma-separated list (decision #118 A2;
// server feature audit PR 8). An option that is off answers `option-off` on its staff routes, takes no feed, and runs
// no job, so a server that never turns it on pays nothing for it.
//
//   census    the item and gold census: its tally on each realm checkpoint, its daily row, its staff screens
//   economy   the market, trade, node and economy staff screens
//   desk      staff notes and watchlists
//   status    the server status screens (and their Cloudflare Analytics half)
//   follow    a follow token for a hidden spectator
//   hidden    the staff's Hide me, its hidden token, and the relay's report of a private home entered
//   give      an Admin's item mint into a player's record
//   feeds     the relay's network and monster feeds and their staff screens (with the relay's STAFF_NET_FEED_URL)
//   botcheck  the encounter reaction feed and its staff screen (with the relay's REACTION_FEED_URL)
export const OPERATOR_OPTIONS = Object.freeze([
  'census',
  'economy',
  'desk',
  'status',
  'follow',
  'hidden',
  'give',
  'feeds',
  'botcheck',
] as const);
export type OperatorOption = (typeof OPERATOR_OPTIONS)[number];

/** A feed an off option drops: answered as taken, so its sender neither retries nor logs a refusal. */
export const NOT_READ = Object.freeze({ ok: true, read: false });

/** The answer an off option gives on a staff route; staff.js STAFF_STATUS answers it 404. */
export const OPTION_OFF = Object.freeze({ error: 'option-off' });

/** Whether the operator turned `name` on. Unset, empty or any other word: off. */
export function operatorOption(env: { OPERATOR_OPTIONS?: unknown } | null | undefined, name: OperatorOption): boolean {
  const raw = env?.OPERATOR_OPTIONS;
  if (typeof raw !== 'string') return false;
  return raw
    .split(',')
    .map((word) => word.trim().toLowerCase())
    .includes(name);
}

/** `run()` while the operator turned `name` on; `off` (by default OPTION_OFF) otherwise, with nothing run. */
export function whenOption<R, O = typeof OPTION_OFF>(
  env: { OPERATOR_OPTIONS?: unknown } | null | undefined,
  name: OperatorOption,
  run: () => R,
  off: O = OPTION_OFF as O,
): R | O {
  return operatorOption(env, name) ? run() : off;
}
