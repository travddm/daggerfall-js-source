import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isDue, parseSchedule } from '../../../selfhost/cron/schedule.ts';

test("the service's two schedules fire every minute and at :41 each hour", () => {
  const minute = parseSchedule('* * * * *');
  const hour = parseSchedule('41 * * * *');
  assert.equal(isDue(minute, new Date('2027-03-02T05:07:30Z')), true);
  assert.equal(isDue(hour, new Date('2027-03-02T05:41:00Z')), true);
  assert.equal(isDue(hour, new Date('2027-03-02T05:40:59Z')), false);
  assert.equal(isDue(parseSchedule('0 0 1 1 *'), new Date('2027-01-01T00:00:10Z')), true);
  assert.equal(isDue(parseSchedule('* * * * 0'), new Date('2027-03-07T12:00:00Z')), true);
});

test('a schedule the sidecar cannot match is refused when it starts', () => {
  assert.throws(() => parseSchedule('*/5 * * * *'), /not "\*" or a number/);
  assert.throws(() => parseSchedule('* * * *'), /five-field/);
});
