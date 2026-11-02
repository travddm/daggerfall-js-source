import { createHash } from 'node:crypto';

// A fixed set of inputs for the animation-source module, and the way its answers are recorded.
//
// mwAnimSourcesParity.test.js runs the current module over these inputs and compares with the recording in
// test/fixtures/mw/mwAnimSourcesParity.json, which was made from the implementation this module replaced.
// The inputs (also kept in the recording, so the test does not need the game files) are:
//   - the names of every .kf in Morrowind.bsa, Tribunal.bsa and Bloodmoon.bsa (the archive probe),
//   - the skeleton path of every race, sex and view, and of the werewolf, as the arm builder asks for them,
//   - the model and the Bipedal flag of every CREA record of the three .esm files,
//   - for every .kf: its normalized text keys and the translation keys of its accumulation-root track.
// The answers are the source lists for each actor, then the group searches over each distinct list.

const GROUP_PROBES = ['nosuchgroup', 'idle', 'walkforward', 'attack1'];
const KEY_SUFFIXES = [': start', ': stop', ': loop start', ': loop stop', ''];

// Numbers are rounded to 1e-3 to keep the recording small; the recorded answers come from the rounded inputs.
const asNumbers = (value) => {
  if (typeof value === 'number') return Math.round(value * 1e3) / 1e3;
  if (value === null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(asNumbers);
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, asNumbers(inner)]));
};

/**
 * The velocity searches sample an accumulation-root track only at the time of a group's start and stop keys. This
 * keeps one linear key for each of those times, holding the real track's position there, so the recording stays small
 * and every answer is the same as over the whole track.
 */
export function samplePoints(translations, keys, sampleKeyGroup, linear) {
  const times = [...new Set(keys.filter((key) => /: (loop )?(start|stop)$/.test(key.text)).map((key) => key.time))];
  times.sort((x, y) => x - y);
  const points = times
    .map((time) => ({ time, value: sampleKeyGroup(translations, 3, time) }))
    .filter((point) => point.value);
  return { type: linear, keys: points.map(({ time, value }) => ({ time, value })) };
}

/** The inputs, read from the retail files. Only the recording step calls this. */
export async function readInputs({ dataPath, fs, path, modules }) {
  const { MwBsaFile, parseNif, anim, skin, keysModule, firstPerson, correctActorModelPath } = modules;
  const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map(
    (name) => new MwBsaFile(new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.bsa`)))),
  );
  const has = (p) => archives.some((archive) => archive.has(p));
  const kfNames = archives
    .flatMap((archive) => archive.list())
    .filter((name) => name.endsWith('.kf'))
    .sort();

  const races = new Map();
  const creatures = [];
  for (const name of ['Morrowind', 'Tribunal', 'Bloodmoon']) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(dataPath, `${name}.esm`)));
    for (const [id, race] of firstPerson.raceRecords(bytes)) races.set(id, { id, beast: race.beast });
    for (const rec of firstPerson.creatureRecords(bytes)) {
      if (!rec.model) continue;
      creatures.push({
        id: rec.id,
        model: correctActorModelPath(`meshes/${rec.model}`, has),
        bipedal: (rec.flags & firstPerson.CREA_FLAG.Bipedal) !== 0,
      });
    }
  }

  const skeletons = [];
  const settings = {
    fp: {
      male: 'meshes/xbase_anim.1st.nif',
      female: 'meshes/base_anim_female.1st.nif',
      beast: 'meshes/base_animkna.1st.nif',
    },
    tp: { male: 'meshes/base_anim.nif', female: 'meshes/base_anim_female.nif', beast: 'meshes/base_animkna.nif' },
  };
  for (const view of ['fp', 'tp']) {
    for (const race of [...races.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      for (const female of [false, true]) {
        const raw = race.beast ? settings[view].beast : female ? settings[view].female : settings[view].male;
        skeletons.push({ view, race: race.id, female, werewolf: false, skeleton: correctActorModelPath(raw, has) });
      }
    }
    const wolf = view === 'fp' ? 'meshes/wolf/skin.1st.nif' : 'meshes/wolf/skin.nif';
    skeletons.push({
      view,
      race: '(werewolf)',
      female: false,
      werewolf: true,
      skeleton: correctActorModelPath(wolf, has),
    });
  }

  const clips = {};
  for (const name of kfNames) {
    const nif = parseNif(
      archives
        .find((archive) => archive.has(name))
        .get(name)
        .slice(),
    );
    const keys = anim.normalizeTextKeys(anim.collectTextKeys(nif));
    const tracks = anim.extractTracks(nif);
    const accum = skin.ACCUM_ROOT_NAMES.find((bone) => tracks.has(bone));
    clips[name] = {
      keys: keys.map((key) => [key.time, key.text]),
      accum: accum
        ? {
            bone: accum,
            translations: asNumbers(
              samplePoints(tracks.get(accum).translations, keys, keysModule.sampleKeyGroup, keysModule.KEY_TYPE.linear),
            ),
          }
        : null,
    };
  }
  return { kfNames, races: [...races.values()], skeletons, creatures, clips };
}

/** A source object as the arm builder makes one, from a recorded clip. */
export function sourceFrom(name, clip, clipGroups) {
  const keys = clip.keys.map(([time, text]) => ({ time, text }));
  const groups = clipGroups(keys);
  const trackMap = new Map();
  if (clip.accum) trackMap.set(clip.accum.bone, { translations: clip.accum.translations });
  return { name, keys, groups, groupSet: new Set(groups), trackMap };
}

const round = (value) => (Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : value);

/** The source lists every actor gets. */
export function recordLists(sourcesModule, inputs) {
  const exists = (p) => inputs.kfNames.includes(p);
  const lists = {};
  for (const entry of inputs.skeletons) {
    const key = `${entry.view} ${entry.race} ${entry.female ? 'f' : 'm'}`;
    const make = entry.view === 'fp' ? sourcesModule.fpAnimSources : sourcesModule.tpAnimSources;
    lists[key] = make(entry.skeleton, exists, { werewolf: entry.werewolf });
  }
  for (const creature of inputs.creatures) {
    lists[`creature ${creature.id}`] = sourcesModule.creatureAnimSources(creature.model, exists, {
      bipedal: creature.bipedal,
    });
  }
  return lists;
}

/** The searches over each distinct list, for every group any clip names and for a few that no clip names. */
export function recordSearches(sourcesModule, anim, inputs, lists) {
  const sourceCache = new Map();
  const sourceOf = (name) => {
    if (!sourceCache.has(name)) sourceCache.set(name, sourceFrom(name, inputs.clips[name], anim.clipGroups));
    return sourceCache.get(name);
  };
  const groups = new Set(GROUP_PROBES);
  for (const clip of Object.values(inputs.clips))
    for (const group of anim.clipGroups(sourceFrom('', clip, anim.clipGroups).keys)) groups.add(group);
  const groupList = [...groups].sort();

  const npcLists = new Set(
    Object.entries(lists)
      .filter(([key]) => !key.startsWith('creature '))
      .map(([, list]) => JSON.stringify(list)),
  );
  const out = {};
  for (const names of new Set(Object.values(lists).map((list) => JSON.stringify(list)))) {
    const sources = JSON.parse(names).map(sourceOf);
    const lines = groupList.map((group) => {
      const pick = sourcesModule.pickAnimSource(sources, group, anim.resetClip);
      const loopPick = sourcesModule.pickAnimSource(sources, group, anim.resetClip, { loopFallback: true });
      return [
        group,
        sourcesModule.anySourceHasGroup(sources, group),
        pick ? pick.index : -1,
        loopPick ? loopPick.index : -1,
        round(sourcesModule.sourcesVelocity(sources, group)),
        ...sources.map((source) => round(sourcesModule.sourceVelocityOf(source, group))),
        ...KEY_SUFFIXES.map((suffix) => round(sourcesModule.sourcesKeyTime(sources, `${group}${suffix}`))),
      ].join('|');
    });
    // A creature's list is one or two clips of its own: its answers are kept as a digest.
    out[names] = npcLists.has(names) ? lines : createHash('sha256').update(lines.join('\n')).digest('hex');
  }
  return { groups: groupList, bySourceList: out };
}

/** The small cases: names that are not .nif, mixed case, no archive entries, every archive entry, no sources. */
export function recordEdges(sourcesModule, inputs) {
  const none = () => false;
  const all = () => true;
  const some =
    (...names) =>
    (p) =>
      names.includes(p);
  return {
    names: [
      'meshes/xbase_anim.1st.nif',
      'MESHES\\X.NIF',
      'a.kf',
      'a.NIF',
      'a.nif.bak',
      '',
      null,
      undefined,
      'noext',
    ].map((model) => sourcesModule.animSourceName(model)),
    fpNone: sourcesModule.fpAnimSources('meshes/base_anim_female.1st.nif', none),
    fpAll: sourcesModule.fpAnimSources('meshes/base_anim_female.1st.nif', all),
    fpMaleAll: sourcesModule.fpAnimSources(sourcesModule.FP_BASE_MODEL, all),
    fpWerewolfAll: sourcesModule.fpAnimSources('meshes/wolf/skin.1st.nif', all, { werewolf: true }),
    fpOwnOnly: sourcesModule.fpAnimSources('meshes/base_animkna.1st.nif', some('meshes/base_animkna.1st.kf')),
    tpAll: sourcesModule.tpAnimSources('meshes/base_anim_female.nif', all),
    tpMaleAll: sourcesModule.tpAnimSources(sourcesModule.TP_BASE_MODEL, all),
    tpWerewolfAll: sourcesModule.tpAnimSources('meshes/wolf/skin.nif', all, { werewolf: true }),
    creatureBipedAll: sourcesModule.creatureAnimSources('meshes/xhuman.nif', all, { bipedal: true }),
    creatureBipedNone: sourcesModule.creatureAnimSources('meshes/xhuman.nif', none, { bipedal: true }),
    creatureOwnAll: sourcesModule.creatureAnimSources('meshes/xrat.nif', all),
    creatureBaseModel: sourcesModule.creatureAnimSources(sourcesModule.TP_BASE_MODEL, all, { bipedal: true }),
    emptyLists: [
      sourcesModule.pickAnimSource([], 'idle', () => ({ ok: true })),
      sourcesModule.pickAnimSource(null, 'idle', () => ({ ok: true })),
      sourcesModule.anySourceHasGroup(null, 'idle'),
      sourcesModule.sourcesKeyTime(null, 'idle: start'),
      sourcesModule.sourcesVelocity(null, 'idle'),
      sourcesModule.sourceVelocityOf(null, 'idle'),
    ],
    knownKfCount: inputs.kfNames.length,
  };
}

export function recordAnimSources(sourcesModule, anim, inputs) {
  const lists = recordLists(sourcesModule, inputs);
  return {
    lists,
    searches: recordSearches(sourcesModule, anim, inputs, lists),
    edges: recordEdges(sourcesModule, inputs),
    unitsPerMeter: sourcesModule.MW_UNITS_PER_METER,
  };
}
