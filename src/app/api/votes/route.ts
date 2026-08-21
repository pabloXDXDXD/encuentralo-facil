import { NextResponse } from "next/server";
import { submitVote } from "@/lib/repo";
import { hashDeviceId } from "@/lib/device-hash";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const deviceHash = hashDeviceId(req.headers.get("x-device-id"));
  if (!deviceHash) {
    return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 400 });
  }

  let body: { reportId?: unknown; vote?: unknown };
  try {
    body = (await req.json()) as { reportId?: unknown; vote?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  const vote = body.vote === "confirm" || body.vote === "deny" ? body.vote : null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId);
  if (!reportId || !isUuid || !vote) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    const result = await submitVote({ reportId, vote, deviceHash });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 503 });
  }
}
