// FIELD BUGS 2026-10-21d FLAT-WALK (Krinton, the Discord's #bug-reports: "Was going thru a dungeon 'Edworyan
// Laboratory' would cast the teleport spell at the beginning of the dungeon then would randomly get rubber-band back to
// the entrance ... no matter if I went down a diffrent hallway went down various floors"). Not the spell: the online
// build of the Daggerfall region's Edworyan Laboratory (MAPS 17/643) is medium, its first block N0000014, and six
// hanging roots there (TEXTURE.213 records 7-10, MultiTrigger flat Teleports, at head height over three floors) each
// send the body to object 21538, beside the start marker. FLAT-RELAY (2026-10-05c) had made a flat relay a walk's; in
// DFU an acting flat's box is a trigger the controller never hits (RDBLayout.AddAction `isTrigger = true`), so a root
// fires on a click or a blow alone. The record: bible/01-Overview/bugs/Field-Bugs-2026-10-21d.md.
//
// On the real ARENA2 (skipped without it): the build the online room stands, the host's own collision pass and its
// teleport landing lifted out of dungeonContext.js and worldModes.js, the real motor walked under every root from every
// clear bearing - nothing heard, nobody moved - and a click on a root still lands beside the start.
import './../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadData } from '../../tools/climbDungeonProbe.mjs';
import { layoutDungeon } from '../../src/world/dungeon/dungeonLayout.js';
import { dungeonLocationFor } from '../../src/world/smallerDungeons.js';
import { ACTION_FLAGS, TRIGGER_FLAGS } from '../../src/world/rdbLayout.js';
import { ActionSystem, walkHears, hasActionCollision, COLLISION_TIMEOUT_S, standsOnAction, actionContact, EFFECT_ACTION_FLAGS } from '../../src/world/actionSystem.js';
import { objectAabb } from '../../src/player/activate.js';
import { Collider } from '../../src/player/collider.js';
import { PlayerMotor, FIXED_DT, CAPSULE_HEIGHT, TELEPORT_FREEZE_S } from '../../src/player/motor.js';
import { floorLanding } from '../../src/player/enterExit.js';
import { TextureFile } from '../../src/formats/textureFile.js';
import { billboardSize } from '../../src/world/rmbFlats.js';
import { multiply } from '../../src/world/mat4.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ARENA2 = process.env.ARENA2_PATH;
const SKIP = !ARENA2 || !existsSync(join(ARENA2, 'BLOCKS.BSA')) ? 'ARENA2_PATH has no BLOCKS.BSA' : false;

/** The build, registered as the host registers it: the models' collision, the position index (P10) and every acting
 *  flat through registerFlatAction's arms - its box the billboard's (TEXTURE's own size). */
function build(data, loc) {
  const d = layoutDungeon(loc, data.blocks, data.getModel);
  const collider = new Collider(() => -Infinity), triggerSurfaces = new Collider(() => -Infinity);
  for (const b of d.blocks) {
    const om = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, b.originX, 0, b.originZ, 1];
    for (const p of b.layout.placements) { const m = data.getModel(p.modelIdNum); if (m) collider.addMesh('dungeon', m.positions, m.indices, multiply(om, p.matrix)); }
    for (const dr of b.layout.actionDoors) { if (dr.disabled) continue; const m = data.getModel(dr.modelIdNum); if (m) collider.addMesh('dungeon', m.positions, m.indices, multiply(om, dr.matrix)); }
  }
  const actions = new ActionSystem(collider, {});
  const index = new Map();
  for (const [bi, b] of d.blocks.entries()) for (const [pos, e] of b.layout.objectPositions) index.set(`${bi}:${pos}`, { pos: [e.x + b.originX, e.y, e.z + b.originZ], yawDeg: e.yawDeg });
  actions.resolvePosition = (ns, key) => index.get(`${ns}:${key}`) ?? null;
  const textures = new Map();
  const tex = (archive) => {
    if (!textures.has(archive)) {
      const name = `TEXTURE.${String(archive).padStart(3, '0')}`, t = new TextureFile();
      t.load(new Uint8Array(readFileSync(join(ARENA2, name))), name);
      textures.set(archive, t);
    }
    return textures.get(archive);
  };
  const roots = [];
  for (const [bi, b] of d.blocks.entries()) for (const f of b.layout.flats) {
    if (!f.action || EFFECT_ACTION_FLAGS.has(f.action.actionFlag)) continue;
    const x = f.x + b.originX, y = f.y, z = f.z + b.originZ, size = billboardSize(tex(f.archive), f.record);
    const aabb = { min: [x - size.w / 2, y - size.h / 2, z - size.w / 2], max: [x + size.w / 2, y + size.h / 2, z + size.w / 2] };
    const o = actions.addRelay(bi, f.position, f.action, aabb, [x, y, z]);
    if (o.actionFlag === ACTION_FLAGS.Teleport) roots.push({ o, at: [x, y, z], block: b.name, art: `${f.archive}.${f.record}` });
  }
  const sm = d.startMarker;
  return { d, collider, triggerSurfaces, actions, roots, start: floorLanding(collider, [sm.x, sm.y + 1.08, sm.z]) };
}

test('FLAT-WALK: Edworyan Laboratory as the online room builds it - every hanging root walked under from every clear bearing hears nothing and moves nobody, and a click on one still lands the body beside the start (mutants: the pass back on hasActionCollision, walkHears blind to flats)', { skip: SKIP }, (t) => {
  const data = loadData(ARENA2);
  const loc = data.maps.getLocationByName('Daggerfall', 'Edworyan Laboratory');
  const world = build(data, dungeonLocationFor(loc, { online: true, setting: false, medium: false, world: false }));
  assert.equal(world.d.blocks.find((b) => b.isStartingBlock)?.name ?? world.d.blocks[0].name, 'N0000014.RDB', 'the online build starts in N0000014');
  const roots = world.roots.filter((r) => r.o.triggerFlag === TRIGGER_FLAGS.MultiTrigger && r.art.startsWith('213.'));
  assert.equal(roots.length, 6, `the six roots: ${roots.map((r) => `${r.block}#${r.o.positionKey} ${r.art}`).join(', ')}`);
  // a click (DFU's PlayerActivate: Direct) on a root is heard, and lands the body by the start marker
  const sent = [];
  world.actions.onTeleport = (dest) => sent.push(dest.pos);
  world.actions.receive(roots[0].o, 'Direct');
  world.actions.update?.(FIXED_DT);
  assert.equal(sent.length, 1, 'clicked, sent on');
  const gap = Math.hypot(sent[0][0] - world.start[0], sent[0][2] - world.start[2]);
  assert.ok(gap < 2, `beside the start (${gap.toFixed(2)} m)`);
});
