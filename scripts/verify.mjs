// Dev utility: sanity-check aggregation RPC + guarded submit path.
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const agg = await client.query(
  "select availability, count(*) as n from get_active_availability(null) group by availability order by availability"
);
console.log("visible snapshot:", JSON.stringify(agg.rows));

const sample = await client.query(
  "select store_name, product_name, emoji, price_from, reporter_count, freshness from get_active_availability(null) limit 3"
);
for (const row of sample.rows) console.log("sample:", JSON.stringify(row));

const test = await client.query(`
  select public.submit_report(
    (select id from public.stores where name = 'Bodega Rotonda'),
    (select id from public.products where slug = 'sal'),
    'available', 150, null, 'test-device-00000001'
  ) as r
`);
console.log("submit ok-path:", JSON.stringify(test.rows[0].r));

const dupe = await client.query(`
  select public.submit_report(
    (select id from public.stores where name = 'Bodega Rotonda'),
    (select id from public.products where slug = 'sal'),
    'available', 150, null, 'test-device-00000001'
  ) as r
`);
console.log("duplicate guard:", JSON.stringify(dupe.rows[0].r));

const cleanup = await client.query(
  "delete from public.reports where device_hash = 'test-device-00000001'"
);
console.log("cleanup removed:", cleanup.rowCount);

await client.end();
