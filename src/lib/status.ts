// Etiquetas del modelo temporal v2 (ciclo de vida de 7 dias):
// hay (vivo: creado o confirmado <7d) | ya_no_hay (consenso) | sin datos.
// El estado 'habia' fue retirado: la info vieja simplemente desaparece.
export function rowStampClass(
  status: string | null | undefined,
  availability: string,
): string {
  if (status === "ya_no_hay") return "stamp-nohay rotate-2";
  if (availability === "available") return "stamp-hay -rotate-2";
  return "stamp-unknown rotate-2";
}

export function rowStampLabel(
  status: string | null | undefined,
  availability: string,
): string {
  if (status === "ya_no_hay") return "Ya no hay";
  if (availability === "available") return "Hay";
  return "Sin datos";
}
