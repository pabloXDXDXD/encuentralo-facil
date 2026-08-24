// Verificacion rapida del modelo hay/habia via Management API.
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

async function q(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  return r.json();
}

(async () => {
  const c = await q("select count(*) as n from public.reports");
  console.log("total reports:", c[0]?.n ?? JSON.stringify(c));

  const st = await q(
    "select status, count(*) as n from get_active_availability(null,null) group by status order by status"
  );
  console.log("snapshot por estado:", JSON.stringify(st));

  const sr = await q(
    "select status, count(*) as n from search_availability('pollo',23.12::float8,-82.38::float8,8000,null,false) group by status order by status"
  );
  console.log("search 'pollo' por estado:", JSON.stringify(sr));
})();