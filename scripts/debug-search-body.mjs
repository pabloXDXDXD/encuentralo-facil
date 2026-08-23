// Debug search_availability body with literal params.
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// Step 1: does the product-match subquery see anything?
const mp = await client.query(
  `select id from public.products
    where active = true
      and ('pollo' = '' or name ilike '%' || 'pollo' || '%')`,
);
console.log("matched_products count:", mp.rows.length);

// Step 2: signals CTE with literals
const sig = await client.query(`
  with matched_products as (
    select id from public.products
     where active = true and name ilike '%' || 'pollo' || '%'
  ),
  s as (
    select r.store_id, max(r.created_at) as last_seen,
           count(distinct r.device_hash) filter (where r.availability='available') as ar
      from public.reports r
     where r.product_id in (select id from matched_products)
       and r.created_at > now() - interval '6 hours'
     group by r.store_id
  )
  select st.name, s.ar, s.last_seen
    from s join public.stores st on st.id = s.store_id limit 5`);
console.log("signals:", JSON.stringify(sig.rows));

await client.end();
