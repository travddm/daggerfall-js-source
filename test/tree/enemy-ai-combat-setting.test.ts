// A tree-wide sweep: every foe pool that builds an EnemyAI hands it DFU's Enhanced Combat AI setting
// (characters/enemy/enhanced-combat-ai.ts). The motor's own default is the classic path, so a pool that forgot the
// option would run classic foes while the setting says otherwise, and nothing else would fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : /\.(js|ts)$/.test(d.name) ? [join(dir, d.name)] : [],
  );
// `new EnemyAI(`, `new D.EnemyAI(` and the pools' `new (pref ? EnhancedEnemyAI : EnemyAI)(`
const CONSTRUCTION = /new (?:\((?:[^()]|\([^()]*\))*\bEnemyAI\)|(?:\w+\.)?(?:Enhanced)?EnemyAI)\(/g;
const OPTIONS_SPAN = 4000;

test('every EnemyAI built under src/ is handed the Enhanced Combat AI setting', () => {
  const sites: string[] = [];
  const missing: string[] = [];
  for (const file of walk(src)) {
    const text = readFileSync(file, 'utf8');
    const starts = [...text.matchAll(CONSTRUCTION)].map((m) => m.index ?? 0);
    starts.forEach((at, i) => {
      const end = Math.min(starts[i + 1] ?? text.length, at + OPTIONS_SPAN);
      const site = `${file.slice(src.length + 1)}:${text.slice(0, at).split('\n').length}`;
      sites.push(site);
      if (!text.slice(at, end).includes('enhancedCombatAI:')) missing.push(site);
    });
  }
  assert.ok(sites.length >= 4, `the sweep finds the pools (${sites.join(', ')})`);
  assert.deepEqual(missing, []);
});
