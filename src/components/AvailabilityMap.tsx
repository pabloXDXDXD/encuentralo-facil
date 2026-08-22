"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { MUNICIPIO_CENTERS, regionFor } from "@/lib/geo";
import type { HomeRow } from "@/components/HomeView";

/**
 * OpenStreetMap view of availability points.
 * - Leaflet dynamically imported (never in the initial bundle).
 * - Camera limited to the SELECTED PROVINCE region (Havana -> Havana,
 *   Sancti Spíritus -> Sancti Spíritus): users can only load local tiles.
 * - Municipality focus frames ONLY that municipality (fixed centroids when
 *   there are no points yet).
 * - The Service Worker caches OSM tiles cache-first: revisits cost 0 data.
 */

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
        const region = regionFor(focusProvincia);
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          center: region.center,
          zoom: focusMunicipio && MUNICIPIO_CENTERS[focusMunicipio] ? 14 : region.minZoom + 1,
          minZoom: region.minZoom,
          maxZoom: 17,
          maxBounds: L.latLngBounds(region.bounds).pad(0.08),
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
  }, [focusProvincia, focusMunicipio]);

  // Paint markers and frame the camera on every selection/data change.
  useEffect(() => {
    if (status !== "ready") return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    async function paint() {
      const L = (await import("leaflet")).default;
      const region = regionFor(focusProvincia);
      if (cancelled || !map) return;

      // Keep the camera inside the province as selections change.
      map.setMinZoom(region.minZoom);
      map.setMaxBounds(L.latLngBounds(region.bounds).pad(0.08));

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
        if (points.length > 0) {
          map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
        } else {
          const c = MUNICIPIO_CENTERS[focusMunicipio];
          map.setView([c.lat, c.lng], 14);
        }
      } else if (points.length > 1) {
        map.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
      } else {
        map.setView(region.center, region.minZoom + 2);
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
            {focusProvincia ? `${focusProvincia}` : "Cuba"}
            {focusMunicipio ? ` · ${focusMunicipio}` : ""} · Puntos verdes = hay stock · ©
            OpenStreetMap contributors · tiles en caché
          </>
        )}
      </div>
    </div>
  );
}
