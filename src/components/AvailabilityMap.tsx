"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { Crosshair } from "@phosphor-icons/react";
import { MUNICIPIO_CENTERS, regionFor } from "@/lib/geo";
import { timeAgo } from "@/lib/format";
import type { HomeRow } from "@/components/HomeView";

/**
 * OpenStreetMap view of availability points.
 * - Camera locked to the selected province region; municipality selection
 *   frames ONLY that municipality and dims the rest of the province.
 * - Marker confidence: solid green = confirmed (2+ reporters or <30 min old),
 *   cream = single report. Out-of-stock claims are list-only by design.
 * - Zoom buttons hidden (gestures/wheel); a recenter button stays.
 */

type Props = {
  rows: HomeRow[];
  focusMunicipio?: string | null;
  focusProvincia?: string | null;
};

/** Approximate municipality radius for boundary drawing (meters). */
function municipioRadius(provincia?: string | null): number {
  return provincia === "Sancti Spíritus" ? 9_000 : 2_600;
}

function circlePoints(
  lat: number,
  lng: number,
  radiusM: number,
  steps = 40,
): [number, number][] {
  const pts: [number, number][] = [];
  const latDeg = radiusM / 111_320;
  const lngDeg = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push([lat + Math.sin(t) * latDeg, lng + Math.cos(t) * lngDeg]);
  }
  return pts;
}

export default function AvailabilityMap({ rows, focusMunicipio, focusProvincia }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
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
          zoomControl: false, // gestures/wheel suffice; recenter stays
          attributionControl: false, // credit rendered in our own legend bar
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

  // Paint markers/boundaries and define the framing function.
  useEffect(() => {
    if (status !== "ready") return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    async function paint() {
      const L = (await import("leaflet")).default;
      const region = regionFor(focusProvincia);
      if (cancelled || !map) return;

      map.setMinZoom(region.minZoom);
      map.setMaxBounds(L.latLngBounds(region.bounds).pad(0.08));

      map.eachLayer((layer) => {
        if ("_url" in layer) return; // keep tiles
        map.removeLayer(layer);
      });

      const stockPoints = rows.filter(
        (r) => r.lat !== null && r.lng !== null && r.availability === "available",
      );

      // --- Municipality boundary + dim-out mask ---------------------------
      const mc = focusMunicipio ? MUNICIPIO_CENTERS[focusMunicipio] : undefined;
      if (mc) {
        const ring = circlePoints(mc.lat, mc.lng, municipioRadius(focusProvincia));

        // Dim everything in the region EXCEPT this municipality (polygon hole).
        const outer: [number, number][] = [
          [region.bounds[1][0] + 1, region.bounds[0][1] - 1],
          [region.bounds[1][0] + 1, region.bounds[1][1] + 1],
          [region.bounds[0][0] - 1, region.bounds[1][1] + 1],
          [region.bounds[0][0] - 1, region.bounds[0][1] - 1],
        ];
        L.polygon([outer, ring], {
          stroke: false,
          fillColor: "#1b1813",
          fillOpacity: 0.16,
          interactive: false,
        }).addTo(map);

        // Dashed delimitation line.
        L.polygon(ring, {
          color: "#c2410c",
          weight: 2,
          dashArray: "6 6",
          fill: false,
          interactive: false,
        }).addTo(map);
      }

      // --- Markers ---------------------------------------------------------
      for (const p of stockPoints) {
        const ageMin = (Date.now() - new Date(p.last_seen_at).getTime()) / 60_000;
        const strong = p.reporter_count >= 2 || ageMin <= 30;

        const icon = L.divIcon({
          className: "",
          html: `<div class="map-pin ${strong ? "map-pin--strong" : "map-pin--weak"}" title="${
            strong ? "Confirmado" : "Reporte único"
          }">${p.emoji}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -14],
        });

        const price =
          p.price_from !== null
            ? `<div class="popup-price">$${p.price_from}</div>`
            : "";
        const html = `
          <div class="popup-ticket">
            <div class="popup-name"><span>${p.product_name}</span><span class="stamp ${
              strong ? "stamp-hay" : "stamp-hay"
            }" style="transform:none;font-size:10px;padding:0 4px;">${
              strong ? "Confirmado" : "Fresco"
            }</span></div>
            ${price}
            <div class="popup-meta">${p.store_name}<br/>${p.barrio} · ${timeAgo(
              p.last_seen_at,
            )}${p.reporter_count > 1 ? ` · ${p.reporter_count} reportes` : ""}</div>
          </div>`;

        L.marker([Number(p.lat), Number(p.lng)], { icon })
          .bindPopup(html)
          .addTo(map);
      }

      // --- Framing (also used by the recenter button) ----------------------
      const frame = () => {
        if (mc) {
          if (stockPoints.length > 0) {
            const b = L.latLngBounds([]);
            for (const p of stockPoints) b.extend([Number(p.lat), Number(p.lng)]);
            b.extend([mc.lat, mc.lng]);
            map.fitBounds(b.pad(0.25), { maxZoom: 15 });
          } else {
            map.setView([mc.lat, mc.lng], 14);
          }
        } else if (stockPoints.length > 1) {
          const b = L.latLngBounds([]);
          for (const p of stockPoints) b.extend([Number(p.lat), Number(p.lng)]);
          map.fitBounds(b.pad(0.25), { maxZoom: 14 });
        } else {
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
  }, [rows, status, focusMunicipio, focusProvincia]);

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
          aria-label="Centrar en mi zona"
          title="Centrar en mi zona"
          className="btn btn-ghost absolute right-3 top-3 z-[500] h-10 w-10 justify-center rounded-md !p-0"
        >
          <Crosshair size={20} weight="bold" aria-hidden />
        </button>
      </div>

      {/* Legend doubles as required attribution for OSM tiles */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-dashed border-line px-3 py-2 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="map-pin map-pin--strong" style={{ width: 18, height: 18, fontSize: 10 }}>
            ✚
          </span>
          Confirmado (2+ personas o &lt;30 min)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="map-pin map-pin--weak" style={{ width: 18, height: 18, fontSize: 10 }}>
            ?
          </span>
          Reporte único sin confirmar
        </span>
        <span className="ml-auto">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
