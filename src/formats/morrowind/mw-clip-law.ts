// How a Morrowind animation clip is found in a file's text keys and played from them.
//
// A NIF or KF file holds one list of text keys, each a time and a text. A text is one or more lines (the files
// separate lines with CR, LF or both), and a line of the form "group: action" marks a point of an animation group:
// "Idle: Start", "Idle: Loop Start", "Idle: Loop Stop", "Idle: Stop", and for weapons "Chop Hit". Lines of another
// form, such as "Sound: Swish", sit in the same list and belong to no group. The rules below read that list: they
// normalise it, find the time range of a group, step a playhead through it, and measure how fast a clip travels.
//
// mwAnim.js has a second reading of the same keys, parseAnimGroups, that answers a different question: it lists the
// groups for a viewer's menu and keeps the spelling the file used. The two are kept apart because their answers
// differ on purpose, for example on a key written "Sneak:Start" with no space and on a stop key with a trailing
// character.

import { allWeaponShortGroups } from './mwWeaponAnim.js';
import { sampleKeyGroup } from './mwKeys.js';

/** One text key of a normalised list: a time and a single lower-case line. */
export type TextKey = { time: number; text: string };

/** What the playback rules read of a track: the translation keys of one bone. */
export type TranslationTrack = { translations?: unknown };

export type ClipOptions = {
  /** Loop between the group's own start and stop keys when it has no loop keys of its own. */
  loopFallback?: boolean;
  /** How far into the clip to begin, from 0 (the start key) to 1 (the stop key). */
  startPoint?: number;
  loopCount?: number;
  loopingEnabled?: boolean;
  /** The action word of the key that begins the clip. */
  start?: string;
  /** The action word of the key that ends the clip. */
  stop?: string;
};

export type ClipState = {
  ok: true;
  group: string;
  startTime: number;
  stopTime: number;
  loopStartTime: number;
  loopStopTime: number;
  time: number;
  playing: boolean;
  loopCount: number;
  loopingEnabled: boolean;
  /** Index of the next key the playhead has not yet fired. */
  nextKey: number;
};

export type ClipRefusal = { ok: false; reason: string };

/** What a caller learns of a key the playhead crossed: its text, its time, and whether it belongs to the playing group. */
export type KeyListener = (text: string, time: number, inPlayingGroup: boolean) => void;

/** Lower-cases the letters A to Z and nothing else. String.prototype.toLowerCase also folds characters such as the
 *  Kelvin sign into ASCII letters, and a key text is matched byte for byte. */
export function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));
}

/** The lines of every key as keys of their own, each trimmed and lower-cased, empty lines dropped. A key whose text
 *  has several lines gives several keys at the same time, in order. A CRLF pair splits into two separators, so empty
 *  pieces appear between lines and are dropped after the split. */
export function normalizeTextKeys(textKeys?: { time: number; text?: unknown }[] | null): TextKey[] {
  return (textKeys ?? []).flatMap(({ time, text }) =>
    String(text ?? '')
      .split(/[\r\n]/)
      .map((line) => asciiLower(line.trim()))
      .filter((line) => line !== '')
      .map((line) => ({ time, text: line })),
  );
}

/** The group a key text names: everything before the first ": " (colon and one space). A text without ": " names no
 *  group. */
export function textKeyGroup(text: unknown): string | null {
  const keyText = String(text ?? '');
  const separator = keyText.indexOf(': ');
  return separator < 0 ? null : keyText.slice(0, separator);
}

/** The names of the groups a list names, each once, sorted. */
export function clipGroups(keys?: TextKey[] | null): string[] {
  const names = new Set<string>();
  for (const key of keys ?? []) {
    const name = textKeyGroup(key.text);
    if (name) names.add(name);
  }
  return [...names].sort();
}

/** The time of the first key whose text begins with `textKey`, or -1 when there is none. The match is a prefix, so a
 *  caller can ask for "chop min attack" without knowing the list. The answer is -1 and not null because callers
 *  compare it with times: a missing key then fails an ordering test instead of poisoning arithmetic with NaN. */
export function getTextKeyTime(keys: TextKey[] | undefined | null, textKey: unknown): number {
  const prefix = String(textKey ?? '');
  const list = keys ?? [];
  const found = list.findIndex((key) => key.text.startsWith(prefix));
  return found < 0 ? -1 : list[found].time;
}

/** The time of the earliest key of a group, whatever its action, or -1. That is the group's first key, which is not
 *  always its "start" key. The ": " after the name keeps "idle" from matching "idle2: start". */
export function getStartTime(keys: TextKey[] | undefined | null, group: unknown): number {
  const prefix = `${asciiLower(String(group ?? ''))}: `;
  const list = keys ?? [];
  const found = list.findIndex((key) => key.text.startsWith(prefix));
  return found < 0 ? -1 : list[found].time;
}

/** The index of the last key at or before `fromIndex`, and at or after `lowestIndex`, whose text passes the test; -1
 *  when none does. */
function findBackwards(
  keys: TextKey[],
  fromIndex: number,
  lowestIndex: number,
  test: (text: string) => boolean,
): number {
  for (let index = fromIndex; index >= lowestIndex; index--) {
    if (test(keys[index].text)) return index;
  }
  return -1;
}

/** The index of the first key at or after `time`; the list's length when every key is earlier. The scan is linear and
 *  does not assume the list is sorted. */
function firstKeyAtOrAfter(keys: TextKey[], time: number): number {
  const found = keys.findIndex((key) => !(key.time < time));
  return found < 0 ? keys.length : found;
}

/**
 * The time range of one group of a list, and the playhead at its start. Answers a refusal when the list has no such
 * clip, and never a guess: a caller that is refused moves on to its next source of animation, and a guessed range
 * would play a plausible wrong clip with no error.
 *
 * The range comes from the group's last block. Some retail files list a group twice (undeadwolf_2.nif has two
 * "walkforward" blocks), and the later block is the one that plays. From the block's last key the search runs
 * backwards for a key that is exactly "group: start" (or `options.start`), and then for the stop key. A stop key
 * needs only to begin with "group: stop": minescrib.nif ends one clip with "idle3: stop.".
 *
 * The loop window starts as the clip's start time, and ends at the stop time when `loopFallback` is set and never
 * otherwise, so that a clip with no loop keys plays once. The keys of the block that lie at or before the playhead
 * then narrow the window: a clip resumed in the middle starts with the loop keys it has already passed.
 */
export function resetClip(
  keys: TextKey[] | undefined | null,
  group: unknown,
  options: ClipOptions = {},
): ClipState | ClipRefusal {
  const {
    loopFallback = false,
    startPoint = 0,
    loopCount = Infinity,
    loopingEnabled = true,
    start = 'start',
    stop = 'stop',
  } = options;
  const name = asciiLower(String(group ?? ''));
  const list = keys ?? [];
  if (!name) return { ok: false, reason: 'no group name given' };

  const lastKeyOfGroup = findBackwards(list, list.length - 1, 0, (text) => text.startsWith(`${name}: `));
  if (lastKeyOfGroup < 0) return { ok: false, reason: `no key of group "${name}" - the file names no such animation` };

  const startLabel = `${name}: ${start}`;
  let startIndex = findBackwards(list, lastKeyOfGroup, 0, (text) => text === startLabel);
  if (startIndex < 0 && start === 'loop start') {
    startIndex = findBackwards(list, lastKeyOfGroup, 0, (text) => text === `${name}: start`);
  }
  if (startIndex < 0) return { ok: false, reason: `group "${name}" has no "${name}: ${start}" key` };

  const stopLabel = `${name}: ${stop}`;
  const stopIndex = findBackwards(list, lastKeyOfGroup, 0, (text) => text.startsWith(stopLabel));
  if (stopIndex < 0) return { ok: false, reason: `group "${name}" has no "${name}: ${stop}" key` };

  const startTime = list[startIndex].time;
  const stopTime = list[stopIndex].time;
  if (startTime > stopTime) {
    return { ok: false, reason: `group "${name}" starts at ${startTime} and stops at ${stopTime}` };
  }

  const clip: ClipState = {
    ok: true,
    group: name,
    startTime,
    stopTime,
    loopStartTime: startTime,
    loopStopTime: loopFallback ? stopTime : Infinity,
    time: startTime + (stopTime - startTime) * startPoint,
    playing: true,
    loopCount,
    loopingEnabled,
    nextKey: 0,
  };

  // Keys of this block only: the scan stops at the start key, so an earlier block of the same group does not leak its
  // loop keys into this one. It runs backwards, so the key nearest the start wins.
  for (let index = lastKeyOfGroup; index > startIndex; index--) {
    const { time, text } = list[index];
    if (time > clip.time) continue;
    if (text === `${name}: loop start`) clip.loopStartTime = time;
    else if (text === `${name}: loop stop`) clip.loopStopTime = time;
  }
  clip.nextKey = firstKeyAtOrAfter(list, clip.time);
  return clip;
}

/** True when the playhead has reached the loop window's end and the clip may loop again. A window with no end (the
 *  default of a clip without loop keys) is never reached. */
export function shouldLoop(
  clip?: Pick<ClipState, 'time' | 'loopStopTime' | 'loopingEnabled' | 'loopCount'> | null,
): boolean {
  return Boolean(clip && clip.time >= clip.loopStopTime && clip.loopingEnabled && clip.loopCount > 0);
}

/**
 * Moves the playhead of `clip` forward by `dt` seconds, in place, and answers the clip.
 *
 * The playhead advances in steps that end on a text key: it never jumps over one. It lands on the key, reports it to
 * `onKey`, and goes on with the time it has left. `onKey` hears every key crossed, including those of other groups,
 * because the listener decides what to do with a key of another group (a sound key still plays). The third argument
 * tells it whether the key belongs to the playing group. Only that group's "loop start" and "loop stop" keys move
 * the loop window.
 *
 * A clip that reaches the end of its loop window goes back to the loop start in the same pass in which it reached
 * the end, and reports the keys that lie exactly on the loop start again. The pass ends early when the window has no
 * width, because the time left would otherwise never shrink.
 */
export function advanceClip(
  clip: ClipState,
  keys: TextKey[] | undefined | null,
  dt: number,
  onKey: KeyListener | null = null,
): ClipState {
  const list = keys ?? [];

  const reportCrossedKeys = () => {
    while (clip.nextKey < list.length && list[clip.nextKey].time <= clip.time) {
      const { time, text } = list[clip.nextKey++];
      if (text === `${clip.group}: loop start`) clip.loopStartTime = time;
      else if (text === `${clip.group}: loop stop`) clip.loopStopTime = time;
      onKey?.(text, time, textKeyGroup(text) === clip.group);
    }
  };

  /** Moves to the next key or to the end of the time left, whichever comes first; answers the time still left. */
  const stepForward = (timeLeft: number): number => {
    const target = clip.time + timeLeft;
    const nextKey = list[clip.nextKey];
    const endsBeforeNextKey = !nextKey || nextKey.time > target;
    clip.time = endsBeforeNextKey ? Math.min(target, clip.stopTime) : nextKey.time;
    clip.playing = clip.time < clip.stopTime;
    const remaining = target - clip.time;
    reportCrossedKeys();
    return remaining;
  };

  const loopBack = () => {
    clip.loopCount--;
    clip.time = clip.loopStartTime;
    clip.playing = true;
    // Only the keys exactly on the new playhead are reported again, not the clip's intro.
    clip.nextKey = firstKeyAtOrAfter(list, clip.time);
    reportCrossedKeys();
  };

  let timeLeft = dt;
  while (clip.playing) {
    if (!shouldLoop(clip)) timeLeft = stepForward(timeLeft);
    if (shouldLoop(clip)) {
      loopBack();
      if (clip.time >= clip.loopStopTime) break;
    }
    if (timeLeft <= 0) break;
  }
  return clip;
}

/**
 * How far a movement clip carries its root bone, in units of distance per second, over the span between the group's
 * last start key (or loop start key) and its stop. The playing speed of a walk is scaled by this, so that the feet
 * keep pace with the ground. Only the horizontal travel counts, because the third axis is the vertical and a walk
 * does not accumulate on it.
 *
 * The stop is the group's last "loop stop" key; when there is none, it is the earliest plain "stop" key. The
 * doubled "loop stop" keys of ashvampire.nif (in "idle2" and "walkforward") give a speed the game itself gets wrong,
 * and it is reproduced here. Answers 0 when a key is missing or the span has no length.
 */
export function animVelocity(
  keys: TextKey[] | undefined | null,
  track: TranslationTrack | undefined | null,
  group: unknown,
): number {
  if (!keys || !keys.length || !track) return 0;
  const name = String(group || '').toLowerCase();
  const matchesAny = (labels: string[]) => (text: string) => labels.includes(text);

  const startIndex = findBackwards(keys, keys.length - 1, 0, matchesAny([`${name}: start`, `${name}: loop start`]));
  const loopStopIndex = findBackwards(keys, keys.length - 1, 0, matchesAny([`${name}: loop stop`]));
  const plainStopIndex = keys.findIndex((key) => key.text === `${name}: stop`);
  const stopIndex = loopStopIndex >= 0 ? loopStopIndex : plainStopIndex;
  if (startIndex < 0 || stopIndex < 0) return 0;

  const startTime = keys[startIndex].time;
  const stopTime = keys[stopIndex].time;
  if (!(stopTime > startTime)) return 0;
  if (!track.translations) return 0;
  const from = sampleKeyGroup(track.translations, 3, startTime);
  const to = sampleKeyGroup(track.translations, 3, stopTime);
  if (!from || !to) return 0;
  return Math.hypot(from[0] - to[0], from[1] - to[1]) / (stopTime - startTime);
}

const DIRECTIONS = ['forward', 'back', 'left', 'right'];
const TURNS = ['turnleft', 'turnright', 'swimturnleft', 'swimturnright', 'spellturnleft', 'spellturnright'];

/** Groups that loop although their keys carry no loop start: every retail animation file names each of them, and for
 *  eight of them (torch, idle9, idlesneak, idleswim and the four inventory poses) no retail file has a loop start key
 *  at all. A group with a loop start key loops whatever its name. */
export const LOOPING_ANIMATIONS: readonly string[] = Object.freeze([
  ...['walk', 'swimwalk', 'run', 'swimrun', 'sneak'].flatMap((gait) => DIRECTIONS.map((direction) => gait + direction)),
  ...TURNS,
  'torch',
  'idle',
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((number) => `idle${number}`),
  'idlesneak',
  'idlestorm',
  'idleswim',
  'jump',
  ...['handtohand', 'weapononehand', 'weapontwohand', 'weapontwowide'].map((pose) => `inventory${pose}`),
]);
const LOOPING_NAMES = new Set(LOOPING_ANIMATIONS);

/**
 * Whether a group loops: it has a "loop start" key, or its name is a looping group. Most looping groups come in one
 * variant for each weapon stance ("idle1h", "idlebow", "walkforward2w"), so the longest stance that ends the name is
 * removed first. The longest, because "crossbow" ends in "bow" and "idlecrossbow" must not lose only the "bow". A
 * name that a stance merely contains or begins with keeps all of it.
 */
export function isLoopingAnimation(
  keys: TextKey[] | undefined | null,
  group: unknown,
  stances: readonly string[] = allWeaponShortGroups() as string[],
): boolean {
  const name = asciiLower(String(group ?? ''));
  if (getTextKeyTime(keys, `${name}: loop start`) >= 0) return true;
  const stanceLength = Math.max(0, ...stances.filter((stance) => name.endsWith(stance)).map((stance) => stance.length));
  return LOOPING_NAMES.has(name.slice(0, name.length - stanceLength));
}
