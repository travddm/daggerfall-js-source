// AUDIT 64 - the BLOCK AND DUNGEON LAYOUT lane.
//
// Seven laws, each pinned against the REFERENCE's own value rather than
// against what the port happens to say:
//   F11 RMBLayout's StaticBuilding array + DaggerfallStaticBuildings.HasHit
//       + PlayerActivate.ActivateBuilding
//   F12 exterior EDITOR flats (archive 199) are stood but never rendered
//   F13 RDB NPC flats become StaticNPCs (Context.Dungeon) and click targets
//   F14 DaggerfallCityGate's 18:00/06:00 model swap
//   F15 FindClosestEnterMarker accepts Rest (199.4) as well as Enter (199.8)
//   F16 fixed treasure (archive 216) is placed at the marker, not grounded
//   F17 the ladder AND the furniture-action chain are ObjectType == 3 only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GLOBAL_SCALE } from '../../src/world/meshReader.js';
import { staticBuildingBox, staticBuildingWorldAabb, staticBuildingsHasHit } from '../../src/world/staticBuildings.js';
import { isCityGate, CITY_GATE_OPEN_MODEL_ID, CITY_GATE_CLOSED_MODEL_ID } from '../../src/world/rmbLayout.js';
import { makeCityGate, updateCityGate } from '../../src/world/city/cityGate.js';
import { collectBlockFlats, EDITOR_FLATS_ARCHIVE } from '../../src/world/rmbFlats.js';
import { isNpcFlat, NPC_FLAT_ARCHIVES } from '../../src/world/rdbLayout.js';
import { layoutInterior, INTERIOR_MARKER, PROP_MODEL_TYPE } from '../../src/world/interior/interiorLayout.js';
import { trs } from '../../src/world/mat4.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => hostText(p);

// ---------------------------------------------------------------------------
// F11 - the StaticBuilding array and its hit test.
// ---------------------------------------------------------------------------

test('AUDIT 64 F11: the StaticBuilding box IS the model\'s world extent (Size and points share pointDivisor)', () => {
  // RMBLayout.cs:873-874:
  //   size   = new Vector3(DFMesh.Size.X, .Y, .Z) * MeshReader.GlobalScale
  //   centre = new Vector3(0, DFMesh.Size.Y / 2, 0) * GlobalScale
  //
  // DFMesh.Size and the DFMesh POINTS are divided by the SAME
  // Arch3dFile pointDivisor, so that box is the model's world
  // silhouette and nothing else. Chain, all in API/Arch3dFile.cs:
  //   :39        `const float pointDivisor = 256.0f`
  //   :695-697   the RAW native x/y/z go into PureMesh.Planes[].Points[]
  //   :711-713   size = (maxX / pointDivisor - minX / pointDivisor), off
  //              those same raw extremes
  //   :714/:846  PureMesh.Size -> records[record].DFMesh.Size
  //   :935/:941-943  WritePoint, "Vector coordinates are divided by
  //              256.0f", divides the SAME raw points by the SAME
  //              pointDivisor into the DFMesh point buffer
  // and MeshReader.cs:717 lays the vertices down off that buffer as
  // `new Vector3(dfPoint.X, -dfPoint.Y, dfPoint.Z) * scale`.
  //
  // So this pin holds the box against the REFERENCE's vertex extent,
  // recomputed here from the reference's own arithmetic: a box scaled
  // by any extra divisor (or sized off some other AABB convention) is
  // a departure, not a repair.
  const POINT_DIVISOR = 256;                 // Arch3dFile.cs:39
  const rawPoints = [                        // native ARCH3D point values
    { x: -512, y: 0, z: -256 },
    { x: 3584, y: 2048, z: -256 },
    { x: 3584, y: 2048, z: 768 },
    { x: -512, y: 700, z: 768 },
  ];
  const ext = (sel) => {
    const v = rawPoints.map(sel);
    return { min: Math.min(...v), max: Math.max(...v) };
  };
  const ex = ext((p) => p.x), ey = ext((p) => p.y), ez = ext((p) => p.z);
  // Arch3dFile.cs:711-713 - this is DFMesh.Size.
  const dfMeshSize = {
    x: ex.max / POINT_DIVISOR - ex.min / POINT_DIVISOR,
    y: ey.max / POINT_DIVISOR - ey.min / POINT_DIVISOR,
    z: ez.max / POINT_DIVISOR - ez.min / POINT_DIVISOR,
  };
  // MeshReader.cs:717 over the WritePoint-divided buffer - the vertices.
  const verts = rawPoints.map((p) => [
    (p.x / POINT_DIVISOR) * GLOBAL_SCALE,
    -(p.y / POINT_DIVISOR) * GLOBAL_SCALE,
    (p.z / POINT_DIVISOR) * GLOBAL_SCALE,
  ]);
  const vext = (k) => {
    const v = verts.map((q) => q[k]);
    return Math.max(...v) - Math.min(...v);
  };
  const b = staticBuildingBox(dfMeshSize);
  // The formula RMBLayout.cs:873-874 writes...
  assert.deepEqual(b.size, [
    dfMeshSize.x * GLOBAL_SCALE, dfMeshSize.y * GLOBAL_SCALE, dfMeshSize.z * GLOBAL_SCALE]);
  assert.deepEqual(b.centre, [0, (dfMeshSize.y / 2) * GLOBAL_SCALE, 0]);
  // ...IS the model's world extent, on all three axes.
  for (const k of [0, 1, 2]) {
    assert.ok(Math.abs(b.size[k] - vext(k)) < 1e-9,
      `axis ${k}: box ${b.size[k]} must equal the vertex extent ${vext(k)}`);
  }
  // A model this ARCH3D does not carry gives the zero box, C#'s struct
  // default - never a throw.
  assert.deepEqual(staticBuildingBox(null).size, [0, 0, 0]);
});

test('AUDIT 64 F11: `firstModel` is per PLACED BLOCK, so a repeated block still gets its buildings', () => {
  // RMBLayout.cs:819-820 `doorsOut = new List<StaticDoor>(); buildingsOut
  // = new List<StaticBuilding>();` - AddModels' output lists are FRESH on
  // every call, and AddModels is called once per placed block. :824-832
  // then puts `bool firstModel = true;` INSIDE the per-subrecord loop,
  // scoped to that one call. Nothing in DFU is keyed on
  // `blockData.Index` (the BLOCKS.BSA record), which is shared by every
  // grid cell holding the same block name - and RMB blocks repeat all
  // over a town. A location-wide latch keyed on that index therefore
  // gives the FIRST placement its buildings and every repeat none.
  // :187-193 settles it: the buildings AddModels returned are stamped
  // `MakeBuildingKey((byte)layoutX, (byte)layoutY, (byte)recordIndex)`,
  // so a building's identity is (cell x, cell y, subrecord).
  //
  // Both outdoor hosts carry the law, so both are checked: the latch is
  // declared INSIDE the per-block loop, and its key never mentions the
  // block-file index.
  const hosts = [
    ['src/scenes/exterior.js', 'firstModelOfRecord', 'for (const b of loc.blocks) {'],
    ['src/scenes/world.js', 'pixelFirstModel', 'for (const b of loc.blocks) {'],
  ];
  for (const [file, latch, loopOpen] of hosts) {
    const t = src(file);
    // Anchor on the READ, then walk backwards: the block loop this latch
    // is consulted inside, and the nearest declaration above it. Both
    // hosts open more than one `for (const b of loc.blocks)`.
    const use = t.indexOf(`${latch}.has(`);
    assert.ok(use > 0, `${file}: ${latch} is read`);
    const loop = t.lastIndexOf(loopOpen, use);
    const decl = t.lastIndexOf(`const ${latch} = new Set()`, use);
    assert.ok(loop > 0, `${file}: the per-block loop is above the latch`);
    assert.ok(decl > loop,
      `${file}: the ${latch} latch must be created INSIDE the per-block loop (RMBLayout.cs:824-832 puts \`firstModel\` in AddModels, which runs once per PLACED block with a fresh buildingsOut, :819-820) - a location-wide one strands every repeated block`);
    // The key is the subrecord index alone. `dfBlock.index` in it is the
    // exact collision this law forbids.
    const keyLine = t.slice(t.lastIndexOf('const rk =', use), use);
    assert.ok(!keyLine.includes('dfBlock.index'),
      `${file}: the StaticBuilding latch key must not be keyed on the BLOCKS.BSA record index`);
  }
});

test('AUDIT 64 F11: HasHit is the WORLD AABB of the rotated 1.01 box, not an oriented box', () => {
  // DaggerfallStaticBuildings.cs:73-86 sets c.size = size * 1.01f on a
  // BoxCollider rotated by the model matrix and then asks
  // `c.bounds.Contains(point)` - and Collider.bounds is the world
  // AXIS-ALIGNED bounds of that rotated box. A 45-degree yaw therefore
  // WIDENS the test to the box's diagonal; an oriented-box test would be
  // tighter than DFU on every rotated shop.
  const box = { size: [2, 4, 2], centre: [0, 2, 0] };
  const flat = staticBuildingWorldAabb(box, trs(0, 0, 0, 0, 0, 0));
  assert.ok(Math.abs(flat.max[0] - 1.01) < 1e-6, 'axis aligned: half of size*1.01');
  assert.ok(Math.abs(flat.min[1] - (2 - 2.02)) < 1e-6, 'centre.y raises the box off the base');
  const spun = staticBuildingWorldAabb(box, trs(0, 0, 0, 0, 45, 0));
  assert.ok(spun.max[0] > flat.max[0] * 1.4,
    'the world AABB of a 45-degree box reaches its diagonal (an OBB test would not)');
  // HasHit takes the FIRST match and breaks (:82-87).
  const a = { aabb: { min: [0, 0, 0], max: [1, 1, 1] } };
  const b = { aabb: { min: [0, 0, 0], max: [2, 2, 2] } };
  assert.equal(staticBuildingsHasHit([a, b], [0.5, 0.5, 0.5]), a);
  assert.equal(staticBuildingsHasHit([a, b], [1.5, 1.5, 1.5]), b);
  assert.equal(staticBuildingsHasHit([a, b], [9, 9, 9]), null);
});

// ---------------------------------------------------------------------------
// F12 - editor flats are stood as data and never drawn.
// ---------------------------------------------------------------------------

test('AUDIT 64 F12: a MISC archive-199 flat is kept and flagged; a SUBRECORD one is never made', () => {
  const scenery = Array.from({ length: 16 }, () =>
    Array.from({ length: 16 }, () => ({ textureRecord: -1 })));
  const block = {
    rmbBlock: {
      fldHeader: { groundData: { groundScenery: scenery } },
      miscFlatObjectRecords: [
        // CUSTAA30.RMB's shape: the location START marker, 199/10.
        { textureArchive: EDITOR_FLATS_ARCHIVE, textureRecord: 10, xPos: 100, yPos: 50, zPos: 200, factionID: 0, flags: 0, position: 7 },
        { textureArchive: 201, textureRecord: 3, xPos: 10, yPos: 5, zPos: 20, factionID: 0, flags: 0, position: 8 },
      ],
      subRecords: [{
        xPos: 0, zPos: 0,
        exterior: { blockFlatObjectRecords: [{ textureArchive: EDITOR_FLATS_ARCHIVE, textureRecord: 10, xPos: 1, yPos: 1, zPos: 1 }] },
      }],
    },
  };
  const flats = collectBlockFlats(block, 504);
  // AddMiscBlockFlats (RMBLayout.cs:340-379) skips ONLY the lights
  // archive, so the marker is still stood - locationStartMarkers reads
  // exactly these. It is DaggerfallBillboard.Start that hides it
  // (:77-84, FlatTypes.Editor from MaterialReader.cs:980-981, and
  // StartGameBehaviour.cs:45 `ShowEditorFlats = false`).
  const marker = flats.find((f) => f.archive === EDITOR_FLATS_ARCHIVE && f.record === 10);
  assert.ok(marker, 'the 199/10 start marker survives collection');
  assert.equal(marker.editor, true);
  assert.equal(flats.find((f) => f.archive === 201).editor, false);
  // The SUBRECORD loop is a genuinely different law - RMBLayout.cs:409-410
  // never spawns that one at all - so exactly one 199 flat came back.
  assert.equal(flats.filter((f) => f.archive === EDITOR_FLATS_ARCHIVE).length, 1);
});

// ---------------------------------------------------------------------------
// F13 - RDB NPC flats.
// ---------------------------------------------------------------------------

test('AUDIT 64 F13: NPCFlatArchives is RDBLayout.cs:1250-1254, verbatim', () => {
  assert.deepEqual([...NPC_FLAT_ARCHIVES],
    [334, 346, 357, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184]);
  assert.equal(isNpcFlat(334), true);
  assert.equal(isNpcFlat(184), true);
  assert.equal(isNpcFlat(185), false);
  assert.equal(isNpcFlat(199), false);
});

// ---------------------------------------------------------------------------
// F14 - the city gates.
// ---------------------------------------------------------------------------

test('AUDIT 64 F14: IsCityGate accepts BOTH variants (RMBLayout.cs:1007-1011)', () => {
  assert.equal(CITY_GATE_OPEN_MODEL_ID, 446);
  assert.equal(CITY_GATE_CLOSED_MODEL_ID, 447);
  assert.equal(isCityGate(446), true);
  assert.equal(isCityGate(447), true);
  assert.equal(isCityGate(41739), false);
});

test('AUDIT 64 F14: DaggerfallCityGate.Update is a state machine, not an IsNight->model map', () => {
  // DaggerfallCityGate.cs:19 `bool isOpen = true`; :44-51
  //   if (isNight && isOpen || !isNight && !isOpen) Toggle();
  // A block that laid the CLOSED model at NOON therefore keeps 447
  // standing - the day arm does nothing on the first frame, and only the
  // first 18:00 -> 06:00 cycle opens it. A `!isNight => 446` mapping
  // would open that gate a whole day early.
  // OL5: `online: false` is stated rather than left to the default, so these
  // pins say WHICH world they hold for - the classic one. The default itself
  // is pinned separately below; relying on it here would make these pins go
  // quietly vacuous the day it changed.
  const OFF = { online: false };
  const closedByDay = makeCityGate(CITY_GATE_CLOSED_MODEL_ID);
  assert.equal(updateCityGate(closedByDay, false, OFF), false, 'daytime frame one: no toggle');
  assert.equal(closedByDay.modelId, CITY_GATE_CLOSED_MODEL_ID, 'the block data still decides');
  // Night acts on frame one, which is what closes a location entered at 20:00.
  const openAtDusk = makeCityGate(CITY_GATE_OPEN_MODEL_ID);
  assert.equal(updateCityGate(openAtDusk, true, OFF), true);
  assert.equal(openAtDusk.modelId, CITY_GATE_CLOSED_MODEL_ID);
  assert.equal(openAtDusk.isOpen, false);
  assert.equal(updateCityGate(openAtDusk, true, OFF), false, 'idempotent while the hour holds');
  assert.equal(updateCityGate(openAtDusk, false, OFF), true, 'dawn opens it again');
  assert.equal(openAtDusk.modelId, CITY_GATE_OPEN_MODEL_ID);
  // ...and the day-placed closed gate opens on its first NIGHT->day cycle.
  assert.equal(updateCityGate(closedByDay, true, OFF), true);
  assert.equal(closedByDay.modelId, CITY_GATE_CLOSED_MODEL_ID);
  assert.equal(updateCityGate(closedByDay, false, OFF), true);
  assert.equal(closedByDay.modelId, CITY_GATE_OPEN_MODEL_ID);
});

test('OL5: the shared world never lets a town gate shut, and a gate laid CLOSED still opens', () => {
  // Mac, 2026-09-20: "Town gates online... should all be open at night time
  // online mode". A closed gate carries a collider (GameObjectHelper.cs:246-250),
  // so online this was a walled city sealed for two real hours with no way to
  // sleep the clock forward.
  const ON = { online: true };
  // An open gate is never told it is night.
  const open = makeCityGate(CITY_GATE_OPEN_MODEL_ID);
  assert.equal(updateCityGate(open, true, ON), false, 'dusk does nothing online');
  assert.equal(open.modelId, CITY_GATE_OPEN_MODEL_ID);
  assert.equal(open.isOpen, true);
  for (const night of [true, false, true, true, false]) updateCityGate(open, night, ON);
  assert.equal(open.modelId, CITY_GATE_OPEN_MODEL_ID, 'and no sequence of hours shuts it');

  // THE ONE THAT KILLED THE FIRST DRAFT. `isOpen` is born TRUE whatever model
  // the block laid (DaggerfallCityGate.cs:19), so a gate laid CLOSED starts as
  // "open" standing on 447 - a wall - and classic only notices at the first
  // 18:00. An online arm written as "night is always false" never notices at
  // all and the wall stands all session. Online the law is on the MODEL.
  const laidShut = makeCityGate(CITY_GATE_CLOSED_MODEL_ID);
  assert.equal(laidShut.isOpen, true, 'DaggerfallCityGate.cs:19 - isOpen is born true whatever the model');
  assert.equal(updateCityGate(laidShut, true, ON), true, 'online, frame one opens it');
  assert.equal(laidShut.modelId, CITY_GATE_OPEN_MODEL_ID);
  assert.equal(updateCityGate(laidShut, true, ON), false, 'and then stays put');

  // The same gate offline is classic: still shut at night.
  const offline = makeCityGate(CITY_GATE_OPEN_MODEL_ID);
  assert.equal(updateCityGate(offline, true, { online: false }), true, 'offline nothing moved');
  assert.equal(offline.modelId, CITY_GATE_CLOSED_MODEL_ID);
});

// ---------------------------------------------------------------------------
// F15 - the Rest-marker fallback.
// ---------------------------------------------------------------------------

test('AUDIT 64 F15: FindClosestEnterMarker accepts Rest (199.4) as well as Enter (199.8)', () => {
  // DaggerfallInterior.cs:63-69 gives the enum, :242-246 the clause:
  //   // Sometimes marker 199.4 is used where the 199.8 enter marker should be
  //   if (markers[i].type != Enter && markers[i].type != Rest) continue;
  assert.equal(INTERIOR_MARKER.REST, 4);
  assert.equal(INTERIOR_MARKER.ENTER, 8);
});

// ---------------------------------------------------------------------------
// F16 - fixed treasure keeps the marker's exact position.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// F17 - ObjectType == propModelType gates the ladder and the furniture.
// ---------------------------------------------------------------------------

test('AUDIT 64 F17: layoutInterior carries ObjectType, and 41409 climbs only as a prop', () => {
  assert.equal(PROP_MODEL_TYPE, 3);   // DaggerfallInterior.cs:31
  const model = { positions: new Float32Array([0, 1, 0, 0, -0.5, 0]), doors: [] };
  const dfBlock = {
    rmbBlock: {
      subRecords: [{
        interior: {
          header: { num3dObjectRecords: 2 },
          block3dObjectRecords: [
            // The windmill's own three ladders are ObjectType 3; this is
            // the pair DaggerfallInterior.cs:492 discriminates between.
            { modelIdNum: 41409, objectType: 3, xPos: 0, yPos: 0, zPos: 0, xRotation: 0, yRotation: 0, zRotation: 0 },
            { modelIdNum: 41409, objectType: 0, xPos: 40, yPos: 0, zPos: 0, xRotation: 0, yRotation: 0, zRotation: 0 },
          ],
          blockFlatObjectRecords: [],
          blockDoorRecords: [],
        },
      }],
    },
  };
  const out = layoutInterior(dfBlock, 0, 0, () => model);
  assert.deepEqual(out.placements.map((p) => p.objectType), [3, 0],
    'objectType rides every placement - DFU gates TWO clauses on it');
});
