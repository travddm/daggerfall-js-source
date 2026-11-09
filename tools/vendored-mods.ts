#!/usr/bin/env node
// The vendored-mods ratchet. Every outside author's mod leaves the core repository, one pull request at a time
// (decisions #77 and #99). tools/vendored-mods.json lists each mod's paths and the words that name it, with two
// counts per mod: tracked paths under its own files, and lines elsewhere that name it. A count may fall and may never
// grow, so a later change cannot bring a removed mod back. The words are chosen to name one mod only; author handles
// shared by several mods are counted once, in the shared bucket.
//
//   node tools/vendored-mods.ts            # check: fail when a count grows
//   node tools/vendored-mods.ts --update   # lower the recorded counts to the measurement; never raises one
//   node tools/vendored-mods.ts --update --allow-growth   # set every count to the measurement: reviewed in the diff
//   node tools/vendored-mods.ts --report <folder>   # print every hit of one mod (or "shared")
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/isMain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = join(ROOT, 'tools', 'vendored-mods.json');

/** The ratchet's own files name every mod, so they are never measured. */
export const SELF = new Set([
  'tools/vendored-mods.ts',
  'tools/vendored-mods.json',
  'test/tooling/vendored-mods.test.ts',
]);

/** Files that are never read as text. They are still counted as paths. */
const BINARY =
  /\.(png|jpe?g|webp|gif|dds|nif|kf|fbx|bin|bytes|wav|ogg|mp3|dll|esm|woff2?|ttf|gz|zip|dfmod|vgmstream|libvorbis|slice)$/i;

export interface Counts {
  paths: number;
  lines: number;
}

export interface Bucket {
  /** Case-insensitive literal text that names the mod. */
  terms: string[];
  /** Case-sensitive regular expressions, for short ids such as `rri[A-Z]` that need a word boundary or case. */
  patterns: string[];
  counts: Counts;
}

export interface Mod extends Bucket {
  folder: string;
  title: string;
  authors: string[];
  links: { nexus: string[]; github: string[] };
  /** Path prefixes (ending in `/`) and whole files that belong to the mod. */
  paths: string[];
}

export interface Manifest {
  shared: Bucket;
  mods: Mod[];
}

export interface TrackedFile {
  path: string;
  /** The file's text, or null for a binary file. */
  text: string | null;
}

export interface Hit {
  path: string;
  line: number;
  text: string;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tests one line, for one bucket. Terms are matched on the lower-cased line. */
interface Matcher {
  insensitive: RegExp | null;
  sensitive: RegExp | null;
}

function matcherOf(buckets: Bucket[]): Matcher {
  const terms = buckets.flatMap((b) => b.terms).map((t) => escapeRegExp(t.toLowerCase()));
  const patterns = buckets.flatMap((b) => b.patterns);
  return {
    insensitive: terms.length ? new RegExp(terms.join('|')) : null,
    sensitive: patterns.length ? new RegExp(patterns.join('|')) : null,
  };
}

function names(m: Matcher, text: string, lower: string): boolean {
  return Boolean(m.insensitive?.test(lower) || m.sensitive?.test(text));
}

export function ownsPath(mod: Mod, path: string): boolean {
  return mod.paths.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

const isMod = (bucket: Bucket | Mod): bucket is Mod => 'paths' in bucket;

/**
 * The hits of every bucket, keyed by mod folder and `shared`: the lines that name it, outside the mod's own files and
 * the ratchet's. One combined test picks the lines that name any mod, so each bucket's own test runs on few lines.
 */
export function hitsByBucket(manifest: Manifest, files: TrackedFile[]): Map<string, Hit[]> {
  const buckets: [string, Bucket | Mod][] = [
    ['shared', manifest.shared],
    ...manifest.mods.map((m): [string, Mod] => [m.folder, m]),
  ];
  const any = matcherOf(buckets.map(([, b]) => b));
  const each = buckets.map(([key, b]): [string, Bucket | Mod, Matcher] => [key, b, matcherOf([b])]);
  const hits = new Map<string, Hit[]>(buckets.map(([key]) => [key, []]));
  for (const file of files) {
    if (file.text === null || SELF.has(file.path)) continue;
    const lowerFile = file.text.toLowerCase();
    if (!names(any, file.text, lowerFile)) continue;
    const lines = file.text.split('\n');
    const lowerLines = lowerFile.split('\n');
    const open = each.filter(([, b]) => !isMod(b) || !ownsPath(b, file.path));
    for (let i = 0; i < lines.length; i++) {
      if (!names(any, lines[i], lowerLines[i])) continue;
      for (const [key, , m] of open) {
        if (names(m, lines[i], lowerLines[i])) hits.get(key)?.push({ path: file.path, line: i + 1, text: lines[i] });
      }
    }
  }
  return hits;
}

/** The counts of every mod, by folder, and of the shared bucket under the key `shared`. */
export function measure(manifest: Manifest, files: TrackedFile[]): Record<string, Counts> {
  const hits = hitsByBucket(manifest, files);
  const out: Record<string, Counts> = { shared: { paths: 0, lines: hits.get('shared')?.length ?? 0 } };
  for (const mod of manifest.mods) {
    const paths = files.filter((f) => ownsPath(mod, f.path)).length;
    out[mod.folder] = { paths, lines: hits.get(mod.folder)?.length ?? 0 };
  }
  return out;
}

export interface Change {
  key: string;
  kind: keyof Counts;
  was: number;
  now: number;
}

export function recorded(manifest: Manifest): Record<string, Counts> {
  const out: Record<string, Counts> = { shared: manifest.shared.counts };
  for (const mod of manifest.mods) out[mod.folder] = mod.counts;
  return out;
}

/** Counts that grew past the record, and counts that fell below it. */
export function compare(measured: Record<string, Counts>, manifest: Manifest): { grown: Change[]; fallen: Change[] } {
  const grown: Change[] = [];
  const fallen: Change[] = [];
  for (const [key, was] of Object.entries(recorded(manifest))) {
    const now = measured[key] ?? { paths: 0, lines: 0 };
    for (const kind of ['paths', 'lines'] as const) {
      if (now[kind] > was[kind]) grown.push({ key, kind, was: was[kind], now: now[kind] });
      if (now[kind] < was[kind]) fallen.push({ key, kind, was: was[kind], now: now[kind] });
    }
  }
  return { grown, fallen };
}

/** The manifest with each count lowered to the measurement. A count never rises here. */
export function lowered(manifest: Manifest, measured: Record<string, Counts>): Manifest {
  const low = (was: Counts, now: Counts | undefined): Counts => ({
    paths: Math.min(was.paths, now?.paths ?? 0),
    lines: Math.min(was.lines, now?.lines ?? 0),
  });
  return {
    shared: { ...manifest.shared, counts: low(manifest.shared.counts, measured.shared) },
    mods: manifest.mods.map((mod) => ({ ...mod, counts: low(mod.counts, measured[mod.folder]) })),
  };
}

/**
 * The manifest with every count set to the measurement, rises included. Only for a change that moves a mod's lines
 * without adding any (a host split that reflows a statement); the reviewer reads the rise in the diff.
 */
export function rebased(manifest: Manifest, measured: Record<string, Counts>): Manifest {
  const at = (key: string): Counts => measured[key] ?? { paths: 0, lines: 0 };
  return {
    shared: { ...manifest.shared, counts: at('shared') },
    mods: manifest.mods.map((mod) => ({ ...mod, counts: at(mod.folder) })),
  };
}

export function serialize(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function readManifest(path: string = MANIFEST_PATH): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

/** Every tracked file of the checkout, with its text unless it is binary. */
export function readTree(root: string = ROOT): TrackedFile[] {
  const listing = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString();
  return listing
    .split('\0')
    .filter(Boolean)
    .map((path) => {
      if (BINARY.test(path)) return { path, text: null };
      const bytes = readFileSync(join(root, path));
      if (bytes.subarray(0, 8000).includes(0)) return { path, text: null };
      return { path, text: bytes.toString('utf8') };
    });
}

function main(args: string[]): number {
  const manifest = readManifest();
  const files = readTree();
  const reportAt = args.indexOf('--report');
  if (reportAt >= 0) {
    const key = args[reportAt + 1];
    const hits = hitsByBucket(manifest, files).get(key);
    if (!hits) throw new Error(`no mod ${key} in ${MANIFEST_PATH}`);
    for (const hit of hits) console.log(`${hit.path}:${hit.line}: ${hit.text.trim().slice(0, 160)}`);
    return 0;
  }
  const measured = measure(manifest, files);
  if (args.includes('--update')) {
    const next = args.includes('--allow-growth') ? rebased(manifest, measured) : lowered(manifest, measured);
    writeFileSync(MANIFEST_PATH, serialize(next));
    return 0;
  }
  const { grown, fallen } = compare(measured, manifest);
  for (const c of fallen) console.log(`fallen: ${c.key} ${c.kind} ${c.was} -> ${c.now} (run with --update to lock it)`);
  for (const c of grown) console.error(`grown: ${c.key} ${c.kind} ${c.was} -> ${c.now}`);
  return grown.length ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
