import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dataPointOf } from '../../../selfhost/metrics/event.ts';

const bytes = (s: string): number[] => Array.from(new TextEncoder().encode(s));

test("an event in Cap'n Proto JSON reads back as the point the Worker wrote", () => {
  const point = dataPointOf({
    accountId: '0',
    dataset: bytes(''),
    index1: bytes('/v1/health'),
    timestamp: '1794140953418000000',
    double1: 12.5,
    double2: 200,
    double4: 3,
    blob1: bytes('/v1/health'),
    blob2: bytes('GET'),
    blob4: bytes('Ærø'),
  });
  assert.deepEqual(point, {
    at: 1794140953418,
    indexes: ['/v1/health'],
    doubles: [12.5, 200, 0, 3],
    blobs: ['/v1/health', 'GET', '', 'Ærø'],
  });
});

test('an event with no index, doubles or blobs is an empty point', () => {
  assert.deepEqual(dataPointOf({}), { at: 0, indexes: [], doubles: [], blobs: [] });
});
