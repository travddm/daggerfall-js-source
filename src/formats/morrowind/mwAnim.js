// Morrowind keyframe animation - slice 3 of the import arc. Three jobs,
// all pure data: pull the text-key ANIMATION GROUPS out of a NIF
// ("Idle: Start" ... "Idle: Stop"), pull per-bone keyframe TRACKS out of
// either an inline-animated NIF (base_anim.nif style - controllers on
// the bones) or an external .kf (xbase_anim.kf style -
// NiSequenceStreamHelper pairing a NiStringExtraData bone-name chain
// with a controller chain), and SAMPLE a track at a time.
//
// Interpolation follows the key type the NIF stores (nif.xml, KeyType):
//   - linear: lerp
//   - constant: the earlier key's value up to and including the halfway point, the later key's after it (quaternions too)
//   - quadratic: cubic Hermite on the stored in and out tangents; quaternion keys of this type carry no tangents,
//     so they are interpolated as linear ones
//   - TBC: tangents generated from tension, continuity and bias (mwKeys.js), then the same Hermite; quaternion keys
//     of this type are interpolated as linear ones
//   - XYZ: three float tracks composed as rotations about X, Y and Z
//
// The rules that find a clip in a list of text keys and play it are in mw-clip-law.ts and are re-exported here.

import { deref, KEY_TYPE } from './mwNifFile.js';
import { segment, sampleKeyGroup } from './mwKeys.js';

export * from './mw-clip-law.ts';

// --- text keys and groups --------------------------------------------------

/** Every text key in the file, sorted by time. */
export function collectTextKeys(nif) {
  const keys = [];
  for (const rec of nif.records) {
    if (rec.type === 'NiTextKeyExtraData') keys.push(...rec.keys);
  }
  return keys.slice().sort((a, b) => a.time - b.time);
}

/**
 * Parse "Group: marker" text keys into named groups. One key's text can
 * carry several lines (retail packs "SoundGen: Left\nGroupname: Stop"
 * style bundles); every line is its own marker.
 * @returns {Map<string, {start:number, stop:number, loopStart:number|null,
 *   loopStop:number|null}>}
 */
export function parseAnimGroups(textKeys) {
  const groups = new Map();
  for (const { time, text } of textKeys) {
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([^:]+?)\s*:\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      const name = m[1];
      const marker = m[2].toLowerCase();
      let g = groups.get(name);
      if (!g) {
        g = { start: null, stop: null, loopStart: null, loopStop: null, markers: new Map() };
        groups.set(name, g);
      }
      // Every marker is kept - attack sub-segments ("chop start",
      // "chop hit"...) live here for the first-person layer.
      g.markers.set(marker, time);
      if (marker === 'start') g.start = time;
      else if (marker === 'stop') g.stop = time;
      else if (marker === 'loop start') g.loopStart = time;
      else if (marker === 'loop stop') g.loopStop = time;
    }
  }
  // Only groups that actually bracket time are playable.
  for (const [name, g] of groups) {
    if (g.start == null || g.stop == null) groups.delete(name);
  }
  return groups;
}

/**
 * THE CASE-INSENSITIVE DOOR onto that map, and the reason it
 * has to exist.
 *
 * parseAnimGroups above lowercases every MARKER (`m[2].toLowerCase()`)
 * and keeps the GROUP name exactly as written - an inconsistency
 * inside one function, and the consumer that matters looks groups up
 * by a hard-coded capitalisation ('Idle1h', 'WeaponOneHand'). A file
 * that writes `idle1h:` therefore resolves nothing, and a first-person
 * rig with no group to play freezes in its bind pose. The playback rules
 * in mw-clip-law.ts lower-case group names on the way in for the same
 * reason: real data and mods do not agree on case.
 *
 * The map itself stays keyed by the ORIGINAL name, because the mesh
 * viewer is a coverage scout and must show what the file actually
 * says. This is the lookup, not a second store.
 */
export function findAnimGroup(groups, name) {
  if (!groups || !name) return null;
  const direct = groups.get(name);
  if (direct) return direct;
  const want = String(name).toLowerCase();
  for (const [key, g] of groups) if (key.toLowerCase() === want) return g;
  return null;
}

// --- tracks ----------------------------------------------------------------

/** Exported - an effect mesh's keyframed nodes are sampled by the same track (formats/morrowind/mwVfx.js). */
export function trackFromController(nif, ctrl) {
  const data = deref(nif, ctrl.data);
  if (!data || data.type !== 'NiKeyframeData') return null;
  return {
    startTime: ctrl.startTime,
    stopTime: ctrl.stopTime,
    frequency: ctrl.frequency,
    phase: ctrl.phase,
    rotationType: data.rotationType,
    axisOrder: data.axisOrder ?? 0,
    rotationKeys: data.rotationKeys,
    xyzRotations: data.xyzRotations,
    translations: data.translations,
    scales: data.scales,
  };
}

/**
 * Per-bone tracks, keyed by LOWERCASED bone name. Handles both shapes:
 * a .kf's NiSequenceStreamHelper root, and inline controllers on named
 * nodes anywhere in the record list.
 * @returns {Map<string, object>}
 */
export function extractTracks(nif) {
  const tracks = new Map();
  const helper = nif.roots.map((r) => deref(nif, r)).find(
    (r) => r && r.type === 'NiSequenceStreamHelper',
  );
  if (helper) {
    // Extra chain: [text keys] then one NiStringExtraData per controller.
    const names = [];
    for (let e = deref(nif, helper.extra); e; e = deref(nif, e.next)) {
      if (e.type === 'NiStringExtraData') names.push(e.string);
    }
    let i = 0;
    for (let c = deref(nif, helper.controller); c; c = deref(nif, c.next)) {
      if (c.type !== 'NiKeyframeController') continue;
      const name = names[i++];
      const track = trackFromController(nif, c);
      if (name && track) tracks.set(name.toLowerCase(), track);
    }
    return tracks;
  }
  for (const rec of nif.records) {
    if (!rec.name || rec.controller == null || rec.controller < 0) continue;
    for (let c = deref(nif, rec.controller); c; c = deref(nif, c.next)) {
      if (c.type === 'NiKeyframeController') {
        const track = trackFromController(nif, c);
        if (track) tracks.set(rec.name.toLowerCase(), track);
        break;
      }
    }
  }
  return tracks;
}

// --- sampling --------------------------------------------------------------

// The float KeyGroup sampler (Hermite, the TCB
// tangents, the segment search) lives in mwKeys.js - the particle colour
// ramp is a KeyGroup too, and its own copy dropped the TCB tangents.

/** Quaternion slerp on [w,x,y,z]. */
function slerp(a, b, u) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bw = b;
  if (dot < 0) {
    bw = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    const out = [
      a[0] + u * (bw[0] - a[0]),
      a[1] + u * (bw[1] - a[1]),
      a[2] + u * (bw[2] - a[2]),
      a[3] + u * (bw[3] - a[3]),
    ];
    const n = Math.hypot(...out);
    return out.map((v) => v / n);
  }
  const theta = Math.acos(dot);
  const s = Math.sin(theta);
  const wa = Math.sin((1 - u) * theta) / s;
  const wb = Math.sin(u * theta) / s;
  return [
    wa * a[0] + wb * bw[0],
    wa * a[1] + wb * bw[1],
    wa * a[2] + wb * bw[2],
    wa * a[3] + wb * bw[3],
  ];
}

function axisQuat(axis, angle) {
  const h = angle / 2;
  const s = Math.sin(h);
  const q = [Math.cos(h), 0, 0, 0];
  q[1 + axis] = s;
  return q;
}

function quatMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

// Application order per NIF axis-order code (nif.xml, AxisOrder); each triple is applied left to right.
const AXIS_ORDERS = [
  [0, 1, 2], // XYZ
  [0, 2, 1], // XZY
  [1, 2, 0], // YZX
  [1, 0, 2], // YXZ
  [2, 0, 1], // ZXY
  [2, 1, 0], // ZYX
  [0, 1, 0], // XYX
  [1, 2, 1], // YZY
  [2, 0, 2], // ZXZ
];

function sampleRotation(track, time) {
  if (track.rotationType === KEY_TYPE.xyz) {
    const [gx, gy, gz] = track.xyzRotations;
    const angles = [
      sampleKeyGroup(gx, 1, time) ?? 0,
      sampleKeyGroup(gy, 1, time) ?? 0,
      sampleKeyGroup(gz, 1, time) ?? 0,
    ];
    const order = AXIS_ORDERS[track.axisOrder ?? 0] ?? AXIS_ORDERS[0];
    // Apply order[0] first: q = q2 x q1 x q0 in Hamilton terms.
    let q = axisQuat(order[0], angles[order[0]]);
    q = quatMul(axisQuat(order[1], angles[order[1]]), q);
    q = quatMul(axisQuat(order[2], angles[order[2]]), q);
    return q;
  }
  const keys = track.rotationKeys;
  if (!keys || !keys.length) return null;
  const [i0, i1, u] = segment(keys, time);
  if (i0 === i1) return keys[i0].value.slice();
  // A quaternion track is either constant (the nearer key) or slerped; there are no tangents to build a curve from.
  if (track.rotationType === KEY_TYPE.constant) {
    return (u > 0.5 ? keys[i1] : keys[i0]).value.slice();
  }
  return slerp(keys[i0].value, keys[i1].value, u);
}

/**
 * Sample a bone track at a time (already inside the clip's range).
 * @returns {{rotation:number[]|null, translation:number[]|null,
 *   scale:number|null}}
 */
export function sampleTrack(track, time) {
  return {
    rotation: sampleRotation(track, time),
    translation: sampleKeyGroup(track.translations, 3, time),
    scale: sampleKeyGroup(track.scales, 1, time),
  };
}
