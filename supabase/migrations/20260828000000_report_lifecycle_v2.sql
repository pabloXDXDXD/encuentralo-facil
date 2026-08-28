-- ---------------------------------------------------------------------------
-- Ciclo de vida v2 de los reportes ("el tiempo manda, los votos aceleran"):
--   * Un reporte VIVE mientras alguien lo haya creado o CONFIRMADO en los
--     ultimos 7 dias (red de seguridad para zonas de poco trafico: cada
--     senal, creacion o confirmacion, reinicia el reloj completo). No hay
--     aritmetica de extension: la regla de vida es una sola linea.
--   * 2 votos 'deny' de dispositivos DISTINTOS sobre el ultimo reporte del
--     grupo lo MATAN al instante, sin importar su edad (simetria con el
--     umbral de confianza de 2 reporteros: para destruir un hecho hacen
--     falta tantas personas como para crearlo).
--   * Muere 'habia' (24h..7d): la info vieja desaparece, ya no se publica
--     como "hay (no seguro)". Estados finales: hay · ya_no_hay · sin datos.
-- Funciones redefinidas: submit_vote, get_active_availability,
-- search_availability, search_place_availability, get_place_availability.
-- Todas conservan firma y columnas de retorno (create or replace seco).
-- ---------------------------------------------------------------------------

-- 1) submit_vote: un reporte es votable mientras este vivo -------------------
-- Antes: solo dentro de la ventana dura de 6h. Ahora: reporte vivo (creado
-- o confirmado en los ultimos 7 dias; la comunidad lo mantiene vivo).
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

  -- Ventana de votacion = ventana de vida (creado o confirmado <7 dias).
  if not exists (
    select 1 from reports r
    where r.id = p_report_id
      and (
        r.created_at > now() - interval '7 days'
        or exists (
          select 1 from report_votes v
           where v.report_id = r.id
             and v.vote = 'confirm'
             and v.created_at > now() - interval '7 days'
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'error', 'unknown_or_expired_report');
  end if;

  -- Voting your own report is self-verification, not community signal.
  if exists (
    select 1 from reports where id = p_report_id and device_hash = p_device_hash
  ) then
    return jsonb_build_object('ok', false, 'error', 'own_report');
  end if;

  -- Rate limit de votos: 40 por dispositivo al dia (ventana dura de 24h).
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

-- 2) get_active_availability: snapshot de listas (home/producto/barrio) ------
-- Sin rama 'habia'; kill por 2 deniers; last_seen_at = ultima senal del
-- grupo (reporte o confirmacion).
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
  with alive as (
    -- Ventana de vida: creado <7d O confirmado <7d. last_signal_at es la
    -- edad efectiva del reporte (confirmar refresca, no extiende).
    select r.*,
           greatest(
             r.created_at,
             coalesce((
               select max(v.created_at) from report_votes v
                where v.report_id = r.id and v.vote = 'confirm'
             ), r.created_at)
           ) as last_signal_at
    from reports r
    where r.created_at > now() - interval '7 days'
       or exists (
         select 1 from report_votes v
          where v.report_id = r.id and v.vote = 'confirm'
            and v.created_at > now() - interval '7 days'
       )
  ),
  latest as (
    select distinct on (r.store_id, r.product_id)
           r.id as latest_report_id,
           r.store_id,
           r.product_id,
           r.availability,
           r.queue_level,
           r.created_at as last_seen_at
    from alive r
    order by r.store_id, r.product_id, r.created_at desc
  ),
  agg as (
    select r.store_id, r.product_id,
           count(distinct r.device_hash) as reporters,
           min(r.price_cup) filter (where r.availability = 'available') as price_min,
           max(r.last_signal_at) as last_signal_at
    from alive r
    group by r.store_id, r.product_id
  ),
  votes_on_latest as (
    select v.report_id,
           count(distinct case when v.vote = 'confirm' then v.device_hash end) as confirmers,
           count(distinct case when v.vote = 'deny'    then v.device_hash end) as deniers
    from report_votes v
    join alive r on r.id = v.report_id
    group by v.report_id
  ),
  scored as (
    select l.*,
           a.reporters,
           a.price_min,
           a.last_signal_at,
           greatest(
             a.reporters + coalesce(v.confirmers, 0) - coalesce(v.deniers, 0),
             0
           ) as effective,
           case
             -- muerte por negativos: 2 deniers independientes queman el dato
             when coalesce(v.deniers, 0) >= 2 then null
             when l.availability = 'available' then 'hay'
             -- agotado con suficiente respaldo de la comunidad
             when greatest(
                    a.reporters + coalesce(v.confirmers, 0) - coalesce(v.deniers, 0),
                    0
                  ) >= 2 then 'ya_no_hay'
             -- agotado debil (un solo reportero sin respaldo): mirar si hay
             -- un 'available' vivo previo que sostenga el 'hay'
             when exists (
               select 1 from alive r2
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
  )
  select s.id, s.name, s.barrio, p.slug, p.name, p.emoji,
         sc.availability, sc.price_min, sc.effective,
         sc.last_signal_at, 1.0 as freshness, sc.latest_report_id, sc.queue_level,
         s.lat, s.lng, sc.status
  from scored sc
  join stores s   on s.id = sc.store_id
  join products p on p.id = sc.product_id
  where sc.status is not null
    and (p_barrio   is null or s.barrio   = p_barrio)
    and (p_province is null or s.province = p_province)
  order by sc.last_signal_at desc;
$$;

grant execute on function public.get_active_availability(text, text)
  to anon, authenticated;

-- 3) search_availability (tiendas, ruta legada): mismas reglas de vida -------
-- Fuera stale_signals/stale (24h..7d); kill por 2 deniers; confirm-refresh.
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
  alive as (
    select r.*
    from reports r
    where r.product_id in (select id from matched_products)
      and r.store_id in (select sid from inradius)
      and (
        r.created_at > now() - interval '7 days'
        or exists (
          select 1 from report_votes v
           where v.report_id = r.id and v.vote = 'confirm'
             and v.created_at > now() - interval '7 days'
        )
      )
  ),
  signals as (
    select r.store_id,
           max(r.created_at) as last_seen_at,
           count(distinct r.device_hash) filter (
             where r.availability = 'available') as avail_reporters,
           bool_or(r.availability = 'available') as ever_avail,
           bool_or(r.availability = 'out_of_stock') as ever_out
    from alive r
    group by r.store_id
  ),
  -- Muerte por negativos: el ultimo reporte vivo del grupo acumula 2+ deniers.
  killed as (
    select r.store_id
    from alive r
    join report_votes v on v.report_id = r.id and v.vote = 'deny'
    where not exists (
      select 1 from alive r2
       where r2.store_id = r.store_id
         and r2.product_id = r.product_id
         and r2.created_at > r.created_at
    )
    group by r.store_id
    having count(distinct v.device_hash) >= 2
  ),
  priced as (
    select r.store_id, min(r.price_cup) as price_from
    from alive r
    where r.availability = 'available' and r.price_cup is not null
    group by r.store_id
  )
  select st.sid, st.sname, st.sbarrio,
         coalesce(mp.slug, '') as product_slug,
         coalesce(mp.name, p_query) as product_name,
         st.slat, st.slng, st.dist_m,
     case
       when kg.store_id is not null then 'unknown'
       when sg.last_seen_at is null then 'unknown'
       when sg.ever_out and coalesce(sg.ever_avail, false) = false then 'out'
       when sg.avail_reporters >= 2 or sg.ever_avail then 'confirmed'
       else 'unknown'
     end as status,
     pr.price_from,
     coalesce(sg.avail_reporters, 0) as reporter_count,
     sg.last_seen_at::timestamptz as last_seen_at
  from inradius st
  left join matched_products mp on true
  left join signals sg on sg.store_id = st.sid
  left join priced pr on pr.store_id = st.sid
  left join killed kg on kg.store_id = st.sid
  where
    -- confirmed_only mantiene solo los verdes confiables y no muertos
    (p_confirmed_only = false
      or ((sg.avail_reporters >= 2 or sg.ever_avail) and kg.store_id is null))
    -- tope de precio solo aplica cuando hay precio
    and (p_max_price is null or pr.price_from is null or pr.price_from <= p_max_price)
  order by st.dist_m asc;
$$;

-- 4) search_place_availability (place-first: mapa + API de busqueda) ---------
-- Mismo modelo que la ruta legada, anclado a places.
create or replace function public.search_place_availability(
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
    select pl.id as sid, pl.label as sname, pl.barrio as sbarrio,
           pl.lat as slat, pl.lng as slng,
      (6371000 * acos(least(1, greatest(-1,
        cos(radians(p_lat)) * cos(radians(pl.lat)) * cos(radians(pl.lng) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(pl.lat))
      ))))::int as dist_m
    from places pl
    where pl.active = true
      and pl.lat is not null and pl.lng is not null
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
  alive as (
    select r.*
    from reports r
    where r.product_id in (select id from matched_products)
      and r.place_id in (select sid from inradius)
      and (
        r.created_at > now() - interval '7 days'
        or exists (
          select 1 from report_votes v
           where v.report_id = r.id and v.vote = 'confirm'
             and v.created_at > now() - interval '7 days'
        )
      )
  ),
  signals as (
    select r.place_id,
           max(r.created_at) as last_seen_at,
           count(distinct r.device_hash) filter (
             where r.availability = 'available') as avail_reporters,
           bool_or(r.availability = 'available') as ever_avail,
           bool_or(r.availability = 'out_of_stock') as ever_out
    from alive r
    group by r.place_id
  ),
  -- Muerte por negativos: el ultimo reporte vivo del grupo acumula 2+ deniers.
  killed as (
    select r.place_id
    from alive r
    join report_votes v on v.report_id = r.id and v.vote = 'deny'
    where not exists (
      select 1 from alive r2
       where r2.place_id = r.place_id
         and r2.product_id = r.product_id
         and r2.created_at > r.created_at
    )
    group by r.place_id
    having count(distinct v.device_hash) >= 2
  ),
  priced as (
    select r.place_id, min(r.price_cup) as price_from
    from alive r
    where r.availability = 'available' and r.price_cup is not null
    group by r.place_id
  )
  select st.sid, st.sname, st.sbarrio,
         coalesce(mp.slug, '') as product_slug,
         coalesce(mp.name, p_query) as product_name,
         st.slat, st.slng, st.dist_m,
     case
       when kg.place_id is not null then 'unknown'
       when sg.last_seen_at is null then 'unknown'
       when sg.ever_out and coalesce(sg.ever_avail, false) = false then 'out'
       when sg.avail_reporters >= 2 or sg.ever_avail then 'confirmed'
       else 'unknown'
     end as status,
     pr.price_from,
     coalesce(sg.avail_reporters, 0) as reporter_count,
     sg.last_seen_at::timestamptz as last_seen_at
  from inradius st
  left join matched_products mp on true
  left join signals sg on sg.place_id = st.sid
  left join priced pr on pr.place_id = st.sid
  left join killed kg on kg.place_id = st.sid
  where
    (p_confirmed_only = false
      or ((sg.avail_reporters >= 2 or sg.ever_avail) and kg.place_id is null))
    and (p_max_price is null or pr.price_from is null or pr.price_from <= p_max_price)
  order by st.dist_m asc;
$$;

-- 5) get_place_availability (pagina de lugar): motor de agregacion v4 --------
-- Ventana de vida (7d + confirm-refresh); la visibilidad
-- deja de ser effective*freshness >= 0.7 (que enterraba solos a las 2h) y pasa
-- a: senal neta viva (>=1) y sin sentencia de muerte (2 deniers).
create or replace function public.get_place_availability(p_place_id uuid)
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
  with alive as (
    select r.*,
           greatest(
             r.created_at,
             coalesce((
               select max(v.created_at) from report_votes v
                where v.report_id = r.id and v.vote = 'confirm'
             ), r.created_at)
           ) as last_signal_at
    from reports r
    where r.place_id = p_place_id
      and (
        r.created_at > now() - interval '7 days'
        or exists (
          select 1 from report_votes v
           where v.report_id = r.id and v.vote = 'confirm'
             and v.created_at > now() - interval '7 days'
        )
      )
  ),
  latest as (
    select distinct on (r.product_id)
           r.id as latest_report_id,
           r.place_id,
           r.product_id,
           r.availability,
           r.queue_level
    from alive r
    order by r.product_id, r.created_at desc
  ),
  agg as (
    select r.place_id, r.product_id,
           count(distinct r.device_hash) as reporters,
           min(r.price_cup) filter (where r.availability = 'available') as price_min,
           max(r.last_signal_at) as group_signal_at
    from alive r
    group by r.place_id, r.product_id
  ),
  votes_on_latest as (
    select v.report_id,
           count(distinct case when v.vote = 'confirm' then v.device_hash end) as confirmers,
           count(distinct case when v.vote = 'deny'    then v.device_hash end) as deniers
    from report_votes v
    join alive r on r.id = v.report_id
    group by v.report_id
  ),
  scored as (
    select l.*,
           a.reporters,
           a.price_min,
           a.group_signal_at,
           greatest(
             a.reporters + coalesce(v.confirmers, 0) - coalesce(v.deniers, 0),
             0
           ) as effective,
           coalesce(v.deniers, 0) as deniers
    from latest l
    join agg a using (place_id, product_id)
    left join votes_on_latest v on v.report_id = l.latest_report_id
  )
  select pl.id, pl.label, pl.barrio, p.slug, p.name, p.emoji,
         sc.availability, sc.price_min, sc.effective,
         sc.group_signal_at::timestamptz as last_seen_at,
         (case
            when sc.group_signal_at > now() - interval '30 minutes' then 1.0
            when sc.group_signal_at > now() - interval '2 hours'    then 0.7
            else 0.4
          end)::numeric as freshness,
         sc.latest_report_id, sc.queue_level
  from scored sc
  join places pl  on pl.id = sc.place_id
  join products p on p.id = sc.product_id
  where sc.effective >= 1
    and sc.deniers < 2
  order by sc.group_signal_at desc;
$$;

grant execute on function public.get_place_availability(uuid)
  to anon, authenticated;
