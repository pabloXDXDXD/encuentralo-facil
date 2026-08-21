import Link from "next/link";
import { getAvailability } from "@/lib/repo";
import { formatPrice, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const barrio = decodeURIComponent(slug);
  return { title: `Qué hay en ${barrio} — DóndeHay` };
}

export default async function BarrioPage({ params }: Props) {
  const { slug } = await params;
  const barrio = decodeURIComponent(slug);
  const rows = await getAvailability(barrio);

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-xl font-bold">📍 {barrio}</h1>
      <p className="px-1 text-xs text-stone-500">Disponibilidad de las últimas 6 horas</p>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Sin reportes activos en este barrio ahora mismo.
        </div>
      ) : (
        rows.map((row) => (
          <article
            key={row.store_id + row.product_slug}
            className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3"
          >
            <span className="text-2xl">{row.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {row.product_name}
                {row.availability === "available" && row.price_from !== null && (
                  <span className="ml-2 font-bold text-emerald-700">
                    {formatPrice(row.price_from)}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-stone-500">
                {row.store_name} · {timeAgo(row.last_seen_at)}
              </p>
            </div>
          </article>
        ))
      )}

      <Link href="/reportar" className="block rounded-full bg-amber-600 py-3 text-center font-bold text-white">
        Hacer un reporte
      </Link>
    </div>
  );
}
