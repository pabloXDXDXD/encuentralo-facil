"use client";

import type { Availability } from "./repo-types";

export type OutboxEntry = {
  id: string;
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  availability: Availability;
  priceCup: number | null;
  comment: string | null;
  queueLevel: number | null;
  createdAt: number;
};

const DB_NAME = "dondehay";
const STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode: IDBTransactionMode) {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Resolve when the surrounding transaction commits; reject on error/abort. */
function whenDone(store: IDBObjectStore): Promise<void> {
  return new Promise((resolve, reject) => {
    const { transaction } = store;
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function emitOutboxChange() {
  window.dispatchEvent(new Event("dh-outbox-change"));
}

export async function outboxAdd(entry: OutboxEntry) {
  const store = await tx("readwrite");
  store.add(entry);
  await whenDone(store);
  emitOutboxChange();
}

export async function outboxAll(): Promise<OutboxEntry[]> {
  const store = await tx("readonly");
  return requestDone(store.getAll()) as Promise<OutboxEntry[]>;
}

export async function outboxCount(): Promise<number> {
  const store = await tx("readonly");
  return requestDone(store.count());
}

async function outboxRemove(id: string) {
  const store = await tx("readwrite");
  store.delete(id);
  await whenDone(store);
  emitOutboxChange();
}

/**
 * Flush queued reports. Removal rules:
 *  - ok / duplicate / rate_limit_daily -> remove (done or permanently rejected)
 *  - rate_limit_interval / network error -> keep, stop flushing this round
 */
export async function flushOutbox(deviceId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const entries = await outboxAll();
  for (const entry of entries) {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({
          storeId: entry.storeId,
          productId: entry.productId,
          availability: entry.availability,
          priceCup: entry.priceCup,
          comment: entry.comment,
          queueLevel: entry.queueLevel,
        }),
      });
      if (!res.ok) continue; // transient server issue -> retry later
      const data = (await res.json()) as {
        ok: boolean;
        duplicate?: boolean;
        error?: string;
      };
      if (data.ok || data.duplicate || data.error === "rate_limit_daily") {
        await outboxRemove(entry.id);
      } else if (data.error === "rate_limit_interval") {
        break; // too fast; try again next flush
      } else {
        // unknown_store/unknown_product -> drop silently, never blocks the user
        await outboxRemove(entry.id);
      }
    } catch {
      break; // offline -> stop, background sync will resume
    }
  }
}
