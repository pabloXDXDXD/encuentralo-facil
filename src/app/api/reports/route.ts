import { NextResponse } from "next/server";
import { submitReport, type Availability } from "@/lib/repo";
import { hashDeviceId } from "@/lib/device-hash";

export const dynamic = "force-dynamic";

type Body = {
  storeId?: unknown;
  productId?: unknown;
  availability?: unknown;
  priceCup?: unknown;
  comment?: unknown;
};

export async function POST(req: Request) {
  const deviceHash = hashDeviceId(req.headers.get("x-device-id"));
  if (!deviceHash) {
    return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const storeId = typeof body.storeId === "string" ? body.storeId : "";
  const productId = typeof body.productId === "string" ? body.productId : "";
  const availability =
    body.availability === "available" || body.availability === "out_of_stock"
      ? (body.availability as Availability)
      : null;
  if (!storeId || !productId || !availability) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  let priceCup: number | null = null;
  if (body.priceCup !== null && body.priceCup !== undefined && body.priceCup !== "") {
    const n = Number(body.priceCup);
    if (!Number.isFinite(n) || n < 0 || n > 1000000) {
      return NextResponse.json({ ok: false, error: "invalid_price" }, { status: 400 });
    }
    priceCup = Math.round(n);
  }

  const comment =
    typeof body.comment === "string" && body.comment.trim().length > 0
      ? body.comment.trim().slice(0, 200)
      : null;

  // The DB function returns a verdict for every expected condition
  // (rate limits, duplicates); only infrastructure errors throw.
  try {
    const result = await submitReport({
      storeId,
      productId,
      availability,
      priceCup,
      comment,
      deviceHash,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 503 });
  }
}
