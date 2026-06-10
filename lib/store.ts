import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { DEFAULT_COUNTRY, type StoredAddress } from "@/lib/address";
import { normalizeRentDueTime } from "@/lib/app-time";
import { ensureAppStoreTable, getSql, isLocalDevelopment } from "@/lib/database";

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
export type FileKind = "PROPERTY_IMAGE" | "UNIT_IMAGE" | "MOVE_IN_IMAGE" | "MOVE_OUT_IMAGE" | "DAMAGE_IMAGE" | "LEASE_DOCUMENT" | "AVATAR";
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
  | "STRIPE_SETUP_COMPLETED";

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
  LEASE_DOCUMENT: "LEASE_DOCUMENT",
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
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
};
export type Property = StoredAddress & { id: string; organizationId: string; name: string; status: PropertyStatus; description?: string; amenities: string; notes?: string; managerId?: string; createdAt: string; updatedAt: string };
export type Unit = { id: string; propertyId: string; unitNumber: string; nickname?: string; addressOverride?: string; unitType: string; bedrooms: number; bathrooms: number; squareFeet?: number; monthlyRent: number; depositAmount: number; leaseStatus: LeaseStatus; occupancyStatus: UnitOccupancyStatus; amenities: string; notes?: string; createdAt: string; updatedAt: string };
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
export type UploadedFile = { id: string; propertyId?: string; unitId?: string; inspectionId?: string; assessmentId?: string; kind: FileKind; label?: string; path: string; mimeType: string; createdAt: string };
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

export type AppStore = {
  organizations: Organization[];
  users: User[];
  properties: Property[];
  units: Unit[];
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
};

const STORE_ID = "default";

function emptyStore(): AppStore {
  return {
    organizations: [],
    users: [],
    properties: [],
    units: [],
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
    platformEvents: []
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

export async function readStore(): Promise<AppStore> {
  if (shouldUseLocalFallback()) {
    return readLocalStore();
  }
  try {
    await ensureAppStoreTable();
    const rows = await getSql()`select data from app_store where id = ${STORE_ID} limit 1`;
    return normalizeStore((rows[0]?.data as AppStore | undefined) ?? emptyStore());
  } catch (error) {
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

  return {
    ...emptyStore(),
    ...store,
    properties: (store.properties ?? []).map((property) => ({
      ...property,
      country: property.country ?? DEFAULT_COUNTRY
    })),
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

      return {
        ...lease,
        id: lease.id || createId("lease"),
        nexusLeaseId: lease.nexusLeaseId ?? `NXR-${String(index + 1).padStart(5, "0")}`,
        propertyId: lease.propertyId ?? unit?.propertyId,
        managerUserId: lease.managerUserId ?? property?.managerId,
        tenantEmail: lease.tenantEmail ?? tenantUser?.email ?? tenant?.email,
        tenantIds: lease.tenantIds ?? [],
        monthlyRent: lease.monthlyRent ?? 0,
        dueDay: lease.dueDay ?? 1,
        rentDueTime: normalizeRentDueTime(lease.rentDueTime),
        securityDeposit: lease.securityDeposit ?? 0,
        recurringCharges: lease.recurringCharges ?? ""
      };
    }),
    payments: (store.payments ?? []).map((payment) => {
      const lease = inferPaymentLease(payment);
      return {
        ...payment,
        tenantId: payment.tenantId ?? lease?.tenantIds?.[0],
        lateFeeAmount: payment.lateFeeAmount ?? 0,
        balanceDue: payment.balanceDue ?? (payment.status === "PAID" ? 0 : payment.amount)
      };
    })
  };
}

export async function writeStore(store: AppStore) {
  if (shouldUseLocalFallback()) {
    await writeLocalStore(store);
    return;
  }
  try {
    await ensureAppStoreTable();
    await getSql()`
      insert into app_store (id, data, updated_at)
      values (${STORE_ID}, ${getSql().json(store)}::jsonb, now())
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
  } catch (error) {
    if (isLocalDevelopment()) {
      enterLocalFallback(error);
      await writeLocalStore(store);
      return;
    }
    console.error("[store] Failed to write hosted Postgres datastore", error);
    throw error;
  }
}

export async function updateStore(updater: (store: AppStore) => AppStore | Promise<AppStore>) {
  try {
    const store = await readStore();
    const next = await updater(store);
    if (next !== store) {
      await writeStore(next);
    }
    return next;
  } catch (error) {
    console.error("[store] Failed to update hosted Postgres datastore", error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  const store = await readStore();
  return store.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function getUserById(id: string) {
  const store = await readStore();
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

export async function getOrganizationSnapshot(organizationId: string) {
  const store = await readStore();
  return {
    store,
    organization: store.organizations.find((organization) => organization.id === organizationId)!,
    properties: store.properties.filter((property) => property.organizationId === organizationId),
    users: store.users.filter((user) => user.organizationId === organizationId),
    units: store.units.filter((unit) => {
      const property = store.properties.find((candidate) => candidate.id === unit.propertyId);
      return property?.organizationId === organizationId;
    }),
    tenants: store.tenants.filter((tenant) => tenant.organizationId === organizationId),
    leases: store.leases.filter((lease) => {
      const unit = store.units.find((candidate) => candidate.id === lease.unitId);
      const property = lease.propertyId
        ? store.properties.find((candidate) => candidate.id === lease.propertyId)
        : store.properties.find((candidate) => candidate.id === unit?.propertyId);
      return property?.organizationId === organizationId;
    }),
    payments: store.payments.filter((payment) => {
      const unit = store.units.find((candidate) => candidate.id === payment.unitId);
      const property = store.properties.find((candidate) => candidate.id === unit?.propertyId);
      return property?.organizationId === organizationId;
    }),
    expenses: store.expenses.filter((expense) => {
      const property = store.properties.find((candidate) => candidate.id === expense.propertyId);
      return property?.organizationId === organizationId;
    }),
    maintenanceRequests: store.maintenanceRequests.filter((request) => {
      const property = store.properties.find((candidate) => candidate.id === request.propertyId);
      return property?.organizationId === organizationId;
    }),
    inspections: store.inspections.filter((inspection) => {
      const unit = store.units.find((candidate) => candidate.id === inspection.unitId);
      const property = store.properties.find((candidate) => candidate.id === unit?.propertyId);
      return property?.organizationId === organizationId;
    }),
    damageAssessments: store.damageAssessments.filter((assessment) => {
      const inspection = store.inspections.find((candidate) => candidate.id === assessment.inspectionId);
      const unit = store.units.find((candidate) => candidate.id === inspection?.unitId);
      const property = store.properties.find((candidate) => candidate.id === unit?.propertyId);
      return property?.organizationId === organizationId;
    }),
    discussionThreads: store.discussionThreads.filter((thread) => thread.organizationId === organizationId),
    discussionMessages: store.discussionMessages.filter((message) => message.organizationId === organizationId),
    uploadedFiles: store.uploadedFiles.filter((file) => {
      if (file.propertyId) return store.properties.find((property) => property.id === file.propertyId)?.organizationId === organizationId;
      if (file.unitId) {
        const unit = store.units.find((candidate) => candidate.id === file.unitId);
        const property = store.properties.find((candidate) => candidate.id === unit?.propertyId);
        return property?.organizationId === organizationId;
      }
      if (file.inspectionId) {
        const inspection = store.inspections.find((candidate) => candidate.id === file.inspectionId);
        const unit = store.units.find((candidate) => candidate.id === inspection?.unitId);
        const property = store.properties.find((candidate) => candidate.id === unit?.propertyId);
        return property?.organizationId === organizationId;
      }
      if (file.assessmentId) {
        const assessment = store.damageAssessments.find((candidate) => candidate.id === file.assessmentId);
        const inspection = store.inspections.find((candidate) => candidate.id === assessment?.inspectionId);
        const unit = store.units.find((candidate) => candidate.id === inspection?.unitId);
        const property = store.properties.find((candidate) => candidate.id === unit?.propertyId);
        return property?.organizationId === organizationId;
      }
      return false;
    }),
    notifications: store.notifications.filter((notification) => notification.organizationId === organizationId),
    rentalApplications: store.rentalApplications.filter((application) => application.organizationId === organizationId),
    applicationQuestions: store.applicationQuestions.filter((question) =>
      store.rentalApplications.some((application) => application.organizationId === organizationId && application.id === question.applicationId)
    ),
    applicationSubmissions: store.applicationSubmissions.filter((submission) => submission.organizationId === organizationId),
    applicationApplicants: store.applicationApplicants.filter((applicant) =>
      store.applicationSubmissions.some((submission) => submission.organizationId === organizationId && submission.id === applicant.submissionId)
    ),
    applicationDocuments: store.applicationDocuments.filter((document) =>
      store.rentalApplications.some((application) => application.organizationId === organizationId && application.id === document.applicationId)
    ),
    applicationNotes: store.applicationNotes.filter((note) =>
      store.rentalApplications.some((application) => application.organizationId === organizationId && application.id === note.applicationId)
    ),
    applicationInvites: store.applicationInvites.filter((invite) => invite.organizationId === organizationId),
    applicationStatusHistory: store.applicationStatusHistory.filter((entry) =>
      store.rentalApplications.some((application) => application.organizationId === organizationId && application.id === entry.applicationId)
    )
  };
}
