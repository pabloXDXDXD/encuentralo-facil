-- Community verification: confirm / deny votes on reports.
-- A vote is a judgment on a specific claim. Votes attach to the report they
-- were cast on and only count while that report is the latest of its group
-- and still inside the freshness window.

create table if not exists public.report_votes (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id),
  device_hash text not null,
  vote        text not null check (vote in ('confirm','deny')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_votes_report on public.report_votes (report_id);
create unique index if not exists uq_votes_device_report
  on public.report_votes (device_hash, report_id);

alter table public.report_votes enable row level security;
-- No policies: reads happen through get_active_availability (SECURITY DEFINER),
-- writes through submit_vote. Anon cannot enumerate or tamper with votes.

-- ---------------------------------------------------------------------------
-- submit_vote(p_report_id, p_vote, p_device_hash)
-- Rules: cannot vote own report; max 40 votes/day/device; one vote per
-- device per report (silent duplicate); report must be inside the 6h window.
-- Never raises for expected conditions.
-- ---------------------------------------------------------------------------
create or replace function public.submit_vote(
  p_report_id   uuid,
  p_vote        text,
  p_device_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_daily int;
begin
  if p_device_hash is null or char_length(btrim(p_device_hash)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_device');
  end if;

  if p_vote not in ('confirm','deny') then
    return jsonb_build_object('ok', false, 'error', 'invalid_vote');
  end if;

  if not exists (
    select 1 from reports
    where id = p_report_id
      and created_at > now() - interval '6 hours'
  ) then
    return jsonb_build_object('ok', false, 'error', 'unknown_or_expired_report');
  end if;

  -- Voting your own report is self-verification, not community signal.
  if exists (
    select 1 from reports where id = p_report_id and device_hash = p_device_hash
  ) then
    return jsonb_build_object('ok', false, 'error', 'own_report');
  end if;

  select count(*) into v_daily
  from report_votes
  where device_hash = p_device_hash
    and created_at > now() - interval '24 hours';
  if v_daily >= 40 then
    return jsonb_build_object('ok', false, 'error', 'rate_limit_daily');
  end if;

  insert into report_votes (report_id, device_hash, vote)
  values (p_report_id, p_device_hash, p_vote)
  on conflict (device_hash, report_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.submit_vote(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aggregation engine v2: vote-aware visibility.
--   effective = distinct reporting devices + confirmers - deniers (min 0)
--   visible if effective * freshness >= 0.7
-- Freshness stays anchored to REPORTS ONLY: confirms cannot keep stale
-- information alive indefinitely. Votes count only when attached to the
-- current latest report of their group.
-- reporter_count now returns the net effective count (feeds both threshold
-- and the "N reportes" chip in the UI).
-- NOTE: return type changed (new column) -> must drop before recreate.
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
  latest_report_id uuid
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
         sc.last_seen_at, sc.freshness, sc.latest_report_id
  from scored sc
  join stores s   on s.id = sc.store_id
  join products p on p.id = sc.product_id
  where (p_barrio is null or s.barrio = p_barrio)
    and sc.effective * sc.freshness >= 0.7
  order by sc.freshness desc, sc.last_seen_at desc;
$$;
