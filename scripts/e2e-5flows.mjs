// E2E de la era places (lugares-mapfirst): 5 flujos contra el servidor de
// produccion (next start). El script SIEMBRA sus propios reportes frescos via
// POST /api/reports (las semillas del DB caducan a las 24 h) y no depende de
// la API de gestion de Supabase: solo node + playwright.
//
//   F1 home mapa-unico (sin toggle ni listas)     F4 quick-mark del popup envia placeId
//   F2 busqueda: sugerencias "lugares" + chip      F5 compat URL: 301 /tienda -> /lugar + SEO
//   F3 flujo unico de reporte (sin paso tienda)
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "C:/Users/USUARIO/AppData/Local/Temp/opencode/shots-5flows";
mkdirSync(OUT, { recursive: true });

// Lugar destilado estable (heredo el UUID de la tienda seed, D3):
// Mercado Comercial Obispo, 23.139/-82.358, Habana Vieja.
const PLACE_OBISPO = "d0000000-00c0-4e00-8000-000000000302";
const PLACE_NAME = "Mercado Comercial Obispo";
const ANCHOR = { lat: 23.1355, lng: -82.3806 }; // Centro Habana

let fails = 0;
const log = (m) => console.log(m);
const ok = (name, cond) => {
  if (!cond) fails++;
  log(`${cond ? "PASS" : "FAIL"} - ${name}`);
};
// Cada flujo corre aislado: una excepcion no aborta el resto del suite.
async function flow(name, fn) {
  try {
    await fn();
  } catch (err) {
    fails++;
    log(`FAIL - ${name} (excepcion: ${String(err.message ?? err).split("\n")[0]})`);
  }
}

// Guardia global: nunca colgar indefinidamente (150 s para todo el script).
const guard = setTimeout(() => {
  console.error("FAIL - timeout global (150s)");
  process.exit(1);
}, 150_000);
guard.unref?.();

// --- Siembra: reportes frescos propios. Device unico por envio para esquivar
// el guardia 30-min device+lugar+producto y el limite de 60 s entre envios. ---
async function seed(placeId, productId, availability, priceCup, tag) {
  const res = await fetch(`${BASE}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": `e2e8-${tag}-${Date.now()}`,
    },
    body: JSON.stringify({ placeId, productId, availability, priceCup }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`siembra fallo (${tag}): ${JSON.stringify(data)}`);
  return data;
}

// Productos resueltos del catalogo real (no hardcodear uuids de producto).
const products = await (await fetch(`${BASE}/api/products`)).json();
const bySlug = (slug) =>
  (products.categories ?? []).flatMap((c) => c.products ?? []).find((p) => p.slug === slug);
const POLLO = bySlug("pollo");
const MALTA = bySlug("malta");
if (!POLLO || !MALTA) throw new Error("catalogo incompleto: falta pollo o malta");

await seed(PLACE_OBISPO, POLLO.id, "available", 400, "pollo");
log(`siembra OK: Pollo disponible @ ${PLACE_NAME} (precio 400)`);

// Reflejo exacto de fmtDist/formatPrice del cliente para validar el chip.
const fmtDist = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const fmtPrice = (n) => `$${n.toLocaleString("es-CU")}`;
// textContent concatena spans sin espacios: comparar sin blancos.
const norm = (s) => (s ?? "").replace(/\s+/g, "");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const newPage = async (anchor) => {
  const ctx = await browser.newContext({
    viewport: { width: 480, height: 900 },
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  if (anchor) {
    await page.evaluate((a) => localStorage.setItem("dh_home_anchor", JSON.stringify(a)), anchor);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  return { ctx, page };
};

// ============ F1: home mapa-unico (sin toggle, sin listas por zona)
await flow("F1", async () => {
  const { ctx, page } = await newPage(ANCHOR);
  await page.waitForSelector('input[aria-label="Buscar producto"]:not([disabled])', { timeout: 20000 });
  await page.waitForSelector('[aria-label="Mapa de disponibilidad"]', { timeout: 20000 });
  await page.waitForTimeout(3000); // tiempo para pintar clusters/pines del browse
  const home = await page.evaluate(() => ({
    map: Boolean(document.querySelector('[aria-label="Mapa de disponibilidad"]')),
    fab: Boolean(document.querySelector('a[aria-label="Reportar producto"]')),
    toggle:
      Boolean(document.querySelector('[role="tablist"]')) ||
      [...document.querySelectorAll("button")].some((b) =>
        /Opciones de vista|^(Mapa|Lista)$/.test(b.textContent?.trim() ?? ""),
      ),
    markers: document.querySelectorAll(".map-cluster, .map-pin:not(.map-pin--anchor)").length,
  }));
  ok(
    `F1 home mapa-unico (mapa+fab, sin toggle; marcadores=${home.markers})`,
    home.map && home.fab && !home.toggle && home.markers > 0,
  );
  await page.screenshot({ path: `${OUT}/f1-home.png` });
  await ctx.close();
});

// ============ F2: busqueda -> sugerencias "lugares" -> mapa + chip mejor precio
await flow("F2", async () => {
  const { ctx, page } = await newPage(ANCHOR);
  await page.waitForSelector('input[aria-label="Buscar producto"]:not([disabled])', { timeout: 20000 });
  const input = page.locator('input[aria-label="Buscar producto"]');
  await input.click();
  await input.pressSequentially("pollo");
  // Sugerencia place-era: "Pollo N lugar/lugares" (nunca "tiendas"). Ojo:
  // textContent concatena los spans sin espacio entre ellos.
  const suggest = page.locator("button", { hasText: /Pollo\s*\d+\s*lugares?/ }).first();
  await suggest.waitFor({ timeout: 10000 });
  const suggestText = (await suggest.textContent()) ?? "";
  ok(
    `F2 typeahead place-era ("${suggestText.trim()}")`,
    /lugares?/.test(suggestText) && !/tiendas?/.test(suggestText),
  );
  await suggest.click();
  await page.waitForFunction(
    () => /\d+ resultados?/.test(document.querySelector("main")?.innerText ?? ""),
    { timeout: 15000 },
  );
  await page.waitForTimeout(2500); // pintura de marcadores

  // Chip esperado: minimo price_from entre filas visibles (estado != unknown,
  // filtro por defecto) en la misma consulta que lanza la UI.
  const api = await (
    await fetch(
      `${BASE}/api/search?q=Pollo&lat=${ANCHOR.lat}&lng=${ANCHOR.lng}&radius=3000`,
    )
  ).json();
  const visible = (api.rows ?? []).filter((r) => r.status !== "unknown");
  const priced = visible.filter((r) => r.price_from !== null && r.price_from !== undefined);
  const winner = priced
    .slice()
    .sort(
      (a, b) =>
        Number(a.price_from) - Number(b.price_from) ||
        Number(a.distance_m) - Number(b.distance_m),
    )[0];
  const chipText = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].find((el) =>
      el.textContent?.includes("Mejor precio:"),
    );
    return p?.textContent ?? "";
  });
  const expectedChip = winner
    ? `Mejor precio: ${fmtPrice(Number(winner.price_from))} · a ${fmtDist(Number(winner.distance_m))}`
    : "";
  ok(
    `F2 chip mejor precio ("${chipText.trim()}" == "${expectedChip}")`,
    Boolean(winner) && norm(chipText).includes(norm(expectedChip)),
  );

  const mapState = await page.evaluate(() => ({
    banner: (document.querySelector("main")?.innerText.match(/\d+ resultados?/) || ["?"])[0],
    markers: document.querySelectorAll(".map-cluster, .map-pin:not(.map-pin--anchor)").length,
    toggle: Boolean(document.querySelector('[role="tablist"]')),
  }));
  ok(
    `F2 resultados solo en mapa (${mapState.banner}, marcadores=${mapState.markers})`,
    mapState.markers > 0 && !mapState.toggle,
  );
  await page.screenshot({ path: `${OUT}/f2-search.png` });
  await ctx.close();
});

// ============ F3: flujo unico de reporte (sin paso tienda) + anti-dup place
await flow("F3", async () => {
  const ctx = await browser.newContext({
    viewport: { width: 480, height: 900 },
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();
  // Ancla junto al lugar seed para que el pin manual caiga a <40 m y el
  // reporte se anexe al lugar existente (attach-within-radius).
  await page.goto(`${BASE}/reportar`, { waitUntil: "domcontentloaded" });
  await page.evaluate((a) => localStorage.setItem("dh_home_anchor", JSON.stringify(a)), {
    lat: 23.139,
    lng: -82.358,
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  // Paso 1: catalogo directo — sin pantalla de eleccion ni flujo de tienda.
  // (textContent: innerText aplicaria el text-transform uppercase del CSS.)
  await page.waitForSelector("text=1 · Producto", { timeout: 20000 });
  const bodyText0 = await page.evaluate(() => document.body.textContent ?? "");
  ok(
    "F3 sin pantalla de eleccion ni paso tienda",
    bodyText0.includes("1 · Producto") &&
      bodyText0.includes("2 · Lugar") &&
      !bodyText0.includes("Sugerir punto en el mapa"),
  );
  await page.fill('input[placeholder="Buscar producto…"]', "malta");
  await page.waitForTimeout(400);
  await page.locator("button", { hasText: "Malta" }).first().click();

  // Paso 2: lugar — submit bloqueado sin pin (spec missing-input).
  await page.waitForSelector("text=¿Dónde hay Malta?", { timeout: 10000 });
  const submitBtn = page.locator("button", { hasText: "Enviar reporte" });
  ok("F3 submit bloqueado sin pin", await submitBtn.isDisabled());

  // Pin manual: click en el centro del mapa (centrado en el ancla, zoom 15).
  const mapLoc = page.locator('[aria-label="Mapa de disponibilidad"]');
  await mapLoc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  const box = await mapLoc.boundingBox();
  let reportReq = null;
  page.on("request", (r) => {
    if (r.url().includes("/api/reports") && r.method() === "POST") reportReq = r;
  });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector("text=Punto elegido:", { timeout: 10000 });
  ok("F3 submit habilitado con pin", await submitBtn.isEnabled());
  await page.fill('input[placeholder="$"]', "500");
  await submitBtn.click();
  await page.waitForSelector("text=¡Reporte enviado!", { timeout: 15000 });
  ok("F3 reporte enviado (flujo unico)", true);
  const sentBody = reportReq?.postDataJSON() ?? {};
  ok(
    "F3 payload place-first (pin manual -> lat/lng, sin placeId)",
    Number.isFinite(sentBody.lat) && Number.isFinite(sentBody.lng) && !("placeId" in sentBody),
  );

  // Anti-duplicado re-keyed place+producto: el pin cayo a <40 m del lugar
  // seed, el servidor anexo el reporte y el chequeo de ultimo reporte lo
  // encuentra por place+product.
  await page.goto(`${BASE}/reportar?place=${PLACE_OBISPO}&producto=malta`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(`text=Lugar: ${PLACE_NAME}`, { timeout: 15000 });
  await page.waitForSelector("text=Reportaron Malta aquí hace", { timeout: 15000 });
  const antiDup = await page
    .locator("button", { hasText: "Confirmar el reporte existente" })
    .isVisible();
  ok("F3 anti-duplicado ofrece confirmar el reporte existente", antiDup);
  await page.screenshot({ path: `${OUT}/f3-antidup.png` });
  await ctx.close();
});

// ============ F4: quick-mark del popup envia placeId
await flow("F4", async () => {
  // Ancla sobre el lugar seed y radio corto (1.5 km) para aislar el pin.
  // Ojo: el fitBounds del radio deja la camara en ~zoom 14, donde el
  // maxClusterRadius (56 px ≈ 490 m) agrupa el pin seed con los pines
  // confirmados cercanos; hay que acercar con la rueda hasta que el
  // clustering los suelte (3 pasos; el ancla queda centrada tras el
  // fitBounds y el wheel en el centro no la descentra).
  const { ctx, page } = await newPage({ lat: 23.139, lng: -82.358 });
  await page.waitForSelector('input[aria-label="Buscar producto"]:not([disabled])', { timeout: 20000 });
  const input = page.locator('input[aria-label="Buscar producto"]');
  await input.click();
  await input.pressSequentially("pollo");
  await page.locator("button", { hasText: /Pollo\s*\d+\s*lugares?/ }).first().click();
  await page.waitForFunction(
    () => /\d+ resultados?/.test(document.querySelector("main")?.innerText ?? ""),
    { timeout: 15000 },
  );
  await page.locator("button", { hasText: "Filtros" }).first().click();
  await page.locator("button", { hasText: "≤1.5 km" }).first().click();
  await page.waitForSelector(".leaflet-marker-icon", { timeout: 15000 });
  const mapBox = await page.locator('[aria-label="Mapa de disponibilidad"]').boundingBox();
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(1200);
  }
  await page.waitForSelector(".leaflet-marker-icon .map-pin--confirmed", { timeout: 15000 });
  await page.waitForTimeout(1000);

  let markReq = null;
  page.on("request", (r) => {
    if (r.url().includes("/api/reports") && r.method() === "POST") markReq = r;
  });

  // El pin confirmado de la siembra NO tiene por que ser el primero: puede
  // convivir con otros pines confirmados (y el marcador de ancla, clavado en
  // las mismas coordenadas del seed, puede robar algun click). Iterar TODOS
  // los pines confirmados: click, leer el textContent del popup abierto y el
  // data-place-id de sus botones, y aceptar el que calce con el lugar seed.
  // F4 falla solo si NINGUN pin calza.
  let found = false;
  for (let i = 0; i < 8 && !found; i++) {
    const center = await page.evaluate((idx) => {
      const icons = [...document.querySelectorAll(".leaflet-marker-icon .map-pin--confirmed")];
      const el = icons[idx];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const inView =
        r.x >= 0 &&
        r.y >= 0 &&
        r.x + r.width <= window.innerWidth &&
        r.y + r.height <= window.innerHeight;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, inView };
    }, i);
    if (!center) break;
    if (!center.inView) continue;
    // Cerrar el popup del pin anterior: click en el mapa lo cierra (una
    // esquina libre no toca ningun pin, quedan centrados tras el zoom).
    await page.mouse.click(mapBox.x + 6, mapBox.y + 6);
    await page.waitForTimeout(300);
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(800);
    // textContent, NO innerText: el CSS text-transform aplicaria mayusculas.
    const popup = await page.evaluate(() => {
      const el = document.querySelector(".leaflet-popup");
      return {
        text: el?.textContent ?? "",
        placeId: el?.querySelector(".popup-mark--yes")?.getAttribute("data-place-id") ?? null,
      };
    });
    if (popup.placeId === PLACE_OBISPO && popup.text.includes(PLACE_NAME)) found = true;
  }
  ok("F4 popup del lugar seed abierto (iterando pines confirmados)", found);

  if (found) {
    const popup = await page.evaluate(() => {
      const el = document.querySelector(".leaflet-popup");
      return {
        name: el?.querySelector(".popup-name")?.textContent ?? "",
        product: el?.querySelector(".popup-product")?.textContent ?? "",
        meta: el?.querySelector(".popup-meta")?.textContent ?? "",
        yes: Boolean(el?.querySelector('.popup-mark--yes[data-status="available"]')),
      };
    });
    ok(
      `F4 popup enriquecido ("${popup.name.trim()}" + "${popup.product.trim()}")`,
      popup.name.includes(PLACE_NAME) &&
        popup.product.includes("Pollo") &&
        /confirmaci[oó]n/.test(popup.meta) &&
        popup.yes,
    );
    await page.locator(".leaflet-popup .popup-mark--yes").first().click();
    await page.waitForSelector(".leaflet-popup .popup-mark-done", { timeout: 15000 });
    ok("F4 quick-mark exitoso (Reportado ✓)", true);
    const body = markReq?.postDataJSON() ?? {};
    ok(
      `F4 quick-mark envia placeId (${body.placeId})`,
      body.placeId === PLACE_OBISPO && body.productId === POLLO.id && body.availability === "available",
    );
  }
  await page.screenshot({ path: `${OUT}/f4-quickmark.png` });
  await ctx.close();
});

// ============ F5: compatibilidad de URLs (fetch plano, sin browser)
await flow("F5", async () => {
  const tienda = await fetch(`${BASE}/tienda/${PLACE_OBISPO}`, { redirect: "manual" });
  const location = tienda.headers.get("location") ?? "";
  ok(
    `F5 /tienda/x -> 301 -> /lugar/x (status=${tienda.status}, location=${location})`,
    tienda.status === 301 && location.includes(`/lugar/${PLACE_OBISPO}`),
  );
  const lugar = await fetch(`${BASE}/lugar/${PLACE_OBISPO}`);
  const lugarHtml = await lugar.text();
  ok(
    "F5 /lugar/x renderiza el lugar destilado",
    lugar.status === 200 && lugarHtml.includes(PLACE_NAME),
  );
  const producto = await fetch(`${BASE}/producto/pollo`);
  const barrio = await fetch(`${BASE}/barrio/plaza-vieja`);
  ok(
    `F5 rutas SEO intactas (/producto=${producto.status}, /barrio=${barrio.status})`,
    producto.status === 200 && barrio.status === 200,
  );
  const stores = await fetch(`${BASE}/api/stores`);
  ok(`F5 /api/stores eliminado (status=${stores.status})`, stores.status === 404);
});

await browser.close();
log(fails === 0 ? "--- fin: PASS (5 flujos, 0 fallos) ---" : `--- fin: FAIL (${fails} fallos) ---`);
process.exitCode = fails === 0 ? 0 : 1;
