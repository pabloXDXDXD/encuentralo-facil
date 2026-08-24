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
    connectionTimeoutMillis: 4_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dhPool = pool;
}

const TRANSIENT_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED"]);

/** Escapa un valor como literal SQL (solo se usa en el fallback HTTPS). */
function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Fallback por HTTPS (Management API, puerto 443) para redes donde el
 * protocolo de Postgres en 5432/6543 esta bloqueado por ISP/VPN.
 * Requiere SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF en el entorno.
 * El endpoint no acepta parametros: se interpolan como literales escapados.
 */
async function httpQuery<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) throw new Error("http_fallback_unconfigured");
  let sql = text;
  if (params?.length) {
    sql = text.replace(/\$(\d+)/g, (_m, n) => sqlLiteral(params[Number(n) - 1]));
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "message" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).message)
        : `HTTP ${res.status}`;
    throw new Error(`db_http_error: ${msg}`);
  }
  const rows = (Array.isArray(data) ? data : []) as T[];
  return {
    rows,
    command: "",
    rowCount: rows.length,
    oid: 0,
    fields: [],
  } as unknown as QueryResult<T>;
}

/**
 * Query with automatic retries on dropped sockets (the shared pooler resets
 * idle connections and the network flaps). Waits grow per attempt so a short
 * network storm doesn't take requests down with it.
 * Si el socket sigue fallando y hay token de Management API configurado,
 * degrada a HTTPS automaticamente (modo red restringida).
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const waits = [0, 300, 1500];
  let lastError: unknown;

  for (const wait of waits) {
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await pool.query<T>(text, params as never[]);
    } catch (err) {
      lastError = err;
      const code = (err as { code?: string }).code ?? "";
      if (!TRANSIENT_CODES.has(code)) throw err;
    }
  }
  // Socket agotado -> intentar por HTTPS antes de rendirse.
  try {
    return await httpQuery<T>(text, params);
  } catch {
    throw lastError;
  }
}
