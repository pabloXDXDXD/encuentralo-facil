import { NextResponse } from "next/server";
import { createStore, searchStores } from "@/lib/repo";

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
  let body: { name?: unknown; barrio?: unknown; lat?: unknown; lng?: unknown };
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

  const parseCoord = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
  };

  try {
    const result = await createStore(name, barrio, "other", parseCoord(body.lat), parseCoord(body.lng));
    return NextResponse.json({
      ok: result.ok,
      error: result.error,
      storeId: result.store_id,
      existing: result.existing,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 503 });
  }
}
