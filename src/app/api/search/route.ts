import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Busqueda place-first sobre search_place_availability. Envelope y params
 * identicos al contrato anterior; las filas conservan los nombres legados
 * (store_id/store_name llevando valores de lugar, D5) para que bundles
 * PWA viejos sigan renderizando.
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
    const rows = await searchPlaces(
      q,
      lat,
      lng,
      radius,
      Number.isFinite(maxPriceRaw) && maxPriceRaw > 0 ? Math.round(maxPriceRaw) : null,
      confirmedOnly,
    );
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    // 503 al cliente, pero el error real queda en el log del servidor:
    // sin esto un fallo transitorio de la BD dev es indiagnosticable.
    console.error("[api/search] search failed:", err);
    return NextResponse.json({ ok: false, error: "unavailable", rows: [] }, { status: 503 });
  }
}
