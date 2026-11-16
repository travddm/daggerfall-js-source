import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseListing, s3Backend, type SignedFetch } from '../../../selfhost/r2/s3-backend.ts';

type Item = { body: Uint8Array; headers: Record<string, string>; modified: string };

/** An S3 bucket in memory, path-style, answering the requests the backend sends. */
function memoryS3(): { fetch: SignedFetch; items: Map<string, Item>; seen: string[] } {
  const items = new Map<string, Item>();
  const seen: string[] = [];
  const fetch: SignedFetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    seen.push(`${method} ${u.pathname}${u.search}`);
    const [, bucket, ...rest] = u.pathname.split('/');
    assert.equal(bucket, 'saves');
    const key = rest.map(decodeURIComponent).join('/');
    if (key === '' && method === 'GET') {
      const prefix = u.searchParams.get('prefix') ?? '';
      const after = u.searchParams.get('start-after') ?? '';
      const max = Number(u.searchParams.get('max-keys'));
      const keys = [...items.keys()].filter((k) => k.startsWith(prefix) && k > after).sort();
      const page = keys.slice(0, max);
      const xml = page
        .map(
          (k) =>
            `<Contents><Key>${k.replace(/&/g, '&amp;')}</Key><ETag>&quot;e-${k}&quot;</ETag><Size>${items.get(k)?.body.length}</Size><LastModified>2027-01-15T08:00:00.000Z</LastModified></Contents>`,
        )
        .join('');
      return new Response(`<ListBucketResult>${xml}<IsTruncated>${keys.length > max}</IsTruncated></ListBucketResult>`);
    }
    if (method === 'PUT') {
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((v, k) => (headers[k] = v));
      items.set(key, {
        body: new Uint8Array(await new Response(init.body).arrayBuffer()),
        headers,
        modified: 'Fri, 15 Jan 2027 08:00:00 GMT',
      });
      return new Response(null, { headers: { etag: `"e-${key}"` } });
    }
    if (method === 'DELETE') {
      items.delete(key);
      return new Response(null, { status: 204 });
    }
    const item = items.get(key);
    if (!item) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
    const headers = {
      ...item.headers,
      etag: `"e-${key}"`,
      'last-modified': item.modified,
      'content-length': String(item.body.length),
    };
    return new Response(method === 'HEAD' ? null : item.body, { headers });
  };
  return { fetch, items, seen };
}

const LOCATION = { endpoint: 'http://minio:9000/', bucket: 'saves' };

test('put, get and head carry the value, its HTTP fields and its custom fields through S3 headers', async () => {
  const s3 = memoryS3();
  const backend = s3Backend(LOCATION, s3.fetch);
  const put = await backend.put(
    'p/1 a&b',
    new TextEncoder().encode('save'),
    { contentType: 'text/plain' },
    { Slot: '2' },
  );
  assert.equal(put.etag, 'e-p/1 a&b');
  assert.equal(s3.items.get('p/1 a&b')?.headers['x-amz-meta-slot'], '2');
  assert.ok(s3.seen[0]?.startsWith('PUT /saves/p/1%20a%26b'));

  const got = await backend.get('p/1 a&b');
  assert.equal(new TextDecoder().decode(got?.body), 'save');
  assert.deepEqual(got?.object.httpFields, { contentType: 'text/plain' });
  assert.deepEqual(got?.object.customFields, { slot: '2' });
  assert.equal(got?.object.uploaded, Date.parse('2027-01-15T08:00:00Z'));
  assert.equal((await backend.head('p/1 a&b'))?.size, 4);
  assert.equal(await backend.get('none'), null);
  assert.equal(await backend.head('none'), null);
});

test('list reads ListObjectsV2 by prefix and start-after; delete removes each key', async () => {
  const s3 = memoryS3();
  const backend = s3Backend(LOCATION, s3.fetch);
  for (const key of ['a/1', 'a/2', 'a/3', 'b/1']) await backend.put(key, new Uint8Array([1]), {}, {});
  const first = await backend.list({ prefix: 'a/', startAfter: '', limit: 2 });
  assert.deepEqual(
    first.objects.map((o) => o.key),
    ['a/1', 'a/2'],
  );
  assert.equal(first.truncated, true);
  assert.equal(first.cursor, 'a/2');
  const rest = await backend.list({ prefix: 'a/', startAfter: 'a/2', limit: 2 });
  assert.deepEqual(
    rest.objects.map((o) => o.key),
    ['a/3'],
  );
  assert.equal(rest.truncated, false);
  await backend.delete(['a/1', 'a/2']);
  assert.deepEqual([...s3.items.keys()].sort(), ['a/3', 'b/1']);
});

test('a listing decodes XML entities in keys', () => {
  const listing = parseListing(
    '<Contents><Key>a&amp;b&#x2F;c&#33;</Key><Size>3</Size></Contents><IsTruncated>false</IsTruncated>',
    10,
  );
  assert.deepEqual(
    listing.objects.map((o) => o.key),
    ['a&b/c!'],
  );
});
