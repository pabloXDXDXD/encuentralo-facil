"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { Crosshair } from "@phosphor-icons/react";
import { MUNICIPIO_CENTERS, regionFor } from "@/lib/geo";
import { ProductIcon } from "@/lib/product-icons";
import { timeAgo } from "@/lib/format";
import type { HomeRow } from "@/components/HomeView";

/**
 * OpenStreetMap view of availability points.
 * - Camera locked to the selected province region.
 * - Marker confidence: solid green = confirmed (2+ reporters or <30 min old),
 *   cream = single report. Out-of-stock claims are list-only by design.
 * - No boundary overlays: kept intentionally minimal after flaky experiments.
 */

type Props = {
  rows: HomeRow[];
  focusMunicipio?: string | null;
  focusProvincia?: string | null;
};

type Ring = [number, number][];

const EPS = 1e-9;

function samePt(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

/** Join Overpass way segments endpoint-to-endpoint into closed rings. */
function assembleClosedRings(segments: Ring[]): Ring[] {
  const pool: Ring[] = segments.filter((s) => s.length > 1).map((s) => [...s]);
  const rings: Ring[] = [];

  while (pool.length > 0) {
    let chain = pool.shift()!;

    for (;;) {
      if (samePt(chain[0], chain[chain.length - 1])) break;

      const end = chain[chain.length - 1];
      const iFwd = pool.findIndex((s) => samePt(s[0], end));
      const iRev = pool.findIndex((s) => samePt(s[s.length - 1], end));
      if (iFwd === -1 && iRev === -1) break;

      const idx = iFwd >= 0 ? iFwd : iRev;
      let seg = pool.splice(idx, 1)[0];
      if (iFwd === -1) seg = [...seg].reverse();
      chain = chain.concat(seg.slice(1));
    }

    if (chain.length > 3 && samePt(chain[0], chain[chain.length - 1])) {
      rings.push(chain);
    }
  }

  return rings;
}

/**
 * Fetch a real OSM administrative polygon. Admin levels in Cuba:
 *   4 = province · 6 = municipality (Havana's municipios) · 8 = city seats.
 */
async function loadAdminBoundary(
  name: string,
  adminLevel: string,
  provincia: string | null,
): Promise<Ring[] | null> {
  const b = regionFor(provincia).bounds;
  const bbox = `${b[0][0] - 1},${b[0][1] - 1},${b[1][0] + 1},${b[1][1] + 1}`;
  const query = `[out:json][timeout:25];rel["boundary"="administrative"]["name"="${name}"]["admin_level"="${adminLevel}"](${bbox});out geom;`;
  const url =
    "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "DondeHay/0.1" },
  });
  if (!res.ok) return null;

  const json = await res.json();
  type OverpassRel = {
    type: string;
    tags?: { name?: string };
    members?: { role?: string; geometry?: { lat: number; lon: number }[] }[];
  };
  const elements = json.elements as OverpassRel[];
  const rel =
    elements.find((e) => e.type === "relation" && e.tags?.name === name) ??
    elements.find((e) => e.type === "relation");
  if (!rel?.members) return null;

  // Boundary ways are open segments; assemble them into closed rings.
  const segments: Ring[] = rel.members
    .filter((m) => m.geometry && m.role !== "inner")
    .map((m) => m.geometry!.map((g) => [g.lat, g.lon] as [number, number]));

  const rings = assembleClosedRings(segments);
  return rings.length > 0 ? rings : null;
}

/** Approximate radius for the fallback delimitation circle (meters). */
function municipioRadius(provincia?: string | null): number {
  return provincia && provincia !== "La Habana" ? 9_000 : 2_600;
}

function circlePoints(lat: number, lng: number, radiusM: number): Ring {
  const pts: Ring = [];
  const latDeg = radiusM / 111_320;
  const lngDeg = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    pts.push([lat + Math.sin(t) * latDeg, lng + Math.cos(t) * lngDeg]);
  }
  return pts;
}

const glyphCache = new Map<string, string>();

/** In-memory boundary cache: switching municipios never refetches. */
const boundaryCache = new Map<string, Ring[]>();

/** Render a Phosphor icon to an SVG string once per product. */
function productGlyph(slug: string): string {
  let html = glyphCache.get(slug);
  if (html === undefined) {
    html = renderToStaticMarkup(<ProductIcon slug={slug} size={15} />);
    glyphCache.set(slug, html);
  }
  return html;
}

export default function AvailabilityMap({ rows, focusMunicipio, focusProvincia }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const boundaryRingsRef = useRef<Ring[] | null>(null);
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
      boundaryRingsRef.current = null;
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
      const region = regionFor(focusProvincia);
      if (cancelled || !map) return;

      map.eachLayer((layer) => {
        if ("_url" in layer) return; // keep tiles
        map.removeLayer(layer);
      });

      // Only mappable stock points; out-of-stock claims stay list-only.
      const stockPoints = rows.filter(
        (r) => r.lat !== null && r.lng !== null && r.availability === "available",
      );

      // --- Boundary of selected city/municipality --------------------------
      // LOW priority on load: markers paint immediately; boundaries arrive
      // when Overpass answers (memory cache + Service Worker cache).
      const mc = focusMunicipio ? MUNICIPIO_CENTERS[focusMunicipio] : undefined;

      const drawBoundary = (rings: Ring[]) => {
        if (cancelled || !mapRef.current) return;
        const mapNow = mapRef.current;
        const outer: [number, number][] = [
          [region.bounds[1][0] + 1, region.bounds[0][1] - 1],
          [region.bounds[1][0] + 1, region.bounds[1][1] + 1],
          [region.bounds[0][0] - 1, region.bounds[1][1] + 1],
          [region.bounds[0][0] - 1, region.bounds[0][1] - 1],
        ];
        L.polygon([outer, ...rings], {
          stroke: false,
          fillColor: "#1b1813",
          fillOpacity: 0.16,
          interactive: false,
        }).addTo(mapNow);
        for (const ring of rings) {
          L.polygon(ring, {
            color: "#c2410c",
            weight: 2,
            dashArray: "6 6",
            fill: false,
            interactive: false,
          }).addTo(mapNow);
        }
        frameRef.current?.(); // re-frame once the real shape is known
      };

      if (mc && focusMunicipio) {
        const levels = focusProvincia === "La Habana" ? ["6"] : ["8", "6"];
        const cacheKey = `${focusMunicipio}|${levels.join(",")}|${focusProvincia ?? ""}`;
        const cached = boundaryCache.get(cacheKey);
        if (cached) {
          boundaryRingsRef.current = cached;
          drawBoundary(cached);
        } else {
          void (async () => {
            let fetched: Ring[] | null = null;
            for (const level of levels) {
              try {
                fetched = await loadAdminBoundary(
                  focusMunicipio!,
                  level,
                  focusProvincia ?? null,
                );
              } catch {
                fetched = null;
              }
              if (fetched || cancelled) break;
            }
            if (!fetched && !cancelled && mc) {
              fetched = [circlePoints(mc.lat, mc.lng, municipioRadius(focusProvincia))];
            }
            if (!fetched || cancelled) return;
            boundaryCache.set(cacheKey, fetched);
            boundaryRingsRef.current = fetched;
            drawBoundary(fetched);
          })();
        }
      } else if (!focusMunicipio && focusProvincia === "La Habana") {
        // Whole-city view: La Habana's own silhouette (admin_level=4).
        // Also low priority: fetched in the background, drawn on arrival.
        const cacheKey = "silueta-habana|4";
        const cached = boundaryCache.get(cacheKey);
        if (cached) {
          boundaryRingsRef.current = cached;
          for (const ring of cached) {
            L.polygon(ring, {
              color: "#c2410c",
              weight: 3,
              dashArray: "8 6",
              fill: false,
              interactive: false,
            }).addTo(map);
          }
          frameRef.current?.();
        } else {
          void (async () => {
            try {
              const rings = await loadAdminBoundary("La Habana", "4", focusProvincia);
              if (!rings || cancelled) return;
              boundaryCache.set(cacheKey, rings);
              boundaryRingsRef.current = rings;
              if (!mapRef.current) return;
              for (const ring of rings) {
                L.polygon(ring, {
                  color: "#c2410c",
                  weight: 3,
                  dashArray: "8 6",
                  fill: false,
                  interactive: false,
                }).addTo(mapRef.current);
              }
              frameRef.current?.();
            } catch {
              /* silhouette is progressive enhancement */
            }
          })();
        }
      }

      for (const p of stockPoints) {
        const ageMin = (Date.now() - new Date(p.last_seen_at).getTime()) / 60_000;
        const strong = p.reporter_count >= 2 || ageMin <= 30;

        const icon = L.divIcon({
          className: "",
          html: `<div class="map-pin ${strong ? "map-pin--strong" : "map-pin--weak"}">${productGlyph(
            p.product_slug,
          )}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -14],
        });

        const price =
          p.price_from !== null
            ? `<div class="popup-price">$${p.price_from}</div>`
            : "";
        const badge = strong ? "Confirmado" : "Fresco";
        const html = `
          <div class="popup-ticket">
            <div class="popup-name"><span>${p.product_name}</span><span class="stamp stamp-hay" style="transform:none;font-size:10px;padding:0 4px;">${badge}</span></div>
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
      // Priority: the real boundary polygon when known (nothing gets cut),
      // then stock points, then region default.
      const frame = () => {
        const mc = focusMunicipio ? MUNICIPIO_CENTERS[focusMunicipio] : undefined;
        if (mc && boundaryRingsRef.current) {
          const b = L.latLngBounds([]);
          for (const ring of boundaryRingsRef.current) {
            for (const pt of ring) b.extend(pt);
          }
          map.fitBounds(b.pad(0.12), { maxZoom: 16 });
          return;
        }
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
          <span
            aria-hidden
            className="map-pin map-pin--strong"
            style={{ width: 18, height: 18, fontSize: 10 }}
          >
            ✚
          </span>
          Confirmado (2+ personas o &lt;30 min)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="map-pin map-pin--weak"
            style={{ width: 18, height: 18, fontSize: 10 }}
          >
            ?
          </span>
          Reporte único
        </span>
        <span className="ml-auto">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
