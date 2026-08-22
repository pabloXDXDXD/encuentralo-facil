"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, CheckCircle, Tray, X } from "@phosphor-icons/react";
import { outboxAdd } from "@/lib/outbox";
import { getDeviceId } from "@/lib/client-device";
import { ProductIcon } from "@/lib/product-icons";
import { queueLabel } from "@/lib/format";
import type { Availability } from "@/lib/repo-types";

type CatalogProduct = { id: string; slug: string; name: string; emoji: string };
type CatalogCategory = { id: string; name: string; emoji: string; products: CatalogProduct[] };
type StoreRow = { id: string; name: string; barrio: string };
type Selection = { storeId: string; storeName: string };

type Props = { barrios: string[] };

export default function ReportFlow({ barrios }: Props) {
  const [step, setStep] = useState<"product" | "store" | "confirm">("product");
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [storeBarrio, setStoreBarrio] = useState<string>(barrios[0] ?? "");
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [store, setStore] = useState<Selection | null>(null);
  const [availability, setAvailability] = useState<Availability>("available");
  const [price, setPrice] = useState("");
  const [comment, setComment] = useState("");
  const [queue, setQueue] = useState<number | null>(null);
  const [stats, setStats] = useState<{ reports: number; votes: number; points: number } | null>(
    null,
  );
  const [creatingStore, setCreatingStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "queued"; offline: boolean }
  >({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

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

  async function createCommunityStore() {
    const name = newStoreName.trim();
    if (name.length < 2 || !storeBarrio) return;
    setError(null);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, barrio: storeBarrio }),
      });
      const data = await res.json();
      if (!data.ok || !data.storeId) {
        setError(data.error === "invalid_input" ? "Nombre muy corto." : "No se pudo crear.");
        return;
      }
      const created = { id: data.storeId as string, name, barrio: storeBarrio };
      setStores((prev) => [...prev, created]);
      setStore({ storeId: created.id, storeName: created.name });
      setCreatingStore(false);
      setStep("confirm");
    } catch {
      setError("Sin conexión para crear la tienda.");
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
        setError("Espera un minuto entre reportes 🙏");
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
    }, 1800);
  }

  function resetSoft() {
    setPrice("");
    setComment("");
  }

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

  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-2 px-1 font-display text-sm tracking-wide text-line">
        <li className={step === "product" ? "text-accent" : ""}>1 · Producto</li>
        <li>›</li>
        <li className={step === "store" ? "text-accent" : ""}>2 · Tienda</li>
        <li>›</li>
        <li className={step === "confirm" ? "text-accent" : ""}>3 · Confirmar</li>
      </ol>

      {stats && (
        <p className="card-flat px-3 py-2 text-xs text-ink-soft">
          Tu aporte: {stats.reports} reportes · {stats.votes} votos ·{" "}
          <b className="font-display">{stats.points} pts</b> ⭐
        </p>
      )}

      {error && (
        <p className="card-flat px-3 py-3 text-sm font-semibold text-nohay-ink">{error}</p>
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
                        setStep("store");
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
          <ul className="card-flat divide-y-2 divide-dashed divide-line overflow-hidden rounded-md">
            {visibleStores.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setStore({ storeId: s.id, storeName: s.name });
                    setStep("confirm");
                  }}
                  className="block w-full px-4 py-3 text-left font-semibold hover:bg-paper"
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
          {creatingStore ? (
            <div className="space-y-2 rounded-md border-2 border-accent bg-card p-3">
              <input
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder={`Nombre de la tienda (${storeBarrio})`}
                className="w-full rounded-md border-2 border-ink bg-card px-3 py-2"
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
