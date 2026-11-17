// Study prototype: the account service's path to Postgres from workerd, measured. pg over workerd's connect().
// /fresh opens a client in the request and closes it; /shared keeps one client made by an earlier request;
// /kysely runs a query through the seam (postgresDb) on a client made in the request.
import pg from 'pg';
import { postgresDb } from '../../src/sql/db.js';

let shared = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const conn = env.PG_URL;
    const t0 = Date.now();
    try {
      if (url.pathname === '/fresh') {
        const client = new pg.Client({ connectionString: conn });
        await client.connect();
        const t1 = Date.now();
        const r = await client.query('SELECT 1 AS one');
        const t2 = Date.now();
        await client.end();
        return Response.json({ ok: r.rows[0].one === 1, connectMs: t1 - t0, queryMs: t2 - t1 });
      }
      if (url.pathname === '/shared') {
        if (!shared) {
          shared = new pg.Client({ connectionString: conn });
          await shared.connect();
        }
        const r = await shared.query('SELECT 1 AS one');
        return Response.json({ ok: r.rows[0].one === 1, ms: Date.now() - t0 });
      }
      if (url.pathname === '/kysely') {
        const pool = new pg.Pool({ connectionString: conn, max: 1 });
        const seam = postgresDb({ pool });
        const [res] = await seam.atomic([seam.kysely.selectNoFrom((eb) => [eb.val(41).as('n')])]);
        await pool.end();
        return Response.json({ ok: Number(res.rows[0].n) === 41, ms: Date.now() - t0 });
      }
      return new Response('not found', { status: 404 });
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
    }
  },
};
