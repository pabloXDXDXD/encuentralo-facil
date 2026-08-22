-- Province-level filtering: every store belongs to a province; Havana today,
-- more provinces when the platform grows there.

alter table public.stores
  add column if not exists province text not null default 'La Habana';

create index if not exists idx_stores_province on public.stores (province);

-- Aggregation gains an optional province filter alongside the municipality one.
drop function if exists public.get_active_availability(text);

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
  lng              numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select r.*
    from reports r
    where r.created_at > now() - interval '6 hours'
  ),
  latest as (
    select distinct on (r.store_id, r.product_id)
           r.id as latest_report_id,
           r.store_id,
           r.product_id,
           r.availability,
           r.queue_level,
           r.created_at as last_seen_at,
           case
             when r.created_at > now() - interval '30 minutes' then 1.0
             when r.created_at > now() - interval '2 hours'    then 0.7
             else 0.4
           end as freshness
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
           ) as effective
    from latest l
    join agg a using (store_id, product_id)
    left join votes_on_latest v on v.report_id = l.latest_report_id
  )
  select s.id, s.name, s.barrio, p.slug, p.name, p.emoji,
         sc.availability, sc.price_min, sc.effective,
         sc.last_seen_at, sc.freshness, sc.latest_report_id, sc.queue_level,
         s.lat, s.lng
  from scored sc
  join stores s   on s.id = sc.store_id
  join products p on p.id = sc.product_id
  where (p_barrio is null or s.barrio = p_barrio)
    and (p_province is null or s.province = p_province)
    and sc.effective * sc.freshness >= 0.7
  order by sc.freshness desc, sc.last_seen_at desc;
$$;

-- Municipality normalization to official Havana municipalities (idempotent).
update public.stores set barrio = 'Plaza de la Revolución'
where barrio in ('Vedado', 'Nuevo Vedado');

update public.stores set barrio = 'Playa'
where barrio = 'Miramar';

update public.stores set barrio = 'Diez de Octubre'
where barrio in ('Víbora', 'Santos Suárez');
