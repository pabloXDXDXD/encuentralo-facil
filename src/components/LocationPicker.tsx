"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { MUNICIPIO_CENTERS, regionFor } from "@/lib/geo";

type Props = {
  municipio?: string | null;
  provincia?: string | null;
  onChange: (lat: number | null, lng: number | null) => void;
};

/**
 * Tiny map for placing a new store: click to drop/move the pin.
 * Opens centered on the selected municipality so the first tap is close by.
 */
export default function LocationPicker({ municipio, provincia, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;

        const region = regionFor(provincia);
        const mc = municipio ? MUNICIPIO_CENTERS[municipio] : undefined;
        const center: [number, number] = mc ? [mc.lat, mc.lng] : region.center;

        const map = L.map(containerRef.current, {
          center,
          zoom: mc ? 14 : 12,
          minZoom: region.minZoom,
          maxZoom: 17,
          maxBounds: L.latLngBounds(region.bounds).pad(0.08),
          maxBoundsViscosity: 0.9,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        map.on("click", (e) => {
          const latlng = { lat: e.latlng.lat, lng: e.latlng.lng };
          if (!markerRef.current) {
            markerRef.current = L.marker(latlng, { draggable: true }).addTo(map);
            markerRef.current.on("dragend", () => {
              const p = markerRef.current!.getLatLng();
              onChange(p.lat, p.lng);
            });
          } else {
            markerRef.current.setLatLng(latlng);
          }
          onChange(latlng.lat, latlng.lng);
        });

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
      markerRef.current = null;
    };
    // Recreate when the target municipality changes so the picker re-centers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipio]);

  function clearPin() {
    markerRef.current?.remove();
    markerRef.current = null;
    onChange(null, null);
  }

  return (
    <div className="overflow-hidden rounded-md border-2 border-ink">
      <div ref={containerRef} className="h-56 w-full bg-paper" aria-label="Ubicación de la tienda" />
      <div className="flex items-center justify-between gap-2 border-t-2 border-dashed border-line px-3 py-1.5 text-xs text-ink-soft">
        <span>
          {status === "loading" && "Cargando mapa…"}
          {status === "error" && "Mapa no disponible."}
          {status === "ready" &&
            `Toca el mapa para ubicar la tienda${municipio ? ` en ${municipio}` : ""}.`}
        </span>
        <button type="button" onClick={clearPin} className="font-semibold text-accent underline">
          Quitar
        </button>
      </div>
    </div>
  );
}
