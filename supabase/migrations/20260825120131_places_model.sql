-- ---------------------------------------------------------------------------
-- Modelo de lugares (lugares-mapfirst, PR1).
-- Los reportes pasan a anclarse a `places` generados por el sistema: nunca
-- hay UI de registro manual; un lugar nace del clustering de reportes o de
-- la destilacion de tiendas hecha aqui.
--
-- Constante de la casa: RADIO DE ADHERENCIA = 40 metros (great-circle acos,
-- sin PostGIS). Vive aqui porque las constantes viven en las migraciones y
-- solo aqui; la RPC que lo aplica llega en el siguiente archivo.
--
-- Despliegue en dos archivos (constraint de despliegue): las RPC legadas
-- (submit_report) siguen vivas entre merges, asi que aqui place_id es
-- NULLABLE y store_id conserva su NOT NULL. El SET NOT NULL de place_id,
-- el drop del NOT NULL de store_id y el invariant check llegan con el
-- archivo de constraints (PR2).
-- ---------------------------------------------------------------------------

-- 1) Catalogo de lugares ----------------------------------------------------
create table if not exists public.places (
  id         uuid primary key default gen_random_uuid(),
  label      text,
  barrio     text,
  municipio  text,
  lat        float8,
  lng        float8,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Escaneo de proximidad acotado al vecindario del pin (solo activos).
create index if not exists idx_places_active_lat_lng
  on public.places (lat, lng) where active = true;

alter table public.places enable row level security;

drop policy if exists places_read on public.places;
create policy places_read on public.places
  for select using (active = true);

-- 2) Anclaje de reportes a lugares ------------------------------------------
-- Pin propio del reportero: donde estaba parado al reportar, aunque el
-- reporte se adhiera a un lugar cercano. Ambos NULLABLE hasta PR2.
alter table public.reports
  add column if not exists place_id uuid references public.places(id);
alter table public.reports
  add column if not exists lat float8;
alter table public.reports
  add column if not exists lng float8;

-- 3) Destilacion: cada tienda activa se vuelve lugar semilla ----------------
-- D3: el lugar HEREDA el uuid de la tienda -> /tienda/:id redirige a
-- /lugar/:id sin tabla de mapeo y los outbox viejos siguen validos.
-- Precedencia de label: nombre de tienda > 'Punto en <barrio>'.
-- Nota: tambien se destila cualquier tienda NO activa que conserve
-- reportes historicos; si no, el backfill violaria la FK y el escenario
-- de cero perdidas del spec seria imposible.
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

-- 4) Backfill: los reportes existentes se re-anclan a su lugar destilado ----
update public.reports r
set place_id = r.store_id
where r.place_id is null;

comment on table public.stores is
  'DEPRECATED: usar places. Las tiendas activas fueron destiladas como lugares semilla (uuid heredado); la app ya no crea tiendas nuevas. Datos y RPCs legados se conservan como superficie de rollback.';
