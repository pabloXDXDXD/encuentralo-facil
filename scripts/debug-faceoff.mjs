import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const fn = await client.query(
  `select store_name, status, distance_m
     from public.search_availability('pollo',23.12::float8,-82.38::float8,8000,null,false)
    order by distance_m limit 3`,
);
console.log("FN :", JSON.stringify(fn.rows));

const q = await client.query(`
  select s.name,
    case when sg.last_seen_at is null then 'unknown' else 'SIGNAL' end as st
    from public.stores s
    left join (
      select r.store_id, max(r.created_at) as last_seen_at
        from public.reports r
        join public.products p on p.id = r.product_id
       where p.slug = 'pollo'
         and r.created_at > now() - interval '6 hours'
       group by r.store_id
    ) sg on sg.store_id = s.id
   where s.name = 'Agropecuario 19 y B'`);
console.log("RAW:", JSON.stringify(q.rows));

await client.end();
