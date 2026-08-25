-- ---------------------------------------------------------------------------
-- Constraints + place-keyed RPCs (lugares-mapfirst, PR2).
-- Segundo archivo del despliegue en dos partes: aqui si se cierra el
-- invariant. Las RPCs legadas (submit_report/search_availability/
-- get_active_availability) NO se tocan (D4, superficie de rollback).
--
-- Constante de la casa: RADIO DE ADHERENCIA = 40 metros (great-circle acos,
-- sin PostGIS), documentada en la cabecera de places_model.sql y aplicada
-- solo aqui.
--
-- Convivencia legada: con place_id NOT NULL, un insert de la ruta vieja
-- (que nunca escribe place_id) sobrevive gracias al trigger de la seccion
-- 3: hereda place_id = store_id (valido por D3: los lugares destilados
-- heredan el uuid de la tienda). Limitacion aceptada: una tienda creada
-- DESPUES de esta migracion no tiene lugar destilado -> la ruta legada
-- contra ella falla por FK; lo correcto, porque lo nuevo es place-first.
-- ---------------------------------------------------------------------------

-- 1) Backfill de alcance: tiendas creadas entre PR1 y ahora -----------------
-- Mismo predicado con matiz OR-exists de PR1: toda tienda activa o con
-- reportes se destila si aun no existe como lugar (re-ejecutable).
insert into public.places (id, label, barrio, municipio, lat, lng)
select s.id,
       coalesce(nullif(btrim(s.name), ''), 'Punto en ' || btrim(s.barrio)),
       s.barrio,
       s.city,
       s.lat::float8,
       s.lng::float8
from public.stores s
where s.status = 'active'
   or exists (select 1 from public.reports r where r.store_id = s.id)
on conflict (id) do nothing;

update public.reports r
set place_id = r.store_id
where r.place_id is null;

-- 2) Invariante: cero reportes sin lugar, ANTES de cerrar el NOT NULL -------
do $$
declare
  v_missing bigint;
begin
  select count(*) into v_missing from public.reports where place_id is null;
  if v_missing > 0 then
    raise exception 'invariant violated: % reports without place_id after backfill', v_missing;
  end if;
end
$$;

alter table public.reports alter column place_id set not null;

-- store_id deja de ser obligatorio: el flujo nuevo nunca lo escribe (D7).
alter table public.reports alter column store_id drop not null;

comment on column public.reports.store_id is
  'DEPRECATED: usar place_id. Se conserva para los reportes historicos y la ruta legada; el flujo nuevo nunca lo escribe.';

-- 3) Shim de convivencia para la ruta legada (D4) ----------------------------
-- La RPC legada queda intacta byte a byte; el anclaje ocurre a nivel de
-- tabla: un insert sin place_id pero con store_id lo hereda (D3). Si no hay
-- ninguno de los dos, el NOT NULL de place_id dispara el error esperado.
create or replace function public.tg_reports_fill_place()
returns trigger
language plpgsql
as $$
begin
  if new.place_id is null and new.store_id is not null then
    new.place_id := new.store_id;
  end if;
  return new;
end
$$;

drop trigger if exists trg_reports_fill_place on public.reports;
create trigger trg_reports_fill_place
  before insert on public.reports
  for each row execute function public.tg_reports_fill_place();

-- 4) Escritura place-first ----------------------------------------------------
-- Veredictos intactos: {ok,report_id} | {ok,duplicate:true} | {ok:false,error}.
-- El guard de duplicados (device+lugar+producto / 30 min) vive DENTRO de la
-- RPC: la ruta nueva ya no delega esa contabilidad al API.
create or replace function public.submit_place_report(
  p_product_id   uuid,
  p_device_hash  text,
  p_availability text,
  p_place_id     uuid     default null,
  p_lat          float8   default null,
  p_lng          float8   default null,
  p_label        text     default null,
  p_price_cup    integer  default null,
  p_comment      text     default null,
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
  v_place_id  uuid;
begin
  if p_device_hash is null or char_length(btrim(p_device_hash)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_device');
  end if;

  if p_availability not in ('available','out_of_stock') then
    return jsonb_build_object('ok', false, 'error', 'invalid_availability');
  end if;

  -- La cola solo aplica reclamando stock (paridad con submit_report).
  if p_queue_level is not null then
    if p_queue_level not between 1 and 3 then
      return jsonb_build_object('ok', false, 'error', 'invalid_queue');
    end if;
    if p_availability <> 'available' then
      p_queue_level := null;
    end if;
  end if;

  if not exists (select 1 from products where id = p_product_id and active = true) then
    return jsonb_build_object('ok', false, 'error', 'unknown_product');
  end if;

  -- Contrato de ubicacion: lugar existente O pin completo.
  if p_place_id is null and (p_lat is null or p_lng is null) then
    return jsonb_build_object('ok', false, 'error', 'missing_location');
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

  -- D2: el advisory lock se toma ANTES de resolver el lugar mas cercano,
  -- asi el par resolver-o-crear es atomico y no nacen lugares gemelos.
  perform pg_advisory_xact_lock(hashtext('place-create'));

  if p_place_id is not null then
    select id into v_place_id
    from places
    where id = p_place_id and active = true;
    if v_place_id is null then
      return jsonb_build_object('ok', false, 'error', 'unknown_place');
    end if;
  else
    -- Lugar activo mas cercano dentro del radio de adherencia (40 m).
    select near.id into v_place_id
    from (
      select pl.id,
             (6371000 * acos(least(1, greatest(-1,
               cos(radians(p_lat)) * cos(radians(pl.lat)) * cos(radians(pl.lng) - radians(p_lng))
               + sin(radians(p_lat)) * sin(radians(pl.lat))
             )))) as dist_m
      from places pl
      where pl.active
        and pl.lat is not null and pl.lng is not null
    ) near
    where near.dist_m <= 40
    order by near.dist_m asc
    limit 1;

    if v_place_id is null then
      -- Lugar nuevo en el pin. Sin geocodificacion inversa el barrio es
      -- desconocido: la forma generada cae en su rama 'la zona'.
      insert into places (label, barrio, municipio, lat, lng)
      values (
        coalesce(nullif(btrim(coalesce(p_label, '')), ''), 'Punto en la zona'),
        null,
        null,
        p_lat,
        p_lng
      )
      returning id into v_place_id;
    end if;
  end if;

  -- Duplicado exacto device+lugar+producto en 30 min: exito silencioso
  -- para que el outbox del cliente pueda vaciarse.
  if exists (
    select 1 from reports
    where device_hash = p_device_hash
      and place_id  = v_place_id
      and product_id = p_product_id
      and created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  -- El reporte guarda el pin PROPIO del reportero, aunque se adhiera a un
  -- lugar cercano (D7).
  insert into reports (place_id, product_id, device_hash, availability, price_cup, comment, queue_level, lat, lng)
  values (v_place_id, p_product_id, p_device_hash, p_availability, p_price_cup,
          nullif(btrim(coalesce(p_comment,'')), ''), p_queue_level, p_lat, p_lng)
  returning id into v_report_id;

  return jsonb_build_object('ok', true, 'report_id', v_report_id);
end;
$$;

-- 5) Lectura place-first: mismo modelo de estados que search_availability ----
-- Formato legado intacto (D5): store_id/store_name llevan valores de lugar.
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
  signals as (
    select r.place_id,
           max(r.created_at) as last_seen_at,
           count(distinct r.device_hash) filter (
             where r.availability = 'available') as avail_reporters,
           bool_or(r.availability = 'available') as ever_avail,
           bool_or(r.availability = 'out_of_stock') as ever_out
    from reports r
    where r.product_id in (select id from matched_products)
      and r.created_at > now() - interval '24 hours'
      and r.place_id in (select sid from inradius)
    group by r.place_id
  ),
  stale_signals as (
    select r.place_id,
           max(r.created_at) as last_seen_at,
           count(distinct r.device_hash) as reporters
    from reports r
    where r.product_id in (select id from matched_products)
      and r.created_at <= now() - interval '24 hours'
      and r.created_at > now() - interval '7 days'
      and r.place_id in (select sid from inradius)
    group by r.place_id
  ),
  priced as (
    select r.place_id, min(r.price_cup) as price_from
    from reports r
    where r.product_id in (select id from matched_products)
      and r.availability = 'available'
      and r.price_cup is not null
      and r.created_at > now() - interval '24 hours'
      and r.place_id in (select sid from inradius)
    group by r.place_id
  ),
  stale_priced as (
    select r.place_id, min(r.price_cup) as price_from
    from reports r
    where r.product_id in (select id from matched_products)
      and r.availability = 'available'
      and r.price_cup is not null
      and r.created_at <= now() - interval '24 hours'
      and r.created_at > now() - interval '7 days'
      and r.place_id in (select sid from inradius)
    group by r.place_id
  )
  select st.sid, st.sname, st.sbarrio,
         coalesce(mp.slug, '') as product_slug,
         coalesce(mp.name, p_query) as product_name,
         st.slat, st.slng, st.dist_m,
     case
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
  left join signals sg on sg.place_id = st.sid
  left join stale_signals stl on stl.place_id = st.sid
  left join priced pr on pr.place_id = st.sid
  left join stale_priced spr on spr.place_id = st.sid
  where
    (p_confirmed_only = false or ((sg.avail_reporters >= 2 or sg.ever_avail)))
    and (p_max_price is null or coalesce(pr.price_from, spr.price_from) is null
         or coalesce(pr.price_from, spr.price_from) <= p_max_price)
  order by st.dist_m asc;
$$;

-- 6) Lectura de una pagina de lugar ------------------------------------------
-- Motor de agregacion v3 (score efectivo con votos) anclado a UN lugar.
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
  with recent as (
    select r.*
    from reports r
    where r.created_at > now() - interval '6 hours'
  ),
  latest as (
    select distinct on (r.place_id, r.product_id)
           r.id as latest_report_id,
           r.place_id,
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
    order by r.place_id, r.product_id, r.created_at desc
  ),
  agg as (
    select r.place_id, r.product_id,
           count(distinct r.device_hash) as reporters,
           min(r.price_cup) filter (where r.availability = 'available') as price_min
    from recent r
    group by r.place_id, r.product_id
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
    join agg a using (place_id, product_id)
    left join votes_on_latest v on v.report_id = l.latest_report_id
  )
  select pl.id, pl.label, pl.barrio, p.slug, p.name, p.emoji,
         sc.availability, sc.price_min, sc.effective,
         sc.last_seen_at, sc.freshness, sc.latest_report_id, sc.queue_level
  from scored sc
  join places pl  on pl.id = sc.place_id
  join products p on p.id = sc.product_id
  where sc.place_id = p_place_id
    and sc.effective * sc.freshness >= 0.7
  order by sc.freshness desc, sc.last_seen_at desc;
$$;

grant execute on function public.submit_place_report(uuid, text, text, uuid, float8, float8, text, integer, text, smallint)
  to anon, authenticated;
grant execute on function public.search_place_availability(text, double precision, double precision, integer, integer, boolean)
  to anon, authenticated;
grant execute on function public.get_place_availability(uuid)
  to anon, authenticated;
