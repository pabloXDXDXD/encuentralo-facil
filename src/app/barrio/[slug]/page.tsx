import Link from "next/link";
import { getAvailability } from "@/lib/repo";
import { MapPinAccent } from "@/lib/product-icons";
import { formatPrice, queueLabel, timeAgo } from "@/lib/format";

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
      <header className="flex items-center gap-2 px-1">
        <MapPinAccent size={22} />
        <h1 className="font-display text-xl leading-tight">{barrio}</h1>
      </header>
      <p className="-mt-2 px-1 text-xs text-ink-soft">Disponibilidad de las últimas 6 horas</p>

      {rows.length === 0 ? (
        <div className="card-ticket p-6 text-center text-sm text-ink-soft">
          Sin reportes activos en este barrio ahora mismo.
        </div>
      ) : (
        rows.map((row, i) => (
          <article
            key={row.store_id + row.product_slug}
            className="card-ticket rise flex items-center gap-3 p-3"
            style={{ "--i": i } as React.CSSProperties}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                <Link href={`/producto/${row.product_slug}`} className="hover:underline">
                  {row.product_name}
                </Link>
              </p>
              <p className="truncate text-xs text-ink-soft">
                {row.store_name} · {timeAgo(row.last_seen_at)}
                {row.queue_level && ` · ${queueLabel(row.queue_level)}`}
              </p>
            </div>
            {row.availability === "available" && row.price_from !== null && (
              <span className="font-display text-lg text-hay-ink">
                {formatPrice(row.price_from)}
              </span>
            )}
          </article>
        ))
      )}

      <Link href="/reportar" className="btn btn-primary w-full rounded-md py-3 text-center">
        Hacer un reporte
      </Link>
    </div>
  );
}
