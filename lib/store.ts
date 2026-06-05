import "server-only";

import { DEFAULT_COUNTRY, type StoredAddress } from "@/lib/address";
import { ensureAppStoreTable, getSql } from "@/lib/database";

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
  stripeUpdatedAt?: string;
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
    applicationNotes: []
  };
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function readStore(): Promise<AppStore> {
  try {
    await ensureAppStoreTable();
    const rows = await getSql()`select data from app_store where id = ${STORE_ID} limit 1`;
    return normalizeStore((rows[0]?.data as AppStore | undefined) ?? emptyStore());
  } catch (error) {
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
  try {
    await ensureAppStoreTable();
    await getSql()`
      insert into app_store (id, data, updated_at)
      values (${STORE_ID}, ${getSql().json(store)}::jsonb, now())
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
  } catch (error) {
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
    )
  };
}
