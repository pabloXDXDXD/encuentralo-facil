"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import VoteButtons from "@/components/VoteButtons";
import { formatPrice, queueLabel, timeAgo } from "@/lib/format";

const SAVED_KEY = "dh_saved_products";

export type HomeRow = {
  store_id: string;
  store_name: string;
  barrio: string;
  product_slug: string;
  product_name: string;
  emoji: string;
  availability: "available" | "out_of_stock";
  price_from: number | null;
  reporter_count: number;
  last_seen_at: string;
  latest_report_id: string;
  queue_level: number | null;
};

type Props = {
  rows: HomeRow[];
  barrios: string[];
  activeBarrio: string | null;
  offline: boolean;
};

function readSaved(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(list: string[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* ignore */
  }
}

export default function HomeView({ rows: initialRows, barrios, activeBarrio, offline }: Props) {
  const [rows, setRows] = useState<HomeRow[]>(initialRows);
  const [saved, setSaved] = useState<string[]>([]);
  const [filterOn, setFilterOn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSaved(readSaved());
    setLoaded(true);
  }, []);

  // Freshness loop: poll the snapshot every 60s while the tab is visible.
  useEffect(() => {
    let alive = true;
    async function poll() {
      if (document.hidden) return;
      try {
        const qs = activeBarrio ? `?barrio=${encodeURIComponent(activeBarrio)}` : "";
        const res = await fetch(`/api/availability${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || !data.ok) return;
        setRows(
          (data.rows as HomeRow[]).map((r) => ({
            ...r,
            last_seen_at: new Date(r.last_seen_at).toISOString(),
          })),
        );
      } catch {
        /* offline -> keep showing what we have */
      }
    }
    const timer = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [activeBarrio]);

  function toggleSave(slug: string) {
    const next = saved.includes(slug) ? saved.filter((s) => s !== slug) : [...saved, slug];
    setSaved(next);
    writeSaved(next);
  }

  const visibleRows = useMemo(() => {
    if (!filterOn || saved.length === 0) return rows;
    return rows.filter((r) => saved.includes(r.product_slug));
  }, [rows, filterOn, saved]);

  const byBarrio = useMemo(() => {
    const map = new Map<string, HomeRow[]>();
    for (const row of visibleRows) {
      const list = map.get(row.barrio) ?? [];
      list.push(row);
      map.set(row.barrio, list);
    }
    return map;
  }, [visibleRows]);

  return (
    <div className="space-y-4">
      <nav className="flex gap-2 overflow-x-auto pb-1">
        <Link
          href="/"
          className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
            activeBarrio === null
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
              activeBarrio === b
                ? "bg-stone-900 text-white"
                : "border border-stone-300 bg-white text-stone-600"
            }`}
          >
            {b}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setFilterOn((v) => !v)}
        className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${
          filterOn && saved.length > 0
            ? "bg-amber-100 text-amber-900"
            : "border border-dashed border-stone-300 text-stone-500"
        }`}
      >
        ⭐ Mis búsquedas{loaded && saved.length > 0 ? ` (${saved.length})` : ""} —{" "}
        {filterOn && saved.length > 0 ? "mostrando solo estas" : "tocar para filtrar"}
      </button>

      {offline && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          Sin conexión con el servidor. Intenta de nuevo en unos minutos.
        </div>
      )}

      {!offline && visibleRows.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center">
          <p className="text-2xl">{filterOn && saved.length === 0 ? "⭐" : "🛒"}</p>
          <p className="mt-2 font-semibold">
            {filterOn && saved.length === 0
              ? "Sin búsquedas guardadas todavía"
              : "Sin reportes activos aquí todavía"}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {filterOn && saved.length === 0
              ? "Toca la estrella de un producto para seguirlo."
              : "Los reportes duran 6 horas visibles. Sé quien encienda la zona."}
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
            <article key={row.store_id + row.product_slug} className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={saved.includes(row.product_slug) ? "Quitar de búsquedas" : "Guardar búsqueda"}
                  onClick={() => toggleSave(row.product_slug)}
                  className="text-xl leading-none"
                >
                  {saved.includes(row.product_slug) ? "⭐" : "☆"}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    <Link href={`/producto/${row.product_slug}`} className="hover:underline">
                      {row.product_name}
                    </Link>{" "}
                    {row.availability === "available" && row.price_from !== null && (
                      <span className="font-bold text-emerald-700">
                        {formatPrice(row.price_from)}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {row.store_name} · {timeAgo(row.last_seen_at)}
                    {row.reporter_count > 1 && ` · ${row.reporter_count} reportes`}
                    {row.queue_level && ` · ${queueLabel(row.queue_level)}`}
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
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-stone-100 pt-2">
                <span className="text-xs text-stone-400">¿Lo confirmas?</span>
                <VoteButtons reportId={row.latest_report_id} />
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
