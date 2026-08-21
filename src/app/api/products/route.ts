import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/repo";

// Catalog changes rarely; ISR-style caching is fine here.
export const revalidate = 300;

export async function GET() {
  try {
    const categories = await getCatalog();
    return NextResponse.json({ ok: true, categories });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable", categories: [] }, { status: 503 });
  }
}
