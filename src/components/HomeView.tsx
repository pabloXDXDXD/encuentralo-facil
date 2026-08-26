"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Basket,
  Crosshair,
  Funnel,
  Gear,
  MagnifyingGlass,
  MapPin,
  PlusCircle,
  Spinner,
  X,
} from "@phosphor-icons/react";
import Notice from "@/components/Notice";
import AvailabilityMap, { type MapPoint } from "@/components/AvailabilityMap";
import { ProductIcon } from "@/lib/product-icons";
import { MUNICIPIO_CENTERS } from "@/lib/geo";
import { PRODUCT_CATALOG } from "@/lib/product-catalog";
import { formatPrice } from "@/lib/format";
import { selectBestPrice } from "@/lib/best-price";

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
  barrio: string | null;
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
  barrio: string | null;
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
    selCls: "bg-pin-hay-bg text-pin-hay-ink border-pin-hay-border",
  },
  {
    key: "stale",
    label: "Hay (no seguro)",
    cls: "map-pin--uncertain",
    selCls: "bg-pin-stale-bg text-pin-stale-ink border-pin-stale-border",
  },
  {
    key: "out",
    label: "Ya no hay",
    cls: "map-pin--out",
    selCls: "bg-pin-out-bg text-pin-out-ink border-pin-out-border",
  },
  {
    key: "unknown",
    label: "Sin datos",
    cls: "map-pin--unknown",
    selCls: "border-dashed opacity-80",
  },
] as const;

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
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    setLoaded(true);
    try {
      const savedAnchor = localStorage.getItem("dh_home_anchor");
      if (savedAnchor) setAnchor(JSON.parse(savedAnchor));
      setGpsSupported(Boolean(navigator.geolocation));
    } catch {
      /* ignore */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Parent refetches rows after a location change — adopt them wholesale.
  useEffect(() => {
    setRowsState(rows);
  }, [rows]);

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
    // Clear search so the pick map is clean, then enter pick mode.
    clearSearch();
    setShowSettings(false);
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

  const searchMode = activeQuery.length >= 2;

  // La ubicacion es prerrequisito: sin ancla no se busca (se hidrata desde
  // localStorage en el effect de arriba; `loaded` evita el flash inicial).
  const needsAnchor = loaded && !anchor && !pickMode;
  const activeFilterCount =
    (radius !== 3000 ? 1 : 0) +
    (!statusFilter.confirmed || !statusFilter.stale || !statusFilter.out || statusFilter.unknown
      ? 1
      : 0) +
    (minPriceInput !== "" || maxPriceInput !== "" ? 1 : 0);

  // Sugerencias de productos en tiempo real (typeahead). Combina el catalogo
  // estatico (funciona offline) con conteos de lugares del snapshot.
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
  // and out-of-price-range rows drop from the map.
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
      // Nombres legados del wire (D5): store_id/store_name ya traen el
      // uuid/etiqueta del place.
      place_id: r.store_id,
      lat: r.lat,
      lng: r.lng,
      slug: r.product_slug,
      product_name: r.product_name,
      place_label: r.store_name,
      barrio: r.barrio,
      status: r.status,
      price_from: r.price_from,
      reporter_count: r.reporter_count,
      last_seen_at: r.last_seen_at,
    }));
  }, [visibleResults]);

  // --- Chip "Mejor precio": el minimo price_from entre los resultados
  // visibles, con la distancia de la propia fila ganadora (sin fetch extra).
  const bestPrice = useMemo(
    () => (visibleResults ? selectBestPrice(visibleResults) : null),
    [visibleResults],
  );

  // --- Onboarding gate --------------------------------------------------------
  // La ubicacion es prerrequisito: un usuario nuevo ve UNICAMENTE la tarjeta
  // de bienvenida (sin buscador, sin paneles y sin mapa).
  // resolveAnchor() solo fabrica un ancla al buscar; hasta que el usuario no
  // guarda una (GPS o mapa), `anchor` permanece null y la puerta sigue activa.
  if (needsAnchor) {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center py-10">
        <div className="card-ticket w-full max-w-sm p-6 text-center">
          <p className="flex items-center justify-center gap-1.5 font-display text-lg">
            <MapPin size={18} aria-hidden /> Elige tu punto de búsqueda
          </p>
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
              {gpsBusy ? (
                <Spinner weight="bold" className="animate-spin" size={16} aria-hidden />
              ) : (
                <Crosshair size={18} aria-hidden />
              )}
              {gpsBusy ? "Buscando GPS…" : "Usar mi GPS"}
            </button>
            {gpsError && (
              <Notice
                variant="info"
                className="text-left text-xs"
                onDismiss={() => setGpsError(null)}
              >
                {gpsError}
              </Notice>
            )}
            <button
              type="button"
              onClick={() => {
                clearSearch();
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
          <span className="flex items-center gap-1.5 font-semibold">
            <MapPin size={16} aria-hidden /> Toca el mapa para elegir tu ubicación
          </span>
          <button
            type="button"
            onClick={() => setPickMode(false)}
            className="text-xs font-bold text-accent underline"
          >
            Cancelar
          </button>
        </div>
        <AvailabilityMapDynamic
          countryView
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
            placeholder={anchor ? "Buscar producto… (ej. pollo)" : "Primero elige tu ubicación"}
            className="w-full bg-transparent text-sm outline-none"
            inputMode="search"
            aria-label="Buscar producto"
          />
          {qInput && (
            <button type="button" onClick={clearSearch} aria-label="Limpiar búsqueda" className="text-ink-soft">
              <X size={14} weight="bold" aria-hidden />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          aria-label="Ajustes"
          title="Ajustes de ubicación"
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
                <span className="text-xs text-ink-soft">{s.n} {s.n === 1 ? "lugar" : "lugares"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --- Settings panel: ubicacion -------------------------------------- */}
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
            {gpsBusy ? (
              <Spinner weight="bold" className="animate-spin" size={16} aria-hidden />
            ) : (
              <Crosshair size={16} aria-hidden />
            )}{" "}
            {gpsBusy ? "Localizando…" : "Usar mi GPS"}
          </button>
          {gpsError && (
            <Notice variant="info" className="text-xs" onDismiss={() => setGpsError(null)}>
              {gpsError}
            </Notice>
          )}
          <button
            type="button"
            onClick={pickOnMap}
            className="btn btn-ghost w-full justify-center gap-2 rounded-md py-2 text-sm font-semibold"
          >
            <MapPin size={16} aria-hidden /> Elegir punto en el mapa
          </button>
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
            <X size={14} weight="bold" aria-hidden />
          </button>
        </div>
      )}

      {/* --- Filters (search mode only), collapsed behind a disclosure ------- */}
      {searchMode && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="btn btn-ghost w-full justify-between rounded-md px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-1.5">
              <Funnel size={14} weight="bold" aria-hidden /> Filtros
            </span>
            <span className="text-xs font-semibold text-ink-soft">
              {activeFilterCount > 0
                ? `${activeFilterCount} activo${activeFilterCount === 1 ? "" : "s"}`
                : "todos los resultados"}
            </span>
          </button>
          {filtersOpen && (
          <>
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
              className="w-20 shrink-0 rounded-md border-2 border-ink bg-card px-3 py-1 text-xs"
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
              className="w-20 shrink-0 rounded-md border-2 border-ink bg-card px-3 py-1 text-xs"
            />
          </div>
          </>
          )}
        </div>
      )}

      {offline && (
        <div className="card-flat p-4 text-sm">
          <p className="font-display">Sin conexión</p>
          <p className="mt-1 text-ink-soft">No llega el servidor. Intenta en unos minutos.</p>
        </div>
      )}

      {/* --- Chip "Mejor precio" (search mode) ------------------------------- */}
      {searchMode && bestPrice && (
        <p className="card-flat flex items-center gap-2 px-3 py-2 text-sm">
          <span className="font-bold">Mejor precio:</span>
          <span className="font-display text-lg leading-none text-ink">
            {formatPrice(bestPrice.price)}
          </span>
          <span className="text-ink-soft">· a {fmtDist(bestPrice.distanceM)}</span>
        </p>
      )}

      {/* --- Mapa: vista unica del home -------------------------------------- */}
      {searchMode ? (
        <AvailabilityMapDynamic
          points={searchPoints}
          focusProvincia={activeProvincia}
          anchor={anchor}
          radiusMeters={radius}
          popupReportLink
        />
      ) : (
        <AvailabilityMapDynamic
          rows={rowsState}
          focusMunicipio={activeMunicipio}
          focusProvincia={activeProvincia}
          anchor={anchor}
          popupReportLink
        />
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
