import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();

// SSP stores x a few products: out_of_stock consensus (2-3 reporters, <24h)
const rows = await c.query(
  `select s.id as sid, p.id as pid from stores s cross join (select id from products where slug in ('pollo','arroz','cafe') ) p
   where s.province = 'Sancti Spíritus' and s.status = 'active' order by random() limit 4`
);
const devices = ["seed-load-dev05", "seed-load-dev11", "seed-load-dev23", "seed-load-dev31"];
let n = 0;
for (const r of rows.rows) {
  const reps = 2 + Math.floor(Math.random() * 2);
  for (let k = 0; k < reps; k++) {
    await c.query(
      `insert into reports (store_id, product_id, device_hash, availability, created_at)
       values ($1,$2,$3,'out_of_stock', now() - ($4 || ' hours')::interval)`,
      [r.sid, r.pid, devices[(k + n) % devices.length], String(1 + Math.random() * 20)],
    );
    n++;
  }
}
console.log("SSP out reports:", n);

const dist = await c.query(
  `select status, count(*)::int as n from search_availability('pollo', 21.932, -79.4425, 20000) group by status`
);
console.log("pollo SSP:", dist.rows);
await c.end();
