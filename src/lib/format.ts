/** Presentation helpers shared by server and client components. */

export function formatPrice(priceCup: number | null): string {
  if (priceCup === null || Number.isNaN(priceCup)) return "";
  return `$${priceCup.toLocaleString("es-CU")}`;
}

export function timeAgo(date: string | Date): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const minutes = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}

const KIND_LABELS: Record<string, string> = {
  state_market: "Estatal",
  private_market: "Privado",
  mipyme: "MIPYME",
  other: "Tienda",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "Tienda";
}
