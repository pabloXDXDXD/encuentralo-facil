"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Check,
  CheckCircle,
  MapPin,
  Spinner,
  Star,
  Tray,
  Warning,
  X,
} from "@phosphor-icons/react";
import Notice from "@/components/Notice";
import { outboxAdd } from "@/lib/outbox";
import { getDeviceId } from "@/lib/client-device";
import { ProductIcon } from "@/lib/product-icons";
import type { Availability } from "@/lib/repo-types";

const AvailabilityMapDynamic = dynamic(() => import("@/components/AvailabilityMap"), {
  ssr: false,
  loading: () => (
    <div className="card-ticket h-[60dvh] animate-pulse p-4 text-center text-sm text-ink-soft">
      Cargando mapa…
    </div>
  ),
});

type CatalogProduct = { id: string; slug: string; name: string; emoji: string };
type CatalogCategory = { id: string; name: string; emoji: string; products: CatalogProduct[] };
type LatestInfo = { found: boolean; hoursAgo: number | null; reportId: string | null };

type Props = {
  provincia?: string | null;
  /** URL prefills resolved server-side (/reportar?producto=<slug>). */
  initialProduct?: CatalogProduct | null;
  /**
   * Lugar preseleccionado resuelto en el servidor (/reportar?place=<id>;
   * el param legado ?store=<id> se aliasa, D6). El pin se precarga con sus
   * coordenadas; id desconocido o inactivo llega null y el pin arranca vacio.
   */
  initialPlace?: {
    id: string;
    name: string;
    lat: number | null;
    lng: number | null;
    address: string | null;
  } | null;
};

/**
 * Flujo unico de reporte (era places): producto + pin en el mapa. Sin
 * seleccion de tienda: el lugar se resuelve por el placeId preseleccionado
 * (deep link/popup) o por las coordenadas del pin en el servidor.
 */
export default function ReportFlow({ provincia, initialProduct, initialPlace }: Props) {
  const [step, setStep] = useState<"product" | "place">(
    initialProduct ? "place" : "product",
  );
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [product, setProduct] = useState<CatalogProduct | null>(initialProduct ?? null);
  // Lugar existente (deep link o popup): mientras el usuario no toque el
  // mapa el envio va anclado por placeId; al tocar el mapa se pasa a modo
  // coordenadas y el servidor resuelve el lugar mas cercano.
  const [place, setPlace] = useState<{ id: string; name: string } | null>(
    initialPlace ? { id: initialPlace.id, name: initialPlace.name } : null,
  );
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    initialPlace && initialPlace.lat !== null && initialPlace.lng !== null
      ? { lat: initialPlace.lat, lng: initialPlace.lng }
      : null,
  );
  const [label, setLabel] = useState(initialPlace?.name ?? "");
  // Direccion del lugar: precargada si el deep link trae un lugar con ella.
  const [address, setAddress] = useState(initialPlace?.address ?? "");
  const [availability, setAvailability] = useState<Availability>("available");
  const [price, setPrice] = useState("");
  const [stats, setStats] = useState<{ reports: number; votes: number; points: number } | null>(
    null,
  );
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "queued"; offline: boolean }
  >({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  // El ancla guardada del usuario centra el mapa cuando no hay pin.
  const [homeAnchor, setHomeAnchor] = useState<{ lat: number; lng: number } | null>(null);

  // Anti-duplicados: ultimo reporte del dispositivo para lugar+producto.
  const [latest, setLatest] = useState<LatestInfo | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);

  // Load catalog once; fall back to empty grid if unreachable.
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setCatalog(d.categories ?? []))
      .catch(() => setCatalog([]));
  }, []);

  // Contribution stats for this device.
  useEffect(() => {
    fetch("/api/me", { headers: { "x-device-id": getDeviceId() } })
      .then((r) => r.json())
      .then((d) => setStats(d.stats ?? null))
      .catch(() => setStats(null));
  }, []);

  // User's saved search anchor centers the map.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dh_home_anchor");
      if (raw) setHomeAnchor(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Anti-duplicate check on the place step (solo con lugar conocido: con pin
  // manual el lugar se resuelve en el servidor al enviar).
  useEffect(() => {
    if (step !== "place" || !product || !place) {
      setLatest(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ placeId: place.id, productId: product.id });
    fetch(`/api/reports/latest?${params}`, { headers: { "x-device-id": getDeviceId() } })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setLatest({ found: !!d.found, hoursAgo: d.hoursAgo ?? null, reportId: d.reportId ?? null });
      })
      .catch(() => {
        if (!cancelled) setLatest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [step, product, place]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return catalog.map((cat) => ({
      ...cat,
      products: cat.products.filter(
        (p) => !q || p.name.toLowerCase().includes(q),
      ),
    }));
  }, [catalog, productQuery]);

  async function confirmExisting(reportId: string) {
    if (!product || voteBusy) return;
    setVoteBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": getDeviceId() },
        body: JSON.stringify({ reportId, vote: "confirm" }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus({ kind: "queued", offline: false });
        resetAfterDelay();
        return;
      }
      setError(data.error === "already_voted" ? "Ya confirmaste este reporte." : "No se pudo confirmar.");
    } catch {
      setError("Sin conexión para confirmar.");
    } finally {
      setVoteBusy(false);
    }
  }

  async function submit() {
    if (!product || !pin) return;
    setStatus({ kind: "sending" });
    setError(null);

    const base = {
      productId: product.id,
      availability,
      priceCup: price.trim() === "" ? null : Number(price),
      // Nombre y direccion van SIEMPRE: con lugar existente se actualizan si
      // el usuario los edita; con pin manual bautizan al lugar creado.
      label: label.trim() || null,
      address: address.trim() || null,
    };
    // Lugar existente -> placeId; pin manual -> coordenadas.
    const payload = place
      ? { ...base, placeId: place.id }
      : { ...base, lat: pin.lat, lng: pin.lng };

    // Entrada de outbox para los caminos offline/error: placeId XOR lat/lng,
    // igual que el envio en linea (los undefined se omiten al serializar).
    const queueEntry = {
      id: crypto.randomUUID(),
      placeId: place?.id,
      placeName: place?.name ?? null,
      lat: place ? undefined : pin.lat,
      lng: place ? undefined : pin.lng,
      productId: product.id,
      productName: product.name,
      availability,
      priceCup: base.priceCup,
      comment: null,
      queueLevel: null,
      label: base.label,
      address: base.address,
      createdAt: Date.now(),
    };

    const deviceId = getDeviceId();

    // Offline-first write path: queue first if there is no connectivity.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await outboxAdd(queueEntry);
      setStatus({ kind: "queued", offline: true });
      resetAfterDelay();
      return;
    }
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus({ kind: "queued", offline: false });
        resetAfterDelay();
        return;
      }
      if (data.error === "rate_limit_interval") {
        setError("Espera un minuto entre reportes.");
      } else if (data.error === "rate_limit_daily") {
        setError("Alcanzaste el límite de reportes de hoy.");
      } else {
        setError("No se pudo enviar. Se guardó para reintentar.");
        await outboxAdd(queueEntry);
        setStatus({ kind: "queued", offline: true });
      }
    } catch {
      await outboxAdd(queueEntry);
      setStatus({ kind: "queued", offline: true });
    }
    resetSoft();
  }

  function resetAfterDelay() {
    setTimeout(() => {
      setStatus({ kind: "idle" });
      setStep("product");
      setProduct(null);
      setPlace(null);
      setPin(null);
      setLabel("");
      setAddress("");
      setPrice("");
      setLatest(null);
    }, 1800);
  }

  function resetSoft() {
    setPrice("");
  }

  if (status.kind === "queued") {
    return (
      <div className="card-ticket rise p-8 text-center">
        {status.offline ? (
          <Tray aria-hidden size={44} className="mx-auto text-accent" weight="duotone" />
        ) : (
          <p className="stamp-land my-1">
            <span className="stamp stamp-hay px-3 py-1 text-xl">Reportado</span>
          </p>
        )}
        <p className="mt-2 font-display text-xl">
          {status.offline ? "Guardado sin conexión" : "¡Reporte enviado!"}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {status.offline
            ? "Se enviará solo cuando vuelva internet."
            : "Gracias por ayudar a tu barrio."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-2 px-1 font-display text-sm tracking-wide text-ink-soft">
        <li className={step === "product" ? "text-accent" : ""}>1 · Producto</li>
        <li>›</li>
        <li className={step === "place" ? "text-accent" : ""}>2 · Lugar</li>
      </ol>

      {error && (
        <Notice variant="error" className="font-semibold">
          {error}
        </Notice>
      )}

      {step === "product" && (
        <section className="space-y-3">
          <input
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full rounded-md border-2 border-ink bg-card px-3 py-2"
            inputMode="search"
          />
          {filteredProducts.map((cat) =>
            cat.products.length === 0 ? null : (
              <div key={cat.id}>
                <h3 className="px-1 pb-1 pt-2 font-display text-sm tracking-wide text-ink-soft">
                  {cat.emoji} {cat.name}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {cat.products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProduct(p);
                        setStep("place");
                      }}
                      className="btn btn-ghost flex-col gap-1 rounded-md p-3"
                    >
                      <ProductIcon slug={p.slug} size={28} />
                      <span className="text-center text-xs leading-tight">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}
          {catalog.length === 0 && (
            <p className="card-flat p-4 text-center text-sm text-ink-soft">
              Catálogo no disponible ahora mismo.
            </p>
          )}
        </section>
      )}

      {step === "place" && product && (
        <section className="space-y-4">
          <p className="card-flat px-3 py-3 text-sm">
            ¿Dónde hay <b>{product.name}</b>?
          </p>

          {place && (
            <p className="card-flat flex items-center gap-2 px-3 py-2 text-sm">
              <MapPin size={16} weight="fill" className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Lugar: <b>{place.name}</b>
              </span>
            </p>
          )}

          <AvailabilityMapDynamic
            focusProvincia={provincia}
            pickMode
            anchor={pin ?? homeAnchor}
            onPick={(lat, lng) => {
              // Pin manual: modo coordenadas; el servidor resuelve el lugar.
              setPin({ lat, lng });
              setPlace(null);
            }}
          />
          <p className="px-1 text-xs text-ink-soft">
            {pin
              ? `Punto elegido: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`
              : "Toca el mapa para marcar el lugar."}
          </p>

          <label className="block">
            <span className="px-1 text-sm text-ink-soft">Nombre del lugar (opcional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 80))}
              maxLength={80}
              placeholder="Ej: La Esquina"
              className="mt-1 w-full rounded-md border-2 border-ink bg-card px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="px-1 text-sm text-ink-soft">Dirección (opcional)</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value.slice(0, 120))}
              maxLength={120}
              placeholder="Ej: Calle 23 #456 entre A y B"
              className="mt-1 w-full rounded-md border-2 border-ink bg-card px-3 py-2"
            />
          </label>

          {latest?.found && latest.reportId && (
            <Notice variant="warning" className="space-y-2">
              <p className="flex items-start gap-2 font-semibold">
                <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden />
                Reportaron {product.name} aquí hace{" "}
                {latest.hoursAgo !== null && latest.hoursAgo >= 1
                  ? `${Math.round(latest.hoursAgo)} h`
                  : "menos de 1 h"}
                .
              </p>
              <button
                type="button"
                disabled={voteBusy}
                onClick={() => confirmExisting(latest.reportId as string)}
                className="btn btn-ghost w-full justify-center gap-2 rounded-md py-2 text-sm disabled:opacity-60"
              >
                <CheckCircle size={16} aria-hidden />
                Confirmar el reporte existente
              </button>
            </Notice>
          )}

          {stats && (
            <p className="flex items-center gap-2 px-1 text-xs text-ink-soft">
              <Star size={13} weight="fill" className="shrink-0 text-accent" aria-hidden />
              Llevas {stats.reports} {stats.reports === 1 ? "reporte" : "reportes"} — gracias por ayudar.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAvailability("available")}
              className={`rounded-md border-2 p-4 text-center font-bold transition-transform active:translate-y-[1px] ${
                availability === "available"
                  ? "border-hay-ink bg-hay-bg text-hay-ink shadow-[3px_3px_0_0_var(--stamp)]"
                  : "border-line bg-card text-ink-soft"
              }`}
            >
              <Check size={18} weight="bold" className="mx-auto mb-1" aria-hidden />
              Hay
            </button>
            <button
              type="button"
              onClick={() => setAvailability("out_of_stock")}
              className={`rounded-md border-2 p-4 text-center font-bold transition-transform active:translate-y-[1px] ${
                availability === "out_of_stock"
                  ? "border-nohay-ink bg-nohay-bg text-nohay-ink shadow-[3px_3px_0_0_var(--stamp)]"
                  : "border-line bg-card text-ink-soft"
              }`}
            >
              <X size={18} weight="bold" className="mx-auto mb-1" aria-hidden />
              Ya no hay
            </button>
          </div>

          {availability === "available" && (
            <label className="block">
              <span className="px-1 text-sm text-ink-soft">Precio (opcional, CUP)</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="$"
                className="mt-1 w-full rounded-md border-2 border-ink bg-card px-3 py-2 font-display text-xl"
              />
            </label>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!pin || status.kind === "sending"}
              onClick={submit}
              className="btn btn-primary flex-1 rounded-md py-3 disabled:opacity-60"
            >
              {status.kind === "sending" && (
                <Spinner weight="bold" className="animate-spin" size={16} aria-hidden />
              )}
              {status.kind === "sending" ? "Enviando…" : "Enviar reporte"}
            </button>
            <button
              type="button"
              onClick={() => setStep("product")}
              className="btn btn-ghost rounded-md px-5 py-3 text-sm"
            >
              Atrás
            </button>
          </div>
        </section>
      )}

      <p className="pt-2 text-center text-xs text-ink-soft">
        Sin cuenta, sin registro.{" "}
        <Link href="/como-funciona" className="underline">
          Cómo funciona
        </Link>
      </p>
    </div>
  );
}
