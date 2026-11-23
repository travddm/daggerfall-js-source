// TOWN-SEATS the mod off: with the account service's SEATS_OPEN off (the default), every seat route says `seats-closed`, the
// pieces that used to reach into the seat system (the professions' state and a craft, the market's Tithe, the writs, the
// homes' Open Gates, hunts) run as if no seat existed, and the weekly Turning never runs. The real Worker over node:sqlite.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { standService } from '../accountDb.mjs';

const SEAT_ROUTES = [
  '/v1/seats/list',
  '/v1/seats/standings',
  '/v1/seats/records',
  '/v1/seats/pledge',
  '/v1/seats/tithe',
  '/v1/seats/edict',
  '/v1/seats/siege/sign',
  '/v1/seats/siege/pass',
  '/v1/seats/royal/pass',
  '/v1/seats/witness',
];

test('TOWN-SEATS OFF: every seat route is closed and the rest of the service runs with no seats at all', async () => {
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on' });
  const mac = await s.seated('Mac');
  for (const path of SEAT_ROUTES) {
    const r = await s.call(path, { key: 5001, character: mac.character }, mac.secret);
    assert.equal(r.body?.error, 'seats-closed', `${path}: ${JSON.stringify(r.body)}`);
  }
  const prof = await s.call('/v1/prof/state', { character: mac.character }, mac.secret);
  assert.equal(prof.status, 200, JSON.stringify(prof.body));
  assert.equal(prof.body.tide, undefined, 'no Tide');
  const writs = await s.call('/v1/writs/list', { character: mac.character, region: 17 }, mac.secret);
  assert.ok(writs.status === 200 || writs.status === 409, `writs: ${JSON.stringify(writs.body)}`);
  const turned = s.env.DB._raw.prepare('SELECT COUNT(*) AS n FROM town_seat_weeks').get().n;
  assert.equal(turned, 0, 'the Turning never settled a week');
});

test('TOWN-SEATS ON for one account does not change another surface: the service still answers a registered account its seat list', async () => {
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', SEATS_OPEN: 'on' });
  const mac = await s.seated('Mac');
  const r = await s.call('/v1/seats/list', { character: mac.character }, mac.secret);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.notEqual(r.body?.error, 'seats-closed');
});
