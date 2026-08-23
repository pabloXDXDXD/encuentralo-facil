// Probe search_availability function + sample call.
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const meta = await client.query(
  `select pg_get_function_arguments(oid) as args
     from pg_proc where proname = 'search_availability'`,
);
console.log("signature:", JSON.stringify(meta.rows));

try {
  const r = await client.query(
    `select * from public.search_availability($1,$2::float8,$3::float8,$4,null,false)`,
    ["pollo", 23.12, -82.38, 8000],
  );
  const interesting = r.rows.filter((x) => x.status !== "unknown");
  console.log(`rows: ${r.rows.length} | no-unknown: ${interesting.length}`);
  for (const x of interesting.slice(0, 6)) {
    console.log(`${x.store_name} | ${x.status} | ${x.distance_m}m | $${x.price_from} | rep:${x.reporter_count}`);
  }
  const unknownSample = r.rows.find((x) => x.status === "unknown");
  if (unknownSample) console.log(`(ej. unknown: ${unknownSample.store_name})`);
} catch (err) {
  console.error("CALL FAILED:", err.message);
}

await client.end();

