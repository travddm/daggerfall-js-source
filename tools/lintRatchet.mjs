#!/usr/bin/env node
// LINT-RATCHET: the size, complexity, unused-code and type-check limits the tree is moving toward, held as a
// ratchet. Code that is already over a limit is recorded in tools/lintRatchet.json with its current figure; the
// check fails when a recorded figure grows or when anything not recorded crosses a limit. Docs: docs/testing/lint-ratchet.md.
//
//   node tools/lintRatchet.mjs             # check: fail on growth or a new offender (npm run lint runs this)
//   node tools/lintRatchet.mjs --strict    # also fail on a recorded figure that has fallen (CI runs this)
//   node tools/lintRatchet.mjs --update    # lower or drop recorded figures; never adds or raises one
//   node tools/lintRatchet.mjs --update --allow-new   # re-baseline everything (a moved file, a split): reviewed in the diff
//   node tools/lintRatchet.mjs --report    # print the counts and the largest offenders
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { isMain } from './lib/isMain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RATCHET_PATH = join(ROOT, 'tools', 'lintRatchet.json');

/** The trees the ratchet covers: production code. Tests, tools and scripts are held to the structural rules only. */
export const SCOPE = ['src/', 'server/src/', 'server-account/src/'];
/** The type check's include (tsconfig.json): only these files can opt in with `// @ts-check`. */
const TS_SCOPE = 'src/';

/** The limits. Targets are the ones in docs/testing/lint-ratchet.md; code over one is recorded, not forgiven. */
export const LIMITS = {
  'max-lines': 1000,
  'max-lines-per-function': 150,
  complexity: 20,
  'max-depth': 4,
};

const ESLINT_RULES = {
  'max-lines': ['error', { max: LIMITS['max-lines'], skipBlankLines: false, skipComments: false }],
  'max-lines-per-function': ['error', { max: LIMITS['max-lines-per-function'], skipBlankLines: false, skipComments: false, IIFEs: true }],
  complexity: ['error', { max: LIMITS.complexity }],
  'max-depth': ['error', { max: LIMITS['max-depth'] }],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-unused-private-class-members': 'error',
};

/**
 * What each check measures, as `file` -> a number (max-lines-per-function: `file::function#n` -> a number):
 * max-lines the file's lines; complexity the summed excess over the limit; max-depth and the unused checks a count
 * of reports; ts-check 1 for a file without the comment.
 */
export const CHECKS = ['max-lines', 'max-lines-per-function', 'complexity', 'max-depth', 'no-unused-vars', 'no-unused-private-class-members', 'ts-check'];

const toPosix = (p) => p.split(sep).join('/');

/** `Function 'foo' has too many lines (200)...` -> `Function 'foo'`; the name of the offender, whatever its kind. */
const offenderName = (message) => message.replace(/ has (too many lines|a complexity of).*$/, '');

/**
 * Lint the covered trees with the ratchet's rules and return `{ check: { key: figure } }`.
 * Keys for a function carry its occurrence among same-named offenders in the file, so a line shift keeps its identity.
 */
export async function measureEslint(root = ROOT) {
  const eslint = new ESLint({
    cwd: root,
    concurrency: 'auto',
    overrideConfig: [{ files: SCOPE.map((s) => `${s}**/*.js`), rules: ESLINT_RULES }],
  });
  const results = await eslint.lintFiles(SCOPE);
  const measured = Object.fromEntries(CHECKS.map((c) => [c, {}]));
  const seen = new Map();
  for (const r of results) {
    const file = toPosix(relative(root, r.filePath));
    const messages = [...r.messages].sort((a, b) => a.line - b.line || a.column - b.column);
    for (const m of messages) {
      if (m.fatal) throw new Error(`${file}:${m.line} ${m.message}`);
      const rule = m.ruleId;
      if (!rule || !(rule in measured)) continue;
      if (rule === 'max-lines') measured[rule][file] = Number(/\((\d+)\)/.exec(m.message)[1]);
      else if (rule === 'max-lines-per-function') {
        const name = offenderName(m.message);
        const figure = Number(/\((\d+)\)/.exec(m.message)[1]);
        if (!name.includes("'")) {
          // an unnamed function has no identity that survives an edit above it: one bucket a file, the sum of its lines
          const key = `${file}::(unnamed)`;
          measured[rule][key] = (measured[rule][key] ?? 0) + figure;
          continue;
        }
        const n = seen.get(`${file}|${name}`) ?? 0;
        seen.set(`${file}|${name}`, n + 1);
        measured[rule][`${file}::${name}#${n}`] = figure;
      } else if (rule === 'complexity') {
        // the excess over the limit, summed over the file: a function that gets more complex, or a new one, raises it
        const over = Number(/complexity of (\d+)/.exec(m.message)[1]) - LIMITS.complexity;
        measured[rule][file] = (measured[rule][file] ?? 0) + over;
      } else measured[rule][file] = (measured[rule][file] ?? 0) + 1;
    }
  }
  return measured;
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}

/** The files the type check includes that do not carry `// @ts-check` on their first line (test/systems/save/hard3_types.test.js's form). */
export function measureTsCheck(root = ROOT) {
  const out = {};
  const dir = join(root, TS_SCOPE);
  if (!existsSync(dir)) return out;
  for (const f of walk(dir)) {
    if (!/^\/\/ @ts-check\r?\n/.test(readFileSync(f, 'utf8'))) out[toPosix(relative(root, f))] = 1;
  }
  return out;
}

export async function measure(root = ROOT) {
  const measured = await measureEslint(root);
  measured['ts-check'] = measureTsCheck(root);
  return measured;
}

export function readRatchet(path = RATCHET_PATH) {
  const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  return Object.fromEntries(CHECKS.map((c) => [c, data[c] ?? {}]));
}

/** One entry a line and sorted, so two branches that lower different files merge without a conflict. */
export function serialize(ratchet) {
  const blocks = CHECKS.map((c) => {
    const keys = Object.keys(ratchet[c]).sort();
    const lines = keys.map((k) => `    ${JSON.stringify(k)}: ${ratchet[c][k]}`);
    return `  ${JSON.stringify(c)}: {${lines.length ? `\n${lines.join(',\n')}\n  ` : ''}}`;
  });
  return `{\n${blocks.join(',\n')}\n}\n`;
}

/** Compare a measurement to the ratchet: `grown` and `added` fail the check, `fallen` fails it under --strict. */
export function compare(measured, ratchet) {
  const grown = [], added = [], fallen = [];
  for (const c of CHECKS) {
    for (const [k, v] of Object.entries(measured[c])) {
      const was = ratchet[c][k];
      if (was === undefined) added.push({ check: c, key: k, now: v });
      else if (v > was) grown.push({ check: c, key: k, was, now: v });
      else if (v < was) fallen.push({ check: c, key: k, was, now: v });
    }
    for (const [k, was] of Object.entries(ratchet[c])) {
      if (measured[c][k] === undefined) fallen.push({ check: c, key: k, was, now: 0 });
    }
  }
  return { grown, added, fallen };
}

/** The ratchet after --update: figures that fell are lowered or dropped; with allowNew the measurement replaces it. */
export function updated(measured, ratchet, allowNew) {
  if (allowNew) return measured;
  const next = {};
  for (const c of CHECKS) {
    next[c] = {};
    for (const [k, was] of Object.entries(ratchet[c])) {
      const now = measured[c][k] ?? 0;
      if (now > 0) next[c][k] = Math.min(was, now);
    }
  }
  return next;
}

const HOW = {
  'max-lines': (l) => `a file over ${l} lines: split it, or move the new code into a module of its own`,
  'max-lines-per-function': (l) => `a function over ${l} lines: extract the new code into a function of its own`,
  complexity: (l) => `functions with complexity over ${l} (the figure is the summed excess): split the new branches into functions of their own`,
  'max-depth': (l) => `blocks nested deeper than ${l}`,
  'no-unused-vars': () => 'an unused variable, import or parameter: remove it, or name an unused parameter with a leading underscore',
  'no-unused-private-class-members': () => 'an unused private class member: remove it',
  'ts-check': () => 'a file under src/ without `// @ts-check` on its first line: add it and run `npm run types`',
};

function describe(c) {
  const limit = LIMITS[c.check];
  const detail = c.was === undefined ? `now ${c.now}` : `${c.was} -> ${c.now}`;
  return `  ${c.check}: ${c.key} (${detail}) - ${HOW[c.check](limit)}`;
}

async function main(argv) {
  const flags = new Set(argv);
  const measured = await measure();
  const ratchet = readRatchet();
  if (flags.has('--report')) return report(measured);
  if (flags.has('--update')) {
    const next = updated(measured, ratchet, flags.has('--allow-new'));
    writeFileSync(RATCHET_PATH, serialize(next));
    const left = compare(measured, next);
    const bad = [...left.grown, ...left.added];
    if (bad.length) {
      console.error(`lint ratchet: ${bad.length} figure(s) are over what the ratchet may record; --allow-new records them:`);
      for (const c of bad) console.error(describe(c));
      return 1;
    }
    console.log(`lint ratchet: ${RATCHET_PATH} updated`);
    return 0;
  }
  const { grown, added, fallen } = compare(measured, ratchet);
  const strict = flags.has('--strict');
  const failures = [...grown, ...added];
  if (failures.length) {
    console.error(`lint ratchet: ${failures.length} figure(s) grew or crossed a limit (docs/testing/lint-ratchet.md):`);
    for (const c of failures.slice(0, 50)) console.error(describe(c));
    if (failures.length > 50) console.error(`  ... and ${failures.length - 50} more`);
  }
  if (strict && fallen.length) {
    console.error(`lint ratchet: ${fallen.length} recorded figure(s) have fallen; run \`npm run lint:ratchet -- --update\` and commit tools/lintRatchet.json:`);
    for (const c of fallen.slice(0, 50)) console.error(`  ${c.check}: ${c.key} (${c.was} -> ${c.now})`);
    if (fallen.length > 50) console.error(`  ... and ${fallen.length - 50} more`);
  }
  if (failures.length || (strict && fallen.length)) return 1;
  if (fallen.length) console.log(`lint ratchet: ok; ${fallen.length} figure(s) have fallen - \`npm run lint:ratchet -- --update\` records them`);
  return 0;
}

function report(measured) {
  for (const c of CHECKS) {
    const entries = Object.entries(measured[c]).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    console.log(`${c}: ${entries.length} offender(s), total ${total}`);
    for (const [k, v] of entries.slice(0, 10)) console.log(`  ${v}\t${k}`);
  }
  return 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
