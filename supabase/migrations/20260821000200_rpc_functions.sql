-- Aggregation engine + guarded write paths.
-- Constants (windows, thresholds, rate limits) live here and only here.

-- ---------------------------------------------------------------------------
-- Read path: current availability snapshot
-- score = distinct_reporters * freshness;  visible if score >= 0.7
-- freshness: <30min -> 1.0 | <2h -> 0.7 | <6h -> 0.4 | older -> excluded
-- ---------------------------------------------------------------------------
create or replace function public.get_active_availability(p_barrio text default null)
returns table (
  store_id       uuid,
  store_name     text,
  barrio         text,
  product_slug   text,
  product_name   text,
  emoji          text,
  availability   text,
  price_from     integer,
  reporter_count bigint,
  last_seen_at   timestamptz,
  freshness      numeric
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
           r.store_id, r.product_id, r.availability, r.created_at as last_seen_at,
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
           count(distinct r.device_hash) as reporter_count,
           min(r.price_cup) filter (where r.availability = 'available') as price_min
    from recent r
    group by r.store_id, r.product_id
  )
  select s.id, s.name, s.barrio, p.slug, p.name, p.emoji,
         l.availability, a.price_min, a.reporter_count, l.last_seen_at, l.freshness
  from latest l
  join agg a using (store_id, product_id)
  join stores s   on s.id = l.store_id
  join products p on p.id = l.product_id
  where (p_barrio is null or s.barrio = p_barrio)
    and a.reporter_count * l.freshness >= 0.7
  order by l.freshness desc, l.last_seen_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Write path: report submission with server-side anti-spam
--   max 10 reports / device / rolling 24h
--   min 60s between reports from the same device
--   exact duplicate (same device+store+product) within 30min -> silent ok
-- Never raises for expected conditions: returns jsonb {ok, error?, ...}
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(
  p_store_id     uuid,
  p_product_id   uuid,
  p_availability text,
  p_price_cup    integer default null,
  p_comment      text    default null,
  p_device_hash  text    default null
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

  if not exists (select 1 from stores where id = p_store_id and status = 'active') then
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

  -- Exact duplicate guard: treat as success so the client outbox can flush.
  if exists (
    select 1 from reports
    where device_hash = p_device_hash
      and store_id  = p_store_id
      and product_id = p_product_id
      and created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  insert into reports (store_id, product_id, device_hash, availability, price_cup, comment)
  values (p_store_id, p_product_id, p_device_hash, p_availability, p_price_cup, nullif(btrim(coalesce(p_comment,'')), ''))
  returning id into v_report_id;

  return jsonb_build_object('ok', true, 'report_id', v_report_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Community store creation: always lands as pending_review.
-- Returns the existing store when an identical one already exists.
-- ---------------------------------------------------------------------------
create or replace function public.create_pending_store(
  p_name   text,
  p_barrio text,
  p_kind   text default 'other',
  p_lat    numeric default null,
  p_lng    numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_name     text;
  v_barrio   text;
  v_existing stores;
begin
  v_name := btrim(coalesce(p_name, ''));
  v_barrio := btrim(coalesce(p_barrio, ''));

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if char_length(v_barrio) < 2 or char_length(v_barrio) > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_barrio');
  end if;
  if p_kind not in ('state_market','private_market','mipyme','other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  select * into v_existing
  from stores
  where lower(name) = lower(v_name)
    and lower(barrio) = lower(v_barrio)
    and created_at > now() - interval '90 days'
  limit 1;

  if found then
    return jsonb_build_object('ok', true, 'existing', true, 'store_id', v_existing.id);
  end if;

  insert into stores (name, barrio, kind, lat, lng, status, source)
  values (v_name, v_barrio, p_kind, p_lat, p_lng, 'pending_review', 'community')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'store_id', v_id);
end;
$$;

grant execute on function public.get_active_availability(text) to anon, authenticated;
grant execute on function public.submit_report(uuid, uuid, text, integer, text, text) to anon, authenticated;
grant execute on function public.create_pending_store(text, text, text, numeric, numeric) to anon, authenticated;
