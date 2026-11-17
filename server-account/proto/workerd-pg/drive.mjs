// Study prototype: drives the workerd probe and compares with a direct node-postgres query. Usage: node drive.mjs
import pg from 'pg';
const base = 'http://127.0.0.1:58787';
const get = async (path) => { const t = performance.now(); const r = await fetch(base + path); return { ms: performance.now() - t, body: await r.json() }; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const fresh = [];
for (let i = 0; i < 30; i++) fresh.push(await get('/fresh'));
console.log('fresh: ok', fresh.every((x) => x.body.ok), '| request median', median(fresh.map((x) => x.ms)).toFixed(1), 'ms | connect median', median(fresh.map((x) => x.body.connectMs)), 'ms | query median', median(fresh.map((x) => x.body.queryMs)), 'ms');

const shared = [];
for (let i = 0; i < 3; i++) shared.push(await get('/shared'));
console.log('shared:', shared.map((x) => JSON.stringify(x.body)).join(' | '));

const viaSeam = await get('/kysely');
console.log('kysely seam:', JSON.stringify(viaSeam.body));

const client = new pg.Client({ connectionString: 'postgres://postgres@127.0.0.1:55432/postgres' });
await client.connect();
const direct = [];
for (let i = 0; i < 30; i++) { const t = performance.now(); await client.query('SELECT 1'); direct.push(performance.now() - t); }
await client.end();
console.log('node pg, one pooled connection: query median', median(direct).toFixed(2), 'ms');
