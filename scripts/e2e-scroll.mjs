// E2E de scroll/superposiciones: sticky del buscador, popups Leaflet vs
// contenido, FAB vs footer.
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
await ctx.addInitScript(() => {
  localStorage.setItem("dh_home_anchor", JSON.stringify({ lat: 23.1355, lng: -82.3806 }));
  localStorage.setItem("dh_pref_view", "map");
});

const page = await ctx.newPage();
await page.route("**/api/search*", (route) => route.fulfill({ json: search }));
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

let failed = false;
try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[aria-label="Buscar producto"]:not([disabled])', { timeout: 20000 });

  // Buscar para tener mapa con pines
  await page.fill('input[aria-label="Buscar producto"]', "pollo");
  await page.press('input[aria-label="Buscar producto"]', "Enter");
  await page.waitForSelector(".map-pin:not(.map-pin--anchor)", { timeout: 20000 });
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

  // --- Test 3: FAB vs footer (el FAB solo existe en modo browse) --------
  await page.click('button[aria-label="Limpiar búsqueda"]');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const fab = await page.locator('a[aria-label="Reportar producto"]').boundingBox();
  const footer = await page.locator("footer").boundingBox();
  const overlap =
    fab && footer && !(fab.y + fab.height <= footer.y || footer.y + footer.height <= fab.y);
  console.log("FAB solapa footer =", overlap, JSON.stringify({ fab: fab?.y, footer: footer?.y }));
  await page.screenshot({ path: "shot-scroll-3-footer.png" });

  console.log(overlap === false ? "PASS: scroll y superposiciones OK" : "WARN: FAB solapa el footer");
  if (overlap) process.exitCode = 1;
} catch (err) {
  await page.screenshot({ path: "shot-fail.png" }).catch(() => {});
  console.error("FAIL:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}