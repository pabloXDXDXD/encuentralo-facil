// Diagnostic: run seed.sql statements one by one to find the failing one.
import { readFileSync } from "node:fs";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = readFileSync("supabase/seed.sql", "utf8");
// seed.sql has no $$ function bodies -> splitting on ';' is safe.
const statements = sql
  .split(";")
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((s) => s.length > 0);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

let i = 0;
for (const stmt of statements) {
  i++;
  const head = stmt.replace(/\s+/g, " ").slice(0, 70);
  try {
    await client.query(stmt);
    console.log(`OK   #${i} ${head}`);
  } catch (err) {
    console.log(`FAIL #${i} ${head}`);
    console.log(`     ${err.message}`);
    // show tail of the failing statement where column-count bugs live
    const tail = stmt.replace(/\s+/g, " ").slice(-160);
    console.log(`     ...${tail}`);
    break;
  }
}
await client.end();
