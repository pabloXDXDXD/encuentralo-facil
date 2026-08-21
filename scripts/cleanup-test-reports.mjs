// Removes reports created by a given test device id (hashed the same way
// as the API route does).
import { createHash } from "node:crypto";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const deviceId = process.argv[2];
if (!deviceId) {
  console.error("Usage: node scripts/cleanup-test-reports.mjs <device-id>");
  process.exit(1);
}

const hash = createHash("sha256")
  .update(`${process.env.DEVICE_HASH_SALT}:${deviceId}`)
  .digest("hex");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const result = await client.query("delete from public.reports where device_hash = $1", [hash]);
console.log("deleted:", result.rowCount);
await client.end();
