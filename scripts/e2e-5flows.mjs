import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "C:/Users/USUARIO/AppData/Local/Temp/opencode/shots-5flows";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(m);
const ok = (name, cond) => log(`${cond ? "PASS" : "FAIL"} - ${name}`);

const browser = await chromium.launch({ channel: "chrome", headless: true });

// ============ FLUJO 1: nuevo usuario -> onboarding -> mapa limpio -> ubi -> vacio
{
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(2000);
  const onlyGate = await page.evaluate(() => {
    const t = document.body.innerText;
    return t.includes("Elige tu punto") && !document.querySelector('[role="application"]') && !document.querySelector('input[placeholder*="Buscar"]');
  });
  ok("F1 onboarding exclusivo (sin mapa ni busqueda)", onlyGate);
  await page.getByRole("button", { name: "Elegir punto en el mapa" }).click();
  await page.waitForSelector('[role="application"]', { timeout: 20000 });
  await page.waitForTimeout(2500);
  const cleanPick = await page.evaluate(() => document.querySelectorAll(".map-pin--store, .map-cluster").length === 0);
  ok("F1 mapa de pick limpio (sin pines ni clusters)", cleanPick);
  const box = await page.locator('[role="application"]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Confirmar|Usar/ }).first().click().catch(() => {});
  // HomeView pick mode: tapping sets anchor via onPick directly (confirm may be immediate)
  await page.waitForTimeout(1500);
  const afterPick = await page.evaluate(() => {
    const t = document.body.innerText;
    return { hasAnchor: t.includes("Toda Cuba") || t.includes("La Habana") || t.includes("Punto"), empty: t.includes("Qué buscas hoy") || t.includes("Busca un producto") };
  });
  ok("F1 ubi fijada y estado vacio pre-busqueda", afterPick.hasAnchor && afterPick.empty);
  await page.screenshot({ path: `${OUT}/f1-empty.png` });
  await ctx.close();
}

// ============ FLUJO 2: buscar -> solo sugerencias -> seleccionar -> mapa con estados
{
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000");
  await page.evaluate(() => localStorage.setItem("dh_home_anchor", JSON.stringify({ lat: 23.1355, lng: -82.3806 })));
  await page.reload();
  await page.waitForSelector('input[placeholder*="Buscar"]');
  const input = page.getByRole("textbox", { name: "Buscar producto" });
  await input.click();
  await input.pressSequentially("pollo");
  await page.waitForTimeout(1200);
  const onlySuggestions = await page.evaluate(() => {
    const t = document.querySelector("main").innerText;
    const hasResults = /\d+ resultados/.test(t);
    const hasSuggest = t.includes("tiendas");
    return { hasResults, hasSuggest };
  });
  ok("F2 al escribir solo sugerencias (sin resultados)", !onlySuggestions.hasResults && onlySuggestions.hasSuggest);
  await page.getByRole("button", { name: /Pollo \d+ tiendas/ }).click();
  await page.waitForFunction(() => /\d+ resultados?/.test(document.querySelector("main")?.innerText || ""), { timeout: 15000 });
  await page.getByRole("button", { name: "Opciones de vista" }).click();
  await page.locator('button:has-text("Mapa")').first().click();
  await page.waitForTimeout(3000);
  const mapState = await page.evaluate(() => ({
    banner: (document.querySelector("main").innerText.match(/\d+ resultados?/) || ["?"])[0],
    clusters: document.querySelectorAll(".map-cluster").length,
    pins: [...document.querySelectorAll('[role="application"] .map-pin')].filter(e => !e.className.includes("anchor")).length,
  }));
  ok(`F2 resultados en mapa (banner=${mapState.banner}, clusters=${mapState.clusters}, pins=${mapState.pins})`, mapState.clusters + mapState.pins > 0);
  await page.screenshot({ path: `${OUT}/f2-map.png` });
  await ctx.close();
}

// ============ FLUJO 3: filtros actualizan sin perder pines
{
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000");
  await page.evaluate(() => localStorage.setItem("dh_home_anchor", JSON.stringify({ lat: 23.1355, lng: -82.3806 })));
  await page.reload();
  await page.waitForSelector('input[placeholder*="Buscar"]');
  const input = page.getByRole("textbox", { name: "Buscar producto" });
  await input.click();
  await input.pressSequentially("pollo");
  await page.getByRole("button", { name: /Pollo \d+ tiendas/ }).click();
  await page.waitForFunction(() => /\d+ resultados?/.test(document.querySelector("main")?.innerText || ""), { timeout: 15000 });
  await page.getByRole("button", { name: "Opciones de vista" }).click();
  await page.locator('button:has-text("Mapa")').first().click();
  await page.waitForTimeout(2500);
  const counts = [];
  for (const f of ["≤1.5 km", "≤6 km", "≤10 km", "≤3 km"]) {
    await page.locator(`button:has-text("${f}")`).first().click();
    await page.waitForTimeout(2200);
    const s = await page.evaluate(() => ({
      banner: (document.querySelector("main").innerText.match(/\d+ resultados?/) || ["?"])[0],
      visible: document.querySelectorAll(".map-cluster").length + [...document.querySelectorAll('[role="application"] .map-pin')].filter(e => !e.className.includes("anchor")).length,
    }));
    counts.push(`${f}:${s.banner}/${s.visible}elem`);
  }
  ok("F3 filtros actualizan y mapa siempre poblado: " + counts.join(" | "), counts.every(c => !c.endsWith("/0elem")));
  await page.screenshot({ path: `${OUT}/f3-filters.png` });
  await ctx.close();
}

// ============ FLUJO 4: reportar producto completo + anti-dup
{
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/reportar");
  await page.waitForSelector('button:has-text("Reportar producto")', { timeout: 20000 });
  await page.locator('button:has-text("Reportar producto")').click();
  await page.waitForTimeout(800);
  // producto
  await page.fill('input[placeholder*="Buscar producto"]', "malta");
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Malta")').first().click();
  await page.waitForTimeout(500);
  // tienda: primera de la lista
  const storeBtn = page.locator('section button').filter({ hasText: /Bodega|Tienda|Mercado|Agro/ }).first();
  await storeBtn.click();
  await page.waitForTimeout(500);
  // confirmar
  await page.locator('button:has-text("Enviar reporte"), button:has-text("Reportar")').last().click();
  await page.waitForTimeout(2000);
  const sent = await page.evaluate(() => document.body.innerText.includes("reporte") && (document.body.innerText.includes("Gracias") || document.body.innerText.includes("enviado") || document.body.innerText.includes("Enviado") || document.body.innerText.includes("gracias")));
  ok("F4 reporte enviado", sent);
  // repetir mismo reporte -> anti-dup
  await page.goto("http://localhost:3000/reportar?producto=malta");
  await page.waitForTimeout(1500);
  await page.locator('section button').filter({ hasText: /Bodega|Tienda|Mercado|Agro/ }).first().click();
  await page.waitForTimeout(1200);
  const antiDup = await page.evaluate(() => document.body.innerText.includes("Confirmar el reporte existente"));
  ok("F4 anti-duplicado ofrece confirmar existente", antiDup);
  await page.screenshot({ path: `${OUT}/f4-antidup.png` });
  await ctx.close();
}

// ============ FLUJO 5: sugerir punto completo
{
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/reportar");
  await page.waitForSelector('button:has-text("Sugerir punto en el mapa")', { timeout: 20000 });
  await page.locator('button:has-text("Sugerir punto en el mapa")').click();
  await page.waitForSelector('[role="application"]', { timeout: 20000 });
  await page.waitForTimeout(3000);
  const pins = await page.evaluate(() => document.querySelectorAll(".map-pin--store").length);
  ok(`F5 tiendas existentes visibles en pick map (${pins})`, pins > 0);
  const box = await page.locator('[role="application"]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Continuar")').click();
  await page.fill('input[placeholder*="Nombre del punto"]', "Punto QA Cinco");
  await page.locator('button:has-text("Crear punto")').click();
  await page.waitForSelector("text=Punto creado", { timeout: 10000 });
  const both = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].map(x => x.textContent.trim());
    return b.some(t => t.includes("Añadir productos")) && b.some(t => t.includes("Solo salir"));
  });
  ok("F5 pantalla done con ambas opciones", both);
  await page.screenshot({ path: `${OUT}/f5-done.png` });
  await page.locator('button:has-text("Añadir productos")').click();
  await page.waitForTimeout(1000);
  const flowA = await page.evaluate(() => document.body.innerText.includes("Punto QA Cinco") && document.body.innerText.includes("qué quieres reportar"));
  ok("F5 añadir productos -> Flow A con tienda preseleccionada", flowA);
  await ctx.close();
}

await browser.close();
log("--- fin 5 flujos ---");
