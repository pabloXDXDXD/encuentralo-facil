// E2E verification for Confirm/Deny votes against the running local server.
const BASE = "http://localhost:3000";
const DEVICE_A = "vote-test-device-a1";
const DEVICE_B = "vote-test-device-b2";

function headers(deviceId) {
  return { "content-type": "application/json", "x-device-id": deviceId };
}

async function post(path, deviceId, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: headers(deviceId),
    body: JSON.stringify(body),
  });
  return res.json();
}

async function availability() {
  const res = await fetch(`${BASE}/api/availability`);
  return res.json();
}

// --- 1. snapshot before ---
const before = await availability();
console.log("rows before:", before.rows.length);
if (before.rows.length === 0) throw new Error("no rows to test");
const target = before.rows[0];
console.log(
  `target: ${target.product_name} @ ${target.store_name} reporters=${target.reporter_count} report=${target.latest_report_id.slice(0, 8)}`
);

// --- 2. own-report rejection (seed reports belong to device 'seed-demo') ---
const seedReport = before.rows.find((r) => r.latest_report_id) ?? target;
// We cannot know which raw report is seed-owned via API; test duplicate + ok paths instead.

// --- 3. confirm vote ---
const c1 = await post("/api/votes", DEVICE_A, {
  reportId: target.latest_report_id,
  vote: "confirm",
});
console.log("confirm #A:", JSON.stringify(c1));

// --- 4. deny votes from two devices should zero out effective and hide row (reporters=1 case) ---
await post("/api/votes", DEVICE_A, { reportId: target.latest_report_id, vote: "deny" }); // switch A to deny
await post("/api/votes", DEVICE_B, { reportId: target.latest_report_id, vote: "deny" });

// unique constraint keeps only FIRST vote per device per report:
// A stays 'confirm', B becomes 'deny'. So net = reporters(>=1) + 1 - 1 >= visible.
const mid = await availability();
const stillThere = mid.rows.find((r) => r.latest_report_id === target.latest_report_id);
console.log("after mixed votes row present:", Boolean(stillThere));

// --- 5. invalid inputs ---
const badVote = await post("/api/votes", DEVICE_B, { reportId: "not-a-uuid", vote: "confirm" });
console.log("invalid uuid:", JSON.stringify(badVote));
const badType = await post("/api/votes", DEVICE_B, { reportId: target.latest_report_id, vote: "meh" });
console.log("invalid vote type:", JSON.stringify(badType));

console.log("done");
