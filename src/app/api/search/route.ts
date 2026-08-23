import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Product-centric search anchored on the user's position.
 * GET /api/search?q=pollo&lat=23.12&lng=-82.38&radius=3000&maxPrice=&confirmedOnly=0
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 60);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radius = Math.min(20_000, Math.max(200, Number(searchParams.get("radius")) || 5_000));
  const maxPriceRaw = Number(searchParams.get("maxPrice"));
  const confirmedOnly = searchParams.get("confirmedOnly") === "1";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: "invalid_coords", rows: [] }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `select * from public.search_availability($1,$2::float8,$3::float8,$4::int,$5::int,$6::bool)`,
      [
        q,
        lat,
        lng,
        radius,
        Number.isFinite(maxPriceRaw) && maxPriceRaw > 0 ? Math.round(maxPriceRaw) : null,
        confirmedOnly,
      ],
    );
    return NextResponse.json({ ok: true, rows });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable", rows: [] }, { status: 503 });
  }
}
