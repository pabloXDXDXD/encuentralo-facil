import { NextResponse } from "next/server";
import { getLatestRecentReport } from "@/lib/repo";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Latest report info for place+product; powers the anti-duplicate notice. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // Alias legado ?store= (D6): los bundles viejos llaman con storeId y los
  // lugares heredan los UUID de las tiendas.
  const placeId = searchParams.get("placeId") ?? searchParams.get("storeId") ?? "";
  const productId = searchParams.get("productId") ?? "";

  if (!UUID_RE.test(placeId) || !UUID_RE.test(productId)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    const info = await getLatestRecentReport(placeId, productId);
    return NextResponse.json({ ok: true, ...info });
  } catch {
    return NextResponse.json(
      { ok: false, found: false, hoursAgo: null, reportId: null },
      { status: 503 },
    );
  }
}
