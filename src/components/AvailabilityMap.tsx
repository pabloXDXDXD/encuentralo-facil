"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import type { HomeRow } from "@/components/HomeView";

/**
 * OpenStreetMap view of availability points.
 * - Leaflet is dynamically imported (never in the initial bundle).
 * - Camera hard-limited to the Havana region + minZoom so users can't
 *   wander into tiles they don't need (data costs).
 * - The Service Worker caches OSM tiles cache-first: revisits cost 0 data.
 */

// Whole-city bounds (incl. adjacent municipalities: Habana del Este, Boyeros...)
const HAVANA_BOUNDS: [[number, number], [number, number]] = [
  [23.0, -82.48],
  [23.24, -82.28],
];

export default function AvailabilityMap({ rows }: { rows: HomeRow[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Boot Leaflet once.
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

  // Paint markers whenever rows change.
  useEffect(() => {
    if (status !== "ready") return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    async function paint() {
      const L = (await import("leaflet")).default;
      if (cancelled || !map) return;

      map.eachLayer((layer) => {
        // Remove old data layers; keep the tile layer (has _url).
        if ("_url" in layer) return;
        map.removeLayer(layer);
      });

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

      if (points.length > 0) {
        map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
      }
    }

    void paint();
    return () => {
      cancelled = true;
    };
  }, [rows, status]);

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
        {status === "ready" &&
          "Puntos verdes = hay stock ahora · © OpenStreetMap contributors · los tiles quedan en caché"}
      </div>
    </div>
  );
}
