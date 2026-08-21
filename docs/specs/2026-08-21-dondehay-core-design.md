# DóndeHay — Core Architecture Design

- **Date:** 2026-08-21
- **Status:** Approved design, pending implementation
- **Repo:** `encuentralo-facil` (working title "DóndeHay", final name TBD)
- **Source document:** `Idea-inicial.txt` (product research and definition)

## 1. Problem

In Cuba there is no reliable, centralized source for "where can I find product X today". Informal Telegram channels cover the need but are fragmented, unsearchable, and not geolocated. This project is a crowdsourced product-availability platform: users report what is available in which store and at what price; an aggregation engine turns raw reports into a clean, fresh, spam-resistant view.

## 2. Context constraints (non-negotiable)

| Constraint | Consequence |
|---|---|
| ~3.8 Mbps average bandwidth, frequent outages | Ultra-light payload budget, offline-first read path |
| Play Store unavailable (embargo) | Distribution via URL → PWA |
| Low-end Android dominant | ≤100KB gz initial JS, no images, system fonts |
| Supabase free tier | No Realtime (polling instead), keep-alive cron, text-only data |
| Cold start | Curated seed catalog + seeded Havana stores |

## 3. Decisions log

1. **Platform: PWA only** (v1). Installable on Android via browser, offline via Service Worker. APK wrapper (TWA) possible later without rewrites.
2. **Identity: anonymous by device.** Client-generated UUID sent in a header; server stores only SHA-256 hash + salt. Accounts/reputation deferred to phase 2.
3. **Stack: Next.js (App Router) + Supabase (Postgres) on Vercel free tier.** Chosen over static SPA (SEO loss) and Astro (ecosystem unfamiliarity).
4. **List-first UI.** No map tiles in v1 (tiles are a hidden bandwidth killer). Map is a future enhancement.
5. **Text-only MVP.** No photos. Emoji/SVG icons only.
6. **Aggregation logic lives in Postgres RPCs**, not application code.
7. **Reports are append-only immutable events.** Current state is always computed at query time.

## 4. Non-goals (v1)

Accounts, reputation/points, confirm/deny votes, queue-level reports, photos, map view, business portal (MIPYME Pro), push alerts, diaspora payments, delta-cursor polling optimization, multi-city seed data (schema supports it).

## 5. Architecture

```
[ PWA Next.js on Vercel ] --ISR static--> Google / WhatsApp previews (SEO)
        |
        |-- Route Handlers /api/* --> Supabase Postgres RPCs (aggregation)
        |
        '-- Service Worker + IndexedDB --> offline report outbox + last payload cache

[ Supabase ] Postgres + RLS | Auth (phase 2) | Storage (photos phase 2)
[ GitHub Actions ] cron every 6h -> keep-alive ping (prevents free-tier pause)
```

Principle: intelligence lives in Postgres; Next.js is a thin rendering shell serving compact JSON. The same engine can later serve an APK wrapper or any other client unchanged.

## 6. Data model

```sql
product_categories (
  id          uuid pk default gen_random_uuid(),
  name        text not null,
  emoji       text not null,
  sort_order  int  not null default 0
)

products (
  id           uuid pk default gen_random_uuid(),
  slug         text unique not null,      -- 'pollo', 'aceite'
  name         text not null,
  emoji        text not null,
  category_id  uuid fk -> product_categories,
  active       boolean not null default true
)

stores (
  id         uuid pk default gen_random_uuid(),
  name       text not null,
  barrio     text not null,               -- neighborhood, indexed
  city       text not null default 'La Habana',
  lat        numeric(9,6),                -- nullable, future map
  lng        numeric(9,6),
  kind       text check in ('state_market','private_market','mipyme','other'),
  status     text not null default 'active' check in ('active','pending_review'),
  source     text not null default 'seed' check in ('seed','community'),
  created_at timestamptz not null default now()
)

reports (                                  -- append-only events, never edited or merged
  id           uuid pk default gen_random_uuid(),
  store_id     uuid fk -> stores,
  product_id   uuid fk -> products,
  device_hash  text not null,             -- sha256(device_uuid + server salt)
  availability text not null check in ('available','out_of_stock'),
  price_cup    integer,                   -- nullable, optional
  comment      text,                      -- nullable, max 200 chars
  created_at   timestamptz not null default now()
)
```

Indexes:
- `reports (store_id, product_id, created_at desc)` — aggregation window scans
- `reports (device_hash, created_at desc)` — rate-limit checks
- `products (slug)` unique; `stores (barrio)`

RLS:
- `SELECT` open on `products`, `product_categories`, `stores` (status = 'active').
- Direct `INSERT`/`SELECT` on `reports` denied to anon. All writes go through `submit_report()` (SECURITY DEFINER); reads go through aggregation RPCs.

Seed script (idempotent, in repo): ~50 canonical basket products across categories (pollo, huevos, leche, arroz, aceite, café, detergente…) and ~80 Havana stores (mix of state markets, private markets, MIPYMES). Cold-start requirement: first user must see populated data.

## 7. Aggregation engine (the moat)

Single RPC `get_active_availability(p_barrio text default null)`:

```
For each (store_id, product_id) with reports in the last WINDOW_HOURS = 6:
  distinct_devices = count(distinct device_hash)          -- multiplicity anti-spam
  age              = now() - latest.created_at
  freshness        = 1.0 if age < 30 min
                     0.7 if age < 2 h
                     0.4 if age < 6 h
                     hidden otherwise
  score            = distinct_devices * freshness
  visible          = score >= 0.7                          -- one fresh solo report OR 2+ reporters within 6h
  price_from       = min(price_cup) within window
```

Row returned (~200 bytes):
`{ store_id, store_name, barrio, product_slug, product_name, emoji, availability, price_from, reporter_count, last_seen_at }`

All constants (`WINDOW_HOURS`, freshness thresholds, visibility threshold) defined once in the SQL function, tunable without client deploys.

Anti-spam rules enforced server-side in `submit_report(p_store_id, p_product_id, p_availability, p_price_cup, p_comment)`:

- Max `10` accepted reports per `device_hash` per rolling 24h.
- Min `60s` between accepted reports from the same `device_hash`.
- Exact-duplicate guard: same `(device_hash, store_id, product_id)` within the last 30 min is silently discarded (client treats as success).
- Violations return typed error codes so the UI stays silent where silence is correct.

Deferred simplification: the previously discussed delta-cursor endpoint is postponed. At v1 scale the full snapshot is a few KB; re-polling it every 60 s is cheaper than maintaining cursor logic. Revisit when payload size justifies it.

## 8. API surface (Next.js Route Handlers)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/availability?barrio=` | GET | Calls `get_active_availability`; returns compact snapshot |
| `/api/reports` | POST | Hashes device UUID, calls `submit_report`; maps DB error codes to HTTP |
| `/api/stores?barrio=&q=` | GET | Store search for the report flow (GPS-sorted when coords provided) |
| `/api/stores` | POST | Community store creation → `status='pending_review'` |

Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DEVICE_HASH_SALT` (server-only secret).

## 9. Pages and rendering strategy

| Route | Rendering | Purpose |
|---|---|---|
| `/` | ISR ~60s | Active list near user (default La Habana + barrio selector) |
| `/barrio/[slug]` | ISR | SEO: what's available in a neighborhood |
| `/producto/[slug]` | ISR | SEO: where to find a product |
| `/tienda/[id]` | ISR | Store detail with fresh history |
| `/reportar` | Client-only | 3-tap report flow |
| `/como-funciona` | Static | Trust page + rules |

Freshness layering: public pages serve instantly from ISR; the client polls `/api/availability` every 60 s while the tab is visible and updates the list in place. Per-page OG metadata generated from live data (WhatsApp share previews are the viral channel).

Budget discipline: ≤100KB gz initial JS, zero raster images, system font stack, Tailwind (purged output ≈10KB), emoji as icon system.

## 10. Report flow and offline behavior

Flow (3 taps):

```
Product (emoji grid by category, searchable)
  -> Store (GPS suggests nearest if permission granted;
            missing store -> inline creation, status 'pending_review')
  -> Confirm (Hay / No hay · optional price · optional comment)
```

Offline-first write path — IndexedDB outbox:

- Every report enters the local outbox first with state machine `pending -> syncing -> done | discarded`.
- Online: POST fires immediately; success removes from outbox.
- Offline: entry persists; Service Worker background sync (or next-load flush) retries automatically. The user is never blocked.
- Persistent chip while pending: "1 reporte pendiente de enviar".
- Server-side discard (rate limit / duplicate) resolves silently as `discarded`.

Offline-first read path:

- Every successful availability fetch is cached (IndexedDB).
- With no network, the SW serves the cached shell and the app renders the last payload with banner "actualizado hace X min"; >24h stale adds a warning tint.

Service Worker: hand-rolled (~100 lines), no Workbox. Precaches app shell; network-first with cache fallback for `GET /api/*`.

Device identity: UUID generated on first visit, stored in localStorage, sent as `X-Device-Id`. Server hashes with salt before persistence. Rate limits are enforced server-side only — the client is hostile territory.

GPS denied → manual barrio picker. Never a dead end.

## 11. Error handling principles

- Degrade, never block: no connectivity → cached read + queued writes; GPS denied → manual selection; Supabase down → honest banner.
- Timestamps always server-generated. Client clocks do not exist.
- Silent successes for idempotent duplicates; visible errors only when user action can fix them.
- Prices are advisory data: lenient parsing, nullable column, no aggressive validation.

## 12. Testing strategy (proportional)

1. **SQL integration tests (highest value):** against local Supabase CLI with seeded fixtures — grouping correctness, window boundaries (29min vs 31min vs 2h vs 6h), multi-reporter visibility thresholds, rate-limit rejections.
2. **Vitest units:** pure TS utilities only (price parsing, device-id handling, outbox state transitions).
3. **Playwright smoke (3 cases):** happy-path online report; offline queue flushes after reconnect; anonymous browsing works with no login.

## 13. Deployment and ops

- Vercel free (web) + Supabase free (DB) + GitHub Actions cron keep-alive ping every 6h.
- Migrations tracked as SQL files in repo, applied via Supabase CLI.
- Success metric for v1 (from source doc): people use it to find products; target 1,000 WAU once launched in Havana communities.

## 14. Implementation milestones

1. **M1 — Data core:** migrations (tables, indexes, RLS), `get_active_availability`, `submit_report`, seed script.
2. **M2 — API + online report flow:** route handlers, `/reportar` 3-tap flow, home list consuming RPC.
3. **M3 — PWA offline:** hand-rolled SW, IndexedDB outbox + payload cache, pending chip, offline banners.
4. **M4 — SEO surface:** ISR pages per barrio/product/store, OG metadata, sitemap.
5. **M5 — Hardening:** Playwright smokes, keep-alive cron, deploy to Vercel, verify budget ≤100KB gz.

## 15. Open questions (non-blocking)

- Final product name/brand ("DóndeHay" vs "Encuéntralo Fácil") and domain.
- Moderation workflow for community-created stores beyond `pending_review` flag (manual review acceptable for v1).
- Price display convention (min vs median) once real price volume exists — v1 ships `min`.
