"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { HomeRow } from "@/components/HomeView";

/**
 * OpenStreetMap view of availability points.
 * - Leaflet dynamically imported (never in the initial bundle).
 * - Camera hard-limited to the Havana region + minZoom so users can't wander
 *   into tiles they don't need (data costs).
 * - Municipality focus loads ONLY that municipality: known points get a tight
 *   fitBounds; empty ones use fixed centroids so the tile request stays local.
 * - The Service Worker caches OSM tiles cache-first: revisits cost 0 data.
 */

const HAVANA_BOUNDS: [[number, number], [number, number]] = [
  [23.0, -82.48],
  [23.24, -82.28],
];

/** Approximate centroids so an empty municipality still frames locally. */
const MUNICIPIO_CENTERS: Record<string, { lat: number; lng: number }> = {
  "Habana Vieja": { lat: 23.14, lng: -82.36 },
  "Centro Habana": { lat: 23.145, lng: -82.378 },
  "Diez de Octubre": { lat: 23.098, lng: -82.383 },
  Cerro: { lat: 23.118, lng: -82.372 },
  "Plaza de la Revolución": { lat: 23.135, lng: -82.393 },
  Marianao: { lat: 23.128, lng: -82.437 },
  "La Lisa": { lat: 23.131, lng: -82.458 },
  Boyeros: { lat: 23.065, lng: -82.415 },
  Playa: { lat: 23.115, lng: -82.42 },
  "Arroyo Naranjo": { lat: 23.073, lng: -82.356 },
  "San Miguel del Padrón": { lat: 23.113, lng: -82.34 },
  Cotorro: { lat: 23.095, lng: -82.288 },
  Guanabacoa: { lat: 23.123, lng: -82.295 },
  Regla: { lat: 23.127, lng: -82.333 },
  "Habana del Este": { lat: 23.156, lng: -82.322 },
};

type Props = {
  rows: HomeRow[];
  focusMunicipio?: string | null;
  focusProvincia?: string | null;
};

export default function AvailabilityMap({ rows, focusMunicipio, focusProvincia }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          center: [23.12, -82.38],
          zoom: 12,
          minZoom: 11,
          maxZoom: 17,
          maxBounds: L.latLngBounds(HAVANA_BOUNDS).pad(0.08),
          maxBoundsViscosity: 0.9,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        mapRef.current = map;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void boot();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Paint markers and frame the camera on every selection/data change.
  useEffect(() => {
    if (status !== "ready") return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    async function paint() {
      const L = (await import("leaflet")).default;
      if (cancelled || !map) return;

      map.eachLayer((layer) => {
        if ("_url" in layer) return; // keep the tile layer
        map.removeLayer(layer);
      });

      // Only mappable stock points; out-of-stock claims stay list-only.
      const points = rows.filter(
        (r) => r.lat !== null && r.lng !== null && r.availability === "available",
      );

      const bounds = L.latLngBounds([]);
      for (const p of points) {
        const pos = L.latLng(Number(p.lat), Number(p.lng));
        bounds.extend(pos);
        L.circleMarker(pos, {
          radius: 8,
          color: "#14532d",
          weight: 2,
          fillColor: "#22c55e",
          fillOpacity: 0.9,
        })
          .bindPopup(
            `<b>${p.product_name}</b>${p.price_from !== null ? ` · $${p.price_from}` : ""}<br/>${p.store_name}<br/><small>${p.barrio}</small>`,
          )
          .addTo(map);
      }

      if (focusMunicipio && MUNICIPIO_CENTERS[focusMunicipio]) {
        if (points.length > 0 && bounds.isValid()) {
          map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
        } else {
          const c = MUNICIPIO_CENTERS[focusMunicipio];
          map.setView([c.lat, c.lng], 14);
        }
      } else if (focusProvincia && focusProvincia !== "La Habana") {
        // Non-Havana provinces have no bounded region yet; frame whatever exists.
        if (points.length > 0 && bounds.isValid()) {
          map.fitBounds(bounds.pad(0.35), { maxZoom: 15 });
        }
      } else {
        // Province-wide view: the whole city extent.
        map.fitBounds(L.latLngBounds(HAVANA_BOUNDS));
      }
    }

    void paint();
    return () => {
      cancelled = true;
    };
  }, [rows, status, focusMunicipio, focusProvincia]);

  return (
    <div className="card-ticket overflow-hidden">
      <div
        ref={containerRef}
        className="h-[60dvh] w-full bg-paper"
        role="application"
        aria-label="Mapa de disponibilidad"
      />
      <div className="border-t-2 border-dashed border-line px-3 py-2 text-xs text-ink-soft">
        {status === "loading" && "Cargando mapa…"}
        {status === "error" &&
          "El mapa no pudo cargar. Revisa tu conexión — la lista sigue funcionando."}
        {status === "ready" && (
          <>
            {focusMunicipio
              ? `Mostrando solo ${focusMunicipio} · `
              : "Vista provincial · "}
            Puntos verdes = hay stock · © OpenStreetMap contributors · tiles en caché
          </>
        )}
      </div>
    </div>
  );
}
