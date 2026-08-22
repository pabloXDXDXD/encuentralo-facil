// Probe: fetch a real municipality boundary from Overpass to validate query.
const query = `[out:json][timeout:20];
rel["boundary"="administrative"]["name"="Playa"](23.0,-82.48,23.24,-82.28);
out geom;`;

const endpoints = [
  "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query),
  "https://overpass.kumi.systems/api/interpreter?data=" + encodeURIComponent(query),
];

let json = null;
for (const url of endpoints) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "DondeHay/0.1 (local dev)",
    },
  });
  console.log("endpoint:", new URL(url).host, "-> status:", res.status);
  if (res.ok) {
    json = await res.json();
    break;
  }
}
if (!json) process.exit(1);

const rels = json.elements.filter((e) => e.type === "relation");
console.log("relations:", rels.length);
for (const r of rels.slice(0, 3)) {
  console.log(
    "-",
    r.tags?.name,
    "| admin_level:",
    r.tags?.admin_level,
    "| members:",
    r.members?.length ?? 0,
    "| with geometry:",
    r.members?.filter((m) => m.geometry)?.length ?? 0,
  );
}
const first = rels.find((r) => r.members?.some((m) => m.geometry));
if (first) {
  const w = first.members.find((m) => m.geometry);
  console.log("sample way pts:", w.geometry.length, "first:", JSON.stringify(w.geometry[0]));
}
