"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { Map as LeafletMap } from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { Crosshair, MapPin } from "@phosphor-icons/react";
import { MUNICIPIO_CENTERS, regionFor } from "@/lib/geo";
import { ProductIcon } from "@/lib/product-icons";
import { timeAgo } from "@/lib/format";

/**
 * OpenStreetMap view.
 * Two input modes:
 *  - rows:      availability snapshot (browse) -> strong/weak pins
 *  - points:    search results -> confirmed/uncertain/out/unknown pins
 * Camera locked to the selected province region; municipality focus frames it.
 */

type Props = {
  rows?: HomeRowLike[];
  points?: MapPoint[];
  focusMunicipio?: string | null;
  focusProvincia?: string | null;
  /** When true: next map click sets the user's home anchor. */
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  /** Persisted user anchor -> drawn on every mount/paint so it survives mode switches. */
  anchor?: { lat: number; lng: number } | null;
  /** Active search radius in meters; drives how far out the camera frames. */
  radiusMeters?: number;
};

export type HomeRowLike = {
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
  queue_level?: number | null;
  lat: number | null;
  lng: number | null;
  status?: string | null;
};

export type MapPoint = {
  store_id: string;
  lat: number;
  lng: number;
  slug: string;
  product_name: string;
  store_name: string;
  barrio: string;
  status: "confirmed" | "stale" | "out" | "unknown";
  price_from: number | null;
  reporter_count: number;
  last_seen_at: string | null;
};

const STATUS_CLASS: Record<MapPoint["status"], string> = {
  confirmed: "map-pin--confirmed",
  stale: "map-pin--uncertain",
  out: "map-pin--out",
  unknown: "map-pin--unknown",
};

const STATUS_BADGE: Record<MapPoint["status"], string> = {
  confirmed: "Hay",
  stale: "Había",
  out: "Ya no hay",
  unknown: "Sin datos",
};

/** Orden canonico de los estados; un grupo de clusters por cada uno. */
const STATUS_ORDER: MapPoint["status"][] = ["confirmed", "stale", "out", "unknown"];

type InternalPoint = {
  key: string;
  lat: number;
  lng: number;
  cls: string;
  statusKey: MapPoint["status"];
  glyphSlug: string;
  productName: string;
  storeName: string;
  barrio: string;
  priceFrom: number | null;
  reporterCount: number;
  lastSeenAt: string | null;
  badge: string;
};

const glyphCache = new Map<string, string>();

/** Zoom maximo del mapa; a este nivel el clustering se desactiva por completo. */
const MAP_MAX_ZOOM = 17;

/**
 * Zoom del encuadre segun el radio de busqueda activo: un radio corto
 * mira de cerca, uno largo se aleja para dar contexto de la zona.
 */
const ZOOM_BY_RADIUS: Record<number, number> = { 1500: 16, 3000: 15, 6000: 14, 10000: 13 };
const DEFAULT_RADIUS_ZOOM = 15;
const radiusZoom = (m?: number) =>
  (m != null ? ZOOM_BY_RADIUS[m] : undefined) ?? DEFAULT_RADIUS_ZOOM;

function productGlyph(slug: string): string {
  let html = glyphCache.get(slug);
  if (html === undefined) {
    html = renderToStaticMarkup(<ProductIcon slug={slug} size={15} />);
    glyphCache.set(slug, html);
  }
  return html;
}

export default function AvailabilityMap({
  rows,
  points,
  focusMunicipio,
  focusProvincia,
  pickMode,
  onPick,
  anchor,
  radiusMeters,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const anchorMarkerRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // La instancia del mapa vive en estado a proposito: al recrear el mapa
  // (cambio de provincia/municipio) setStatus("ready") seria un no-op y el
  // efecto de pintado no se reejecutaria, dejando el mapa nuevo vacio.
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);

  /** Crea o mueve el marcador de anclaje del usuario en el mapa actual. */
  function upsertAnchor(L: any, map: LeafletMap, lat: number, lng: number, draggable: boolean) {
    if (anchorMarkerRef.current) {
      anchorMarkerRef.current.setLatLng([lat, lng]);
      return;
    }
    const glyph = renderToStaticMarkup(<MapPin weight="fill" size={16} />);
    const icon = L.divIcon({
      className: "",
      html: `<div class="map-pin map-pin--anchor">${glyph}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 28],
    });
    const marker = L.marker([lat, lng], { icon, draggable }).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      onPick?.(p.lat, p.lng);
    });
    anchorMarkerRef.current = marker;
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const L = (await import("leaflet")).default;
        const region = regionFor(focusProvincia);
        if (cancelled || !containerRef.current) return;

        const mc = focusMunicipio ? MUNICIPIO_CENTERS[focusMunicipio] : undefined;
        const map = L.map(containerRef.current, {
          center: mc ? [mc.lat, mc.lng] : region.center,
          zoom: mc ? 14 : region.minZoom + 1,
          minZoom: region.minZoom,
          maxZoom: MAP_MAX_ZOOM,
          zoomControl: false,
          attributionControl: false,
          maxBounds: L.latLngBounds(region.bounds).pad(0.08),
          maxBoundsViscosity: 0.9,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

        mapRef.current = map;
        setMapInstance(map);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void boot();
    return () => {
      cancelled = true;
      frameRef.current = null;
      anchorMarkerRef.current = null;
      markerLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, [focusProvincia, focusMunicipio]);

  useEffect(() => {
    if (status !== "ready" || !mapInstance) return;
    const map = mapRef.current;
    // map !== mapInstance: mapa recien recreado cuyo arranque aun no termina.
    if (!map || map !== mapInstance) return;

    let cancelled = false;

    async function paint() {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (cancelled || !map) return;

      map.eachLayer((layer) => {
        if ("_url" in layer) return; // tiles
        // preservar el ancla del usuario entre repintados (ej. al buscar)
        if (anchorMarkerRef.current && layer === anchorMarkerRef.current) return;
        map.removeLayer(layer); // incluye el grupo de clusters anterior
      });

      let internal: InternalPoint[] = [];

      if (points) {
        // Coordenadas invalidas rompen L.marker y abortan todo el repintado
        // (pines Y encuadre): se excluyen igual que en el modo browse.
        internal = points
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
          .map((p) => ({
          key: p.store_id + p.slug + p.status,
          lat: p.lat,
          lng: p.lng,
          cls: STATUS_CLASS[p.status],
          statusKey: p.status,
          glyphSlug: p.slug,
          productName: p.product_name,
          storeName: p.store_name,
          barrio: p.barrio,
          priceFrom: p.price_from,
          reporterCount: p.reporter_count,
          lastSeenAt: p.last_seen_at,
          badge: STATUS_BADGE[p.status],
        }));
      } else {
        const browseRows = rows ?? [];
        for (const r of browseRows) {
          // Sin coordenadas no hay nada que dibujar: se excluyen de la vista.
          if (r.lat === null || r.lng === null) continue;
          // Browse muestra TODOS los estados: el estado del ultimo reporte
          // decide la clase del pin (Hay / Habia / Ya no hay / Sin datos).
          const st: MapPoint["status"] =
            r.availability === "available"
              ? "confirmed"
              : r.status === "habia"
                ? "stale"
                : r.status === "ya_no_hay"
                  ? "out"
                  : "unknown";
          internal.push({
            key: r.store_id + r.product_slug,
            lat: Number(r.lat),
            lng: Number(r.lng),
            cls: STATUS_CLASS[st],
            statusKey: st,
            glyphSlug: r.product_slug,
            productName: r.product_name,
            storeName: r.store_name,
            barrio: r.barrio,
            priceFrom: r.price_from,
            reporterCount: r.reporter_count,
            lastSeenAt: r.last_seen_at,
            badge: STATUS_BADGE[st],
          });
        }
      }

      // --- Marcadores con leaflet.markercluster ------------------------------
      // UN grupo de clusters por ESTADO: un cluster nunca mezcla colores/
      // estados; cada estado se agrupa (y colorea) por separado.
      // Los grupos se RECREAN en cada repintado: reciclarlos con clearLayers()
      // pierde marcadores cuando hay animaciones/transiciones en vuelo.
      const statusGroups = new Map<MapPoint["status"], any>();
      for (const st of STATUS_ORDER) {
        const group = L.markerClusterGroup({
          disableClusteringAtZoom: MAP_MAX_ZOOM,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          maxClusterRadius: 56,
          // Sin animaciones: los estados intermedios de la animacion eran la
          // fuente de marcadores perdidos/fantasma al repintar seguido.
          animate: false,
          iconCreateFunction: (cluster) =>
            L.divIcon({
              className: "",
              html: `<div class="map-cluster map-cluster--${st}">${cluster.getChildCount()}</div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            }),
        });
        map.addLayer(group);
        statusGroups.set(st, group);
      }
      markerLayerRef.current = statusGroups.get("confirmed");

      const addPin = (p: InternalPoint) => {
        const icon = L.divIcon({
          className: "",
          html: `<div class="map-pin ${p.cls}" title="${p.badge}">${productGlyph(p.glyphSlug)}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -14],
        });

        const price =
          p.priceFrom !== null && p.priceFrom !== undefined
            ? `<div class="popup-price">$${p.priceFrom}</div>`
            : "";
        const meta =
          p.lastSeenAt != null
            ? `${timeAgo(p.lastSeenAt)}${p.reporterCount > 1 ? ` · ${p.reporterCount} reportes` : ""}`
            : "sin reportes recientes";
        const html = `
          <div class="popup-ticket">
            <div class="popup-name"><span>${p.productName}</span><span class="stamp stamp-hay" style="transform:none;font-size:10px;padding:0 4px;">${p.badge}</span></div>
            ${price}
            <div class="popup-meta">${p.storeName}<br/>${p.barrio} · ${meta}</div>
          </div>`;

        const marker = L.marker([p.lat, p.lng], {
          icon,
          status: p.statusKey,
        } as L.MarkerOptions);
        marker.bindPopup(html).addTo(statusGroups.get(p.statusKey));
      };

      for (const p of internal) addPin(p);

      // Dibujar el ancla persistida del usuario (prop) en cada repintado,
      // para que sobreviva al cambio browse <-> busqueda (instancias distintas).
      if (anchor) {
        upsertAnchor(L, map, anchor.lat, anchor.lng, Boolean(pickMode));
      }

      // --- Framing ---------------------------------------------------------
      // La camara pertenece al USUARIO: en busqueda se centra en su punto con
      // el zoom que dicta el radio elegido, no en los resultados.
      const frame = () => {
        const mc = focusMunicipio ? MUNICIPIO_CENTERS[focusMunicipio] : undefined;
        if (mc && !points) {
          map.setView([mc.lat, mc.lng], 14, { animate: false });
          return;
        }
        if (points) {
          const c = anchor ?? (internal.length > 0 ? internal[0] : undefined);
          if (c) {
            if (radiusMeters) {
              // Centrar en el usuario y garantizar que TODO el radio elegido
              // quepa en pantalla (cualquier viewport): fitBounds sobre la
              // caja de radio, no un zoom fijo.
              const dLat = radiusMeters / 111320;
              const dLng = radiusMeters / (111320 * Math.cos((c.lat * Math.PI) / 180));
              const b = L.latLngBounds(
                [c.lat - dLat, c.lng - dLng],
                [c.lat + dLat, c.lng + dLng],
              );
              map.fitBounds(b.pad(0.05), { maxZoom: MAP_MAX_ZOOM - 1, animate: false });
            } else {
              map.setView([c.lat, c.lng], DEFAULT_RADIUS_ZOOM, { animate: false });
            }
            return;
          }
        }
        if (internal.length > 0) {
          const b = L.latLngBounds([]);
          for (const p of internal) b.extend([p.lat, p.lng]);
          map.fitBounds(b.pad(0.25), { maxZoom: radiusZoom(radiusMeters), animate: false });
        } else {
          const region = regionFor(focusProvincia);
          map.setView(region.center, region.minZoom + 2, { animate: false });
        }
      };
      frameRef.current = frame;
      frame();
    }

    void paint();
    return () => {
      cancelled = true;
    };
  }, [rows, points, status, focusMunicipio, focusProvincia, anchor, mapInstance]);

  // Pick mode: next click on the map becomes the user's home anchor.
  useEffect(() => {
    if (status !== "ready" || !pickMode) return;
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;

    let cancelled = false;
    container.classList.add("map-picking");

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !map) return;

      const place = (lat: number, lng: number) => {
        upsertAnchor(L, map, lat, lng, true);
        onPick?.(lat, lng);
        map.setView([lat, lng], Math.max(map.getZoom(), 14));
      };

      const handler = (e: L.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng);
      map.on("click", handler);

      // If an anchor was already chosen, keep showing it while re-picking.
      // (HomeView re-mounts us in pick mode with pickAnchor prop.)
    })();

    return () => {
      cancelled = true;
      container.classList.remove("map-picking");
      if (map) map.off("click");
    };
  }, [status, pickMode, onPick]);

  return (
    <div className="card-ticket isolate overflow-hidden">
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[60dvh] w-full bg-paper"
          role="application"
          aria-label="Mapa de disponibilidad"
        />
        {!pickMode && (
          <button
            type="button"
            onClick={() => frameRef.current?.()}
            aria-label="Centrar en los resultados"
            title="Centrar en los resultados"
            className="btn btn-ghost absolute right-3 top-3 z-[500] h-10 w-10 justify-center rounded-md !p-0"
          >
            <Crosshair size={20} weight="bold" aria-hidden />
          </button>
        )}
      </div>

      {/* Legend doubles as required attribution for OSM tiles.
          In pick mode the map must stay clean: attribution only. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-dashed border-line px-3 py-2 text-xs text-ink-soft">
        {!pickMode && (
          <>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className={`map-pin map-pin--confirmed`} style={{ width: 18, height: 18, fontSize: 10 }}>
                ✚
              </span>
              Hay
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className={`map-pin map-pin--uncertain`} style={{ width: 18, height: 18, fontSize: 10 }}>
                ?
              </span>
              Había (&gt;1 día)
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="map-pin map-pin--out" style={{ width: 18, height: 18, fontSize: 10 }}>
                ✕
              </span>
              Ya no hay
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="map-pin map-pin--unknown" style={{ width: 18, height: 18, fontSize: 10 }} />
              Sin datos
            </span>
          </>
        )}
        <span className="ml-auto">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
