"use client";

import { useEffect } from "react";

/** Registers the hand-rolled service worker that powers offline mode. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support is progressive enhancement */
      });
    }
  }, []);
  return null;
}
