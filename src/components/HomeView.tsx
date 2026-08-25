"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Basket,
  Crosshair,
  Funnel,
  Gear,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  PlusCircle,
  Star,
} from "@phosphor-icons/react";
import VoteButtons from "@/components/VoteButtons";
import AvailabilityMap, { type MapPoint } from "@/components/AvailabilityMap";
import { ProductIcon } from "@/lib/product-icons";
import { MUNICIPIO_CENTERS } from "@/lib/geo";
import { PRODUCT_CATALOG } from "@/lib/product-catalog";
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
  status: "confirmed" | "stale" | "out" | "unknown";
  price_from: number | null;
  reporter_count: number;
  last_seen_at: string | null;
};

type Props = {
  rows: HomeRow[];
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

const RADIUS_OPTIONS = [
  { value: 1500, label: "≤1.5 km" },
  { value: 3000, label: "≤3 km" },
  { value: 6000, label: "≤6 km" },
  { value: 10000, label: "≤10 km" },
];

// Chip metadata for the status visibility filter. Selected chips take the
// status color (same palette as the map pins/legend).
const STATUS_META = [
  {
    key: "confirmed",
    label: "Hay (<24h)",
    cls: "map-pin--confirmed",
    selCls: "bg-[#a5d6a7] text-[#1b4d1e] border-[#2e7d32]",
  },
  {
    key: "stale",
    label: "Hay (no seguro)",
    cls: "map-pin--uncertain",
    selCls: "bg-[#ffe082] text-[#6b4300] border-[#b26a00]",
  },
  {
    key: "out",
    label: "Ya no hay",
    cls: "map-pin--out",
    selCls: "bg-[#ef9a9a] text-[#7f1616] border-[#c62828]",
  },
  {
    key: "unknown",
    label: "Sin datos",
    cls: "map-pin--unknown",
    selCls: "border-dashed opacity-80",
  },
] as const;

// Relative time renders after mount only: computing it during SSR and again
// on hydration makes server and client disagree whenever the clock crosses a
// minute/hour boundary between both passes.
function RelativeTime({ date }: { date: string | Date }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(timeAgo(date));
  }, [date]);
  return <>{text}</>;
}

function fmtDist(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

export default function HomeView({
  rows,
  activeProvincia,
  activeMunicipio,
  offline,
}: Props) {
  const [rowsState, setRowsState] = useState<HomeRow[]>(rows);
  const [saved, setSaved] = useState<string[]>([]);
  const [filterOn, setFilterOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [showSettings, setShowSettings] = useState(false);
  const [pickMode, setPickMode] = useState(false);

  // --- Search state ---------------------------------------------------------
  const [qInput, setQInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<SearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [anchor, setAnchor] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsSupported, setGpsSupported] = useState(true);
  const [radius, setRadius] = useState(3000);
  const [statusFilter, setStatusFilter] = useState<
    Record<"confirmed" | "stale" | "out" | "unknown", boolean>
  >({ confirmed: true, stale: true, out: true, unknown: false });
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  // Panel de sugerencias visible hasta que el usuario lo cierra (Esc o click fuera).
  const [suggestsOpen, setSuggestsOpen] = useState(true);
  const suggestBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSaved(readSaved());
    setLoaded(true);
    try {
      const pref = localStorage.getItem("dh_pref_view");
      if (pref === "map" || pref === "list") setView(pref);
      const savedAnchor = localStorage.getItem("dh_home_anchor");
      if (savedAnchor) setAnchor(JSON.parse(savedAnchor));
      setGpsSupported(Boolean(navigator.geolocation));
    } catch {
      /* ignore */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem("dh_pref_view", view);
    } catch {
      /* ignore */
    }
  }, [view]);


  // Parent refetches rows after a location change — adopt them wholesale.
  useEffect(() => {
    setRowsState(rows);
  }, [rows]);

  function toggleSave(slug: string) {
    const next = saved.includes(slug) ? saved.filter((s) => s !== slug) : [...saved, slug];
    setSaved(next);
    writeSaved(next);
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
    if (!gpsSupported) {
      setGpsError("Tu navegador no permite geolocalización. Elige un punto en el mapa.");
      return;
    }
    setGpsBusy(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const a = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setAnchor(a);
        try {
          localStorage.setItem("dh_home_anchor", JSON.stringify(a));
        } catch {}
        setGpsBusy(false);
      },
      (err) => {
        setGpsBusy(false);
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Permiso de ubicación denegado. Actívalo en tu navegador o elige un punto en el mapa."
            : err.code === err.POSITION_UNAVAILABLE
              ? "No pudimos obtener tu ubicación. Activa el permiso de ubicación o elige un punto en el mapa."
              : "Tardamos demasiado en ubicarte. Intenta de nuevo o elige un punto en el mapa.",
        );
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  // El aviso de GPS se despacha solo a los ~6s (o antes si hay exito/otro intento).
  useEffect(() => {
    if (!gpsError) return;
    const t = setTimeout(() => setGpsError(null), 6000);
    return () => clearTimeout(t);
  }, [gpsError]);

  function pickOnMap() {
    // Clear search so the pick map is clean, switch to map, enter pick mode.
    clearSearch();
    setShowSettings(false);
    setView("map");
    setPickMode(true);
  }

  function onAnchorPicked(lat: number, lng: number) {
    const a = { lat, lng };
    setAnchor(a);
    try {
      localStorage.setItem("dh_home_anchor", JSON.stringify(a));
    } catch {}
    setPickMode(false);
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
    [anchor, radius, maxPriceInput, activeMunicipio],
  );

  // Re-run the committed search when radius or the anchor change
  // (prices re-run on blur/Enter already; status/price filters are client-side).
  const searchInputs = `${radius}|${
    anchor ? `${anchor.lat.toFixed(5)},${anchor.lng.toFixed(5)}` : ""
  }`;
  useEffect(() => {
    if (!activeQuery) return;
    void runSearch(activeQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInputs]);

  function onSearchInput(value: string) {
    // Mientras se escribe solo se muestran sugerencias; la busqueda real
    // se lanza al elegir una sugerencia o pulsar Enter sobre una seleccion.
    setQInput(value);
    setSuggestsOpen(true);
  }

  function clearSearch() {
    setQInput("");
    setActiveQuery("");
    setResults(null);
  }

  // Click fuera de la barra de busqueda cierra el panel de sugerencias.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (suggestBarRef.current && !suggestBarRef.current.contains(e.target as Node)) {
        setSuggestsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

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

  // Todavia no se ha lanzado ninguna busqueda real: tras fijar la ubicacion el
  // usuario ve SOLO el buscador y una tarjeta de estado vacio — nada de datos
  // browse ni mapa con pines hasta que busque. Al limpiar la busqueda se vuelve
  // a este estado vacio.
  const hasSearched = searchMode || results !== null;

  // La ubicacion es prerrequisito: sin ancla no se busca (se hidrata desde
  // localStorage en el effect de arriba; `loaded` evita el flash inicial).
  const needsAnchor = loaded && !anchor && !pickMode;

  // Sugerencias de productos en tiempo real (typeahead). Combina el catalogo
  // estatico (funciona offline) con conteos de tiendas del snapshot.
  const productSuggestions = useMemo(() => {
    const q = qInput.trim().toLowerCase();
    if (q.length < 2) return [];
    const counts = new Map<string, number>();
    for (const r of rowsState) {
      if (!r.product_name.toLowerCase().includes(q) && !r.product_slug.includes(q)) continue;
      counts.set(r.product_slug, (counts.get(r.product_slug) ?? 0) + 1);
    }
    const matches: { slug: string; name: string; emoji: string; n: number }[] = [];
    for (const c of PRODUCT_CATALOG) {
      if (!c.name.toLowerCase().includes(q) && !c.slug.includes(q)) continue;
      matches.push({ ...c, n: counts.get(c.slug) ?? 0 });
    }
    // productos del snapshot que no estan en el catalogo estatico
    for (const [slug, n] of counts) {
      if (!matches.some((m) => m.slug === slug)) {
        const row = rowsState.find((r) => r.product_slug === slug);
        if (row) matches.push({ slug, name: row.product_name, emoji: row.emoji, n });
      }
    }
    return matches.sort((a, b) => b.n - a.n).slice(0, 6);
  }, [qInput, rowsState]);

  const [justPicked, setJustPicked] = useState(false);

  function selectSuggestion(slug: string, name: string) {
    setQInput(name);
    setActiveQuery(name);
    setResults(null);
    setJustPicked(true);
    void runSearch(name);
  }

  // --- Derived map inputs ----------------------------------------------------
  // Client-side filters: status visibility + min/max price. Hidden statuses
  // and out-of-price-range rows drop from BOTH the list and the map.
  const visibleResults = useMemo(() => {
    if (!results) return null;
    const min = Number(minPriceInput);
    const max = Number(maxPriceInput);
    return results.filter((r) => {
      if (!statusFilter[r.status]) return false;
      if (Number.isFinite(min) && min > 0 && (r.price_from === null || r.price_from < min)) return false;
      if (Number.isFinite(max) && max > 0 && (r.price_from === null || r.price_from > max)) return false;
      return true;
    });
  }, [results, statusFilter, minPriceInput, maxPriceInput]);

  const searchPoints: MapPoint[] = useMemo(() => {
    if (!visibleResults) return [];
    return visibleResults.map((r) => ({
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
  }, [visibleResults]);

  // --- Onboarding gate --------------------------------------------------------
  // La ubicacion es prerrequisito: un usuario nuevo ve UNICAMENTE la tarjeta
  // de bienvenida (sin buscador, sin paneles y sin vistas browse).
  // resolveAnchor() solo fabrica un ancla al buscar; hasta que el usuario no
  // guarda una (GPS o mapa), `anchor` permanece null y la puerta sigue activa.
  if (needsAnchor) {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center py-10">
        <div className="card-ticket w-full max-w-sm p-6 text-center">
          <p className="font-display text-lg">📍 Elige tu punto de búsqueda</p>
          <p className="mt-1 text-sm text-ink-soft">
            Necesitamos tu ubicación para mostrarte qué hay cerca. Sin cuenta, sin datos personales.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={useGps}
              disabled={gpsBusy || !gpsSupported}
              title={gpsSupported ? undefined : "Tu navegador no permite geolocalización"}
              className="btn btn-primary justify-center rounded-md py-3"
            >
              <Crosshair size={18} aria-hidden />
              {gpsBusy ? "Buscando GPS…" : "Usar mi GPS"}
            </button>
            {gpsError && (
              <div
                role="alert"
                className="flex items-start justify-between gap-2 rounded-md border-2 border-dashed border-line bg-card px-3 py-2 text-left text-xs text-ink-soft"
              >
                <span>{gpsError}</span>
                <button
                  type="button"
                  onClick={() => setGpsError(null)}
                  aria-label="Cerrar aviso"
                  className="shrink-0 font-bold text-ink"
                >
                  ✕
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                clearSearch();
                setView("map");
                setPickMode(true);
              }}
              className="btn btn-ghost justify-center rounded-md py-3"
            >
              <MapPin size={18} aria-hidden />
              Elegir punto en el mapa
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Modo elegir punto en el mapa: SOLO el mapa con una barra minima de
  // instruccion. Al cancelar se vuelve a la puerta si aun no hay ancla.
  if (pickMode) {
    return (
      <div className="space-y-3">
        <div className="card-flat flex items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="font-semibold">📍 Toca el mapa para elegir tu ubicación</span>
          <button
            type="button"
            onClick={() => setPickMode(false)}
            className="text-xs font-bold text-accent underline"
          >
            Cancelar
          </button>
        </div>
        <AvailabilityMapDynamic
          focusMunicipio={activeMunicipio}
          focusProvincia={activeProvincia}
          pickMode
          onPick={onAnchorPicked}
          anchor={anchor}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* --- Sticky search bar --------------------------------------------- */}
      <div ref={suggestBarRef} className="sticky top-0 z-30 -mx-4 bg-paper px-4 pb-1 pt-2">
        <div className="flex items-stretch gap-2">
        <div className={`card-ticket flex flex-1 items-center gap-2 px-3 py-2 ${!anchor ? "opacity-60" : ""}`}>
          <MagnifyingGlass size={18} className="shrink-0 text-ink-soft" aria-hidden />
          <input
            value={qInput}
        onChange={(e) => {
          setJustPicked(false);
          anchor && onSearchInput(e.target.value);
        }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSuggestsOpen(false);
              if (e.key === "Enter" && activeQuery) void runSearch(activeQuery);
            }}
            disabled={!anchor}
            placeholder={anchor ? "Buscar producto… (ej. pollo)" : "Primero elige tu ubicación 📍"}
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
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          aria-label="Ajustes"
          title="Ajustes de ubicación y vista"
          className={`btn h-auto w-11 shrink-0 justify-center rounded-md !p-0 ${
            showSettings ? "bg-ink text-paper" : "btn-ghost"
          }`}
        >
          <Gear size={20} aria-hidden />
        </button>
        </div>

        {/* Sugerencias en tiempo real (typeahead) */}
        {anchor && suggestsOpen && !justPicked && productSuggestions.length > 0 && qInput.trim() !== activeQuery && (
          <div className="card-ticket mt-1 divide-y divide-line overflow-hidden py-0">
            {productSuggestions.map((s) => (
              <button
                key={s.slug}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // no perder el foco del input
                  selectSuggestion(s.slug, s.name);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-paper"
              >
                <span className="text-lg" aria-hidden>{s.emoji}</span>
                <span className="flex-1 truncate font-semibold">{s.name}</span>
                <span className="text-xs text-ink-soft">{s.n} {s.n === 1 ? "tienda" : "tiendas"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --- Settings panel: ubicacion + vista en un mismo lugar ----------- */}
      {showSettings && (
        <div className="card-flat space-y-3 p-3">
          <section className="space-y-2">
            <span className="px-1 text-xs font-bold tracking-wide text-ink-soft">UBICACIÓN</span>
          <button
            type="button"
            onClick={useGps}
            disabled={gpsBusy || !gpsSupported}
            title={gpsSupported ? undefined : "Tu navegador no permite geolocalización"}
            className="btn btn-ghost w-full justify-center gap-2 rounded-md py-2 text-sm font-semibold"
          >
            <Crosshair size={16} aria-hidden /> {gpsBusy ? "Localizando…" : "Usar mi GPS"}
          </button>
          {gpsError && (
            <div
              role="alert"
              className="flex items-start justify-between gap-2 rounded-md border-2 border-dashed border-line bg-card px-3 py-2 text-xs text-ink-soft"
            >
              <span>{gpsError}</span>
              <button
                type="button"
                onClick={() => setGpsError(null)}
                aria-label="Cerrar aviso"
                className="shrink-0 font-bold text-ink"
              >
                ✕
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={pickOnMap}
            className="btn btn-ghost w-full justify-center gap-2 rounded-md py-2 text-sm font-semibold"
          >
            <MapPin size={16} aria-hidden /> Elegir punto en el mapa
          </button>
        </section>

          <div className="border-t-2 border-dashed border-line" aria-hidden />

          <section className="space-y-2">
            <span className="px-1 text-xs font-bold tracking-wide text-ink-soft">TIPO DE VISTA</span>
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
          </section>
        </div>
      )}

      {/* --- Selected-product banner (search mode) --------------------------- */}
      {searchMode && (
        <div className="card-flat flex items-center gap-3 px-3 py-2">
          <ProductIcon slug={results?.[0]?.product_slug ?? ""} size={26} className="shrink-0 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-snug">{activeQuery}</p>
            <p className="text-xs text-ink-soft">
              {searching
                ? "Buscando…"
                : `${visibleResults?.length ?? 0} ${visibleResults?.length === 1 ? "resultado" : "resultados"}`}
            </p>
          </div>
          {results && results.length > 0 && results[0].product_slug && (
            <Link
              href={`/reportar?producto=${results[0].product_slug}`}
              className="btn btn-ghost shrink-0 rounded-md px-2.5 py-1.5 text-xs"
              title="Reportar este producto"
            >
              <PlusCircle size={14} aria-hidden />
              Reportar
            </Link>
          )}
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Quitar búsqueda"
            title="Quitar búsqueda"
            className="text-sm font-bold text-ink-soft hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* --- Filters (search mode only), grouped ----------------------------- */}
      {searchMode && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 px-1 text-xs font-bold tracking-wide text-ink-soft">
              <Crosshair size={12} aria-hidden /> DISTANCIA
            </span>
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 px-1 text-xs font-bold tracking-wide text-ink-soft">
              <Funnel size={12} aria-hidden /> ESTADOS
            </span>
            {STATUS_META.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatusFilter((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                aria-pressed={statusFilter[s.key]}
                title={statusFilter[s.key] ? "Ocultar este estado" : "Mostrar este estado"}
                className={`btn shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                  statusFilter[s.key] ? s.selCls : "btn-ghost opacity-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 px-1 text-xs font-bold tracking-wide text-ink-soft">
              <Basket size={12} aria-hidden /> PRECIO
            </span>
            <input
              value={minPriceInput}
              onChange={(e) => setMinPriceInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Mín $"
              inputMode="numeric"
              aria-label="Precio mínimo"
              className="w-20 shrink-0 rounded-full border-2 border-ink bg-card px-3 py-1 text-xs"
            />
            <span className="text-xs text-ink-soft" aria-hidden>–</span>
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
        </div>
      )}

      {offline && (
        <div className="card-flat p-4 text-sm">
          <p className="font-display">Sin conexión</p>
          <p className="mt-1 text-ink-soft">No llega el servidor. Intenta en unos minutos.</p>
        </div>
      )}

      {/* --- Estado vacio pre-busqueda -------------------------------------- */}
      {!hasSearched && (
        <div className="card-ticket p-6 text-center" style={{ "--i": 0 } as React.CSSProperties}>
          <Basket aria-hidden size={44} className="mx-auto text-ink-soft" weight="duotone" />
          <p className="mt-2 font-display text-xl">¿Qué buscas hoy?</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
            Busca un producto para ver qué hay cerca.
          </p>
          <p className="mt-2 text-xs text-ink-soft">Prueba con «pollo», «café» o «arroz»…</p>
        </div>
      )}

      {hasSearched && (
        <>
          {/* --- SEARCH RESULTS -------------------------------------------------- */}
          {searchMode &&
        (view === "map" ? (
          <AvailabilityMapDynamic
            points={searchPoints}
            focusProvincia={activeProvincia}
            anchor={anchor}
            radiusMeters={radius}
            popupReportLink
          />
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
            {!searching && results && results.length > 0 && visibleResults?.length === 0 && (
              <div className="card-ticket p-6 text-center text-sm text-ink-soft">
                Ningún resultado pasa los filtros actuales.
              </div>
            )}
            {visibleResults?.map((r, i) => (
              <article
                key={r.store_id}
                className="card-ticket rise flex items-center gap-3 p-3"
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className="w-14 shrink-0 text-center text-xs font-bold text-ink-soft">
                  {fmtDist(r.distance_m)}
                </span>
                <ProductIcon slug={r.product_slug || ""} size={26} className="shrink-0 text-ink" />
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
                      : r.status === "stale"
                        ? "stamp-stale rotate-1"
                        : r.status === "unknown"
                          ? "stamp-unknown rotate-2"
                          : "stamp-nohay rotate-2"
                  }`}
                >
                  {r.status === "confirmed"
                    ? "Hay (<24h)"
                    : r.status === "stale"
                      ? "Hay (no seguro)"
                      : r.status === "out"
                        ? "Ya no hay"
                        : "Sin datos"}
                </span>
              </article>
            ))}
          </section>
        ))}

      {/* --- BROWSE MODE (sin búsqueda) -------------------------------------- */}
      {view === "map" && !searchMode && (
        <AvailabilityMapDynamic
          rows={browseVisible}
          focusMunicipio={activeMunicipio}
          focusProvincia={activeProvincia}
          pickMode={pickMode}
          onPick={onAnchorPicked}
          anchor={anchor}
          popupReportLink
        />
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
                  : "Lo reportado pasa a «Hay (no seguro)» tras 24 horas. Sé quien encienda la zona."}
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
            <RelativeTime date={row.last_seen_at} />
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
