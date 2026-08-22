// One-off: fetch Cuba ADM2 (municipality) boundaries from geoBoundaries,
// inspect structure so we can pick the right name property.
const api = await (
  await fetch("https://www.geoboundaries.org/api/current/gbOpen/CUB/ADM2/")
).json();
console.log("name:", api.name);
console.log("gjDownloadURL:", api.gjDownloadURL);
console.log("shapeCount:", api.shapeCount);

const gj = await (await fetch(api.gjDownloadURL)).json();
console.log("features:", gj.features.length);
const sample = gj.features[0];
console.log("properties keys:", Object.keys(sample.properties));
console.log("sample props:", JSON.stringify(sample.properties).slice(0, 300));
console.log(
  "geometry type:",
    sample.geometry.type,
    "| first coords:",
    JSON.stringify(sample.geometry.coordinates?.[0]?.[0] ?? sample.geometry.coordinates?.[0]).slice(0, 120),
);
