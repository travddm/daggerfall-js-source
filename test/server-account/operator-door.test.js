// The operator's door (server-account/src/operator-door.ts): each act run through the account Worker's own fetch, as
// selfhost/operator.ts reaches it, and its effect read back through the game's own routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../server-account/src/index.js';
import { OPERATOR_DOOR_PATH, OPERATOR_SECRET_HEADER } from '../../server-account/src/operator-door.ts';
import { JUDGE_COLUMNS } from '../../server-account/src/realm.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { standService } from '../accountDb.mjs';
import { seatRealm, freshSave } from '../realmSeat.mjs';
import { seeded } from '../honestItems.mjs';

const SECRET = 'operator-test-secret';
const DOOR = `https://accounts.invalid${OPERATOR_DOOR_PATH}`;

async function stand(extra = {}) {
  const s = await standService({ OPERATOR_SECRET: SECRET, ...extra });
  /** One act through the door. @param {Record<string, unknown>} body @param {string|null} [secret] */
  const op = async (body, secret = SECRET) => {
    const headers = { 'content-type': 'application/json', ...(secret ? { [OPERATOR_SECRET_HEADER]: secret } : {}) };
    const res = await worker.fetch(new Request(DOOR, { method: 'POST', headers, body: JSON.stringify(body) }), s.env);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  /** A registered player's post box, read as the game reads it. */
  const box = async (who) => {
    const res = await worker.fetch(
      new Request('https://accounts.invalid/v1/post/box', { headers: { authorization: `Bearer ${who.secret}` } }),
      s.env,
    );
    assert.equal(res.status, 200);
    return (await res.json()).post;
  };
  return { ...s, op, box };
}

test('the door refuses a request without the secret, and is an unknown path while OPERATOR_SECRET is unset', async () => {
  const s = await stand();
  assert.equal((await s.op({ act: 'find', handle: 'Sylvia' }, null)).status, 401);
  assert.equal((await s.op({ act: 'find', handle: 'Sylvia' }, 'wrong')).status, 401);
  const get = await worker.fetch(new Request(DOOR), s.env);
  assert.equal(get.status, 405);

  const closed = await standService();
  const res = await worker.fetch(
    new Request(DOOR, { method: 'POST', headers: { [OPERATOR_SECRET_HEADER]: '' }, body: '{"act":"find"}' }),
    closed.env,
  );
  assert.notEqual(res.status, 200);
  assert.notEqual(res.status, 401, 'no door answers: the service treats the path as any unknown one');
});

test('find and role: the operator finds an account by handle and gives it a staff role by its id', async () => {
  const s = await stand();
  const sylvia = await s.registered('Sylvia');
  const found = await s.op({ act: 'find', handle: 'sylvia' });
  assert.equal(found.status, 200);
  assert.equal(found.body.id, sylvia.id);
  assert.equal(found.body.role, 'none');
  assert.equal((await s.call('/v1/mod/realm-holds', {}, sylvia.secret)).status, 403, 'not yet an Admin');

  assert.equal((await s.op({ act: 'role', id: sylvia.id, role: 'admin' })).status, 200);
  assert.equal((await s.op({ act: 'find', handle: 'Sylvia' })).body.role, 'admin');
  assert.equal((await s.call('/v1/mod/realm-holds', {}, sylvia.secret)).status, 200, 'the Admin reads the review');

  assert.equal((await s.op({ act: 'role', id: sylvia.id, role: 'emperor' })).body.error, 'role');
  assert.equal((await s.op({ act: 'find', handle: 'Nobody' })).status, 404);
});

test('recovery: the code the door answers once lets the player pick a new password, and is dead after', async () => {
  const s = await stand();
  await s.registered('Sylvia');
  const issued = await s.op({ act: 'recovery', handle: 'SYLVIA' });
  assert.equal(issued.status, 200);
  assert.equal(issued.body.handle, 'Sylvia');
  const { code } = issued.body;
  assert.equal(typeof code, 'string');

  const spent = await s.call('/v1/auth/recover', { handle: 'Sylvia', code, password: 'a brand new password' });
  assert.equal(spent.status, 200);
  const login = await s.call('/v1/auth/login', { handle: 'Sylvia', password: 'a brand new password' });
  assert.equal(login.status, 200, 'the new password signs in');
  const again = await s.call('/v1/auth/recover', { handle: 'Sylvia', code, password: 'another new password' });
  assert.notEqual(again.status, 200, "the operator's code works once");
  assert.equal((await s.op({ act: 'recovery', handle: 'Nobody' })).status, 404);
});

test('post: a dry run writes nothing; the send puts one piece in each named box, once a batch', async () => {
  const s = await stand();
  const sylvia = await s.registered('Sylvia');
  const mira = await s.registered('Mira');
  const send = {
    act: 'post',
    handles: 'Sylvia, mira, Ghost',
    batch: 'welcome-1',
    subject: 'Welcome',
    message: 'Line one\\nLine two',
  };

  const dry = await s.op(send);
  assert.equal(dry.status, 200);
  assert.equal(dry.body.dry, true);
  assert.deepEqual(dry.body.to, [
    { handle: 'Mira', sent: false },
    { handle: 'Sylvia', sent: false },
  ]);
  assert.deepEqual(dry.body.unknown, ['ghost']);
  assert.deepEqual(await s.box(sylvia), []);

  const sent = await s.op({ ...send, apply: true });
  assert.equal(sent.body.written, 2);
  const box = await s.box(mira);
  assert.equal(box.length, 1);
  assert.equal(box[0].subject, 'Welcome');
  assert.equal((await s.box(sylvia)).length, 1);
  assert.equal((await s.op({ ...send, apply: true })).body.written, 0, 'the same batch twice writes nothing');

  assert.equal((await s.op({ ...send, batch: 'Bad Batch' })).body.error, 'batch');
  assert.equal((await s.op({ ...send, subject: '' })).body.error, 'words');
});

test('rollback: as a named Admin, a dry run reads the findings and writes nothing; the apply puts the clean save back', async () => {
  const s = await stand({ SEAT_ADMINS: 'mac' });
  await s.registered('mac');
  const raw = s.env.DB._raw;
  const row = (id) => raw.prepare(`SELECT seq, obj, ${JUDGE_COLUMNS} FROM realm_characters WHERE id = ?`).get(id);
  const cai = await s.registered('cai');
  const R = await seatRealm(s.env, cai.secret, 'cai');
  const put = async (save) => {
    const at = R.at();
    const res = await worker.fetch(
      new Request(`https://accounts.invalid/v1/realm/${R.id}/data`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${cai.secret}`,
          'x-realm-lease': at.lease,
          'x-realm-seq': String(at.seq + 1),
        },
        body: JSON.stringify(save),
      }),
      s.env,
    );
    assert.equal(res.status, 200);
  };
  await put(freshSave({ name: 'cai', goldPieces: 100 }));
  const cleanKey = row(R.id).clean_obj;
  const gem = { ...createWeapon(113, 1, seeded(7)), group: 'Gems' };
  await put(freshSave({ name: 'cai', goldPieces: 100, items: [gem] }));
  assert.equal(row(R.id).held, 'law', 'the lawless save is held');

  const listed = await s.op({ act: 'characters', by: 'mac', handle: 'cai' });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.characters.some((c) => c.id === R.id));

  const before = row(R.id);
  const dry = await s.op({ act: 'rollback', by: 'mac', id: R.id });
  assert.equal(dry.status, 200);
  assert.equal(dry.body.dry, true);
  assert.ok(dry.body.findings.length >= 1);
  assert.deepEqual(row(R.id), before, 'the dry run writes nothing');

  assert.equal((await s.op({ act: 'rollback', by: 'cai', id: R.id, apply: true })).status, 403, 'only an Admin');
  const back = await s.op({ act: 'rollback', by: 'mac', id: R.id, note: 'gem dagger', apply: true });
  assert.equal(back.status, 200);
  assert.deepEqual([row(R.id).obj, row(R.id).held], [cleanKey, null], 'the clean save is the record, the hold lifted');
});
