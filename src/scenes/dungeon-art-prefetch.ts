// A dungeon's texture archives, fetched ahead of its build. scenes/dungeonContext.js buildDungeonContext asks for each
// archive with an await, one placement and one flat at a time, and each ask that misses the cache waits for its file
// while the street draws more frames: a Daggerfall city's dungeon asked for 29 archives one after another, 37 to 75 ms
// apart. This module starts every archive the layout names as soon as the dungeon's texture table is known, and every
// foe's sprite archive before the foes are built, a few at a time. The build's own asks then find each one fetched or
// on its way (scenes/dataPipeline.js getTexture keeps one fetch for each archive). The build still asks, uploads and
// fills its remap table in its own order, so nothing it draws changes.
import { applyTextureTable } from '../world/dungeon/dungeonTextures.js';
import { ENEMY_BASICS } from '../characters/enemy/enemyBasics.js';

/** How many archives are fetched at once: systems/textureReplacement.js preloads its pictures eight at a time. */
export const DUNGEON_ART_CONCURRENCY = 8;

type SubMesh = { readonly textureArchive: number; readonly textureRecord: number };
type Placement = { readonly modelIdNum: number };
type Flat = { readonly archive: number };
type DungeonBlock = { readonly layout: { readonly placements: readonly Placement[]; readonly flats: readonly Flat[] } };

/** A dungeon as world/dungeon/dungeonLayout.js layoutDungeon answers it: its blocks and its texture table. */
export type LaidDungeon = { readonly blocks: readonly DungeonBlock[]; readonly textureTable: number[] };

export type DungeonArtSources = {
  /** A model's sub-meshes as the layout read them (buildDungeonContext's getModelPre), or null for a model it lacks. */
  readonly modelOf: (modelIdNum: number) => { readonly subMeshes?: readonly SubMesh[] } | null | undefined;
  readonly getTexture: (archive: number) => Promise<unknown>;
};

/** Every archive the build will ask for first: each model's own archives (its upload sizes its pictures by them),
 *  their archives under the dungeon's table, and each flat's. In the order the build meets them, each once. */
export function dungeonArtArchives(
  dungeon: LaidDungeon,
  remap: (archive: number, record: number) => number,
  modelOf: DungeonArtSources['modelOf'],
): number[] {
  const archives = new Set<number>();
  for (const block of dungeon.blocks) {
    for (const placement of block.layout.placements) {
      for (const subMesh of modelOf(placement.modelIdNum)?.subMeshes ?? []) {
        archives.add(subMesh.textureArchive);
        archives.add(remap(subMesh.textureArchive, subMesh.textureRecord));
      }
    }
    for (const flat of block.layout.flats) archives.add(flat.archive);
  }
  return [...archives];
}

/** Fetches `archives`, `concurrency` at a time. A failed fetch is left to the build's own ask, which meets it as it
 *  did before. Resolves when every fetch has settled. */
export async function fetchArchives(
  archives: readonly number[],
  getTexture: (archive: number) => Promise<unknown>,
  concurrency: number = DUNGEON_ART_CONCURRENCY,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < archives.length) {
      const archive = archives[next];
      next++;
      try {
        await getTexture(archive);
      } catch {
        // The build asks for this archive again and reports what it finds.
      }
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, archives.length); i++) workers.push(worker());
  await Promise.all(workers);
}

/** The dungeon's texture table as a remap (world/dungeon/dungeonTextures.js applyTextureTable), with its art's fetch
 *  started. The fetch is not awaited: the build goes on at once and meets each archive fetched or in flight. */
export function remapAndPrefetchDungeonArt(
  dungeon: LaidDungeon,
  climateBaseType: number,
  sources: DungeonArtSources,
): (archive: number) => number {
  const remap = (archive: number): number => applyTextureTable(archive, dungeon.textureTable, climateBaseType);
  void fetchArchives(dungeonArtArchives(dungeon, remap, sources.modelOf), sources.getTexture);
  return remap;
}

type FoeSpawn = { readonly mobileType: number };
type FoeTextures = { readonly maleTexture?: number; readonly femaleTexture?: number };

/** Each foe's sprite archives, each once. Both genders' archives are listed: a human foe's gender is rolled on the
 *  shared random stream when it is built, and a fetch made here must not draw from that stream. */
export function foeArtArchives(
  foes: readonly FoeSpawn[],
  texturesOf: (mobileType: number) => FoeTextures | undefined,
): number[] {
  const archives = new Set<number>();
  for (const foe of foes) {
    const textures = texturesOf(foe.mobileType);
    if (textures?.maleTexture) archives.add(textures.maleTexture);
    if (textures?.femaleTexture) archives.add(textures.femaleTexture);
  }
  return [...archives];
}

/** Starts the foes' sprite archives and answers the foes, so the build's loop reads them unchanged. */
export function prefetchFoeArt<Foe extends FoeSpawn>(
  foes: readonly Foe[],
  getTexture: (archive: number) => Promise<unknown>,
): readonly Foe[] {
  const basics = ENEMY_BASICS as Record<number, FoeTextures | undefined>;
  void fetchArchives(
    foeArtArchives(foes, (mobileType) => basics[mobileType]),
    getTexture,
  );
  return foes;
}
