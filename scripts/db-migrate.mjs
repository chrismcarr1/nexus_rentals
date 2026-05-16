import "dotenv/config";

import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL or POSTGRES_URL. Set a hosted Postgres connection string before running migrations.");
  process.exit(1);
}

const sql = neon(databaseUrl);

await sql`
  create table if not exists app_store (
    id text primary key,
    data jsonb not null,
    updated_at timestamptz not null default now()
  )
`;

console.log("Hosted Postgres datastore is ready.");
