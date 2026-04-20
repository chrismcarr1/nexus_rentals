"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession, createSession, requireRoles, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { FileKind, UserRole } from "@/lib/store";
import {
  damageAssessmentSchema,
  expenseSchema,
  leaseSchema,
  loginSchema,
  maintenanceSchema,
  paymentSchema,
  propertySchema,
  settingsSchema,
  signupSchema,
  tenantSchema,
  unitSchema
} from "@/lib/validations";
import { generateDamageEstimate } from "@/services/damage-estimator";
import { getPortalContext } from "@/services/portal";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function getOptionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

export async function signupAction(formData: FormData) {
  const parsed = signupSchema.parse({
    businessName: getString(formData, "businessName"),
    firstName: getString(formData, "firstName"),
    lastName: getString(formData, "lastName"),
    email: getString(formData, "email"),
    password: getString(formData, "password"),
    phone: getOptionalString(formData, "phone"),
    mailingAddress: getOptionalString(formData, "mailingAddress")
  });

  const existingUser = await db.user.findUnique({ where: { email: parsed.email } });
  if (existingUser) {
    redirect("/signup?error=account-exists");
  }

  const organization = await db.organization.create({
    data: {
      name: parsed.businessName,
      email: parsed.email,
      phone: parsed.phone,
      mailingAddress: parsed.mailingAddress
    }
  });

  const user = await db.user.create({
    data: {
      organizationId: organization.id,
      email: parsed.email,
      passwordHash: await hashPassword(parsed.password),
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      role: UserRole.ADMIN,
      phone: parsed.phone
    }
  });

  await createSession({
    sub: user.id,
    organizationId: organization.id,
    role: user.role,
    email: user.email
  });

  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.parse({
    email: getString(formData, "email"),
    password: getString(formData, "password")
  });

  const user = await db.user.findUnique({ where: { email: parsed.email } });
  if (!user || !(await verifyPassword(parsed.password, user.passwordHash))) {
    redirect("/login?error=invalid-credentials");
  }

  await createSession({
    sub: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function requestResetAction(formData: FormData) {
  const email = getString(formData, "email");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    redirect("/forgot-password?success=1");
  }

  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6)
    }
  });

  redirect("/forgot-password?success=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = getString(formData, "token");
  const password = getString(formData, "password");

  const record = await db.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    redirect("/reset-password?error=invalid-token");
  }

  await db.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(password) }
  });
  await db.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() }
  });

  redirect("/login?reset=1");
}

export async function createPropertyAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const parsed = propertySchema.parse({
    name: getString(formData, "name"),
    addressLine1: getString(formData, "addressLine1"),
    city: getString(formData, "city"),
    state: getString(formData, "state"),
    postalCode: getString(formData, "postalCode"),
    addressLine2: getOptionalString(formData, "addressLine2"),
    description: getOptionalString(formData, "description"),
    amenities: getOptionalString(formData, "amenities"),
    notes: getOptionalString(formData, "notes"),
    managerId: getOptionalString(formData, "managerId")
  });
  const uploadedPath = getOptionalString(formData, "imagePath");

  await db.property.create({
    data: {
      organizationId: user.organizationId,
      ...parsed,
      managerId: user.role === UserRole.MANAGER ? user.id : parsed.managerId,
      amenities: parsed.amenities ?? "",
      files: uploadedPath
        ? {
            create: {
              kind: FileKind.PROPERTY_IMAGE,
              label: "Uploaded cover",
              path: uploadedPath,
              mimeType: "image/*"
            }
          }
        : undefined
    }
  });

  revalidatePath("/properties");
  revalidatePath("/dashboard");
  redirect("/properties");
}

export async function assignPropertyManagerAction(formData: FormData) {
  await requireRoles([UserRole.ADMIN]);
  const propertyId = getString(formData, "propertyId");
  const managerId = getOptionalString(formData, "managerId");

  await db.property.update({
    where: { id: propertyId },
    data: { managerId: managerId || undefined }
  });

  revalidatePath("/properties");
  revalidatePath("/dashboard");
}

export async function archivePropertyAction(formData: FormData) {
  await requireRoles([UserRole.ADMIN]);
  const propertyId = getString(formData, "propertyId");

  await db.property.update({
    where: { id: propertyId },
    data: { status: "ARCHIVED" }
  });

  revalidatePath("/properties");
  revalidatePath("/dashboard");
}

export async function createUnitAction(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const parsed = unitSchema.parse({
    propertyId: getString(formData, "propertyId"),
    unitNumber: getString(formData, "unitNumber"),
    nickname: getOptionalString(formData, "nickname"),
    unitType: getString(formData, "unitType"),
    bedrooms: getString(formData, "bedrooms"),
    bathrooms: getString(formData, "bathrooms"),
    squareFeet: getOptionalString(formData, "squareFeet"),
    monthlyRent: getString(formData, "monthlyRent"),
    depositAmount: getString(formData, "depositAmount"),
    occupancyStatus: getString(formData, "occupancyStatus"),
    leaseStatus: getString(formData, "leaseStatus"),
    amenities: getOptionalString(formData, "amenities"),
    notes: getOptionalString(formData, "notes")
  });
  const imagePath = getOptionalString(formData, "imagePath");

  const unit = await db.unit.create({
    data: {
      ...parsed,
      squareFeet: parsed.squareFeet || null,
      amenities: parsed.amenities ?? "",
      files: imagePath
        ? {
            create: [
              {
                kind: FileKind.UNIT_IMAGE,
                label: "Uploaded image",
                path: imagePath,
                mimeType: "image/*"
              }
            ]
          }
        : undefined
    }
  });

  revalidatePath("/properties");
  redirect(`/units/${unit.id}`);
}

export async function createTenantAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const parsed = tenantSchema.parse({
    firstName: getString(formData, "firstName"),
    lastName: getString(formData, "lastName"),
    email: getOptionalString(formData, "email"),
    phone: getOptionalString(formData, "phone"),
    employer: getOptionalString(formData, "employer"),
    emergencyName: getOptionalString(formData, "emergencyName"),
    emergencyPhone: getOptionalString(formData, "emergencyPhone"),
    notes: getOptionalString(formData, "notes")
  });

  await db.tenant.create({
    data: {
      organizationId: user.organizationId,
      ...parsed
    }
  });

  revalidatePath("/tenants");
  redirect("/tenants");
}

export async function createLeaseAction(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const parsed = leaseSchema.parse({
    unitId: getString(formData, "unitId"),
    tenantId: getString(formData, "tenantId"),
    startDate: getString(formData, "startDate"),
    endDate: getString(formData, "endDate"),
    monthlyRent: getString(formData, "monthlyRent"),
    dueDay: getString(formData, "dueDay"),
    securityDeposit: getString(formData, "securityDeposit"),
    recurringCharges: getOptionalString(formData, "recurringCharges"),
    lateFeePolicy: getOptionalString(formData, "lateFeePolicy"),
    notes: getOptionalString(formData, "notes"),
    status: getString(formData, "status")
  });

  await db.lease.create({
    data: {
      unitId: parsed.unitId,
      startDate: new Date(parsed.startDate),
      endDate: new Date(parsed.endDate),
      monthlyRent: parsed.monthlyRent,
      dueDay: parsed.dueDay,
      securityDeposit: parsed.securityDeposit,
      recurringCharges: parsed.recurringCharges ?? "",
      lateFeePolicy: parsed.lateFeePolicy,
      notes: parsed.notes,
      status: parsed.status,
      tenants: {
        create: { tenantId: parsed.tenantId }
      }
    }
  });

  await db.unit.update({
    where: { id: parsed.unitId },
    data: {
      leaseStatus: parsed.status,
      occupancyStatus: parsed.status === "ACTIVE" ? "OCCUPIED" : "VACANT"
    }
  });

  revalidatePath("/leases");
  revalidatePath("/dashboard");
  redirect("/leases");
}

export async function createPaymentAction(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const parsed = paymentSchema.parse({
    unitId: getString(formData, "unitId"),
    leaseId: getOptionalString(formData, "leaseId"),
    description: getString(formData, "description"),
    amount: getString(formData, "amount"),
    dueDate: getString(formData, "dueDate"),
    paidDate: getOptionalString(formData, "paidDate"),
    status: getString(formData, "status"),
    lateFeeAmount: getOptionalString(formData, "lateFeeAmount"),
    balanceDue: getOptionalString(formData, "balanceDue"),
    categoryTag: getOptionalString(formData, "categoryTag")
  });

  await db.payment.create({
    data: {
      unitId: parsed.unitId,
      leaseId: parsed.leaseId,
      description: parsed.description,
      amount: parsed.amount,
      dueDate: new Date(parsed.dueDate),
      paidDate: parsed.paidDate ? new Date(parsed.paidDate) : undefined,
      status: parsed.status,
      lateFeeAmount: parsed.lateFeeAmount ?? 0,
      balanceDue: parsed.balanceDue ?? (parsed.status === "PAID" ? 0 : parsed.amount),
      categoryTag: parsed.categoryTag
    }
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect("/transactions");
}

export async function createExpenseAction(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const parsed = expenseSchema.parse({
    propertyId: getString(formData, "propertyId"),
    unitId: getOptionalString(formData, "unitId"),
    title: getString(formData, "title"),
    description: getOptionalString(formData, "description"),
    amount: getString(formData, "amount"),
    incurredAt: getString(formData, "incurredAt"),
    category: getString(formData, "category"),
    tags: getOptionalString(formData, "tags"),
    vendor: getOptionalString(formData, "vendor")
  });

  await db.expense.create({
    data: {
      ...parsed,
      unitId: parsed.unitId || null,
      incurredAt: new Date(parsed.incurredAt),
      tags: parsed.tags ?? ""
    }
  });

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses");
}

export async function createMaintenanceAction(formData: FormData) {
  const user = await requireUser();
  const parsed = maintenanceSchema.parse({
    propertyId: getString(formData, "propertyId"),
    unitId: getOptionalString(formData, "unitId"),
    title: getString(formData, "title"),
    description: getString(formData, "description"),
    status: getString(formData, "status"),
    priority: getString(formData, "priority"),
    estimatedCost: getOptionalString(formData, "estimatedCost"),
    actualCost: getOptionalString(formData, "actualCost"),
    assignedTo: getOptionalString(formData, "assignedTo"),
    timeline: getOptionalString(formData, "timeline")
  });

  await db.maintenanceRequest.create({
    data: {
      ...parsed,
      unitId: parsed.unitId || null,
      status: user.role === UserRole.TENANT ? "OPEN" : parsed.status,
      estimatedCost: user.role === UserRole.TENANT ? null : parsed.estimatedCost ?? null,
      actualCost: user.role === UserRole.TENANT ? null : parsed.actualCost ?? null,
      assignedTo: user.role === UserRole.TENANT ? null : parsed.assignedTo,
      timeline:
        parsed.timeline ??
        (user.role === UserRole.TENANT ? "Submitted from resident portal; awaiting manager triage." : "Created from operations dashboard.")
    }
  });

  revalidatePath("/maintenance");
  redirect("/maintenance");
}

export async function updateSettingsAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN]);
  const parsed = settingsSchema.parse({
    name: getString(formData, "name"),
    email: getString(formData, "email"),
    phone: getOptionalString(formData, "phone"),
    mailingAddress: getOptionalString(formData, "mailingAddress")
  });

  await db.organization.update({
    where: { id: user.organizationId },
    data: {
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      mailingAddress: parsed.mailingAddress
    }
  });

  revalidatePath("/settings");
  redirect("/settings");
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    data: {
      firstName: getString(formData, "firstName"),
      lastName: getString(formData, "lastName"),
      phone: getOptionalString(formData, "phone"),
      title: getOptionalString(formData, "title")
    }
  });

  revalidatePath("/settings");
  redirect("/settings");
}

export async function payRentAction(formData: FormData) {
  const user = await requireRoles([UserRole.TENANT]);
  const paymentId = getString(formData, "paymentId");
  const portal = await getPortalContext(user);

  const payment = await db.payment.findFirst?.({ where: { id: paymentId } });
  if (!payment || !portal.scope.payments.some((item: any) => item.id === paymentId)) {
    redirect("/transactions");
  }

  await db.payment.update({
    where: { id: paymentId },
    data: {
      status: "PAID",
      paidDate: new Date(),
      balanceDue: 0
    }
  });

  await db.notification.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      type: "RENT_DUE",
      title: "Rent payment submitted",
      body: "Your payment was marked as paid in the resident portal."
    }
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect("/transactions");
}

export async function addUnitAssetAction(formData: FormData) {
  await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const unitId = getString(formData, "unitId");
  const path = getString(formData, "path");
  const kind = getString(formData, "kind") as FileKind;

  await db.uploadedFile.create({
    data: {
      unitId,
      path,
      kind,
      mimeType: "image/*",
      label: "Uploaded asset"
    }
  });

  revalidatePath(`/units/${unitId}`);
}

export async function createDamageAssessmentAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const imagePaths = formData.getAll("imagePaths").map(String);
  const baselinePaths = formData.getAll("baselinePaths").map(String);
  const parsed = damageAssessmentSchema.parse({
    unitId: getString(formData, "unitId"),
    leaseId: getOptionalString(formData, "leaseId"),
    inspectionDate: getString(formData, "inspectionDate"),
    notes: getOptionalString(formData, "notes"),
    imagePaths,
    baselinePaths
  });

  const estimate = generateDamageEstimate({
    notes: parsed.notes,
    imagePaths: parsed.imagePaths,
    baselinePaths: parsed.baselinePaths
  });

  const inspection = await db.inspection.create({
    data: {
      unitId: parsed.unitId,
      leaseId: parsed.leaseId,
      inspectionDate: new Date(parsed.inspectionDate),
      type: "Move-out damage review",
      notes: parsed.notes,
      files: {
        create: [
          ...parsed.imagePaths.map((path) => ({
            path,
            kind: FileKind.MOVE_OUT_IMAGE,
            mimeType: "image/*",
            label: "Inspection upload"
          })),
          ...(parsed.baselinePaths ?? []).map((path) => ({
            path,
            kind: FileKind.MOVE_IN_IMAGE,
            mimeType: "image/*",
            label: "Baseline upload"
          }))
        ]
      }
    }
  });

  await db.damageAssessment.create({
    data: {
      inspectionId: inspection.id,
      createdById: user.id,
      ...estimate,
      files: {
        create: parsed.imagePaths.map((path) => ({
          path,
          kind: FileKind.DAMAGE_IMAGE,
          mimeType: "image/*",
          label: "Assessment image"
        }))
      }
    }
  });

  await db.notification.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      type: "DAMAGE_ASSESSMENT",
      title: "New AI estimate generated",
      body: `${estimate.summary} Estimated range ${estimate.estimatedLow}-${estimate.estimatedHigh}.`
    }
  });

  revalidatePath("/ai-assessments");
  revalidatePath("/dashboard");
  redirect("/ai-assessments");
}
