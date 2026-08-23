import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const r = await client.query(
  `select pg_get_functiondef('public.search_availability(text,double precision,double precision,integer,integer,boolean)'::regprocedure) as def`,
);
console.log(r.rows[0].def);
await client.end();
