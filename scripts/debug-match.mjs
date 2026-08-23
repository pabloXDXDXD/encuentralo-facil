// Debug why product matching returns nothing.
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const byName = await client.query(
  `select id, slug, name from public.products where name ilike '%' || $1 || '%'`,
  ["pollo"],
);
console.log("byName:", JSON.stringify(byName.rows));

const recent = await client.query(
  `select r.device_hash, r.availability, r.created_at
     from public.reports r
     join public.products p on p.id = r.product_id
    where p.slug = 'pollo'
      and r.created_at > now() - interval '6 hours'
    order by r.created_at desc`,
);
console.log("recent pollo reports:", recent.rows.length, JSON.stringify(recent.rows[0] ?? {}));

await client.end();
