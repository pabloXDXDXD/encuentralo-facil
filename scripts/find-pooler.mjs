// One-off helper: find the Supabase pooler region that accepts this project.
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const ref = process.argv[2];
const password = process.env.POOLER_PASSWORD;
if (!ref || !password) {
  console.error("Usage: node scripts/find-pooler.mjs <project-ref>  POOLER_PASSWORD=x node ...");
  process.exit(1);
}

const regions = [
  "us-east-1", "eu-central-1", "us-west-1", "sa-east-1", "eu-west-2",
  "eu-west-1", "ap-southeast-1", "ap-south-1", "ap-northeast-1",
  "ap-southeast-2", "ca-central-1", "eu-central-2", "af-south-1", "me-central-1",
];

for (const region of regions) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const client = new Client({
    host,
    port: 5432,
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    const r = await client.query("select current_user as u");
    console.log(`FOUND region=${region} user=${r.rows[0].u}`);
    await client.end();
    process.exit(0);
  } catch (err) {
    const msg = String(err.message || err);
    console.log(`miss ${region}: ${msg.slice(0, 90)}`);
    try { await client.end(); } catch {}
  }
}
console.log("no region matched");
process.exit(1);
