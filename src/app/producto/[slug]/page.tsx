import Link from "next/link";
import { notFound } from "next/navigation";
import { getAvailability, getProductBySlug } from "@/lib/repo";
import { formatPrice, queueLabel, timeAgo } from "@/lib/format";
import { ProductIcon } from "@/lib/product-icons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const product = await getProductBySlug(slug);
    if (product) {
      return { title: `¿Dónde hay ${product.name}? — DóndeHay` };
    }
  } catch {
    /* fall through */
  }
  return { title: "Producto — DóndeHay" };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const all = await getAvailability(null);
  const rows = all.filter((r) => r.product_slug === slug);

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-3 px-1">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-md border-2 border-ink bg-card shadow-[3px_3px_0_0_var(--stamp)]"
        >
          <ProductIcon slug={slug} size={26} />
        </span>
        <div>
          <h1 className="font-display text-xl leading-tight">{product.name}</h1>
          <p className="text-xs text-ink-soft">Disponibilidad de las últimas 6 horas</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="card-ticket p-6 text-center text-sm text-ink-soft">
          Nadie ha reportado este producto recientemente.
        </div>
      ) : (
        rows.map((row, i) => (
          <article
            key={row.store_id}
            className="card-ticket rise flex items-center gap-3 p-3"
            style={{ "--i": i } as React.CSSProperties}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                <Link href={`/tienda/${row.store_id}`} className="hover:underline">
                  {row.store_name}
                </Link>
              </p>
              <p className="truncate text-xs text-ink-soft">
                {row.barrio} · {timeAgo(row.last_seen_at)}
                {row.queue_level && ` · ${queueLabel(row.queue_level)}`}
              </p>
            </div>
            {row.availability === "available" && row.price_from !== null && (
              <span className="font-display text-xl text-hay-ink">
                {formatPrice(row.price_from)}
              </span>
            )}
            <span
              className={`stamp text-sm ${
                row.availability === "available" ? "stamp-hay -rotate-2" : "stamp-nohay rotate-2"
              }`}
            >
              {row.availability === "available" ? "Hay" : "No hay"}
            </span>
          </article>
        ))
      )}

      <Link href="/reportar" className="btn btn-primary w-full rounded-md py-3 text-center">
        Reportar dónde hay {product.name.toLowerCase()}
      </Link>
    </div>
  );
}
