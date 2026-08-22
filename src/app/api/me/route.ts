import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashDeviceId } from "@/lib/device-hash";

export const dynamic = "force-dynamic";

/** Contribution stats for the current anonymous device. */
export async function GET(req: Request) {
  const deviceHash = hashDeviceId(req.headers.get("x-device-id"));
  if (!deviceHash) {
    return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query<{ reports: string; votes: string }>(
      `select
         (select count(*) from public.reports where device_hash = $1)      as reports,
         (select count(*) from public.report_votes where device_hash = $1) as votes`,
      [deviceHash],
    );
    const reports = Number(rows[0].reports);
    const votes = Number(rows[0].votes);
    return NextResponse.json({
      ok: true,
      stats: { reports, votes, points: reports * 10 + votes * 2 },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 503 });
  }
}
