// Translates the two wrangler.toml files into one workerd config, so the tomls stay the one source of bindings. A
// self-host runs five services in one workerd process: `relay` and `accounts` (the two Workers as the tomls declare
// them), `d1` (the account database, d1/worker.ts), `r2` (the save bucket, r2/worker.ts) and, when metrics are on, one
// `metrics-<dataset>` sink (metrics/sink.ts) for each Analytics Engine dataset. A toml key this module does not
// translate is an error, so a binding added to a toml cannot be dropped from the self-host without anyone noticing.
import { createHash } from 'node:crypto';
import { capnpText, embed, type CapnpValue } from './capnp-text.ts';

export type Toml = Record<string, unknown>;
type Struct = { [field: string]: CapnpValue | undefined };

export type ConfigOptions = {
  /** The directory every disk service lives under, as workerd will see it (absolute). */
  dataDir: string;
  /** Bind METRICS to the metrics sink. Off: METRICS is unbound, as both services allow. */
  metrics: boolean;
  /** Where the save bucket's bytes live. */
  r2Backend: 'disk' | 's3';
  relayAddress: string;
  accountsAddress: string;
};

/** The file names the config embeds, all beside it in the build directory. */
export const BUNDLES = {
  relay: 'relay.js',
  accounts: 'accounts.js',
  d1: 'd1.js',
  r2: 'r2.js',
  metricsSink: 'metrics-sink.js',
  migrations: 'migrations.json',
} as const;

const S3_NETWORK = 's3-network';

/** Values a self-host must supply itself, read from the environment in place of the toml's text: the relay's copy of
 *  the identity public key (the toml holds Cloudflare's) and the relay's account service address. */
export const ENV_OVERRIDES: Record<string, readonly string[]> = {
  relay: ['IDENTITY_PUBLIC_KEY', 'ACCOUNT_SERVICE_URL'],
};

/** Secrets each Worker reads that no toml names, read from the environment. Unset, a binding is null. */
export const SECRETS: Record<string, readonly string[]> = {
  relay: ['GATE_SIGNING_KEY'],
  accounts: [
    'IDENTITY_PRIVATE_KEY',
    'IDENTITY_PUBLIC_KEY',
    'GATE_PUBLIC_KEY',
    'CRON_SECRET',
    'OPERATOR_SECRET',
    'ANTHROPIC_API_KEY',
    'STAFF_ANALYTICS_ACCOUNT',
    'STAFF_ANALYTICS_TOKEN',
  ],
};

const S3_SECRETS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];

// Keys with no meaning on a self-host: the Cloudflare account, its URL, its logs, its placement, and the cron triggers
// (the compose file's cron sidecar fires them through the cron door).
const IGNORED = new Set(['account_id', 'workers_dev', 'observability', 'placement', 'triggers', 'main']);
const TRANSLATED = new Set([
  'name',
  'compatibility_date',
  'compatibility_flags',
  'vars',
  'migrations',
  'durable_objects',
  'services',
  'd1_databases',
  'r2_buckets',
  'analytics_engine_datasets',
]);

const tablesOf = (toml: Toml, key: string): Toml[] => {
  const v = toml[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`[[${key}]] must be an array of tables`);
  return v as Toml[];
};
const textOf = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || v === '') throw new Error(`${what} must be a non-empty string`);
  return v;
};

/** A Durable Object namespace's storage key, the same on every regeneration, so a new config finds the old data. */
export const uniqueKeyOf = (service: string, className: string): string =>
  createHash('sha256').update(`dfo-selfhost:${service}:${className}`).digest('hex').slice(0, 32);

/** The classes a toml's migrations made SQLite-backed. */
function sqliteClasses(toml: Toml): Set<string> {
  const out = new Set<string>();
  for (const m of tablesOf(toml, 'migrations')) {
    for (const c of (m.new_sqlite_classes as unknown[] | undefined) ?? []) out.add(String(c));
    for (const c of (m.new_classes as unknown[] | undefined) ?? []) out.delete(String(c));
  }
  return out;
}

type WorkerInput = { service: string; toml: Toml; bundle: string; serviceNames: Record<string, string> };

function workerService({ service, toml, bundle, serviceNames }: WorkerInput, options: ConfigOptions): Struct {
  for (const key of Object.keys(toml)) {
    if (!IGNORED.has(key) && !TRANSLATED.has(key))
      throw new Error(`${service}: the self-host does not translate "${key}"`);
  }
  const overrides = new Set(ENV_OVERRIDES[service] ?? []);
  const bindings: Struct[] = [];
  const vars = (toml.vars ?? {}) as Toml;
  for (const [name, value] of Object.entries(vars)) {
    if (overrides.has(name)) continue;
    if (typeof value === 'string') bindings.push({ name, text: value });
    else bindings.push({ name, json: JSON.stringify(value) });
  }
  const fromEnv = new Set([...overrides, ...(SECRETS[service] ?? [])]);
  for (const name of [...fromEnv].sort()) bindings.push({ name, fromEnvironment: name });

  const sqlite = sqliteClasses(toml);
  const namespaces: Struct[] = [];
  const doTable = (toml.durable_objects ?? {}) as Toml;
  for (const b of tablesOf(doTable, 'bindings')) {
    const className = textOf(b.class_name, `${service} durable_objects.bindings class_name`);
    if (b.script_name !== undefined)
      throw new Error(`${service}: a Durable Object of another script is not translated`);
    bindings.push({
      name: textOf(b.name, `${service} durable_objects.bindings name`),
      durableObjectNamespace: className,
    });
    namespaces.push({ className, uniqueKey: uniqueKeyOf(service, className), enableSql: sqlite.has(className) });
  }
  for (const s of tablesOf(toml, 'services')) {
    const target = textOf(s.service, `${service} services.service`);
    const local = serviceNames[target];
    if (!local) throw new Error(`${service}: the service binding to "${target}" names no Worker of the self-host`);
    bindings.push({ name: textOf(s.binding, `${service} services.binding`), service: local });
  }
  for (const db of tablesOf(toml, 'd1_databases')) {
    bindings.push({
      name: textOf(db.binding, `${service} d1_databases.binding`),
      wrapped: { moduleName: 'cloudflare-internal:d1-api', innerBindings: [{ name: 'fetcher', service: 'd1' }] },
    });
  }
  for (const bucket of tablesOf(toml, 'r2_buckets')) {
    bindings.push({ name: textOf(bucket.binding, `${service} r2_buckets.binding`), r2Bucket: 'r2' });
  }
  for (const ds of tablesOf(toml, 'analytics_engine_datasets')) {
    if (!options.metrics) continue;
    const dataset = textOf(ds.dataset, `${service} analytics_engine_datasets.dataset`);
    bindings.push({
      name: textOf(ds.binding, `${service} analytics_engine_datasets.binding`),
      analyticsEngine: sinkOf(dataset),
    });
  }
  const flags = (toml.compatibility_flags as unknown[] | undefined) ?? [];
  return {
    name: service,
    worker: {
      compatibilityDate: textOf(toml.compatibility_date, `${service} compatibility_date`),
      compatibilityFlags: flags.map(String),
      modules: [{ name: 'worker', esModule: embed(bundle) }],
      bindings,
      durableObjectNamespaces: namespaces.length > 0 ? namespaces : undefined,
      durableObjectStorage: namespaces.length > 0 ? { localDisk: `${service}-objects` } : undefined,
    },
  };
}

/** The sink service that receives one Analytics Engine dataset's points. */
export const sinkOf = (dataset: string): string => `metrics-${dataset}`;

const disk = (name: string, dataDir: string): Struct => ({
  name,
  disk: { path: `${dataDir.replace(/\/+$/, '')}/${name}`, writable: true },
});

/** The disk services the config names, one directory each under `dataDir`. */
export function diskNames(options: Pick<ConfigOptions, 'r2Backend'>): string[] {
  const names = ['relay-objects', 'accounts-objects', 'd1-objects', 'r2-objects'];
  return options.r2Backend === 'disk' ? [...names, 'r2-files'] : names;
}

/** The account database's name, which keys its one Durable Object. */
function databaseName(accounts: Toml): string {
  const [db] = tablesOf(accounts, 'd1_databases');
  if (!db) throw new Error('accounts: no [[d1_databases]]');
  return textOf(db.database_name, 'accounts d1_databases.database_name');
}

/** The whole workerd config, as Cap'n Proto text. */
export function workerdConfig(relay: Toml, accounts: Toml, options: ConfigOptions): string {
  const serviceNames = {
    [textOf(relay.name, 'relay name')]: 'relay',
    [textOf(accounts.name, 'accounts name')]: 'accounts',
  };
  const services: Struct[] = [
    workerService({ service: 'relay', toml: relay, bundle: BUNDLES.relay, serviceNames }, options),
    workerService({ service: 'accounts', toml: accounts, bundle: BUNDLES.accounts, serviceNames }, options),
    {
      name: 'd1',
      worker: {
        compatibilityDate: textOf(accounts.compatibility_date, 'accounts compatibility_date'),
        modules: [{ name: 'worker', esModule: embed(BUNDLES.d1) }],
        bindings: [
          { name: 'DATABASE', durableObjectNamespace: 'D1Database' },
          { name: 'DATABASE_NAME', text: databaseName(accounts) },
          { name: 'MIGRATIONS', json: embed(BUNDLES.migrations) },
        ],
        durableObjectNamespaces: [
          { className: 'D1Database', uniqueKey: uniqueKeyOf('d1', 'D1Database'), enableSql: true },
        ],
        durableObjectStorage: { localDisk: 'd1-objects' },
      },
    },
    {
      name: 'r2',
      worker: {
        compatibilityDate: textOf(accounts.compatibility_date, 'accounts compatibility_date'),
        modules: [{ name: 'worker', esModule: embed(BUNDLES.r2) }],
        bindings: [
          { name: 'R2_BACKEND', text: options.r2Backend },
          { name: 'INDEX', durableObjectNamespace: 'BucketIndex' },
          ...(options.r2Backend === 'disk' ? [{ name: 'DISK', service: 'r2-files' }] : []),
          ...(options.r2Backend === 's3' ? S3_SECRETS.map((name) => ({ name, fromEnvironment: name })) : []),
        ],
        durableObjectNamespaces: [
          { className: 'BucketIndex', uniqueKey: uniqueKeyOf('r2', 'BucketIndex'), enableSql: true },
        ],
        durableObjectStorage: { localDisk: 'r2-objects' },
        globalOutbound: options.r2Backend === 's3' ? S3_NETWORK : undefined,
      },
    },
    ...diskNames(options).map((name) => disk(name, options.dataDir)),
  ];
  if (options.r2Backend === 's3') {
    services.push({ name: S3_NETWORK, network: { allow: ['public', 'private', 'local'] } });
  }
  if (options.metrics) {
    const datasets = [relay, accounts].flatMap((toml) => tablesOf(toml, 'analytics_engine_datasets'));
    for (const dataset of new Set(datasets.map((ds) => textOf(ds.dataset, 'analytics_engine_datasets.dataset')))) {
      services.push({
        name: sinkOf(dataset),
        worker: {
          compatibilityDate: textOf(accounts.compatibility_date, 'accounts compatibility_date'),
          modules: [{ name: 'worker', esModule: embed(BUNDLES.metricsSink) }],
          bindings: [{ name: 'DATASET', text: dataset }],
        },
      });
    }
  }
  const config: Struct = {
    services,
    sockets: [
      { name: 'relay', address: options.relayAddress, http: {}, service: 'relay' },
      { name: 'accounts', address: options.accountsAddress, http: {}, service: 'accounts' },
    ],
  };
  return [
    '# Generated by selfhost/generate.ts from server/wrangler.toml and server-account/wrangler.toml. Do not edit it:',
    '# change a toml or the generator, and generate again.',
    'using Workerd = import "/workerd/workerd.capnp";',
    '',
    `const config :Workerd.Config = ${capnpText(config)};`,
    '',
  ].join('\n');
}

/** The account service's cron schedules, as its toml's [triggers] names them, for the cron sidecar. */
export function cronSchedules(accounts: Toml): string[] {
  const triggers = (accounts.triggers ?? {}) as Toml;
  const crons = triggers.crons;
  if (!Array.isArray(crons) || crons.length === 0) throw new Error('accounts: [triggers] crons is missing');
  return crons.map((c) => textOf(c, 'accounts triggers.crons'));
}
