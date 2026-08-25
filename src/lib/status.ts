// Etiquetas del modelo temporal de 4 estados:
// hay (<24h) | ya_no_hay (consenso) | habia (>24h, "no seguro") | sin datos.
export function rowStampClass(
  status: string | null | undefined,
  availability: string,
): string {
  if (status === "habia") return "stamp-stale rotate-1";
  if (status === "ya_no_hay") return "stamp-nohay rotate-2";
  if (availability === "available") return "stamp-hay -rotate-2";
  return "stamp-unknown rotate-2";
}

export function rowStampLabel(
  status: string | null | undefined,
  availability: string,
): string {
  if (status === "habia") return "Hay (no seguro)";
  if (status === "ya_no_hay") return "Ya no hay";
  if (availability === "available") return "Hay (<24h)";
  return "Sin datos";
}
