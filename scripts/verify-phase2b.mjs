// E2E verification: queue levels, contribution stats, saved-search data shape.
const BASE = "http://localhost:3000";
const DEVICE = "phase2b-test-device-01";

const H = { "content-type": "application/json", "x-device-id": DEVICE };

async function post(path, body, deviceId = DEVICE) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { ...H, "x-device-id": deviceId },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path, deviceId = DEVICE) {
  const res = await fetch(BASE + path, {
    headers: deviceId ? { "x-device-id": deviceId } : {},
  });
  return res.json();
}

// 1. find a store+product pair
const stores = (await get("/api/stores?barrio=Vedado")).stores;
const store = stores[0];
const products = (await get("/api/products")).categories[0].products[0];
console.log("pair:", store.name, "/", products.name);

// 2. report WITH queue level
const r1 = await post("/api/reports", {
  storeId: store.id,
  productId: products.id,
  availability: "available",
  priceCup: 500,
  queueLevel: 2,
});
console.log("report with queue:", JSON.stringify(r1));

// 3. invalid queue level -> 400
const r2 = await post("/api/reports", {
  storeId: store.id,
  productId: products.id,
  availability: "available",
  queueLevel: 5,
});
console.log("queue=5 rejected:", r2.status === 400 && r2.data.error === "invalid_queue");

// 4. snapshot exposes queue_level
const snap = await get("/api/availability");
const row = snap.rows.find((r) => r.store_id === store.id && r.product_slug === products.slug);
console.log("snapshot queue_level:", row ? row.queue_level : "ROW NOT FOUND");
console.log("snapshot has latest_report_id:", Boolean(row?.latest_report_id));

// 5. stats endpoint
const me = await get("/api/me");
console.log("me stats:", JSON.stringify(me.stats));
