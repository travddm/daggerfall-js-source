// A fixed set of inputs for the head-view module (mwHeadView.js: which node carries the first-person camera, and the
// neck turn that pitches the view), and the way its answers are recorded.
//
// mwHeadViewParity.test.js runs the current module over these inputs and compares with the recording in
// test/fixtures/mw/mwHeadViewParity.json, which was made from the implementation this module replaced. The inputs are
// kept in the recording as well, so the test does not need the game files:
//   - for each retail rig (the human first-person arms, the beast first-person arms, the human third-person body): the
//     neck chain of its skeleton, root to head, and its camera node where it has one;
//   - for each of six clips (idle, walk, run, jump, a weapon swing, a punch): the local pose of the chain at up to
//     12 frames of 1/30 s from the clip's start key, sampled from the retail .kf file.

export const RIGS = [
  { id: 'fp-human', nif: 'meshes/xbase_anim.1st.nif', kf: 'meshes/xbase_anim.1st.kf' },
  { id: 'fp-beast', nif: 'meshes/base_animkna.1st.nif', kf: 'meshes/xbase_animkna.1st.kf' },
  { id: 'tp-human', nif: 'meshes/xbase_anim.nif', kf: 'meshes/xbase_anim.kf' },
];
// Each clip, with the groups that carry it: the beast arms play the hand-to-hand forms of idle, walk, run and jump.
export const CLIPS = {
  idle: ['idle', 'idlehh'],
  walk: ['walkforward', 'walkforwardhh'],
  run: ['runforward', 'runforwardhh'],
  jump: ['jump', 'jumphh'],
  swing: ['weapononehand', 'handtohand'],
  punch: ['handtohand'],
};
export const FRAMES = 12;
export const FRAME_SECONDS = 1 / 30;
export const NECK = 'bip01 neck';

/** The look-pitch, focus and sink offset combinations each pose is run with. */
export const COMBOS = [
  { pitch: 0, focus: 0, offset: null },
  { pitch: 0.5, focus: 0, offset: null },
  { pitch: -0.8, focus: 0, offset: null },
  { pitch: 0.5, focus: 1, offset: null },
  { pitch: 1.0, focus: 0.5, offset: null },
  { pitch: 0.5, focus: 0, offset: [0, 0, -12] },
  { pitch: 0, focus: 0, offset: [0, 0, -12] },
  { pitch: 0, focus: 0, offset: [5, -3, 2] },
];

const to4 = (value) => Math.round(value * 1e4) / 1e4;
const to3 = (value) => Math.round(value * 1e3) / 1e3;
const nodeData = (local) => ({
  r: Array.from(local.rotation, to4),
  t: Array.from(local.translation, to4),
  s: to4(local.scale),
});

/** The inputs, read from the retail files. Only the recording step calls this. */
export function readInputs({ dataPath, fs, path, modules }) {
  const { MwBsaFile, parseNif, anim, skin } = modules;
  const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map(
    (name) => new MwBsaFile(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.bsa`)))),
  );
  const get = (name) =>
    archives
      .find((archive) => archive.has(name))
      .get(name)
      .slice();
  const rigs = {};
  for (const rig of RIGS) {
    const skeleton = skin.buildSkeleton(parseNif(get(rig.nif)));
    const kf = parseNif(get(rig.kf));
    const tracks = anim.extractTracks(kf);
    const keys = anim.normalizeTextKeys(anim.collectTextKeys(kf));
    const accumRoot = skin.accumRootRef(skeleton, tracks);

    const wanted = new Set();
    for (const name of [NECK, 'camera', 'head', 'bip01 head']) {
      let ref = skeleton.byName.get(name);
      while (ref !== undefined && ref >= 0 && !wanted.has(ref)) {
        wanted.add(ref);
        ref = skeleton.nodes.get(ref).parent;
      }
    }
    const chain = [...wanted].sort((a, b) => a - b);
    const index = new Map(chain.map((ref, i) => [ref, i]));
    const nodes = chain.map((ref) => {
      const node = skeleton.nodes.get(ref);
      return {
        name: node.name.toLowerCase(),
        parent: index.has(node.parent) ? index.get(node.parent) : -1,
        rest: nodeData(node.rest),
      };
    });

    const clips = {};
    const groups = new Set(anim.clipGroups(keys));
    for (const [label, candidates] of Object.entries(CLIPS)) {
      const group = candidates.find((name) => groups.has(name));
      const times = keys.filter((key) => key.text.startsWith(`${group}:`)).map((key) => key.time);
      if (!group || !times.length) continue;
      const start = Math.min(...times);
      const stop = Math.max(...times);
      const poses = [];
      for (let i = 0; i < FRAMES; i++) {
        const time = start + i * FRAME_SECONDS;
        if (time > stop) break;
        const pose = skin.poseSkeleton(skeleton, tracks, anim.sampleTrack, time, { accumRoot });
        poses.push(chain.map((ref) => nodeData(pose.get(ref))));
      }
      clips[label] = { group, start: to4(start), stop: to4(stop), poses };
    }
    rigs[rig.id] = { nodes, clips };
  }
  return { rigs };
}

export const toLocal = (data) => ({
  rotation: Float32Array.from(data.r),
  translation: data.t.slice(),
  scale: data.s,
});
export const poseOf = (recorded) => new Map(recorded.map((data, ref) => [ref, toLocal(data)]));

/** A skeleton in the shape mwSkin.js builds, from a recorded rig. */
export function rigSkeleton(rig) {
  const nodes = new Map();
  const byName = new Map();
  rig.nodes.forEach((node, ref) => {
    nodes.set(ref, { ref, name: node.name, parent: node.parent, rest: toLocal(node.rest) });
    if (!byName.has(node.name)) byName.set(node.name, ref);
  });
  return { nodes, byName };
}

/**
 * Records the answers of a head-view implementation. `api` adapts one implementation to these calls:
 *   viewRef(skeleton)                                                   the node that carries the camera, or -1
 *   applyNeck(skeleton, pose, rootRef, skelMats, pitch, focus, offset) boolean; edits `pose`
 *   applyTurn(skeleton, pose, rootRef, skelMats, ref, turnMatrix)       boolean; edits `pose`
 *   stepFocus(previous, aiming, seconds)                                the focus after the step
 *   pitchShare(focus)                                                   the fraction of the look pitch the neck takes
 *   pitchMatrix(radians)                                                the 3x3 that pitches down about the root's X
 */
export function recordHeadView(api, inputs, skin) {
  const out = { rigs: {}, focus: {}, share: {}, matrices: {} };
  const rootRef = skin.GRAPH_ROOT;
  const worlds = (skeleton, pose) => skin.skeletonSpaceMatrices(skeleton, pose, rootRef);
  for (const [id, rig] of Object.entries(inputs.rigs)) {
    const skeleton = rigSkeleton(rig);
    const viewRef = api.viewRef(skeleton);
    const rigOut = { view: viewRef >= 0 ? skeleton.nodes.get(viewRef).name : null, clips: {}, turns: {} };
    out.rigs[id] = rigOut;
    for (const [group, clip] of Object.entries(rig.clips)) {
      rigOut.clips[group] = clip.poses.map((recorded) =>
        COMBOS.map((combo) => {
          const pose = poseOf(recorded);
          const applied = api.applyNeck(
            skeleton,
            pose,
            rootRef,
            skin.skeletonSpaceMatrices,
            combo.pitch,
            combo.focus,
            combo.offset,
          );
          const m = worlds(skeleton, pose).get(viewRef);
          return [applied ? 1 : 0, ...Array.from(m.t), m.a[0], m.a[3], m.a[6], m.a[2], m.a[5], m.a[8]].map(to3);
        }),
      );
      const pose = poseOf(clip.poses[0]);
      const ref = skeleton.byName.get('bip01 spine1');
      const done = api.applyTurn(skeleton, pose, rootRef, skin.skeletonSpaceMatrices, ref, api.pitchMatrix(0.4));
      const after = worlds(skeleton, pose);
      rigOut.turns[group] = [
        done,
        ...['bip01 spine2', NECK, 'bip01 head'].flatMap((name) => {
          const m = after.get(skeleton.byName.get(name));
          return [...Array.from(m.t, to3), ...Array.from(m.a, to3)];
        }),
      ];
    }
  }

  // The focus: idle for half a second, aiming for 0.4 s, then released for 3 s, at three frame rates.
  const run = (fps) => {
    let focus = 0;
    const values = [];
    for (const [seconds, aiming] of [
      [0.5, false],
      [0.4, true],
      [3, false],
    ]) {
      for (let i = 0; i < Math.round(seconds * fps); i++) {
        focus = api.stepFocus(focus, aiming, 1 / fps);
        values.push(to4(focus));
      }
    }
    return values;
  };
  for (const fps of [30, 60, 144]) out.focus[fps] = run(fps);
  for (const focus of [0, 0.25, 0.5, 1]) out.share[focus] = to4(api.pitchShare(focus));
  for (const radians of [0, 0.3, -0.7]) out.matrices[radians] = Array.from(api.pitchMatrix(radians), to4);
  return out;
}
