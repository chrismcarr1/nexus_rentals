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

// Safe, secret-free description of where DATABASE_URL points: hostname only,
// never the connection string (which embeds credentials).
export function describeDatabaseTarget(): { label: string; remote: boolean } {
  try {
    const url = new URL(getDatabaseUrl());
    const host = url.hostname.toLowerCase();
    const remote = !(host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local"));
    return { label: host, remote };
  } catch {
    return { label: "missing-or-invalid", remote: false };
  }
}

let warnedRemoteDevDatabase = false;

// Stops local development from silently writing into the production database.
// Set NEXUS_PRODUCTION_DB_HOST to the production Neon hostname to make the
// check a hard block; without it, a remote host in dev gets a loud warning
// (this project intentionally supports hosted Postgres during development).
function assertDatabaseAllowedForEnvironment() {
  if (!isLocalDevelopment()) return;
  const target = describeDatabaseTarget();
  const productionHost = process.env.NEXUS_PRODUCTION_DB_HOST?.trim().toLowerCase();
  if (productionHost && target.label === productionHost) {
    throw new Error(
      `Refusing to connect: DATABASE_URL points at the production database host (${target.label}) while ` +
        "NODE_ENV is not production. Point DATABASE_URL at a development branch/database, or unset " +
        "NEXUS_PRODUCTION_DB_HOST if this is intentional."
    );
  }
  if (target.remote && !warnedRemoteDevDatabase) {
    warnedRemoteDevDatabase = true;
    console.warn(
      `[database] WARNING: development is connected to the remote database host "${target.label}". ` +
        "If that is the production database, local actions will modify real data. Set " +
        "NEXUS_PRODUCTION_DB_HOST to the production hostname to hard-block this."
    );
  }
}

export function getSql() {
  if (!sqlClient) {
    assertDatabaseAllowedForEnvironment();
    sqlClient = postgres(getDatabaseUrl(), {
      max: 1,
      idle_timeout: 20,
      // Fail fast locally so an unreachable hosted database does not hang every page render.
      connect_timeout: isLocalDevelopment() ? 5 : 10,
      prepare: false,
      ssl: "require"
    });
  }
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
