// The S3 backend: objects in any S3-compatible bucket (MinIO, Garage, AWS S3), addressed path-style. Requests are
// signed by the `fetch` the worker passes in (aws4fetch's AwsClient), so this module holds no credentials. The R2
// HTTP fields map to S3's own headers, and custom fields to `x-amz-meta-*`.
import type { Fields, Listing, ListOptions, R2Backend, StoredObject } from './protocol.ts';

export type SignedFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type S3Location = { endpoint: string; bucket: string };

const HTTP_HEADERS: Record<string, string> = {
  contentType: 'content-type',
  contentLanguage: 'content-language',
  contentDisposition: 'content-disposition',
  contentEncoding: 'content-encoding',
  cacheControl: 'cache-control',
};
const META = 'x-amz-meta-';

const unquote = (etag: string | null): string => (etag ?? '').replace(/^"|"$/g, '');

function objectOf(key: string, headers: Headers): StoredObject {
  const httpFields: Fields = {};
  for (const [field, header] of Object.entries(HTTP_HEADERS)) {
    const v = headers.get(header);
    if (v !== null) httpFields[field] = v;
  }
  const customFields: Fields = {};
  headers.forEach((v, k) => {
    if (k.startsWith(META)) customFields[k.slice(META.length)] = v;
  });
  const etag = unquote(headers.get('etag'));
  return {
    key,
    version: etag,
    size: Number(headers.get('content-length') ?? 0),
    etag,
    uploaded: Date.parse(headers.get('last-modified') ?? '') || 0,
    httpFields,
    customFields,
  };
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (text: string): string =>
  text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
    e.startsWith('#x')
      ? String.fromCodePoint(Number.parseInt(e.slice(2), 16))
      : e.startsWith('#')
        ? String.fromCodePoint(Number.parseInt(e.slice(1), 10))
        : (XML_ENTITIES[e] ?? ''),
  );
const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? unescapeXml(m[1] ?? '') : null;
};

/** Reads the parts of a ListObjectsV2 answer a listing needs. */
export function parseListing(xml: string, limit: number): Listing {
  const objects: StoredObject[] = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const part = m[1] ?? '';
    const etag = unquote(tag(part, 'ETag'));
    objects.push({
      key: tag(part, 'Key') ?? '',
      version: etag,
      size: Number(tag(part, 'Size') ?? 0),
      etag,
      uploaded: Date.parse(tag(part, 'LastModified') ?? '') || 0,
      httpFields: {},
      customFields: {},
    });
  }
  const kept = objects.slice(0, limit);
  const truncated = tag(xml, 'IsTruncated') === 'true' || objects.length > limit;
  return truncated ? { objects: kept, truncated, cursor: kept[kept.length - 1]?.key } : { objects: kept, truncated };
}

export function s3Backend({ endpoint, bucket }: S3Location, signed: SignedFetch): R2Backend {
  const base = `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}`;
  const urlOf = (key: string): string => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const failed = async (res: Response, what: string): Promise<never> => {
    throw new Error(`s3 ${what}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  };

  return {
    async head(key) {
      const res = await signed(urlOf(key), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) return failed(res, 'head');
      return objectOf(key, res.headers);
    },

    async get(key) {
      const res = await signed(urlOf(key));
      if (res.status === 404) return null;
      if (!res.ok) return failed(res, 'get');
      return { object: objectOf(key, res.headers), body: new Uint8Array(await res.arrayBuffer()) };
    },

    async put(key, body, httpFields, customFields) {
      const headers: Record<string, string> = {};
      for (const [field, header] of Object.entries(HTTP_HEADERS)) {
        const v = httpFields[field];
        if (v !== undefined) headers[header] = v;
      }
      for (const [k, v] of Object.entries(customFields)) headers[`${META}${k.toLowerCase()}`] = v;
      const res = await signed(urlOf(key), { method: 'PUT', body, headers });
      if (!res.ok) return failed(res, 'put');
      const etag = unquote(res.headers.get('etag'));
      return { key, version: etag, size: body.length, etag, uploaded: Date.now(), httpFields, customFields };
    },

    async delete(keys) {
      for (const key of keys) {
        const res = await signed(urlOf(key), { method: 'DELETE' });
        if (!res.ok && res.status !== 404) await failed(res, 'delete');
      }
    },

    async list({ prefix, startAfter, limit }: ListOptions) {
      const query = new URLSearchParams({ 'list-type': '2', 'max-keys': String(limit) });
      if (prefix) query.set('prefix', prefix);
      if (startAfter) query.set('start-after', startAfter);
      const res = await signed(`${base}?${query}`);
      if (!res.ok) return failed(res, 'list');
      return parseListing(await res.text(), limit);
    },
  };
}
