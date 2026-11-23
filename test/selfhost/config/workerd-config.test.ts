import assert from 'node:assert/strict';
import { test } from 'node:test';

import { capnpText, embed, textLiteral } from '../../../selfhost/config/capnp-text.ts';
import {
  cronSchedules,
  diskNames,
  uniqueKeyOf,
  workerdConfig,
  type ConfigOptions,
  type Toml,
} from '../../../selfhost/config/workerd-config.ts';

// The two tomls' shape, cut down to one of each kind of binding they declare.
const relay = (): Toml => ({
  name: 'daggerfall-online',
  main: 'src/index.js',
  compatibility_date: '2026-09-01',
  account_id: 'x',
  workers_dev: true,
  observability: { enabled: true },
  vars: { IDENTITY_PUBLIC_KEY: 'cloudflares-key', IDENTITY_MAX_TTL_S: '300' },
  analytics_engine_datasets: [{ binding: 'METRICS', dataset: 'daggerfall_relay' }],
  services: [{ binding: 'ACCOUNTS', service: 'daggerfall-accounts' }],
  durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'Room' }] },
  migrations: [{ tag: 'v1', new_sqlite_classes: ['Room'] }],
});
const accounts = (): Toml => ({
  name: 'daggerfall-accounts',
  main: 'src/index.js',
  compatibility_date: '2026-09-01',
  placement: { region: 'aws:us-west-1' },
  triggers: { crons: ['* * * * *', '41 * * * *'] },
  vars: { ALLOWED_ORIGIN: '*', NOTE: 'Ærø' },
  d1_databases: [
    { binding: 'DB', database_name: 'daggerfall-accounts', database_id: 'x', migrations_dir: 'migrations' },
  ],
  r2_buckets: [{ binding: 'SAVES', bucket_name: 'daggerfall-saves' }],
  analytics_engine_datasets: [{ binding: 'METRICS', dataset: 'daggerfall_accounts' }],
  durable_objects: { bindings: [{ name: 'ADMIT', class_name: 'AdmitGate' }] },
  services: [{ binding: 'RELAY', service: 'daggerfall-online' }],
  migrations: [{ tag: 'admit1', new_sqlite_classes: ['AdmitGate'] }],
});
const OPTIONS: ConfigOptions = {
  dataDir: '/data',
  metrics: false,
  r2Backend: 'disk',
  relayAddress: '*:8787',
  accountsAddress: '*:8788',
};

/** The struct text of one binding, by its name. */
const bindingText = (config: string, name: string): string | null => {
  const at = config.indexOf(`name = ${textLiteral(name)},`);
  if (at < 0) return null;
  return config.slice(at, config.indexOf('\n          ),', at));
};

test('vars become text, with the keys a self-host mints read from the environment instead', () => {
  const config = workerdConfig(relay(), accounts(), OPTIONS);
  assert.match(String(bindingText(config, 'IDENTITY_MAX_TTL_S')), /text = "300"/);
  assert.doesNotMatch(config, /cloudflares-key/);
  for (const name of ['IDENTITY_PUBLIC_KEY', 'GATE_SIGNING_KEY', 'IDENTITY_PRIVATE_KEY', 'CRON_SECRET']) {
    assert.match(config, new RegExp(`fromEnvironment = "${name}"`), name);
  }
  assert.match(config, /text = "\\xc3\\x86r\\xc3\\xb8"/);
});

test('each binding kind maps to its self-hosted service', () => {
  const config = workerdConfig(relay(), accounts(), OPTIONS);
  assert.match(String(bindingText(config, 'ACCOUNTS')), /service = "accounts"/);
  assert.match(String(bindingText(config, 'RELAY')), /service = "relay"/);
  assert.match(String(bindingText(config, 'ROOMS')), /durableObjectNamespace = "Room"/);
  assert.match(String(bindingText(config, 'SAVES')), /r2Bucket = "r2"/);
  assert.match(config, /moduleName = "cloudflare-internal:d1-api"/);
  assert.match(config, /className = "Room",\s+uniqueKey = "[0-9a-f]{32}",\s+enableSql = true/);
  assert.match(config, /localDisk = "relay-objects"/);
  assert.match(config, /text = "daggerfall-accounts"/);
  assert.match(config, /json = embed "migrations.json"/);
  assert.match(config, /address = "\*:8787",\s+http = \(\),\s+service = "relay"/);
  for (const name of diskNames(OPTIONS)) assert.match(config, new RegExp(`path = "/data/${name}"`));
});

test("METRICS is unbound by default, and bound to its dataset's sink with --metrics", () => {
  const off = workerdConfig(relay(), accounts(), OPTIONS);
  assert.equal(bindingText(off, 'METRICS'), null);
  assert.doesNotMatch(off, /metrics-/);
  const on = workerdConfig(relay(), accounts(), { ...OPTIONS, metrics: true });
  assert.match(on, /analyticsEngine = "metrics-daggerfall_relay"/);
  assert.match(on, /analyticsEngine = "metrics-daggerfall_accounts"/);
  assert.match(on, /name = "metrics-daggerfall_relay",\s+worker/);
  assert.match(on, /name = "DATASET",\s+text = "daggerfall_accounts"/);
});

test('the S3 backend reads its bucket from the environment and may reach private addresses', () => {
  const config = workerdConfig(relay(), accounts(), { ...OPTIONS, r2Backend: 's3' });
  assert.match(config, /fromEnvironment = "S3_SECRET_ACCESS_KEY"/);
  assert.match(config, /globalOutbound = "s3-network"/);
  assert.match(config, /allow = \[\s+"public",\s+"private",\s+"local",\s+\]/);
  assert.doesNotMatch(config, /r2-files/);
});

test('a toml key or binding the self-host does not translate is an error, not a silent drop', () => {
  assert.throws(() => workerdConfig({ ...relay(), kv_namespaces: [] }, accounts(), OPTIONS), /kv_namespaces/);
  const elsewhere = { ...accounts(), services: [{ binding: 'X', service: 'another-worker' }] };
  assert.throws(() => workerdConfig(relay(), elsewhere, OPTIONS), /another-worker/);
});

test('a namespace keeps its storage key across generations, and the cron schedules come from [triggers]', () => {
  assert.equal(uniqueKeyOf('relay', 'Room'), uniqueKeyOf('relay', 'Room'));
  assert.notEqual(uniqueKeyOf('relay', 'Room'), uniqueKeyOf('accounts', 'Room'));
  assert.deepEqual(cronSchedules(accounts()), ['* * * * *', '41 * * * *']);
  assert.throws(() => cronSchedules({}), /crons/);
});

test("the Cap'n Proto writer writes structs, lists, embeds and escaped text", () => {
  assert.equal(
    capnpText({ a: 1, b: true, c: [], d: {}, e: undefined }),
    '(\n  a = 1,\n  b = true,\n  c = [],\n  d = (),\n)',
  );
  assert.equal(capnpText(embed('x.js')), 'embed "x.js"');
  assert.equal(textLiteral('a"b\\c\n'), '"a\\"b\\\\c\\n"');
  assert.throws(() => capnpText(Number.NaN));
});
