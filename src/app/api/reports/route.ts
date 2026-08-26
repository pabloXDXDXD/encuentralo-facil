import { NextResponse } from "next/server";
import { parseReportIntake, submitPlaceReport } from "@/lib/repo";
import { hashDeviceId } from "@/lib/device-hash";

export const dynamic = "force-dynamic";

/**
 * Intake place-first: {placeId} XOR {lat,lng(+label?)}. El campo legado
 * storeId se aliasa a placeId dentro de parseReportIntake (D6). El guardia
 * anti-duplicado (30 min device+lugar+producto) vive DENTRO de
 * submit_place_report; aqui no hay chequeo de ruta que pueda divergir.
 */
export async function POST(req: Request) {
  const deviceHash = hashDeviceId(req.headers.get("x-device-id"));
  if (!deviceHash) {
    return NextResponse.json({ ok: false, error: "invalid_device" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const parsed = parseReportIntake(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  // La funcion DB devuelve veredicto para toda condicion esperada
  // (rate limits, duplicados); solo errores de infraestructura lanzan.
  try {
    const result = await submitPlaceReport({
      productId: parsed.value.productId,
      availability: parsed.value.availability,
      placeId: parsed.value.placeId,
      lat: parsed.value.lat,
      lng: parsed.value.lng,
      label: parsed.value.label,
      priceCup: parsed.value.priceCup,
      comment: parsed.value.comment,
      queueLevel: parsed.value.queueLevel,
      deviceHash,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 503 });
  }
}
