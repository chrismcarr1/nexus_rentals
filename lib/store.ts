import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { cache } from "react";

import { DEFAULT_COUNTRY, type StoredAddress } from "@/lib/address";
import { normalizeRentDueTime } from "@/lib/app-time";
import { ensureAppStoreTable, getAppStoreBackend, getSql, isLocalDevelopment } from "@/lib/database";
import { getLeaseBilling } from "@/lib/payment-charge";
import { recordNeonFetch, recordReadStore } from "@/lib/perf";
import type {
  NormalizedCheckrResult,
  NormalizedPlaidResult,
  ScreeningApplicationRecord,
  ScreeningProvider,
  ScreeningRequestRecord,
  ScreeningRequestStatus
} from "@/lib/screening/types";

export type UserRole = "ADMIN" | "MANAGER" | "TENANT";
export type PropertyStatus = "ACTIVE" | "ARCHIVED";
export type UnitOccupancyStatus = "OCCUPIED" | "VACANT" | "NOTICE" | "TURNOVER";
export type LeaseStatus = "ACTIVE" | "UPCOMING" | "EXPIRED" | "TERMINATED" | "draft" | "invited" | "active" | "ended" | "cancelled";
export type TenantInviteStatus = "pending" | "accepted" | "expired" | "revoked";
export type PaymentStatus = "PENDING" | "PAID" | "PARTIAL" | "LATE";
export type ExpenseCategory = "MAINTENANCE" | "REPAIR" | "UTILITIES" | "INSURANCE" | "TAX" | "CLEANING" | "MARKETING" | "OTHER";
export type MaintenanceStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type AssessmentSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type NotificationType = "RENT_DUE" | "RENT_OVERDUE" | "LEASE_EXPIRING" | "INSPECTION_PENDING" | "MAINTENANCE_OPEN" | "DAMAGE_ASSESSMENT" | "SYSTEM";
export type FileKind =
  | "PROPERTY_IMAGE"
  | "UNIT_IMAGE"
  | "MOVE_IN_IMAGE"
  | "MOVE_OUT_IMAGE"
  | "DAMAGE_IMAGE"
  | "MAINTENANCE_IMAGE"
  | "TENANT_ID"
  | "LEASE_DOCUMENT"
  | "LEASE_ATTACHMENT"
  | "PAYMENT_DOCUMENT"
  | "GENERAL_DOCUMENT"
  | "AVATAR";
export type FileVisibility = "ORGANIZATION" | "TENANT" | "MANAGER_ONLY";
export type RentalApplicationStatus = "DRAFT" | "PUBLISHED" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "CONVERTED_TO_LEASE";
export type ApplicationApplicantType = "PRIMARY" | "CO_APPLICANT";
export type ApplicationFeeStatus = "NOT_REQUIRED" | "UNPAID" | "PAID" | "WAIVED";
export type ApplicationDocumentStatus = "REQUESTED" | "RECEIVED" | "WAIVED";
export type PlatformEventType =
  | "EMAIL_SENT"
  | "EMAIL_FAILED"
  | "EMAIL_BLOCKED"
  | "PASSWORD_RESET_REQUESTED"
  | "STRIPE_WEBHOOK_RECEIVED"
  | "STRIPE_WEBHOOK_FAILED"
  | "STRIPE_SETUP_STARTED"
  | "STRIPE_SETUP_COMPLETED"
  | "STRIPE_ACCOUNT_MISMATCH_DETECTED"
  | "STRIPE_ACCOUNT_RESYNCED"
  | "STRIPE_ACCOUNT_REPAIRED"
  | "STRIPE_ACCOUNT_RECONNECT_STARTED"
  | "STRIPE_CHECKOUT_BLOCKED"
  | "STRIPE_ADMIN_OVERRIDE_USED";

export const UserRole = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  TENANT: "TENANT"
} as const;

export const FileKind = {
  PROPERTY_IMAGE: "PROPERTY_IMAGE",
  UNIT_IMAGE: "UNIT_IMAGE",
  MOVE_IN_IMAGE: "MOVE_IN_IMAGE",
  MOVE_OUT_IMAGE: "MOVE_OUT_IMAGE",
  DAMAGE_IMAGE: "DAMAGE_IMAGE",
  MAINTENANCE_IMAGE: "MAINTENANCE_IMAGE",
  TENANT_ID: "TENANT_ID",
  LEASE_DOCUMENT: "LEASE_DOCUMENT",
  LEASE_ATTACHMENT: "LEASE_ATTACHMENT",
  PAYMENT_DOCUMENT: "PAYMENT_DOCUMENT",
  GENERAL_DOCUMENT: "GENERAL_DOCUMENT",
  AVATAR: "AVATAR"
} as const;

export type Organization = { id: string; name: string; email: string; phone?: string; mailingAddress?: string; logoPath?: string; createdAt: string; updatedAt: string };
export type User = {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  avatarPath?: string;
  title?: string;
  phone?: string;
  stripeAccountId?: string;
  stripeConnectedAccountId?: string;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeDetailsSubmitted?: boolean;
  stripeOnboardingComplete?: boolean;
  stripeDisabledReason?: string;
  stripeCurrentlyDue?: string[];
  stripeEventuallyDue?: string[];
  stripePastDue?: string[];
  stripeUpdatedAt?: string;
  // Connected-account ownership diagnostics. Metadata user/org IDs are copied
  // from the Stripe account's metadata at last sync so the UI can surface
  // ownership mismatches without a live Stripe call. mismatchReason is set
  // whenever the stored account's metadata does not match this user/org;
  // payments must fail closed while it is set.
  stripeDashboardType?: string;
  stripeMetadataUserId?: string;
  stripeMetadataOrganizationId?: string;
  stripeMetadataVerifiedAt?: string;
  stripeMetadataMismatchReason?: string;
  lastLoginAt?: string;
  // Legal acceptance and age verification metadata. Stored on each individual
  // user record (never on the organization). birthDate is sensitive: it must
  // only ever be shown to the user themselves and must never be logged or sent
  // to analytics. Versions are compared against lib/legal.ts constants;
  // bumping a constant forces re-acceptance for everyone.
  birthDate?: string;
  ageVerifiedAt?: string;
  termsAcceptedAt?: string;
  termsVersionAccepted?: string;
  privacyAcceptedAt?: string;
  privacyVersionAccepted?: string;
  paymentTermsAcceptedAt?: string;
  paymentTermsVersionAccepted?: string;
  legalAcceptanceIp?: string;
  legalAcceptanceUserAgent?: string;
  // Monotonic counter embedded in issued session tokens. Bumping it invalidates
  // every previously-issued JWT for this user (logout, password reset, account
  // disable, role/email change). Absent/undefined is treated as 0.
  sessionVersion?: number;
  createdAt: string;
  updatedAt: string;
};
export type ListingStatus = "draft" | "active" | "unpublished";
export type Property = StoredAddress & { id: string; organizationId: string; name: string; status: PropertyStatus; description?: string; amenities: string; petPolicy?: string; parking?: string; utilities?: string; contactName?: string; contactEmail?: string; contactPhone?: string; notes?: string; managerId?: string; createdAt: string; updatedAt: string };
export type Unit = { id: string; propertyId: string; unitNumber: string; nickname?: string; addressOverride?: string; unitType: string; bedrooms: number; bathrooms: number; squareFeet?: number; monthlyRent: number; depositAmount: number; leaseStatus: LeaseStatus; occupancyStatus: UnitOccupancyStatus; amenities: string; availabilityDate?: string; leaseTerms?: string; unitDescription?: string; notes?: string; createdAt: string; updatedAt: string };
export type Tenant = { id: string; organizationId: string; firstName: string; lastName: string; email?: string; phone?: string; employer?: string; emergencyName?: string; emergencyPhone?: string; notes?: string; createdAt: string; updatedAt: string };
export type Lease = {
  id: string;
  nexusLeaseId?: string;
  managerUserId?: string;
  tenantUserId?: string;
  tenantEmail?: string;
  propertyId?: string;
  unitId?: string;
  tenantIds: string[];
  startDate?: string;
  endDate?: string;
  moveInDate?: string;
  monthlyRent: number;
  dueDay: number;
  rentDueTime?: string;
  lastRentChargeMonth?: string;
  // $1 payment-charge billing. monthlyRent always stays the base rent; the
  // tenant-facing rent is derived via lib/payment-charge.ts. Absent fields
  // (legacy leases) mean tenant responsibility with nothing absorbed.
  managerAbsorbsPaymentCharge?: boolean;
  paymentChargeResponsibility?: "TENANT" | "MANAGER";
  managerAbsorbedPaymentChargeCents?: number;
  tenantFacingRentCents?: number;
  securityDeposit: number;
  recurringCharges: string;
  lateFeePolicy?: string;
  notes?: string;
  status: LeaseStatus;
  documentPath?: string;
  createdAt: string;
  updatedAt: string;
};
export type TenantInvite = {
  id: string;
  leaseId: string;
  managerUserId: string;
  tenantEmail: string;
  tokenHash: string;
  status: TenantInviteStatus;
  expiresAt: string;
  sentAt?: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
};
export type Payment = {
  id: string;
  unitId: string;
  leaseId?: string;
  tenantId?: string;
  description: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: PaymentStatus;
  lateFeeAmount: number;
  balanceDue: number;
  categoryTag?: string;
  generatedRentMonth?: string;
  // Recorded on generated rent charges when the lease's manager absorbs the $1
  // payment charge: amount is the tenant-facing rent, baseRentAmount preserves
  // the lease's base rent for reporting. Absent on legacy rows.
  baseRentAmount?: number;
  tenantFacingRentCents?: number;
  managerAbsorbedPaymentChargeCents?: number;
  paymentChargeResponsibility?: "TENANT" | "MANAGER";
  amountPaid?: number;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeDestinationAccountId?: string;
  stripeApplicationFeeAmountCents?: number;
  stripeAmountPaidCents?: number;
  stripePaidAt?: string;
  createdAt: string;
  updatedAt: string;
};
export type Expense = { id: string; propertyId: string; unitId?: string; title: string; description?: string; amount: number; incurredAt: string; category: ExpenseCategory; tags: string; vendor?: string; createdAt: string; updatedAt: string };
export type MaintenanceRequest = {
  id: string;
  propertyId: string;
  unitId?: string;
  title: string;
  description: string;
  category?: string;
  location?: string;
  issueStartedAt?: string;
  entryPermission?: string;
  accessNotes?: string;
  contactPreference?: string;
  contactName?: string;
  contactPhone?: string;
  preferredWindow?: string;
  safetyConcern?: string;
  petsOnSite?: string;
  imagePaths?: string[];
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  estimatedCost?: number;
  actualCost?: number;
  assignedTo?: string;
  requestedAt: string;
  resolvedAt?: string;
  timeline: string;
  createdAt: string;
  updatedAt: string;
};
export type Inspection = { id: string; unitId: string; leaseId?: string; inspectionDate: string; type: string; notes?: string; createdAt: string; updatedAt: string };
export type DamageAssessment = { id: string; inspectionId: string; createdById: string; summary: string; damageCategories: string; severity: AssessmentSeverity; confidenceScore: number; estimatedLow: number; estimatedHigh: number; wearAndTear: boolean; explanation: string; recommendedNext: string; createdAt: string; updatedAt: string };
export type UploadedFile = {
  id: string;
  organizationId?: string;
  propertyId?: string;
  unitId?: string;
  leaseId?: string;
  tenantId?: string;
  maintenanceId?: string;
  inspectionId?: string;
  assessmentId?: string;
  kind: FileKind;
  label?: string;
  displayName?: string;
  originalFileName?: string;
  path: string;
  mimeType: string;
  visibility?: FileVisibility;
  uploadedById?: string;
  uploadedAt?: string;
  createdAt: string;
};
export type DiscussionThread = { id: string; organizationId: string; managerUserId: string; tenantId: string; tenantUserId?: string; leaseId: string; propertyId?: string; unitId?: string; subject: string; createdAt: string; updatedAt: string };
export type DiscussionMessage = { id: string; threadId: string; organizationId: string; senderUserId: string; body: string; createdAt: string };
export type Notification = { id: string; organizationId: string; userId?: string; type: NotificationType; title: string; body: string; href?: string; isRead: boolean; createdAt: string };
export type PasswordResetToken = { id: string; userId: string; token: string; expiresAt: string; usedAt?: string; createdAt: string };
export type RentalApplication = {
  id: string;
  organizationId: string;
  managerUserId: string;
  propertyId: string;
  unitId?: string;
  publicSlug: string;
  title: string;
  monthlyRent: number;
  securityDeposit: number;
  availableMoveInDate: string;
  applicationFee: number;
  requiredFields: string[];
  allowCoApplicants: boolean;
  allowPets: boolean;
  status: RentalApplicationStatus;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};
export type ApplicationQuestion = { id: string; applicationId: string; prompt: string; required: boolean; sortOrder: number; createdAt: string; updatedAt: string };
export type ApplicationSubmission = {
  id: string;
  applicationId: string;
  organizationId: string;
  managerUserId: string;
  propertyId: string;
  unitId?: string;
  status: RentalApplicationStatus;
  feeStatus: ApplicationFeeStatus;
  submittedAt: string;
  currentAddress?: string;
  monthlyIncome?: number;
  employment?: string;
  rentalHistory?: string;
  references?: string;
  pets?: string;
  vehicles?: string;
  documentNotes?: string;
  authorizationAccepted: boolean;
  inviteId?: string;
  backgroundCheckConsent?: boolean;
  backgroundCheckConsentAt?: string;
  incomeVerificationConsent?: boolean;
  incomeVerificationConsentAt?: string;
  answers: Array<{ questionId: string; prompt: string; answer: string }>;
  createdAt: string;
  updatedAt: string;
};
export type ApplicationApplicant = {
  id: string;
  submissionId: string;
  type: ApplicationApplicantType;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  createdAt: string;
  updatedAt: string;
};
export type ApplicationDocument = {
  id: string;
  applicationId: string;
  submissionId?: string;
  label: string;
  required: boolean;
  status: ApplicationDocumentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
export type ApplicationNote = { id: string; applicationId: string; submissionId?: string; managerUserId: string; body: string; createdAt: string };
export type ApplicationInviteStatus = "SENT" | "SUBMITTED" | "EXPIRED" | "REVOKED";
export type ApplicationInvite = {
  id: string;
  organizationId: string;
  managerUserId: string;
  applicationId: string;
  propertyId: string;
  unitId?: string;
  applicantFirstName: string;
  applicantLastName: string;
  applicantEmail: string;
  applicantPhone?: string;
  desiredMoveInDate?: string;
  requestBackgroundCheck: boolean;
  requestIncomeVerification: boolean;
  note?: string;
  tokenHash: string;
  status: ApplicationInviteStatus;
  expiresAt: string;
  sentAt?: string;
  submittedAt?: string;
  submissionId?: string;
  createdAt: string;
  updatedAt: string;
};
export type ApplicationStatusHistoryEntry = {
  id: string;
  applicationId: string;
  submissionId: string;
  fromStatus?: RentalApplicationStatus;
  toStatus: RentalApplicationStatus;
  changedByUserId?: string;
  note?: string;
  createdAt: string;
};
export type PlatformEvent = {
  id: string;
  type: PlatformEventType;
  category: string;
  status: "success" | "failed" | "blocked" | "ignored" | "info";
  organizationId?: string;
  userId?: string;
  relatedId?: string;
  message?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

// Outbound rental listing. Reuses Property/Unit by reference (never duplicates
// them) and stores a flat snapshot of the marketing fields needed to build a
// syndication feed for Zillow/Apartments.com. photoUrls are public image URLs
// (existing uploaded-photo paths or external URLs); never tenant/private data.
export type Listing = {
  id: string;
  organizationId: string;
  managerUserId: string;
  propertyId: string;
  unitId?: string;
  status: ListingStatus;
  rent: number;
  deposit: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  availabilityDate?: string;
  leaseTerms?: string;
  description?: string;
  amenities?: string;
  petPolicy?: string;
  parking?: string;
  utilities?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  photoUrls: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

export type StoredScreeningApplication = ScreeningApplicationRecord & {
  screeningAccessTokenHash?: string | null;
};
export type StoredScreeningResult = {
  id: string;
  applicationId: string;
  requestId: string;
  provider: ScreeningProvider;
  status: ScreeningRequestStatus;
  providerResultId?: string | null;
  rawResponse: Record<string, unknown>;
  normalizedResult: NormalizedCheckrResult | NormalizedPlaidResult;
  riskScore?: number | null;
  recommendation?: string | null;
  riskFlags: unknown[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

export type AppStore = {
  organizations: Organization[];
  users: User[];
  properties: Property[];
  units: Unit[];
  listings: Listing[];
  tenants: Tenant[];
  leases: Lease[];
  tenantInvites: TenantInvite[];
  payments: Payment[];
  expenses: Expense[];
  maintenanceRequests: MaintenanceRequest[];
  inspections: Inspection[];
  damageAssessments: DamageAssessment[];
  uploadedFiles: UploadedFile[];
  discussionThreads: DiscussionThread[];
  discussionMessages: DiscussionMessage[];
  notifications: Notification[];
  passwordResetTokens: PasswordResetToken[];
  rentalApplications: RentalApplication[];
  applicationQuestions: ApplicationQuestion[];
  applicationSubmissions: ApplicationSubmission[];
  applicationApplicants: ApplicationApplicant[];
  applicationDocuments: ApplicationDocument[];
  applicationNotes: ApplicationNote[];
  applicationInvites: ApplicationInvite[];
  applicationStatusHistory: ApplicationStatusHistoryEntry[];
  platformEvents: PlatformEvent[];
  screeningApplications: StoredScreeningApplication[];
  screeningRequests: ScreeningRequestRecord[];
  screeningResults: StoredScreeningResult[];
  checkrCandidates: Array<Record<string, any>>;
  checkrReports: Array<Record<string, any>>;
  plaidVerifications: Array<Record<string, any>>;
  screeningWebhookEvents: Array<Record<string, any>>;
};

const STORE_ID = "default";

function emptyStore(): AppStore {
  return {
    organizations: [],
    users: [],
    properties: [],
    units: [],
    listings: [],
    tenants: [],
    leases: [],
    tenantInvites: [],
    payments: [],
    expenses: [],
    maintenanceRequests: [],
    inspections: [],
    damageAssessments: [],
    uploadedFiles: [],
    discussionThreads: [],
    discussionMessages: [],
    notifications: [],
    passwordResetTokens: [],
    rentalApplications: [],
    applicationQuestions: [],
    applicationSubmissions: [],
    applicationApplicants: [],
    applicationDocuments: [],
    applicationNotes: [],
    applicationInvites: [],
    applicationStatusHistory: [],
    platformEvents: [],
    screeningApplications: [],
    screeningRequests: [],
    screeningResults: [],
    checkrCandidates: [],
    checkrReports: [],
    plaidVerifications: [],
    screeningWebhookEvents: []
  };
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

// Local-development fallback. When hosted Postgres is missing, misconfigured, or
// unreachable during `next dev`, the app uses the local JSON document in data/app-db.json
// instead of hanging on connection timeouts. Never used in production.
const LOCAL_STORE_PATH = path.join(process.cwd(), "data", "app-db.json");
const POSTGRES_RETRY_TTL_MS = 30_000;
let postgresUnavailableUntil = 0;

function shouldUseLocalFallback() {
  return isLocalDevelopment() && Date.now() < postgresUnavailableUntil;
}

function shouldUseLocalStore() {
  return getAppStoreBackend() === "local-json" || shouldUseLocalFallback();
}

function enterLocalFallback(error: unknown) {
  postgresUnavailableUntil = Date.now() + POSTGRES_RETRY_TTL_MS;
  console.warn(
    `[store] Hosted Postgres unavailable; using local development store. Reading/writing ${LOCAL_STORE_PATH}. Retrying hosted Postgres in ${POSTGRES_RETRY_TTL_MS / 1000}s.`,
    { error: error instanceof Error ? error.message : String(error) }
  );
}

async function readLocalStore(): Promise<AppStore> {
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, "utf8");
    return normalizeStore(JSON.parse(raw) as AppStore);
  } catch {
    return normalizeStore(emptyStore());
  }
}

async function writeLocalStore(store: AppStore) {
  await fs.mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
  await fs.writeFile(LOCAL_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

// Read cache: a typical page render used to issue several identical full-blob
// SELECTs (auth, portal snapshot, page-level queries), and warm requests would
// otherwise re-pay the Neon round trip + JSON.parse + normalizeStore every time.
// Requests within the short TTL share one resolved parsed store. This is a
// performance cache, NOT a source of truth:
//   - Every local write invalidates it immediately (invalidateStoreReadCache,
//     called from updateStore — the only app_store writer).
//   - updateStore always reads fresh inside its locked transaction, never
//     through this cache, so writes are never based on stale data.
//   - The TTL is intentionally short, so cross-instance staleness (a write on
//     another serverless instance that this one cannot see) is bounded by it.
// Tunable via NEXUS_STORE_CACHE_TTL_MS; default 3s in production, 1s elsewhere.
// Set it to 0 to effectively disable the cache.
function getReadCacheTtlMs(): number {
  const raw = process.env.NEXUS_STORE_CACHE_TTL_MS?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return process.env.NODE_ENV === "production" ? 3_000 : 1_000;
}

let storeVersion = 0;
let readCache: { version: number; expiresAt: number; createdAt: number; promise: Promise<AppStore> } | null = null;

function invalidateStoreReadCache() {
  storeVersion += 1;
  readCache = null;
  if (process.env.NEXUS_PERF_LOG === "1") {
    console.log("[perf:dashboard] cache invalidated after updateStore");
  }
}

const SLOW_READ_MS = 400;
const SLOW_WRITE_MS = 600;

function logStoreTiming(op: string, startedAt: number, slowThresholdMs: number, extra?: Record<string, unknown>) {
  const durationMs = Date.now() - startedAt;
  if (durationMs >= slowThresholdMs) {
    console.warn(`[store:perf] Slow ${op}: ${durationMs}ms`, extra ?? {});
  } else if (process.env.NEXUS_PERF_LOG === "1") {
    console.log(`[store:perf] ${op}: ${durationMs}ms`, extra ?? {});
  }
}

// Aggregate counts only — never any tenant/user detail or secrets. Safe to log.
function storeSizeSummary(store: AppStore) {
  return {
    properties: store.properties.length,
    units: store.units.length,
    leases: store.leases.length,
    maintenanceRequests: store.maintenanceRequests.length,
    listings: store.listings.length,
    payments: store.payments.length,
    applications: store.rentalApplications.length,
    applicationSubmissions: store.applicationSubmissions.length
  };
}

async function fetchHostedStore(): Promise<AppStore> {
  const startedAt = Date.now();
  await ensureAppStoreTable();
  const rows = await getSql()`select data from app_store where id = ${STORE_ID} limit 1`;
  const raw = (rows[0]?.data as AppStore | undefined) ?? emptyStore();
  const store = normalizeStore(raw);
  const elapsed = Date.now() - startedAt;
  // This is the real Neon round trip + full-blob deserialize — the thing that
  // actually costs time. Every line here is one uncached store fetch, so the
  // count of these per request is the duplicate-read signal.
  console.log(`[perf:dashboard] readStore (neon fetch): ${elapsed}ms`);
  // JSON size is gated: JSON.stringify on the whole blob is itself expensive, so
  // only compute it when explicitly diagnosing (NEXUS_PERF_LOG=1).
  let sizeKb: number | null = null;
  if (process.env.NEXUS_PERF_LOG === "1") {
    sizeKb = Math.round(JSON.stringify(raw).length / 1024);
    console.log(`[perf:dashboard] store diagnostics:`, { sizeKb, ...storeSizeSummary(store) });
  }
  recordNeonFetch(elapsed, sizeKb);
  logStoreTiming("read", startedAt, SLOW_READ_MS, storeSizeSummary(store));
  return store;
}

// Counts every readStore() entry (cache hit or miss) so a single request's log
// group reveals how many times the load path asked for the full store.
let readStoreCallCount = 0;

export async function readStore(): Promise<AppStore> {
  if (shouldUseLocalStore()) {
    return readLocalStore();
  }

  const now = Date.now();
  if (readCache && readCache.version === storeVersion && readCache.expiresAt > now) {
    try {
      const cached = await readCache.promise;
      readStoreCallCount += 1;
      const ageMs = now - readCache.createdAt;
      console.log(`[perf:dashboard] readStore #${readStoreCallCount} (cache hit, age ${ageMs}ms)`);
      recordReadStore({ cacheHit: true, cacheAgeMs: ageMs });
      return cached;
    } catch {
      // Cached fetch failed; fall through to a fresh attempt.
    }
  }

  readStoreCallCount += 1;
  console.log(`[perf:dashboard] readStore #${readStoreCallCount} (cache miss)`);
  recordReadStore({ cacheHit: false });
  const promise = fetchHostedStore();
  readCache = { version: storeVersion, expiresAt: now + getReadCacheTtlMs(), createdAt: now, promise };
  try {
    return await promise;
  } catch (error) {
    if (readCache?.promise === promise) readCache = null;
    if (isLocalDevelopment()) {
      enterLocalFallback(error);
      return readLocalStore();
    }
    console.error("[store] Failed to read hosted Postgres datastore", error);
    throw error;
  }
}

function normalizeStore(store: AppStore): AppStore {
  const sourceLeases = store.leases ?? [];
  const activeLeaseStatuses = new Set(["ACTIVE", "UPCOMING", "active", "invited"]);
  const inferPaymentLease = (payment: Payment) => {
    if (payment.leaseId) {
      return sourceLeases.find((lease) => lease.id === payment.leaseId) ?? null;
    }
    return sourceLeases
      .filter((lease) => lease.unitId === payment.unitId && activeLeaseStatuses.has(lease.status))
      .sort((a, b) => (b.startDate ?? b.createdAt ?? "").localeCompare(a.startDate ?? a.createdAt ?? ""))[0] ?? null;
  };
  const fileCounters = new Map<string, number>();
  const normalizedFiles = (store.uploadedFiles ?? []).map((file) => {
    const unit = file.unitId ? store.units?.find((item) => item.id === file.unitId) : null;
    const lease = file.leaseId ? sourceLeases.find((item) => item.id === file.leaseId) : null;
    const inspection = file.inspectionId ? store.inspections?.find((item) => item.id === file.inspectionId) : null;
    const assessment = file.assessmentId ? store.damageAssessments?.find((item) => item.id === file.assessmentId) : null;
    const assessmentInspection = assessment
      ? store.inspections?.find((item) => item.id === assessment.inspectionId)
      : null;
    const propertyId =
      file.propertyId ??
      lease?.propertyId ??
      unit?.propertyId ??
      store.units?.find((item) => item.id === lease?.unitId)?.propertyId ??
      store.units?.find((item) => item.id === inspection?.unitId)?.propertyId ??
      store.units?.find((item) => item.id === assessmentInspection?.unitId)?.propertyId;
    const property = store.properties?.find((item) => item.id === propertyId);
    const counterKey = `${file.kind}:${propertyId ?? file.unitId ?? file.leaseId ?? "general"}`;
    const counter = (fileCounters.get(counterKey) ?? 0) + 1;
    fileCounters.set(counterKey, counter);
    const fallbackName =
      file.kind === "PROPERTY_IMAGE"
        ? `Property photo ${counter}`
        : file.kind === "UNIT_IMAGE"
          ? `Unit photo ${counter}`
          : file.kind === "TENANT_ID"
            ? "Tenant ID"
            : file.kind === "LEASE_DOCUMENT"
              ? "Lease agreement"
              : "General document";

    return {
      ...file,
      organizationId: file.organizationId ?? property?.organizationId,
      propertyId,
      displayName: file.displayName ?? file.label ?? fallbackName,
      uploadedAt: file.uploadedAt ?? file.createdAt,
      visibility: file.visibility ?? (file.kind === "TENANT_ID" ? "MANAGER_ONLY" : "ORGANIZATION")
    };
  });
  const legacyLeaseFiles = sourceLeases.flatMap((lease) => {
    if (!lease.documentPath || normalizedFiles.some((file) => file.leaseId === lease.id && file.path === lease.documentPath)) {
      return [];
    }
    const unit = lease.unitId ? store.units?.find((item) => item.id === lease.unitId) : null;
    const propertyId = lease.propertyId ?? unit?.propertyId;
    const property = store.properties?.find((item) => item.id === propertyId);
    return [{
      id: `legacy-lease-document-${lease.id}`,
      organizationId: property?.organizationId,
      propertyId,
      unitId: lease.unitId,
      leaseId: lease.id,
      tenantId: lease.tenantIds?.[0],
      kind: "LEASE_DOCUMENT" as const,
      label: "Lease agreement",
      displayName: "Lease agreement",
      path: lease.documentPath,
      mimeType: "application/octet-stream",
      visibility: "TENANT" as const,
      uploadedAt: lease.updatedAt ?? lease.createdAt,
      createdAt: lease.updatedAt ?? lease.createdAt
    }];
  });

  return {
    ...emptyStore(),
    ...store,
    properties: (store.properties ?? []).map((property) => ({
      ...property,
      country: property.country ?? DEFAULT_COUNTRY
    })),
    listings: store.listings ?? [],
    discussionThreads: store.discussionThreads ?? [],
    discussionMessages: store.discussionMessages ?? [],
    tenantInvites: store.tenantInvites ?? [],
    rentalApplications: store.rentalApplications ?? [],
    applicationQuestions: store.applicationQuestions ?? [],
    applicationSubmissions: store.applicationSubmissions ?? [],
    applicationApplicants: store.applicationApplicants ?? [],
    applicationDocuments: store.applicationDocuments ?? [],
    applicationNotes: store.applicationNotes ?? [],
    applicationInvites: store.applicationInvites ?? [],
    applicationStatusHistory: store.applicationStatusHistory ?? [],
    platformEvents: store.platformEvents ?? [],
    leases: (store.leases ?? []).map((lease, index) => {
      const unit = lease.unitId ? store.units?.find((item) => item.id === lease.unitId) : null;
      const property = lease.propertyId
        ? store.properties?.find((item) => item.id === lease.propertyId)
        : unit
          ? store.properties?.find((item) => item.id === unit.propertyId)
          : null;
      const tenant = (lease.tenantIds ?? [])
        .map((tenantId) => store.tenants?.find((item) => item.id === tenantId))
        .find(Boolean);
      const tenantUser = lease.tenantUserId ? store.users?.find((item) => item.id === lease.tenantUserId) : null;
      const billing = getLeaseBilling({ ...lease, monthlyRent: lease.monthlyRent ?? 0 });

      return {
        ...lease,
        id: lease.id || createId("lease"),
        nexusLeaseId: lease.nexusLeaseId ?? `NXR-${String(index + 1).padStart(5, "0")}`,
        propertyId: lease.propertyId ?? unit?.propertyId,
        managerUserId: lease.managerUserId ?? property?.managerId,
        tenantEmail: lease.tenantEmail ?? tenantUser?.email ?? tenant?.email,
        tenantIds: lease.tenantIds ?? [],
        monthlyRent: lease.monthlyRent ?? 0,
        managerAbsorbsPaymentCharge: billing.managerAbsorbsPaymentCharge,
        paymentChargeResponsibility: billing.paymentChargeResponsibility,
        managerAbsorbedPaymentChargeCents: billing.managerAbsorbedPaymentChargeCents,
        tenantFacingRentCents: billing.tenantFacingRentCents,
        dueDay: lease.dueDay ?? 1,
        rentDueTime: normalizeRentDueTime(lease.rentDueTime),
        securityDeposit: lease.securityDeposit ?? 0,
        recurringCharges: lease.recurringCharges ?? ""
      };
    }),
    payments: (store.payments ?? []).map((payment) => {
      const lease = inferPaymentLease(payment);
      const isRent = (payment.categoryTag ?? "").toLowerCase() === "rent";
      return {
        ...payment,
        tenantId: payment.tenantId ?? lease?.tenantIds?.[0],
        lateFeeAmount: payment.lateFeeAmount ?? 0,
        balanceDue: payment.balanceDue ?? (payment.status === "PAID" ? 0 : payment.amount),
        ...(isRent
          ? {
              baseRentAmount: payment.baseRentAmount ?? lease?.monthlyRent ?? payment.amount,
              tenantFacingRentCents: payment.tenantFacingRentCents ?? Math.round(payment.amount * 100),
              managerAbsorbedPaymentChargeCents: payment.managerAbsorbedPaymentChargeCents ?? 0,
              paymentChargeResponsibility: payment.paymentChargeResponsibility ?? "TENANT"
            }
          : {})
      };
    }),
    uploadedFiles: [...normalizedFiles, ...legacyLeaseFiles]
  };
}

export async function writeStore(store: AppStore) {
  if (shouldUseLocalStore()) {
    await writeLocalStore(store);
    invalidateStoreReadCache();
    return;
  }
  const startedAt = Date.now();
  try {
    await ensureAppStoreTable();
    await getSql()`
      insert into app_store (id, data, updated_at)
      values (${STORE_ID}, ${getSql().json(store as any)}::jsonb, now())
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
    logStoreTiming("write", startedAt, SLOW_WRITE_MS, storeSizeSummary(store));
  } catch (error) {
    if (isLocalDevelopment()) {
      enterLocalFallback(error);
      await writeLocalStore(store);
      return;
    }
    console.error("[store] Failed to write hosted Postgres datastore", error);
    throw error;
  } finally {
    invalidateStoreReadCache();
  }
}

async function updateLocalStore(updater: (store: AppStore) => AppStore | Promise<AppStore>) {
  const store = await readLocalStore();
  const next = await updater(store);
  if (next !== store) {
    await writeLocalStore(next);
    invalidateStoreReadCache();
  }
  return next;
}

export async function updateStore(updater: (store: AppStore) => AppStore | Promise<AppStore>) {
  if (shouldUseLocalStore()) {
    return updateLocalStore(updater);
  }

  // Business-rule errors thrown by the updater must propagate as-is and must not
  // trip the local-development Postgres fallback (which is only for connectivity).
  let updaterError: unknown = null;

  const startedAt = Date.now();
  let wrote = false;
  try {
    await ensureAppStoreTable();
    const sql = getSql();
    // Row-level lock serializes concurrent read-modify-write cycles so parallel
    // requests (e.g. a Stripe webhook and a manager action) cannot lose updates.
    const result = await sql.begin(async (tx) => {
      const rows = await tx`select data from app_store where id = ${STORE_ID} for update`;
      const store = normalizeStore((rows[0]?.data as AppStore | undefined) ?? emptyStore());
      let next: AppStore;
      try {
        next = await updater(store);
      } catch (error) {
        updaterError = error;
        throw error;
      }
      if (next !== store) {
        await tx`
          insert into app_store (id, data, updated_at)
          values (${STORE_ID}, ${sql.json(next as any)}::jsonb, now())
          on conflict (id) do update set data = excluded.data, updated_at = now()
        `;
        wrote = true;
      }
      return next;
    });
    if (wrote) {
      invalidateStoreReadCache();
    }
    logStoreTiming("update-transaction", startedAt, SLOW_WRITE_MS, { wrote });
    return result as AppStore;
  } catch (error) {
    if (updaterError) {
      throw updaterError;
    }
    if (isLocalDevelopment()) {
      enterLocalFallback(error);
      return updateLocalStore(updater);
    }
    console.error("[store] Failed to update hosted Postgres datastore", error);
    throw error;
  }
}

// Revoke every session token previously issued to a user by advancing the
// version that getCurrentUser compares against. Used by logout, password reset,
// and admin account disable/role changes.
export async function incrementUserSessionVersion(userId: string) {
  await updateStore((store) => {
    let changed = false;
    const users = store.users.map((user) => {
      if (user.id !== userId) return user;
      changed = true;
      return { ...user, sessionVersion: (user.sessionVersion ?? 0) + 1, updatedAt: nowIso() };
    });
    return changed ? { ...store, users } : store;
  });
}

export async function getUserByEmail(email: string) {
  const store = await readStore();
  return store.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function getUserById(id: string) {
  const store = await readStore();
  return store.users.find((user) => user.id === id) ?? null;
}

// Bypasses the shared read cache for the rare reads that must observe a write
// made milliseconds earlier — possibly by another server instance whose cache
// invalidation we cannot see (e.g. rendering settings immediately after a
// Stripe repair action redirected back). Use sparingly: every call is a full
// uncached store fetch.
export async function readStoreFresh(): Promise<AppStore> {
  if (shouldUseLocalStore()) {
    return readLocalStore();
  }
  try {
    return await fetchHostedStore();
  } catch (error) {
    if (isLocalDevelopment()) {
      enterLocalFallback(error);
      return readLocalStore();
    }
    console.error("[store] Failed to read hosted Postgres datastore (fresh read)", error);
    throw error;
  }
}

export async function getUserByIdFresh(id: string) {
  const store = await readStoreFresh();
  return store.users.find((user) => user.id === id) ?? null;
}

export async function getOrganizationById(id: string) {
  const store = await readStore();
  return store.organizations.find((organization) => organization.id === id) ?? null;
}

export async function getPasswordResetToken(token: string) {
  const store = await readStore();
  return store.passwordResetTokens.find((item) => item.token === token) ?? null;
}

export async function getNotificationsByOrganization(organizationId: string, take = 5) {
  const store = await readStore();
  return store.notifications
    .filter((item) => item.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take);
}

// Request-memoized: the dashboard render path asks for the same org snapshot
// from several helpers (portal context, manager aggregation, search). The React
// cache() collapses those into one readStore + one filtering pass per request.
// Safe to cache because every caller is a read-only render path; server actions
// that mutate then re-read use readStore/updateStore directly, not this.
export const getOrganizationSnapshot = cache(async (organizationId: string) => {
  const store = await readStore();

  // Precomputed id->record lookups so the org-scoping filters below run in O(n)
  // instead of O(n*m). These are a mechanical replacement for the previous
  // `array.find(c => c.id === X)` calls — same comparison, same result, just a
  // Map.get. The boolean/fallback logic in each filter is intentionally left
  // identical so org/RBAC scoping is byte-for-byte unchanged.
  const propertyById = new Map(store.properties.map((property) => [property.id, property] as const));
  const unitById = new Map(store.units.map((unit) => [unit.id, unit] as const));
  const inspectionById = new Map(store.inspections.map((inspection) => [inspection.id, inspection] as const));
  const damageAssessmentById = new Map(store.damageAssessments.map((assessment) => [assessment.id, assessment] as const));
  const leaseById = new Map(store.leases.map((lease) => [lease.id, lease] as const));
  // The application sub-arrays previously did `.some(app => app.org === org && app.id === x)`
  // which is exactly "an in-org record with that id exists" (ids are unique).
  const orgApplicationIds = new Set(
    store.rentalApplications.filter((application) => application.organizationId === organizationId).map((application) => application.id)
  );
  const orgSubmissionIds = new Set(
    store.applicationSubmissions.filter((submission) => submission.organizationId === organizationId).map((submission) => submission.id)
  );

  return {
    store,
    organization: store.organizations.find((organization) => organization.id === organizationId)!,
    properties: store.properties.filter((property) => property.organizationId === organizationId),
    listings: store.listings.filter((listing) => listing.organizationId === organizationId),
    users: store.users.filter((user) => user.organizationId === organizationId),
    units: store.units.filter((unit) => {
      const property = propertyById.get(unit.propertyId);
      return property?.organizationId === organizationId;
    }),
    tenants: store.tenants.filter((tenant) => tenant.organizationId === organizationId),
    leases: store.leases.filter((lease) => {
      const unit = lease.unitId ? unitById.get(lease.unitId) : undefined;
      const property = lease.propertyId
        ? propertyById.get(lease.propertyId)
        : unit
          ? propertyById.get(unit.propertyId)
          : undefined;
      return property?.organizationId === organizationId;
    }),
    payments: store.payments.filter((payment) => {
      const unit = unitById.get(payment.unitId);
      const property = unit ? propertyById.get(unit.propertyId) : undefined;
      return property?.organizationId === organizationId;
    }),
    expenses: store.expenses.filter((expense) => {
      const property = propertyById.get(expense.propertyId);
      return property?.organizationId === organizationId;
    }),
    maintenanceRequests: store.maintenanceRequests.filter((request) => {
      const property = propertyById.get(request.propertyId);
      return property?.organizationId === organizationId;
    }),
    inspections: store.inspections.filter((inspection) => {
      const unit = unitById.get(inspection.unitId);
      const property = unit ? propertyById.get(unit.propertyId) : undefined;
      return property?.organizationId === organizationId;
    }),
    damageAssessments: store.damageAssessments.filter((assessment) => {
      const inspection = inspectionById.get(assessment.inspectionId);
      const unit = inspection ? unitById.get(inspection.unitId) : undefined;
      const property = unit ? propertyById.get(unit.propertyId) : undefined;
      return property?.organizationId === organizationId;
    }),
    discussionThreads: store.discussionThreads.filter((thread) => thread.organizationId === organizationId),
    discussionMessages: store.discussionMessages.filter((message) => message.organizationId === organizationId),
    uploadedFiles: store.uploadedFiles.filter((file) => {
      if (file.organizationId) return file.organizationId === organizationId;
      if (file.propertyId) return propertyById.get(file.propertyId)?.organizationId === organizationId;
      if (file.leaseId) {
        const lease = leaseById.get(file.leaseId);
        const property = lease
          ? propertyById.get(lease.propertyId ?? "") ??
            (lease.unitId ? propertyById.get(unitById.get(lease.unitId)?.propertyId ?? "") : undefined)
          : null;
        return property?.organizationId === organizationId;
      }
      if (file.unitId) {
        const unit = unitById.get(file.unitId);
        const property = unit ? propertyById.get(unit.propertyId) : undefined;
        return property?.organizationId === organizationId;
      }
      if (file.inspectionId) {
        const inspection = inspectionById.get(file.inspectionId);
        const unit = inspection ? unitById.get(inspection.unitId) : undefined;
        const property = unit ? propertyById.get(unit.propertyId) : undefined;
        return property?.organizationId === organizationId;
      }
      if (file.assessmentId) {
        const assessment = damageAssessmentById.get(file.assessmentId);
        const inspection = assessment ? inspectionById.get(assessment.inspectionId) : undefined;
        const unit = inspection ? unitById.get(inspection.unitId) : undefined;
        const property = unit ? propertyById.get(unit.propertyId) : undefined;
        return property?.organizationId === organizationId;
      }
      return false;
    }),
    notifications: store.notifications.filter((notification) => notification.organizationId === organizationId),
    rentalApplications: store.rentalApplications.filter((application) => application.organizationId === organizationId),
    applicationQuestions: store.applicationQuestions.filter((question) => orgApplicationIds.has(question.applicationId)),
    applicationSubmissions: store.applicationSubmissions.filter((submission) => submission.organizationId === organizationId),
    applicationApplicants: store.applicationApplicants.filter((applicant) => orgSubmissionIds.has(applicant.submissionId)),
    applicationDocuments: store.applicationDocuments.filter((document) => orgApplicationIds.has(document.applicationId)),
    applicationNotes: store.applicationNotes.filter((note) => orgApplicationIds.has(note.applicationId)),
    applicationInvites: store.applicationInvites.filter((invite) => invite.organizationId === organizationId),
    applicationStatusHistory: store.applicationStatusHistory.filter((entry) => orgApplicationIds.has(entry.applicationId))
  };
});
