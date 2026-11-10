// Writes the self-host's secrets into `selfhost/.env` (git-ignored): an identity signing pair, a gate receipt pair
// (both from the tools the account deploy mints with), a cron door secret and an operator door secret. A value already in the file is kept, so
// running it again never invalidates a token or a receipt in flight. No value is printed.
//
//   node selfhost/keys.ts [--env selfhost/.env]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const { values } = parseArgs({ options: { env: { type: 'string', default: join(HERE, '.env') } } });

const lines = existsSync(values.env) ? readFileSync(values.env, 'utf8').split('\n') : [];
const have = new Set(lines.map((l) => /^([A-Z0-9_]+)=./.exec(l)?.[1]).filter((k): k is string => k !== undefined));

const pairOf = (tool: string): [string, string] => {
  const [priv = '', pub = ''] = execFileSync(process.execPath, [join(ROOT, 'tools', tool), '--pipe'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  if (!priv || !pub) throw new Error(`${tool} did not emit a pair`);
  return [priv, pub];
};

const added: string[] = [];
const add = (name: string, value: string): void => {
  lines.push(`${name}=${value}`);
  added.push(name);
};
if (!have.has('IDENTITY_PRIVATE_KEY')) {
  const [priv, pub] = pairOf('mintIdentityKeys.mjs');
  add('IDENTITY_PRIVATE_KEY', priv);
  add('IDENTITY_PUBLIC_KEY', pub);
}
if (!have.has('GATE_SIGNING_KEY')) {
  const [priv, pub] = pairOf('mintGateKeys.mjs');
  add('GATE_SIGNING_KEY', priv);
  add('GATE_PUBLIC_KEY', pub);
}
if (!have.has('CRON_SECRET')) {
  add('CRON_SECRET', Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'));
}
if (!have.has('OPERATOR_SECRET')) {
  add('OPERATOR_SECRET', Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'));
}
writeFileSync(values.env, `${lines.filter((l) => l !== '').join('\n')}\n`, { mode: 0o600 });
console.log(added.length > 0 ? `added ${added.join(', ')} to ${values.env}` : `${values.env} already holds every key`);
