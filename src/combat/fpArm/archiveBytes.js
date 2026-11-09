// @ts-check
// The first-person arm's reads from the Morrowind archives: loading entries before a synchronous read, one shared
// copy of a mesh's bytes, one parse of a mesh, the masters' load order, and whether a skeleton carries a bone.
// Moved out of fpArm.js unchanged; fpArm.js re-exports what it exported before.
import { parseNif } from '../../formats/morrowind/mwNifFile.js';
import { buildSkeleton, injectSkeletonNodes } from '../../formats/morrowind/mwSkin.js';

// THE ARCHIVE IS OPENED, NOT READ, AND THIS FILE IS ITS
// ONE READER.
//
// Every boot used to pull each stored .bsa out of IndexedDB as one whole
// ArrayBuffer - 150-300 MB apiece, three of them on a retail set, one to
// three seconds each measured - and hold them for the session, so that
// this file could read a few dozen entries out of them. dataSource now
// OPENS each archive off its stored Blob (MwBsaFile.open): the directory
// arrives by range, and an ENTRY's bytes arrive by range when somebody
// loads them.
//
// What that costs this file is one law. `get` is still synchronous and
// still answers what is in hand - the contract every reader here already
// speaks - but on a lazily opened archive it THROWS ("not loaded - await
// load(path) first") for an entry nobody asked for. So every synchronous
// read below is now preceded, IN THE SAME FUNCTION, by the load that
// brings its bytes in, and the two helpers here are the whole mechanism.
// There is no second copy of the `find` law in any preload: the archive
// a path is loaded from is the archive it is read from, by construction.
//
// The resident archives - every test fixture's {has, get} duck, the
// loose-file archive, a whole-buffer MwBsaFile - answer `loaded` true for
// everything they carry and `load` out of memory, so one body of code
// drives both and no fixture had to move.

/** Bring in every path the archives carry, through the SAME
 *  `find` law the synchronous read uses - the first archive whose `has`
 *  answers owns the path. Deduped and CONCURRENT: one lazy entry is a
 *  ranged read of about a millisecond, and forty of them in a row is
 *  forty round trips, which is the load time this whole change is about.
 *  Never throws - a path that will not load is reported by the read that
 *  follows, in that read's own words. An archive with no `load` door is
 *  already resident, which is the old two-door duck. */
export async function loadFromArchives(archives, paths) {
  const seen = new Set();
  const jobs = [];
  for (const path of paths ?? []) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const arc = (archives ?? []).find((a) => a.has(path));
    if (!arc || typeof arc.load !== 'function') continue;
    if (typeof arc.loaded === 'function' && arc.loaded(path)) continue;
    jobs.push(Promise.resolve(arc.load(path)).catch(() => null));
  }
  if (jobs.length) await Promise.all(jobs);
}

/** `find`, asserting the bytes are in hand. A path no archive
 *  carries answers null exactly as `find` does, and every caller already
 *  reports that as "not in your archives". A path an archive DOES carry
 *  and has not loaded is a missed preload - a defect in this file - and
 *  it is named here, with the path, rather than left to surface as a
 *  bare throw from inside MwBsaFile.get two frames down. */
export function findLoaded(archives, path) {
  const arc = (archives ?? []).find((a) => a.has(path));
  if (arc && typeof arc.loaded === 'function' && !arc.loaded(path)) {
    throw new Error(`MW-LOAD: ${path} was read before it was loaded - the preload that covers this read missed it`);
  }
  return arc;
}

/** A mesh is parsed once per byte array: the assembly parses the weapon mesh, and so does the search for the bow's
 *  arrow node (fpArmParts.js arrowPlacement). */
export function parseNifOnce(bytes, cache = parseNifOnce.cache) {
  if (cache.has(bytes)) return cache.get(bytes);
  const nif = parseNif(bytes);
  cache.set(bytes, nif);
  parseNifOnce.parses++; // only the parses the memo could not answer, so a test can see one parse per mesh
  return nif;
}
parseNifOnce.cache = new WeakMap();
parseNifOnce.parses = 0;
/** How many meshes the builds have PARSED (a memo hit is not one); tests read it to check the shared parse. */
export const nifParseCount = () => parseNifOnce.parses;

/** The masters in their load order. */
const ESM_MASTERS = Object.freeze(['morrowind.esm', 'tribunal.esm', 'bloodmoon.esm']);
/**
 * THE MASTERS IN LOAD ORDER - Morrowind.esm, Tribunal.esm, Bloodmoon.esm, then any other (a mod, after
 * the masters it names), each run of them as stored. The store answers its keys alphabetically (Bloodmoon, Morrowind,
 * Tribunal), and both record walks below let the last record of an id win "as the engine's load order does" - so an
 * expansion's record lost to Morrowind's own. dataSource.js ranks the .bsa files by the same three names, the other way
 * round: there the first archive that has a path answers it.
 * @param {string[]} names
 */
export function esmLoadOrder(names) {
  // The masters by their WHOLE names - by prefix, "Morrowind Patch.esm" ranked as Morrowind's own
  // and, stored before it (' ' sorts before '.'), lost every record it patched to the master it patches
  const rank = (n) => {
    const i = ESM_MASTERS.indexOf(String(n).split(/[\\/]/).pop().toLowerCase());
    return i < 0 ? ESM_MASTERS.length : i;
  };
  return names
    .map((n, i) => /** @type {[string, number]} */ ([n, i]))
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([n]) => n);
}

/**
 * ONE COPY OF A
 * MESH'S BYTES, FOR EVERY BODY. Every build copied each part's bytes out of its archive (`.slice()`) and parsed the
 * copy - a fresh copy a build, so parseNifOnce's memo (keyed by the bytes) never met the same mesh twice, and every
 * body re-parsed every mesh it wore: the player's on each equip, each peer's, and a crowd of NPCs wearing the same
 * dozen body parts. A mesh's bytes are copied ONCE per archive now and handed to every build that asks, so the memo
 * answers the second body from the first's parse (a parsed NIF is read, never written - mwFirstPerson.js
 * assembleFirstPersonArm's note). Keyed by the archive object and the path (a whole-buffer archive answers a fresh
 * view each `get`; a lazy one its cached bytes - both key the same), the copy is kept per archive while it lives, the
 * oldest let go past NIF_COPY_CAP, and its parse with it (the memo is weak). A path the archive cannot answer is
 * `undefined`, as `find(path)?.get(path)?.slice()` was.
 */
export const NIF_COPY_CAP = 384;
const NIF_COPIES = new WeakMap(); // archive -> Map(path -> bytes), insertion-ordered: the oldest first
export function nifBytes(arc, path) {
  if (!arc) return undefined;
  let m = NIF_COPIES.get(arc);
  if (!m) NIF_COPIES.set(arc, (m = new Map()));
  let b = m.get(path);
  if (b) {
    m.delete(path);
    m.set(path, b);
    return b;
  }
  const src = arc.get(path);
  if (!src) return src;
  b = src.slice();
  m.set(path, b);
  if (m.size > NIF_COPY_CAP) m.delete(m.keys().next().value);
  return b;
}

/** Whether a skeleton carries a node of this name (any case): the weapon's own node, the arrow's, the torch's. */
export function skeletonHasBone(skeletonBytes, name) {
  try {
    const skel = buildSkeleton(parseNifOnce(skeletonBytes));
    return skel.byName.has(String(name).toLowerCase());
  } catch {
    return false;
  }
}
/** skeletonHasBone AFTER the bone addons - a dry injection over the
 *  same bytes, so the holster resolves against the skeleton the
 *  assembly will build. */
export function boneProbe(skeletonBytes, boneSources) {
  let skel = null;
  try {
    skel = buildSkeleton(parseNifOnce(skeletonBytes));
    for (const src of boneSources ?? []) {
      try {
        injectSkeletonNodes(skel, parseNifOnce(src.bytes));
      } catch {
        /* the assembly notes it */
      }
    }
  } catch {
    skel = null;
  }
  return (name) => !!skel && skel.byName.has(String(name).toLowerCase());
}
