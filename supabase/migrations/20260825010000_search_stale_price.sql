-- ---------------------------------------------------------------------------
-- FIX: las filas 'stale' ("habia", datos de 24h..7d) salian sin precio.
-- Causa raiz: el CTE priced de search_availability solo miraba las ultimas
-- 24h, pero una fila es 'stale' precisamente cuando su ultimo reporte tiene
-- MAS de 24h -> price_from quedaba null y la UI ocultaba el precio.
-- (get_active_availability ya lo resuelve con stale_agg; aqui faltaba.)
-- Nuevo CTE stale_priced (24h..7d): las filas frescas conservan su minimo de
-- 24h; las viejas muestran su ultimo precio conocido dentro de la semana.
-- ---------------------------------------------------------------------------

create or replace function public.search_availability(
  p_query          text,
  p_lat            double precision,
  p_lng            double precision,
  p_radius_m       integer default 5000,
  p_max_price      integer default null,
  p_confirmed_only boolean default false
)
returns table (
  store_id       uuid,
  store_name     text,
  barrio         text,
  product_slug   text,
  product_name   text,
  lat            double precision,
  lng            double precision,
  distance_m     integer,
  status         text,
  price_from     integer,
  reporter_count bigint,
  last_seen_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select s.id as sid, s.name as sname, s.barrio as sbarrio,
           s.lat::float8 as slat, s.lng::float8 as slng,
      (6371000 * acos(least(1, greatest(-1,
        cos(radians(p_lat)) * cos(radians(s.lat::float8)) * cos(radians(s.lng::float8) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(s.lat::float8))
      ))))::int as dist_m
    from stores s
    where s.status in ('active','pending_review')
      and s.lat is not null and s.lng is not null
  ),
  inradius as (
    select * from base where base.dist_m <= p_radius_m
  ),
  matched_products as (
    select id, slug, name from products
    where active = true and (p_query = '' or name ilike '%' || p_query || '%' or slug ilike '%' || p_query || '%')
    order by name
    limit 1
  ),
  signals as (
    select r.store_id,
           max(r.created_at) as last_seen_at,
           count(distinct r.device_hash) filter (
             where r.availability = 'available') as avail_reporters,
           bool_or(r.availability = 'available') as ever_avail,
           bool_or(r.availability = 'out_of_stock') as ever_out
    from reports r
    where r.product_id in (select id from matched_products)
      and r.created_at > now() - interval '24 hours'
      and r.store_id in (select sid from inradius)
    group by r.store_id
  ),
  stale_signals as (
    select r.store_id,
           max(r.created_at) as last_seen_at,
           count(distinct r.device_hash) as reporters
    from reports r
    where r.product_id in (select id from matched_products)
      and r.created_at <= now() - interval '24 hours'
      and r.created_at > now() - interval '7 days'
      and r.store_id in (select sid from inradius)
    group by r.store_id
  ),
  priced as (
    select r.store_id, min(r.price_cup) as price_from
    from reports r
    where r.product_id in (select id from matched_products)
      and r.availability = 'available'
      and r.price_cup is not null
      and r.created_at > now() - interval '24 hours'
      and r.store_id in (select sid from inradius)
    group by r.store_id
  ),
  -- Ultimo precio conocido de reportes viejos (24h..7d), misma ventana que
  -- stale_signals: sostiene el precio de las filas 'stale'.
  stale_priced as (
    select r.store_id, min(r.price_cup) as price_from
    from reports r
    where r.product_id in (select id from matched_products)
      and r.availability = 'available'
      and r.price_cup is not null
      and r.created_at <= now() - interval '24 hours'
      and r.created_at > now() - interval '7 days'
      and r.store_id in (select sid from inradius)
    group by r.store_id
  )
  select st.sid, st.sname, st.sbarrio,
         coalesce(mp.slug, '') as product_slug,
         coalesce(mp.name, p_query) as product_name,
         st.slat, st.slng, st.dist_m,
     case
       -- habia: sin datos en 24h pero reportado hace poco mas de un dia
       when sg.last_seen_at is null and stl.last_seen_at is not null then 'stale'
       when sg.last_seen_at is null then 'unknown'
       when sg.ever_out and coalesce(sg.ever_avail, false) = false then 'out'
       when sg.avail_reporters >= 2 or sg.ever_avail then 'confirmed'
       else 'unknown'
     end as status,
     coalesce(pr.price_from, spr.price_from) as price_from,
     coalesce(sg.avail_reporters, stl.reporters, 0) as reporter_count,
     coalesce(sg.last_seen_at, stl.last_seen_at)::timestamptz as last_seen_at
  from inradius st
  left join matched_products mp on true
  left join signals sg on sg.store_id = st.sid
  left join stale_signals stl on stl.store_id = st.sid
  left join priced pr on pr.store_id = st.sid
  left join stale_priced spr on spr.store_id = st.sid
  where
    -- confirmed_only mantiene solo los verdes confiables
    (p_confirmed_only = false or ((sg.avail_reporters >= 2 or sg.ever_avail)))
    -- tope de precio solo aplica cuando hay precio (fresco o viejo)
    and (p_max_price is null or coalesce(pr.price_from, spr.price_from) is null
         or coalesce(pr.price_from, spr.price_from) <= p_max_price)
  order by st.dist_m asc;
$$;
