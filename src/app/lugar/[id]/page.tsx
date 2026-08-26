import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyTicket from "@/components/EmptyTicket";
import { getPlaceAvailability, getPlaceById } from "@/lib/repo";
import { formatPrice, timeAgo } from "@/lib/format";
import { rowStampClass, rowStampLabel } from "@/lib/status";
import { ProductIcon } from "@/lib/product-icons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const place = await getPlaceById(id);
    if (place) return { title: `${place.label} — DóndeHay` };
  } catch {
    /* fall through */
  }
  return { title: "Lugar — DóndeHay" };
}

export default async function PlacePage({ params }: Props) {
  const { id } = await params;
  const place = await getPlaceById(id);
  if (!place) notFound();

  const rows = await getPlaceAvailability(place.id);

  return (
    <div className="space-y-3">
      <header className="px-1">
        <h1 className="font-display text-xl leading-tight">{place.label}</h1>
        {(place.barrio || place.municipio) && (
          <p className="text-xs text-ink-soft">
            {[place.barrio, place.municipio].filter(Boolean).join(" · ")}
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        <EmptyTicket stamp="Sin reportes">Sin reportes activos para este lugar.</EmptyTicket>
      ) : (
        rows.map((row, i) => {
          // get_place_availability no expone la columna status del modelo
          // temporal; con su ventana fresca de 6 h basta derivarla:
          // available -> hay, out_of_stock -> ya no hay.
          const stampStatus = row.availability === "available" ? null : "ya_no_hay";
          return (
            <article
              key={row.product_slug}
              className="card-ticket rise flex items-center gap-3 p-3"
              style={{ "--i": i } as React.CSSProperties}
            >
              <ProductIcon slug={row.product_slug} size={26} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  <Link href={`/producto/${row.product_slug}`} className="hover:underline">
                    {row.product_name}
                  </Link>
                </p>
                <p className="text-xs text-ink-soft">
                  {timeAgo(row.last_seen_at)}
                  {row.reporter_count > 1 && ` · ${row.reporter_count} confirmaciones`}
                </p>
              </div>
              {row.availability === "available" && row.price_from !== null && (
                <span className="font-display text-xl text-ink">
                  {formatPrice(row.price_from)}
                </span>
              )}
              <span className={`stamp text-xs ${rowStampClass(stampStatus, row.availability)}`}>
                {rowStampLabel(stampStatus, row.availability)}
              </span>
            </article>
          );
        })
      )}

      <Link href="/reportar" className="btn btn-primary w-full rounded-md py-3 text-center">
        Reportar aquí
      </Link>
    </div>
  );
}
