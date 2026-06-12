"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
import { clearSession, createSession, getCurrentUser, requireRoles, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendDiscussionMessage } from "@/lib/discussions";
import {
  sendApplicationDecisionEmail,
  sendApplicationInviteEmail,
  sendApplicationReceivedEmail,
  sendApplicationSubmittedEmail,
  sendPasswordResetEmail
} from "@/lib/email";
import { filterSubmittedAssetPaths, isAllowedStoredAssetPath, isAllowedSubmittedAssetPath, isAllowedTenantIdAssetPath } from "@/lib/file-security";
import { cleanDisplayName, defaultPhotoName, PROPERTY_PHOTO_LIMIT, UNIT_PHOTO_LIMIT } from "@/lib/document-metadata";
import { ensureLeaseConnectionIntegrity, generateInviteToken, getUnitAvailableStartDate, hashInviteToken, isActiveLeaseStatus, leaseBlocksNewMoveIn, leaseCanResumeMoveIn, leaseStartIsAvailable, normalizeLeaseLifecycleStatus } from "@/lib/lease-connections";
import {
  LEGAL_ACCEPT_PATH,
  PAYMENT_TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_VERSION,
  hasAcceptedCurrentPaymentTerms,
  hasVerifiedAdultBirthDate,
  requiresLegalAcceptance,
  validateBirthDateInput
} from "@/lib/legal";
import { ensureScheduledLeasePayments, formatLateFeePolicy } from "@/lib/lease-payment-scheduler";
import { hashPassword, verifyPassword } from "@/lib/password";
import { formatPhoneNumber } from "@/lib/phone";
import { applyOwnProfileUpdate, ProfileUpdateError } from "@/lib/profile";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordPlatformEvent } from "@/lib/platform-events";
import { buildAppUrl, getAppBaseUrl } from "@/lib/request-origin";
import { ensureApplicantPortalAccess, startCheckrScreening, startPlaidScreening } from "@/lib/screening/service";
import { FileKind, UserRole, createId, incrementUserSessionVersion, nowIso, updateStore, type ApplicationInvite, type LeaseStatus, type RentalApplicationStatus, type UnitOccupancyStatus } from "@/lib/store";
import { getPlatformFeeCents, getStripe } from "@/lib/stripe";
import {
  clearManagerStripeConnection,
  createManagerConnectedAccount,
  createManagerOnboardingLink,
  createManagerStripeAccessLink,
  getManagerStripeAccessResult,
  getManagerStripeAccessStatus,
  getStripeAccountId,
  getStripeConnectRedirectStatus,
  isStripeConnectReady,
  syncManagerConnectedAccount,
  verifyManagerPayoutDestination
} from "@/lib/stripe-connect";
import { sendLeaseTenantInvite } from "@/lib/tenant-invite-delivery";
import { formatDate } from "@/lib/utils";
import {
  damageAssessmentSchema,
  expenseSchema,
  applicationInviteSchema,
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
import { isRetiredAccountEmail } from "@/lib/retired-accounts";
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

function resolveLateFeePolicy(formData: FormData): string | undefined {
  const lateFeeType = getOptionalString(formData, "lateFeeType");
  const lateFeeAmountRaw = getOptionalString(formData, "lateFeeAmount");
  const lateFeeGraceDaysRaw = getOptionalString(formData, "lateFeeGraceDays");
  const lateFeeAmount = lateFeeAmountRaw ? Number(lateFeeAmountRaw) : NaN;
  if (lateFeeType && Number.isFinite(lateFeeAmount) && lateFeeAmount > 0) {
    return formatLateFeePolicy({
      feeType: lateFeeType === "percent" ? "percent" : "fixed",
      amount: lateFeeAmount,
      graceDays: lateFeeGraceDaysRaw ? Math.max(0, Math.round(Number(lateFeeGraceDaysRaw))) : 5
    });
  }
  return getOptionalString(formData, "lateFeePolicy");
}

function readAssetPaths(formData: FormData, key: string) {
  return formData.getAll(key).map(String).map((value) => value.trim()).filter(Boolean);
}

function readNamedAssetUploads(
  formData: FormData,
  {
    pathKey,
    titleKey,
    originalNameKey,
    user,
    errorPath,
    max
  }: {
    pathKey: string;
    titleKey: string;
    originalNameKey: string;
    user: { id: string; organizationId: string };
    errorPath: string;
    max: number;
  }
) {
  const paths = readAssetPaths(formData, pathKey);
  const titles = formData.getAll(titleKey).map(String);
  const originalNames = formData.getAll(originalNameKey).map(String);
  if (paths.length > max || paths.some((path) => !isAllowedSubmittedAssetPath(path, user))) {
    redirect(errorPath);
  }
  const seen = new Set<string>();
  return paths.flatMap((path, index) => {
    if (seen.has(path)) return [];
    seen.add(path);
    return [{
      path,
      title: titles[index],
      originalName: originalNames[index]?.trim().slice(0, 255) || undefined
    }];
  });
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
  if (!(error instanceof Error)) return false;
  const e = error as any;
  const msg = e.message?.toLowerCase() ?? "";
  const code = e.code ?? "";
  return (
    msg.includes("signed up for connect") ||
    msg.includes("connect is not enabled") ||
    msg.includes("haven't enabled") ||
    msg.includes("enable connect") ||
    msg.includes("platform profile") ||
    msg.includes("platform cannot") ||
    msg.includes("not enabled for connect") ||
    code === "account_invalid" ||
    code === "platform_not_approved"
  );
}

// Payment terms must be accepted (once per version) before any Stripe money
// movement is set up: tenant checkout and manager Connect onboarding both run
// through this. Acceptance is recorded on the acting user's own record.
async function ensurePaymentTermsAccepted(
  user: { id: string; paymentTermsAcceptedAt?: string; paymentTermsVersionAccepted?: string },
  formData: FormData | undefined,
  errorPath: string
) {
  if (hasAcceptedCurrentPaymentTerms(user)) return;
  if (formData?.get("acceptPaymentTerms") !== "on") {
    redirect(errorPath);
  }
  await db.user.update({
    where: { id: user.id },
    data: { paymentTermsAcceptedAt: nowIso(), paymentTermsVersionAccepted: PAYMENT_TERMS_VERSION }
  });
}

export async function connectStripeAccountAction(formData?: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  await ensurePaymentTermsAccepted(user, formData, "/settings?stripe=payment-terms-required#payments-stripe");
  let accountId = getStripeAccountId(user);
  let redirectUrl: string | null = null;
  let startedOnboarding = false;

  try {
    const appUrl = getAppBaseUrl();

    if (accountId) {
      try {
        const access = await createManagerStripeAccessLink(user, appUrl);
        redirectUrl = access.url;
        startedOnboarding = access.mode === "onboarding";
      } catch (accessError) {
        const status = getManagerStripeAccessStatus(accessError);
        if (status === "reconnect-required" || status === "stripe-account-mismatch") {
          console.log("[stripe-connect] Unusable account cleared; creating fresh Express account", {
            userId: user.id,
            reason: status
          });
          await clearManagerStripeConnection(user.id);
          const fresh = await createManagerConnectedAccount(user);
          accountId = fresh.id;
        } else {
          throw accessError;
        }
      }
    } else {
      const account = await createManagerConnectedAccount(user);
      accountId = account.id;
    }

    if (!redirectUrl) {
      redirectUrl = await createManagerOnboardingLink(accountId!, appUrl);
      startedOnboarding = true;
    }

    if (startedOnboarding) {
      await recordPlatformEvent({
        type: "STRIPE_SETUP_STARTED",
        category: "connect_onboarding",
        status: "info",
        organizationId: user.organizationId,
        userId: user.id,
        relatedId: accountId,
        message: "Stripe Connect onboarding link created."
      });
    }
  } catch (error) {
    const e = error as any;
    console.error("[stripe] Failed to start manager Connect onboarding", {
      userId: user.id,
      name: e?.name,
      type: e?.type,
      code: e?.code,
      statusCode: e?.statusCode
    });
    if (isStripeConnectSignupError(error)) {
      redirect("/settings?stripe=connect-not-enabled#payments-stripe");
    }
    const status = getManagerStripeAccessStatus(error);
    if (status !== "connect-error") {
      redirect(`/settings?stripe=${status}#payments-stripe`);
    }
    redirect("/settings?stripe=connect-error#payments-stripe");
  }

  if (!redirectUrl) redirect("/settings?stripe=connect-error#payments-stripe");
  redirect(redirectUrl);
}

export async function refreshStripeConnectStatusAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  let status = "connect-refreshed";

  try {
    if (!getStripeAccountId(user)) {
      status = "connect-required";
    } else {
      const updatedUser = await syncManagerConnectedAccount(user);
      status = getStripeConnectRedirectStatus(updatedUser);
    }
  } catch (error) {
    status = getManagerStripeAccessStatus(error);
    console.error("[stripe] Failed to refresh manager Connect status", {
      userId: user.id,
      status
    });
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  redirect(`/settings?stripe=${status}#payments-stripe`);
}

export async function openStripeDashboardAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const accountId = getStripeAccountId(user);

  if (!accountId) {
    redirect("/settings?stripe=connect-required#payments-stripe");
  }

  const result = await getManagerStripeAccessResult(user, getAppBaseUrl());
  if (result.ok === false) {
    console.error("[stripe] Failed to open manager Stripe account", {
      userId: user.id,
      ...result.diagnostic
    });
    if (result.clearConnection) {
      await clearManagerStripeConnection(user.id);
    }
    redirect(`/settings?stripe=${result.status}#payments-stripe`);
  }

  redirect(result.url);
}


// Best-effort capture of the accepting client's IP and user agent for the
// legal acceptance audit trail. Never throws; returns undefined fields when
// the headers are unavailable. Values are truncated, never logged.
async function getLegalAcceptanceClientInfo(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get("x-forwarded-for");
    const ip = (forwardedFor?.split(",")[0] ?? headerList.get("x-real-ip") ?? "").trim().slice(0, 64) || undefined;
    const userAgent = headerList.get("user-agent")?.trim().slice(0, 256) || undefined;
    return { ip, userAgent };
  } catch {
    return {};
  }
}

function legalConsentChecked(formData: FormData) {
  return formData.get("acceptLegal") === "on";
}

export async function signupAction(formData: FormData) {
  const mailingAddressResult = validateOptionalAddress(readAddressFormData(formData, MAILING_ADDRESS_FORM_FIELDS, "mailingAddress"));
  if (!mailingAddressResult.success) {
    redirect("/signup?error=invalid-address");
  }

  // Age verification and consent are validated server-side; the client-side
  // required attributes are convenience only. The raw birthday value is never
  // logged and is stored only on the new user's own record.
  const birthDateResult = validateBirthDateInput(getString(formData, "birthDate"));
  if (birthDateResult.ok === false) {
    redirect(`/signup?error=${birthDateResult.error}`);
  }
  if (!legalConsentChecked(formData)) {
    redirect("/signup?error=terms-required");
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

  if (isRetiredAccountEmail(parsed.email)) {
    redirect("/signup?error=invalid-form");
  }

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

  const clientInfo = await getLegalAcceptanceClientInfo();
  const acceptedAt = nowIso();

  let user;
  try {
    user = await db.user.create({
      data: {
        organizationId: organization.id,
        email: parsed.email,
        passwordHash: await hashPassword(parsed.password),
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        role: parsed.role,
        phone: parsed.phone,
        lastLoginAt: acceptedAt,
        birthDate: birthDateResult.birthDate,
        ageVerifiedAt: acceptedAt,
        termsAcceptedAt: acceptedAt,
        termsVersionAccepted: TERMS_VERSION,
        privacyAcceptedAt: acceptedAt,
        privacyVersionAccepted: PRIVACY_VERSION,
        ...(clientInfo.ip ? { legalAcceptanceIp: clientInfo.ip } : {}),
        ...(clientInfo.userAgent ? { legalAcceptanceUserAgent: clientInfo.userAgent } : {})
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "account-exists") {
      redirect("/signup?error=account-exists");
    }
    console.error("[auth] Signup user creation failed", error);
    redirect("/signup?error=server");
  }

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
    email: user.email,
    sessionVersion: user.sessionVersion ?? 0
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

  if (isRetiredAccountEmail(parsed.email)) {
    redirect("/login?error=invalid-credentials");
  }

  const rateLimit = checkRateLimit({
    key: `login:${normalizeEmail(parsed.email)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    redirect("/login?error=rate-limited");
  }

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
    email: user.email,
    sessionVersion: user.sessionVersion ?? 0
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
  // Advance the session version so the just-cleared token (and any copy of it,
  // e.g. a stolen one) is rejected by getCurrentUser on every future request.
  const user = await getCurrentUser();
  if (user) {
    await incrementUserSessionVersion(user.id);
  }
  await clearSession();
  redirect("/login");
}

// Forced legal acceptance for existing users (the /legal/accept gate).
// Deliberately uses getCurrentUser() instead of requireUser(): requireUser
// redirects un-accepted users to /legal/accept, which would loop here. The
// acting user always comes from the session; a userId is never accepted from
// the client, so one user can never update another user's acceptance fields.
export async function acceptLegalTermsAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const destination = isSystemAdminEmail(user.email) ? "/admin" : "/dashboard";
  if (!requiresLegalAcceptance(user)) {
    redirect(destination);
  }

  if (!legalConsentChecked(formData)) {
    redirect(`${LEGAL_ACCEPT_PATH}?error=terms-required`);
  }

  // Only ask for (and update) the birthday when the record does not already
  // carry a verified adult birth date. The age check runs server-side here;
  // the client never decides age status.
  let birthDateUpdate: { birthDate: string; ageVerifiedAt: string } | null = null;
  if (!hasVerifiedAdultBirthDate(user)) {
    const birthDateResult = validateBirthDateInput(getString(formData, "birthDate"));
    if (birthDateResult.ok === false) {
      redirect(`${LEGAL_ACCEPT_PATH}?error=${birthDateResult.error}`);
    }
    birthDateUpdate = { birthDate: birthDateResult.birthDate, ageVerifiedAt: nowIso() };
  }

  const clientInfo = await getLegalAcceptanceClientInfo();
  const acceptedAt = nowIso();

  await db.user.update({
    where: { id: user.id },
    data: {
      ...(birthDateUpdate ?? {}),
      termsAcceptedAt: acceptedAt,
      termsVersionAccepted: TERMS_VERSION,
      privacyAcceptedAt: acceptedAt,
      privacyVersionAccepted: PRIVACY_VERSION,
      ...(clientInfo.ip ? { legalAcceptanceIp: clientInfo.ip } : {}),
      ...(clientInfo.userAgent ? { legalAcceptanceUserAgent: clientInfo.userAgent } : {})
    }
  });

  // Clear cached layouts/pages so the freshly unlocked app renders with the
  // updated user record immediately.
  revalidatePath("/", "layout");
  redirect(destination);
}

export async function requestResetAction(formData: FormData) {
  const result = requestResetSchema.safeParse({
    email: getString(formData, "email")
  });

  if (!result.success) {
    redirect("/forgot-password?error=invalid-email");
  }

  const email = result.data.email;

  if (isRetiredAccountEmail(email)) {
    redirect("/forgot-password?success=1");
  }

  // Cap reset requests per email so the action cannot be used to flood an inbox.
  // Redirect to the generic success page so account existence is never revealed.
  const rateLimit = checkRateLimit({
    key: `password-reset:${normalizeEmail(email)}`,
    limit: 3,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    redirect("/forgot-password?success=1");
  }

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
  // Invalidate any sessions that were active before the password was reset
  // (e.g. an attacker still holding a stolen token for this account).
  await incrementUserSessionVersion(record.userId);

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
  const namedUploads = readNamedAssetUploads(formData, {
    pathKey: "imagePaths",
    titleKey: "imageNames",
    originalNameKey: "imageOriginalNames",
    user,
    errorPath: "/properties?error=invalid-upload",
    max: PROPERTY_PHOTO_LIMIT
  });
  const fallbackImagePath = requireOptionalSubmittedAssetPath(getOptionalString(formData, "imagePath"), user, "/properties?error=invalid-upload");
  const uploaded = namedUploads.length
    ? namedUploads
    : fallbackImagePath
      ? [{ path: fallbackImagePath, title: "Property photo 1", originalName: undefined }]
      : [];

  await db.property.create({
    data: {
      organizationId: user.organizationId,
      ...parsed,
      ...address,
      managerId: user.role === UserRole.MANAGER ? user.id : parsed.managerId,
      amenities: parsed.amenities ?? "",
      files: uploaded.length
        ? {
            create: uploaded.map((file, index) => ({
              organizationId: user.organizationId,
              kind: FileKind.PROPERTY_IMAGE,
              label: cleanDisplayName(file.title, defaultPhotoName("property", index + 1)),
              displayName: cleanDisplayName(file.title, defaultPhotoName("property", index + 1)),
              originalFileName: file.originalName,
              path: file.path,
              mimeType: "image/*",
              visibility: "ORGANIZATION",
              uploadedById: user.id,
              uploadedAt: nowIso()
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
  const uploads = readNamedAssetUploads(formData, {
    pathKey: "imagePaths",
    titleKey: "imageNames",
    originalNameKey: "imageOriginalNames",
    user,
    errorPath: `/properties/${propertyId}?error=invalid-upload`,
    max: PROPERTY_PHOTO_LIMIT
  });
  const fallbackImagePath = requireOptionalSubmittedAssetPath(getOptionalString(formData, "imagePath"), user, `/properties/${propertyId}?error=invalid-upload`);
  const pendingUploads = uploads.length
    ? uploads
    : fallbackImagePath
      ? [{ path: fallbackImagePath, title: undefined, originalName: undefined }]
      : [];

  try {
    await updateStore((store) => {
      const ownedProperty = store.properties.find(
        (item) =>
          item.id === propertyId &&
          item.organizationId === user.organizationId &&
          (user.role === UserRole.ADMIN || item.managerId === user.id)
      );
      if (!ownedProperty) throw new Error("property-not-found");
      const existingCount = store.uploadedFiles.filter(
        (file) => file.propertyId === propertyId && file.kind === FileKind.PROPERTY_IMAGE
      ).length;
      if (existingCount + pendingUploads.length > PROPERTY_PHOTO_LIMIT) {
        throw new Error("property-photo-limit");
      }
      const uploadedAt = nowIso();
      return {
        ...store,
        properties: store.properties.map((item) =>
          item.id === propertyId
            ? {
                ...item,
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
                ...(user.role === UserRole.ADMIN ? { managerId: parsed.managerId || undefined } : {}),
                updatedAt: uploadedAt
              }
            : item
        ),
        uploadedFiles: [
          ...store.uploadedFiles,
          ...pendingUploads.map((file, index) => {
            const displayName = cleanDisplayName(file.title, defaultPhotoName("property", existingCount + index + 1));
            return {
              id: createId("file"),
              organizationId: user.organizationId,
              propertyId,
              kind: FileKind.PROPERTY_IMAGE,
              label: displayName,
              displayName,
              originalFileName: file.originalName,
              path: file.path,
              mimeType: "image/*",
              visibility: "ORGANIZATION" as const,
              uploadedById: user.id,
              uploadedAt,
              createdAt: uploadedAt
            };
          })
        ]
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "property-photo-limit") {
      redirect(`/properties/${propertyId}?error=photo-limit#photos`);
    }
    throw error;
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
  redirect(`/properties/${propertyId}`);
}

export async function renamePropertyPhotoAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const propertyId = getString(formData, "propertyId");
  const fileId = getString(formData, "fileId");
  const displayName = cleanDisplayName(getString(formData, "displayName"), "Property photo");

  await updateStore((store) => {
    const property = store.properties.find(
      (item) =>
        item.id === propertyId &&
        item.organizationId === user.organizationId &&
        (user.role === UserRole.ADMIN || item.managerId === user.id)
    );
    const file = store.uploadedFiles.find(
      (item) => item.id === fileId && item.propertyId === propertyId && item.kind === FileKind.PROPERTY_IMAGE
    );
    if (!property || !file) throw new Error("Property photo not found.");
    return {
      ...store,
      uploadedFiles: store.uploadedFiles.map((item) =>
        item.id === fileId ? { ...item, label: displayName, displayName } : item
      )
    };
  });

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/documents");
}

export async function deletePropertyPhotoAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const propertyId = getString(formData, "propertyId");
  const fileId = getString(formData, "fileId");

  await updateStore((store) => {
    const property = store.properties.find(
      (item) =>
        item.id === propertyId &&
        item.organizationId === user.organizationId &&
        (user.role === UserRole.ADMIN || item.managerId === user.id)
    );
    const file = store.uploadedFiles.find(
      (item) => item.id === fileId && item.propertyId === propertyId && item.kind === FileKind.PROPERTY_IMAGE
    );
    if (!property || !file) throw new Error("Property photo not found.");
    return { ...store, uploadedFiles: store.uploadedFiles.filter((item) => item.id !== fileId) };
  });

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  revalidatePath("/documents");
}

export async function addUnitPhotosAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const unitId = getString(formData, "unitId");
  const uploads = readNamedAssetUploads(formData, {
    pathKey: "imagePaths",
    titleKey: "imageNames",
    originalNameKey: "imageOriginalNames",
    user,
    errorPath: `/units/${unitId}?error=invalid-upload#photos`,
    max: UNIT_PHOTO_LIMIT
  });

  try {
    await updateStore((store) => {
      const unit = store.units.find((item) => item.id === unitId);
      const property = store.properties.find(
        (item) =>
          item.id === unit?.propertyId &&
          item.organizationId === user.organizationId &&
          (user.role === UserRole.ADMIN || item.managerId === user.id)
      );
      if (!unit || !property) throw new Error("unit-not-found");
      const existingCount = store.uploadedFiles.filter(
        (file) => file.unitId === unitId && file.kind === FileKind.UNIT_IMAGE
      ).length;
      if (existingCount + uploads.length > UNIT_PHOTO_LIMIT) throw new Error("unit-photo-limit");
      const uploadedAt = nowIso();
      return {
        ...store,
        uploadedFiles: [
          ...store.uploadedFiles,
          ...uploads.map((file, index) => {
            const displayName = cleanDisplayName(file.title, defaultPhotoName("unit", existingCount + index + 1));
            return {
              id: createId("file"),
              organizationId: user.organizationId,
              propertyId: property.id,
              unitId,
              kind: FileKind.UNIT_IMAGE,
              label: displayName,
              displayName,
              originalFileName: file.originalName,
              path: file.path,
              mimeType: "image/*",
              visibility: "ORGANIZATION" as const,
              uploadedById: user.id,
              uploadedAt,
              createdAt: uploadedAt
            };
          })
        ]
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unit-photo-limit") {
      redirect(`/units/${unitId}?error=photo-limit#photos`);
    }
    throw error;
  }

  revalidatePath(`/units/${unitId}`);
  revalidatePath("/documents");
  redirect(`/units/${unitId}#photos`);
}

export async function renameUnitPhotoAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const unitId = getString(formData, "unitId");
  const fileId = getString(formData, "fileId");
  const displayName = cleanDisplayName(getString(formData, "displayName"), "Unit photo");

  await updateStore((store) => {
    const unit = store.units.find((item) => item.id === unitId);
    const property = store.properties.find(
      (item) =>
        item.id === unit?.propertyId &&
        item.organizationId === user.organizationId &&
        (user.role === UserRole.ADMIN || item.managerId === user.id)
    );
    const file = store.uploadedFiles.find(
      (item) => item.id === fileId && item.unitId === unitId && item.kind === FileKind.UNIT_IMAGE
    );
    if (!unit || !property || !file) throw new Error("Unit photo not found.");
    return {
      ...store,
      uploadedFiles: store.uploadedFiles.map((item) =>
        item.id === fileId ? { ...item, label: displayName, displayName } : item
      )
    };
  });

  revalidatePath(`/units/${unitId}`);
  revalidatePath("/documents");
}

export async function deleteUnitPhotoAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const unitId = getString(formData, "unitId");
  const fileId = getString(formData, "fileId");

  await updateStore((store) => {
    const unit = store.units.find((item) => item.id === unitId);
    const property = store.properties.find(
      (item) =>
        item.id === unit?.propertyId &&
        item.organizationId === user.organizationId &&
        (user.role === UserRole.ADMIN || item.managerId === user.id)
    );
    const file = store.uploadedFiles.find(
      (item) => item.id === fileId && item.unitId === unitId && item.kind === FileKind.UNIT_IMAGE
    );
    if (!unit || !property || !file) throw new Error("Unit photo not found.");
    return { ...store, uploadedFiles: store.uploadedFiles.filter((item) => item.id !== fileId) };
  });

  revalidatePath(`/units/${unitId}`);
  revalidatePath("/documents");
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
  const unitResult = unitSchema.safeParse({
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
  if (!unitResult.success) {
    const propertyId = getOptionalString(formData, "propertyId");
    redirect(propertyId ? `/properties/${encodeURIComponent(propertyId)}?error=invalid-unit#add-unit` : "/properties");
  }
  const parsed = unitResult.data;
  const namedUploads = readNamedAssetUploads(formData, {
    pathKey: "imagePaths",
    titleKey: "imageNames",
    originalNameKey: "imageOriginalNames",
    user,
    errorPath: "/properties?error=invalid-upload",
    max: UNIT_PHOTO_LIMIT
  });
  const imagePath = requireOptionalSubmittedAssetPath(getOptionalString(formData, "imagePath"), user, "/properties?error=invalid-upload");
  const uploads = namedUploads.length
    ? namedUploads
    : imagePath
      ? [{ path: imagePath, title: "Unit photo 1", originalName: undefined }]
      : [];

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
      files: uploads.length
        ? {
            create: uploads.map((file, index) => {
              const displayName = cleanDisplayName(file.title, defaultPhotoName("unit", index + 1));
              return {
                organizationId: user.organizationId,
                kind: FileKind.UNIT_IMAGE,
                label: displayName,
                displayName,
                originalFileName: file.originalName,
                path: file.path,
                mimeType: "image/*",
                visibility: "ORGANIZATION",
                uploadedById: user.id,
                uploadedAt: nowIso()
              };
            })
          }
        : undefined
    }
  });

  revalidatePath("/properties");
  redirect(`/units/${unit.id}`);
}

export async function createTenantAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const tenantResult = tenantSchema.safeParse({
    firstName: getString(formData, "firstName"),
    lastName: getString(formData, "lastName"),
    email: getOptionalString(formData, "email"),
    phone: getOptionalString(formData, "phone"),
    employer: getOptionalString(formData, "employer"),
    emergencyName: getOptionalString(formData, "emergencyName"),
    emergencyPhone: getOptionalString(formData, "emergencyPhone"),
    notes: getOptionalString(formData, "notes")
  });
  if (!tenantResult.success) {
    redirect("/tenants?error=invalid-tenant");
  }
  const parsed = tenantResult.data;

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

const APPLICATION_INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const DEFAULT_INVITE_REQUIRED_FIELDS = ["phone", "currentAddress", "employment", "income", "rentalHistory", "references"];

export async function sendApplicationInviteAction(formData: FormData) {
  const user = await requireRoles([UserRole.MANAGER]);
  const raw = {
    firstName: getString(formData, "firstName").trim(),
    lastName: getString(formData, "lastName").trim(),
    email: getString(formData, "email").trim(),
    phone: getOptionalString(formData, "phone"),
    propertyId: getString(formData, "propertyId"),
    unitId: getOptionalString(formData, "unitId"),
    desiredMoveInDate: getOptionalString(formData, "desiredMoveInDate"),
    requestBackgroundCheck: getBoolean(formData, "requestBackgroundCheck"),
    requestIncomeVerification: getBoolean(formData, "requestIncomeVerification"),
    note: getOptionalString(formData, "note")
  };

  function failurePath(message: string) {
    const params = new URLSearchParams({
      error: message,
      firstName: raw.firstName,
      lastName: raw.lastName,
      email: raw.email,
      phone: raw.phone ?? "",
      propertyId: raw.propertyId,
      unitId: raw.unitId ?? "",
      desiredMoveInDate: raw.desiredMoveInDate ?? "",
      requestBackgroundCheck: String(raw.requestBackgroundCheck),
      requestIncomeVerification: String(raw.requestIncomeVerification),
      note: raw.note ?? ""
    });
    return `/applications/invite?${params.toString()}`;
  }

  const result = applicationInviteSchema.safeParse(raw);
  if (!result.success) {
    redirect(failurePath("Review the required invite fields."));
  }
  const parsed = result.data;

  let inviteContext: {
    applicationId: string;
    propertyLabel: string;
    organizationName: string;
  } | null = null;

  try {
    await updateStore((store) => {
      const property = store.properties.find(
        (item) => item.id === parsed.propertyId && item.organizationId === user.organizationId && item.managerId === user.id
      );
      if (!property) throw new Error("Property not found in your manager portfolio.");
      const unit = parsed.unitId ? store.units.find((item) => item.id === parsed.unitId && item.propertyId === property.id) : null;
      if (parsed.unitId && !unit) throw new Error("Unit not found for this property.");

      if (unit && parsed.desiredMoveInDate) {
        const requestedKey = appDateKeyFromValue(parsed.desiredMoveInDate);
        if (!requestedKey) throw new Error("The desired move-in date is invalid.");
        const todayKey = getAppDateKey();
        const unitLeases = store.leases
          .filter((lease) => lease.unitId === unit.id)
          .map((lease) => ({ id: lease.id, status: normalizeLeaseLifecycleStatus(lease, todayKey), endDate: lease.endDate }));
        if (!leaseStartIsAvailable(unitLeases, parsed.desiredMoveInDate)) {
          const availableFrom = getUnitAvailableStartDate(unitLeases);
          const latestBlockingEnd = unitLeases
            .filter((lease) => leaseBlocksNewMoveIn(lease.status) && lease.endDate)
            .map((lease) => appDateKeyFromValue(lease.endDate))
            .filter(Boolean)
            .sort()
            .at(-1);
          if (!availableFrom) {
            throw new Error(
              `Unit ${unit.unitNumber} is unavailable on ${formatDate(requestedKey)} because an existing lease has no end date. Update that lease before sending this invite.`
            );
          }
          throw new Error(
            latestBlockingEnd
              ? `Unit ${unit.unitNumber} is unavailable on ${formatDate(requestedKey)} because an existing lease runs through ${formatDate(latestBlockingEnd)}. Earliest available move-in date is ${formatDate(availableFrom)}.`
              : `Unit ${unit.unitNumber} is unavailable on ${formatDate(requestedKey)}. Earliest available move-in date is ${formatDate(availableFrom)}.`
          );
        }
      }

      const propertyLabel = [property.name, unit?.unitNumber ? `Unit ${unit.unitNumber}` : null, formatUnitAddress(property, unit ?? null)]
        .filter(Boolean)
        .join(", ");
      const organizationName = store.organizations.find((item) => item.id === user.organizationId)?.name ?? "Nexus Rentals";

      const existing = store.rentalApplications
        .filter(
          (item) =>
            item.propertyId === property.id &&
            (item.unitId ?? "") === (unit?.id ?? "") &&
            item.managerUserId === user.id &&
            item.status === "PUBLISHED"
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (existing) {
        inviteContext = { applicationId: existing.id, propertyLabel, organizationName };
        return store;
      }

      const now = nowIso();
      const id = createId("app");
      inviteContext = { applicationId: id, propertyLabel, organizationName };
      const application = {
        id,
        organizationId: user.organizationId,
        managerUserId: user.id,
        propertyId: property.id,
        unitId: unit?.id,
        publicSlug: createPublicSlug(),
        title: [property.name, unit?.unitNumber ? `Unit ${unit.unitNumber}` : null].filter(Boolean).join(" - ") + " application",
        monthlyRent: unit?.monthlyRent ?? 0,
        securityDeposit: unit?.depositAmount ?? 0,
        availableMoveInDate: parsed.desiredMoveInDate ? toIsoDate(parsed.desiredMoveInDate) : now,
        applicationFee: 0,
        requiredFields: DEFAULT_INVITE_REQUIRED_FIELDS,
        allowCoApplicants: true,
        allowPets: true,
        status: "PUBLISHED" as const,
        publishedAt: now,
        createdAt: now,
        updatedAt: now
      };
      return { ...store, rentalApplications: [...store.rentalApplications, application] };
    });
  } catch (error) {
    redirect(failurePath(error instanceof Error ? error.message : "Could not prepare the application invite."));
  }

  if (!inviteContext) {
    redirect(failurePath("Could not prepare the application invite."));
  }
  const context = inviteContext;

  const rawToken = generateInviteToken();
  const now = nowIso();
  const invite: ApplicationInvite = {
    id: createId("appinv"),
    organizationId: user.organizationId,
    managerUserId: user.id,
    applicationId: context.applicationId,
    propertyId: parsed.propertyId,
    unitId: parsed.unitId || undefined,
    applicantFirstName: parsed.firstName,
    applicantLastName: parsed.lastName,
    applicantEmail: normalizeEmail(parsed.email),
    applicantPhone: parsed.phone,
    desiredMoveInDate: parsed.desiredMoveInDate ? toIsoDate(parsed.desiredMoveInDate) : undefined,
    requestBackgroundCheck: parsed.requestBackgroundCheck,
    requestIncomeVerification: parsed.requestIncomeVerification,
    note: parsed.note,
    tokenHash: hashInviteToken(rawToken),
    status: "SENT",
    expiresAt: new Date(Date.now() + APPLICATION_INVITE_TTL_MS).toISOString(),
    sentAt: now,
    createdAt: now,
    updatedAt: now
  };

  try {
    const delivery = await sendApplicationInviteEmail({
      to: invite.applicantEmail,
      applicantName: parsed.firstName,
      managerName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      organizationName: context.organizationName,
      propertyLabel: context.propertyLabel,
      inviteUrl: buildAppUrl(`/apply/invite/${encodeURIComponent(rawToken)}`),
      requestBackgroundCheck: parsed.requestBackgroundCheck,
      requestIncomeVerification: parsed.requestIncomeVerification,
      desiredMoveInDate: invite.desiredMoveInDate ? formatDate(invite.desiredMoveInDate) : undefined,
      note: parsed.note,
      expiresAt: formatDate(invite.expiresAt),
      organizationId: user.organizationId,
      userId: user.id,
      relatedId: invite.id
    });
    if (!delivery.sent) {
      throw new Error(delivery.error || "Cloudflare did not accept the application invite email.");
    }
  } catch (error) {
    redirect(failurePath(error instanceof Error ? error.message : "The application invite email could not be delivered."));
  }

  await updateStore((store) => ({
    ...store,
    applicationInvites: [...store.applicationInvites, invite]
  }));

  revalidatePath("/applications");
  redirect(`/applications?invited=${encodeURIComponent(invite.applicantEmail)}`);
}

export async function submitRentalApplicationAction(formData: FormData) {
  const publicSlug = getString(formData, "publicSlug");
  const inviteToken = getOptionalString(formData, "inviteToken");

  // This action is reachable without authentication; cap repeat submissions
  // per applicant per listing so the public form cannot be used for spam.
  const applicantKey = normalizeEmail(getString(formData, "email")) || "anonymous";
  const rateLimit = checkRateLimit({
    key: `apply:${publicSlug}:${applicantKey}`,
    limit: 5,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    const message = "Too many submission attempts. Wait a few minutes and try again.";
    redirect(
      inviteToken
        ? `/apply/invite/${encodeURIComponent(inviteToken)}?error=${encodeURIComponent(message)}`
        : `/apply/${encodeURIComponent(publicSlug)}?error=${encodeURIComponent(message)}`
    );
  }

  let redirectSlug = publicSlug;
  let submittedId = "";
  let inviteScreening: { background: boolean; income: boolean } | null = null;
  let submissionEmailContext: {
    applicantName: string;
    applicantEmail: string;
    applicationId: string;
    applicationTitle: string;
    propertyLabel: string;
    organizationId: string;
    managerUserId: string;
    managerName: string;
    managerEmail: string;
  } | null = null;

  try {
    await updateStore((store) => {
      const application = store.rentalApplications.find((item) => item.publicSlug === publicSlug && item.status === "PUBLISHED");
      if (!application) throw new Error("This application is no longer accepting submissions.");

      const invite = inviteToken
        ? store.applicationInvites.find((item) => item.tokenHash === hashInviteToken(inviteToken)) ?? null
        : null;
      if (inviteToken && (!invite || invite.applicationId !== application.id)) {
        throw new Error("This invitation link is no longer valid.");
      }
      if (invite?.status === "REVOKED") throw new Error("This invitation was withdrawn by the property manager.");
      if (invite?.status === "SUBMITTED") throw new Error("An application was already submitted for this invitation.");
      if (invite && new Date(invite.expiresAt).getTime() < Date.now()) {
        throw new Error("This invitation has expired. Ask the property manager to send a new one.");
      }

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
        inviteToken,
        backgroundCheckConsent: getBoolean(formData, "backgroundCheckConsent"),
        incomeVerificationConsent: getBoolean(formData, "incomeVerificationConsent"),
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
      if (invite?.requestBackgroundCheck && !parsed.backgroundCheckConsent) {
        throw new Error("Background check consent is required before submitting this application.");
      }
      if (invite?.requestIncomeVerification && !parsed.incomeVerificationConsent) {
        throw new Error("Bank and income verification consent is required before submitting this application.");
      }
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
        inviteId: invite?.id,
        backgroundCheckConsent: invite ? Boolean(parsed.backgroundCheckConsent) : undefined,
        backgroundCheckConsentAt: invite && parsed.backgroundCheckConsent ? now : undefined,
        incomeVerificationConsent: invite ? Boolean(parsed.incomeVerificationConsent) : undefined,
        incomeVerificationConsentAt: invite && parsed.incomeVerificationConsent ? now : undefined,
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
      inviteScreening = invite ? { background: invite.requestBackgroundCheck, income: invite.requestIncomeVerification } : null;

      const manager = store.users.find((item) => item.id === application.managerUserId);
      submissionEmailContext = {
        applicantName: primaryApplicant.firstName,
        applicantEmail: primaryApplicant.email,
        applicationId: application.id,
        applicationTitle: application.title,
        propertyLabel: getApplicationAddressLabel(store, application),
        organizationId: application.organizationId,
        managerUserId: application.managerUserId,
        managerName: manager?.firstName ?? "there",
        managerEmail: manager?.email ?? ""
      };

      return {
        ...store,
        applicationInvites: invite
          ? store.applicationInvites.map((item) =>
              item.id === invite.id
                ? { ...item, status: "SUBMITTED" as const, submittedAt: now, submissionId, updatedAt: now }
                : item
            )
          : store.applicationInvites,
        applicationStatusHistory: [
          ...store.applicationStatusHistory,
          {
            id: createId("apphist"),
            applicationId: application.id,
            submissionId,
            toStatus: "SUBMITTED" as const,
            createdAt: now
          }
        ],
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
    redirect(
      inviteToken
        ? `/apply/invite/${encodeURIComponent(inviteToken)}?error=${encodeURIComponent(message)}`
        : `/apply/${encodeURIComponent(redirectSlug)}?error=${encodeURIComponent(message)}`
    );
  }

  if (submittedId && submissionEmailContext) {
    const context = submissionEmailContext;
    const deliveries = await Promise.allSettled([
      sendApplicationSubmittedEmail({
        to: context.applicantEmail,
        applicantName: context.applicantName,
        applicationTitle: context.applicationTitle,
        propertyLabel: context.propertyLabel,
        organizationId: context.organizationId,
        relatedId: submittedId
      }),
      context.managerEmail
        ? sendApplicationReceivedEmail({
            to: context.managerEmail,
            managerName: context.managerName,
            applicantName: context.applicantName,
            applicationTitle: context.applicationTitle,
            propertyLabel: context.propertyLabel,
            reviewUrl: buildAppUrl(`/applications/${context.applicationId}/submissions/${submittedId}`),
            organizationId: context.organizationId,
            userId: context.managerUserId,
            relatedId: submittedId
          })
        : Promise.resolve(null)
    ]);
    for (const delivery of deliveries) {
      if (delivery.status === "rejected") {
        console.warn("[applications] Application lifecycle email failed.", {
          submissionId: submittedId,
          error: delivery.reason instanceof Error ? delivery.reason.message : String(delivery.reason)
        });
      }
    }
  }

  revalidatePath("/applications");
  if (submittedId) {
    let screeningAccessPath = "";
    try {
      const access = await ensureApplicantPortalAccess(submittedId);
      screeningAccessPath = access.path;
      if (inviteScreening?.background) {
        try {
          await startCheckrScreening(access.application);
        } catch (error) {
          console.warn("[screening] Requested background check could not be auto-started.", {
            submissionId: submittedId,
            error: error instanceof Error ? error.message : "Unknown Checkr error"
          });
        }
      }
      if (inviteScreening?.income) {
        try {
          await startPlaidScreening(access.application, false);
        } catch (error) {
          console.warn("[screening] Requested bank verification could not be auto-started.", {
            submissionId: submittedId,
            error: error instanceof Error ? error.message : "Unknown Plaid error"
          });
        }
      }
    } catch (error) {
      console.warn("[screening] Application was submitted, but the screening portal could not be provisioned.", {
        submissionId: submittedId,
        error: error instanceof Error ? error.message : "Unknown screening portal error"
      });
    }
    if (screeningAccessPath) redirect(screeningAccessPath);
  }
  redirect(
    inviteToken
      ? `/apply/invite/${encodeURIComponent(inviteToken)}?submitted=1`
      : `/apply/${encodeURIComponent(redirectSlug)}?submitted=1`
  );
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

  let decisionEmailContext: {
    to: string;
    applicantName: string;
    applicationTitle: string;
    propertyLabel: string;
    decision: "APPROVED" | "REJECTED";
    organizationId: string;
    relatedId: string;
  } | null = null;

  await updateStore((store) => {
    const bundle = getSubmissionBundle(store, submissionId);
    if (!bundle || bundle.application.id !== applicationId || !managerOwnsApplication(store, user, bundle.application)) {
      throw new Error("Application submission not found.");
    }
    const now = nowIso();
    const fromStatus = bundle.submission.status;
    const applicant = primaryApplicant(bundle.applicants);
    if ((status === "APPROVED" || status === "REJECTED") && status !== fromStatus && applicant) {
      decisionEmailContext = {
        to: applicant.email,
        applicantName: applicant.firstName,
        applicationTitle: bundle.application.title,
        propertyLabel: getApplicationAddressLabel(store, bundle.application),
        decision: status,
        organizationId: bundle.application.organizationId,
        relatedId: submissionId
      };
    }
    return {
      ...store,
      applicationSubmissions: store.applicationSubmissions.map((submission) =>
        submission.id === submissionId ? { ...submission, status: status as any, updatedAt: now } : submission
      ),
      applicationStatusHistory: [
        ...store.applicationStatusHistory,
        {
          id: createId("apphist"),
          applicationId,
          submissionId,
          fromStatus,
          toStatus: status as RentalApplicationStatus,
          changedByUserId: user.id,
          note,
          createdAt: now
        }
      ],
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

  if (decisionEmailContext) {
    try {
      await sendApplicationDecisionEmail(decisionEmailContext);
    } catch (error) {
      console.warn("[applications] Application decision email failed.", {
        submissionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

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
  const tenantIdPath = getOptionalString(formData, "tenantIdPath");
  if (tenantIdPath && !isAllowedTenantIdAssetPath(tenantIdPath, user)) {
    redirect(`/move-ins/new?error=${encodeURIComponent("Tenant ID must be a PDF, JPG, or PNG uploaded by your account.")}`);
  }
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
    documentName: getOptionalString(formData, "documentName"),
    tenantIdPath,
    tenantIdName: getOptionalString(formData, "tenantIdName"),
    tenantIdOriginalName: getOptionalString(formData, "tenantIdOriginalName"),
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
      const newFiles = [];
      if (
        parsed.documentPath &&
        !store.uploadedFiles.some((file) => file.leaseId === leaseId && file.path === parsed.documentPath)
      ) {
        const displayName = cleanDisplayName(parsed.documentName, "Lease agreement");
        newFiles.push({
          id: createId("file"),
          organizationId: user.organizationId,
          propertyId: property.id,
          unitId: unit.id,
          leaseId,
          tenantId,
          kind: FileKind.LEASE_DOCUMENT,
          label: displayName,
          displayName,
          path: parsed.documentPath,
          mimeType: "application/octet-stream",
          visibility: "TENANT" as const,
          uploadedById: user.id,
          uploadedAt: now,
          createdAt: now
        });
      }
      if (parsed.tenantIdPath) {
        const displayName = cleanDisplayName(parsed.tenantIdName, "Tenant ID");
        newFiles.push({
          id: createId("file"),
          organizationId: user.organizationId,
          propertyId: property.id,
          unitId: unit.id,
          leaseId,
          tenantId,
          kind: FileKind.TENANT_ID,
          label: displayName,
          displayName,
          originalFileName: parsed.tenantIdOriginalName,
          path: parsed.tenantIdPath,
          mimeType: "application/octet-stream",
          visibility: "MANAGER_ONLY" as const,
          uploadedById: user.id,
          uploadedAt: now,
          createdAt: now
        });
      }

      return {
        ...store,
        tenants: existingTenant ? store.tenants.map((item) => (item.id === tenantId ? tenant : item)) : [...store.tenants, tenant],
        leases,
        payments: [...store.payments, ...payments],
        notifications: [...store.notifications, ...notifications],
        uploadedFiles: [...store.uploadedFiles, ...newFiles],
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
  const tenantIdPath = getOptionalString(formData, "tenantIdPath");
  if (tenantIdPath && !isAllowedTenantIdAssetPath(tenantIdPath, user)) {
    redirect("/leases?error=invalid-upload");
  }
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
    lateFeePolicy: resolveLateFeePolicy(formData),
    notes: getOptionalString(formData, "notes"),
    documentPath,
    documentName: getOptionalString(formData, "documentName"),
    tenantIdPath,
    tenantIdName: getOptionalString(formData, "tenantIdName"),
    tenantIdOriginalName: getOptionalString(formData, "tenantIdOriginalName"),
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

  const lease = await db.lease.create({
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

  const uploadedAt = nowIso();
  if (parsed.documentPath) {
    const displayName = cleanDisplayName(parsed.documentName, "Lease agreement");
    await db.uploadedFile.create({
      data: {
        organizationId: user.organizationId,
        propertyId: property?.id,
        unitId: parsed.unitId,
        leaseId: lease.id,
        tenantId: parsed.tenantId,
        kind: FileKind.LEASE_DOCUMENT,
        label: displayName,
        displayName,
        path: parsed.documentPath,
        mimeType: "application/octet-stream",
        visibility: "TENANT",
        uploadedById: user.id,
        uploadedAt
      }
    });
  }
  if (parsed.tenantIdPath) {
    const displayName = cleanDisplayName(parsed.tenantIdName, "Tenant ID");
    await db.uploadedFile.create({
      data: {
        organizationId: user.organizationId,
        propertyId: property?.id,
        unitId: parsed.unitId,
        leaseId: lease.id,
        tenantId: parsed.tenantId,
        kind: FileKind.TENANT_ID,
        label: displayName,
        displayName,
        originalFileName: parsed.tenantIdOriginalName,
        path: parsed.tenantIdPath,
        mimeType: "application/octet-stream",
        visibility: "MANAGER_ONLY",
        uploadedById: user.id,
        uploadedAt
      }
    });
  }

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
    lateFeePolicy: resolveLateFeePolicy(formData),
    notes: getOptionalString(formData, "notes"),
    documentPath: newDocumentPath ?? existingDocumentPath,
    documentName: getOptionalString(formData, "documentName"),
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

    const documentFiles =
      newDocumentPath && !store.uploadedFiles.some((file) => file.leaseId === leaseId && file.path === newDocumentPath)
        ? [{
            id: createId("file"),
            organizationId: user.organizationId,
            propertyId: updatedProperty?.id,
            unitId: parsed.unitId,
            leaseId,
            tenantId: parsed.tenantId,
            kind: FileKind.LEASE_DOCUMENT,
            label: cleanDisplayName(parsed.documentName, "Lease agreement"),
            displayName: cleanDisplayName(parsed.documentName, "Lease agreement"),
            path: newDocumentPath,
            mimeType: "application/octet-stream",
            visibility: "TENANT" as const,
            uploadedById: user.id,
            uploadedAt: updatedAt,
            createdAt: updatedAt
          }]
        : [];

    return {
      ...store,
      leases,
      uploadedFiles: [...store.uploadedFiles, ...documentFiles],
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
      uploadedFiles: store.uploadedFiles.filter((file) => file.leaseId !== leaseId),
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
  const paymentResult = paymentSchema.safeParse({
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
  if (!paymentResult.success) {
    redirect("/transactions?error=invalid-payment");
  }
  const parsed = paymentResult.data;

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
  const paymentEditResult = paymentEditSchema.safeParse({
    paymentId: getString(formData, "paymentId"),
    amount: getString(formData, "amount"),
    returnTo
  });
  if (!paymentEditResult.success) {
    redirect(returnTo);
  }
  const parsed = paymentEditResult.data;
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
  const expenseResult = expenseSchema.safeParse({
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
  if (!expenseResult.success) {
    redirect("/expenses?error=invalid-expense");
  }
  const parsed = expenseResult.data;

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
  const requestedEmail = normalizeEmail(getString(formData, "email"));
  if (
    isRetiredAccountEmail(requestedEmail) ||
    (isSystemAdminEmail(requestedEmail) && !isSystemAdminEmail(user.email))
  ) {
    redirect("/settings?profile=invalid-profile#my-profile");
  }

  let updatedUser = user;
  try {
    await updateStore((store) => {
      const result = applyOwnProfileUpdate(
        store.users,
        user.id,
        {
          firstName: getString(formData, "firstName"),
          lastName: getString(formData, "lastName"),
          email: requestedEmail,
          phone: getOptionalString(formData, "phone"),
          title: getOptionalString(formData, "title"),
          birthDate: getString(formData, "birthDate")
        },
        new Date()
      );
      updatedUser = result.updatedUser as typeof user;
      return { ...store, users: result.users };
    });
  } catch (error) {
    if (error instanceof ProfileUpdateError) {
      redirect(`/settings?profile=${error.code}#my-profile`);
    }
    throw error;
  }

  await createSession({
    sub: updatedUser.id,
    organizationId: updatedUser.organizationId,
    role: updatedUser.role,
    email: updatedUser.email,
    sessionVersion: updatedUser.sessionVersion ?? 0
  });
  revalidatePath("/settings");
  redirect("/settings?profile=updated#my-profile");
}

export async function createStripeCheckoutAction(formData: FormData) {
  const user = await requireRoles([UserRole.TENANT]);
  await ensurePaymentTermsAccepted(user, formData, "/transactions?stripe=payment-terms-required");
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
  const applicationFeeAmountCents = getPlatformFeeCents();

  if (!manager) {
    redirect(`/transactions?stripe=manager-missing&payment=${encodeURIComponent(payment.id)}`);
  }
  if (!getStripeAccountId(manager)) {
    redirect(`/transactions?stripe=manager-setup-required&payment=${encodeURIComponent(payment.id)}`);
  }

  // Payout safety: the destination account is retrieved fresh from Stripe and
  // its metadata must map to this manager and organization. Mismatched or
  // unverifiable ownership fails closed so rent can never route to a connected
  // account that belongs to a different Nexus user or organization.
  const destinationCheck = await verifyManagerPayoutDestination(manager);
  if (!destinationCheck.ok) {
    if (destinationCheck.blocked) {
      await recordPlatformEvent({
        type: "STRIPE_CHECKOUT_BLOCKED",
        category: "checkout_single",
        status: "blocked",
        organizationId: user.organizationId,
        userId: user.id,
        relatedId: payment.id,
        message: "Checkout blocked: manager Stripe payout account ownership mismatch.",
        metadata: {
          paymentId: payment.id,
          managerUserId: manager.id,
          accountId: getStripeAccountId(manager) ?? null,
          reason: destinationCheck.reason
        }
      });
      redirect(`/transactions?stripe=manager-account-mismatch&payment=${encodeURIComponent(payment.id)}`);
    }
    console.error("[stripe] Manager Connect account unavailable before checkout", {
      managerUserId: manager.id,
      reason: destinationCheck.reason
    });
    redirect(`/transactions?stripe=manager-setup-required&payment=${encodeURIComponent(payment.id)}`);
  }
  connectedManager = destinationCheck.user;

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

  // Tenant is charged rent + platform fee. Landlord receives the full rent amount.
  // application_fee_amount is collected by Nexus; transfer_data.destination receives (total - fee) = rent.
  const totalAmountCents = amountCents + applicationFeeAmountCents;

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
    amountCents: String(totalAmountCents)
  };

  let sessionUrl: string | null = null;
  const paymentIntentData: any = {
    metadata,
    application_fee_amount: applicationFeeAmountCents,
    transfer_data: { destination: stripeDestinationAccountId }
  };

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
            unit_amount: totalAmountCents,
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

export async function createBundledStripeCheckoutAction(formData: FormData) {
  const user = await requireRoles([UserRole.TENANT]);
  await ensurePaymentTermsAccepted(user, formData, "/transactions?stripe=payment-terms-required");
  const portal = await getPortalContext(user);

  const paymentIds = formData.getAll("paymentId").map(String).filter(Boolean);
  if (!paymentIds.length) {
    redirect("/transactions?stripe=invalid-payment");
  }

  if (!portal.currentTenant?.id) {
    redirect("/transactions?stripe=invalid-payment");
  }

  const selectedPayments = paymentIds
    .map((id) => portal.scope.payments.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  if (selectedPayments.length !== paymentIds.length) {
    redirect("/transactions?stripe=invalid-payment");
  }

  if (selectedPayments.some((p) => p.status === "PAID")) {
    redirect("/transactions?stripe=already-paid");
  }

  if (selectedPayments.some((p) => p.tenantId && p.tenantId !== portal.currentTenant!.id)) {
    redirect("/transactions?stripe=invalid-payment");
  }

  const firstPayment = selectedPayments[0];
  const lease =
    firstPayment.leaseId
      ? portal.scope.leases.find((l) => l.id === firstPayment.leaseId)
      : portal.currentLease?.unitId === firstPayment.unitId
        ? portal.currentLease
        : portal.scope.leases.find((l) =>
            l.unitId === firstPayment.unitId && ["ACTIVE", "UPCOMING", "active", "invited"].includes(l.status)
          );

  const manager = getLeaseManager(portal, lease, firstPayment);
  if (!manager) {
    redirect(`/transactions?stripe=manager-missing`);
  }
  if (!getStripeAccountId(manager)) {
    redirect(`/transactions?stripe=manager-setup-required`);
  }

  // Every payment in the bundle must pay out to the same manager. Otherwise the
  // single transfer destination would route another manager's rent to this one.
  const hasMismatchedDestination = selectedPayments.some((p) => {
    const pLease =
      p.leaseId
        ? portal.scope.leases.find((l) => l.id === p.leaseId)
        : portal.scope.leases.find((l) =>
            l.unitId === p.unitId && ["ACTIVE", "UPCOMING", "active", "invited"].includes(l.status)
          );
    const pManager = getLeaseManager(portal, pLease, p);
    return !pManager || pManager.id !== manager.id;
  });
  if (hasMismatchedDestination) {
    redirect("/transactions?stripe=invalid-payment");
  }

  let connectedManager = manager;
  // Payout safety: same fail-closed ownership verification as the single
  // payment checkout — the bundled transfer destination must belong to this
  // manager and organization.
  const destinationCheck = await verifyManagerPayoutDestination(manager);
  if (!destinationCheck.ok) {
    if (destinationCheck.blocked) {
      await recordPlatformEvent({
        type: "STRIPE_CHECKOUT_BLOCKED",
        category: "checkout_bundled",
        status: "blocked",
        organizationId: user.organizationId,
        userId: user.id,
        relatedId: firstPayment.id,
        message: "Bundled checkout blocked: manager Stripe payout account ownership mismatch.",
        metadata: {
          paymentIds: paymentIds.join(","),
          managerUserId: manager.id,
          accountId: getStripeAccountId(manager) ?? null,
          reason: destinationCheck.reason
        }
      });
      redirect(`/transactions?stripe=manager-account-mismatch`);
    }
    redirect(`/transactions?stripe=manager-setup-required`);
  }
  connectedManager = destinationCheck.user;

  const connectedAccountId = getStripeAccountId(connectedManager);
  if (!isStripeConnectReady(connectedManager) || !connectedAccountId) {
    redirect(`/transactions?stripe=manager-setup-required`);
  }

  const applicationFeeAmountCents = getPlatformFeeCents();
  const totalRentCents = selectedPayments.reduce(
    (sum, p) => sum + Math.round((p.balanceDue || p.amount) * 100),
    0
  );

  if (totalRentCents <= 0) {
    redirect("/transactions?stripe=invalid-amount");
  }
  if (applicationFeeAmountCents > 0 && totalRentCents <= applicationFeeAmountCents) {
    redirect("/transactions?stripe=amount-below-platform-fee");
  }

  const totalAmountCents = totalRentCents + applicationFeeAmountCents;
  const appUrl = getAppBaseUrl();
  const paymentIdsStr = paymentIds.join(",");

  const metadata = {
    source: "nexus_bundled_payment",
    organizationId: user.organizationId,
    paymentId: firstPayment.id,
    paymentIds: paymentIdsStr,
    userId: user.id,
    tenantId: portal.currentTenant.id,
    managerUserId: connectedManager?.id ?? "",
    stripeDestinationAccountId: connectedAccountId,
    applicationFeeAmountCents: String(applicationFeeAmountCents),
    leaseId: lease?.id ?? "",
    unitId: firstPayment.unitId,
    amountCents: String(totalAmountCents)
  };

  const lineItems = selectedPayments.map((p) => ({
    quantity: 1 as const,
    price_data: {
      currency: "usd" as const,
      unit_amount: Math.round((p.balanceDue || p.amount) * 100),
      product_data: { name: p.description || "Rent payment" }
    }
  }));

  lineItems.push({
    quantity: 1 as const,
    price_data: {
      currency: "usd" as const,
      unit_amount: applicationFeeAmountCents,
      product_data: { name: "Nexus platform fee" }
    }
  });

  let sessionUrl: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: firstPayment.id,
      line_items: lineItems,
      metadata,
      payment_intent_data: {
        metadata,
        application_fee_amount: applicationFeeAmountCents,
        transfer_data: { destination: connectedAccountId }
      },
      success_url: `${appUrl}/transactions?stripe=success`,
      cancel_url: `${appUrl}/transactions?stripe=cancelled`
    });

    sessionUrl = session.url;

    await updateStore((store) => ({
      ...store,
      payments: store.payments.map((p) =>
        paymentIds.includes(p.id)
          ? {
              ...p,
              leaseId: p.leaseId ?? lease?.id,
              tenantId: p.tenantId ?? portal.currentTenant!.id,
              stripeCheckoutSessionId: session.id,
              stripeDestinationAccountId: connectedAccountId,
              stripeApplicationFeeAmountCents: applicationFeeAmountCents,
              updatedAt: nowIso()
            }
          : p
      )
    }));
  } catch (error) {
    console.error("[stripe] Failed to create bundled checkout session", error);
    redirect("/transactions?stripe=checkout-error");
  }

  if (!sessionUrl) {
    redirect("/transactions?stripe=missing-session-url");
  }

  redirect(sessionUrl);
}

export async function addUnitAssetAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const unitId = getString(formData, "unitId");
  const path = requireOptionalSubmittedAssetPath(getString(formData, "path"), user, "/properties");

  if (!path) {
    redirect("/properties");
  }

  await updateStore((store) => {
    const unit = store.units.find((item) => item.id === unitId);
    const property = store.properties.find(
      (item) =>
        item.id === unit?.propertyId &&
        item.organizationId === user.organizationId &&
        (user.role === UserRole.ADMIN || item.managerId === user.id)
    );
    if (!unit || !property) throw new Error("Unit not found.");
    const existingCount = store.uploadedFiles.filter(
      (file) => file.unitId === unitId && file.kind === FileKind.UNIT_IMAGE
    ).length;
    if (existingCount >= UNIT_PHOTO_LIMIT) throw new Error("Unit photo limit reached.");
    const uploadedAt = nowIso();
    const displayName = defaultPhotoName("unit", existingCount + 1);
    return {
      ...store,
      uploadedFiles: [
        ...store.uploadedFiles,
        {
          id: createId("file"),
          organizationId: user.organizationId,
          propertyId: property.id,
          unitId,
          path,
          kind: FileKind.UNIT_IMAGE,
          mimeType: "image/*",
          label: displayName,
          displayName,
          visibility: "ORGANIZATION",
          uploadedById: user.id,
          uploadedAt,
          createdAt: uploadedAt
        }
      ]
    };
  });

  revalidatePath(`/units/${unitId}`);
  revalidatePath("/documents");
}

export async function createDamageAssessmentAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const imagePaths = requireSubmittedAssetPaths(formData, "imagePaths", user, "/ai-assessments?error=invalid-upload", 12);
  const baselinePaths = requireSubmittedAssetPaths(formData, "baselinePaths", user, "/ai-assessments?error=invalid-upload", 12);
  const assessmentResult = damageAssessmentSchema.safeParse({
    unitId: getString(formData, "unitId"),
    leaseId: getOptionalString(formData, "leaseId"),
    inspectionDate: getString(formData, "inspectionDate"),
    notes: getOptionalString(formData, "notes"),
    imagePaths,
    baselinePaths
  });
  if (!assessmentResult.success) {
    redirect("/ai-assessments?error=invalid-assessment");
  }
  const parsed = assessmentResult.data;

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
