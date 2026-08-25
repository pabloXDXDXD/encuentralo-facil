"use client";

import { outboxAdd } from "./outbox";
import { getDeviceId } from "./client-device";
import type { Availability } from "./repo-types";

// Mensajes de error identicos a los de ReportFlow.
const ERROR_MSG: Record<string, string> = {
  rate_limit_interval: "Espera un minuto entre reportes.",
  rate_limit_daily: "Alcanzaste el límite de reportes de hoy.",
};

export type QuickMarkInput = {
  storeId: string;
  storeName: string;
  productSlug: string;
  productName: string;
  availability: Availability;
};

export type QuickMarkResult =
  | { ok: true; queuedOffline: boolean }
  | { ok: false; error: string };

type CatalogProduct = { id: string; slug: string; name: string };

// Mapa slug -> producto real del catalogo: las filas de busqueda solo traen
// slug, pero la API de reportes exige el id uuid. /api/products es la fuente
// que ya usa ReportFlow; se resuelve una vez y se cachea en el modulo.
let productIndex: Map<string, CatalogProduct> | null = null;
let indexPromise: Promise<Map<string, CatalogProduct>> | null = null;

async function loadProductIndex(): Promise<Map<string, CatalogProduct>> {
  if (productIndex) return productIndex;
  indexPromise ??= fetch("/api/products")
    .then((r) => r.json())
    .then((d) => {
      const idx = new Map<string, CatalogProduct>();
      for (const cat of d.categories ?? []) {
        for (const p of cat.products ?? []) {
          idx.set(p.slug, { id: p.id, slug: p.slug, name: p.name });
        }
      }
      productIndex = idx;
      return idx;
    });
  return indexPromise;
}

/**
 * Marcado rapido: crea un NUEVO reporte reusando el mismo pipeline que
 * ReportFlow (mismos headers con x-device-id, mismo payload, misma cola
 * offline y mismas reglas de reintento). priceCup/comment/queueLevel van
 * null: la via rapida no los pide.
 */
export async function quickMarkReport(input: QuickMarkInput): Promise<QuickMarkResult> {
  let productId: string | null = null;
  try {
    productId = (await loadProductIndex()).get(input.productSlug)?.id ?? null;
  } catch {
    productId = null;
  }
  if (!productId) {
    return { ok: false, error: "No se pudo identificar el producto." };
  }

  const payload = {
    storeId: input.storeId,
    productId,
    availability: input.availability,
    priceCup: null,
    comment: null,
    queueLevel: null,
  };

  // Offline-first: misma cola del outbox que ReportFlow.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue(payload, input);
    return { ok: true, queuedOffline: true };
  }

  try {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      ok: boolean;
      duplicate?: boolean;
      error?: string;
    };
    if (data.ok || data.duplicate) {
      return { ok: true, queuedOffline: false };
    }
    if (data.error && ERROR_MSG[data.error]) {
      return { ok: false, error: ERROR_MSG[data.error] };
    }
    // Otros errores -> misma red de seguridad: encolar para reintentar.
    await enqueue(payload, input);
    return { ok: true, queuedOffline: true };
  } catch {
    await enqueue(payload, input);
    return { ok: true, queuedOffline: true };
  }
}

async function enqueue(
  payload: { storeId: string; productId: string; availability: Availability },
  input: QuickMarkInput,
) {
  await outboxAdd({
    id: crypto.randomUUID(),
    storeId: payload.storeId,
    storeName: input.storeName,
    productId: payload.productId,
    productName: input.productName,
    availability: payload.availability,
    priceCup: null,
    comment: null,
    queueLevel: null,
    createdAt: Date.now(),
  });
}
