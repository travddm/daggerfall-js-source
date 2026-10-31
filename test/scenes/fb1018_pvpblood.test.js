// FIELD BUGS 2026-10-18 PVP-BLOOD (bible/01-Overview/bugs/Field-Bugs-2026-10-18.md, found reading Anon-e-moose's
// "Gradual FPS loss then crash" and left in its first pass). A duel's blow and the open zone's both splashed into the
// street's pool (`hitEffects`), which only the street's frame ticks and draws, and whose marks are the street's ring on
// the street's collider; a peer's blow already took the pool I stand in (`modes.liveHitEffects`, PEERFX2), and these
// take it too. AUDIT FB1018 L3-5 (bible/01-Overview/audits/Audit-Field-Bugs-2026-10-18.md): neither could bleed off the
// street - a duel is outdoors only, and in the zone's dungeons every peer was refused (wildFair read a dungeon-frame pose
// as the map's corner pixel); fixed, the zone's halls fight and their blood is the dungeon's pool's. Source pins:
// bootWorld is not run in Node.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { worldCoordToMapPixel } from '../../src/world/streamingWorld.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const LIVE = '(modes?.liveHitEffects?.() ?? hitEffects).showBloodSplash(';
const BARE = /(?<![\w.)])hitEffects\??\.showBloodSplash\(/g;   // AUDIT FB1018 L3-6: the optional call too
/** The body of the arrow `head` opens in world.js, to the first line that closes it at its own indent. */
const body = (src, head) => {
  const at = src.indexOf(head);
  assert.ok(at > 0, `${head} is in world.js`);
  const end = src.indexOf('\n  };\n', at);
  assert.ok(end > at, `${head} closes`);
  return src.slice(at, end);
};

test('PVP-BLOOD THE ZONE\'S HALLS (AUDIT FB1018 L3-5): in a dungeon a room\'s peer is fair by the place, never by its pose - the pose is the dungeon\'s own frame, which the map reads as its corner pixel, so every peer in the zone\'s halls was refused and no blow landed there', () => {
  // the cause, executed: a dungeon's own coordinates (blocks at 51.2 m, a few either side of its centre) are the map's corner
  // PIN MOVED (WW-C2, bible/03-World/World-Wide.md WW-C): the conversion is FLOORED past the Bay's west and south edges, so
  // the corner is its four pixels about the map's (0, 0) - truncation folded both sides onto one
  for (const [x, z] of [[0, 0], [307.2, 307.2], [-307.2, -307.2], [100, -300]]) {
    const p = worldCoordToMapPixel(x, z);
    assert.ok([-1, 0].includes(p.x) && [499, 500].includes(p.y), `${x},${z} -> ${p.x},${p.y}: the map's corner`);
  }
});
