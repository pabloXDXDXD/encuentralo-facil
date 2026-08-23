// Isolate: same body as PREPARE statement with $-params.
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const sql = `
  with base as (
    select s.id, s.name, s.barrio, s.lat::float8 as slat, s.lng::float8 as slng,
      (6371000 * acos(least(1, greatest(-1,
        cos(radians($2)) * cos(radians(s.lat::float8)) * cos(radians(s.lng::float8) - radians($3))
        + sin(radians($2)) * sin(radians(s.lat::float8))
      ))))::int as dist
    from public.stores s
    where s.status in ('active','pending_review')
      and s.lat is not null and s.lng is not null
  ),
  inradius as (select * from base where base.dist <= $4),
  matched_products as (
    select id from public.products
     where active = true
       and ($1 = '' or name ilike '%' || $1 || '%' or slug ilike '%' || $1 || '%')
  ),
  signals as (
    select r.store_id,
           max(r.created_at) as last_seen_at,
           count(distinct r.device_hash) filter (where r.availability='available') as avail_reporters,
           bool_or(r.availability='available' and r.created_at > now() - interval '30 minutes') as fresh_solo,
           bool_or(r.availability='out_of_stock') as ever_out
      from public.reports r
     where r.product_id in (select id from matched_products)
       and r.created_at > now() - interval '6 hours'
       and r.store_id in (select id from inradius)
     group by r.store_id
  )
  select st.name, st.dist,
    case
      when sg.last_seen_at is null then 'unknown'
      when sg.ever_out and coalesce(sg.fresh_solo,false)=false and coalesce(sg.avail_reporters,0)=0 then 'out'
      when sg.avail_reporters >= 2 or sg.fresh_solo then 'confirmed'
      else 'uncertain'
    end as st_status
  from inradius st
  left join signals sg on sg.store_id = st.id
  order by case when sg.last_seen_at is null then 1 else 0 end, st.dist
  limit 8`;

const res = await client.query(sql, ["pollo", 23.12, -82.38, 8000]);
for (const r of res.rows) console.log(`${r.name} | ${r.st_status} | ${r.dist}m`);

await client.end();
