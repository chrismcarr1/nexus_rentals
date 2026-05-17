import { config } from "dotenv";

import postgres from "postgres";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL?.startsWith("postgres://")
  ? `postgresql://${process.env.DATABASE_URL.slice("postgres://".length)}`
  : process.env.DATABASE_URL;
const databaseUrlHelp =
  "DATABASE_URL is missing, invalid, or still a placeholder. Set it to a real hosted Postgres connection string like postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require in .env.local for local development and in Vercel environment variables for production.";

if (!databaseUrl) {
  console.error(databaseUrlHelp);
  process.exit(1);
}
if (!databaseUrl.startsWith("postgresql://")) {
  console.error(`${databaseUrlHelp} SQLite/file URLs are not supported.`);
  process.exit(1);
}
try {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const placeholders = ["user", "password", "host", "database", "db"];
  if ([parsed.username, parsed.password, parsed.hostname, databaseName].some((value) => placeholders.includes(value.toLowerCase()))) {
    console.error(databaseUrlHelp);
    process.exit(1);
  }
} catch {
  console.error(databaseUrlHelp);
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
  ssl: "require"
});

await sql`
  create table if not exists app_store (
    id text primary key,
    data jsonb not null,
    updated_at timestamptz not null default now()
  )
`;

console.log("Hosted Postgres datastore is ready.");
await sql.end();
