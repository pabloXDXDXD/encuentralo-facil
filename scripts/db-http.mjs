#!/usr/bin/env node
// Ejecuta SQL contra Supabase por HTTPS (puerto 443) usando la Management API.
// Para redes donde el puerto 5432/6543 esta bloqueado por ISP/VPN.
//
// Uso:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db-http.mjs <archivo.sql> [mas.sql ...]
// El token tambien se lee de .env.local si existe.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

for (const candidate of [".env.local", ".env"]) {
  if (fs.existsSync(path.resolve(candidate))) {
    dotenv.config({ path: candidate });
    break;
  }
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !PROJECT_REF) {
  console.error("Faltan SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF");
  process.exit(1);
}

async function runSql(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)?.slice(0, 500)}`);
  }
  return body;
}

const files = process.argv.slice(2);
for (const f of files) {
  const sql = fs.readFileSync(path.resolve(f), "utf8");
  process.stdout.write(`${f} ... `);
  try {
    await runSql(sql);
    console.log("OK");
  } catch (err) {
    console.log("FAILED");
    console.error(err.message);
    process.exit(1);
  }
}
console.log("done");