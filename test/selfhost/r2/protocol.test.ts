import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ERROR_HEADER,
  METADATA_SIZE_HEADER,
  REQUEST_HEADER,
  handleR2,
  type R2Backend,
} from '../../../selfhost/r2/protocol.ts';
import { diskBackend, prefixEnd, type Disk } from '../../../selfhost/r2/disk-backend.ts';
import { sqliteStore } from '../sqlite-store.ts';

/** A workerd disk service in memory: GET, PUT and DELETE of a file by path. */
function memoryDisk(): Disk & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async fetch(input: string, init: RequestInit = {}): Promise<Response> {
      const path = new URL(input).pathname;
      const method = init.method ?? 'GET';
      if (method === 'PUT') {
        files.set(path, new Uint8Array(await new Response(init.body).arrayBuffer()));
        return new Response(null, { status: 204 });
      }
      if (method === 'DELETE') return new Response(null, { status: files.delete(path) ? 204 : 404 });
      const bytes = files.get(path);
      return bytes ? new Response(bytes) : new Response('not found', { status: 404 });
    },
  };
}

const encoder = new TextEncoder();

// The requests as workerd's r2Bucket binding sends them.
const getOp = (op: unknown): Request =>
  new Request('http://r2/', { headers: { [REQUEST_HEADER]: JSON.stringify(op) } });
function putOp(op: unknown, value: Uint8Array = new Uint8Array(0)): Request {
  const head = encoder.encode(JSON.stringify(op));
  const body = new Uint8Array(head.length + value.length);
  body.set(head);
  body.set(value, head.length);
  return new Request('http://r2/', { method: 'PUT', body, headers: { [METADATA_SIZE_HEADER]: String(head.length) } });
}

async function split(res: Response): Promise<{ meta: Record<string, unknown>; value: string }> {
  const size = Number(res.headers.get(METADATA_SIZE_HEADER));
  const all = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder();
  return {
    meta: JSON.parse(text.decode(all.subarray(0, size))) as Record<string, unknown>,
    value: text.decode(all.subarray(size)),
  };
}

function bucket(): { backend: R2Backend; disk: ReturnType<typeof memoryDisk> } {
  const disk = memoryDisk();
  return { backend: diskBackend(sqliteStore(), disk, () => 1_800_000_000_000), disk };
}

test('a put is read back by get and head, with its fields', async () => {
  const { backend } = bucket();
  const put = await handleR2(
    backend,
    putOp(
      {
        method: 'put',
        object: 'p/1/save',
        httpFields: { contentType: 'application/json' },
        customFields: [{ k: 'slot', v: '2' }],
      },
      encoder.encode('{"gold":100}'),
    ),
  );
  assert.equal(put.status, 200);
  const stored = (await split(put)).meta;
  assert.equal(stored.name, 'p/1/save');
  assert.equal(stored.size, 12);
  assert.match(String(stored.etag), /^[0-9a-f]{64}$/);

  const got = await split(await handleR2(backend, getOp({ method: 'get', object: 'p/1/save' })));
  assert.equal(got.value, '{"gold":100}');
  assert.deepEqual(got.meta.httpFields, { contentType: 'application/json' });
  assert.deepEqual(got.meta.customFields, [{ k: 'slot', v: '2' }]);
  assert.equal(got.meta.uploaded, 1_800_000_000_000);

  const head = await split(await handleR2(backend, getOp({ method: 'head', object: 'p/1/save' })));
  assert.equal(head.meta.etag, stored.etag);
  assert.equal(head.value, '');
});

test('a missing key is NoSuchKey: 404 with the error header the binding reads as null', async () => {
  const { backend } = bucket();
  for (const method of ['get', 'head']) {
    const res = await handleR2(backend, getOp({ method, object: 'nobody' }));
    assert.equal(res.status, 404);
    assert.equal(JSON.parse(String(res.headers.get(ERROR_HEADER))).v4code, 10007);
  }
});

test('a second put replaces the object and its file; delete removes both', async () => {
  const { backend, disk } = bucket();
  await handleR2(backend, putOp({ method: 'put', object: 'k' }, encoder.encode('one')));
  await handleR2(backend, putOp({ method: 'put', object: 'k' }, encoder.encode('two')));
  assert.equal(disk.files.size, 1);
  assert.equal((await split(await handleR2(backend, getOp({ method: 'get', object: 'k' })))).value, 'two');
  assert.equal((await handleR2(backend, putOp({ method: 'delete', objects: ['k', 'absent'] }))).status, 200);
  assert.equal(disk.files.size, 0);
  assert.equal((await handleR2(backend, getOp({ method: 'get', object: 'k' }))).status, 404);
});

test('list walks a prefix in key order, a page at a time, by cursor', async () => {
  const { backend } = bucket();
  for (const key of ['a/2', 'a/1', 'a/3', 'b/1', 'a']) {
    await handleR2(backend, putOp({ method: 'put', object: key }, encoder.encode(key)));
  }
  const page = async (op: Record<string, unknown>): Promise<Record<string, unknown>> =>
    (await split(await handleR2(backend, getOp({ method: 'list', ...op })))).meta;
  const first = await page({ prefix: 'a/', limit: 2 });
  assert.deepEqual(
    (first.objects as Array<{ name: string }>).map((o) => o.name),
    ['a/1', 'a/2'],
  );
  assert.equal(first.truncated, true);
  const second = await page({ prefix: 'a/', limit: 2, cursor: first.cursor });
  assert.deepEqual(
    (second.objects as Array<{ name: string }>).map((o) => o.name),
    ['a/3'],
  );
  assert.equal(second.truncated, false);
  const all = await page({});
  assert.deepEqual(
    (all.objects as Array<{ name: string }>).map((o) => o.name),
    ['a', 'a/1', 'a/2', 'a/3', 'b/1'],
  );
  assert.equal(prefixEnd('a/'), 'a0');
});

test('what the account service never asks is refused, not half done', async () => {
  const { backend } = bucket();
  const refused = [
    getOp({ method: 'get', object: 'k', range: { offset: 0, length: 1 } }),
    getOp({ method: 'list', delimiter: '/' }),
    putOp({ method: 'createMultipartUpload', object: 'k' }),
    putOp({ method: 'put', object: 'k', onlyIf: { etagMatches: 'x' } }),
  ];
  for (const request of refused) assert.equal((await handleR2(backend, request)).status, 501);
  assert.equal((await handleR2(backend, new Request('http://r2/'))).status, 400);
  assert.equal((await handleR2(backend, putOp({ method: 'put', object: '' }))).status, 400);
});
