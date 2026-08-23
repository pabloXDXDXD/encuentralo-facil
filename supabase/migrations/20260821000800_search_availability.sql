-- Search engine: product-centric results anchored on the user's position.
-- Returns EVERY active store within radius plus its status for the query:
--   'confirmed'  -> fresh multi-reporter or <30 min claim
--   'uncertain'  -> had it, but signal is weak/stale (search-mode only tier)
--   'out'        -> latest report says out of stock
--   'unknown'    -> no fresh data for that product
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
           bool_or(r.availability = 'available' and
                   r.created_at > now() - interval '30 minutes') as fresh_solo,
           bool_or(r.availability = 'out_of_stock') as ever_out
    from reports r
    where r.product_id in (select id from matched_products)
      and r.created_at > now() - interval '6 hours'
      and r.store_id in (select sid from inradius)
    group by r.store_id
  ),
  priced as (
    select r.store_id, min(r.price_cup) as price_from
    from reports r
    where r.product_id in (select id from matched_products)
      and r.availability = 'available'
      and r.price_cup is not null
      and r.created_at > now() - interval '6 hours'
      and r.store_id in (select sid from inradius)
    group by r.store_id
  )
  select st.sid, st.sname, st.sbarrio,
         coalesce(mp.slug, '') as product_slug,
         coalesce(mp.name, p_query) as product_name,
         st.slat, st.slng, st.dist_m,
    case
      when sg.last_seen_at is null then 'unknown'
      when sg.ever_out and coalesce(sg.fresh_solo,false) = false
           and coalesce(sg.avail_reporters,0) = 0 then 'out'
      when sg.avail_reporters >= 2 or sg.fresh_solo then 'confirmed'
      else 'uncertain'
    end as status,
    pr.price_from,
    coalesce(sg.avail_reporters, 0) as reporter_count,
    coalesce(sg.last_seen_at, null)::timestamptz as last_seen_at
  from inradius st
  left join matched_products mp on true
  left join signals sg on sg.store_id = st.sid
  left join priced pr on pr.store_id = st.sid
  where
    -- confirmed_only keeps only trustworthy greens
    (p_confirmed_only = false or ((sg.avail_reporters >= 2 or sg.fresh_solo)))
    -- price ceiling only applies when we actually have a price
    and (p_max_price is null or pr.price_from is null or pr.price_from <= p_max_price)
  order by st.dist_m asc;
$$;
