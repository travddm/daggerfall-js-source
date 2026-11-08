// Reads one Analytics Engine event as workerd's `analyticsEngine` binding posts it: the `AnalyticsEngineEvent` struct
// (src/workerd/api/analytics-engine.capnp) in Cap'n Proto's JSON encoding, where a Data field is an array of byte
// values and an Int64 is a decimal string. workerd sends it from `waitUntil`, so a point written as a response returns
// still arrives.

export type DataPoint = { at: number; indexes: string[]; doubles: number[]; blobs: string[] };

const decoder = new TextDecoder();
const textOf = (v: unknown): string | null =>
  Array.isArray(v) ? decoder.decode(new Uint8Array(v as number[])) : typeof v === 'string' ? v : null;

/** The point the Worker wrote: its index, its doubles and its blobs in order (each list cut after its last value), and
 *  its time in milliseconds. */
export function dataPointOf(event: Record<string, unknown>): DataPoint {
  const doubles: number[] = [];
  const blobs: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const d = event[`double${i}`];
    doubles.push(typeof d === 'number' ? d : 0);
    blobs.push(textOf(event[`blob${i}`]) ?? '');
  }
  while (doubles.length > 0 && doubles[doubles.length - 1] === 0) doubles.pop();
  while (blobs.length > 0 && blobs[blobs.length - 1] === '') blobs.pop();
  const index = textOf(event.index1);
  return {
    at: Math.round(Number(event.timestamp ?? 0) / 1e6),
    indexes: index ? [index] : [],
    doubles,
    blobs,
  };
}
