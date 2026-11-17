// Study prototype: bound parameters per statement and the cost of building and compiling the slice's statements, per
// library and dialect. Usage: node server-account/proto/compile-cost.mjs
import { d1Db, postgresDb } from '../src/sql/db.js';
import * as kyselyOrders from '../src/market-orders-kysely.js';
import * as drizzleOrders from '../src/market-orders-drizzle.js';

const seams = {
  sqlite: d1Db({ prepare() {}, batch() {} }),
  postgres: postgresDb({ pglite: {} }),
};
const post = { poster: 'p1', character: 'c1', id: 'o1', region: 5, material: 'iron', units: 5, price: 10, nowS: 1_800_000_000, expiresAt: 1_800_604_800, rid: 'rid-1', nonce: 'n1', ordersMax: 3 };
const compile = (q) => (typeof q.compile === 'function' ? q.compile() : q);
const params = (c) => (c.parameters ?? c.params).length;

for (const [libName, lib] of Object.entries({ kysely: kyselyOrders, drizzle: drizzleOrders })) {
  for (const [dialect, seam] of Object.entries(seams)) {
    const statements = [...lib.orderPostStatements(seam, post), ...lib.orderReturnStatements(seam, 'o1', post.nowS)].map(compile);
    const binds = statements.map(params).join('/');
    const rounds = 20_000;
    const start = performance.now();
    for (let i = 0; i < rounds; i++) {
      for (const q of [...lib.orderPostStatements(seam, post), ...lib.orderReturnStatements(seam, 'o1', post.nowS)]) compile(q);
    }
    const perPost = ((performance.now() - start) * 1000) / rounds;
    console.log(`${libName} ${dialect}: binds per statement ${binds}; build+compile of the 4 statements ${perPost.toFixed(1)} us`);
    if (process.argv.includes('--sql')) for (const c of statements) console.log(`  ${c.sql}`);
  }
}
