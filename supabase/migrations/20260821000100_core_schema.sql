-- Core schema for DóndeHay v1
-- Append-only events + canonical catalogs. See docs/specs/2026-08-21-dondehay-core-design.md

create table if not exists public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  emoji       text not null,
  sort_order  int  not null default 0
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  emoji        text not null,
  category_id  uuid not null references public.product_categories(id),
  active       boolean not null default true
);

create table if not exists public.stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 80),
  barrio     text not null,
  city       text not null default 'La Habana',
  lat        numeric(9,6),
  lng        numeric(9,6),
  kind       text not null default 'other'
             check (kind in ('state_market','private_market','mipyme','other')),
  status     text not null default 'active'
             check (status in ('active','pending_review')),
  source     text not null default 'seed'
             check (source in ('seed','community')),
  created_at timestamptz not null default now()
);

-- Raw immutable events. Never updated, never deleted, never merged.
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id),
  product_id   uuid not null references public.products(id),
  device_hash  text not null,
  availability text not null check (availability in ('available','out_of_stock')),
  price_cup    integer check (price_cup is null or price_cup between 0 and 1000000),
  comment      text check (comment is null or char_length(comment) <= 200),
  created_at   timestamptz not null default now()
);

create index if not exists idx_reports_store_product_time
  on public.reports (store_id, product_id, created_at desc);
create index if not exists idx_reports_device_time
  on public.reports (device_hash, created_at desc);
create index if not exists idx_stores_barrio on public.stores (barrio);
create index if not exists idx_products_category on public.products (category_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (production posture; local owner connections bypass it)
-- ---------------------------------------------------------------------------
alter table public.product_categories enable row level security;
alter table public.products           enable row level security;
alter table public.stores             enable row level security;
alter table public.reports            enable row level security;

drop policy if exists categories_read on public.product_categories;
create policy categories_read on public.product_categories
  for select using (true);

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select using (active = true);

drop policy if exists stores_read on public.stores;
create policy stores_read on public.stores
  for select using (status = 'active');

-- reports: intentionally NO policies. Anon/authenticated cannot read or write
-- raw rows; every path goes through SECURITY DEFINER functions below.
