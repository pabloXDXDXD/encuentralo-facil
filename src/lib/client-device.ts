"use client";

const KEY = "dh_device_id";

/** Anonymous per-install UUID kept in localStorage. Never contains PII. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
