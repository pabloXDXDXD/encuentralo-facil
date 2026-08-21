import Link from "next/link";
import { getAvailability, listBarrios } from "@/lib/repo";
import { formatPrice, timeAgo } from "@/lib/format";

// Dynamic rendering keeps the freshness banner honest; the service worker
// provides the offline layer on top of this.
export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ barrio?: string }>;
};

type Row = Awaited<ReturnType<typeof getAvailability>>[number];

function ReportRow({ row }: { row: Row }) {
  const available = row.availability === "available";
  return (
    <article className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3">
      <span className="text-2xl leading-none">{row.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {row.product_name}{" "}
          {available && row.price_from !== null && (
            <span className="font-bold text-emerald-700">{formatPrice(row.price_from)}</span>
          )}
        </p>
        <p className="truncate text-xs text-stone-500">
          {row.store_name} · {timeAgo(row.last_seen_at)}
          {row.reporter_count > 1 && ` · ${row.reporter_count} reportes`}
        </p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          available ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
        }`}
      >
        {available ? "Hay" : "No hay"}
      </span>
    </article>
  );
}

export default async function Home({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const barrio = params.barrio ?? null;

  let barrios: string[] = [];
  let rows: Row[] = [];
  let offline = false;
  try {
    [barrios, rows] = await Promise.all([listBarrios(), getAvailability(barrio)]);
  } catch {
    offline = true;
  }

  const byBarrio = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byBarrio.get(row.barrio) ?? [];
    list.push(row);
    byBarrio.set(row.barrio, list);
  }

  return (
    <div className="space-y-4">
      <nav className="flex gap-2 overflow-x-auto pb-1">
        <Link
          href="/"
          className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
            barrio === null
              ? "bg-stone-900 text-white"
              : "border border-stone-300 bg-white text-stone-600"
          }`}
        >
          Toda La Habana
        </Link>
        {barrios.map((b) => (
          <Link
            key={b}
            href={`/?barrio=${encodeURIComponent(b)}`}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
              barrio === b
                ? "bg-stone-900 text-white"
                : "border border-stone-300 bg-white text-stone-600"
            }`}
          >
            {b}
          </Link>
        ))}
      </nav>

      {offline && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          Sin conexión con el servidor. Intenta de nuevo en unos minutos.
        </div>
      )}

      {!offline && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center">
          <p className="text-2xl">🛒</p>
          <p className="mt-2 font-semibold">Sin reportes activos aquí todavía</p>
          <p className="mt-1 text-sm text-stone-500">
            Los reportes duran 6 horas visibles. Sé quien encienda la zona.
          </p>
          <Link
            href="/reportar"
            className="mt-3 inline-block rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Hacer un reporte
          </Link>
        </div>
      )}

      {[...byBarrio.entries()].map(([zone, zoneRows]) => (
        <section key={zone} className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-stone-400">
            {zone}
          </h2>
          {zoneRows.map((row) => (
            <ReportRow key={row.store_id + row.product_slug} row={row} />
          ))}
        </section>
      ))}
    </div>
  );
}
