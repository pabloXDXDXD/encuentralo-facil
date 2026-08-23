"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Basket,
  CaretDown,
  GlobeHemisphereWest,
  ListBullets,
  MapTrifold,
  SlidersHorizontal,
  Star,
} from "@phosphor-icons/react";
import VoteButtons from "@/components/VoteButtons";
import { ProductIcon } from "@/lib/product-icons";
import { formatPrice, queueLabel, timeAgo } from "@/lib/format";

const AvailabilityMap = dynamic(() => import("@/components/AvailabilityMap"), {
  ssr: false,
  loading: () => (
    <div className="card-ticket h-[60dvh] animate-pulse p-4 text-center text-sm text-ink-soft">
      Cargando mapa…
    </div>
  ),
});

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
  lat: number | null;
  lng: number | null;
};

type Props = {
  rows: HomeRow[];
  provinces: string[];
  municipios: string[];
  activeProvincia: string | null;
  activeMunicipio: string | null;
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

function locationHref(provincia: string | null, municipio: string | null): string {
  const params = new URLSearchParams();
  if (provincia) params.set("provincia", provincia);
  if (municipio) params.set("municipio", municipio);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export default function HomeView({
  rows,
  provinces,
  municipios,
  activeProvincia,
  activeMunicipio,
  offline,
}: Props) {
  const router = useRouter();
  const [rowsState, setRowsState] = useState<HomeRow[]>(rows);
  const [saved, setSaved] = useState<string[]>([]);
  const [filterOn, setFilterOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [showLocation, setShowLocation] = useState(false);
  const [showViewPanel, setShowViewPanel] = useState(false);

  useEffect(() => {
    setSaved(readSaved());
    setLoaded(true);
    // View preference survives navigation and sessions.
    try {
      const pref = localStorage.getItem("dh_pref_view");
      if (pref === "map" || pref === "list") setView(pref);
    } catch {
      /* ignore */
    }
    // Returning users land where they last browsed (URL without location).
    if (!activeProvincia && !activeMunicipio) {
      try {
        const last = JSON.parse(
          localStorage.getItem("dh_last_location") ?? "null",
        ) as { p: string | null; m: string | null } | null;
        if (last && (last.p || last.m)) {
          router.replace(locationHref(last.p, last.m));
        }
      } catch {
        /* ignore */
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem("dh_pref_view", view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "dh_last_location",
        JSON.stringify({ p: activeProvincia, m: activeMunicipio }),
      );
    } catch {
      /* ignore */
    }
  }, [activeProvincia, activeMunicipio]);

  // Parent refetches rows after a location change — adopt them wholesale.
  // (This replaced the key-remount so view/filter prefs survive navigation.)
  useEffect(() => {
    setRowsState(rows);
  }, [rows]);

  function toggleSave(slug: string) {
    const next = saved.includes(slug) ? saved.filter((s) => s !== slug) : [...saved, slug];
    setSaved(next);
    writeSaved(next);
  }

  const filtering = filterOn && saved.length > 0;
  const visibleRows = filtering
    ? rowsState.filter((r) => saved.includes(r.product_slug))
    : rowsState;

  // Freshness loop: poll the snapshot every 60s while the tab is visible.
  useEffect(() => {
    let alive = true;
    async function poll() {
      if (document.hidden) return;
      try {
        const qs = new URLSearchParams();
        if (activeProvincia) qs.set("provincia", activeProvincia);
        if (activeMunicipio) qs.set("municipio", activeMunicipio);
        const res = await fetch(`/api/availability?${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || !data.ok) return;
        setRowsState(
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
  }, [activeProvincia, activeMunicipio]);

  function changeLocation(nextProvincia: string | null, nextMunicipio: string | null) {
    router.push(locationHref(nextProvincia, nextMunicipio));
  }

  const byZone = useMemo(() => {
    const map = new Map<string, HomeRow[]>();
    for (const row of visibleRows) {
      const list = map.get(row.barrio) ?? [];
      list.push(row);
      map.set(row.barrio, list);
    }
    return map;
  }, [visibleRows]);

  const selectClass =
    "w-full appearance-none rounded-md border-2 border-ink bg-card px-3 py-2 pr-8 text-sm font-semibold";

  return (
    <div className="space-y-4">
      {/* Compact control bar: icon-only toggles */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setShowLocation((v) => !v);
            setShowViewPanel(false);
          }}
          aria-expanded={showLocation}
          aria-label="Cambiar ubicación"
          title="Ubicación"
          className={`btn h-10 w-10 justify-center rounded-md !p-0 ${
            showLocation ? "bg-ink text-paper" : "btn-ghost"
          }`}
        >
          <GlobeHemisphereWest size={20} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setShowViewPanel((v) => !v);
            setShowLocation(false);
          }}
          aria-expanded={showViewPanel}
          aria-label="Opciones de vista"
          title="Vista"
          className={`btn h-10 w-10 justify-center rounded-md !p-0 ${
            showViewPanel ? "bg-ink text-paper" : "btn-ghost"
          }`}
        >
          <SlidersHorizontal size={20} aria-hidden />
        </button>
        <span className="ml-auto truncate text-xs font-semibold text-ink-soft">
          {[activeProvincia, activeMunicipio].filter(Boolean).join(" · ") || "Toda Cuba"}
        </span>
      </div>

      {showLocation && (
        <div className="card-flat space-y-2 p-3">
          <label className="relative block">
            <span className="px-1 text-xs text-ink-soft">Provincia</span>
            <select
              value={activeProvincia ?? ""}
              onChange={(e) => {
                changeLocation(e.target.value || null, null);
                setShowLocation(false);
              }}
              className={`mt-1 ${selectClass}`}
            >
              <option value="">Toda Cuba</option>
              {provinces.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <CaretDown
              aria-hidden
              size={14}
              className="pointer-events-none absolute bottom-3 right-3 text-ink-soft"
            />
          </label>
          <label className="relative block">
            <span className="px-1 text-xs text-ink-soft">
              {activeProvincia && activeProvincia !== "La Habana" ? "Ciudad" : "Municipio"}
            </span>
            <select
              value={activeMunicipio ?? ""}
              onChange={(e) => {
                changeLocation(activeProvincia, e.target.value || null);
                setShowLocation(false);
              }}
              className={`mt-1 ${selectClass}`}
              disabled={municipios.length === 0}
            >
              <option value="">Todo el territorio</option>
              {municipios.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <CaretDown
              aria-hidden
              size={14}
              className="pointer-events-none absolute bottom-3 right-3 text-ink-soft"
            />
          </label>
        </div>
      )}

      {showViewPanel && (
        <div className="card-flat space-y-2 p-3">
          <span className="px-1 text-xs text-ink-soft">Tipo de vista</span>
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Vista">
            <button
              type="button"
              role="tab"
              aria-selected={view === "list"}
              onClick={() => setView("list")}
              className={`btn justify-center gap-2 rounded-md py-2 text-sm font-bold ${
                view === "list" ? "bg-ink text-paper" : "btn-ghost"
              }`}
            >
              <ListBullets size={16} aria-hidden /> Lista
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "map"}
              onClick={() => setView("map")}
              className={`btn justify-center gap-2 rounded-md py-2 text-sm font-bold ${
                view === "map" ? "bg-ink text-paper" : "btn-ghost"
              }`}
            >
              <MapTrifold size={16} aria-hidden /> Mapa
            </button>
          </div>
        </div>
      )}

      {view === "map" && (
        <AvailabilityMap rows={visibleRows} focusMunicipio={activeMunicipio} focusProvincia={activeProvincia} />
      )}

      {view === "list" && (
        <>
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
        </>
      )}

      {view === "list" &&
        [...byZone.entries()].map(([zone, zoneRows]) => (
          <section key={zone} className="space-y-3">
            <h2 className="flex items-center gap-3">
              <span className="font-display text-lg leading-none">{zone}</span>
              <span aria-hidden className="h-0.5 flex-1 bg-line" />
              <span className="text-xs font-bold text-ink-soft">{zoneRows.length}</span>
            </h2>
            {zoneRows.map((row, i) => (
              <TicketRow
                key={row.store_id + row.product_slug}
                row={row}
                index={i}
                saved={saved}
                onToggleSave={toggleSave}
              />
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
          aria-label={
            isSaved
              ? `Quitar ${row.product_name} de búsquedas`
              : `Guardar ${row.product_name} en búsquedas`
          }
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
            className={`stamp text-sm ${available ? "stamp-hay -rotate-2" : "stamp-nohay rotate-2"}`}
          >
            {available ? "Hay" : "No hay"}
          </span>
        </div>
      </div>

      <div aria-hidden className="my-2 border-t-2 border-dashed border-line" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-soft">¿Lo confirmas?</span>
        <VoteButtons reportId={row.latest_report_id} />
      </div>
    </article>
  );
}
