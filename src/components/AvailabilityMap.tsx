"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { Map as LeafletMap } from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { Check, Crosshair, MapPin, Plus, Question, X } from "@phosphor-icons/react";
import { MUNICIPIO_CENTERS, REGIONS, regionFor } from "@/lib/geo";
import { ProductIcon } from "@/lib/product-icons";
import { timeAgo } from "@/lib/format";
import { quickMarkReport } from "@/lib/quick-mark";

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
  /**
   * Vista de pais (modo "elegir punto" del Home): ignora el foco de
   * provincia/municipio y abre la camara encuadrando Cuba completa.
   */
  countryView?: boolean;
  /** Appends a "Reportar aqui" link to every availability popup. */
  popupReportLink?: boolean;
  /** Visibilidad de estados activa (chips de filtro del home): filtra la leyenda. */
  legendStatuses?: Partial<Record<MapPoint["status"], boolean>>;
};

export type HomeRowLike = {
  store_id: string;
  store_name: string;
  /** Los lugares creados por clustering no tienen barrio (RPC sin geocodificacion inversa). */
  barrio: string | null;
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

/**
 * Punto place-first del mapa. La fila de busqueda trae los valores bajo los
 * nombres legados store_id/store_name (D5), pero ya son uuid/etiqueta de
 * places; la etiqueta puede ser generada ("Punto en ...") cuando nadie nombro
 * el lugar.
 */
export type MapPoint = {
  place_id: string;
  lat: number;
  lng: number;
  slug: string;
  product_name: string;
  place_label: string;
  /** Null en lugares creados por clustering (sin geocodificacion inversa). */
  barrio: string | null;
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
  confirmed: "Hay (<24h)",
  stale: "Hay (no seguro)",
  out: "Ya no hay",
  unknown: "Sin datos",
};

/** Clase del stamp del popup segun estado (mismos colores que los pines). */
const STATUS_STAMP: Record<MapPoint["status"], string> = {
  confirmed: "stamp-hay",
  stale: "stamp-stale",
  out: "stamp-nohay",
  unknown: "stamp-unknown",
};

/** Filas de leyenda por estado: clase de pin, texto y glifo. */
const LEGEND_META: Record<
  MapPoint["status"],
  { cls: string; label: string; icon: ReactNode }
> = {
  confirmed: {
    cls: "map-pin--confirmed",
    label: "Hay (<24h)",
    icon: <Plus size={10} weight="bold" />,
  },
  stale: {
    cls: "map-pin--uncertain",
    label: "Hay (no seguro)",
    icon: <Question size={10} weight="bold" />,
  },
  out: {
    cls: "map-pin--out",
    label: "Ya no hay",
    icon: <X size={10} weight="bold" />,
  },
  unknown: { cls: "map-pin--unknown", label: "Sin datos", icon: null },
};

/** Orden canonico de los estados; un grupo de clusters por cada uno. */
const STATUS_ORDER: MapPoint["status"][] = ["confirmed", "stale", "out", "unknown"];

type BrowseRow = NonNullable<Props["rows"]>[number];

/** Estado del pin para una fila del snapshot browse. */
function browseStatus(r: BrowseRow): MapPoint["status"] {
  return r.availability === "available"
    ? "confirmed"
    : r.status === "habia"
      ? "stale"
      : r.status === "ya_no_hay"
        ? "out"
        : "unknown";
}

/** Mejor disponibilidad primero; desempate por precio mas bajo. */
const BROWSE_RANK: Record<MapPoint["status"], number> = {
  confirmed: 0,
  stale: 1,
  unknown: 2,
  out: 3,
};

/** Fallback urbano para elegir punto sin provincia conocida (zona seed). */
const PICK_FALLBACK_CENTER: [number, number] = [23.12, -82.38];

type InternalPoint = {
  key: string;
  placeId: string;
  lat: number;
  lng: number;
  cls: string;
  statusKey: MapPoint["status"];
  glyphSlug: string;
  productName: string;
  placeLabel: string;
  barrio: string | null;
  priceFrom: number | null;
  reporterCount: number;
  lastSeenAt: string | null;
  badge: string;
  /** Browse: cuantas filas de producto se agregaron en este lugar. */
  placeVariants?: number;
};

const glyphCache = new Map<string, string>();

/** Zoom maximo del mapa; a este nivel el clustering se desactiva por completo. */
const MAP_MAX_ZOOM = 17;

/** Zoom minimo en vista de pais (elegir punto): permite encuadrar Cuba entera. */
const COUNTRY_MIN_ZOOM = 5;

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

/** Glifo generico de lugar para pines browse sin producto activo. */
function placeGlyph(): string {
  let html = glyphCache.get("__place__");
  if (html === undefined) {
    html = renderToStaticMarkup(<MapPin weight="fill" size={13} />);
    glyphCache.set("__place__", html);
  }
  return html;
}

/** Inline phosphor icon markup for the popup "Reportar aqui" link. */
function reportLinkGlyph(): string {
  let html = glyphCache.get("__report_link__");
  if (html === undefined) {
    html = renderToStaticMarkup(<MapPin size={12} weight="bold" />);
    glyphCache.set("__report_link__", html);
  }
  return html;
}

/** Glifos inline para las acciones de marcado rapido del popup. */
function markYesGlyph(): string {
  let html = glyphCache.get("__mark_yes__");
  if (html === undefined) {
    html = renderToStaticMarkup(<Check size={12} weight="bold" />);
    glyphCache.set("__mark_yes__", html);
  }
  return html;
}

function markNoGlyph(): string {
  let html = glyphCache.get("__mark_no__");
  if (html === undefined) {
    html = renderToStaticMarkup(<X size={12} weight="bold" />);
    glyphCache.set("__mark_no__", html);
  }
  return html;
}

/** Escapa datos de la base (nombres definidos por usuarios) para atributos HTML. */
function escAttr(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Marcado rapido en curso por lugar+producto: ignora toques repetidos
// aunque el popup se haya cerrado y reabierto durante el envio.
const busyMarks = new Set<string>();

async function handlePopupMark(btn: HTMLElement) {
  const d = btn.dataset;
  const key = `${d.placeId}:${d.productSlug}`;
  if (!d.placeId || !d.productSlug || !d.status || busyMarks.has(key)) return;
  busyMarks.add(key);

  // Deshabilitar ambos botones del popup mientras vuela el envio.
  const marksEl = btn.closest(".popup-marks");
  marksEl?.querySelectorAll<HTMLButtonElement>(".popup-mark").forEach((b) => {
    b.disabled = true;
  });

  const res = await quickMarkReport({
    placeId: d.placeId,
    placeName: d.placeName ?? "",
    productSlug: d.productSlug,
    productName: d.productName ?? "",
    availability: d.status === "out_of_stock" ? "out_of_stock" : "available",
  });

  // El popup pudo cerrarse (btn desconectado): solo tocar el DOM si sigue vivo.
  if (marksEl && btn.isConnected) {
    marksEl.innerHTML = res.ok
      ? '<span class="stamp stamp--flat stamp-hay popup-mark-done">Reportado ✓</span>'
      : `<span class="popup-mark-error">${escAttr(res.error)}</span>`;
  }
  busyMarks.delete(key);
}

/** Delegacion de clicks: un solo listener en el contenedor del mapa. */
function onPopupClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  const btn = target?.closest?.(".popup-mark");
  if (btn instanceof HTMLElement) void handlePopupMark(btn);
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
  countryView,
  popupReportLink,
  legendStatuses,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const anchorMarkerRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  // Ultima firma de encuadre aplicada: evita re-fit identicos y respeta la
  // camara que el usuario mueve a mano mientras los parametros no cambien.
  const lastFrameKeyRef = useRef<string>("");
  // Fuerza un unico reencuadre extra (boton "centrar") con la firma vigente.
  const forceFrameRef = useRef(false);
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
        // Vista de pais: sin foco de provincia (regionFor(null) = Cuba).
        const region = regionFor(countryView ? null : focusProvincia);
        if (cancelled || !containerRef.current) return;

        const mc =
          !countryView && focusMunicipio
            ? MUNICIPIO_CENTERS[focusMunicipio]
            : undefined;
        const map = L.map(containerRef.current, {
          center: mc ? [mc.lat, mc.lng] : region.center,
          zoom: mc ? 14 : countryView ? COUNTRY_MIN_ZOOM + 1 : region.minZoom + 1,
          minZoom: countryView ? COUNTRY_MIN_ZOOM : region.minZoom,
          maxZoom: MAP_MAX_ZOOM,
          zoomControl: false,
          // El credito obligatorio es el de OpenStreetMap; el prefijo "Leaflet"
          // que el control añade por defecto se elimina (control dedicado abajo).
          attributionControl: false,
          maxBounds: L.latLngBounds(region.bounds).pad(0.08),
          maxBoundsViscosity: 0.9,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        L.control.attribution({ prefix: false }).addTo(map);

        mapRef.current = map;
        setMapInstance(map);
        // Los popups de Leaflet viven dentro del contenedor del mapa: un solo
        // listener delegado aqui cubre los botones .popup-mark de todos.
        containerRef.current.addEventListener("click", onPopupClick);
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
      containerRef.current?.removeEventListener("click", onPopupClick);
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
          key: p.place_id + p.slug + p.status,
          placeId: p.place_id,
          lat: p.lat,
          lng: p.lng,
          cls: STATUS_CLASS[p.status],
          statusKey: p.status,
          glyphSlug: p.slug,
          productName: p.product_name,
          placeLabel: p.place_label,
          barrio: p.barrio,
          priceFrom: p.price_from,
          // El wire trae reporter_count como string (bigint de Postgres):
          // coercion numerica para que la pluralizacion (=== 1) funcione.
          reporterCount: Number(p.reporter_count),
          lastSeenAt: p.last_seen_at,
          badge: STATUS_BADGE[p.status],
        }));
      } else {
        // UN pin por LUGAR en browse (paradigma place-era): el snapshot trae
        // filas por lugar+producto y sin busqueda activa los productos sobran.
        // Gana la fila de mejor disponibilidad y, a igualdad, mas barata.
        const byPlace = new Map<string, { winner: BrowseRow; variants: number }>();
        for (const r of rows ?? []) {
          if (r.lat === null || r.lng === null) continue;
          const g = byPlace.get(r.store_id);
          if (!g) {
            byPlace.set(r.store_id, { winner: r, variants: 1 });
            continue;
          }
          g.variants += 1;
          const w = g.winner;
          const rankR = BROWSE_RANK[browseStatus(r)];
          const rankW = BROWSE_RANK[browseStatus(w)];
          if (
            rankR < rankW ||
            (rankR === rankW && (r.price_from ?? Infinity) < (w.price_from ?? Infinity))
          ) {
            g.winner = r;
          }
        }
        for (const { winner: r, variants } of byPlace.values()) {
          const st = browseStatus(r);
          internal.push({
            key: r.store_id,
            // Nombres legados del snapshot (D5): los valores ya son de places.
            placeId: r.store_id,
            lat: Number(r.lat),
            lng: Number(r.lng),
            cls: STATUS_CLASS[st],
            statusKey: st,
            // Sin producto activo: glifo generico de lugar y popup resumido.
            glyphSlug: "",
            productName: r.product_name,
            placeLabel: r.store_name,
            barrio: r.barrio,
            priceFrom: r.price_from,
            reporterCount: Number(r.reporter_count),
            lastSeenAt: r.last_seen_at,
            badge: STATUS_BADGE[st],
            placeVariants: variants,
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
        const isPlacePin = p.glyphSlug === "";
        const icon = L.divIcon({
          className: "",
          html: `<div class="map-pin ${p.cls}" title="${p.badge}">${isPlacePin ? placeGlyph() : productGlyph(p.glyphSlug)}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -14],
        });

        const price =
          p.priceFrom !== null && p.priceFrom !== undefined
            ? `<div class="popup-price">$${p.priceFrom}</div>`
            : "";
        // Meta del ticket: hace cuanto se vio y cuantas confirmaciones
        // acumula el lugar para este producto (spec map-first-ui).
        const meta =
          p.lastSeenAt != null
            ? `${timeAgo(p.lastSeenAt)} · ${p.reporterCount} ${
                p.reporterCount === 1 ? "confirmación" : "confirmaciones"
              }`
            : "sin reportes recientes";
        const reportLink = popupReportLink
          ? `<a class="popup-report" href="/reportar?place=${p.placeId}">${reportLinkGlyph()}<span>Reportar aquí</span></a>`
          : "";
        // Marcado rapido: dos acciones que crean un reporte NUEVO sin salir
        // del popup (delegacion de clicks via onPopupClick). Anclan al place.
        const yesLabel = p.statusKey === "out" ? "Hay de nuevo" : "Aún hay";
        const marks = `
            <div class="popup-marks">
              <button type="button" class="popup-mark popup-mark--yes" data-place-id="${p.placeId}" data-product-slug="${escAttr(p.glyphSlug)}" data-place-name="${escAttr(p.placeLabel)}" data-product-name="${escAttr(p.productName)}" data-status="available" aria-label="Reportar que ${p.statusKey === "out" ? "hay de nuevo" : "aún hay"} ${escAttr(p.productName)} en ${escAttr(p.placeLabel)}">${markYesGlyph()}<span>${yesLabel}</span></button>
              <button type="button" class="popup-mark popup-mark--no" data-place-id="${p.placeId}" data-product-slug="${escAttr(p.glyphSlug)}" data-place-name="${escAttr(p.placeLabel)}" data-product-name="${escAttr(p.productName)}" data-status="out_of_stock" aria-label="Reportar que ya no hay ${escAttr(p.productName)} en ${escAttr(p.placeLabel)}">${markNoGlyph()}<span>Ya no hay</span></button>
            </div>`;
        // Ticket enriquecido: el LUGAR manda (titular + stamp de estado),
        // el producto va debajo; precio, tiempo y confirmaciones completan.
        const html = `
          <div class="popup-ticket">
            <div class="popup-name"><span>${escAttr(p.placeLabel)}</span><span class="stamp ${STATUS_STAMP[p.statusKey]} stamp--flat" style="font-size:10px;padding:0 4px;">${p.badge}</span></div>
            ${isPlacePin ? `<div class="popup-meta">${p.placeVariants && p.placeVariants > 1 ? `${p.placeVariants} productos con reportes aquí` : "lugar con reportes"}</div>` : `<div class="popup-product">${escAttr(p.productName)}</div>`}
            ${price}
            <div class="popup-meta">${p.barrio ? `${escAttr(p.barrio)} · ` : ""}${meta}</div>
            ${isPlacePin ? "" : marks}
            ${reportLink}
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
        // Reencuadre solo cuando CAMBIAN los parametros del encuadre (ancla,
        // radio, modo, foco): ni repaints identicos ni arrastres manuales del
        // usuario provocan saltos de camara. El boton centrar fuerza uno.
        const anchorKey = anchor
          ? `${anchor.lat.toFixed(5)},${anchor.lng.toFixed(5)}`
          : "";
        const frameKey = [
          anchorKey,
          radiusMeters ?? "",
          countryView ? "country" : "",
          pickMode ? "pick" : "",
          focusMunicipio ?? "",
          focusProvincia ?? "",
          points ? "search" : "browse",
        ].join("|");
        if (frameKey === lastFrameKeyRef.current && !forceFrameRef.current) return;
        lastFrameKeyRef.current = frameKey;
        forceFrameRef.current = false;
        // Elegir punto (onboarding o re-pick): con punto/ancla ya elegido la
        // camara va cerca de el; sin nada, centro urbano UTIL (municipio ->
        // provincia -> Habana seed) a zoom de ciudad — nunca el mar entero.
        if (pickMode) {
          if (anchor) {
            map.setView([anchor.lat, anchor.lng], DEFAULT_RADIUS_ZOOM, { animate: false });
            return;
          }
          const pickMc = focusMunicipio ? MUNICIPIO_CENTERS[focusMunicipio] : undefined;
          const pickCenter: [number, number] = pickMc
            ? [pickMc.lat, pickMc.lng]
            : focusProvincia && REGIONS[focusProvincia]
              ? regionFor(focusProvincia).center
              : PICK_FALLBACK_CENTER;
          map.setView(pickCenter, 12, { animate: false });
          return;
        }
        // Browse sin busqueda activa: si hay ancla del usuario, la camara ES
        // SU punto elegido (recien pickeado o guardado) — nunca el centroide
        // del municipio ni un fitBounds de pines.
        if (!points && anchor) {
          map.setView([anchor.lat, anchor.lng], DEFAULT_RADIUS_ZOOM, { animate: false });
          return;
        }
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
        // Sin recentrado: el marcador aparece donde se toco y la camara
        // permanece donde esta (saltos de camara desorientan al elegir).
      };

      // Solo clicks dentro de Cuba: toques fuera del bounding nacional (mar,
      // otra isla) se ignoran para no anclar el punto de busqueda por descuido.
      const cubaBounds = L.latLngBounds(regionFor(null).bounds).pad(0.02);
      const handler = (e: L.LeafletMouseEvent) => {
        if (!cubaBounds.contains(e.latlng)) return;
        place(e.latlng.lat, e.latlng.lng);
      };
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
            onClick={() => {
              forceFrameRef.current = true;
              frameRef.current?.();
            }}
            aria-label="Centrar en los resultados"
            title="Centrar en los resultados"
            className="btn btn-ghost absolute right-3 top-3 z-[500] h-10 w-10 justify-center rounded-md !p-0"
          >
            <Crosshair size={20} weight="bold" aria-hidden />
          </button>
        )}
      </div>

      {/* Leyenda DINAMICA: solo los estados presentes en los datos visibles y
          habilitados por los filtros del home. El credito OSM obligatorio vive
          en el control de atribucion del mapa; en modo elegir queda limpio. */}
      {!pickMode &&
        (() => {
          const present = new Set<MapPoint["status"]>();
          for (const p of points ?? []) present.add(p.status);
          for (const r of rows ?? []) {
            if (r.lat === null || r.lng === null) continue;
            present.add(
              r.availability === "available"
                ? "confirmed"
                : r.status === "habia"
                  ? "stale"
                  : r.status === "ya_no_hay"
                    ? "out"
                    : "unknown",
            );
          }
          const items = STATUS_ORDER.filter(
            (k) => present.has(k) && legendStatuses?.[k] !== false,
          );
          if (items.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-dashed border-line px-3 py-2 text-xs text-ink-soft">
              {items.map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`map-pin ${LEGEND_META[k].cls}`}
                    style={{ width: 18, height: 18 }}
                  >
                    {LEGEND_META[k].icon}
                  </span>
                  {LEGEND_META[k].label}
                </span>
              ))}
            </div>
          );
        })()}
    </div>
  );
}
