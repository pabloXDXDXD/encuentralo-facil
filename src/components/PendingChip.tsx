"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@phosphor-icons/react";
import { flushOutbox, outboxCount } from "@/lib/outbox";
import { getDeviceId } from "@/lib/client-device";

/** Persistent chip while there are queued reports waiting to sync. */
export default function PendingChip() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await outboxCount());
    } catch {
      /* IndexedDB unavailable -> no chip */
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const syncNow = async () => {
      try {
        await flushOutbox(getDeviceId());
      } catch {
        /* ignore */
      }
      if (!alive) return;
      await refresh();
    };

    refresh();
    void syncNow();

    window.addEventListener("dh-outbox-change", refresh);
    window.addEventListener("online", syncNow);
    const timer = setInterval(syncNow, 30_000);

    return () => {
      alive = false;
      window.removeEventListener("dh-outbox-change", refresh);
      window.removeEventListener("online", syncNow);
      clearInterval(timer);
    };
  }, [refresh]);

  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
      <div className="btn flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-bold text-paper shadow-[4px_4px_0_0_var(--accent)]">
        <Spinner aria-hidden className="animate-spin text-accent" size={16} />
        <span>
          {count === 1 ? "1 reporte pendiente" : `${count} reportes pendientes`} de enviar
        </span>
      </div>
    </div>
  );
}
