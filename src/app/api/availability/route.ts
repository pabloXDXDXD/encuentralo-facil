import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/repo";

// Polled every 60s by clients -> never cache at the edge.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const rows = await getAvailability(
      searchParams.get("municipio") ?? searchParams.get("barrio"),
      searchParams.get("provincia"),
    );
    return NextResponse.json({ ok: true, rows });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable", rows: [] }, { status: 503 });
  }
}
