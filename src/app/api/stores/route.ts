import { NextResponse } from "next/server";
import { findSimilarActiveStore, insertActiveStore, searchStores } from "@/lib/repo";

export const dynamic = "force-dynamic";

const KINDS = new Set(["state_market", "private_market", "mipyme", "other"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const rows = await searchStores(
      searchParams.get("q"),
      searchParams.get("barrio"),
    );
    return NextResponse.json({ ok: true, stores: rows });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable", stores: [] }, { status: 503 });
  }
}

export async function POST(req: Request) {
  let body: { name?: unknown; barrio?: unknown; kind?: unknown; lat?: unknown; lng?: unknown; force?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const barrio = typeof body.barrio === "string" ? body.barrio.trim().slice(0, 60) : "";
  if (name.length < 2 || barrio.length < 2) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const kind =
    typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : "other";
  const force = body.force === true;

  const parseCoord = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
  };
  const lat = parseCoord(body.lat);
  const lng = parseCoord(body.lng);

  // Proximity anti-duplicate: an ACTIVE store within 50m with a similar name
  // is surfaced to the user instead of silently creating a twin. `force`
  // confirms it really is a different point.
  if (!force) {
    try {
      const similar = await findSimilarActiveStore(name, lat, lng);
      if (similar) {
        return NextResponse.json({
          ok: false,
          error: "possible_duplicate",
          storeId: similar.id,
          storeName: similar.name,
        });
      }
    } catch {
      /* check unavailable -> fall through to creation */
    }
  }

  try {
    const created = await insertActiveStore(name, barrio, kind, lat, lng);
    return NextResponse.json({ ok: true, storeId: created.id });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 503 });
  }
}
