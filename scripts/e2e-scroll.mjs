// E2E de scroll/superposiciones (era places): sticky del buscador, popups
// Leaflet vs contenedor del mapa, usabilidad del FAB flotante frente al
// footer (el solapamiento geometrico es por diseno; se asserts la
// clicabilidad del FAB, no la ausencia de solape).
// Contra el servidor de produccion (next start); siembra su propio reporte
// fresco via POST /api/reports (las semillas del DB caducan a las 24 h) y ya
// no mockea /api/search contra la API de gestion de Supabase.
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// Lugar destilado estable (heredo el UUID de la tienda seed, D3):
// Mercado Comercial Obispo, 23.139/-82.358, Habana Vieja.
const PLACE_OBISPO = "d0000000-00c0-4e00-8000-000000000302";
const ANCHOR = { lat: 23.1355, lng: -82.3806 }; // Centro Habana

// --- Siembra: reporte fresco propio con precio (pin confirmado para el popup) ---
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
      "x-device-id": `e2e8s-${Date.now()}`,
    },
    body: JSON.stringify({
      placeId: PLACE_OBISPO,
      productId: POLLO.id,
      availability: "available",
      priceCup: 420,
    }),
  })
).json();
if (!seedRes.ok) throw new Error(`siembra fallo: ${JSON.stringify(seedRes)}`);
console.log(`siembra OK: Pollo disponible @ ${PLACE_OBISPO} (precio 420)`);

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
await ctx.addInitScript((a) => {
  localStorage.setItem("dh_home_anchor", JSON.stringify(a));
}, ANCHOR);

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[aria-label="Buscar producto"]:not([disabled])', { timeout: 20000 });

  // Buscar para tener mapa con pines: la busqueda se lanza al elegir una
  // sugerencia del typeahead (Enter solo re-ejecuta una busqueda activa).
  await page.fill('input[aria-label="Buscar producto"]', "pollo");
  await page.locator("button", { hasText: /Pollo\s*\d+\s*lugares?/ }).first().waitFor({ timeout: 10000 });
  await page.locator("button", { hasText: /Pollo\s*\d+\s*lugares?/ }).first().click();
  await page.waitForSelector(".map-pin:not(.map-pin--anchor), .map-cluster", { timeout: 20000 });
  await page.waitForTimeout(1500);

  // --- Test 1: sticky del buscador ------------------------------------
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  const searchBar = await page.locator("div.sticky").first().boundingBox();
  console.log("sticky search box y =", searchBar?.y);
  if (searchBar === null || searchBar.y > 2) throw new Error("el buscador no se pegó arriba al scrollear");
  const topEl = await page.evaluate(() => {
    const el = document.elementFromPoint(210, 20);
    return el?.closest("div.sticky") ? "sticky-search" : ((el?.className ?? "??") + "").slice(0, 60);
  });
  console.log("elemento en (210,20) tras scroll =", topEl);
  if (topEl !== "sticky-search") throw new Error("algo solapa el buscador sticky: " + topEl);
  await page.screenshot({ path: "shot-scroll-1-sticky.png" });

  // --- Test 2: popup del mapa no debe escapar del mapa ------------------
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  // Con el radio por defecto (3 km, ~zoom 13) el maxClusterRadius (56 px
  // ≈ 980 m) agrupa entre si a los pines confirmados: si no hay ninguno
  // individual, acercar haciendo click en el cluster confirmado (click de
  // cluster = zoom hacia el) hasta que se suelten (max 4 pasos).
  for (let i = 0; i < 4; i++) {
    const hasPin = await page.locator(".leaflet-marker-icon .map-pin--confirmed").count();
    if (hasPin > 0) break;
    const clusterCenter = await page.evaluate(() => {
      const el = document.querySelector(".leaflet-marker-icon .map-cluster--confirmed");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!clusterCenter) break;
    await page.mouse.click(clusterCenter.x, clusterCenter.y);
    await page.waitForTimeout(1200);
  }
  // click sobre el icono de Leaflet (padre del .map-pin) que este arriba en el z-order
  const iconInfo = await page.evaluate(() => {
    const icons = [...document.querySelectorAll(".leaflet-marker-icon .map-pin--confirmed")];
    const last = icons[icons.length - 1];
    if (!last) return null;
    const r = last.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, n: icons.length };
  });
  console.log("iconos confirmados =", iconInfo?.n, "centro =", iconInfo);
  if (iconInfo) {
    await page.mouse.click(iconInfo.x, iconInfo.y);
    await page.waitForTimeout(800);
  }
  let popupCount = await page.locator(".leaflet-popup").count();
  console.log("popups tras click centro =", popupCount);
  if (popupCount === 0) {
    // reintento: click directo sobre el elemento via dispatch
    await page.evaluate(() => {
      const icons = document.querySelectorAll(".leaflet-marker-icon");
      const last = icons[icons.length - 1];
      last?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForTimeout(800);
    popupCount = await page.locator(".leaflet-popup").count();
    console.log("popups tras dispatch =", popupCount);
  }
  await page.waitForSelector(".leaflet-popup", { timeout: 10000 });
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400);
  const popupBox = await page.locator(".leaflet-popup").boundingBox();
  const mapBox = await page.locator(".leaflet-container").boundingBox();
  const inside =
    popupBox && mapBox &&
    popupBox.y >= mapBox.y - 1 &&
    popupBox.y + popupBox.height <= mapBox.y + mapBox.height + 1;
  console.log("popup dentro del mapa =", inside, JSON.stringify({ popupBox, mapBox }));
  if (!inside) throw new Error("el popup del mapa se sale del contenedor al scrollear");
  await page.screenshot({ path: "shot-scroll-2-popup.png" });

  // --- Test 3: usabilidad del FAB flotante frente al footer ---------------
  // El FAB es un boton flotante por diseno (`fixed bottom-20 right-4 z-40`,
  // geometria byte-identica desde antes de PR6 — no es regresion de PR8):
  // los elementos flotantes SOLAPAN el contenido que queda debajo de ellos,
  // incluido el footer. Ese solapamiento geometrico es intencional y se
  // permite de forma explicita; lo que si se asserts aqui es lo que de
  // verdad importa: que el FAB este renderizado, sea visible, tenga tamano
  // real, no este deshabilitado y siga siendo clicable (su z-index debe
  // ganar el hit-test aunque se superponga al footer).
  await page.click('button[aria-label="Limpiar búsqueda"]');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const fabLoc = page.locator('a[aria-label="Reportar producto"]');
  const fabCount = await fabLoc.count();
  if (fabCount !== 1) throw new Error(`FAB ausente o duplicado (count=${fabCount})`);
  const fab = await fabLoc.boundingBox();
  console.log("FAB box =", JSON.stringify(fab));
  if (!(await fabLoc.isVisible()) || !fab || fab.width < 10 || fab.height < 10)
    throw new Error("el FAB no es visible o tiene tamano cero");
  const fabState = await fabLoc.evaluate((el) => ({
    href: el.getAttribute("href"),
    disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
  }));
  if (fabState.disabled || fabState.href !== "/reportar")
    throw new Error(`FAB no utilizable: ${JSON.stringify(fabState)}`);
  // Clicabilidad: el hit-test en el centro del FAB debe resolver al propio
  // FAB (o a su icono hijo), no al footer que queda debajo.
  const hitTarget = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('a[aria-label="Reportar producto"]') ? "fab" : (el?.tagName ?? "null");
    },
    { x: fab.x + fab.width / 2, y: fab.y + fab.height / 2 }
  );
  console.log("hit-test en el centro del FAB =", hitTarget);
  if (hitTarget !== "fab")
    throw new Error("el FAB no es clicable (otro elemento gana el hit-test): " + hitTarget);
  // Solapamiento geometrico con el footer: permitido por diseno (solo se registra).
  const footer = await page.locator("footer").boundingBox();
  const overlap =
    fab && footer && !(fab.y + fab.height <= footer.y || footer.y + footer.height <= fab.y);
  console.log(
    "FAB solapa footer (permitido: boton flotante) =",
    overlap,
    JSON.stringify({ fab: fab?.y, footer: footer?.y })
  );
  await page.screenshot({ path: "shot-scroll-3-footer.png" });

  console.log("PASS: scroll y superposiciones OK");
} catch (err) {
  await page.screenshot({ path: "shot-fail.png" }).catch(() => {});
  console.error("FAIL:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
