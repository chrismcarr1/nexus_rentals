"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getEffectiveUserRole, isSystemAdminEmail, normalizeEmail } from "@/lib/admin";
import {
  applicationStatusLabels,
  getApplicationAddressLabel,
  getApplicationBundle,
  getSubmissionBundle,
  managerOwnsApplication,
  primaryApplicant,
  publicApplicationPath
} from "@/lib/applications";
import {
  MAILING_ADDRESS_FORM_FIELDS,
  STANDARD_ADDRESS_FORM_FIELDS,
  formatUnitAddress,
  readAddressFormData,
  validateAddress,
  validateOptionalAddress
} from "@/lib/address";
import { appDateKeyFromValue, dateOnlyToUtcNoonIso, DEFAULT_RENT_DUE_TIME, getAppDateKey, monthKeyFromValue, normalizeRentDueTime } from "@/lib/app-time";
import { clearSession, createSession, requireRoles, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendDiscussionMessage } from "@/lib/discussions";
import { sendPasswordResetEmail } from "@/lib/email";
import { filterSubmittedAssetPaths, isAllowedStoredAssetPath, isAllowedSubmittedAssetPath } from "@/lib/file-security";
import { ensureLeaseConnectionIntegrity, getUnitAvailableStartDate, isActiveLeaseStatus, leaseBlocksNewMoveIn, leaseCanResumeMoveIn } from "@/lib/lease-connections";
import { ensureScheduledLeasePayments } from "@/lib/lease-payment-scheduler";
import { hashPassword, verifyPassword } from "@/lib/password";
import { formatPhoneNumber } from "@/lib/phone";
import { recordPlatformEvent } from "@/lib/platform-events";
import { buildAppUrl, getAppBaseUrl } from "@/lib/request-origin";
import { ensureApplicantPortalAccess } from "@/lib/screening/service";
import { FileKind, UserRole, createId, nowIso, updateStore, type LeaseStatus, type UnitOccupancyStatus } from "@/lib/store";
import { NEXUS_STRIPE_APPLICATION_FEE_AMOUNT_CENTS, getStripe } from "@/lib/stripe";
import { createStripeExpressAccount, getStripeAccountId, getStripeConnectRedirectStatus, isStripeConnectReady, syncStripeConnectedAccount } from "@/lib/stripe-connect";
import { sendLeaseTenantInvite } from "@/lib/tenant-invite-delivery";
import {
  damageAssessmentSchema,
  expenseSchema,
  applicationSubmissionSchema,
  leaseSchema,
  loginSchema,
  maintenanceSchema,
  paymentEditSchema,
  newMoveInSchema,
  paymentSchema,
  propertySchema,
  rentalApplicationSchema,
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

function getTransactionsReturnPath(formData: FormData) {
  const value = getOptionalString(formData, "returnTo");
  return value?.startsWith("/transactions") ? value : "/transactions";
}

function readAssetPaths(formData: FormData, key: string) {
  return formData.getAll(key).map(String).map((value) => value.trim()).filter(Boolean);
}

function requireSubmittedAssetPaths(formData: FormData, key: string, user: { id: string; organizationId: string }, errorPath: string, max = 12) {
  const rawPaths = readAssetPaths(formData, key);
  if (rawPaths.length > max || rawPaths.some((path) => !isAllowedSubmittedAssetPath(path, user))) {
    redirect(errorPath);
  }
  return filterSubmittedAssetPaths(rawPaths, user, max);
}

function requireOptionalSubmittedAssetPath(value: string | undefined, user: { id: string; organizationId: string }, errorPath: string) {
  if (!value) return undefined;
  if (!isAllowedSubmittedAssetPath(value, user)) {
    redirect(errorPath);
  }
  return value.trim();
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

function getBoolean(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  return value === "true" || value === "on" || value === "1";
}

function getStringList(formData: FormData, key: string) {
  return formData.getAll(key).map(String).map((value) => value.trim()).filter(Boolean);
}

function createPublicSlug() {
  return randomBytes(18).toString("base64url");
}

function toIsoDate(value: string) {
  return dateOnlyToUtcNoonIso(value);
}

function dateOnlyTime(value: string | Date) {
  return appDateKeyFromValue(value);
}

function getMoveInLeaseStatus(startDate: string): LeaseStatus {
  return dateOnlyTime(startDate) <= getAppDateKey() ? "ACTIVE" : "UPCOMING";
}

function isUnitReserved(status: string) {
  return isActiveLeaseStatus(status) || status === "draft";
}

function getNextNexusLeaseId(existingIds: string[], nextIndex: number) {
  let index = nextIndex;
  let candidate = `NXR-${String(index).padStart(5, "0")}`;
  while (existingIds.includes(candidate)) {
    index += 1;
    candidate = `NXR-${String(index).padStart(5, "0")}`;
  }
  return candidate;
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getPaymentMonth(value: string | Date) {
  return monthKeyFromValue(value);
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
  return managerId ? candidates.find((candidate) => candidate.id === managerId) ?? null : null;
}

function getTenantUserForPayment(
  portal: Awaited<ReturnType<typeof getPortalContext>>,
  payment: { tenantId?: string; leaseId?: string },
  fallbackTenant?: { email?: string | null } | null
) {
  const lease = payment.leaseId ? portal.scope.leases.find((item) => item.id === payment.leaseId) ?? null : null;
  const tenant =
    fallbackTenant ??
    (payment.tenantId ? portal.scope.tenants.find((item) => item.id === payment.tenantId) ?? null : null) ??
    (lease?.tenantIds?.[0] ? portal.scope.tenants.find((item) => item.id === lease.tenantIds[0]) ?? null : null);

  return lease?.tenantUserId
    ? portal.users.find((candidate) => candidate.id === lease.tenantUserId) ?? null
    : tenant?.email
      ? portal.users.find((candidate) => candidate.role === UserRole.TENANT && normalizeEmail(candidate.email) === normalizeEmail(tenant.email ?? "")) ?? null
      : null;
}

function isStripeConnectSignupError(error: unknown) {
  return error instanceof Error && error.message.includes("signed up for Connect");
}

export async function connectStripeAccountAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const appUrl = getAppBaseUrl();
  let accountId = getStripeAccountId(user);
  let accountLinkUrl: string | null = null;

  try {
    if (accountId) {
      console.log("[stripe-connect] Reusing existing connected account for onboarding link", { userId: user.id, accountId });
      await syncStripeConnectedAccount(user);
    } else {
      const account = await createStripeExpressAccount(user);
      accountId = account.id;
    }

    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/settings?stripe=connect-refresh#payments-stripe`,
      return_url: `${appUrl}/api/stripe/connect/return`,
      type: "account_onboarding"
    });
    await recordPlatformEvent({
      type: "STRIPE_SETUP_STARTED",
      category: "connect_onboarding",
      status: "info",
      organizationId: user.organizationId,
      userId: user.id,
      relatedId: accountId,
      message: "Stripe Connect onboarding link created."
    });
    console.log("[stripe-connect] Created onboarding account link", { userId: user.id, accountId });
    accountLinkUrl = accountLink.url;
  } catch (error) {
    console.error("[stripe] Failed to start manager Connect onboarding", error);
    if (isStripeConnectSignupError(error)) {
      redirect("/settings?stripe=connect-not-enabled#payments-stripe");
    }
    redirect("/settings?stripe=connect-error#payments-stripe");
  }

  if (!accountLinkUrl) {
    redirect("/settings?stripe=connect-error#payments-stripe");
  }

  redirect(accountLinkUrl);
}

export async function refreshStripeConnectStatusAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  let status = "connect-refreshed";

  try {
    if (!getStripeAccountId(user)) {
      status = "connect-required";
    } else {
      const updatedUser = await syncStripeConnectedAccount(user);
      status = getStripeConnectRedirectStatus(updatedUser);
    }
  } catch (error) {
    console.error("[stripe] Failed to refresh manager Connect status", error);
    status = "connect-error";
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  redirect(`/settings?stripe=${status}#payments-stripe`);
}

export async function openStripeDashboardAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  let loginUrl: string | null = null;
  const accountId = getStripeAccountId(user);

  if (!accountId) {
    redirect("/settings?stripe=connect-required#payments-stripe");
  }

  try {
    await syncStripeConnectedAccount(user);
    const loginLink = await getStripe().accounts.createLoginLink(accountId);
    loginUrl = loginLink.url;
  } catch (error) {
    console.error("[stripe] Failed to open manager Stripe dashboard", error);
    redirect("/settings?stripe=connect-error#payments-stripe");
  }

  if (!loginUrl) {
    redirect("/settings?stripe=connect-error#payments-stripe");
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
      phone: parsed.phone,
      lastLoginAt: nowIso()
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

  const loggedInAt = nowIso();
  user = await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: loggedInAt }
  });

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
  const resetUrl = buildAppUrl("/reset-password", { token: rawToken });

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

  await recordPlatformEvent({
    type: "PASSWORD_RESET_REQUESTED",
    category: "password_reset",
    status: "info",
    organizationId: user.organizationId,
    userId: user.id,
    message: "Password reset requested."
  });

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.firstName || "there",
      resetUrl,
      organizationId: user.organizationId,
      userId: user.id
    });
  } catch (error) {
    console.error("[auth] Password reset email failed", error);
  }

  redirect("/forgot-password?success=1");
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

  const record = await db.passwordResetToken.findUnique({ where: { token: tokenHash } });
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
  const imagePaths = requireSubmittedAssetPaths(formData, "imagePaths", user, "/properties?error=invalid-upload");
  const fallbackImagePath = requireOptionalSubmittedAssetPath(getOptionalString(formData, "imagePath"), user, "/properties?error=invalid-upload");
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
  const imagePaths = requireSubmittedAssetPaths(formData, "imagePaths", user, `/properties/${propertyId}?error=invalid-upload`);
  const fallbackImagePath = requireOptionalSubmittedAssetPath(getOptionalString(formData, "imagePath"), user, `/properties/${propertyId}?error=invalid-upload`);
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
  const imagePath = requireOptionalSubmittedAssetPath(getOptionalString(formData, "imagePath"), user, "/properties?error=invalid-upload");

  if (!hasId(portal.scope.properties, parsed.propertyId)) {
    redirect("/properties");
  }

  const duplicate = portal.scope.units.some(
    (u) => u.propertyId === parsed.propertyId && u.unitNumber.trim().toLowerCase() === parsed.unitNumber.trim().toLowerCase()
  );
  if (duplicate) {
    redirect(`/properties/${parsed.propertyId}?error=duplicate-unit#add-unit`);
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

export async function createRentalApplicationAction(formData: FormData) {
  const user = await requireRoles([UserRole.MANAGER]);
  const result = rentalApplicationSchema.safeParse({
    title: getString(formData, "title"),
    propertyId: getString(formData, "propertyId"),
    unitId: getOptionalString(formData, "unitId"),
    monthlyRent: getString(formData, "monthlyRent"),
    securityDeposit: getString(formData, "securityDeposit"),
    availableMoveInDate: getString(formData, "availableMoveInDate"),
    applicationFee: getString(formData, "applicationFee"),
    requiredFields: getStringList(formData, "requiredFields"),
    requiredDocuments: getStringList(formData, "requiredDocuments"),
    screeningQuestions: getStringList(formData, "screeningQuestions"),
    allowCoApplicants: getBoolean(formData, "allowCoApplicants"),
    allowPets: getBoolean(formData, "allowPets"),
    publishNow: getString(formData, "intent") === "publish"
  });

  if (!result.success) {
    redirect("/applications/new?error=invalid");
  }

  const parsed = result.data;
  let applicationId = "";

  try {
    await updateStore((store) => {
      const property = store.properties.find(
        (item) => item.id === parsed.propertyId && item.organizationId === user.organizationId && item.managerId === user.id
      );
      if (!property) throw new Error("Property not found in your manager portfolio.");

      const unit = parsed.unitId ? store.units.find((item) => item.id === parsed.unitId && item.propertyId === property.id) : null;
      if (parsed.unitId && !unit) throw new Error("Unit not found for this property.");

      const now = nowIso();
      const id = createId("app");
      applicationId = id;
      const application = {
        id,
        organizationId: user.organizationId,
        managerUserId: user.id,
        propertyId: property.id,
        unitId: unit?.id,
        publicSlug: createPublicSlug(),
        title: parsed.title,
        monthlyRent: parsed.monthlyRent,
        securityDeposit: parsed.securityDeposit,
        availableMoveInDate: toIsoDate(parsed.availableMoveInDate),
        applicationFee: parsed.applicationFee,
        requiredFields: Array.from(new Set(parsed.requiredFields)),
        allowCoApplicants: parsed.allowCoApplicants,
        allowPets: parsed.allowPets,
        status: parsed.publishNow ? "PUBLISHED" as const : "DRAFT" as const,
        publishedAt: parsed.publishNow ? now : undefined,
        createdAt: now,
        updatedAt: now
      };
      const questions = parsed.screeningQuestions.map((prompt, index) => ({
        id: createId("appq"),
        applicationId: id,
        prompt,
        required: true,
        sortOrder: index,
        createdAt: now,
        updatedAt: now
      }));
      const documents = parsed.requiredDocuments.map((label) => ({
        id: createId("appdoc"),
        applicationId: id,
        label,
        required: true,
        status: "REQUESTED" as const,
        createdAt: now,
        updatedAt: now
      }));

      return {
        ...store,
        rentalApplications: [...store.rentalApplications, application],
        applicationQuestions: [...store.applicationQuestions, ...questions],
        applicationDocuments: [...store.applicationDocuments, ...documents]
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the application.";
    redirect(`/applications/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/applications");
  redirect(`/applications/${applicationId}?created=1`);
}

export async function updateRentalApplicationPublicationAction(formData: FormData) {
  const user = await requireRoles([UserRole.MANAGER]);
  const applicationId = getString(formData, "applicationId");
  const intent = getString(formData, "intent");

  await updateStore((store) => {
    const application = store.rentalApplications.find((item) => item.id === applicationId);
    if (!application || !managerOwnsApplication(store, user, application)) {
      throw new Error("Application not found.");
    }
    const now = nowIso();
    const status = intent === "publish" ? "PUBLISHED" as const : "DRAFT" as const;
    return {
      ...store,
      rentalApplications: store.rentalApplications.map((item) =>
        item.id === application.id
          ? {
              ...item,
              status,
              publishedAt: status === "PUBLISHED" ? item.publishedAt ?? now : item.publishedAt,
              updatedAt: now
            }
          : item
      )
    };
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  redirect(`/applications/${applicationId}?updated=1`);
}

export async function submitRentalApplicationAction(formData: FormData) {
  const publicSlug = getString(formData, "publicSlug");
  let redirectSlug = publicSlug;
  let submittedId = "";

  try {
    await updateStore((store) => {
      const application = store.rentalApplications.find((item) => item.publicSlug === publicSlug && item.status === "PUBLISHED");
      if (!application) throw new Error("This application is no longer accepting submissions.");

      const questions = store.applicationQuestions
        .filter((question) => question.applicationId === application.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const requiredDocuments = store.applicationDocuments.filter((document) => document.applicationId === application.id && !document.submissionId);
      const questionAnswers = questions.map((question) => ({
        questionId: question.id,
        prompt: question.prompt,
        answer: getString(formData, `question_${question.id}`).trim()
      }));
      const result = applicationSubmissionSchema.safeParse({
        publicSlug,
        firstName: getString(formData, "firstName"),
        lastName: getString(formData, "lastName"),
        email: getString(formData, "email"),
        phone: getOptionalString(formData, "phone"),
        dateOfBirth: getOptionalString(formData, "dateOfBirth"),
        currentAddress: getOptionalString(formData, "currentAddress"),
        monthlyIncome: getOptionalString(formData, "monthlyIncome"),
        employment: getOptionalString(formData, "employment"),
        rentalHistory: getOptionalString(formData, "rentalHistory"),
        references: getOptionalString(formData, "references"),
        pets: getOptionalString(formData, "pets"),
        vehicles: getOptionalString(formData, "vehicles"),
        coApplicantFirstName: getOptionalString(formData, "coApplicantFirstName"),
        coApplicantLastName: getOptionalString(formData, "coApplicantLastName"),
        coApplicantEmail: getOptionalString(formData, "coApplicantEmail"),
        coApplicantPhone: getOptionalString(formData, "coApplicantPhone"),
        documentNotes: getOptionalString(formData, "documentNotes"),
        authorizationAccepted: getBoolean(formData, "authorizationAccepted"),
        questionAnswers
      });

      if (!result.success) throw new Error("Review the required application fields.");
      const parsed = result.data;
      const requiredFields = new Set(application.requiredFields);
      const missingRequired =
        (requiredFields.has("phone") && !parsed.phone) ||
        (requiredFields.has("currentAddress") && !parsed.currentAddress) ||
        (requiredFields.has("employment") && !parsed.employment) ||
        (requiredFields.has("income") && !parsed.monthlyIncome) ||
        (requiredFields.has("rentalHistory") && !parsed.rentalHistory) ||
        (requiredFields.has("references") && !parsed.references) ||
        (application.allowPets && requiredFields.has("pets") && !parsed.pets);
      if (missingRequired) throw new Error("Complete all required application sections.");
      if (!parsed.authorizationAccepted) throw new Error("Authorization is required before submitting.");
      if (questions.some((question) => question.required && !questionAnswers.find((answer) => answer.questionId === question.id)?.answer)) {
        throw new Error("Answer all required screening questions.");
      }

      const now = nowIso();
      const submissionId = createId("appsub");
      submittedId = submissionId;
      const primaryApplicant = {
        id: createId("applicant"),
        submissionId,
        type: "PRIMARY" as const,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: normalizeEmail(parsed.email),
        phone: parsed.phone,
        dateOfBirth: parsed.dateOfBirth,
        createdAt: now,
        updatedAt: now
      };
      const coApplicant =
        application.allowCoApplicants && parsed.coApplicantFirstName && parsed.coApplicantLastName && parsed.coApplicantEmail
          ? {
              id: createId("applicant"),
              submissionId,
              type: "CO_APPLICANT" as const,
              firstName: parsed.coApplicantFirstName,
              lastName: parsed.coApplicantLastName,
              email: normalizeEmail(parsed.coApplicantEmail),
              phone: parsed.coApplicantPhone,
              createdAt: now,
              updatedAt: now
            }
          : null;
      const submission = {
        id: submissionId,
        applicationId: application.id,
        organizationId: application.organizationId,
        managerUserId: application.managerUserId,
        propertyId: application.propertyId,
        unitId: application.unitId,
        status: "SUBMITTED" as const,
        feeStatus: application.applicationFee > 0 ? "UNPAID" as const : "NOT_REQUIRED" as const,
        submittedAt: now,
        currentAddress: parsed.currentAddress,
        monthlyIncome: parsed.monthlyIncome,
        employment: parsed.employment,
        rentalHistory: parsed.rentalHistory,
        references: parsed.references,
        pets: application.allowPets ? parsed.pets : undefined,
        vehicles: parsed.vehicles,
        documentNotes: parsed.documentNotes,
        authorizationAccepted: parsed.authorizationAccepted,
        answers: questionAnswers,
        createdAt: now,
        updatedAt: now
      };
      const submittedDocuments = requiredDocuments.map((document) => ({
        id: createId("appdoc"),
        applicationId: application.id,
        submissionId,
        label: document.label,
        required: document.required,
        status: "REQUESTED" as const,
        notes: parsed.documentNotes,
        createdAt: now,
        updatedAt: now
      }));

      redirectSlug = application.publicSlug;

      return {
        ...store,
        applicationSubmissions: [...store.applicationSubmissions, submission],
        applicationApplicants: [...store.applicationApplicants, primaryApplicant, ...(coApplicant ? [coApplicant] : [])],
        applicationDocuments: [...store.applicationDocuments, ...submittedDocuments],
        notifications: [
          ...store.notifications,
          {
            id: createId("note"),
            organizationId: application.organizationId,
            userId: application.managerUserId,
            type: "SYSTEM" as const,
            title: "New rental application submitted",
            body: `${primaryApplicant.firstName} ${primaryApplicant.lastName} submitted ${application.title}.`,
            href: `/applications/${application.id}/submissions/${submissionId}`,
            isRead: false,
            createdAt: now
          }
        ]
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit the application.";
    redirect(`/apply/${encodeURIComponent(redirectSlug)}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/applications");
  if (submittedId) {
    let screeningAccessPath = "";
    try {
      const access = await ensureApplicantPortalAccess(submittedId);
      screeningAccessPath = access.path;
    } catch (error) {
      console.warn("[screening] Application was submitted, but the screening portal could not be provisioned.", {
        submissionId: submittedId,
        error: error instanceof Error ? error.message : "Unknown screening portal error"
      });
    }
    if (screeningAccessPath) redirect(screeningAccessPath);
  }
  redirect(`/apply/${encodeURIComponent(redirectSlug)}?submitted=1`);
}

export async function updateApplicationSubmissionStatusAction(formData: FormData) {
  const user = await requireRoles([UserRole.MANAGER]);
  const applicationId = getString(formData, "applicationId");
  const submissionId = getString(formData, "submissionId");
  const status = getString(formData, "status");
  const note = getOptionalString(formData, "note");
  const allowedStatuses = new Set(["UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN", "CONVERTED_TO_LEASE"]);

  if (!allowedStatuses.has(status)) {
    redirect(`/applications/${applicationId}/submissions/${submissionId}?error=invalid-status`);
  }

  await updateStore((store) => {
    const bundle = getSubmissionBundle(store, submissionId);
    if (!bundle || bundle.application.id !== applicationId || !managerOwnsApplication(store, user, bundle.application)) {
      throw new Error("Application submission not found.");
    }
    const now = nowIso();
    return {
      ...store,
      applicationSubmissions: store.applicationSubmissions.map((submission) =>
        submission.id === submissionId ? { ...submission, status: status as any, updatedAt: now } : submission
      ),
      applicationNotes: note
        ? [
            ...store.applicationNotes,
            {
              id: createId("appnote"),
              applicationId,
              submissionId,
              managerUserId: user.id,
              body: note,
              createdAt: now
            }
          ]
        : store.applicationNotes
    };
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/applications/${applicationId}/submissions/${submissionId}`);
  redirect(`/applications/${applicationId}/submissions/${submissionId}?updated=1`);
}

export async function addApplicationNoteAction(formData: FormData) {
  const user = await requireRoles([UserRole.MANAGER]);
  const applicationId = getString(formData, "applicationId");
  const submissionId = getString(formData, "submissionId");
  const body = getString(formData, "body").trim();

  if (!body) {
    redirect(`/applications/${applicationId}/submissions/${submissionId}`);
  }

  await updateStore((store) => {
    const bundle = getSubmissionBundle(store, submissionId);
    if (!bundle || bundle.application.id !== applicationId || !managerOwnsApplication(store, user, bundle.application)) {
      throw new Error("Application submission not found.");
    }
    return {
      ...store,
      applicationNotes: [
        ...store.applicationNotes,
        {
          id: createId("appnote"),
          applicationId,
          submissionId,
          managerUserId: user.id,
          body,
          createdAt: nowIso()
        }
      ]
    };
  });

  revalidatePath(`/applications/${applicationId}/submissions/${submissionId}`);
  redirect(`/applications/${applicationId}/submissions/${submissionId}?note=added`);
}

export async function createMoveInAction(formData: FormData) {
  const user = await requireRoles([UserRole.MANAGER]);
  const documentPath = requireOptionalSubmittedAssetPath(
    getOptionalString(formData, "documentPath"),
    user,
    `/move-ins/new?error=${encodeURIComponent("The lease agreement upload is invalid. Upload it again and retry.")}`
  );
  const result = newMoveInSchema.safeParse({
    propertyId: getString(formData, "propertyId"),
    unitId: getString(formData, "unitId"),
    tenantFirstName: getString(formData, "tenantFirstName"),
    tenantLastName: getString(formData, "tenantLastName"),
    tenantEmail: getString(formData, "tenantEmail"),
    tenantPhone: getOptionalString(formData, "tenantPhone"),
    employer: getOptionalString(formData, "employer"),
    emergencyName: getOptionalString(formData, "emergencyName"),
    emergencyPhone: getOptionalString(formData, "emergencyPhone"),
    startDate: getString(formData, "startDate"),
    endDate: getString(formData, "endDate"),
    moveInDate: getString(formData, "moveInDate"),
    monthlyRent: getString(formData, "monthlyRent"),
    securityDeposit: getString(formData, "securityDeposit"),
    dueDay: getString(formData, "dueDay"),
    rentDueTime: getOptionalString(formData, "rentDueTime") ?? DEFAULT_RENT_DUE_TIME,
    firstRentDueDate: getString(formData, "firstRentDueDate"),
    securityDepositDueDate: getString(formData, "securityDepositDueDate"),
    createFirstRentCharge: getBoolean(formData, "createFirstRentCharge"),
    createSecurityDepositCharge: getBoolean(formData, "createSecurityDepositCharge"),
    additionalChargeDescription: getOptionalString(formData, "additionalChargeDescription"),
    additionalChargeAmount: getOptionalString(formData, "additionalChargeAmount"),
    additionalChargeDueDate: getOptionalString(formData, "additionalChargeDueDate"),
    recurringCharges: getOptionalString(formData, "recurringCharges"),
    lateFeePolicy: getOptionalString(formData, "lateFeePolicy"),
    notes: getOptionalString(formData, "notes"),
    documentPath,
    sendInvite: getBoolean(formData, "sendInvite"),
    existingLeaseId: getOptionalString(formData, "existingLeaseId"),
    applicationSubmissionId: getOptionalString(formData, "applicationSubmissionId")
  });

  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Review the move-in details and complete all required fields.";
    redirect(`/move-ins/new?error=${encodeURIComponent(message)}`);
  }

  const parsed = result.data;
  const tenantEmail = normalizeEmail(parsed.tenantEmail);
  let createdLeaseId = "";
  let inviteStatus = parsed.sendInvite ? "pending" : "skipped";
  let inviteEmailError: string | null = null;

  try {
    await updateStore((store) => {
      const property = store.properties.find(
        (item) => item.id === parsed.propertyId && item.organizationId === user.organizationId && item.managerId === user.id
      );
      if (!property) throw new Error("Property not found in your manager portfolio.");

      const sourceSubmission = parsed.applicationSubmissionId
        ? store.applicationSubmissions.find((submission) => submission.id === parsed.applicationSubmissionId)
        : null;
      if (parsed.applicationSubmissionId) {
        const sourceApplication = sourceSubmission
          ? store.rentalApplications.find((application) => application.id === sourceSubmission.applicationId)
          : null;
        if (!sourceSubmission || !sourceApplication || !managerOwnsApplication(store, user, sourceApplication) || sourceSubmission.status !== "APPROVED") {
          throw new Error("Only approved applications can be converted to move-ins.");
        }
      }

      const unit = store.units.find((item) => item.id === parsed.unitId && item.propertyId === property.id);
      if (!unit) throw new Error("Available unit not found for this property.");
      const existingLease = parsed.existingLeaseId
        ? store.leases.find(
            (lease) =>
              lease.id === parsed.existingLeaseId &&
              lease.unitId === unit.id &&
              lease.managerUserId === user.id &&
              leaseCanResumeMoveIn(lease.status)
          )
        : null;
      if (parsed.existingLeaseId && !existingLease) {
        throw new Error("The lease setup for this vacant unit could not be resumed. Refresh the page and try again.");
      }
      if (existingLease?.tenantUserId) {
        throw new Error("This lease is already connected to a tenant account.");
      }
      if (!existingLease && store.leases.some((lease) => lease.unitId === unit.id && leaseCanResumeMoveIn(lease.status))) {
        throw new Error("This unit already has a draft or invited lease. Refresh the page to continue that move-in.");
      }
      if (
        unit.occupancyStatus === "OCCUPIED" &&
        !store.leases.some((lease) => lease.unitId === unit.id && leaseBlocksNewMoveIn(lease.status))
      ) {
        throw new Error("This occupied unit needs a current lease with an end date before another move-in can be scheduled.");
      }
      const availableStartDate = getUnitAvailableStartDate(
        store.leases.filter((lease) => lease.unitId === unit.id),
        existingLease?.id
      );
      if (!availableStartDate) {
        throw new Error("The current lease needs an end date before another move-in can be scheduled.");
      }
      if (appDateKeyFromValue(parsed.startDate) < availableStartDate) {
        throw new Error(`The new lease must start on or after ${availableStartDate}, after the current lease ends.`);
      }

      const now = nowIso();
      const existingTenant = store.tenants.find(
        (tenant) => tenant.organizationId === user.organizationId && normalizeEmail(tenant.email ?? "") === tenantEmail
      );
      const tenantId = existingTenant?.id ?? createId("tenant");
      const tenant = {
        id: tenantId,
        organizationId: user.organizationId,
        firstName: parsed.tenantFirstName,
        lastName: parsed.tenantLastName,
        email: tenantEmail,
        phone: parsed.tenantPhone || existingTenant?.phone,
        employer: parsed.employer || existingTenant?.employer,
        emergencyName: parsed.emergencyName || existingTenant?.emergencyName,
        emergencyPhone: parsed.emergencyPhone || existingTenant?.emergencyPhone,
        notes: existingTenant?.notes,
        createdAt: existingTenant?.createdAt ?? now,
        updatedAt: now
      };
      const tenantUser = store.users.find(
        (candidate) => candidate.organizationId === user.organizationId && candidate.role === UserRole.TENANT && normalizeEmail(candidate.email) === tenantEmail
      );
      const leaseStatus = getMoveInLeaseStatus(parsed.startDate);
      const leaseId = existingLease?.id ?? createId("lease");
      const moveInNote = `Move-in date: ${parsed.moveInDate}`;
      const notes = [moveInNote, parsed.notes].filter(Boolean).join("\n\n");
      const lease = {
        ...existingLease,
        id: leaseId,
        nexusLeaseId:
          existingLease?.nexusLeaseId ??
          getNextNexusLeaseId(store.leases.map((item) => item.nexusLeaseId ?? ""), store.leases.length + 1),
        managerUserId: user.id,
        tenantUserId: tenantUser?.id,
        tenantEmail,
        propertyId: property.id,
        unitId: unit.id,
        tenantIds: [tenantId],
        startDate: toIsoDate(parsed.startDate),
        endDate: toIsoDate(parsed.endDate),
        moveInDate: toIsoDate(parsed.moveInDate),
        monthlyRent: parsed.monthlyRent,
        dueDay: parsed.dueDay,
        rentDueTime: normalizeRentDueTime(parsed.rentDueTime),
        securityDeposit: parsed.securityDeposit,
        recurringCharges: parsed.recurringCharges ?? "",
        lateFeePolicy: parsed.lateFeePolicy,
        notes,
        documentPath: parsed.documentPath ?? existingLease?.documentPath,
        status: leaseStatus,
        createdAt: existingLease?.createdAt ?? now,
        updatedAt: now
      };
      const payments = [];

      if (parsed.createFirstRentCharge) {
        payments.push({
          id: createId("payment"),
          unitId: unit.id,
          leaseId,
          tenantId,
          description: "First month's rent",
          amount: parsed.monthlyRent,
          dueDate: toIsoDate(parsed.firstRentDueDate!),
          status: "PENDING" as const,
          lateFeeAmount: 0,
          balanceDue: parsed.monthlyRent,
          categoryTag: "Rent",
          createdAt: now,
          updatedAt: now
        });
      }
      if (parsed.createSecurityDepositCharge && parsed.securityDeposit > 0) {
        payments.push({
          id: createId("payment"),
          unitId: unit.id,
          leaseId,
          tenantId,
          description: "Security deposit",
          amount: parsed.securityDeposit,
          dueDate: toIsoDate(parsed.securityDepositDueDate!),
          status: "PENDING" as const,
          lateFeeAmount: 0,
          balanceDue: parsed.securityDeposit,
          categoryTag: "Deposit",
          createdAt: now,
          updatedAt: now
        });
      }
      if ((parsed.additionalChargeAmount ?? 0) > 0 && parsed.additionalChargeDescription) {
        payments.push({
          id: createId("payment"),
          unitId: unit.id,
          leaseId,
          tenantId,
          description: parsed.additionalChargeDescription,
          amount: parsed.additionalChargeAmount!,
          dueDate: toIsoDate(parsed.additionalChargeDueDate || parsed.moveInDate),
          status: "PENDING" as const,
          lateFeeAmount: 0,
          balanceDue: parsed.additionalChargeAmount!,
          categoryTag: "Move-in",
          createdAt: now,
          updatedAt: now
        });
      }

      const notifications =
        tenantUser && payments.length
          ? [
              {
                id: createId("note"),
                organizationId: user.organizationId,
                userId: tenantUser.id,
                type: "RENT_DUE" as const,
                title: "Move-in charges are ready",
                body: `${payments.length} move-in charge${payments.length === 1 ? "" : "s"} were added to your resident ledger.`,
                href: "/transactions",
                isRead: false,
                createdAt: now
              }
            ]
          : [];

      createdLeaseId = leaseId;
      const leases = existingLease
        ? store.leases.map((item) => {
            if (item.id === existingLease.id) return lease;
            if (item.unitId === unit.id && leaseCanResumeMoveIn(item.status)) {
              return { ...item, status: "cancelled" as const, updatedAt: now };
            }
            return item;
          })
        : [...store.leases, lease];
      const nextUnitState = leaseDrivenUnitState(leases.filter((item) => item.unitId === unit.id));

      return {
        ...store,
        tenants: existingTenant ? store.tenants.map((item) => (item.id === tenantId ? tenant : item)) : [...store.tenants, tenant],
        leases,
        payments: [...store.payments, ...payments],
        notifications: [...store.notifications, ...notifications],
        units: store.units.map((item) =>
          item.id === unit.id
            ? {
                ...item,
                monthlyRent: parsed.monthlyRent,
                depositAmount: parsed.securityDeposit,
                ...nextUnitState,
                updatedAt: now
              }
            : item
        ),
        applicationSubmissions: sourceSubmission
          ? store.applicationSubmissions.map((submission) =>
              submission.id === sourceSubmission.id ? { ...submission, status: "CONVERTED_TO_LEASE" as const, updatedAt: now } : submission
            )
          : store.applicationSubmissions,
        applicationNotes: sourceSubmission
          ? [
              ...store.applicationNotes,
              {
                id: createId("appnote"),
                applicationId: sourceSubmission.applicationId,
                submissionId: sourceSubmission.id,
                managerUserId: user.id,
                body: `Converted to lease ${lease.nexusLeaseId}.`,
                createdAt: now
              }
            ]
          : store.applicationNotes,
        tenantInvites:
          existingLease
            ? store.tenantInvites.map((invite) =>
                invite.status === "pending" &&
                (
                  (invite.leaseId === existingLease.id && normalizeEmail(existingLease.tenantEmail ?? "") !== tenantEmail) ||
                  store.leases.some(
                    (item) =>
                      item.id === invite.leaseId &&
                      item.id !== existingLease.id &&
                      item.unitId === unit.id &&
                      leaseCanResumeMoveIn(item.status)
                  )
                )
                  ? { ...invite, status: "revoked" as const, updatedAt: now }
                  : invite
              )
            : store.tenantInvites
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the move-in.";
    redirect(`/move-ins/new?error=${encodeURIComponent(message)}`);
  }

  try {
    await ensureScheduledLeasePayments(user.organizationId);
  } catch (error) {
    console.warn("[move-in] Lease payment scheduler did not run after move-in creation", error);
  }

  if (parsed.sendInvite) {
    try {
      await sendLeaseTenantInvite(createdLeaseId, user, "move_in_invite");
      inviteStatus = "sent";
    } catch (error) {
      console.warn("[move-in] Tenant invite email was not sent", error);
      inviteStatus = "failed";
      inviteEmailError = error instanceof Error ? error.message : "Tenant invite email failed.";
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/leases");
  revalidatePath(`/leases/${createdLeaseId}`);
  revalidatePath("/tenants");
  revalidatePath("/transactions");
  revalidatePath("/properties");
  if (parsed.applicationSubmissionId) {
    revalidatePath("/applications");
  }
  const successParams = new URLSearchParams({
    moveIn: "created",
    invite: inviteStatus
  });
  if (inviteEmailError) {
    successParams.set("inviteError", inviteEmailError);
  }
  redirect(`/leases/${createdLeaseId}?${successParams.toString()}`);
}

export async function createLeaseAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const documentPath = requireOptionalSubmittedAssetPath(getOptionalString(formData, "documentPath"), user, "/leases?error=invalid-upload");
  const result = leaseSchema.safeParse({
    unitId: getString(formData, "unitId"),
    tenantId: getString(formData, "tenantId"),
    startDate: getString(formData, "startDate"),
    endDate: getString(formData, "endDate"),
    monthlyRent: getString(formData, "monthlyRent"),
    dueDay: getString(formData, "dueDay"),
    rentDueTime: getOptionalString(formData, "rentDueTime") ?? DEFAULT_RENT_DUE_TIME,
    securityDeposit: getString(formData, "securityDeposit"),
    recurringCharges: getOptionalString(formData, "recurringCharges"),
    lateFeePolicy: getOptionalString(formData, "lateFeePolicy"),
    notes: getOptionalString(formData, "notes"),
    documentPath,
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
      startDate: toIsoDate(parsed.startDate),
      endDate: toIsoDate(parsed.endDate),
      monthlyRent: parsed.monthlyRent,
      dueDay: parsed.dueDay,
      rentDueTime: normalizeRentDueTime(parsed.rentDueTime),
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

  await ensureScheduledLeasePayments(user.organizationId);

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
  const newDocumentPath = requireOptionalSubmittedAssetPath(getOptionalString(formData, "documentPath"), user, invalidLeasePath(returnTo));
  const existingDocumentPath =
    existingLease?.documentPath && isAllowedStoredAssetPath(existingLease.documentPath, { allowDemo: true })
      ? existingLease.documentPath
      : undefined;
  const result = leaseSchema.safeParse({
    unitId: getString(formData, "unitId"),
    tenantId: getString(formData, "tenantId"),
    startDate: getString(formData, "startDate"),
    endDate: getString(formData, "endDate"),
    monthlyRent: getString(formData, "monthlyRent"),
    dueDay: getString(formData, "dueDay"),
    rentDueTime: getOptionalString(formData, "rentDueTime") ?? DEFAULT_RENT_DUE_TIME,
    securityDeposit: getString(formData, "securityDeposit"),
    recurringCharges: getOptionalString(formData, "recurringCharges"),
    lateFeePolicy: getOptionalString(formData, "lateFeePolicy"),
    notes: getOptionalString(formData, "notes"),
    documentPath: newDocumentPath ?? existingDocumentPath,
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
            startDate: toIsoDate(parsed.startDate),
            endDate: toIsoDate(parsed.endDate),
            monthlyRent: parsed.monthlyRent,
            dueDay: parsed.dueDay,
            rentDueTime: normalizeRentDueTime(parsed.rentDueTime),
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
      payments: store.payments.map((payment) =>
        payment.leaseId === leaseId ? { ...payment, unitId: parsed.unitId, tenantId: parsed.tenantId, updatedAt } : payment
      ),
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

  await ensureScheduledLeasePayments(user.organizationId);

  revalidatePath("/leases");
  revalidatePath(returnTo);
  revalidatePath("/dashboard");
  redirect(returnTo);
}

export async function releaseLeaseUnitAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const leaseId = getString(formData, "leaseId");
  const returnTo = getLeaseReturnPath(formData);
  const confirmed = getString(formData, "confirmRelease") === "yes";
  const existingLease = portal.scope.leases.find((lease) => lease.id === leaseId);

  if (!existingLease || !existingLease.unitId || !confirmed) {
    redirect(returnTo);
  }

  await updateStore((store) => {
    const updatedAt = nowIso();
    const endDateKey = existingLease.endDate ? appDateKeyFromValue(existingLease.endDate) : "";
    const releaseStatus: LeaseStatus = endDateKey && endDateKey < getAppDateKey() ? "EXPIRED" : "TERMINATED";
    const leases = store.leases.map((lease) =>
      lease.id === leaseId ? { ...lease, status: releaseStatus, updatedAt } : lease
    );
    const nextUnitState = leaseDrivenUnitState(leases.filter((lease) => lease.unitId === existingLease.unitId));

    return {
      ...store,
      leases,
      units: store.units.map((unit) =>
        unit.id === existingLease.unitId && nextUnitState
          ? { ...unit, ...nextUnitState, updatedAt }
          : unit
      ),
      tenantInvites: store.tenantInvites.map((invite) =>
        invite.leaseId === leaseId && invite.status === "pending"
          ? { ...invite, status: "revoked" as const, updatedAt }
          : invite
      )
    };
  });

  revalidatePath("/dashboard");
  revalidatePath("/leases");
  revalidatePath(returnTo);
  revalidatePath("/units");
  revalidatePath(`/units/${existingLease.unitId}`);
  revalidatePath("/properties");
  revalidatePath("/move-ins/new");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}released=1`);
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
    tenantId: getOptionalString(formData, "tenantId"),
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
  const selectedTenant = parsed.tenantId ? portal.scope.tenants.find((tenant) => tenant.id === parsed.tenantId) : null;
  const paymentUnitId = selectedLease?.unitId ?? parsed.unitId;

  if (!hasId(portal.scope.units, paymentUnitId) || (parsed.leaseId && !selectedLease) || (parsed.tenantId && !selectedTenant)) {
    redirect("/transactions");
  }
  if (selectedLease && selectedTenant && !selectedLease.tenantIds.includes(selectedTenant.id)) {
    redirect("/transactions");
  }

  const inferredLease = selectedLease
    ? selectedLease
    : portal.scope.leases
        .filter((lease) => lease.unitId === paymentUnitId && ["ACTIVE", "UPCOMING", "active", "invited"].includes(lease.status))
        .filter((lease) => !selectedTenant || lease.tenantIds.includes(selectedTenant.id))
        .sort((a, b) => (b.startDate ?? b.createdAt ?? "").localeCompare(a.startDate ?? a.createdAt ?? ""))[0];
  const paymentTenant = selectedTenant ?? (inferredLease?.tenantIds?.[0] ? portal.scope.tenants.find((tenant) => tenant.id === inferredLease.tenantIds[0]) : null);

  if (!paymentTenant) {
    redirect("/transactions");
  }
  const lateFeeAmount = parsed.lateFeeAmount ?? 0;
  const balanceDue = parsed.balanceDue ?? (parsed.status === "PAID" ? 0 : parsed.amount + lateFeeAmount);
  const paidDate = parsed.status === "PAID" ? (parsed.paidDate ? toIsoDate(parsed.paidDate) : nowIso()) : parsed.paidDate ? toIsoDate(parsed.paidDate) : undefined;

  await db.payment.create({
    data: {
      unitId: paymentUnitId,
      leaseId: inferredLease?.id,
      tenantId: paymentTenant.id,
      description: parsed.description,
      amount: parsed.amount,
      dueDate: toIsoDate(parsed.dueDate),
      paidDate,
      status: parsed.status,
      lateFeeAmount,
      balanceDue,
      amountPaid: parsed.status === "PAID" ? parsed.amount : undefined,
      categoryTag: parsed.categoryTag
    }
  });

  const tenantUser = getTenantUserForPayment(portal, { leaseId: inferredLease?.id, tenantId: paymentTenant.id }, paymentTenant);

  if (tenantUser && parsed.status !== "PAID") {
    await db.notification.create({
      data: {
        organizationId: user.organizationId,
        userId: tenantUser.id,
        type: "RENT_DUE",
        title: "Rent payment requested",
        body: `${parsed.description} for $${parsed.amount.toFixed(2)} is ready to pay online.`,
        href: "/transactions"
      }
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  const tabQuery = parsed.status === "PAID" ? "tab=payments&" : "";
  redirect(
    inferredLease
      ? `/transactions?${tabQuery}stripe=payment-linked`
      : `/transactions?${tabQuery}stripe=payment-unlinked`
  );
}

export async function updatePaymentAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const returnTo = getTransactionsReturnPath(formData);
  const parsed = paymentEditSchema.parse({
    paymentId: getString(formData, "paymentId"),
    amount: getString(formData, "amount"),
    returnTo
  });
  const payment = portal.scope.payments.find((item) => item.id === parsed.paymentId);

  if (!payment) {
    redirect(returnTo);
  }

  const existingPaidAmount = typeof payment.amountPaid === "number" ? payment.amountPaid : 0;
  const nextBalanceDue =
    payment.status === "PAID"
      ? 0
      : Math.max(0, parsed.amount + (payment.lateFeeAmount ?? 0) - existingPaidAmount);

  await db.payment.update({
    where: { id: payment.id },
    data: {
      amount: parsed.amount,
      balanceDue: nextBalanceDue,
      ...(payment.status === "PAID" ? { amountPaid: parsed.amount } : {})
    }
  });

  const tenantUser = getTenantUserForPayment(portal, payment);
  if (tenantUser && payment.status !== "PAID") {
    await db.notification.create({
      data: {
        organizationId: user.organizationId,
        userId: tenantUser.id,
        type: "RENT_DUE",
        title: "Payment request updated",
        body: `${payment.description} was updated to $${nextBalanceDue.toFixed(2)} and is ready to pay online.`,
        href: "/transactions"
      }
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/tenants");
  if (payment.unitId) revalidatePath(`/units/${payment.unitId}`);
  redirect(returnTo);
}

export async function deletePaymentAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const paymentId = getString(formData, "paymentId");
  const returnTo = getTransactionsReturnPath(formData);
  const confirmed = getString(formData, "confirmDelete") === "yes";
  const payment = portal.scope.payments.find((item) => item.id === paymentId);

  if (!payment || !confirmed) {
    redirect(returnTo);
  }

  await updateStore((store) => ({
    ...store,
    payments: store.payments.filter((item) => item.id !== payment.id)
  }));

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/tenants");
  if (payment.unitId) revalidatePath(`/units/${payment.unitId}`);
  redirect(returnTo);
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
      incurredAt: toIsoDate(parsed.incurredAt),
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
    imagePaths: requireSubmittedAssetPaths(formData, "imagePaths", user, "/maintenance?error=invalid-upload", 3),
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
      phone: formatPhoneNumber(getOptionalString(formData, "phone")) || undefined,
      title: getOptionalString(formData, "title")
    }
  });

  revalidatePath("/settings");
  redirect("/settings");
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
  if (!portal.currentTenant?.id || (payment.tenantId && payment.tenantId !== portal.currentTenant.id)) {
    redirect("/transactions?stripe=invalid-payment");
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
  const applicationFeeAmountCents = NEXUS_STRIPE_APPLICATION_FEE_AMOUNT_CENTS;

  if (!manager) {
    redirect(`/transactions?stripe=manager-missing&payment=${encodeURIComponent(payment.id)}`);
  }
  if (!getStripeAccountId(manager)) {
    redirect(`/transactions?stripe=manager-setup-required&payment=${encodeURIComponent(payment.id)}`);
  }

  try {
    connectedManager = await syncStripeConnectedAccount(manager);
  } catch (error) {
    console.error("[stripe] Failed to verify manager Connect account before checkout", error);
    redirect(`/transactions?stripe=manager-setup-required&payment=${encodeURIComponent(payment.id)}`);
  }

  const connectedAccountId = getStripeAccountId(connectedManager);
  if (!isStripeConnectReady(connectedManager) || !connectedAccountId) {
    redirect(`/transactions?stripe=manager-setup-required&payment=${encodeURIComponent(payment.id)}`);
  }
  const stripeDestinationAccountId = connectedAccountId;

  const amountDue = payment.balanceDue || payment.amount;
  const amountCents = Math.round(amountDue * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    redirect("/transactions?stripe=invalid-amount");
  }
  if (applicationFeeAmountCents > 0 && amountCents <= applicationFeeAmountCents) {
    redirect("/transactions?stripe=amount-below-platform-fee");
  }

  const paymentMonth = getPaymentMonth(payment.dueDate);
  const appUrl = getAppBaseUrl();

  if (
    (!payment.leaseId && leaseId) ||
    (!payment.tenantId && portal.currentTenant?.id) ||
    payment.stripeDestinationAccountId !== stripeDestinationAccountId ||
    payment.stripeApplicationFeeAmountCents !== applicationFeeAmountCents
  ) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        ...(!payment.leaseId && leaseId ? { leaseId } : {}),
        ...(!payment.tenantId && portal.currentTenant?.id ? { tenantId: portal.currentTenant.id } : {}),
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
  const path = requireOptionalSubmittedAssetPath(getString(formData, "path"), user, "/properties");
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
  const imagePaths = requireSubmittedAssetPaths(formData, "imagePaths", user, "/ai-assessments?error=invalid-upload", 12);
  const baselinePaths = requireSubmittedAssetPaths(formData, "baselinePaths", user, "/ai-assessments?error=invalid-upload", 12);
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
      inspectionDate: toIsoDate(parsed.inspectionDate),
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
