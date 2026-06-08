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

await sql`
  create table if not exists rental_applications (
    id text primary key,
    source_application_id text not null,
    submission_id text not null unique,
    applicant_user_id text,
    applicant_email text not null,
    applicant_first_name text not null,
    applicant_last_name text not null,
    property_id text not null,
    unit_id text,
    landlord_user_id text not null,
    organization_id text not null,
    monthly_rent numeric(12, 2) not null default 0,
    stated_monthly_income numeric(12, 2),
    status text not null default 'SUBMITTED',
    consent_status text not null default 'PENDING',
    screening_access_token_hash text,
    access_expires_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`;

await sql`
  create table if not exists tenant_screening_requests (
    id text primary key,
    application_id text not null references rental_applications(id) on delete cascade,
    applicant_user_id text,
    property_id text not null,
    unit_id text,
    landlord_user_id text not null,
    provider text not null check (provider in ('CHECKR', 'PLAID')),
    screening_kind text not null,
    status text not null,
    provider_request_id text,
    error_message text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz
  )
`;

await sql`
  create table if not exists tenant_screening_results (
    id text primary key,
    application_id text not null references rental_applications(id) on delete cascade,
    request_id text not null references tenant_screening_requests(id) on delete cascade,
    provider text not null,
    status text not null,
    provider_result_id text,
    raw_response jsonb not null default '{}'::jsonb,
    normalized_result jsonb not null default '{}'::jsonb,
    risk_score integer,
    recommendation text,
    risk_flags jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    unique(request_id)
  )
`;

await sql`
  create table if not exists plaid_verifications (
    id text primary key,
    application_id text not null references rental_applications(id) on delete cascade,
    request_id text not null references tenant_screening_requests(id) on delete cascade,
    provider_user_id text,
    provider_user_token_encrypted text,
    item_id text,
    access_token_encrypted text,
    status text not null,
    consented_at timestamptz,
    identity_status text,
    income_status text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(request_id)
  )
`;

await sql`
  create table if not exists checkr_candidates (
    id text primary key,
    application_id text not null references rental_applications(id) on delete cascade,
    request_id text not null references tenant_screening_requests(id) on delete cascade,
    provider_candidate_id text not null,
    invitation_id text,
    invitation_status text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(request_id)
  )
`;

await sql`
  create table if not exists checkr_reports (
    id text primary key,
    application_id text not null references rental_applications(id) on delete cascade,
    request_id text not null references tenant_screening_requests(id) on delete cascade,
    candidate_id text,
    provider_report_id text not null,
    status text not null,
    result text,
    adjudication text,
    assessment text,
    completed_at timestamptz,
    raw_response jsonb not null default '{}'::jsonb,
    normalized_result jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(provider_report_id)
  )
`;

await sql`
  create table if not exists screening_webhook_events (
    id text primary key,
    provider text not null,
    provider_event_id text not null,
    event_type text not null,
    payload_hash text not null,
    payload jsonb not null,
    status text not null default 'RECEIVED',
    error_message text,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    unique(provider, provider_event_id)
  )
`;

await sql`create index if not exists tenant_screening_requests_application_idx on tenant_screening_requests(application_id, created_at desc)`;
await sql`create index if not exists tenant_screening_requests_provider_idx on tenant_screening_requests(provider, provider_request_id)`;
await sql`create index if not exists checkr_reports_request_idx on checkr_reports(request_id)`;
await sql`create index if not exists plaid_verifications_provider_user_idx on plaid_verifications(provider_user_id)`;
await sql`create index if not exists plaid_verifications_item_idx on plaid_verifications(item_id)`;

console.log("Hosted Postgres datastore and screening tables are ready.");
await sql.end();
