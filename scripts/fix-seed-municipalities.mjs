// One-off: normalize seeded Havana zones to official municipalities (UTF-8 safe).
import { readFileSync, writeFileSync } from "node:fs";

const file = "supabase/seed.sql";
let content = readFileSync(file, "utf8");

const replacements = [
  ["'Vedado'", "'Plaza de la Revolución'"],
  ["'Nuevo Vedado'", "'Plaza de la Revolución'"],
  ["'Miramar'", "'Playa'"],
  ["'Víbora'", "'Diez de Octubre'"],
  ["'Santos Suárez'", "'Diez de Octubre'"],
];

for (const [from, to] of replacements) {
  content = content.split(from).join(to);
}

writeFileSync(file, content, "utf8");

// Sanity check: store NAMES must be untouched.
const checks = ["Mercado Nuevo Vedado", "MIPYME Miramar Gourmet", "Mercado Víbora", "Bodega Acosta"];
for (const name of checks) {
  console.log(content.includes(name) ? `OK  name intact: ${name}` : `DAMAGED: ${name}`);
}
console.log(
  "municipality values:",
  (content.match(/Plaza de la Revolución/g) ?? []).length,
  (content.match(/'Playa'/g) ?? []).length,
  (content.match(/'Diez de Octubre'/g) ?? []).length
);
