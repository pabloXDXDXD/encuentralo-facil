import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreAvailability, getStoreById } from "@/lib/repo";
import { formatPrice, kindLabel, timeAgo } from "@/lib/format";

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
        <h1 className="text-xl font-bold">🏪 {store.name}</h1>
        <p className="text-xs text-stone-500">
          {kindLabel(store.kind)} · {store.barrio}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Sin reportes activos para esta tienda.
        </div>
      ) : (
        rows.map((row) => (
          <article
            key={row.product_slug}
            className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3"
          >
            <span className="text-2xl">{row.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                <Link href={`/producto/${row.product_slug}`} className="hover:underline">
                  {row.product_name}
                </Link>
                {row.availability === "available" && row.price_from !== null && (
                  <span className="ml-2 font-bold text-emerald-700">
                    {formatPrice(row.price_from)}
                  </span>
                )}
              </p>
              <p className="text-xs text-stone-500">{timeAgo(row.last_seen_at)}</p>
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
        href="/reportar"
        className="block rounded-full bg-amber-600 py-3 text-center font-bold text-white"
      >
        Reportar aquí
      </Link>
    </div>
  );
}
