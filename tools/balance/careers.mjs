// Monster careers (attributes, from MONSTER.BSA's ENEMY*.CFG) when Daggerfall's data is at hand.
//
// ARENA2 is freeware and never in the repo: `sh tools/fetch-data.sh` fetches it, `ARENA2_PATH` points at it. Without it
// every foe has the neutral career the game's own tests use (every attribute 50), the same in both rule sets, so a
// run without data is still a fair comparison.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadMonsterCareer } from '../../src/characters/enemy/enemyEntity.js';

/** @returns {Promise<(id: number) => object|null>} the career of a monster id, or null where there is no data */
export async function careerLoader(arena2Path) {
  if (!arena2Path || !existsSync(join(arena2Path, 'MONSTER.BSA'))) return () => null;
  const fetchBytes = async (name) => {
    return new Uint8Array(readFileSync(join(arena2Path, name)));
  };
  const cache = new Map();
  for (let id = 0; id <= 42; id++) cache.set(id, await loadMonsterCareer(id, fetchBytes));
  return (id) => cache.get(id) ?? null;
}
