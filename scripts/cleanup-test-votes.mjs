// Removes votes created by test device ids (hashed like the API route does).
import { createHash } from "node:crypto";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const deviceIds = process.argv.slice(2);
if (deviceIds.length === 0) {
  console.error("Usage: node scripts/cleanup-test-votes.mjs <device-id> [<device-id> ...]");
  process.exit(1);
}

const hashes = deviceIds.map((id) =>
  createHash("sha256").update(`${process.env.DEVICE_HASH_SALT}:${id}`).digest("hex")
);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const result = await client.query(
  "delete from public.report_votes where device_hash = any($1)",
  [hashes]
);
console.log("votes deleted:", result.rowCount);
await client.end();
