// The R2 binding's wire protocol, answered over a storage backend. workerd's `r2Bucket` binding turns each call into an
// HTTP request to a named service: `head`, `get` and `list` are GETs whose operation is JSON in the `cf-r2-request`
// header; `put` and `delete` are PUTs whose body starts with that JSON, its length in `cf-r2-metadata-size`, followed by
// the value. An answer starts with the object's properties as JSON, its length in the same header, then the value. An
// error is a status with `{ message, version: 1, v4code }` in `cf-r2-error`. The shapes follow Miniflare's R2 worker
// (packages/miniflare/src/workers/r2/). The account service uses get, head, put, list by prefix and delete; multipart
// uploads, ranges, conditional requests and delimited listings are refused.

export type Fields = Record<string, string>;

/** An object as a backend keeps it. `uploaded` is milliseconds since the epoch; `etag` is the backend's entity tag. */
export type StoredObject = {
  key: string;
  version: string;
  size: number;
  etag: string;
  uploaded: number;
  httpFields: Fields;
  customFields: Fields;
};

export type ListOptions = { prefix: string; startAfter: string; limit: number };
export type Listing = { objects: StoredObject[]; truncated: boolean; cursor?: string };

export interface R2Backend {
  head(key: string): Promise<StoredObject | null>;
  get(key: string): Promise<{ object: StoredObject; body: Uint8Array } | null>;
  put(key: string, body: Uint8Array, httpFields: Fields, customFields: Fields): Promise<StoredObject>;
  delete(keys: string[]): Promise<void>;
  list(options: ListOptions): Promise<Listing>;
}

export const REQUEST_HEADER = 'cf-r2-request';
export const METADATA_SIZE_HEADER = 'cf-r2-metadata-size';
export const ERROR_HEADER = 'cf-r2-error';
export const MAX_LIST_KEYS = 1000;
const MAX_KEY_BYTES = 1024;

const ERRORS = {
  internal: [500, 10001, 'We encountered an internal error. Please try again.'],
  noSuchKey: [404, 10007, 'The specified key does not exist.'],
  invalidArgument: [400, 10029, 'Metadata missing or invalid'],
  notImplemented: [501, 10001, 'This operation is not supported by the self-hosted bucket.'],
} as const satisfies Record<string, readonly [number, number, string]>;

export function errorResponse(kind: keyof typeof ERRORS): Response {
  const [status, v4code, message] = ERRORS[kind];
  return new Response(null, { status, headers: { [ERROR_HEADER]: JSON.stringify({ message, version: 1, v4code }) } });
}

function propertiesOf(o: StoredObject): Record<string, unknown> {
  return {
    name: o.key,
    version: o.version,
    size: o.size,
    etag: o.etag,
    uploaded: o.uploaded,
    httpFields: o.httpFields,
    customFields: Object.entries(o.customFields).map(([k, v]) => ({ k, v })),
    checksums: {},
  };
}

const encoder = new TextEncoder();

function withMetadata(metadata: unknown, value: Uint8Array = new Uint8Array(0)): Response {
  const head = encoder.encode(JSON.stringify(metadata));
  const body = new Uint8Array(head.length + value.length);
  body.set(head, 0);
  body.set(value, head.length);
  return new Response(body, {
    headers: { [METADATA_SIZE_HEADER]: String(head.length), 'content-type': 'application/json' },
  });
}

function fieldsOf(v: unknown): Fields {
  if (v === null || typeof v !== 'object') return {};
  const out: Fields = {};
  if (Array.isArray(v)) {
    for (const item of v as Array<{ k?: unknown; v?: unknown }>) {
      if (typeof item?.k === 'string' && typeof item?.v === 'string') out[item.k] = item.v;
    }
    return out;
  }
  for (const [k, value] of Object.entries(v)) if (typeof value === 'string') out[k] = value;
  return out;
}

const keyOk = (key: unknown): key is string =>
  typeof key === 'string' && key.length > 0 && encoder.encode(key).length <= MAX_KEY_BYTES;

type Operation = { method?: unknown; object?: unknown; objects?: unknown; [field: string]: unknown };

function parseOperation(text: string | null): Operation | null {
  if (text === null) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Operation) : null;
  } catch {
    return null;
  }
}

async function answerGet(backend: R2Backend, op: Operation): Promise<Response> {
  if (op.method === 'list') {
    const limit =
      typeof op.limit === 'number' ? Math.max(1, Math.min(MAX_LIST_KEYS, Math.floor(op.limit))) : MAX_LIST_KEYS;
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    if (str(op.delimiter)) return errorResponse('notImplemented');
    const after = [str(op.cursor), str(op.startAfter)].reduce((a, b) => (a > b ? a : b), '');
    const listing = await backend.list({ prefix: str(op.prefix), startAfter: after, limit });
    return withMetadata({
      objects: listing.objects.map(propertiesOf),
      truncated: listing.truncated,
      ...(listing.truncated ? { cursor: listing.cursor } : {}),
      delimitedPrefixes: [],
    });
  }
  if (!keyOk(op.object)) return errorResponse('invalidArgument');
  if (op.method === 'head') {
    const object = await backend.head(op.object);
    return object ? withMetadata(propertiesOf(object)) : errorResponse('noSuchKey');
  }
  if (op.method === 'get') {
    if (op.range !== undefined || op.rangeHeader !== undefined || op.onlyIf !== undefined) {
      return errorResponse('notImplemented');
    }
    const found = await backend.get(op.object);
    return found ? withMetadata(propertiesOf(found.object), found.body) : errorResponse('noSuchKey');
  }
  return errorResponse('notImplemented');
}

async function answerPut(backend: R2Backend, request: Request): Promise<Response> {
  const size = Number.parseInt(request.headers.get(METADATA_SIZE_HEADER) ?? '', 10);
  const all = new Uint8Array(await request.arrayBuffer());
  if (!Number.isSafeInteger(size) || size < 0 || size > all.length) return errorResponse('invalidArgument');
  const op = parseOperation(new TextDecoder().decode(all.subarray(0, size)));
  if (op === null) return errorResponse('invalidArgument');
  if (op.method === 'delete') {
    const keys = Array.isArray(op.objects) ? op.objects : [op.object];
    if (!keys.every(keyOk)) return errorResponse('invalidArgument');
    await backend.delete(keys);
    return new Response(null);
  }
  if (op.method === 'put') {
    if (!keyOk(op.object)) return errorResponse('invalidArgument');
    if (op.onlyIf !== undefined) return errorResponse('notImplemented');
    const stored = await backend.put(op.object, all.slice(size), fieldsOf(op.httpFields), fieldsOf(op.customFields));
    return withMetadata(propertiesOf(stored));
  }
  return errorResponse('notImplemented');
}

/** Answers one request from the R2 binding. */
export async function handleR2(backend: R2Backend, request: Request): Promise<Response> {
  try {
    if (request.method === 'GET') {
      const op = parseOperation(request.headers.get(REQUEST_HEADER));
      return op === null ? errorResponse('invalidArgument') : await answerGet(backend, op);
    }
    if (request.method === 'PUT') return await answerPut(backend, request);
    return errorResponse('notImplemented');
  } catch (e) {
    console.error('[r2]', e instanceof Error ? e.message : e);
    return errorResponse('internal');
  }
}

/** The value's SHA-256 in hex: the disk backend's etag. */
export async function etagOf(body: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
