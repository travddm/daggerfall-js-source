// @ts-check
// IC-GRAND's perf pass (bible/03-World/Arena-Provinces.md IC-GRAND, "Off the page's thread") - THE PAGE'S SIDE OF THE
// IMPERIAL CITY'S WORKER (world/imperialPrebuild.js says what and why; world/imperialPrebuildWorker.js makes the pieces).
// It tells the worker which slices are wanted, nearest first (`want`), holds what comes back a bounded number at a time,
// and hands a piece over once (`takeBlock`, `takeModel`) - the world-data door and the models' family ask it before they
// make a piece themselves (world/capitalModels.js), and a piece asked before the worker made it is made on this thread
// and the worker told to skip it (`made`). The worker laws the other clients keep (world/tamrielRoadsClient.js,
// world/deepWater/deepWatersClient.js): `new Worker(new URL(...))` in exactly that spelling for Vite; the factory
// injectable, so node never evaluates `new Worker`; THE FALLBACK IS THE SAME WORK - no Worker, a factory that throws, a
// worker that errors: nothing is held, and every piece is made on this thread as it always was.
//
// IC-STUTTER (2026-10-27, the owner: "Traveling in the Imperial City at x60 presents really bad stuttering"; bible/03-World/
// Arena-Provinces.md IC-STUTTER): A POOL, AND A PIECE ASKED FOR. At x60 a slice is crossed every two or three seconds and
// each crossing asks three to five slices near and as many at the stream's edge far - more city than one worker makes,
// so the page made the rest itself, each piece a unit no breath parts (a block 40-480 ms, a slice's skyline 0.2-0.5 s).
// Now PREBUILD_POOL_MAX workers at most (prebuildPoolSize: the machine's cores less two) share the slices, each slice one
// worker's (`ownerOf` - its blocks, its models and its landmarks' footprint made in one place); a build that would make
// a piece asks it (`need`: made before every wanted piece, even one made before and let go) and the stream builds the
// slice once it is held (scenes/capitalPrebuild.js readyToBuild) - the page makes none of the city while a worker stands.
import { setImperialPrebuild, imperialPrebuilt, pieceSlice } from './imperialPrebuild.js';
import { DONE_KEEP } from './imperialPrebuildWorker.js';
import { createIdleRelease, PREBUILD_IDLE_MS, laterTimeout } from './prebuildIdleRelease.js';

/** The city's worker, as Vite bundles it - `new Worker(new URL(...))` in exactly that spelling. */
export function defaultPrebuildWorker() {
  return new Worker(new URL('./imperialPrebuildWorker.js', import.meta.url), { type: 'module' });
}
/** How many made pieces are held for the build to take: a near ring's blocks and models (nine slices, ~125 pieces each) and
 *  the next ring's far blocks - each taken once and let go. IC-STUTTER: and the next ring's ahead near, and the pieces the
 *  stream's next few builds wait on (scenes/capitalPrebuild.js NEED_AHEAD) - room for all of them at once, so none is let
 *  go before its build takes it (~10 KB a piece). */
export const PREBUILD_KEEP = 4096;
/** IC-STUTTER: the most workers the city keeps - each holds its own modules, fabric caches and landmarks (~0.1-0.2 GB). */
export const PREBUILD_POOL_MAX = 3;
/** IC-STUTTER: how many workers make the city's pieces - the machine's cores less two (the page's thread and the browser's
 *  own), PREBUILD_POOL_MAX at most, one at least; one where no Worker stands (node, where the pins drive one).
 *  @param {number} [cores] @param {boolean} [hasWorker] */
export function prebuildPoolSize(cores = globalThis.navigator?.hardwareConcurrency, hasWorker = typeof globalThis.Worker === 'function') {
  if (!hasWorker) return 1;
  return Math.max(1, Math.min(PREBUILD_POOL_MAX, Math.floor(Number(cores) || 2) - 2));
}

/**
 * @param {{ makeWorker?: () => any, keep?: number, log?: { warn: Function }, workers?: number, idleMs?: number,
 *   later?: (fn: () => void, ms: number) => () => void }} [o] - IC-STUTTER: `workers` the pool's size (prebuildPoolSize).
 *   CITY-IDLE: `idleMs` how long idle workers stand, `later` the timer (world/prebuildIdleRelease.js).
 */
export function createImperialPrebuild({ makeWorker = defaultPrebuildWorker, keep = PREBUILD_KEEP, log = console, workers: size = prebuildPoolSize(), idleMs = PREBUILD_IDLE_MS, later = laterTimeout } = {}) {
  /** The workers standing now - none after an idle release (CITY-IDLE), made again by the next want or need.
   *  @type {any[]} */
  const pool = [];
  /** CITY-IDLE: false once no worker can run (none could be made, one failed, or the client was let go). The page then
   *  makes every piece itself, as it always did. */
  let usable = true;
  /** @type {Map<string, any>} */
  const held = new Map();
  const put = (k, v) => { held.delete(k); held.set(k, v); if (held.size > keep) held.delete(/** @type {string} */ (held.keys().next().value)); };
  /** IC-STUTTER: the pieces asked for and not yet back, and the ones a worker could not make (the page makes those). */
  const asked = new Set(), failed = new Set();
  /** CITY-IDLE: the pieces made lately, by a worker or the page. A worker made again is told them, so it does not make
   *  them twice: its own record went with the worker it replaces. */
  const done = new Set();
  const markDone = (/** @type {string} */ key) => {
    done.delete(key);
    done.add(key);
    if (done.size > DONE_KEEP) done.delete(/** @type {string} */ (done.values().next().value));
  };
  /** CITY-IDLE: the last want, said again to workers made after an idle release. @type {Array<{ s: number, near: boolean }>} */
  let lastSlices = [];
  let lastWant = '', taken = 0, missed = 0;
  /** IC-STUTTER: the worker a slice's pieces are made on. @param {number} s */
  const ownerOf = (s) => pool[(((s | 0) % pool.length) + pool.length) % pool.length];
  const shareOf = (/** @type {any} */ worker, /** @type {Array<{ s: number, near: boolean }>} */ slices) => (pool.length === 1 ? slices : slices.filter((w) => ownerOf(w.s) === worker));
  const letWorkersGo = () => {
    idleRelease.forget();
    for (const w of pool) { try { w?.terminate?.(); } catch { /* gone */ } }
    pool.length = 0;
  };
  const idleRelease = createIdleRelease({ workers: () => pool, waiting: () => asked.size > 0, release: letWorkersGo, idleMs, later });
  const post = (/** @type {any} */ worker, /** @type {any} */ message) => {
    idleRelease.posted(worker);
    worker.postMessage(message);
  };
  const stop = () => { letWorkersGo(); held.clear(); asked.clear(); failed.clear(); };
  /** CITY-IDLE: the workers made, if none stand - each told what is made and the last want. False when no worker can run. */
  const stand = () => {
    if (!usable) return false;
    if (pool.length) return true;
    for (let i = 0; i < Math.max(1, size); i++) {
      let worker;
      try { worker = makeWorker(); } catch (e) { if (!pool.length) log.warn('[imperial] no worker for the city\'s blocks - they are made on the page\'s thread', e); break; }
      worker.onmessage = (/** @type {MessageEvent} */ e) => {
        const m = e.data;
        if (m?.t === 'block' && m.json) { put(`b:${m.name}`, m.json); asked.delete(`b:${m.name}`); markDone(`b:${m.name}`); }
        else if (m?.t === 'model') { put(`m:${m.id}`, m.model ?? null); asked.delete(`m:${m.id}`); markDone(`m:${m.id}`); }
        else if (m?.t === 'error' && m.key) { asked.delete(m.key); failed.add(m.key); }   // IC-STUTTER: never waited on for ever - the page makes it
        else if (m?.t === 'idle') idleRelease.saidIdle(worker, m.heard);
      };
      worker.onerror = (/** @type {any} */ e) => { log.warn('[imperial] the city\'s worker failed - its blocks are made on the page\'s thread', e?.message ?? e); usable = false; stop(); };
      idleRelease.stood(worker);
      pool.push(worker);
    }
    if (!pool.length) {
      usable = false;
      return false;
    }
    for (const worker of pool) {
      if (done.size) post(worker, { t: 'done', keys: [...done] });
      if (lastSlices.length) post(worker, { t: 'want', slices: shareOf(worker, lastSlices) });
    }
    return true;
  };
  stand();
  const client = {
    /** The slices wanted now, in order (`[{ s, near }]`) - said to the worker when the list changes; IC-STUTTER: each
     *  worker its own slices' share, in the same order. */
    want(/** @type {Array<{ s: number, near: boolean }>} */ slices) {
      if (!usable) return;
      const k = slices.map((w) => `${w.s}${w.near ? 'n' : 'f'}`).join(',');
      if (k === lastWant) return;
      lastWant = k;
      lastSlices = slices;
      if (!pool.length) { stand(); return; }   // CITY-IDLE: workers made again are told this want as they stand
      for (const worker of pool) post(worker, { t: 'want', slices: shareOf(worker, slices) });
    },
    /** A block's JSON the worker made, handed over once - or null (the page makes it, and the worker is told). */
    takeBlock(/** @type {string} */ name) {
      const k = `b:${name}`;
      if (!held.has(k)) { missed++; client.made(k); return null; }
      const v = held.get(k);
      held.delete(k);
      taken++;
      return v;
    },
    /** A model the worker made (null: none in that cell), handed over once - or undefined (the page makes it). */
    takeModel(/** @type {number} */ id) {
      const k = `m:${id}`;
      if (!held.has(k)) { missed++; client.made(k); return undefined; }
      const v = held.get(k);
      held.delete(k);
      taken++;
      return v;
    },
    /** A piece the page made itself: the worker skips it. */
    made(/** @type {string} */ key) { failed.delete(key); asked.delete(key); markDone(key); if (pool.length) post(ownerOf(pieceSlice(key) ?? 0), { t: 'made', key }); },
    /** IC-STUTTER: whether a piece is ready for the page to take without making it - held, or one no worker could make
     *  (the page makes that one, as ever). */
    has: (/** @type {string} */ key) => held.has(key) || failed.has(key),
    /** IC-STUTTER: pieces a build is waiting on, asked of their slices' workers once (`asked` until each comes back) -
     *  made before any wanted piece. */
    need(/** @type {string[]} */ keys) {
      const fresh = [...new Set(keys)].filter((k) => !held.has(k) && !failed.has(k) && !asked.has(k));
      if (!fresh.length) return;
      if (!stand()) return;   // CITY-IDLE: workers let go while idle are made again for a need
      /** @type {Map<any, string[]>} */
      const by = new Map();
      for (const k of fresh) {
        asked.add(k);
        done.delete(k);   // made again: the page let its copy go
        const w = ownerOf(pieceSlice(k) ?? 0);
        if (!by.has(w)) by.set(w, []);
        /** @type {string[]} */ (by.get(w)).push(k);
      }
      for (const [w, ks] of by) post(w, { t: 'need', keys: ks });
    },
    /** The worker let go (out of the city's reach): nothing held, nothing wanted. */
    dispose() { usable = false; stop(); lastWant = ''; lastSlices = []; if (imperialPrebuilt() === client) setImperialPrebuild(null); },
    get held() { return held.size; },
    /** CITY-IDLE: whether workers make the city's pieces - true while they stand or can be made again after an idle
     *  release, so the stream waits for them and does not make the pieces on the page's thread. */
    get alive() { return usable; },
    /** IC-STUTTER: the pool's size (CITY-IDLE: none after an idle release), and the pieces asked for and not yet back. */
    get workers() { return pool.length; },
    get asked() { return asked.size; },
    /** The pieces handed over, and the ones asked before the worker made them (the probe's read). */
    get taken() { return taken; },
    get missed() { return missed; },
  };
  setImperialPrebuild(client);
  return client;
}
