"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Basket,
  CaretDown,
  Crosshair,
  Funnel,
  GlobeHemisphereWest,
  ListBullets,
  MagnifyingGlass,
  MapTrifold,
  PlusCircle,
  SlidersHorizontal,
  Star,
} from "@phosphor-icons/react";
import VoteButtons from "@/components/VoteButtons";
import AvailabilityMap, { type MapPoint } from "@/components/AvailabilityMap";
import { ProductIcon } from "@/lib/product-icons";
import { MUNICIPIO_CENTERS } from "@/lib/geo";
import { formatPrice, queueLabel, timeAgo } from "@/lib/format";

const SAVED_KEY = "dh_saved_products";

const AvailabilityMapDynamic = dynamic(() => import("@/components/AvailabilityMap"), {
  ssr: false,
  loading: () => (
    <div className="card-ticket h-[60dvh] animate-pulse p-4 text-center text-sm text-ink-soft">
      Cargando mapa…
    </div>
  ),
});

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

type SearchRow = {
  store_id: string;
  store_name: string;
  barrio: string;
  product_slug: string;
  product_name: string;
  lat: number;
  lng: number;
  distance_m: number;
  status: "confirmed" | "uncertain" | "out" | "unknown";
  price_from: number | null;
  reporter_count: number;
  last_seen_at: string | null;
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

const RADIUS_OPTIONS = [
  { value: 1500, label: "≤1.5 km" },
  { value: 3000, label: "≤3 km" },
  { value: 6000, label: "≤6 km" },
  { value: 20000, label: "Toda la zona" },
];

function fmtDist(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
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

  // --- Search state ---------------------------------------------------------
  const [qInput, setQInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<SearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [anchor, setAnchor] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [radius, setRadius] = useState(6000);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSaved(readSaved());
    setLoaded(true);
    try {
      const pref = localStorage.getItem("dh_pref_view");
      if (pref === "map" || pref === "list") setView(pref);
      const savedAnchor = localStorage.getItem("dh_home_anchor");
      if (savedAnchor) setAnchor(JSON.parse(savedAnchor));
    } catch {
      /* ignore */
    }
    if (!activeProvincia && !activeMunicipio) {
      try {
        const last = JSON.parse(
          localStorage.getItem("dh_last_location") ?? "null",
        ) as { p: string | null; m: string | null } | null;
        if (last && (last.p || last.m)) router.replace(locationHref(last.p, last.m));
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
  useEffect(() => {
    setRowsState(rows);
  }, [rows]);

  function toggleSave(slug: string) {
    const next = saved.includes(slug) ? saved.filter((s) => s !== slug) : [...saved, slug];
    setSaved(next);
    writeSaved(next);
  }

  function changeLocation(nextProvincia: string | null, nextMunicipio: string | null) {
    router.push(locationHref(nextProvincia, nextMunicipio));
  }

  /** Resolve the search anchor: saved GPS/pick > municipality centroid > region. */
  function resolveAnchor(): { lat: number; lng: number } {
    if (anchor) return anchor;
    const mc = activeMunicipio ? MUNICIPIO_CENTERS[activeMunicipio] : undefined;
    if (mc) {
      const a = { lat: mc.lat, lng: mc.lng };
      setAnchor(a);
      return a;
    }
    return { lat: 23.12, lng: -82.38 }; // Havana center
  }

  function useGps() {
    if (!navigator.geolocation) return;
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const a = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setAnchor(a);
        try {
          localStorage.setItem("dh_home_anchor", JSON.stringify(a));
        } catch {}
        setGpsBusy(false);
      },
      () => setGpsBusy(false),
      { timeout: 8000 },
    );
  }

  const runSearch = useCallback(
    async (query: string) => {
      const a = resolveAnchor();
      const params = new URLSearchParams({
        q: query,
        lat: String(a.lat),
        lng: String(a.lng),
        radius: String(radius),
      });
      if (confirmedOnly) params.set("confirmedOnly", "1");
      const mp = Number(maxPriceInput);
      if (Number.isFinite(mp) && mp > 0) params.set("maxPrice", String(Math.round(mp)));
      setSearching(true);
      try {
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        setResults(data.ok ? (data.rows as SearchRow[]) : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [anchor, radius, confirmedOnly, maxPriceInput, activeMunicipio],
  );

  function onSearchInput(value: string) {
    setQInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = value.trim();
      setActiveQuery(q);
      if (q.length >= 2) void runSearch(q);
      else setResults(null);
    }, 450);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQInput("");
    setActiveQuery("");
    setResults(null);
  }

  const filtering = filterOn && saved.length > 0;

  // Browse-mode rows (no active query)
  const browseVisible = useMemo(
    () =>
      filtering ? rowsState.filter((r) => saved.includes(r.product_slug)) : rowsState,
    [rowsState, filtering, saved],
  );

  const byZone = useMemo(() => {
    const map = new Map<string, HomeRow[]>();
    for (const row of browseVisible) {
      const list = map.get(row.barrio) ?? [];
      list.push(row);
      map.set(row.barrio, list);
    }
    return map;
  }, [browseVisible]);

  const searchMode = activeQuery.length >= 2;

  // --- Derived map inputs ----------------------------------------------------
  const searchPoints: MapPoint[] = useMemo(() => {
    if (!results) return [];
    return results.map((r) => ({
      store_id: r.store_id,
      lat: r.lat,
      lng: r.lng,
      slug: r.product_slug,
      product_name: r.product_name,
      store_name: r.store_name,
      barrio: r.barrio,
      status: r.status,
      price_from: r.price_from,
      reporter_count: r.reporter_count,
      last_seen_at: r.last_seen_at,
    }));
  }, [results]);

  return (
    <div className="space-y-4">
      {/* --- Sticky search bar --------------------------------------------- */}
      <div className="sticky top-[52px] z-30 -mx-4 px-4 pb-1 pt-1">
        <div className="card-ticket flex items-center gap-2 px-3 py-2">
          <MagnifyingGlass size={18} className="shrink-0 text-ink-soft" aria-hidden />
          <input
            value={qInput}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder="Buscar producto… (ej. pollo)"
            className="w-full bg-transparent text-sm outline-none"
            inputMode="search"
            aria-label="Buscar producto"
          />
          {qInput && (
            <button type="button" onClick={clearSearch} aria-label="Limpiar búsqueda" className="text-ink-soft">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* --- Compact control bar ------------------------------------------- */}
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
        <div className="card-flat space-y-3 p-3">
          <button
            type="button"
            onClick={useGps}
            disabled={gpsBusy}
            className="btn btn-ghost w-full justify-center gap-2 rounded-md py-2 text-sm font-semibold"
          >
            <Crosshair size={16} aria-hidden /> {gpsBusy ? "Localizando…" : "Usar mi GPS"}
          </button>
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
              onClick={() => { setView("list"); setShowViewPanel(false); }}
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
              onClick={() => { setView("map"); setShowViewPanel(false); }}
              className={`btn justify-center gap-2 rounded-md py-2 text-sm font-bold ${
                view === "map" ? "bg-ink text-paper" : "btn-ghost"
              }`}
            >
              <MapTrifold size={16} aria-hidden /> Mapa
            </button>
          </div>
        </div>
      )}

      {/* --- Filters (search mode only) ------------------------------------- */}
      {searchMode && (
        <div className="flex flex-wrap items-center gap-2">
          {RADIUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRadius(opt.value)}
              aria-pressed={radius === opt.value}
              className={`btn shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                radius === opt.value ? "bg-ink text-paper" : "btn-ghost"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setConfirmedOnly((v) => !v)}
            aria-pressed={confirmedOnly}
            className={`btn shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
              confirmedOnly ? "bg-accent text-on-accent" : "btn-ghost"
            }`}
          >
            ✅ Solo confirmados
          </button>
          <input
            value={maxPriceInput}
            onChange={(e) => setMaxPriceInput(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => void runSearch(activeQuery)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch(activeQuery)}
            placeholder="Máx $"
            inputMode="numeric"
            aria-label="Precio máximo"
            className="w-20 shrink-0 rounded-full border-2 border-ink bg-card px-3 py-1 text-xs"
          />
        </div>
      )}

      {offline && (
        <div className="card-flat p-4 text-sm">
          <p className="font-display">Sin conexión</p>
          <p className="mt-1 text-ink-soft">No llega el servidor. Intenta en unos minutos.</p>
        </div>
      )}

      {/* --- SEARCH RESULTS -------------------------------------------------- */}
      {searchMode &&
        (view === "map" ? (
          <AvailabilityMapDynamic points={searchPoints} focusProvincia={activeProvincia} />
        ) : (
          <section className="space-y-2">
            {searching && (
              <p className="px-1 text-xs text-ink-soft">Buscando «{activeQuery}»…</p>
            )}
            {!searching && results?.length === 0 && (
              <div className="card-ticket p-6 text-center text-sm text-ink-soft">
                Nada encontrado para «{activeQuery}» en este radio.
              </div>
            )}
            {results?.map((r, i) => (
              <article
                key={r.store_id}
                className="card-ticket rise flex items-center gap-3 p-3"
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className="w-14 shrink-0 text-center text-xs font-bold text-ink-soft">
                  {fmtDist(r.distance_m)}
                </span>
                {r.product_slug && (
                  <ProductIcon slug={r.product_slug} size={26} className="shrink-0 text-ink" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.product_name}</p>
                  <p className="truncate text-xs text-ink-soft">{r.store_name}</p>
                </div>
                {r.status !== "unknown" && r.price_from !== null && (
                  <span className="font-display text-xl text-hay-ink">
                    {formatPrice(r.price_from)}
                  </span>
                )}
                <span
                  className={`stamp text-xs ${
                    r.status === "confirmed"
                      ? "stamp-hay -rotate-2"
                      : r.status === "uncertain"
                        ? "stamp-hay rotate-1 opacity-80"
                        : "stamp-nohay rotate-2"
                  }`}
                >
                  {r.status === "confirmed"
                    ? "Hay"
                    : r.status === "uncertain"
                      ? "Quizás"
                      : r.status === "out"
                        ? "No hay"
                        : "?"}
                </span>
              </article>
            ))}
          </section>
        ))}

      {/* --- BROWSE MODE (sin búsqueda) -------------------------------------- */}
      {!searchMode && view === "map" && (
        <AvailabilityMapDynamic rows={browseVisible} focusMunicipio={activeMunicipio} focusProvincia={activeProvincia} />
      )}

      {!searchMode && view === "list" && (
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

          {!offline && browseVisible.length === 0 && (
            <div className="card-ticket p-6 text-center" style={{ "--i": 0 } as React.CSSProperties}>
              <Basket aria-hidden size={44} className="mx-auto text-ink-soft" weight="duotone" />
              <p className="mt-2 font-display text-xl">
                {filtering && saved.length === 0 ? "Sin búsquedas guardadas" : "Nada reportado aquí aún"}
              </p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
                {filtering && saved.length === 0
                  ? "Toca la estrella de un producto para seguirlo."
                  : "Los reportes duran 6 horas visibles. Sé quien encienda la zona."}
              </p>
            </div>
          )}

          {[...byZone.entries()].map(([zone, zoneRows]) => (
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
        </>
      )}

      {/* --- FAB Reportar ---------------------------------------------------- */}
      <Link
        href="/reportar"
        aria-label="Reportar producto"
        title="Reportar producto"
        className="btn btn-primary fixed bottom-20 right-4 z-40 h-14 w-14 justify-center rounded-full shadow-[4px_4px_0_0_var(--stamp)] !p-0"
      >
        <PlusCircle weight="fill" size={28} aria-hidden />
      </Link>
    </div>
  );
}

const selectClass =
  "w-full appearance-none rounded-md border-2 border-ink bg-card px-3 py-2 pr-8 text-sm font-semibold";

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
          {available && row.price_from !== null && (
            <span className="font-display text-2xl leading-none text-hay-ink">
              {formatPrice(row.price_from)}
            </span>
          )}
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
