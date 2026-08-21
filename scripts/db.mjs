#!/usr/bin/env node
// Migration/seed runner for DóndeHay.
// Uses pg's simple-query protocol so multi-statement SQL files
// (including $$ function bodies) execute verbatim.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import dotenv from "dotenv";

for (const candidate of [".env.local", ".env"]) {
  if (fs.existsSync(path.resolve(candidate))) {
    dotenv.config({ path: candidate });
    break;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing. Copy .env.example to .env.local and fill it.");
  process.exit(1);
}

async function withClient(fn) {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function migrate() {
  const dir = path.resolve("supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  return withClient(async (c) => {
    await c.query(`create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    for (const file of files) {
      const { rows } = await c.query(
        "select 1 from public.schema_migrations where name = $1",
        [file]
      );
      if (rows.length > 0) {
        console.log(`skip  ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      try {
        await c.query("begin");
        await c.query(sql);
        await c.query(
          "insert into public.schema_migrations(name) values ($1)",
          [file]
        );
        await c.query("commit");
        console.log(`apply ${file}`);
      } catch (err) {
        await c.query("rollback");
        console.error(`FAILED ${file}:`, err.message);
        throw err;
      }
    }
    console.log("migrate: done");
  });
}

async function seed() {
  const file = path.resolve("supabase/seed.sql");
  const sql = fs.readFileSync(file, "utf8");
  return withClient(async (c) => {
    await c.query(sql);
    console.log("seed: done (idempotent)");
  });
}

async function ping() {
  return withClient(async (c) => {
    const v = await c.query("select version() as v");
    const counts = await c.query(`
      select
        (select count(*) from public.products) as products,
        (select count(*) from public.stores)   as stores,
        (select count(*) from public.reports)  as reports
    `);
    console.log(v.rows[0].v.split(",")[0]);
    console.log(counts.rows[0]);
  });
}

const command = process.argv[2];
try {
  if (command === "migrate") await migrate();
  else if (command === "seed") await seed();
  else if (command === "ping") await ping();
  else {
    console.error("Usage: node scripts/db.mjs <migrate|seed|ping>");
    process.exit(1);
  }
} catch (err) {
  console.error("Command failed:", command);
  process.exit(1);
}
