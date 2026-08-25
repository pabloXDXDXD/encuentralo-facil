// Bulk random test data: stores + reports across Havana and Sancti Spiritus.
// All rows use device_hash 'seed-load-%' so scripts/refresh-demo-data.mjs
// wipes them cleanly. Randomized availability/prices/queues/windows to exercise
// every status: hay (<24h), ya_no_hay (2+ consensus), habia (1-7d), sin datos.
import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();

// deterministic-ish randomness is fine; plain Math.random ok for test data
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const offset = (base, meters) => base + (rand(-meters, meters) / 111320);

const HAVANA = { lat: 23.1355, lng: -82.3806 };
const SSP = { lat: 21.932, lng: -79.4425 };

const HAVANA_BARRIOS = ["Vedado", "Centro Habana", "Cerro", "Playa", "San Agustin", "Almendares"];
const SSP_BARRIOS = ["Centro", "Los Olivos", "Jesus Maria", "Sancti Spiritus"];

const STORE_NAMES = [
  "La Esquina", "Mercado El Ranchon", "Bodega La Fe", "Agropecuaria El Progreso",
  "Tienda La Amistad", "El Punto de Mela", "Carniceria El Novillo", "Mixto La Esperanza",
  "La Tiendita de 26", "Mercadito Idal", "El Mambisito", "Casa de Pan Lili",
];

// 1) clean previous load
const del = await c.query("delete from reports where device_hash like 'seed-load-%'");
console.log("old seed-load reports removed:", del.rowCount);

// 2) new stores: 8 in SSP, 6 in Havana (skip if name already exists)
const existing = await c.query("select name from stores");
const have = new Set(existing.rows.map((r) => r.name.toLowerCase()));
const newStores = [];
for (let i = 0; i < 14; i++) {
  const isSSP = i < 8;
  const base = isSSP ? SSP : HAVANA;
  const name = `${pick(STORE_NAMES)} ${isSSP ? "SSP" : "LH"} ${i + 1}`;
  if (have.has(name.toLowerCase())) continue;
  const barrio = isSSP ? pick(SSP_BARRIOS) : pick(HAVANA_BARRIOS);
  const ins = await c.query(
    `insert into stores (name, barrio, kind, lat, lng, province, status)
     values ($1,$2,$3,$4,$5,$6,'active') returning id`,
    [name, barrio, pick(["state_market", "private_market", "mipyme", "other"]), offset(base.lat, 4000), offset(base.lng, 4000), isSSP ? "Sancti Spíritus" : "La Habana"],
  );
  newStores.push({ id: ins.rows[0].id, lat: 0, lng: 0, isSSP });
}
console.log("new stores:", newStores.length);

// 3) products: pick 14 varied slugs
const prodRes = await c.query(
  `select id, slug from products where slug = any($1) and active = true`,
  [["pollo","arroz","cafe","huevos","aceite","azucar","harina-trigo","pasta","salchichas","malta","jabon-bano","papel-sanitario","frijoles-negros","leche-polvo"]],
);
const products = prodRes.rows;
console.log("products used:", products.length);

// 4) target stores: all stores in the two zones
const storeRes = await c.query(
  `select id, lat, lng from stores
   where status = 'active' and lat is not null and lng is not null
     and (province = 'La Habana' or province = 'Sancti Spíritus')`
);
console.log("stores targeted:", storeRes.rows.length);

// price bands per product family (CUP)
const PRICE = Object.fromEntries([
  ["pollo", [900, 2200]], ["arroz", [300, 900]], ["cafe", [400, 1200]],
  ["huevos", [180, 500]], ["aceite", [800, 2400]], ["azucar", [150, 400]],
  ["harina-trigo", [250, 700]], ["pasta", [350, 900]], ["salchichas", [600, 1500]],
  ["malta", [250, 700]], ["jabon-bano", [200, 600]], ["papel-sanitario", [300, 800]],
  ["frijoles-negros", [400, 1100]], ["leche-polvo", [900, 2600]],
]);

const devices = Array.from({ length: 40 }, (_, i) => `seed-load-dev${String(i).padStart(2, "0")}`);
let inserted = 0;
let votesInserted = 0;

for (const st of storeRes.rows) {
  // each store reports a random subset of products
  const chosen = new Set();
  const n = randInt(2, 6);
  while (chosen.size < n) chosen.add(pick(products));
  for (const p of chosen) {
    const roll = Math.random();
    const [pmin, pmax] = PRICE[p.slug] ?? [300, 1000];
    if (roll < 0.5) {
      // FRESH: hay (1-3 reporters, <24h)
      const reps = randInt(1, 3);
      for (let k = 0; k < reps; k++) {
        await c.query(
          `insert into reports (store_id, product_id, device_hash, availability, price_cup, queue_level, created_at)
           values ($1,$2,$3,'available',$4,$5, now() - ($6 || ' hours')::interval)`,
          [st.id, p.id, pick(devices), randInt(pmin, pmax), Math.random() < 0.5 ? null : randInt(1, 3), String(rand(0.5, 23))],
        );
        inserted++;
      }
    } else if (roll < 0.68) {
      // FRESH OUT: ya_no_hay (2+ consensus) or weak single out (not published)
      const reps = Math.random() < 0.6 ? randInt(2, 3) : 1;
      for (let k = 0; k < reps; k++) {
        await c.query(
          `insert into reports (store_id, product_id, device_hash, availability, created_at)
           values ($1,$2,$3,'out_of_stock', now() - ($4 || ' hours')::interval)`,
          [st.id, p.id, pick(devices), String(rand(0.5, 23))],
        );
        inserted++;
      }
    } else if (roll < 0.85) {
      // STALE: habia (1-6 days old, available)
      await c.query(
        `insert into reports (store_id, product_id, device_hash, availability, price_cup, created_at)
         values ($1,$2,$3,'available',$4, now() - ($5 || ' days')::interval)`,
        [st.id, p.id, pick(devices), randInt(pmin, pmax), String(rand(1.2, 6.5))],
      );
      inserted++;
    }
    // roll >= 0.85 -> sin datos (no row)
  }
}

// 5) some confirm/deny votes on fresh reports for effective-count variety
const fresh = await c.query(
  `select id, availability from reports where device_hash like 'seed-load-%' order by created_at desc limit 120`
);
for (const r of fresh.rows) {
  if (Math.random() < 0.35) {
    const voter = `seed-load-voter${randInt(0, 15)}`;
    const vote = Math.random() < 0.8 ? "confirm" : "deny";
    try {
      await c.query(
        `insert into report_votes (report_id, device_hash, vote) values ($1,$2,$3)`,
        [r.id, voter, vote],
      );
      votesInserted++;
    } catch { /* dup vote, ignore */ }
  }
}

console.log(`inserted reports: ${inserted}, votes: ${votesInserted}`);

// 6) verify status distribution via the real search function
for (const [label, lat, lng] of [["Habana", HAVANA.lat, HAVANA.lng], ["SSP", SSP.lat, SSP.lng]]) {
  const dist = await c.query(
    `select status, count(*)::int as n from search_availability('pollo', $1, $2, 20000) group by status`,
    [lat, lng],
  );
  console.log(`pollo ${label} (20km):`, dist.rows);
}
const totals = await c.query(
  `select
     (select count(*) from reports where device_hash like 'seed-load-%') as seed_reports,
     (select count(*) from stores where status='active') as active_stores`
);
console.log(totals.rows[0]);

await c.end();
