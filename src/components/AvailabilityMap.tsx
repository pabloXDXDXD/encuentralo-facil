"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
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
};

export type MapPoint = {
  store_id: string;
  lat: number;
  lng: number;
  slug: string;
  product_name: string;
  store_name: string;
  barrio: string;
  status: "confirmed" | "uncertain" | "out" | "unknown";
  price_from: number | null;
  reporter_count: number;
  last_seen_at: string | null;
};

const STATUS_CLASS: Record<MapPoint["status"], string> = {
  confirmed: "map-pin--confirmed",
  uncertain: "map-pin--uncertain",
  out: "map-pin--out",
  unknown: "map-pin--unknown",
};

const STATUS_BADGE: Record<MapPoint["status"], string> = {
  confirmed: "Hay · confirmado",
  uncertain: "Había · sin confirmar",
  out: "Reportado agotado",
  unknown: "Sin reportes recientes",
};

type InternalPoint = {
  key: string;
  lat: number;
  lng: number;
  cls: string;
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
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const anchorMarkerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
          maxZoom: 17,
          zoomControl: false,
          attributionControl: false,
          maxBounds: L.latLngBounds(region.bounds).pad(0.08),
          maxBoundsViscosity: 0.9,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

        mapRef.current = map;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void boot();
    return () => {
      cancelled = true;
      frameRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [focusProvincia, focusMunicipio]);

  useEffect(() => {
    if (status !== "ready") return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    async function paint() {
      const L = (await import("leaflet")).default;
      if (cancelled || !map) return;

      map.eachLayer((layer) => {
        if ("_url" in layer) return;
        map.removeLayer(layer);
      });

      let internal: InternalPoint[] = [];

      if (points) {
        internal = points.map((p) => ({
          key: p.store_id + p.slug + p.status,
          lat: p.lat,
          lng: p.lng,
          cls: STATUS_CLASS[p.status],
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
          if (r.lat === null || r.lng === null || r.availability !== "available") continue;
          const ageMin = (Date.now() - new Date(r.last_seen_at).getTime()) / 60_000;
          const strong = r.reporter_count >= 2 || ageMin <= 30;
          internal.push({
            key: r.store_id + r.product_slug,
            lat: Number(r.lat),
            lng: Number(r.lng),
            cls: strong ? "map-pin--confirmed" : "map-pin--uncertain",
            glyphSlug: r.product_slug,
            productName: r.product_name,
            storeName: r.store_name,
            barrio: r.barrio,
            priceFrom: r.price_from,
            reporterCount: r.reporter_count,
            lastSeenAt: r.last_seen_at,
            badge: strong ? "Confirmado" : "Fresco",
          });
        }
      }

      for (const p of internal) {
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

        L.marker([p.lat, p.lng], { icon })
          .bindPopup(html)
          .addTo(map);
      }

      // --- Framing ---------------------------------------------------------
      const frame = () => {
        const mc = focusMunicipio ? MUNICIPIO_CENTERS[focusMunicipio] : undefined;
        if (mc && !points) {
          map.setView([mc.lat, mc.lng], 14);
          return;
        }
        if (internal.length > 0) {
          const b = L.latLngBounds([]);
          for (const p of internal) b.extend([p.lat, p.lng]);
          map.fitBounds(b.pad(0.25), { maxZoom: 16 });
        } else {
          const region = regionFor(focusProvincia);
          map.setView(region.center, region.minZoom + 2);
        }
      };
      frameRef.current = frame;
      frame();
    }

    void paint();
    return () => {
      cancelled = true;
    };
  }, [rows, points, status, focusMunicipio, focusProvincia]);

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
        const glyph = renderToStaticMarkup(<MapPin weight="fill" size={16} />);
        const icon = L.divIcon({
          className: "",
          html: `<div class="map-pin map-pin--anchor">${glyph}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 28],
        });
        if (anchorMarkerRef.current) {
          anchorMarkerRef.current.setLatLng([lat, lng]);
        } else {
          anchorMarkerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
          anchorMarkerRef.current.on("dragend", () => {
            const p = anchorMarkerRef.current.getLatLng();
            onPick?.(p.lat, p.lng);
          });
        }
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
    <div className="card-ticket overflow-hidden">
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[60dvh] w-full bg-paper"
          role="application"
          aria-label="Mapa de disponibilidad"
        />
        <button
          type="button"
          onClick={() => frameRef.current?.()}
          aria-label="Centrar en los resultados"
          title="Centrar en los resultados"
          className="btn btn-ghost absolute right-3 top-3 z-[500] h-10 w-10 justify-center rounded-md !p-0"
        >
          <Crosshair size={20} weight="bold" aria-hidden />
        </button>
      </div>

      {/* Legend doubles as required attribution for OSM tiles */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-dashed border-line px-3 py-2 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`map-pin map-pin--confirmed`} style={{ width: 18, height: 18, fontSize: 10 }}>
            ✚
          </span>
          Hay · confirmado
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`map-pin map-pin--uncertain`} style={{ width: 18, height: 18, fontSize: 10 }}>
            ?
          </span>
          Había · sin confirmar
        </span>
        {points && (
          <>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="map-pin map-pin--out" style={{ width: 18, height: 18, fontSize: 10 }}>
                ✕
              </span>
              Agotado
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
