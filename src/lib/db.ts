import { Pool, type QueryResult, type QueryResultRow } from "pg";

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
    // The shared pooler drops idle TCP connections after a few minutes.
    // Retire them on our side first so no request grabs a dead socket.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dhPool = pool;
}

const TRANSIENT_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED"]);

/**
 * Query with one automatic retry against a fresh connection when the failure
 * is a dropped socket (the pooler resets idle connections). Everything else
 * propagates untouched.
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params as never[]);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (TRANSIENT_CODES.has(code)) {
      return await pool.query<T>(text, params as never[]);
    }
    throw err;
  }
}
