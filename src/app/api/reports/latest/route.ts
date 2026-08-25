import { NextResponse } from "next/server";
import { getLatestRecentReport } from "@/lib/repo";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Latest report info for store+product; powers the anti-duplicate notice. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId") ?? "";
  const productId = searchParams.get("productId") ?? "";

  if (!UUID_RE.test(storeId) || !UUID_RE.test(productId)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    const info = await getLatestRecentReport(storeId, productId);
    return NextResponse.json({ ok: true, ...info });
  } catch {
    return NextResponse.json(
      { ok: false, found: false, hoursAgo: null, reportId: null },
      { status: 503 },
    );
  }
}
