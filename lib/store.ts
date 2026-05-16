import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type UserRole = "ADMIN" | "MANAGER" | "TENANT";
export type PropertyStatus = "ACTIVE" | "ARCHIVED";
export type UnitOccupancyStatus = "OCCUPIED" | "VACANT" | "NOTICE" | "TURNOVER";
export type LeaseStatus = "ACTIVE" | "UPCOMING" | "EXPIRED" | "TERMINATED";
export type PaymentStatus = "PENDING" | "PAID" | "PARTIAL" | "LATE";
export type ExpenseCategory = "MAINTENANCE" | "REPAIR" | "UTILITIES" | "INSURANCE" | "TAX" | "CLEANING" | "MARKETING" | "OTHER";
export type MaintenanceStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type AssessmentSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type NotificationType = "RENT_DUE" | "RENT_OVERDUE" | "LEASE_EXPIRING" | "INSPECTION_PENDING" | "MAINTENANCE_OPEN" | "DAMAGE_ASSESSMENT" | "SYSTEM";
export type FileKind = "PROPERTY_IMAGE" | "UNIT_IMAGE" | "MOVE_IN_IMAGE" | "MOVE_OUT_IMAGE" | "DAMAGE_IMAGE" | "LEASE_DOCUMENT" | "AVATAR";

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
export type User = { id: string; organizationId: string; email: string; passwordHash: string; firstName: string; lastName: string; role: UserRole; isActive: boolean; avatarPath?: string; title?: string; phone?: string; createdAt: string; updatedAt: string };
export type Property = { id: string; organizationId: string; name: string; addressLine1: string; addressLine2?: string; city: string; state: string; postalCode: string; status: PropertyStatus; description?: string; amenities: string; notes?: string; managerId?: string; createdAt: string; updatedAt: string };
export type Unit = { id: string; propertyId: string; unitNumber: string; nickname?: string; addressOverride?: string; unitType: string; bedrooms: number; bathrooms: number; squareFeet?: number; monthlyRent: number; depositAmount: number; leaseStatus: LeaseStatus; occupancyStatus: UnitOccupancyStatus; amenities: string; notes?: string; createdAt: string; updatedAt: string };
export type Tenant = { id: string; organizationId: string; firstName: string; lastName: string; email?: string; phone?: string; employer?: string; emergencyName?: string; emergencyPhone?: string; notes?: string; createdAt: string; updatedAt: string };
export type Lease = { id: string; unitId: string; tenantIds: string[]; startDate: string; endDate: string; monthlyRent: number; dueDay: number; securityDeposit: number; recurringCharges: string; lateFeePolicy?: string; notes?: string; status: LeaseStatus; documentPath?: string; createdAt: string; updatedAt: string };
export type Payment = { id: string; unitId: string; leaseId?: string; description: string; amount: number; dueDate: string; paidDate?: string; status: PaymentStatus; lateFeeAmount: number; balanceDue: number; categoryTag?: string; createdAt: string; updatedAt: string };
export type Expense = { id: string; propertyId: string; unitId?: string; title: string; description?: string; amount: number; incurredAt: string; category: ExpenseCategory; tags: string; vendor?: string; createdAt: string; updatedAt: string };
export type MaintenanceRequest = { id: string; propertyId: string; unitId?: string; title: string; description: string; status: MaintenanceStatus; priority: MaintenancePriority; estimatedCost?: number; actualCost?: number; assignedTo?: string; requestedAt: string; resolvedAt?: string; timeline: string; createdAt: string; updatedAt: string };
export type Inspection = { id: string; unitId: string; leaseId?: string; inspectionDate: string; type: string; notes?: string; createdAt: string; updatedAt: string };
export type DamageAssessment = { id: string; inspectionId: string; createdById: string; summary: string; damageCategories: string; severity: AssessmentSeverity; confidenceScore: number; estimatedLow: number; estimatedHigh: number; wearAndTear: boolean; explanation: string; recommendedNext: string; createdAt: string; updatedAt: string };
export type UploadedFile = { id: string; propertyId?: string; unitId?: string; inspectionId?: string; assessmentId?: string; kind: FileKind; label?: string; path: string; mimeType: string; createdAt: string };
export type Notification = { id: string; organizationId: string; userId?: string; type: NotificationType; title: string; body: string; isRead: boolean; createdAt: string };
export type PasswordResetToken = { id: string; userId: string; token: string; expiresAt: string; usedAt?: string; createdAt: string };

export type AppStore = {
  organizations: Organization[];
  users: User[];
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  payments: Payment[];
  expenses: Expense[];
  maintenanceRequests: MaintenanceRequest[];
  inspections: Inspection[];
  damageAssessments: DamageAssessment[];
  uploadedFiles: UploadedFile[];
  notifications: Notification[];
  passwordResetTokens: PasswordResetToken[];
};

const STORE_ID = "default";
let sqlClient: NeonQueryFunction<false, false> | null = null;

function emptyStore(): AppStore {
  return {
    organizations: [],
    users: [],
    properties: [],
    units: [],
    tenants: [],
    leases: [],
    payments: [],
    expenses: [],
    maintenanceRequests: [],
    inspections: [],
    damageAssessments: [],
    uploadedFiles: [],
    notifications: [],
    passwordResetTokens: []
  };
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
}

function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL or POSTGRES_URL. Configure a hosted Postgres connection string for persistence.");
  }

  sqlClient ??= neon(databaseUrl);
  return sqlClient;
}

async function ensureStoreTable() {
  await getSql()`
    create table if not exists app_store (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function readStore(): Promise<AppStore> {
  try {
    await ensureStoreTable();
    const rows = await getSql()`select data from app_store where id = ${STORE_ID} limit 1`;
    return (rows[0]?.data as AppStore | undefined) ?? emptyStore();
  } catch (error) {
    console.error("[store] Failed to read hosted Postgres datastore", error);
    throw error;
  }
}

export async function writeStore(store: AppStore) {
  try {
    await ensureStoreTable();
    await getSql()`
      insert into app_store (id, data, updated_at)
      values (${STORE_ID}, ${JSON.stringify(store)}::jsonb, now())
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
    await writeStore(next);
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
      const property = store.properties.find((candidate) => candidate.id === unit?.propertyId);
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
    notifications: store.notifications.filter((notification) => notification.organizationId === organizationId)
  };
}
