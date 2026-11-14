// Runs one shard of the near tier (tools/testChanged.mjs, selectTests) for a light check run: the tests that changed,
// import a changed file themselves, name one, or list its folder, which includes the tree-wide sweeps.
//
//   node tools/test-near.ts <i>/<n> --base <ref>
//
// The far tier, which reaches a change only through other modules, waits for the full verification.
import { join } from 'node:path';
import { isMain } from './lib/isMain.mjs';
import { baseRef } from './lib/base-ref.ts';
import { changedFiles, selectTests } from './testChanged.mjs';
import { parseShard, readTimes, runTests, shardsOf, testFiles } from './testShards.mjs';

const ROOT = join(import.meta.dirname, '..');

/** The files of shard `index` of `total` of the near tier, split by recorded times as the full run splits the suite. */
export function nearShard(near: readonly string[], index: number, total: number, times: Record<string, number>) {
  return (shardsOf([...near], total, times) as { files: string[] }[])[index - 1].files;
}

function main(argv: string[]): number {
  const shard = parseShard(argv[0]) as { index: number; total: number } | null;
  if (!shard) {
    console.error('usage: node tools/test-near.ts <i>/<n> --base <ref>');
    return 2;
  }
  const base = baseRef(argv.slice(1), ROOT);
  const changed = changedFiles(base, ROOT) as string[];
  const tests = testFiles(ROOT) as string[];
  const { near, far } = selectTests(changed, tests, ROOT) as { near: string[]; far: string[] };
  const files = nearShard(near, shard.index, shard.total, readTimes(ROOT) as Record<string, number>);
  console.log(
    `[test-near] ${changed.length} changed files against ${base}: ${near.length} near and ${far.length} far tests;` +
      ` shard ${shard.index}/${shard.total} runs ${files.length}`,
  );
  if (files.length === 0) return 0;
  return runTests(files) as number;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
