// Probe: does OSM have CITY-level (urban) boundary polygons for Cuba?
const probes = [
  { label: "Sancti Spíritus (place=polygon)", q: `[out:json][timeout:20];( way["place"="city"]["name"="Sancti Spíritus"](21.7,-80.2,22.1,-79.3); relation["place"="city"]["name"="Sancti Spíritus"](21.7,-80.2,22.1,-79.3); );out geom;` },
  { label: "Trinidad (place=polygon)", q: `[out:json][timeout:20];( way["place"="town"]["name"="Trinidad"](21.6,-80.1,21.95,-79.85); );out geom;` },
  { label: "La Habana (place=city)", q: `[out:json][timeout:20];( relation["place"="city"]["name"="La Habana"](22.9,-82.5,23.3,-82.2); way["place"="city"]["name"="La Habana"](22.9,-82.5,23.3,-82.2); );out geom;` },
];

for (const p of probes) {
  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(p.q);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "DondeHay/0.1" },
    });
    if (!res.ok) {
      console.log(`${p.label}: HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    const els = json.elements.filter((e) => e.geometry || e.members?.some((m) => m.geometry));
    console.log(`${p.label}: ${els.length} elemento(s) con geometría`);
    for (const e of els.slice(0, 2)) {
      console.log("   tags:", JSON.stringify(e.tags ?? {}).slice(0, 160));
    }
  } catch (err) {
    console.log(`${p.label}: ERROR ${err.message}`);
  }
}
