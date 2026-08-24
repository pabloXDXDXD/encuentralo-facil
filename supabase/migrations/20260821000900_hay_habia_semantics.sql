-- ---------------------------------------------------------------------------
-- Semantica temporal de 4 estados (modelo "dia"):
--   'hay'       -> reportado disponible hace menos de 24h
--   'ya_no_hay' -> consenso de agotamiento en 24h (2+ reporteros efectivos)
--   'habia'     -> el ultimo reporte tiene mas de 24h (dato viejo, hasta 7 dias)
--   'sin datos' -> no se emite fila (ausencia en el snapshot)
-- Ventanas: HAY_WINDOW = 24h | STALE_WINDOW = 7d | umbral ya_no_hay = 2
-- ---------------------------------------------------------------------------

drop function if exists public.get_active_availability(text);
drop function if exists public.get_active_availability(text, text);

create or replace function public.get_active_availability(
  p_barrio   text default null,
  p_province text default null
)
returns table (
  store_id         uuid,
  store_name       text,
  barrio           text,
  product_slug     text,
  product_name     text,
  emoji            text,
  availability     text,
  price_from       integer,
  reporter_count   bigint,
  last_seen_at     timestamptz,
  freshness        numeric,
  latest_report_id uuid,
  queue_level      smallint,
  lat              numeric,
  lng              numeric,
  status           text
)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    -- ventana "hay": ultimas 24 horas
    select r.*
    from reports r
    where r.created_at > now() - interval '24 hours'
  ),
  latest as (
    select distinct on (r.store_id, r.product_id)
           r.id as latest_report_id,
           r.store_id,
           r.product_id,
           r.availability,
           r.queue_level,
           r.created_at as last_seen_at
    from recent r
    order by r.store_id, r.product_id, r.created_at desc
  ),
  agg as (
    select r.store_id, r.product_id,
           count(distinct r.device_hash) as reporters,
           min(r.price_cup) filter (where r.availability = 'available') as price_min
    from recent r
    group by r.store_id, r.product_id
  ),
  votes_on_latest as (
    select v.report_id,
           count(distinct case when v.vote = 'confirm' then v.device_hash end) as confirmers,
           count(distinct case when v.vote = 'deny'    then v.device_hash end) as deniers
    from report_votes v
    join recent r on r.id = v.report_id
    group by v.report_id
  ),
  scored as (
    select l.*,
           a.reporters,
           a.price_min,
           greatest(
             a.reporters + coalesce(v.confirmers, 0) - coalesce(v.deniers, 0),
             0
           ) as effective,
           -- estado dentro de la ventana de 24h
           case
             when l.availability = 'available' then 'hay'
             -- agotado con suficiente respaldo de la comunidad
             when greatest(
                    a.reporters + coalesce(v.confirmers, 0) - coalesce(v.deniers, 0),
                    0
                  ) >= 2 then 'ya_no_hay'
             -- agotado debil (un solo reportero sin respaldo): mirar si hay
             -- un 'available' previo en la ventana que sostenga el 'hay'
             when exists (
               select 1 from recent r2
                where r2.store_id  = l.store_id
                  and r2.product_id = l.product_id
                  and r2.availability = 'available'
                  and r2.id <> l.latest_report_id
             ) then 'hay'
             else null  -- senal insuficiente -> no se publica
           end as status
    from latest l
    join agg a using (store_id, product_id)
    left join votes_on_latest v on v.report_id = l.latest_report_id
  ),
  stale_agg as (
    select r.store_id, r.product_id,
           count(distinct r.device_hash) as reporters,
           min(r.price_cup) filter (where r.availability = 'available') as price_min
    from reports r
    where r.created_at <= now() - interval '24 hours'
      and r.created_at > now() - interval '7 days'
    group by r.store_id, r.product_id
  ),
  stale as (
    -- "habia": el dato mas nuevo del grupo es viejo (24h..7d)
    select distinct on (r.store_id, r.product_id)
           r.id as latest_report_id,
           r.store_id,
           r.product_id,
           r.availability,
           r.queue_level,
           r.created_at as last_seen_at,
           sa.reporters,
           sa.price_min
    from reports r
    join stale_agg sa on sa.store_id = r.store_id and sa.product_id = r.product_id
    where r.created_at <= now() - interval '24 hours'
      and r.created_at > now() - interval '7 days'
    order by r.store_id, r.product_id, r.created_at desc
  )
  -- grupos frescos (hay / ya_no_hay)
  select s.id, s.name, s.barrio, p.slug, p.name, p.emoji,
         sc.availability, sc.price_min, sc.effective,
         sc.last_seen_at, 1.0 as freshness, sc.latest_report_id, sc.queue_level,
         s.lat, s.lng, sc.status
  from scored sc
  join stores s   on s.id = sc.store_id
  join products p on p.id = sc.product_id
  where sc.status is not null
    and (p_barrio   is null or s.barrio   = p_barrio)
    and (p_province is null or s.province = p_province)
  union all
  -- grupos viejos (habia), marcados para que la UI los muestre atenuados
  select s.id, s.name, s.barrio, p.slug, p.name, p.emoji,
         st.availability, st.price_min, st.reporters,
         st.last_seen_at, 0.0 as freshness, st.latest_report_id, st.queue_level,
         s.lat, s.lng, 'habia' as status
  from stale st
  join stores s   on s.id = st.store_id
  join products p on p.id = st.product_id
  where (p_barrio   is null or s.barrio   = p_barrio)
    and (p_province is null or s.province = p_province)
    -- no duplicar grupos que ya aparecen frescos
    and not exists (
      select 1 from scored sc2
       where sc2.store_id = st.store_id
         and sc2.product_id = st.product_id
         and sc2.status is not null
    )
  order by freshness desc, last_seen_at desc;
$$;

grant execute on function public.get_active_availability(text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_availability v2: mismas ventanas y estados.
--   'confirmed' -> hay          (<24h, senal suficiente)
--   'stale'     -> habia        (24h..7d)
--   'out'       -> ya no hay    (agotado en 24h)
--   'unknown'   -> sin datos
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
     pr.price_from,
     coalesce(sg.avail_reporters, stl.reporters, 0) as reporter_count,
     coalesce(sg.last_seen_at, stl.last_seen_at)::timestamptz as last_seen_at
  from inradius st
  left join matched_products mp on true
  left join signals sg on sg.store_id = st.sid
  left join stale_signals stl on stl.store_id = st.sid
  left join priced pr on pr.store_id = st.sid
  where
    -- confirmed_only mantiene solo los verdes confiables
    (p_confirmed_only = false or ((sg.avail_reporters >= 2 or sg.ever_avail)))
    -- tope de precio solo aplica cuando hay precio
    and (p_max_price is null or pr.price_from is null or pr.price_from <= p_max_price)
  order by st.dist_m asc;
$$;