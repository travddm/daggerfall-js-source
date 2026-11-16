// The disk backend: each object's bytes in one file of a workerd `disk` service, named by the object's version, and the
// index of keys in a SQLite Durable Object, so a listing by prefix is one query instead of a walk of directory
// listings. A put writes the new file before it moves the index row, so a reader sees the old object or the new one.
import { etagOf, type Fields, type Listing, type ListOptions, type R2Backend, type StoredObject } from './protocol.ts';
import type { SqlStore } from '../d1/protocol.ts';

export type Disk = { fetch(input: string, init?: RequestInit): Promise<Response> };

const INDEX = `CREATE TABLE IF NOT EXISTS objects (
  key TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  size INTEGER NOT NULL,
  etag TEXT NOT NULL,
  uploaded INTEGER NOT NULL,
  http_fields TEXT NOT NULL,
  custom_fields TEXT NOT NULL
)`;
const COLUMNS = 'key, version, size, etag, uploaded, http_fields, custom_fields';

const fileUrl = (version: string): string => `http://disk/${version}`;

function rowToObject(row: unknown[]): StoredObject {
  return {
    key: String(row[0]),
    version: String(row[1]),
    size: Number(row[2]),
    etag: String(row[3]),
    uploaded: Number(row[4]),
    httpFields: JSON.parse(String(row[5])) as Fields,
    customFields: JSON.parse(String(row[6])) as Fields,
  };
}

function newVersion(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function diskOk(res: Response, what: string): Promise<void> {
  if (!res.ok) throw new Error(`disk ${what}: ${res.status} ${await res.text()}`);
}

/** The key just past every key that starts with `prefix`, for a range scan; null when the range is unbounded. */
export function prefixEnd(prefix: string): string | null {
  if (prefix === '') return null;
  const last = prefix.charCodeAt(prefix.length - 1);
  return prefix.slice(0, -1) + String.fromCharCode(last + 1);
}

export function diskBackend(store: SqlStore, disk: Disk, now: () => number = Date.now): R2Backend {
  store.sql.exec(INDEX);
  const one = (key: string): StoredObject | null => {
    const [row] = Array.from(store.sql.exec(`SELECT ${COLUMNS} FROM objects WHERE key = ?`, key).raw());
    return row ? rowToObject(row) : null;
  };
  const removeFile = async (version: string): Promise<void> => {
    const res = await disk.fetch(fileUrl(version), { method: 'DELETE' });
    if (res.status !== 404) await diskOk(res, 'delete');
  };

  return {
    head: async (key) => one(key),

    async get(key) {
      const object = one(key);
      if (!object) return null;
      const res = await disk.fetch(fileUrl(object.version));
      await diskOk(res, 'read');
      return { object, body: new Uint8Array(await res.arrayBuffer()) };
    },

    async put(key, body, httpFields, customFields) {
      const object: StoredObject = {
        key,
        version: newVersion(),
        size: body.length,
        etag: await etagOf(body),
        uploaded: now(),
        httpFields,
        customFields,
      };
      await diskOk(await disk.fetch(fileUrl(object.version), { method: 'PUT', body }), 'write');
      const before = one(key);
      store.sql.exec(
        `INSERT OR REPLACE INTO objects (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        key,
        object.version,
        object.size,
        object.etag,
        object.uploaded,
        JSON.stringify(httpFields),
        JSON.stringify(customFields),
      );
      if (before) await removeFile(before.version);
      return object;
    },

    async delete(keys) {
      for (const key of keys) {
        const before = one(key);
        if (!before) continue;
        store.sql.exec('DELETE FROM objects WHERE key = ?', key);
        await removeFile(before.version);
      }
    },

    async list({ prefix, startAfter, limit }: ListOptions): Promise<Listing> {
      const end = prefixEnd(prefix);
      const from = startAfter > prefix ? startAfter : prefix;
      const op = startAfter > prefix ? '>' : '>=';
      const rows = Array.from(
        end === null
          ? store.sql
              .exec(`SELECT ${COLUMNS} FROM objects WHERE key ${op} ? ORDER BY key LIMIT ?`, from, limit + 1)
              .raw()
          : store.sql
              .exec(
                `SELECT ${COLUMNS} FROM objects WHERE key ${op} ? AND key < ? ORDER BY key LIMIT ?`,
                from,
                end,
                limit + 1,
              )
              .raw(),
      );
      const objects = rows.slice(0, limit).map(rowToObject);
      const truncated = rows.length > limit;
      return truncated ? { objects, truncated, cursor: objects[objects.length - 1]?.key } : { objects, truncated };
    },
  };
}
