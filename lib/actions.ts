"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getEffectiveUserRole, isSystemAdminEmail } from "@/lib/admin";
import {
  MAILING_ADDRESS_FORM_FIELDS,
  STANDARD_ADDRESS_FORM_FIELDS,
  readAddressFormData,
  validateAddress,
  validateOptionalAddress
} from "@/lib/address";
import { clearSession, createSession, requireRoles, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendDiscussionMessage } from "@/lib/discussions";
import { sendPasswordResetEmail } from "@/lib/email";
import { ensureLeaseConnectionIntegrity } from "@/lib/lease-connections";
import { hashPassword, verifyPassword } from "@/lib/password";
import { FileKind, UserRole, updateStore, type LeaseStatus, type UnitOccupancyStatus } from "@/lib/store";
import { NEXUS_STRIPE_APPLICATION_FEE_AMOUNT_CENTS, getStripe } from "@/lib/stripe";
import { createStripeExpressAccount, isStripeConnectReady, syncStripeConnectedAccount } from "@/lib/stripe-connect";
import {
  damageAssessmentSchema,
  expenseSchema,
  leaseSchema,
  loginSchema,
  maintenanceSchema,
  paymentSchema,
  propertySchema,
  requestResetSchema,
  resetPasswordSchema,
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

function hasId(items: Array<{ id: string }>, id?: string | null) {
  return Boolean(id && items.some((item) => item.id === id));
}

function getLeaseReturnPath(formData: FormData) {
  const returnTo = getOptionalString(formData, "returnTo");
  return returnTo?.startsWith("/leases/") ? returnTo : "/leases";
}

function getInviteRedirect(formData: FormData) {
  const inviteToken = getOptionalString(formData, "inviteToken");
  return inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : null;
}

function invalidLeasePath(returnTo: string) {
  return returnTo === "/leases" ? "/leases?error=invalid-lease" : `${returnTo}?error=invalid-lease`;
}

function leaseDrivenUnitState(leases: Array<{ status: LeaseStatus }>): { leaseStatus: LeaseStatus; occupancyStatus: UnitOccupancyStatus } {
  if (leases.some((lease) => lease.status === "ACTIVE" || lease.status === "active")) return { leaseStatus: "ACTIVE", occupancyStatus: "OCCUPIED" };
  if (leases.some((lease) => lease.status === "UPCOMING" || lease.status === "invited")) return { leaseStatus: "UPCOMING", occupancyStatus: "VACANT" };
  if (leases.some((lease) => lease.status === "TERMINATED")) return { leaseStatus: "TERMINATED", occupancyStatus: "VACANT" };
  return { leaseStatus: "EXPIRED", occupancyStatus: "VACANT" };
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getAppOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const headerOrigin = host ? `${proto}://${host}` : null;
  const configuredOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL)?.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production" && configuredOrigin) return configuredOrigin;
  return headerOrigin ?? configuredOrigin ?? "http://localhost:3000";
}

function getPaymentMonth(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 7);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getLeaseManager(portal: Awaited<ReturnType<typeof getPortalContext>>, lease: any, payment?: { unitId?: string }) {
  const unit = lease?.unitId
    ? portal.scope.units.find((item) => item.id === lease.unitId)
    : payment?.unitId
      ? portal.scope.units.find((item) => item.id === payment.unitId)
      : null;
  const property = lease?.propertyId
    ? portal.scope.properties.find((item) => item.id === lease.propertyId)
    : unit
      ? portal.scope.properties.find((item) => item.id === unit.propertyId)
      : null;
  const managerId = lease?.managerUserId ?? property?.managerId;
  const candidates = [...portal.users, ...portal.managers];
  return candidates.find((candidate) => candidate.id === managerId) ?? candidates.find((candidate) => candidate.role === UserRole.MANAGER) ?? null;
}

function isStripeConnectSignupError(error: unknown) {
  return error instanceof Error && error.message.includes("signed up for Connect");
}

export async function connectStripeAccountAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const appUrl = await getAppOrigin();
  let accountId = user.stripeConnectedAccountId;
  let accountLinkUrl: string | null = null;

  try {
    if (accountId) {
      await syncStripeConnectedAccount(user);
    } else {
      const account = await createStripeExpressAccount(user);
      accountId = account.id;
    }

    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/transactions?stripe=connect-refresh`,
      return_url: `${appUrl}/api/stripe/connect/return`,
      type: "account_onboarding"
    });
    accountLinkUrl = accountLink.url;
  } catch (error) {
    console.error("[stripe] Failed to start manager Connect onboarding", error);
    if (isStripeConnectSignupError(error)) {
      redirect("/transactions?stripe=connect-not-enabled");
    }
    redirect("/transactions?stripe=connect-error");
  }

  if (!accountLinkUrl) {
    redirect("/transactions?stripe=connect-error");
  }

  redirect(accountLinkUrl);
}

export async function refreshStripeConnectStatusAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  let status = "connect-refreshed";

  try {
    if (!user.stripeConnectedAccountId) {
      status = "connect-required";
    } else {
      const updatedUser = await syncStripeConnectedAccount(user);
      status = isStripeConnectReady(updatedUser) ? "connect-ready" : "connect-incomplete";
    }
  } catch (error) {
    console.error("[stripe] Failed to refresh manager Connect status", error);
    status = "connect-error";
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect(`/transactions?stripe=${status}`);
}

export async function openStripeDashboardAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  let loginUrl: string | null = null;

  if (!user.stripeConnectedAccountId) {
    redirect("/transactions?stripe=connect-required");
  }

  try {
    await syncStripeConnectedAccount(user);
    const loginLink = await getStripe().accounts.createLoginLink(user.stripeConnectedAccountId);
    loginUrl = loginLink.url;
  } catch (error) {
    console.error("[stripe] Failed to open manager Stripe dashboard", error);
    redirect("/transactions?stripe=connect-error");
  }

  if (!loginUrl) {
    redirect("/transactions?stripe=connect-error");
  }

  redirect(loginUrl);
}

export async function signupAction(formData: FormData) {
  const mailingAddressResult = validateOptionalAddress(readAddressFormData(formData, MAILING_ADDRESS_FORM_FIELDS, "mailingAddress"));
  if (!mailingAddressResult.success) {
    redirect("/signup?error=invalid-address");
  }

  const result = signupSchema.safeParse({
    businessName: getString(formData, "businessName"),
    role: getOptionalString(formData, "inviteToken") ? "TENANT" : getString(formData, "role"),
    firstName: getString(formData, "firstName"),
    lastName: getString(formData, "lastName"),
    email: getString(formData, "email"),
    password: getString(formData, "password"),
    confirmPassword: getString(formData, "confirmPassword"),
    phone: getOptionalString(formData, "phone")
  });
  if (!result.success) {
    redirect("/signup?error=invalid-form");
  }

  const parsed = result.data;

  if (isSystemAdminEmail(parsed.email)) {
    redirect("/signup?error=reserved-admin");
  }

  let existingUser;
  try {
    existingUser = await db.user.findUnique({ where: { email: parsed.email } });
  } catch (error) {
    console.error("[auth] Signup database lookup failed", error);
    redirect("/signup?error=server");
  }

  if (existingUser) {
    redirect("/signup?error=account-exists");
  }

  const organization = await db.organization.create({
    data: {
      name: parsed.businessName,
      email: parsed.email,
      phone: parsed.phone,
      mailingAddress: mailingAddressResult.formattedAddress
    }
  });

  const user = await db.user.create({
    data: {
      organizationId: organization.id,
      email: parsed.email,
      passwordHash: await hashPassword(parsed.password),
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      role: parsed.role,
      phone: parsed.phone
    }
  });

  if (parsed.role === UserRole.TENANT) {
    await db.tenant.create({
      data: {
        organizationId: organization.id,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email,
        phone: parsed.phone
      }
    });
  }

  await createSession({
    sub: user.id,
    organizationId: organization.id,
    role: getEffectiveUserRole(user.role, user.email),
    email: user.email
  });

  const inviteRedirect = getInviteRedirect(formData);
  if (inviteRedirect) {
    redirect(inviteRedirect);
  }

  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const result = loginSchema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password")
  });
  if (!result.success) {
    redirect("/login?error=invalid-credentials");
  }

  const parsed = result.data;

  let user;
  try {
    user = await db.user.findUnique({ where: { email: parsed.email } });
  } catch (error) {
    console.error("[auth] Login database lookup failed", error);
    redirect("/login?error=server");
  }

  if (!user || user.isActive === false || !(await verifyPassword(parsed.password, user.passwordHash))) {
    redirect("/login?error=invalid-credentials");
  }

  await createSession({
    sub: user.id,
    organizationId: user.organizationId,
    role: getEffectiveUserRole(user.role, user.email),
    email: user.email
  });

  if (isSystemAdminEmail(user.email)) {
    redirect("/admin");
  }

  const inviteRedirect = getInviteRedirect(formData);
  if (inviteRedirect) {
    redirect(inviteRedirect);
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function requestResetAction(formData: FormData) {
  const result = requestResetSchema.safeParse({
    email: getString(formData, "email")
  });

  if (!result.success) {
    redirect("/forgot-password?error=invalid-email");
  }

  const email = result.data.email;
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    redirect("/forgot-password?success=1");
  }

  const rawToken = randomBytes(32).toString("base64url");
  const origin = await getAppOrigin();
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(rawToken)}`;

  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() }
  });

  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      token: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60)
    }
  });

  let resetEmailSent = false;

  try {
    const emailResult = await sendPasswordResetEmail({
      to: user.email,
      name: user.firstName || "there",
      resetUrl
    });
    resetEmailSent = emailResult.sent;
  } catch (error) {
    console.error("[auth] Password reset email failed", error);
  }

  const devResetLink =
    process.env.NODE_ENV !== "production" && !resetEmailSent
      ? `&devResetLink=${encodeURIComponent(resetUrl)}`
      : "";

  redirect(`/forgot-password?success=1${devResetLink}`);
}

export async function resetPasswordAction(formData: FormData) {
  const result = resetPasswordSchema.safeParse({
    token: getString(formData, "token"),
    password: getString(formData, "password"),
    confirmPassword: getString(formData, "confirmPassword")
  });

  if (!result.success) {
    const token = encodeURIComponent(getString(formData, "token"));
    redirect(`/reset-password?token=${token}&error=invalid-form`);
  }

  const { token, password } = result.data;
  const tokenHash = hashResetToken(token);

  const record =
    (await db.passwordResetToken.findUnique({ where: { token: tokenHash } })) ??
    (await db.passwordResetToken.findUnique({ where: { token } }));
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
  const addressResult = validateAddress(readAddressFormData(formData, STANDARD_ADDRESS_FORM_FIELDS));
  if (!addressResult.success) {
    redirect("/properties?error=invalid-address");
  }

  const result = propertySchema.safeParse({
    name: getString(formData, "name"),
    description: getOptionalString(formData, "description"),
    amenities: getOptionalString(formData, "amenities"),
    notes: getOptionalString(formData, "notes"),
    managerId: getOptionalString(formData, "managerId")
  });
  if (!result.success) {
    redirect("/properties?error=invalid-property");
  }

  const parsed = result.data;
  const address = addressResult.address;
  const imagePaths = formData.getAll("imagePaths").map(String).filter(Boolean);
  const fallbackImagePath = getOptionalString(formData, "imagePath");
  const uploadedPaths = imagePaths.length ? imagePaths : fallbackImagePath ? [fallbackImagePath] : [];

  await db.property.create({
    data: {
      organizationId: user.organizationId,
      ...parsed,
      ...address,
      managerId: user.role === UserRole.MANAGER ? user.id : parsed.managerId,
      amenities: parsed.amenities ?? "",
      files: uploadedPaths.length
        ? {
            create: uploadedPaths.map((path, index) => ({
              kind: FileKind.PROPERTY_IMAGE,
              label: index === 0 ? "Uploaded cover" : "Uploaded property photo",
              path,
              mimeType: "image/*"
            }))
          }
        : undefined
    }
  });

  revalidatePath("/properties");
  revalidatePath("/dashboard");
  redirect("/properties");
}

export async function updatePropertyAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const propertyId = getString(formData, "propertyId");
  const property = portal.scope.properties.find((item) => item.id === propertyId);

  if (!property) {
    redirect("/properties");
  }

  const addressResult = validateAddress(readAddressFormData(formData, STANDARD_ADDRESS_FORM_FIELDS));
  if (!addressResult.success) {
    redirect(`/properties/${propertyId}?error=invalid-address`);
  }

  const result = propertySchema.safeParse({
    name: getString(formData, "name"),
    description: getOptionalString(formData, "description"),
    amenities: getOptionalString(formData, "amenities"),
    notes: getOptionalString(formData, "notes"),
    managerId: getOptionalString(formData, "managerId")
  });
  if (!result.success) {
    redirect(`/properties/${propertyId}?error=invalid-property`);
  }

  const parsed = result.data;
  const address = addressResult.address;
  const imagePaths = formData.getAll("imagePaths").map(String).filter(Boolean);
  const fallbackImagePath = getOptionalString(formData, "imagePath");
  const uploadedPaths = imagePaths.length ? imagePaths : fallbackImagePath ? [fallbackImagePath] : [];

  await db.property.update({
    where: { id: propertyId },
    data: {
      name: parsed.name,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      description: parsed.description,
      amenities: parsed.amenities ?? "",
      notes: parsed.notes,
      ...(user.role === UserRole.ADMIN ? { managerId: parsed.managerId || undefined } : {})
    }
  });

  for (const path of uploadedPaths) {
    await db.uploadedFile.create({
      data: {
        propertyId,
        kind: FileKind.PROPERTY_IMAGE,
        label: "Uploaded property photo",
        path,
        mimeType: "image/*"
      }
    });
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
  redirect(`/properties/${propertyId}`);
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

export async function deletePropertyAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const propertyId = getString(formData, "propertyId");
  const confirmed = getString(formData, "confirmDelete") === "yes";
  const property = portal.scope.properties.find((item) => item.id === propertyId);

  if (!property || !confirmed) {
    redirect(property ? `/properties/${propertyId}` : "/properties");
  }

  await updateStore((store) => {
    const unitIds = store.units.filter((unit) => unit.propertyId === propertyId).map((unit) => unit.id);
    const leaseIds = store.leases
      .filter((lease) => lease.propertyId === propertyId || (lease.unitId ? unitIds.includes(lease.unitId) : false))
      .map((lease) => lease.id);
    const inspectionIds = store.inspections.filter((inspection) => unitIds.includes(inspection.unitId)).map((inspection) => inspection.id);
    const assessmentIds = store.damageAssessments.filter((assessment) => inspectionIds.includes(assessment.inspectionId)).map((assessment) => assessment.id);
    const discussionThreadIds = store.discussionThreads
      .filter((thread) => thread.propertyId === propertyId || leaseIds.includes(thread.leaseId))
      .map((thread) => thread.id);

    return {
      ...store,
      properties: store.properties.filter((item) => item.id !== propertyId),
      units: store.units.filter((unit) => unit.propertyId !== propertyId),
      leases: store.leases.filter((lease) => !leaseIds.includes(lease.id)),
      tenantInvites: store.tenantInvites.filter((invite) => !leaseIds.includes(invite.leaseId)),
      payments: store.payments.filter((payment) => !unitIds.includes(payment.unitId) && (!payment.leaseId || !leaseIds.includes(payment.leaseId))),
      expenses: store.expenses.filter((expense) => expense.propertyId !== propertyId && (!expense.unitId || !unitIds.includes(expense.unitId))),
      maintenanceRequests: store.maintenanceRequests.filter((request) => request.propertyId !== propertyId && (!request.unitId || !unitIds.includes(request.unitId))),
      inspections: store.inspections.filter((inspection) => !inspectionIds.includes(inspection.id)),
      damageAssessments: store.damageAssessments.filter((assessment) => !assessmentIds.includes(assessment.id)),
      discussionThreads: store.discussionThreads.filter((thread) => !discussionThreadIds.includes(thread.id)),
      discussionMessages: store.discussionMessages.filter((message) => !discussionThreadIds.includes(message.threadId)),
      uploadedFiles: store.uploadedFiles.filter((file) => {
        if (file.propertyId === propertyId) return false;
        if (file.unitId && unitIds.includes(file.unitId)) return false;
        if (file.inspectionId && inspectionIds.includes(file.inspectionId)) return false;
        if (file.assessmentId && assessmentIds.includes(file.assessmentId)) return false;
        return true;
      })
    };
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
  redirect("/properties");
}

export async function createUnitAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
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

  if (!hasId(portal.scope.properties, parsed.propertyId)) {
    redirect("/properties");
  }

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
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const result = leaseSchema.safeParse({
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
    documentPath: getOptionalString(formData, "documentPath"),
    status: getString(formData, "status")
  });
  if (!result.success) {
    redirect("/leases?error=invalid-lease");
  }

  const parsed = result.data;

  if (!hasId(portal.scope.units, parsed.unitId) || !hasId(portal.scope.tenants, parsed.tenantId)) {
    redirect("/leases?error=invalid-lease");
  }

  const unit = portal.scope.units.find((item) => item.id === parsed.unitId);
  const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) : null;
  const tenant = portal.scope.tenants.find((item) => item.id === parsed.tenantId);
  const tenantUser = tenant?.email ? portal.users.find((item) => item.email.toLowerCase() === tenant.email?.toLowerCase()) : null;

  await db.lease.create({
    data: {
      nexusLeaseId: `NXR-${Date.now().toString(36).toUpperCase()}`,
      propertyId: property?.id,
      managerUserId: property?.managerId ?? (user.role === UserRole.MANAGER ? user.id : undefined),
      tenantUserId: tenantUser?.id,
      tenantEmail: tenant?.email,
      unitId: parsed.unitId,
      startDate: new Date(parsed.startDate),
      endDate: new Date(parsed.endDate),
      monthlyRent: parsed.monthlyRent,
      dueDay: parsed.dueDay,
      securityDeposit: parsed.securityDeposit,
      recurringCharges: parsed.recurringCharges ?? "",
      lateFeePolicy: parsed.lateFeePolicy,
      notes: parsed.notes,
      documentPath: parsed.documentPath,
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

export async function updateLeaseAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const leaseId = getString(formData, "leaseId");
  const returnTo = getLeaseReturnPath(formData);
  const existingLease = portal.scope.leases.find((lease) => lease.id === leaseId);
  const result = leaseSchema.safeParse({
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
    documentPath: getOptionalString(formData, "documentPath") ?? getOptionalString(formData, "existingDocumentPath"),
    status: getString(formData, "status")
  });

  if (!existingLease || !result.success) {
    redirect(invalidLeasePath(returnTo));
  }

  const parsed = result.data;

  if (!hasId(portal.scope.units, parsed.unitId) || !hasId(portal.scope.tenants, parsed.tenantId)) {
    redirect(invalidLeasePath(returnTo));
  }

  await updateStore((store) => {
    const updatedAt = new Date().toISOString();
    const affectedUnitIds = new Set([existingLease.unitId, parsed.unitId]);
    const updatedUnit = store.units.find((unit) => unit.id === parsed.unitId);
    const updatedProperty = store.properties.find((property) => property.id === updatedUnit?.propertyId);
    const updatedTenant = store.tenants.find((tenant) => tenant.id === parsed.tenantId);
    const updatedTenantUser = updatedTenant?.email
      ? store.users.find((candidate) => candidate.organizationId === user.organizationId && candidate.email.toLowerCase() === updatedTenant.email?.toLowerCase())
      : null;
    const discussionThreadIdsToRemove = store.discussionThreads
      .filter((thread) => thread.leaseId === leaseId && thread.tenantId !== parsed.tenantId)
      .map((thread) => thread.id);
    const leases = store.leases.map((lease) =>
      lease.id === leaseId
        ? {
            ...lease,
            propertyId: updatedProperty?.id ?? lease.propertyId,
            managerUserId: lease.managerUserId ?? updatedProperty?.managerId ?? (user.role === UserRole.MANAGER ? user.id : undefined),
            tenantUserId: updatedTenantUser?.id ?? lease.tenantUserId,
            tenantEmail: updatedTenant?.email ?? lease.tenantEmail,
            unitId: parsed.unitId,
            tenantIds: [parsed.tenantId],
            startDate: new Date(parsed.startDate).toISOString(),
            endDate: new Date(parsed.endDate).toISOString(),
            monthlyRent: parsed.monthlyRent,
            dueDay: parsed.dueDay,
            securityDeposit: parsed.securityDeposit,
            recurringCharges: parsed.recurringCharges ?? "",
            lateFeePolicy: parsed.lateFeePolicy,
            notes: parsed.notes,
            documentPath: parsed.documentPath,
            status: parsed.status,
            updatedAt
          }
        : lease
    );

    return {
      ...store,
      leases,
      units: store.units.map((unit) => {
        if (!affectedUnitIds.has(unit.id)) return unit;
        return {
          ...unit,
          ...leaseDrivenUnitState(leases.filter((lease) => lease.unitId === unit.id)),
          updatedAt
        };
      }),
      payments: store.payments.map((payment) => (payment.leaseId === leaseId ? { ...payment, unitId: parsed.unitId, updatedAt } : payment)),
      inspections: store.inspections.map((inspection) => (inspection.leaseId === leaseId ? { ...inspection, unitId: parsed.unitId, updatedAt } : inspection)),
      discussionThreads: store.discussionThreads
        .filter((thread) => !discussionThreadIdsToRemove.includes(thread.id))
        .map((thread) =>
          thread.leaseId === leaseId
            ? {
                ...thread,
                propertyId: updatedProperty?.id ?? thread.propertyId,
                unitId: updatedUnit?.id,
                updatedAt
              }
            : thread
        ),
      discussionMessages: store.discussionMessages.filter((message) => !discussionThreadIdsToRemove.includes(message.threadId))
    };
  });

  revalidatePath("/leases");
  revalidatePath(returnTo);
  revalidatePath("/dashboard");
  redirect(returnTo);
}

export async function deleteLeaseAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const leaseId = getString(formData, "leaseId");
  const returnTo = getLeaseReturnPath(formData);
  const confirmed = getString(formData, "confirmDelete") === "yes";
  const existingLease = portal.scope.leases.find((lease) => lease.id === leaseId);

  if (!existingLease || !confirmed) {
    redirect(returnTo);
  }

  await updateStore((store) => {
    const updatedAt = new Date().toISOString();
    const leases = store.leases.filter((lease) => lease.id !== leaseId);
    const discussionThreadIds = store.discussionThreads.filter((thread) => thread.leaseId === leaseId).map((thread) => thread.id);

    return {
      ...store,
      leases,
      units: store.units.map((unit) => {
        if (unit.id !== existingLease.unitId) return unit;
        return {
          ...unit,
          ...leaseDrivenUnitState(leases.filter((lease) => lease.unitId === unit.id)),
          updatedAt
        };
      }),
      payments: store.payments.map((payment) => (payment.leaseId === leaseId ? { ...payment, leaseId: undefined, updatedAt } : payment)),
      inspections: store.inspections.map((inspection) => (inspection.leaseId === leaseId ? { ...inspection, leaseId: undefined, updatedAt } : inspection)),
      discussionThreads: store.discussionThreads.filter((thread) => !discussionThreadIds.includes(thread.id)),
      discussionMessages: store.discussionMessages.filter((message) => !discussionThreadIds.includes(message.threadId))
    };
  });

  revalidatePath("/leases");
  revalidatePath(returnTo);
  revalidatePath("/dashboard");
  redirect("/leases");
}

export async function createPaymentAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
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

  const selectedLease = parsed.leaseId ? portal.scope.leases.find((lease) => lease.id === parsed.leaseId) : null;
  const paymentUnitId = selectedLease?.unitId ?? parsed.unitId;

  if (!hasId(portal.scope.units, paymentUnitId) || (parsed.leaseId && !selectedLease)) {
    redirect("/transactions");
  }

  const inferredLease = selectedLease
    ? selectedLease
    : portal.scope.leases
        .filter((lease) => lease.unitId === paymentUnitId && ["ACTIVE", "UPCOMING", "active", "invited"].includes(lease.status))
        .sort((a, b) => (b.startDate ?? b.createdAt ?? "").localeCompare(a.startDate ?? a.createdAt ?? ""))[0];

  await db.payment.create({
    data: {
      unitId: paymentUnitId,
      leaseId: inferredLease?.id,
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

  if (inferredLease?.tenantUserId && parsed.status !== "PAID") {
    await db.notification.create({
      data: {
        organizationId: user.organizationId,
        userId: inferredLease.tenantUserId,
        type: "RENT_DUE",
        title: "Rent payment requested",
        body: `${parsed.description} for $${parsed.amount.toFixed(2)} is ready to pay online.`,
        href: "/transactions"
      }
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect(inferredLease ? "/transactions?stripe=payment-linked" : "/transactions?stripe=payment-unlinked");
}

export async function linkRentPaymentsToLeasesAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  await ensureLeaseConnectionIntegrity(user.organizationId);

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/leases");
  redirect("/transactions?stripe=payments-linked");
}

export async function createExpenseAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
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

  if (!hasId(portal.scope.properties, parsed.propertyId) || (parsed.unitId && !hasId(portal.scope.units, parsed.unitId))) {
    redirect("/expenses");
  }
  if (parsed.unitId && portal.scope.units.find((unit) => unit.id === parsed.unitId)?.propertyId !== parsed.propertyId) {
    redirect("/expenses");
  }

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
  const portal = await getPortalContext(user);
  const result = maintenanceSchema.safeParse({
    propertyId: getString(formData, "propertyId"),
    unitId: getOptionalString(formData, "unitId"),
    title: getString(formData, "title"),
    description: getString(formData, "description"),
    category: getOptionalString(formData, "category"),
    location: getOptionalString(formData, "location"),
    issueStartedAt: getOptionalString(formData, "issueStartedAt"),
    entryPermission: getOptionalString(formData, "entryPermission"),
    accessNotes: getOptionalString(formData, "accessNotes"),
    contactPreference: getOptionalString(formData, "contactPreference"),
    contactName: getOptionalString(formData, "contactName"),
    contactPhone: getOptionalString(formData, "contactPhone"),
    preferredWindow: getOptionalString(formData, "preferredWindow"),
    safetyConcern: getOptionalString(formData, "safetyConcern"),
    petsOnSite: getOptionalString(formData, "petsOnSite"),
    imagePaths: formData.getAll("imagePaths").map(String).filter(Boolean).slice(0, 3),
    status: getString(formData, "status"),
    priority: getString(formData, "priority"),
    estimatedCost: getOptionalString(formData, "estimatedCost"),
    actualCost: getOptionalString(formData, "actualCost"),
    assignedTo: getOptionalString(formData, "assignedTo"),
    timeline: getOptionalString(formData, "timeline")
  });
  if (!result.success) {
    redirect("/maintenance?error=invalid-maintenance");
  }

  const parsed = result.data;

  if (!hasId(portal.scope.properties, parsed.propertyId) || (parsed.unitId && !hasId(portal.scope.units, parsed.unitId))) {
    redirect("/maintenance?error=invalid-maintenance");
  }
  if (parsed.unitId && portal.scope.units.find((unit) => unit.id === parsed.unitId)?.propertyId !== parsed.propertyId) {
    redirect("/maintenance?error=invalid-maintenance");
  }

  await db.maintenanceRequest.create({
    data: {
      ...parsed,
      unitId: parsed.unitId || null,
      entryPermission: parsed.entryPermission ?? "REQUEST_APPROVAL",
      contactPreference: parsed.contactPreference ?? "APP",
      safetyConcern: parsed.safetyConcern ?? "NO",
      petsOnSite: parsed.petsOnSite ?? "UNKNOWN",
      status: user.role === UserRole.TENANT ? "OPEN" : parsed.status,
      estimatedCost: parsed.estimatedCost ?? null,
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
  const mailingAddressResult = validateOptionalAddress(readAddressFormData(formData, MAILING_ADDRESS_FORM_FIELDS, "mailingAddress"));
  if (!mailingAddressResult.success) {
    redirect("/settings?error=invalid-address");
  }

  const result = settingsSchema.safeParse({
    name: getString(formData, "name"),
    email: getString(formData, "email"),
    phone: getOptionalString(formData, "phone")
  });
  if (!result.success) {
    redirect("/settings?error=invalid-settings");
  }

  const parsed = result.data;

  await db.organization.update({
    where: { id: user.organizationId },
    data: {
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      mailingAddress: mailingAddressResult.formattedAddress
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

export async function createStripeCheckoutAction(formData: FormData) {
  const user = await requireRoles([UserRole.TENANT]);
  const paymentId = getString(formData, "paymentId");
  const portal = await getPortalContext(user);
  const payment = portal.scope.payments.find((item) => item.id === paymentId);

  if (!payment) {
    redirect("/transactions?stripe=invalid-payment");
  }

  if (payment.status === "PAID") {
    redirect("/transactions?stripe=already-paid");
  }

  const lease =
    payment.leaseId
      ? portal.scope.leases.find((item) => item.id === payment.leaseId)
      : portal.currentLease?.unitId === payment.unitId
        ? portal.currentLease
        : portal.scope.leases.find((item) =>
            item.unitId === payment.unitId && ["ACTIVE", "UPCOMING", "active", "invited"].includes(item.status)
          );
  const leaseId = lease?.id;

  const manager = getLeaseManager(portal, lease, payment);
  let connectedManager = manager;
  let stripeDestinationAccountId: string | undefined;
  let applicationFeeAmountCents = 0;

  if (manager?.stripeConnectedAccountId) {
    try {
      connectedManager = await syncStripeConnectedAccount(manager);
    } catch (error) {
      console.error("[stripe] Failed to verify manager Connect account before checkout; falling back to platform Checkout", error);
    }

    if (isStripeConnectReady(connectedManager)) {
      stripeDestinationAccountId = connectedManager?.stripeConnectedAccountId;
      applicationFeeAmountCents = NEXUS_STRIPE_APPLICATION_FEE_AMOUNT_CENTS;
    }
  }

  const amountDue = payment.balanceDue || payment.amount;
  const amountCents = Math.round(amountDue * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    redirect("/transactions?stripe=invalid-amount");
  }
  if (applicationFeeAmountCents > 0 && amountCents <= applicationFeeAmountCents) {
    redirect("/transactions?stripe=amount-below-platform-fee");
  }

  const paymentMonth = getPaymentMonth(payment.dueDate);
  const appUrl = await getAppOrigin();

  if (
    (!payment.leaseId && leaseId) ||
    payment.stripeDestinationAccountId !== stripeDestinationAccountId ||
    payment.stripeApplicationFeeAmountCents !== applicationFeeAmountCents
  ) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        ...(!payment.leaseId && leaseId ? { leaseId } : {}),
        stripeDestinationAccountId,
        stripeApplicationFeeAmountCents: applicationFeeAmountCents
      }
    });
  }

  const metadata = {
    source: "nexus_rent_payment",
    organizationId: user.organizationId,
    paymentId: payment.id,
    userId: user.id,
    tenantId: portal.currentTenant?.id ?? "",
    managerUserId: connectedManager?.id ?? "",
    stripeDestinationAccountId: stripeDestinationAccountId ?? "",
    applicationFeeAmountCents: String(applicationFeeAmountCents),
    leaseId: leaseId ?? "",
    unitId: payment.unitId,
    paymentMonth,
    amountCents: String(amountCents)
  };

  let sessionUrl: string | null = null;
  const paymentIntentData: any = { metadata };

  if (stripeDestinationAccountId) {
    paymentIntentData.application_fee_amount = applicationFeeAmountCents;
    paymentIntentData.transfer_data = {
      destination: stripeDestinationAccountId
    };
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: payment.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: payment.description || `Rent payment ${paymentMonth}`,
              description: `Rent for unit ${payment.unitId} (${paymentMonth})`
            }
          }
        }
      ],
      metadata,
      payment_intent_data: paymentIntentData,
      success_url: `${appUrl}/transactions?stripe=success&payment=${encodeURIComponent(payment.id)}`,
      cancel_url: `${appUrl}/transactions?stripe=cancelled&payment=${encodeURIComponent(payment.id)}`
    });

    sessionUrl = session.url;
  } catch (error) {
    console.error("[stripe] Failed to create checkout session", error);
    redirect("/transactions?stripe=checkout-error");
  }

  if (!sessionUrl) {
    redirect("/transactions?stripe=missing-session-url");
  }

  redirect(sessionUrl);
}

export async function addUnitAssetAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const unitId = getString(formData, "unitId");
  const path = getString(formData, "path");
  const kind = getString(formData, "kind") as FileKind;

  if (!hasId(portal.scope.units, unitId) || !path) {
    redirect("/properties");
  }

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
  const portal = await getPortalContext(user);
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

  if (!hasId(portal.scope.units, parsed.unitId) || (parsed.leaseId && !hasId(portal.scope.leases, parsed.leaseId))) {
    redirect("/ai-assessments");
  }
  if (parsed.leaseId && portal.scope.leases.find((lease) => lease.id === parsed.leaseId)?.unitId !== parsed.unitId) {
    redirect("/ai-assessments");
  }

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

export async function sendDiscussionMessageAction(formData: FormData) {
  const user = await requireRoles([UserRole.MANAGER, UserRole.TENANT]);
  const leaseId = getString(formData, "leaseId");
  const tenantId = getString(formData, "tenantId");
  const conversationKey = getString(formData, "conversationKey");
  const body = getString(formData, "body");
  let result: Awaited<ReturnType<typeof sendDiscussionMessage>>;

  try {
    result = await sendDiscussionMessage({ user, leaseId, tenantId, body });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send message.";
    const suffix = conversationKey ? `&conversation=${encodeURIComponent(conversationKey)}` : "";
    redirect(`/messages?error=${encodeURIComponent(message)}${suffix}`);
  }

  revalidatePath("/messages");
  revalidatePath("/dashboard");
  redirect(`/messages?conversation=${encodeURIComponent(result.conversationKey)}`);
}
