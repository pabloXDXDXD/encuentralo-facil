// Debug function variant exposing internal counts.
import { readFileSync } from "node:fs";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

await client.query(readFileSync("scripts/debug-fn.sql", "utf8"));

const res = await client.query(
  "select * from public.__debug_search('pollo',23.12,-82.38,8000,null,false)",
);
console.table(res.rows);

await client.query(
  "drop function public.__debug_search(text,double precision,double precision,integer,integer,boolean)",
);
await client.end();
