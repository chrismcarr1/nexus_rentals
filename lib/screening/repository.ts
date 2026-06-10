import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { getSql } from "@/lib/database";
import { createScreeningAccessToken, hashScreeningAccessToken } from "@/lib/screening/crypto";
import type {
  NormalizedCheckrResult,
  NormalizedPlaidResult,
  ScreeningApplicationRecord,
  ScreeningProvider,
  ScreeningRequestRecord,
  ScreeningRequestStatus
} from "@/lib/screening/types";

let schemaReady: Promise<void> | null = null;

function json(value: unknown) {
  return value ?? {};
}

function mapApplication(row: any): ScreeningApplicationRecord {
  return {
    id: row.id,
    sourceApplicationId: row.source_application_id,
    submissionId: row.submission_id,
    applicantUserId: row.applicant_user_id,
    applicantEmail: row.applicant_email,
    applicantFirstName: row.applicant_first_name,
    applicantLastName: row.applicant_last_name,
    propertyId: row.property_id,
    unitId: row.unit_id,
    landlordUserId: row.landlord_user_id,
    organizationId: row.organization_id,
    monthlyRent: Number(row.monthly_rent ?? 0),
    statedMonthlyIncome: row.stated_monthly_income == null ? null : Number(row.stated_monthly_income),
    status: row.status,
    consentStatus: row.consent_status,
    accessExpiresAt: row.access_expires_at?.toISOString?.() ?? row.access_expires_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}

function mapRequest(row: any): ScreeningRequestRecord {
  return {
    id: row.id,
    applicationId: row.application_id,
    applicantUserId: row.applicant_user_id,
    propertyId: row.property_id,
    unitId: row.unit_id,
    landlordUserId: row.landlord_user_id,
    provider: row.provider,
    screeningKind: row.screening_kind,
    status: row.status,
    providerRequestId: row.provider_request_id,
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    completedAt: row.completed_at?.toISOString?.() ?? row.completed_at
  };
}

export async function ensureScreeningTables() {
  schemaReady ??= (async () => {
    const sql = getSql();
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
        invitation_url text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique(request_id)
      )
    `;
    await sql`alter table checkr_candidates add column if not exists invitation_url text`;
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
  })();
  return schemaReady;
}

export async function upsertScreeningApplication(input: {
  id: string;
  sourceApplicationId: string;
  submissionId: string;
  applicantUserId?: string | null;
  applicantEmail: string;
  applicantFirstName: string;
  applicantLastName: string;
  propertyId: string;
  unitId?: string | null;
  landlordUserId: string;
  organizationId: string;
  monthlyRent: number;
  statedMonthlyIncome?: number | null;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureScreeningTables();
  const sql = getSql();
  const rows = await sql`
    insert into rental_applications (
      id, source_application_id, submission_id, applicant_user_id, applicant_email,
      applicant_first_name, applicant_last_name, property_id, unit_id, landlord_user_id,
      organization_id, monthly_rent, stated_monthly_income, status, metadata
    ) values (
      ${input.id}, ${input.sourceApplicationId}, ${input.submissionId}, ${input.applicantUserId ?? null},
      ${input.applicantEmail}, ${input.applicantFirstName}, ${input.applicantLastName},
      ${input.propertyId}, ${input.unitId ?? null}, ${input.landlordUserId}, ${input.organizationId},
      ${input.monthlyRent}, ${input.statedMonthlyIncome ?? null}, ${input.status},
      ${sql.json((input.metadata ?? {}) as any)}
    )
    on conflict (submission_id) do update set
      applicant_user_id = excluded.applicant_user_id,
      applicant_email = excluded.applicant_email,
      applicant_first_name = excluded.applicant_first_name,
      applicant_last_name = excluded.applicant_last_name,
      property_id = excluded.property_id,
      unit_id = excluded.unit_id,
      landlord_user_id = excluded.landlord_user_id,
      organization_id = excluded.organization_id,
      monthly_rent = excluded.monthly_rent,
      stated_monthly_income = excluded.stated_monthly_income,
      status = excluded.status,
      metadata = rental_applications.metadata || excluded.metadata,
      updated_at = now()
    returning *
  `;
  return mapApplication(rows[0]);
}

export async function getScreeningApplication(id: string) {
  await ensureScreeningTables();
  const rows = await getSql()`
    select * from rental_applications
    where id = ${id} or submission_id = ${id}
    order by updated_at desc
    limit 1
  `;
  return rows[0] ? mapApplication(rows[0]) : null;
}

export async function rotateApplicantAccess(applicationId: string) {
  await ensureScreeningTables();
  const { token, hash } = createScreeningAccessToken();
  const rows = await getSql()`
    update rental_applications
    set screening_access_token_hash = ${hash},
        access_expires_at = now() + interval '30 days',
        updated_at = now()
    where id = ${applicationId}
    returning *
  `;
  if (!rows[0]) throw new Error("Screening application not found.");
  return { application: mapApplication(rows[0]), token };
}

export async function findApplicationByAccessToken(token: string) {
  await ensureScreeningTables();
  const hash = hashScreeningAccessToken(token);
  const rows = await getSql()`
    select * from rental_applications
    where screening_access_token_hash = ${hash}
      and access_expires_at > now()
    limit 1
  `;
  return rows[0] ? mapApplication(rows[0]) : null;
}

export async function markApplicantConsent(applicationId: string) {
  await ensureScreeningTables();
  await getSql()`
    update rental_applications
    set consent_status = 'ACCEPTED', updated_at = now()
    where id = ${applicationId}
  `;
}

export async function createScreeningRequest(input: {
  application: ScreeningApplicationRecord;
  provider: ScreeningProvider;
  screeningKind: string;
  status?: ScreeningRequestStatus;
  metadata?: Record<string, unknown>;
}) {
  await ensureScreeningTables();
  const sql = getSql();
  const rows = await sql`
    insert into tenant_screening_requests (
      id, application_id, applicant_user_id, property_id, unit_id, landlord_user_id,
      provider, screening_kind, status, metadata
    ) values (
      ${randomUUID()}, ${input.application.id}, ${input.application.applicantUserId ?? null},
      ${input.application.propertyId}, ${input.application.unitId ?? null},
      ${input.application.landlordUserId}, ${input.provider}, ${input.screeningKind},
      ${input.status ?? "PENDING"}, ${sql.json((input.metadata ?? {}) as any)}
    )
    returning *
  `;
  return mapRequest(rows[0]);
}

export async function getLatestRequest(applicationId: string, provider: ScreeningProvider) {
  await ensureScreeningTables();
  const rows = await getSql()`
    select * from tenant_screening_requests
    where application_id = ${applicationId} and provider = ${provider}
    order by created_at desc
    limit 1
  `;
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function listScreeningRequests(applicationId: string) {
  await ensureScreeningTables();
  const rows = await getSql()`
    select * from tenant_screening_requests
    where application_id = ${applicationId}
    order by created_at desc
  `;
  return rows.map(mapRequest);
}

export async function updateScreeningRequest(
  requestId: string,
  input: {
    status: ScreeningRequestStatus;
    providerRequestId?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await ensureScreeningTables();
  const sql = getSql();
  const rows = await sql`
    update tenant_screening_requests
    set status = ${input.status},
        provider_request_id = coalesce(${input.providerRequestId ?? null}, provider_request_id),
        error_message = ${input.errorMessage ?? null},
        metadata = metadata || ${sql.json((input.metadata ?? {}) as any)},
        completed_at = case when ${input.status} in ('COMPLETED', 'FAILED') then now() else completed_at end,
        updated_at = now()
    where id = ${requestId}
    returning *
  `;
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function saveScreeningResult(input: {
  applicationId: string;
  requestId: string;
  provider: ScreeningProvider;
  status: ScreeningRequestStatus;
  providerResultId?: string | null;
  rawResponse: Record<string, unknown>;
  normalizedResult: NormalizedCheckrResult | NormalizedPlaidResult;
  riskScore?: number | null;
  recommendation?: string | null;
  riskFlags?: unknown[];
}) {
  await ensureScreeningTables();
  const sql = getSql();
  const rows = await sql`
    insert into tenant_screening_results (
      id, application_id, request_id, provider, status, provider_result_id,
      raw_response, normalized_result, risk_score, recommendation, risk_flags, completed_at
    ) values (
      ${randomUUID()}, ${input.applicationId}, ${input.requestId}, ${input.provider}, ${input.status},
      ${input.providerResultId ?? null}, ${sql.json(input.rawResponse as any)}, ${sql.json(input.normalizedResult as any)},
      ${input.riskScore ?? null}, ${input.recommendation ?? null}, ${sql.json((input.riskFlags ?? []) as any)},
      ${input.status === "COMPLETED" ? new Date() : null}
    )
    on conflict (request_id) do update set
      status = excluded.status,
      provider_result_id = coalesce(excluded.provider_result_id, tenant_screening_results.provider_result_id),
      raw_response = excluded.raw_response,
      normalized_result = excluded.normalized_result,
      risk_score = excluded.risk_score,
      recommendation = excluded.recommendation,
      risk_flags = excluded.risk_flags,
      completed_at = excluded.completed_at,
      updated_at = now()
    returning *
  `;
  return rows[0];
}

export async function getNormalizedResults(applicationId: string) {
  await ensureScreeningTables();
  const rows = await getSql()`
    select distinct on (provider) provider, normalized_result, raw_response, request_id, status
    from tenant_screening_results
    where application_id = ${applicationId}
    order by provider, updated_at desc
  `;
  const result: {
    checkr: NormalizedCheckrResult | null;
    plaid: NormalizedPlaidResult | null;
    raw: any[];
  } = { checkr: null, plaid: null, raw: [] };
  rows.forEach((row) => {
    if (row.provider === "CHECKR") result.checkr = row.normalized_result;
    if (row.provider === "PLAID") result.plaid = row.normalized_result;
    result.raw.push(row);
  });
  return result;
}

export async function saveCheckrCandidate(input: {
  applicationId: string;
  requestId: string;
  candidateId: string;
  invitationId?: string | null;
  invitationStatus?: string | null;
  invitationUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await ensureScreeningTables();
  const sql = getSql();
  await sql`
    insert into checkr_candidates (
      id, application_id, request_id, provider_candidate_id, invitation_id, invitation_status, invitation_url, metadata
    ) values (
      ${randomUUID()}, ${input.applicationId}, ${input.requestId}, ${input.candidateId},
      ${input.invitationId ?? null}, ${input.invitationStatus ?? null}, ${input.invitationUrl ?? null},
      ${sql.json((input.metadata ?? {}) as any)}
    )
    on conflict (request_id) do update set
      provider_candidate_id = excluded.provider_candidate_id,
      invitation_id = excluded.invitation_id,
      invitation_status = excluded.invitation_status,
      invitation_url = coalesce(excluded.invitation_url, checkr_candidates.invitation_url),
      metadata = checkr_candidates.metadata || excluded.metadata,
      updated_at = now()
  `;
}

export async function getCheckrCandidate(applicationId: string) {
  await ensureScreeningTables();
  const rows = await getSql()`
    select * from checkr_candidates
    where application_id = ${applicationId}
    order by created_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

export async function saveCheckrReport(input: {
  applicationId: string;
  requestId: string;
  candidateId?: string | null;
  reportId: string;
  status: string;
  result?: string | null;
  adjudication?: string | null;
  assessment?: string | null;
  completedAt?: string | null;
  rawResponse: Record<string, unknown>;
  normalizedResult: NormalizedCheckrResult;
}) {
  await ensureScreeningTables();
  const sql = getSql();
  await sql`
    insert into checkr_reports (
      id, application_id, request_id, candidate_id, provider_report_id, status, result,
      adjudication, assessment, completed_at, raw_response, normalized_result
    ) values (
      ${randomUUID()}, ${input.applicationId}, ${input.requestId}, ${input.candidateId ?? null},
      ${input.reportId}, ${input.status}, ${input.result ?? null}, ${input.adjudication ?? null},
      ${input.assessment ?? null}, ${input.completedAt ? new Date(input.completedAt) : null},
      ${sql.json(input.rawResponse as any)}, ${sql.json(input.normalizedResult as any)}
    )
    on conflict (provider_report_id) do update set
      status = excluded.status,
      result = excluded.result,
      adjudication = excluded.adjudication,
      assessment = excluded.assessment,
      completed_at = excluded.completed_at,
      raw_response = excluded.raw_response,
      normalized_result = excluded.normalized_result,
      updated_at = now()
  `;
}

export async function savePlaidVerification(input: {
  applicationId: string;
  requestId: string;
  providerUserId?: string | null;
  providerUserTokenEncrypted?: string | null;
  itemId?: string | null;
  accessTokenEncrypted?: string | null;
  status: string;
  consented?: boolean;
  identityStatus?: string | null;
  incomeStatus?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await ensureScreeningTables();
  const sql = getSql();
  await sql`
    insert into plaid_verifications (
      id, application_id, request_id, provider_user_id, provider_user_token_encrypted,
      item_id, access_token_encrypted, status, consented_at, identity_status, income_status, metadata
    ) values (
      ${randomUUID()}, ${input.applicationId}, ${input.requestId}, ${input.providerUserId ?? null},
      ${input.providerUserTokenEncrypted ?? null}, ${input.itemId ?? null},
      ${input.accessTokenEncrypted ?? null}, ${input.status},
      ${input.consented ? new Date() : null}, ${input.identityStatus ?? null},
      ${input.incomeStatus ?? null}, ${sql.json((input.metadata ?? {}) as any)}
    )
    on conflict (request_id) do update set
      provider_user_id = coalesce(excluded.provider_user_id, plaid_verifications.provider_user_id),
      provider_user_token_encrypted = coalesce(excluded.provider_user_token_encrypted, plaid_verifications.provider_user_token_encrypted),
      item_id = coalesce(excluded.item_id, plaid_verifications.item_id),
      access_token_encrypted = coalesce(excluded.access_token_encrypted, plaid_verifications.access_token_encrypted),
      status = excluded.status,
      consented_at = coalesce(excluded.consented_at, plaid_verifications.consented_at),
      identity_status = coalesce(excluded.identity_status, plaid_verifications.identity_status),
      income_status = coalesce(excluded.income_status, plaid_verifications.income_status),
      metadata = plaid_verifications.metadata || excluded.metadata,
      updated_at = now()
  `;
}

export async function getPlaidVerification(requestId: string) {
  await ensureScreeningTables();
  const rows = await getSql()`select * from plaid_verifications where request_id = ${requestId} limit 1`;
  return rows[0] ?? null;
}

export async function findCheckrRequestByProviderId(providerId: string) {
  await ensureScreeningTables();
  const rows = await getSql()`
    select r.*
    from tenant_screening_requests r
    left join checkr_candidates c on c.request_id = r.id
    left join checkr_reports cr on cr.request_id = r.id
    where r.provider_request_id = ${providerId}
       or c.provider_candidate_id = ${providerId}
       or c.invitation_id = ${providerId}
       or cr.provider_report_id = ${providerId}
    order by r.created_at desc
    limit 1
  `;
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function findPlaidRequest(input: { providerUserId?: string; itemId?: string }) {
  await ensureScreeningTables();
  const rows = await getSql()`
    select r.*
    from tenant_screening_requests r
    join plaid_verifications p on p.request_id = r.id
    where (${input.providerUserId ?? null} is not null and p.provider_user_id = ${input.providerUserId ?? null})
       or (${input.itemId ?? null} is not null and p.item_id = ${input.itemId ?? null})
    order by r.created_at desc
    limit 1
  `;
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function recordWebhookEvent(input: {
  provider: ScreeningProvider;
  providerEventId: string;
  eventType: string;
  rawBody: string;
  payload: Record<string, unknown>;
}) {
  await ensureScreeningTables();
  const sql = getSql();
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  const rows = await sql`
    insert into screening_webhook_events (
      id, provider, provider_event_id, event_type, payload_hash, payload
    ) values (
      ${randomUUID()}, ${input.provider}, ${input.providerEventId}, ${input.eventType},
      ${payloadHash}, ${sql.json(input.payload as any)}
    )
    on conflict (provider, provider_event_id) do nothing
    returning id
  `;
  return { isNew: Boolean(rows[0]), payloadHash };
}

export async function completeWebhookEvent(provider: ScreeningProvider, providerEventId: string, errorMessage?: string) {
  await ensureScreeningTables();
  await getSql()`
    update screening_webhook_events
    set status = ${errorMessage ? "FAILED" : "PROCESSED"},
        error_message = ${errorMessage ?? null},
        processed_at = now()
    where provider = ${provider} and provider_event_id = ${providerEventId}
  `;
}

export function redactProviderPayload(payload: Record<string, unknown>) {
  const hidden = new Set([
    "access_token",
    "user_token",
    "ssn",
    "social_security_number",
    "account_number",
    "routing_number"
  ]);
  return Object.fromEntries(
    Object.entries(json(payload) as Record<string, unknown>).map(([key, value]) => [
      key,
      hidden.has(key.toLowerCase()) ? "[REDACTED]" : value
    ])
  );
}
