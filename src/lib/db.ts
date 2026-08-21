import { Pool } from "pg";

// Reuse a single pool across route handlers and hot reloads.
const globalForDb = globalThis as unknown as { __dhPool?: Pool };

export const pool =
  globalForDb.__dhPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase requires TLS; the shared pooler serves a certificate that is
    // not publicly chained on all regions, so verification stays off for now.
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dhPool = pool;
}
