"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  MapPin,
  MapTrifold,
  Package,
  Star,
  Tray,
  Warning,
  X,
} from "@phosphor-icons/react";
import { outboxAdd } from "@/lib/outbox";
import { getDeviceId } from "@/lib/client-device";
import { ProductIcon } from "@/lib/product-icons";
import LocationPicker from "@/components/LocationPicker";
import { queueLabel } from "@/lib/format";
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
type StoreRow = { id: string; name: string; barrio: string; lat: number | null; lng: number | null };
type Selection = { storeId: string; storeName: string };
type LatestInfo = { found: boolean; hoursAgo: number | null; reportId: string | null };
type Mode = "choice" | "report" | "suggest";

type Props = {
  barrios: string[];
  provincia?: string | null;
  /** URL prefills resolved server-side (/reportar?producto=<slug>). */
  initialProduct?: CatalogProduct | null;
  /** URL prefills resolved server-side (/reportar?store=<id>). */
  initialStore?: { id: string; name: string } | null;
};

const KIND_OPTIONS = [
  { value: "other", label: "Otro punto de venta" },
  { value: "state_market", label: "Mercado estatal / agro" },
  { value: "private_market", label: "Mercado privado" },
  { value: "mipyme", label: "Mipyme" },
];

export default function ReportFlow({ barrios, provincia, initialProduct, initialStore }: Props) {
  const prefilled = Boolean(initialProduct || initialStore);
  const [mode, setMode] = useState<Mode>(prefilled ? "report" : "choice");
  const [step, setStep] = useState<"product" | "store" | "confirm">(
    initialProduct && initialStore ? "confirm" : initialProduct ? "store" : "product",
  );
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [storeBarrio, setStoreBarrio] = useState<string>(barrios[0] ?? "");
  const [product, setProduct] = useState<CatalogProduct | null>(initialProduct ?? null);
  const [store, setStore] = useState<Selection | null>(
    initialStore ? { storeId: initialStore.id, storeName: initialStore.name } : null,
  );
  const [availability, setAvailability] = useState<Availability>("available");
  const [price, setPrice] = useState("");
  const [comment, setComment] = useState("");
  const [queue, setQueue] = useState<number | null>(null);
  const [stats, setStats] = useState<{ reports: number; votes: number; points: number } | null>(
    null,
  );
  const [creatingStore, setCreatingStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreLat, setNewStoreLat] = useState<number | null>(null);
  const [newStoreLng, setNewStoreLng] = useState<number | null>(null);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "queued"; offline: boolean }
  >({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  // --- Flow A: store step map option ---------------------------------------
  const [homeAnchor, setHomeAnchor] = useState<{ lat: number; lng: number } | null>(null);
  const [showStoreMap, setShowStoreMap] = useState(false);

  // --- Flow A: anti-duplicate on confirm ------------------------------------
  const [latest, setLatest] = useState<LatestInfo | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);

  // --- Flow B: suggest a point ----------------------------------------------
  const [suggestStep, setSuggestStep] = useState<"map" | "details" | "done">("map");
  const [pickPoint, setPickPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [sugName, setSugName] = useState("");
  const [sugBarrio, setSugBarrio] = useState<string>(barrios[0] ?? "");
  const [sugKind, setSugKind] = useState<string>("other");
  const [sugSending, setSugSending] = useState(false);
  const [dupWarning, setDupWarning] = useState<Selection | null>(null);
  const [createdNote, setCreatedNote] = useState(false);
  // Existing stores shown on the pick map (duplicate prevention).
  const [suggestStores, setSuggestStores] = useState<StoreRow[]>([]);
  const [createdSel, setCreatedSel] = useState<Selection | null>(null);

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

  // User's saved search anchor centers the maps.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dh_home_anchor");
      if (raw) setHomeAnchor(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Load stores whenever the barrio filter changes.
  useEffect(() => {
    if (!storeBarrio && barrios.length === 0) return;
    const params = new URLSearchParams();
    if (storeBarrio) params.set("barrio", storeBarrio);
    fetch(`/api/stores?${params}`)
      .then((r) => r.json())
      .then((d) => setStores(d.stores ?? []))
      .catch(() => setStores([]));
  }, [storeBarrio, barrios.length]);

  // Flow B pick map: ALL active stores (any barrio) so the user sees what
  // already exists before creating a duplicate.
  useEffect(() => {
    if (mode !== "suggest" || suggestStep !== "map") return;
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => setSuggestStores(d.stores ?? []))
      .catch(() => setSuggestStores([]));
  }, [mode, suggestStep]);

  // Anti-duplicate check every time the confirm step is reached.
  useEffect(() => {
    if (mode !== "report" || step !== "confirm" || !product || !store) {      setLatest(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ storeId: store.storeId, productId: product.id });
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
  }, [mode, step, product, store]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return catalog.map((cat) => ({
      ...cat,
      products: cat.products.filter(
        (p) => !q || p.name.toLowerCase().includes(q),
      ),
    }));
  }, [catalog, productQuery]);

  const visibleStores = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    return stores.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [stores, storeQuery]);

  const storePins = useMemo(
    () =>
      stores
        .filter((s) => s.lat !== null && s.lng !== null)
        .map((s) => ({ id: s.id, name: s.name, barrio: s.barrio, lat: s.lat as number, lng: s.lng as number })),
    [stores],
  );

  // Existing stores rendered on the Flow B pick map.
  const suggestPins = useMemo(
    () =>
      suggestStores
        .filter((s) => s.lat !== null && s.lng !== null)
        .map((s) => ({ id: s.id, name: s.name, barrio: s.barrio, lat: s.lat as number, lng: s.lng as number })),
    [suggestStores],
  );

  async function confirmExisting(reportId: string) {
    if (!product || !store || voteBusy) return;
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

  async function createCommunityStore() {
    const name = newStoreName.trim();
    if (name.length < 2 || !storeBarrio) return;
    setError(null);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          barrio: storeBarrio,
          kind: "other",
          lat: newStoreLat,
          lng: newStoreLng,
          force: true,
        }),
      });
      const data = await res.json();
      if (!data.ok || !data.storeId) {
        setError(data.error === "invalid_input" ? "Nombre muy corto." : "No se pudo crear.");
        return;
      }
      const created = { id: data.storeId as string, name, barrio: storeBarrio };
      setStores((prev) =>
        prev.some((s) => s.id === created.id)
          ? prev
          : [...prev, { ...created, lat: newStoreLat, lng: newStoreLng }],
      );
      setStore({ storeId: created.id, storeName: created.name });
      setCreatingStore(false);
      setNewStoreLat(null);
      setNewStoreLng(null);
      setStep("confirm");
    } catch {
      setError("Sin conexión para crear la tienda.");
    }
  }

  function enterDetails() {
    if (!pickPoint) return;
    setSugBarrio(storeBarrio || barrios[0] || "");
    setSuggestStep("details");
  }

  function adoptStore(sel: Selection) {
    setStore(sel);
    setDupWarning(null);
    setMode("report");
    // Confirm needs a product: without one, land on product selection first
    // (it skips straight to confirm since a store is already chosen).
    setStep(product ? "confirm" : "product");
  }

  async function createSuggestedStore(force = false) {
    const name = sugName.trim();
    if (name.length < 2 || !sugBarrio || !pickPoint) return;
    setSugSending(true);
    setError(null);
    setDupWarning(null);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          barrio: sugBarrio,
          kind: sugKind,
          lat: pickPoint.lat,
          lng: pickPoint.lng,
          force,
        }),
      });
      const data = await res.json();
      if (data.ok && data.storeId) {
        const sel = { storeId: data.storeId as string, storeName: name };
        setStores((prev) =>
          prev.some((s) => s.id === sel.storeId)
            ? prev
            : [...prev, { id: sel.storeId, name, barrio: sugBarrio, lat: pickPoint.lat, lng: pickPoint.lng }],
        );
        setCreatedSel(sel);
        setSuggestStep("done");
        // Reset the suggestion form.
        setPickPoint(null);
        setSugName("");
        setSugKind("other");
        return;
      }
      if (data.error === "possible_duplicate") {
        setDupWarning({ storeId: data.storeId as string, storeName: (data.storeName as string) ?? "" });
      } else {
        setError(data.error === "invalid_input" ? "Nombre muy corto." : "No se pudo crear el punto.");
      }
    } catch {
      setError("Sin conexión para crear el punto.");
    } finally {
      setSugSending(false);
    }
  }

  async function submit() {
    if (!product || !store) return;
    setStatus({ kind: "sending" });
    setError(null);

    const payload = {
      storeId: store.storeId,
      productId: product.id,
      availability,
      priceCup: price.trim() === "" ? null : Number(price),
      comment: comment.trim() || null,
      queueLevel: availability === "available" ? queue : null,
    };

    const deviceId = getDeviceId();

    // Offline-first write path: queue first if there is no connectivity.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await outboxAdd({
        id: crypto.randomUUID(),
        storeId: payload.storeId,
        storeName: store.storeName,
        productId: payload.productId,
        productName: product.name,
        availability: payload.availability as Availability,
        priceCup: payload.priceCup,
        comment: payload.comment,
        queueLevel: payload.queueLevel,
        createdAt: Date.now(),
      });
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
        await outboxAdd({
          id: crypto.randomUUID(),
          storeId: payload.storeId,
          storeName: store.storeName,
          productId: payload.productId,
          productName: product.name,
          availability: payload.availability as Availability,
          priceCup: payload.priceCup,
          comment: payload.comment,
          queueLevel: payload.queueLevel,
          createdAt: Date.now(),
        });
        setStatus({ kind: "queued", offline: true });
      }
    } catch {
      await outboxAdd({
        id: crypto.randomUUID(),
        storeId: payload.storeId,
        storeName: store.storeName,
        productId: payload.productId,
        productName: product.name,
        availability: payload.availability as Availability,
        priceCup: payload.priceCup,
        comment: payload.comment,
        queueLevel: payload.queueLevel,
        createdAt: Date.now(),
      });
      setStatus({ kind: "queued", offline: true });
    }
    resetSoft();
  }

  function resetAfterDelay() {
    setTimeout(() => {
      setStatus({ kind: "idle" });
      setStep("product");
      setProduct(null);
      setStore(null);
      setPrice("");
      setComment("");
      setQueue(null);
      setLatest(null);
      setCreatedNote(false);
    }, 1800);
  }

  function resetSoft() {
    setPrice("");
    setComment("");
  }

  function backToChoice() {
    setMode("choice");
    setSuggestStep("map");
    setPickPoint(null);
    setDupWarning(null);
    setError(null);
    setStep("product");
    setCreatedNote(false);
  }

  const contributionStats = stats && (
    <p className="card-flat flex items-center gap-2 px-3 py-2 text-xs text-ink-soft">
      <Star size={14} weight="fill" className="shrink-0 text-accent" aria-hidden />
      <span>
        Tu aporte: {stats.reports} reportes · {stats.votes} votos ·{" "}
        <b className="font-display">{stats.points} pts</b>
      </span>
    </p>
  );

  if (status.kind === "queued") {
    return (
      <div className="card-ticket rise p-8 text-center">
        {status.offline ? (
          <Tray aria-hidden size={44} className="mx-auto text-accent" weight="duotone" />
        ) : (
          <CheckCircle aria-hidden size={44} className="mx-auto text-hay-ink" weight="fill" />
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

  // --- Choice screen ----------------------------------------------------------
  if (mode === "choice") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setMode("report")}
          className="btn btn-ghost card-ticket w-full justify-start gap-4 rounded-md p-4 text-left"
        >
          <Package size={34} weight="duotone" className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-tight">Reportar producto</span>
            <span className="block text-sm font-normal text-ink-soft">
              Di qué hay o falta en una tienda que ya conoces.
            </span>
          </span>
          <ArrowRight size={18} weight="bold" className="shrink-0 text-ink-soft" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => setMode("suggest")}
          className="btn btn-ghost card-ticket w-full justify-start gap-4 rounded-md p-4 text-left"
        >
          <MapPin size={34} weight="duotone" className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-tight">Sugerir punto en el mapa</span>
            <span className="block text-sm font-normal text-ink-soft">
              Agrega una tienda que falte y reporta ahí mismo.
            </span>
          </span>
          <ArrowRight size={18} weight="bold" className="shrink-0 text-ink-soft" aria-hidden />
        </button>

        {contributionStats}

        <p className="pt-2 text-center text-xs text-ink-soft">
          Sin cuenta, sin registro.{" "}
          <Link href="/como-funciona" className="underline">
            Cómo funciona
          </Link>
        </p>
      </div>
    );
  }

  // --- Flow B: suggest a point -------------------------------------------------
  if (mode === "suggest") {
    return (
      <div className="space-y-4">
        {error && (
          <p className="card-flat px-3 py-3 text-sm font-semibold text-nohay-ink">{error}</p>
        )}

        {suggestStep === "map" && (
          <section className="space-y-3">
            <p className="card-flat flex items-center gap-2 px-3 py-2 text-sm">
              <MapTrifold size={16} className="shrink-0 text-accent" aria-hidden />
              Toca el mapa donde está el punto
            </p>
            <AvailabilityMapDynamic
              focusProvincia={provincia}
              pickMode
              anchor={pickPoint ?? homeAnchor}
              storePins={suggestPins}
              onStorePinSelect={(s) => {
                // Tapping an existing store adopts it instead of creating
                // a duplicate right next to it.
                adoptStore({ storeId: s.id, storeName: s.name });
              }}
              onPick={(lat, lng) => setPickPoint({ lat, lng })}
            />
            <p className="px-1 text-xs text-ink-soft">
              {pickPoint
                ? `Punto elegido: ${pickPoint.lat.toFixed(5)}, ${pickPoint.lng.toFixed(5)}`
                : "Toca el mapa para el punto nuevo, o toca un punto de venta existente para reportar ahí."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!pickPoint}
                onClick={enterDetails}
                className="btn btn-primary flex-1 rounded-md py-3 disabled:opacity-60"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={backToChoice}
                className="btn btn-ghost rounded-md px-5 py-3 text-sm"
              >
                Volver
              </button>
            </div>
          </section>
        )}

        {suggestStep === "done" && createdSel && (
          <section className="space-y-3">
            <div className="card-ticket space-y-3 p-5 text-center">
              <CheckCircle size={32} weight="fill" className="mx-auto text-hay-ink" aria-hidden />
              <p className="font-display text-lg">Punto creado</p>
              <p className="text-sm text-ink-soft">
                <b>{createdSel.storeName}</b> ya está en el mapa. ¿Quieres reportar qué productos hay ahí?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStore(createdSel);
                  setCreatedNote(true);
                  setMode("report");
                  setStep("product");
                }}
                className="btn btn-primary flex-1 rounded-md py-3"
              >
                <Package size={18} aria-hidden />
                Añadir productos
              </button>
              <button
                type="button"
                onClick={backToChoice}
                className="btn btn-ghost rounded-md px-5 py-3 text-sm"
              >
                Solo salir
              </button>
            </div>
          </section>
        )}

        {suggestStep === "details" && (
          <section className="space-y-3">
            <p className="card-flat flex items-center gap-2 px-3 py-2 text-sm">
              <MapPin size={16} className="shrink-0 text-accent" aria-hidden />
              ¿Cómo se llama el punto?
            </p>
            <input
              value={sugName}
              onChange={(e) => setSugName(e.target.value)}
              placeholder="Nombre del punto (ej. La Esquina)"
              className="w-full rounded-md border-2 border-ink bg-card px-3 py-2"
            />
            <label className="block">
              <span className="px-1 text-sm text-ink-soft">Barrio</span>
              <select
                value={sugBarrio}
                onChange={(e) => setSugBarrio(e.target.value)}
                className="mt-1 w-full rounded-md border-2 border-ink bg-card px-3 py-2"
              >
                {barrios.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="px-1 text-sm text-ink-soft">Tipo (opcional)</span>
              <select
                value={sugKind}
                onChange={(e) => setSugKind(e.target.value)}
                className="mt-1 w-full rounded-md border-2 border-ink bg-card px-3 py-2"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>

            {dupWarning && (
              <div
                role="alert"
                className="space-y-2 rounded-md border-2 border-accent bg-card p-3"
              >
                <p className="flex items-start gap-2 text-sm font-semibold">
                  <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden />
                  ¿Ya existe «{dupWarning.storeName}» muy cerca de ese punto?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={sugSending}
                    onClick={() => createSuggestedStore(true)}
                    className="btn btn-ghost flex-1 rounded-md py-2 text-sm"
                  >
                    Es otro punto
                  </button>
                  <button
                    type="button"
                    onClick={() => adoptStore(dupWarning)}
                    className="btn btn-primary flex-1 rounded-md py-2 text-sm"
                  >
                    Es este mismo
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={sugSending || sugName.trim().length < 2 || !sugBarrio}
                onClick={() => createSuggestedStore(false)}
                className="btn btn-primary flex-1 rounded-md py-3 disabled:opacity-60"
              >
                {sugSending ? "Creando…" : "Crear punto"}
              </button>
              <button
                type="button"
                onClick={() => setSuggestStep("map")}
                className="btn btn-ghost rounded-md px-5 py-3 text-sm"
              >
                Atrás
              </button>
            </div>
          </section>
        )}

        {contributionStats}

        <p className="pt-2 text-center text-xs text-ink-soft">
          Sin cuenta, sin registro.{" "}
          <Link href="/como-funciona" className="underline">
            Cómo funciona
          </Link>
        </p>
      </div>
    );
  }

  // --- Flow A: report a product -------------------------------------------------
  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-2 px-1 font-display text-sm tracking-wide text-line">
        <li className={step === "product" ? "text-accent" : ""}>1 · Producto</li>
        <li>›</li>
        <li className={step === "store" ? "text-accent" : ""}>2 · Tienda</li>
        <li>›</li>
        <li className={step === "confirm" ? "text-accent" : ""}>3 · Confirmar</li>
      </ol>

      {!prefilled && step !== "confirm" && (
        <button
          type="button"
          onClick={backToChoice}
          className="flex items-center gap-1 px-1 text-xs font-semibold text-ink-soft underline"
        >
          <ArrowLeft size={12} aria-hidden />
          Otra opción
        </button>
      )}

      {error && (
        <p className="card-flat px-3 py-3 text-sm font-semibold text-nohay-ink">{error}</p>
      )}

      {createdNote && (
        <p className="flex items-center gap-2 rounded-md border-2 border-hay-ink bg-hay-bg px-3 py-2 text-sm font-semibold text-hay-ink">
          <CheckCircle size={16} weight="fill" aria-hidden />
          Punto creado. Ahora reporta qué hay ahí.
        </p>
      )}

      {step === "product" && (
        <section className="space-y-3">
          {store && (
            <p className="card-flat flex items-center gap-2 px-3 py-2 text-sm">
              <MapPin size={16} className="shrink-0 text-accent" aria-hidden />
              En <b>{store.storeName}</b>: ¿qué quieres reportar?
            </p>
          )}
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
                        // A store adopted earlier (URL, Flow B) skips the picker.
                        setStep(store ? "confirm" : "store");
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

      {step === "store" && product && (
        <section className="space-y-3">
          <p className="card-flat px-3 py-3 text-sm">
            ¿En qué tienda hay <b>{product.name}</b>?
          </p>
          <select
            value={storeBarrio}
            onChange={(e) => setStoreBarrio(e.target.value)}
            className="w-full rounded-md border-2 border-ink bg-card px-3 py-2"
          >
            {barrios.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <input
            value={storeQuery}
            onChange={(e) => setStoreQuery(e.target.value)}
            placeholder="Buscar tienda…"
            className="w-full rounded-md border-2 border-ink bg-card px-3 py-2"
            inputMode="search"
          />

          <button
            type="button"
            onClick={() => setShowStoreMap((v) => !v)}
            aria-pressed={showStoreMap}
            className={`btn w-full justify-center gap-2 rounded-md py-2 text-sm font-semibold ${
              showStoreMap ? "bg-ink text-paper" : "btn-ghost"
            }`}
          >
            <MapTrifold size={16} aria-hidden />
            {showStoreMap ? "Ver lista" : "Elegir en el mapa"}
          </button>

          {showStoreMap ? (
            <>
              <AvailabilityMapDynamic
                focusProvincia={provincia}
                anchor={homeAnchor}
                storePins={storePins}
                onStorePinSelect={(s) => {
                  // Tapping a pin picks the store and returns to the list
                  // view with the selection visible (chip + highlighted row).
                  setStore({ storeId: s.id, storeName: s.name });
                  setShowStoreMap(false);
                }}
              />
              <p className="px-1 text-xs text-ink-soft">
                Toca un pin del mapa para elegir esa tienda.
              </p>
            </>
          ) : (
            <>
              {store && (
                <div className="flex items-center gap-2 rounded-md border-2 border-accent bg-card px-3 py-2 text-sm">
                  <MapPin size={16} weight="fill" className="shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-semibold">{store.storeName}</span>
                  <button
                    type="button"
                    onClick={() => setStep("confirm")}
                    className="btn btn-primary shrink-0 rounded-md px-3 py-1.5 text-xs"
                  >
                    Continuar
                  </button>
                </div>
              )}
              <ul className="card-flat divide-y-2 divide-dashed divide-line overflow-hidden rounded-md">
                {visibleStores.map((s) => {
                  const selected = store?.storeId === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setStore({ storeId: s.id, storeName: s.name });
                          setStep("confirm");
                        }}
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left font-semibold hover:bg-paper ${
                          selected ? "bg-hay-bg text-hay-ink" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        {selected && <CheckCircle size={16} weight="fill" className="shrink-0" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {creatingStore ? (
                <div className="space-y-2 rounded-md border-2 border-accent bg-card p-3">
                  <input
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    placeholder={`Nombre de la tienda (${storeBarrio})`}
                    className="w-full rounded-md border-2 border-ink bg-card px-3 py-2"
                  />
                  <LocationPicker
                    municipio={storeBarrio}
                    provincia={provincia}
                    onChange={(lat, lng) => {
                      setNewStoreLat(lat);
                      setNewStoreLng(lng);
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={createCommunityStore}
                      className="btn btn-primary flex-1 rounded-md py-2"
                    >
                      Crear y seguir
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatingStore(false)}
                      className="btn btn-ghost rounded-md px-4 py-2 text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingStore(true)}
                  className="btn btn-ghost w-full justify-center rounded-md border-dashed py-2 text-sm text-ink-soft"
                >
                  + No está en la lista — agregar tienda
                </button>
              )}
            </>
          )}
        </section>
      )}

      {step === "confirm" && product && store && (
        <section className="space-y-4">
          <div className="card-flat p-4">
            <p className="text-sm text-ink-soft">Reportando</p>
            <p className="font-semibold">
              {product.emoji} {product.name} · {store.storeName}
            </p>
          </div>

          {latest?.found && latest.reportId && (
            <div
              role="alert"
              className="space-y-2 rounded-md border-2 border-accent bg-card p-3 text-sm"
            >
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
            </div>
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
            <>
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

              <div>
                <span className="px-1 text-sm text-ink-soft">¿Hay cola? (opcional)</span>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQueue(queue === n ? null : n)}
                      className={`rounded-md border-2 p-2 text-center text-xs font-semibold ${
                        queue === n
                          ? "border-accent bg-card text-accent shadow-[3px_3px_0_0_var(--stamp)]"
                          : "border-line bg-card text-ink-soft"
                      }`}
                    >
                      {queueLabel(n)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <label className="block">
            <span className="px-1 text-sm text-ink-soft">Comentario (opcional)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 200))}
              rows={2}
              maxLength={200}
              placeholder="Ej: por libra, hacen fila temprano…"
              className="mt-1 w-full resize-none rounded-md border-2 border-ink bg-card px-3 py-2"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={status.kind === "sending"}
              onClick={submit}
              className="btn btn-primary flex-1 rounded-md py-3 disabled:opacity-60"
            >
              {status.kind === "sending" ? "Enviando…" : "Enviar reporte"}
            </button>
            <button
              type="button"
              onClick={() => setStep("store")}
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
