import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreAvailability, getStoreById } from "@/lib/repo";
import { formatPrice, kindLabel, queueLabel, timeAgo } from "@/lib/format";
import { rowStampClass, rowStampLabel } from "@/lib/status";
import { ProductIcon } from "@/lib/product-icons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const store = await getStoreById(id);
    if (store) return { title: `${store.name} — DóndeHay` };
  } catch {
    /* fall through */
  }
  return { title: "Tienda — DóndeHay" };
}

export default async function StorePage({ params }: Props) {
  const { id } = await params;
  const store = await getStoreById(id);
  if (!store) notFound();

  const rows = await getStoreAvailability(store.id);

  return (
    <div className="space-y-3">
      <header className="px-1">
        <h1 className="font-display text-xl leading-tight">{store.name}</h1>
        <p className="text-xs text-ink-soft">
          <span className="rounded-full border-2 border-line px-2 py-0.5 font-semibold text-ink">
            {kindLabel(store.kind)}
          </span>{" "}
          · {store.barrio}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="card-ticket p-6 text-center text-sm text-ink-soft">
          Sin reportes activos para esta tienda.
        </div>
      ) : (
        rows.map((row, i) => (
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
              <p className="text-xs text-ink-soft">{timeAgo(row.last_seen_at)}</p>
            </div>
            {row.availability === "available" && row.price_from !== null && (
              <span className="font-display text-lg text-hay-ink">
                {formatPrice(row.price_from)}
              </span>
            )}
            <span
              className={`stamp text-xs ${rowStampClass(row.status, row.availability)}`}
            >
              {rowStampLabel(row.status, row.availability)}
            </span>
          </article>
        ))
      )}

      <Link href="/reportar" className="btn btn-primary w-full rounded-md py-3 text-center">
        Reportar aquí
      </Link>
    </div>
  );
}
