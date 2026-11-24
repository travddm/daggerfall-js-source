// @ts-check
// A line of sign-ins, let in at a rate, first come first served. The account service's sign-in line
// (server-account/src/admit.js) and the relay's door (server/src/relay-door.ts) both run it, so a waiting player is
// told a place and a wait in one shape by either service.

/**
 * The numbers a line runs by.
 * @typedef {object} LineLaw
 * @property {number} rate places let in a second
 * @property {number} burst how many a quiet line lets in at once
 * @property {number} keepMs a place nobody asked about this long is let go
 * @property {number} passMs how long a key let in goes in again without a place
 * @property {number} waitMinMs the shortest wait told
 * @property {number} waitMaxMs the longest wait told
 * @property {number} sweepMs how often stale places and passes are forgotten
 * @property {number} [placesMax] the most places the line holds; past it a new key gets no place (`{ full: true }`)
 */

/**
 * A line's state. `head` is the last ticket let in, `tail` the last ticket given, `at` when the head last moved.
 * @typedef {object} Line
 * @property {number} head
 * @property {number} tail
 * @property {number} at
 * @property {number} swept
 * @property {Map<string, { ticket: number, seen: number }>} places
 * @property {Map<string, number>} passes
 */

/**
 * An answer to one ask: let in, told to wait, or a line too full to give a place.
 * @typedef {{ go: true } | { go: false, position: number, wait: number } | { go: false, full: true }} LineAnswer
 */

/** A hold another gate puts on a key the line would let in: null lets it in, else the place and wait to tell. */
/** @typedef {() => ({ position: number, wait: number } | null)} LineGate */

/** A line nobody stands in. @returns {Line} */
export const newLine = () => ({ head: 0, tail: 0, at: 0, swept: 0, places: new Map(), passes: new Map() });

/**
 * One key asking at the line: let in, or its place and how long before it asks again, ms. `gate`, when given, is asked
 * only when the line would let the key in; a hold keeps the key's place and tells the gate's own place and wait.
 * @param {Line} line @param {string} key @param {number} nowMs @param {LineLaw} law @param {LineGate} [gate]
 * @returns {LineAnswer}
 */
export function lineAsk(line, key, nowMs, law, gate) {
  // The head moves at the rate; a line that has stood quiet lets a burst in past its back.
  line.head = line.at ? line.head + (Math.max(0, nowMs - line.at) * law.rate) / 1000 : line.tail + law.burst;
  line.at = nowMs;
  line.head = Math.min(line.head, line.tail + law.burst);
  if (nowMs - line.swept >= law.sweepMs) {
    line.swept = nowMs;
    for (const [k, p] of line.places) if (nowMs - p.seen > law.keepMs) line.places.delete(k);
    for (const [k, until] of line.passes) if (until <= nowMs) line.passes.delete(k);
  }
  if ((line.passes.get(key) ?? 0) > nowMs) return { go: true };
  let place = line.places.get(key);
  if (!place) {
    if (law.placesMax !== undefined && line.places.size >= law.placesMax) return { go: false, full: true };
    place = { ticket: ++line.tail, seen: nowMs };
    line.places.set(key, place);
  }
  place.seen = nowMs;
  if (place.ticket <= line.head) {
    const held = gate ? gate() : null;
    if (held) return { go: false, position: held.position, wait: held.wait };
    line.places.delete(key);
    line.passes.set(key, nowMs + law.passMs);
    return { go: true };
  }
  const position = Math.ceil(place.ticket - line.head);
  const wait = Math.round(Math.min(law.waitMaxMs, Math.max(law.waitMinMs, (position / law.rate) * 1000)));
  return { go: false, position, wait };
}
