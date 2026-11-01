import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// A tree-wide rule sweep (docs/coding-standards.md, "TypeScript"): ESLint cannot parse .ts here, because
// typescript-eslint supports TypeScript 6 and older and this repository type-checks with TypeScript 7.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', 'dist', 'vendor', 'public', '.git', 'release']);
const ANY = /(?::|\bas|<|\bextends|=)\s*any\b(?!\w)|\bany\[\]|Array<any>|Record<[^>]*,\s*any>/;

function typescriptFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name === 'typescript-no-any.test.ts') continue; // this file spells the banned types
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...typescriptFiles(path));
    else if (/\.(ts|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(path);
  }
  return found;
}

test('no TypeScript file in the tree uses the type any', () => {
  const offences: string[] = [];
  for (const file of typescriptFiles(ROOT)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (ANY.test(line)) offences.push(`${file.slice(ROOT.length + 1)}:${index + 1}`);
      });
  }
  assert.deepEqual(offences, []);
});

test('the any pattern catches the spellings it is for', () => {
  for (const bad of ['let x: any', 'x as any', 'f<any>(1)', 'a: any[]', 'b: Array<any>', 'c: Record<string, any>']) {
    assert.ok(ANY.test(bad), bad);
  }
  for (const good of ['const company = 1', 'many: number', 'x as unknown', 'anything()']) {
    assert.ok(!ANY.test(good), good);
  }
});
