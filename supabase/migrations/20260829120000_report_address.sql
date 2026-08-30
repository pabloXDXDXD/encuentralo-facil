-- ---------------------------------------------------------------------------
-- Nombre + direccion opcionales en el reporte de producto.
-- El usuario pide espacio para nombre (opcional) y direccion tras marcar el
-- pin; ambos describen el LUGAR, asi que se persisten en places (no en el
-- reporte): con lugar existente se actualizan si llegan; con pin manual
-- bautizan al lugar creado en el servidor. La cola y el comentario dejan de
-- pedirse en el flujo nuevo, pero columna/parametros no se tocan (rollback).
--
-- Firma con 11 args: se droppe la de 10 para que las llamadas posicionales
-- resolucionen contra la unica version con p_address.
-- ---------------------------------------------------------------------------

-- 1) Columna address en places ----------------------------------------------
alter table public.places
  add column if not exists address text;

comment on column public.places.address is
  'Direccion libre del lugar (opcional): "Calle X #Y entre A y B".';

-- 2) submit_place_report con p_address ---------------------------------------
drop function if exists public.submit_place_report(uuid, text, text, uuid, float8, float8, text, integer, text, smallint);

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
  p_queue_level  smallint default null,
  p_address      text     default null
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

    -- Nombre/direccion opcionales: solo se actualizan si el usuario los trae.
    update places
       set label   = coalesce(nullif(btrim(coalesce(p_label, '')), ''), label),
           address = coalesce(nullif(btrim(coalesce(p_address, '')), ''), address)
     where id = v_place_id;
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
      insert into places (label, barrio, municipio, lat, lng, address)
      values (
        coalesce(nullif(btrim(coalesce(p_label, '')), ''), 'Punto en la zona'),
        null,
        null,
        p_lat,
        p_lng,
        nullif(btrim(coalesce(p_address, '')), '')
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

grant execute on function public.submit_place_report(uuid, text, text, uuid, float8, float8, text, integer, text, smallint, text)
  to anon, authenticated;