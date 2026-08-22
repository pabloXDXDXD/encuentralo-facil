// Refreshes demo reports: wipes device 'seed-demo' (stored literally by the
// seed) and re-applies supabase/seed.sql so timestamps come out fresh.
import { readFileSync } from "node:fs";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const del = await client.query("delete from public.reports where device_hash = $1", [
  "seed-demo",
]);
console.log("old demo reports removed:", del.rowCount);

const sql = readFileSync("supabase/seed.sql", "utf8");
await client.query(sql);
console.log("seed re-applied: fresh demo data ready");

const counts = await client.query(
  `select
     (select count(*) from public.products) as products,
     (select count(*) from public.stores)   as stores,
     (select count(*) from public.reports)  as reports,
     (select count(distinct province) from public.stores) as provinces`,
);
console.log(counts.rows[0]);

await client.end();
