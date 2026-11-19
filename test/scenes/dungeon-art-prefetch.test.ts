// A dungeon's art fetched ahead (scenes/dungeon-art-prefetch.ts): every archive the build asks for first, each once,
// fetched a few at a time; a failed fetch is left to the build; and the remap is the dungeon's texture table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUNGEON_ART_CONCURRENCY,
  dungeonArtArchives,
  fetchArchives,
  remapAndPrefetchDungeonArt,
} from '../../src/scenes/dungeon-art-prefetch.ts';
import { applyTextureTable } from '../../src/world/dungeon/dungeonTextures.js';

const models: Record<number, { subMeshes: { textureArchive: number; textureRecord: number }[] }> = {
  1: {
    subMeshes: [
      { textureArchive: 19, textureRecord: 0 },
      { textureArchive: 20, textureRecord: 3 },
    ],
  },
  2: { subMeshes: [{ textureArchive: 19, textureRecord: 1 }] },
};
const dungeon = {
  textureTable: [119, 120, 122, 123, 124, 168],
  blocks: [
    { layout: { placements: [{ modelIdNum: 1 }, { modelIdNum: 2 }, { modelIdNum: 99 }], flats: [{ archive: 210 }] } },
    { layout: { placements: [{ modelIdNum: 2 }], flats: [{ archive: 210 }, { archive: 211 }] } },
  ],
};
const modelOf = (id: number) => models[id] ?? null;

/** A getTexture that records each ask and how many were in flight at once, and answers after a turn of the loop. */
function countingFetch(failing: Set<number> = new Set()) {
  const asked: number[] = [];
  let inFlight = 0;
  let mostInFlight = 0;
  const getTexture = async (archive: number): Promise<unknown> => {
    asked.push(archive);
    inFlight++;
    mostInFlight = Math.max(mostInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;
    if (failing.has(archive)) throw new Error(`no archive ${archive}`);
    return { archive };
  };
  return { asked, getTexture, most: () => mostInFlight };
}

test('the archives are each model archive, its remapped archive and each flat archive, once, in the order met', () => {
  const remap = (archive: number) => archive + 1000;
  assert.deepEqual(dungeonArtArchives(dungeon, remap, modelOf), [19, 1019, 20, 1020, 210, 211]);
});

test('every archive is fetched, no more than the bound at once', async () => {
  const archives = Array.from({ length: 29 }, (_, i) => 100 + i);
  const fetcher = countingFetch();
  await fetchArchives(archives, fetcher.getTexture);
  assert.deepEqual([...fetcher.asked].sort(), [...archives].sort());
  assert.equal(fetcher.most(), DUNGEON_ART_CONCURRENCY);
});

test('a failed fetch is left to the build and the rest are still fetched', async () => {
  const fetcher = countingFetch(new Set([2]));
  await fetchArchives([1, 2, 3], fetcher.getTexture);
  assert.deepEqual(fetcher.asked, [1, 2, 3]);
});

test('the remap is the dungeon texture table, and its art fetch starts at once', () => {
  const fetcher = countingFetch();
  const remap = remapAndPrefetchDungeonArt(dungeon, 0, { modelOf, getTexture: fetcher.getTexture });
  for (const archive of [19, 20, 74, 210])
    assert.equal(remap(archive), applyTextureTable(archive, dungeon.textureTable, 0));
  assert.ok(fetcher.asked.length > 0, 'started before the build asks');
});
