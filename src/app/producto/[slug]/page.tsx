import Link from "next/link";
import { notFound } from "next/navigation";
import { getAvailability, getProductBySlug } from "@/lib/repo";
import { formatPrice, timeAgo } from "@/lib/format";

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
        <span className="text-3xl">{product.emoji}</span>
        <div>
          <h1 className="text-xl font-bold">{product.name}</h1>
          <p className="text-xs text-stone-500">Disponibilidad de las últimas 6 horas</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Nadie ha reportado este producto recientemente.
        </div>
      ) : (
        rows.map((row) => (
          <article
            key={row.store_id}
            className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {row.store_name}
                {row.price_from !== null && (
                  <span className="ml-2 font-bold text-emerald-700">
                    {formatPrice(row.price_from)}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-stone-500">
                {row.barrio} · {timeAgo(row.last_seen_at)}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                row.availability === "available"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {row.availability === "available" ? "Hay" : "No hay"}
            </span>
          </article>
        ))
      )}

      <Link
        href={`/reportar`}
        className="block rounded-full bg-amber-600 py-3 text-center font-bold text-white"
      >
        Reportar dónde hay {product.name.toLowerCase()}
      </Link>
    </div>
  );
}
