// E2E manual: verifica que el pin de anclaje sobrevive a una busqueda y
// captura pantallas del browse y la busqueda.
// E2E del flujo nuevo: ubicacion primero -> buscar con sugerencias -> resultados.
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return r.json();
}

const searchRows = await q(
  `select json_agg(row_to_json(t))::text as j from (
     select * from search_availability('pollo',23.1355::float8,-82.3806::float8,20000,null,false)
   ) t`,
);
const search = { ok: true, rows: JSON.parse(searchRows[0].j ?? "[]") };
console.log("datos reales: search pollo =", search.rows.length);

function findChromium() {
  const root = join(homedir(), "AppData", "Local", "ms-playwright");
  for (const dir of readdirSync(root)) {
    if (!dir.startsWith("chromium-")) continue;
    for (const rel of ["chrome-win64\\chrome.exe", "chrome-win\\chrome.exe"]) {
      const p = join(root, dir, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({
  viewport: { width: 420, height: 900 },
  geolocation: { latitude: 23.1355, longitude: -82.3806 },
  serviceWorkers: "block",
});
// SIN ancla pre-guardada: debe aparecer el onboarding de ubicacion.

const page = await ctx.newPage();
await page.route("**/api/search*", (route) => route.fulfill({ json: search }));
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  // 1) Onboarding de ubicacion con prioridad y buscador oculto (la tarjeta
  //    es el unico contenido en pantalla para usuarios nuevos)
  await page.waitForSelector("text=Elige tu punto de búsqueda", { timeout: 20000 });
  const hidden = await page.locator('input[aria-label="Buscar producto"]').isHidden();
  console.log("1. onboarding visible OK | buscador oculto =", hidden);
  if (!hidden) throw new Error("el buscador deberia estar oculto sin ancla");
  await page.screenshot({ path: "shot-1-onboarding.png" });

  // 2) Elegir punto en el mapa -> click -> ancla creada, onboarding desaparece
  await page.click('button:has-text("Elegir punto en el mapa")');
  await page.waitForSelector(".leaflet-container", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.click(".leaflet-container", { position: { x: 210, y: 350 } });
  await page.waitForSelector(".map-pin--anchor", { timeout: 20000 });
  await page.waitForSelector('input[aria-label="Buscar producto"]:not([disabled])', { timeout: 20000 });
  console.log("2. ancla fijada en el mapa OK | buscador habilitado OK");

  // 3) Typeahead: escribir 'pol' -> sugerencia Pollo -> click
  await page.fill('input[aria-label="Buscar producto"]', "pol");
  await page.waitForSelector('button:has-text("Pollo")', { timeout: 10000 });
  await page.screenshot({ path: "shot-2-sugerencias.png" });
  console.log("3. sugerencias en tiempo real OK");

  // 4) Seleccionar -> resultados en el mapa con pines + ancla
  await page.click('button:has-text("Pollo")');
  await page.waitForSelector(".map-pin--anchor", { timeout: 20000 });
  await page.waitForTimeout(2000);
  const pins = await page.locator(".map-pin:not(.map-pin--anchor)").count();
  console.log("4. pines de resultado =", pins);
  if (pins === 0) throw new Error("sin pines de resultado tras seleccionar");
  await page.screenshot({ path: "shot-3-resultados.png" });

  console.log("PASS: flujo completo ubicacion -> sugerencias -> resultados");
} catch (err) {
  await page.screenshot({ path: "shot-fail.png" }).catch(() => {});
  console.error("FAIL:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

