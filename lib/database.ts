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

export function isLocalDevelopment() {
  return process.env.NODE_ENV !== "production";
}

export function getSql() {
  sqlClient ??= postgres(getDatabaseUrl(), {
    max: 1,
    idle_timeout: 20,
    // Fail fast locally so an unreachable hosted database does not hang every page render.
    connect_timeout: isLocalDevelopment() ? 5 : 10,
    prepare: false,
    ssl: "require"
  });
  return sqlClient;
}

let appStoreTableReady: Promise<void> | null = null;

// Memoized: this used to issue a CREATE TABLE IF NOT EXISTS round-trip before
// every datastore read and write. The table only needs to be verified once per
// process; on failure the promise resets so the next call retries.
export function ensureAppStoreTable() {
  appStoreTableReady ??= (async () => {
    try {
      await getSql()`
        create table if not exists app_store (
          id text primary key,
          data jsonb not null,
          updated_at timestamptz not null default now()
        )
      `;
    } catch (error) {
      appStoreTableReady = null;
      throw error;
    }
  })();
  return appStoreTableReady;
}
