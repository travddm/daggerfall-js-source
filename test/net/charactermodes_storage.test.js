// CHARACTER MODES: a realm character is created in a mode, the service keeps it on the row, signs it into the identity
// token (`md`, absent for Classic) and shows it on the roster's tile - on the real Worker over the real migrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintToken, verifyToken, claimsValid } from '../../src/net/identityToken.js';
import { CHARACTER_MODES, CHARACTER_MODE_CODES } from '../../src/net/modeLaw.js';
import { standService } from '../accountDb.mjs';
import { realmMintFacts } from '../../server-account/src/realm.js';

const { subtle } = globalThis.crypto;
const FAM = 'fam-k1x2y3-abc123';
const claims = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

test('the token carries a mode code for a realm character, and refuses a code that is not one', async () => {
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const nowS = 1_800_000_000;
  const who = { s: 'p0123456789abcdef', n: 'Mira', k: 'guest', rc: 1, ci: 'r0123456789abcdef0123' };
  const base = { ...who, i: nowS, e: nowS + 60 };
  for (const m of CHARACTER_MODES.slice(1))
    assert.equal(claimsValid({ ...base, md: CHARACTER_MODE_CODES[m] }), true, m);
  for (const bad of [0, 5, -1, 1.5, '1', null]) assert.equal(claimsValid({ ...base, md: bad }), false, String(bad));
  assert.equal(claimsValid({ ...base, rc: 0, ci: undefined, md: 3 }), false, "a mode is a realm character's");
  assert.equal(claimsValid(base), true, 'absent is Classic and a service from before the modes');
  const tok = await mintToken({ ...who, md: 4 }, kp.privateKey, { subtle, nowS });
  assert.equal((await verifyToken(tok, kp.publicKey, { subtle, nowS })).claims.md, 4);
  await assert.rejects(mintToken({ ...who, md: 9 }, kp.privateKey, { subtle, nowS }), /refused/);
});

test('a realm character keeps the mode it was created in; the mint signs it and the tile shows it', async () => {
  const S = await standService();
  const g = await S.guest();
  const call = (p, b) => S.call(p, b, g.secret);
  const tiles = async () =>
    (
      await S.fetch('https://accounts.invalid/v1/realm', { headers: { authorization: `Bearer ${g.secret}` } }).then(
        (r) => r.json(),
      )
    ).characters;

  const plain = (await call('/v1/realm/create', { name: 'Plain' })).body;
  assert.equal(
    'md' in claims((await call('/v1/auth/token', { character: plain.id })).body.token),
    false,
    'no mode named: Classic, the bytes as before',
  );

  const iron = (await call('/v1/realm/create', { name: 'Iron', mode: 'ironman' })).body;
  assert.equal(
    claims((await call('/v1/auth/token', { character: iron.id })).body.token).md,
    CHARACTER_MODE_CODES.ironman,
  );
  assert.equal((await realmMintFacts({ db: S.env.DB }, g.id, iron.id)).md, CHARACTER_MODE_CODES.ironman);

  const hard = (await call('/v1/realm/create', { name: 'Hard', mode: 'hardcore' })).body;
  assert.equal(
    claims((await call('/v1/auth/token', { character: hard.id })).body.token).md,
    CHARACTER_MODE_CODES.hardcore,
  );

  const byName = Object.fromEntries((await tiles()).map((t) => [t.name, t.mode]));
  assert.deepEqual(byName, { Plain: 'classic', Iron: 'ironman', Hard: 'hardcore' });
});

test("the Legacy mode is born of a line and no other mode is; a request naming no mode is a line's birth or Classic", async () => {
  const S = await standService();
  const g = await S.guest();
  const call = (p, b) => S.call(p, b, g.secret);
  await call('/v1/realm/lineage', {
    id: FAM,
    record: {
      v: 1,
      id: FAM,
      surname: 'Hlaalu',
      model: 'bloodline',
      rev: 1,
      people: [
        { id: 1, given: 'Ysolde' },
        { id: 2, given: 'Aldo' },
        { id: 3, given: 'Ilse' },
      ],
    },
  });
  assert.equal((await call('/v1/realm/create', { name: 'Nope', mode: 'bogus' })).body.error, 'mode');
  assert.equal(
    (await call('/v1/realm/create', { name: 'Nope', mode: 'legacy' })).body.error,
    'mode',
    'Legacy with no line',
  );
  assert.equal(
    (await call('/v1/realm/create', { name: 'Nope', mode: 'classic', lineage: FAM, person: 1 })).body.error,
    'mode',
    'a line with another mode',
  );
  const born = (await call('/v1/realm/create', { name: 'Ysolde Hlaalu', mode: 'legacy', lineage: FAM, person: 1 }))
    .body;
  assert.ok(born.id);
  assert.equal((await realmMintFacts({ db: S.env.DB }, g.id, born.id)).md, CHARACTER_MODE_CODES.legacy);
  const old = (await call('/v1/realm/create', { name: 'Aldo Hlaalu', lineage: FAM, person: 2 })).body;
  assert.ok(old.id, 'a build from before the modes names no mode');
  assert.equal((await realmMintFacts({ db: S.env.DB }, g.id, old.id)).md, CHARACTER_MODE_CODES.legacy);
});

test('the server profile decides which modes it offers; Classic is always offered', async () => {
  const S = await standService({ MODES_OFFERED: 'classic,ironman' });
  const g = await S.guest();
  const call = (p, b) => S.call(p, b, g.secret);
  assert.equal((await call('/v1/realm/create', { name: 'Hard', mode: 'hardcore' })).body.error, 'mode-off');
  assert.ok((await call('/v1/realm/create', { name: 'Iron', mode: 'ironman' })).body.id);
  assert.ok((await call('/v1/realm/create', { name: 'Plain' })).body.id, 'Classic is always offered');
});
