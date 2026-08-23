create or replace function public.__debug_search(
  p_query text, p_lat double precision, p_lng double precision,
  p_radius_m integer, p_max_price integer, p_confirmed_only boolean
)
returns table (step text, n bigint)
language sql stable security definer set search_path = public
as $$
  with base as (
    select s.id,
      (6371000 * acos(least(1,greatest(-1,
        cos(radians(p_lat))*cos(radians(s.lat::float8))*cos(radians(s.lng::float8)-radians(p_lng))
        + sin(radians(p_lat))*sin(radians(s.lat::float8))))))::int as dist
    from stores s
    where s.status in ('active','pending_review') and s.lat is not null
  ),
  inradius as (select * from base where base.dist <= p_radius_m),
  matched as (
    select id from products where active = true
      and (p_query = '' or name ilike '%'||p_query||'%' or slug ilike '%'||p_query||'%')
  ),
  sig as (
    select r.store_id
      from reports r
     where r.product_id in (select id from matched)
       and r.created_at > now() - interval '6 hours'
       and r.store_id in (select id from inradius)
     group by r.store_id
  )
  select * from (
    values ('stores_total',(select count(*) from base)),
           ('in_radius',(select count(*) from inradius)),
           ('matched_products',(select count(*) from matched)),
           ('with_signals',(select count(*) from sig))
  ) as t(step,n)
$$;
