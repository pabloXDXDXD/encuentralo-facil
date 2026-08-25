import { query } from "./db";

export type Availability = "available" | "out_of_stock";

export type AvailabilityRow = {
  store_id: string;
  store_name: string;
  barrio: string;
  product_slug: string;
  product_name: string;
  emoji: string;
  availability: Availability;
  price_from: number | null;
  reporter_count: number;
  last_seen_at: string | Date;
  freshness: string;
  latest_report_id: string;
  queue_level: number | null;
  lat: number | string | null;
  lng: number | string | null;
  /** hay | ya_no_hay | habia (modelo temporal de 24h) */
  status?: string | null;
};

type RawAvailabilityRow = Omit<AvailabilityRow, "reporter_count"> & {
  reporter_count: string | number;
};

function normalize(rows: RawAvailabilityRow[]): AvailabilityRow[] {
  return rows.map((r) => ({ ...r, reporter_count: Number(r.reporter_count) }));
}

/** Current availability snapshot. null filters -> whole country. */
export async function getAvailability(
  barrio?: string | null,
  province?: string | null,
) {
  const { rows } = await query<RawAvailabilityRow>(
    "select * from public.get_active_availability($1,$2)",
    [barrio ?? null, province ?? null],
  );
  return normalize(rows);
}

export async function getStoreAvailability(storeId: string) {
  const { rows } = await query<RawAvailabilityRow>(
    "select * from public.get_active_availability(null) where store_id = $1",
    [storeId],
  );
  return normalize(rows);
}

export type SubmitReportInput = {
  storeId: string;
  productId: string;
  availability: Availability;
  priceCup?: number | null;
  comment?: string | null;
  deviceHash: string;
  queueLevel?: number | null;
};

export type SubmitReportResult = {
  ok: boolean;
  duplicate?: boolean;
  report_id?: string;
  error?: string;
};

export type SubmitVoteInput = {
  reportId: string;
  vote: "confirm" | "deny";
  deviceHash: string;
};

export type SubmitVoteResult = {
  ok: boolean;
  error?: string;
};

export async function submitVote(input: SubmitVoteInput): Promise<SubmitVoteResult> {
  const { rows } = await query<{ result: SubmitVoteResult }>(
    "select public.submit_vote($1,$2,$3) as result",
    [input.reportId, input.vote, input.deviceHash],
  );
  return rows[0].result;
}

export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  const { rows } = await query<{ result: SubmitReportResult }>(
    "select public.submit_report($1,$2,$3,$4,$5,$6,$7) as result",
    [
      input.storeId,
      input.productId,
      input.availability,
      input.priceCup ?? null,
      input.comment ?? null,
      input.deviceHash,
      input.queueLevel ?? null,
    ],
  );
  return rows[0].result;
}

export type StoreSummary = {
  id: string;
  name: string;
  barrio: string;
  kind: string;
  lat: number | null;
  lng: number | null;
};

export async function searchStores(q?: string | null, barrio?: string | null) {
  const { rows } = await query<StoreSummary>(
    `select id, name, barrio, kind, lat::float8 as lat, lng::float8 as lng
       from public.stores
      where status = 'active'
        and ($1::text is null or barrio = $1)
        and ($2::text is null or name ilike '%' || $2 || '%')
      order by barrio, name
      limit 300`,
    [barrio ?? null, q ?? null],
  );
  return rows;
}

export async function createStore(
  name: string,
  barrio: string,
  kind: string,
  lat?: number | null,
  lng?: number | null,
) {
  const { rows } = await query<{
    result: { ok: boolean; error?: string; existing?: boolean; store_id?: string };
  }>("select public.create_pending_store($1,$2,$3,$4,$5) as result", [
    name,
    barrio,
    kind,
    lat ?? null,
    lng ?? null,
  ]);
  return rows[0].result;
}

/**
 * Community-suggested store: direct ACTIVE insert (user-approved decision,
 * no moderation queue). Caller is responsible for the proximity duplicate
 * check (findSimilarActiveStore) before invoking this.
 */
export async function insertActiveStore(
  name: string,
  barrio: string,
  kind: string,
  lat?: number | null,
  lng?: number | null,
): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    `insert into public.stores (name, barrio, kind, lat, lng, status, source)
     values ($1, $2, $3, $4, $5, 'active', 'community')
     returning id`,
    [name, barrio, kind, lat ?? null, lng ?? null],
  );
  return rows[0];
}

/** Anti-duplicate radius for community store suggestions, in meters. */
const SIMILAR_STORE_RADIUS_M = 50;

/**
 * Nearest ACTIVE store within `radiusM` meters whose name overlaps the given
 * one (case-insensitive containment either way). Requires coords; without
 * them there is no proximity signal and nothing matches.
 */
export async function findSimilarActiveStore(
  name: string,
  lat: number | null,
  lng: number | null,
  radiusM: number = SIMILAR_STORE_RADIUS_M,
): Promise<{ id: string; name: string } | null> {
  if (lat === null || lng === null) return null;
  const { rows } = await query<{ id: string; name: string }>(
    `select id, name
       from public.stores
      where status = 'active'
        and lat is not null and lng is not null
        and (
          6371000 * 2 * asin(sqrt(
            power(sin(radians(lat - $2) / 2), 2) +
            cos(radians($2)) * cos(radians(lat)) *
            power(sin(radians(lng - $3) / 2), 2)
          ))
        ) <= $4
        and (position(lower($1) in lower(name)) > 0
             or position(lower(name) in lower($1)) > 0)
      order by created_at desc
      limit 1`,
    [name, lat, lng, radiusM],
  );
  return rows[0] ?? null;
}

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
};

export type CatalogCategory = {
  id: string;
  name: string;
  emoji: string;
  products: CatalogProduct[];
};

export async function getCatalog(): Promise<CatalogCategory[]> {
  const { rows } = await query<{
    cat_id: string;
    cat_name: string;
    cat_emoji: string;
    sort_order: number;
    id: string;
    slug: string;
    name: string;
    emoji: string;
  }>(
    `select c.id as cat_id, c.name as cat_name, c.emoji as cat_emoji, c.sort_order,
            p.id, p.slug, p.name, p.emoji
       from public.product_categories c
       join public.products p on p.category_id = c.id and p.active = true
      order by c.sort_order, p.name`,
  );

  const categories: CatalogCategory[] = [];
  for (const r of rows) {
    let cat = categories.find((c) => c.id === r.cat_id);
    if (!cat) {
      cat = { id: r.cat_id, name: r.cat_name, emoji: r.cat_emoji, products: [] };
      categories.push(cat);
    }
    cat.products.push({ id: r.id, slug: r.slug, name: r.name, emoji: r.emoji });
  }
  return categories;
}

export async function listBarrios(province?: string | null): Promise<string[]> {
  const { rows } = await query<{ barrio: string }>(
    `select distinct barrio from public.stores
      where status = 'active' and ($1::text is null or province = $1)
      order by barrio`,
    [province ?? null],
  );
  return rows.map((r) => r.barrio);
}

export async function listProvinces(): Promise<string[]> {
  const { rows } = await query<{ province: string }>(
    `select distinct province from public.stores where status = 'active' order by province`,
  );
  return rows.map((r) => r.province);
}

export async function listProductSlugs(): Promise<string[]> {
  const { rows } = await query<{ slug: string }>(
    `select slug from public.products where active = true order by slug`,
  );
  return rows.map((r) => r.slug);
}

export async function getProductBySlug(slug: string) {
  const { rows } = await query<{
    id: string;
    slug: string;
    name: string;
    emoji: string;
  }>(
    `select id, slug, name, emoji from public.products where slug = $1 and active = true`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function getStoreById(id: string) {
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!valid) return null;
  const { rows } = await query<{
    id: string;
    name: string;
    barrio: string;
    kind: string;
  }>(`select id, name, barrio, kind from public.stores where id = $1 and status = 'active'`, [
    id,
  ]);
  return rows[0] ?? null;
}

/** Window (hours) under which a fresh report is considered a duplicate. */
export const RECENT_REPORT_HOURS = 2;

export type LatestReportInfo = {
  found: boolean;
  hoursAgo: number | null;
  reportId: string | null;
};

/**
 * Most recent report for store+product. `found` is true only when it falls
 * inside the RECENT_REPORT_HOURS window (anti-duplicate on the confirm step).
 */
export async function getLatestRecentReport(
  storeId: string,
  productId: string,
): Promise<LatestReportInfo> {
  const { rows } = await query<{ id: string; created_at: string | Date }>(
    `select id, created_at
       from public.reports
      where store_id = $1 and product_id = $2
      order by created_at desc
      limit 1`,
    [storeId, productId],
  );
  if (rows.length === 0) return { found: false, hoursAgo: null, reportId: null };
  const ageHours = (Date.now() - new Date(rows[0].created_at).getTime()) / 3_600_000;
  return {
    found: ageHours <= RECENT_REPORT_HOURS,
    hoursAgo: Math.round(ageHours * 10) / 10,
    reportId: rows[0].id,
  };
}
