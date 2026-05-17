import postgres, { type Sql } from "postgres";

let sqlClient: Sql | null = null;

const DATABASE_URL_HELP =
  "DATABASE_URL is missing, invalid, or still a placeholder. Set it to a real hosted Postgres connection string like postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require in .env.local for local development and in Vercel environment variables for production.";

function isPlaceholderValue(value: string) {
  return ["user", "password", "host", "database", "db"].includes(value.toLowerCase());
}

export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(DATABASE_URL_HELP);
  }
  const normalized = databaseUrl.startsWith("postgres://") ? `postgresql://${databaseUrl.slice("postgres://".length)}` : databaseUrl;
  if (!normalized.startsWith("postgresql://")) {
    throw new Error(`${DATABASE_URL_HELP} SQLite/file URLs are not supported.`);
  }
  try {
    const parsed = new URL(normalized);
    const databaseName = parsed.pathname.replace(/^\//, "");
    if (isPlaceholderValue(parsed.username) || isPlaceholderValue(parsed.password) || isPlaceholderValue(parsed.hostname) || isPlaceholderValue(databaseName)) {
      throw new Error("placeholder");
    }
  } catch {
    throw new Error(DATABASE_URL_HELP);
  }
  return normalized;
}

export function getSql() {
  sqlClient ??= postgres(getDatabaseUrl(), {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: "require"
  });
  return sqlClient;
}

export async function ensureAppStoreTable() {
  await getSql()`
    create table if not exists app_store (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
}
