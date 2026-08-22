-- Queue-level reporting (🟢 short / 🟡 medium / 🔴 long).
-- Queue info rides on reports; only meaningful for 'available' claims.

alter table public.reports
  add column if not exists queue_level smallint
  check (queue_level between 1 and 3);

-- Signature changes -> drop before recreate (Postgres would otherwise
-- create an overload, splitting callers across two functions).
drop function if exists public.submit_report(uuid, uuid, text, integer, text, text);

create or replace function public.submit_report(
  p_store_id     uuid,
  p_product_id   uuid,
  p_availability text,
  p_price_cup    integer default null,
  p_comment      text    default null,
  p_device_hash  text    default null,
  p_queue_level  smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
  v_daily     int;
  v_last_at   timestamptz;
begin
  if p_device_hash is null or char_length(btrim(p_device_hash)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_device');
  end if;

  if p_availability not in ('available','out_of_stock') then
    return jsonb_build_object('ok', false, 'error', 'invalid_availability');
  end if;

  -- Queue only makes sense when claiming stock.
  if p_queue_level is not null then
    if p_queue_level not between 1 and 3 then
      return jsonb_build_object('ok', false, 'error', 'invalid_queue');
    end if;
    if p_availability <> 'available' then
      p_queue_level := null;
    end if;
  end if;

  if not exists (
    select 1 from stores
    where id = p_store_id and status in ('active','pending_review')
  ) then
    return jsonb_build_object('ok', false, 'error', 'unknown_store');
  end if;

  if not exists (select 1 from products where id = p_product_id and active = true) then
    return jsonb_build_object('ok', false, 'error', 'unknown_product');
  end if;

  select count(*) into v_daily
  from reports
  where device_hash = p_device_hash
    and created_at > now() - interval '24 hours';
  if v_daily >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limit_daily');
  end if;

  select max(created_at) into v_last_at
  from reports where device_hash = p_device_hash;
  if v_last_at is not null and v_last_at > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'error', 'rate_limit_interval');
  end if;

  if exists (
    select 1 from reports
    where device_hash = p_device_hash
      and store_id  = p_store_id
      and product_id = p_product_id
      and created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  insert into reports (store_id, product_id, device_hash, availability, price_cup, comment, queue_level)
  values (p_store_id, p_product_id, p_device_hash, p_availability, p_price_cup,
          nullif(btrim(coalesce(p_comment,'')), ''), p_queue_level)
  returning id into v_report_id;

  return jsonb_build_object('ok', true, 'report_id', v_report_id);
end;
$$;

grant execute on function public.submit_report(uuid, uuid, text, integer, text, text, smallint)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aggregation engine v3: expose queue level of the latest report.
-- ---------------------------------------------------------------------------
drop function if exists public.get_active_availability(text);

create or replace function public.get_active_availability(p_barrio text default null)
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
  queue_level      smallint
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
         sc.last_seen_at, sc.freshness, sc.latest_report_id, sc.queue_level
  from scored sc
  join stores s   on s.id = sc.store_id
  join products p on p.id = sc.product_id
  where (p_barrio is null or s.barrio = p_barrio)
    and sc.effective * sc.freshness >= 0.7
  order by sc.freshness desc, sc.last_seen_at desc;
$$;
