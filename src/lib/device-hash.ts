import { createHash } from "node:crypto";

/**
 * Server-side device identity: hash the anonymous client UUID with a salt so
 * the stored value can never be reversed into something identifying.
 */
export function hashDeviceId(rawId: string | null | undefined): string | null {
  if (!rawId) return null;
  const trimmed = rawId.trim();
  if (trimmed.length < 8 || trimmed.length > 64) return null;
  const salt = process.env.DEVICE_HASH_SALT;
  if (!salt) {
    console.error("DEVICE_HASH_SALT missing");
    return null;
  }
  return createHash("sha256").update(`${salt}:${trimmed}`).digest("hex");
}
