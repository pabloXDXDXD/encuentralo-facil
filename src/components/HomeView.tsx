"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Basket, Star } from "@phosphor-icons/react";
import VoteButtons from "@/components/VoteButtons";
import { ProductIcon } from "@/lib/product-icons";
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

  const filtering = filterOn && saved.length > 0;

  const visibleRows = useMemo(() => {
    if (!filtering) return rows;
    return rows.filter((r) => saved.includes(r.product_slug));
  }, [rows, filtering, saved]);

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
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Barrios">
        <Link
          href="/"
          className={`btn shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
            activeBarrio === null ? "bg-ink text-paper" : "btn-ghost"
          }`}
        >
          Toda La Habana
        </Link>
        {barrios.map((b) => (
          <Link
            key={b}
            href={`/?barrio=${encodeURIComponent(b)}`}
            className={`btn shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
              activeBarrio === b ? "bg-ink text-paper" : "btn-ghost"
            }`}
          >
            {b}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setFilterOn((v) => !v)}
        aria-pressed={filtering}
        className={`btn w-full justify-between rounded-md px-3 py-2 text-sm ${
          filtering ? "bg-accent text-on-accent" : "btn-ghost border-dashed"
        }`}
      >
        <span>⭐ Mis búsquedas{loaded && saved.length > 0 ? ` (${saved.length})` : ""}</span>
        <span className="text-xs font-semibold opacity-80">
          {filtering ? "activado" : "filtrar"}
        </span>
      </button>

      {offline && (
        <div className="card-flat p-4 text-sm">
          <p className="font-display">Sin conexión</p>
          <p className="mt-1 text-ink-soft">
            No llega el servidor. Intenta de nuevo en unos minutos.
          </p>
        </div>
      )}

      {!offline && visibleRows.length === 0 && (
        <div className="card-ticket p-6 text-center" style={{ "--i": 0 } as React.CSSProperties}>
          <Basket aria-hidden size={44} className="mx-auto text-ink-soft" weight="duotone" />
          <p className="mt-2 font-display text-xl">
            {filtering && saved.length === 0
              ? "Sin búsquedas guardadas"
              : "Nada reportado aquí aún"}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
            {filtering && saved.length === 0
              ? "Toca la estrella de un producto para seguirlo."
              : "Los reportes duran 6 horas visibles. Sé quien encienda la zona."}
          </p>
          <Link href="/reportar" className="btn btn-primary mt-4 rounded-md px-4 py-2 text-sm">
            Hacer un reporte
          </Link>
        </div>
      )}

      {[...byBarrio.entries()].map(([zone, zoneRows]) => (
        <section key={zone} className="space-y-3">
          <h2 className="flex items-center gap-3">
            <span className="font-display text-lg leading-none">{zone}</span>
            <span aria-hidden className="h-0.5 flex-1 bg-line" />
            <span className="text-xs font-bold text-ink-soft">{zoneRows.length}</span>
          </h2>
          {zoneRows.map((row, i) => (
            <TicketRow key={row.store_id + row.product_slug} row={row} index={i} saved={saved} onToggleSave={toggleSave} />
          ))}
        </section>
      ))}
    </div>
  );
}

type RowProps = {
  row: HomeRow;
  index: number;
  saved: string[];
  onToggleSave: (slug: string) => void;
};

function TicketRow({ row, index, saved, onToggleSave }: RowProps) {
  const available = row.availability === "available";
  const isSaved = saved.includes(row.product_slug);

  return (
    <article className="card-ticket rise p-3" style={{ "--i": index } as React.CSSProperties}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={isSaved ? `Quitar ${row.product_name} de búsquedas` : `Guardar ${row.product_name} en búsquedas`}
          aria-pressed={isSaved}
          onClick={() => onToggleSave(row.product_slug)}
          className="transition-transform hover:scale-110"
        >
          <Star
            size={22}
            weight={isSaved ? "fill" : "regular"}
            className={isSaved ? "text-accent" : "text-ink-soft"}
            aria-hidden
          />
        </button>

        <ProductIcon slug={row.product_slug} size={30} className="mt-0.5 shrink-0 text-ink" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-snug">
            <Link href={`/producto/${row.product_slug}`} className="hover:underline">
              {row.product_name}
            </Link>
          </p>
          <p className="truncate text-xs text-ink-soft">{row.store_name}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {timeAgo(row.last_seen_at)}
            {row.reporter_count > 1 && ` · ✓ ${row.reporter_count}`}
            {row.queue_level && (
              <span className="ml-1 font-semibold text-ink">{queueLabel(row.queue_level)}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {available ? (
            row.price_from !== null && (
              <span className="font-display text-2xl leading-none text-hay-ink">
                {formatPrice(row.price_from)}
              </span>
            )
          ) : null}
          <span
            className={`stamp text-sm ${
              available ? "stamp-hay -rotate-2" : "stamp-nohay rotate-2"
            }`}
          >
            {available ? "Hay" : "No hay"}
          </span>
        </div>
      </div>

      {/* Receipt perforation */}
      <div aria-hidden className="my-2 border-t-2 border-dashed border-line" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-soft">¿Lo confirmas?</span>
        <VoteButtons reportId={row.latest_report_id} />
      </div>
    </article>
  );
}
