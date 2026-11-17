// Study prototype: what JS type a Postgres BIGINT comes back as, through Kysely on PGlite.
import { PGlite } from '@electric-sql/pglite';
import { postgresDb } from '../src/sql/db.js';
const pglite = new PGlite();
const seam = postgresDb({ pglite });
const { rows } = await seam.run({ sql: 'SELECT 1800000000::bigint AS at, 5::integer AS n, 9007199254740993::bigint AS big', parameters: [] });
console.log(Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, `${typeof v} ${v}`])));
await pglite.close();
