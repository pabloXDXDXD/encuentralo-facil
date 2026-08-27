// E2E del ancla y el flujo de entrada (era places): onboarding de ubicacion
// -> elegir punto en el mapa -> ancla persistida -> typeahead "lugares" ->
// resultados solo en mapa con chip de mejor precio.
// Contra el servidor de produccion (next start); siembra su propio reporte
// fresco via POST /api/reports (las semillas del DB caducan a las 24 h).
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// Lugar destilado estable (heredo el UUID de la tienda seed, D3):
// Mercado Comercial Obispo, 23.139/-82.358, Habana Vieja.
const PLACE_OBISPO = "d0000000-00c0-4e00-8000-000000000302";
const ANCHOR = { lat: 23.1355, lng: -82.3806 }; // Centro Habana

// --- Siembra: reporte fresco propio (device unico: evita guardias 30-min/60-s) ---
const products = await (await fetch(`${BASE}/api/products`)).json();
const POLLO = (products.categories ?? [])
  .flatMap((c) => c.products ?? [])
  .find((p) => p.slug === "pollo");
if (!POLLO) throw new Error("catalogo incompleto: falta pollo");
const seedRes = await (
  await fetch(`${BASE}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": `e2e8a-${Date.now()}`,
    },
    body: JSON.stringify({
      placeId: PLACE_OBISPO,
      productId: POLLO.id,
      availability: "available",
      priceCup: 410,
    }),
  })
).json();
if (!seedRes.ok) throw new Error(`siembra fallo: ${JSON.stringify(seedRes)}`);
console.log(`siembra OK: Pollo disponible @ ${PLACE_OBISPO} (precio 410)`);

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
  geolocation: { latitude: ANCHOR.lat, longitude: ANCHOR.lng },
  serviceWorkers: "block",
});
// SIN ancla pre-guardada: debe aparecer el onboarding de ubicacion.

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  // 1) Onboarding de ubicacion exclusivo: la tarjeta es lo unico en pantalla
  //    (sin buscador, sin mapa) para usuarios nuevos.
  await page.waitForSelector("text=Elige tu punto de búsqueda", { timeout: 20000 });
  const hidden = await page.locator('input[aria-label="Buscar producto"]').isHidden();
  console.log("1. onboarding visible OK | buscador oculto =", hidden);
  if (!hidden) throw new Error("el buscador deberia estar oculto sin ancla");
  await page.screenshot({ path: "shot-1-onboarding.png" });

  // 2) Elegir punto en el mapa -> click -> ancla creada, onboarding desaparece.
  await page.click('button:has-text("Elegir punto en el mapa")');
  await page.waitForSelector(".leaflet-container", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.click(".leaflet-container", { position: { x: 210, y: 350 } });
  await page.waitForSelector(".map-pin--anchor", { timeout: 20000 });
  await page.waitForSelector('input[aria-label="Buscar producto"]:not([disabled])', { timeout: 20000 });
  const pickedAnchor = await page.evaluate(() => localStorage.getItem("dh_home_anchor"));
  console.log("2. ancla fijada en el mapa OK | buscador habilitado OK | ancla =", pickedAnchor);

  // El click de prueba cae donde encuadra la vista de pais (centro de Cuba),
  // lejos de La Habana: para afirmar la busqueda con datos reales se fija un
  // ancla habanera deterministica y se recarga (la persistencia es la misma:
  // localStorage dh_home_anchor).
  await page.evaluate((a) => localStorage.setItem("dh_home_anchor", JSON.stringify(a)), ANCHOR);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[aria-label="Buscar producto"]:not([disabled])', { timeout: 20000 });

  // 3) Typeahead place-era: escribir 'pol' -> sugerencia "Pollo N lugares".
  await page.fill('input[aria-label="Buscar producto"]', "pol");
  const suggest = page.locator("button", { hasText: /Pollo\s*\d+\s*lugares?/ }).first();
  await suggest.waitFor({ timeout: 10000 });
  const suggestText = (await suggest.textContent()) ?? "";
  if (!/lugares?/.test(suggestText) || /tiendas?/.test(suggestText)) {
    throw new Error(`sugerencia no es place-era: "${suggestText.trim()}"`);
  }
  await page.screenshot({ path: "shot-2-sugerencias.png" });
  console.log("3. sugerencias place-era OK (", suggestText.trim(), ")");

  // 4) Seleccionar -> resultados SOLO en mapa (sin toggle) + chip mejor precio.
  await suggest.click();
  await page.waitForFunction(
    () => /\d+ resultados?/.test(document.querySelector("main")?.innerText ?? ""),
    { timeout: 15000 },
  );
  await page.waitForSelector(".map-pin:not(.map-pin--anchor), .map-cluster", { timeout: 20000 });
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => ({
    pins: document.querySelectorAll(".map-pin:not(.map-pin--anchor)").length,
    clusters: document.querySelectorAll(".map-cluster").length,
    toggle:
      Boolean(document.querySelector('[role="tablist"]')) ||
      [...document.querySelectorAll("button")].some((b) =>
        /Opciones de vista|^(Mapa|Lista)$/.test(b.textContent?.trim() ?? ""),
      ),
    chip: [...document.querySelectorAll("main p")].some((el) =>
      el.textContent?.includes("Mejor precio:"),
    ),
  }));
  console.log(
    "4. resultados en mapa: pines =", state.pins, "clusters =", state.clusters,
    "| sin toggle =", !state.toggle, "| chip mejor precio =", state.chip,
  );
  if (state.pins + state.clusters === 0) throw new Error("sin resultados en el mapa tras buscar");
  if (state.toggle) throw new Error("el toggle Lista/Mapa deberia haber desaparecido");
  if (!state.chip) throw new Error("falta el chip de mejor precio con resultados con precio");
  await page.screenshot({ path: "shot-3-resultados.png" });

  console.log("PASS: ancla + flujo de entrada place-era completo");
} catch (err) {
  await page.screenshot({ path: "shot-fail.png" }).catch(() => {});
  console.error("FAIL:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
